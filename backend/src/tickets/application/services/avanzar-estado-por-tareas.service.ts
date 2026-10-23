import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { TicketAsignadoEvent } from '../../domain/events/ticket-asignado.event';
import { TicketEstadoCambiadoEvent } from '../../domain/events/ticket-estado-cambiado.event';
import { TicketTransicionadoEvent } from '../../domain/events/ticket-transicionado.event';
import { EventoTarea, planEstadoPorTareas } from '../../domain/policies/estado-por-tareas.policy';
import { esEstadoNotificable } from '../../domain/policies/estados-notificables.policy';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { IRelojSlaMarcador } from '../../domain/ports/i-reloj-sla-marcador';
import { ITareaTicketRepository } from '../../domain/ports/i-tarea-ticket.repository';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { afectaRelojSla } from '../../domain/state-machine/estados.constants';
import { TicketStateMachineFactory } from '../../domain/state-machine/ticket-state-machine.factory';
import { ElegibilidadAsignado } from './elegibilidad-asignado';

/** Estados que fijan `fecha_cierre` al alcanzarse; el mismo conjunto que `TransicionarEstadoUseCase`. */
const ESTADOS_QUE_CIERRAN: ReadonlySet<string> = new Set(['RESUELTO', 'CERRADO']);

/**
 * AvanzarEstadoPorTareasService — aplica, DENTRO de la transacción de completar o descompletar una
 * tarea, el plan de `planEstadoPorTareas` (odd/estado-por-tareas, S2-S5).
 *
 * Se llama después de escribir la tarea y su historial, con la fila del ticket ya bloqueada
 * (`ITicketRepository.bloquear`, S6). Relee el ticket y sus tareas acá, no antes del lock: lo que
 * el caso de uso cargó para autorizar puede ser anterior a la escritura de otro actor.
 *
 * Hace lo mismo que las transiciones manuales, arco por arco: la asignación (operación ASIGNACION y
 * `ticket.asignado`, como `AsignarYPonerEnProcesoUseCase`), `updateEstado`, `fecha_cierre` (no nula si
 * y solo si el estado cierra), operación CAMBIO_ESTADO, el reloj de SLA cuando el arco lo afecta y
 * los eventos post-commit (`ticket.transicionado`, `ticket.estado-cambiado` si el destino es
 * notificable). El autor de todo es quien completó o descompletó.
 *
 * La asignación a quien completa (NUEVO sin responsable, S2) exige que sea agente del tipo
 * (`ElegibilidadAsignado.esAgenteDeTipo`), la misma regla que la asignación manual. Un ADMINISTRADOR
 * o ROOT completa cualquier tarea, pero no recibe tickets: el ticket sigue sin responsable, sin
 * operación ASIGNACION ni `ticket.asignado`, y los arcos se aplican igual, porque ninguno exige
 * responsable (decisión del dueño del 2026-10-23). Esa consulta (a master, si el autor tiene
 * `LECTURA` sobre el tipo) corre con la fila bloqueada y solo en NUEVO sin responsable: el plan se
 * conoce recién al releer el ticket.
 *
 * Un arco normal que la máquina del tipo no permita corta el recorrido sin error: la tarea queda
 * escrita y el ticket, donde llegó. No es el caso del grafo base, que tiene todos los arcos del
 * plan; la guarda existe para no mutar un ticket por fuera de su máquina. El arco correctivo
 * (RESUELTO → EN_PROCESO al descompletar, S4) se aplica como el salto de ROOT/ADMINISTRADOR, sin
 * consultar el grafo.
 */
export class AvanzarEstadoPorTareasService {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'save'>,
    private readonly tareaRepo: Pick<ITareaTicketRepository, 'listarPorTicket'>,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'save'>,
    private readonly estadoRepo: Pick<IEstadoRepository, 'findById' | 'findByCodigo'>,
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findById'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly stateMachineFactory: Pick<TicketStateMachineFactory, 'resolve'>,
    private readonly relojMarcador: IRelojSlaMarcador,
    private readonly eventPublisher: IDomainEventPublisher,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'alCommitear'>,
    private readonly elegibilidad: Pick<ElegibilidadAsignado, 'esAgenteDeTipo'>,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  /**
   * Aplica el plan al ticket. Devuelve el ticket releído (mutado si hubo cambios) o `null` si ya no
   * existe o está dado de baja, en cuyo caso no hace nada.
   *
   * @param evento Qué pasó con la tarea, ya escrita en esta transacción.
   * @param ticketId Ticket de la tarea.
   * @param autorId Quien completó o descompletó: autor de las operaciones y responsable si corresponde.
   * @param clienteId Cliente activo, para decidir si el autor es agente del tipo.
   */
  async aplicar(
    evento: EventoTarea,
    ticketId: string,
    autorId: string,
    clienteId: string,
  ): Promise<TicketEntity | null> {
    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket || ticket.isDeleted()) return null;

    const estadoActual = await this.estadoRepo.findById(ticket.estadoId);
    if (!estadoActual) {
      throw new Error(
        `Catálogo de estados inconsistente: no existe el estado con id "${ticket.estadoId}" en el tenant activo.`,
      );
    }

    const tareas = await this.tareaRepo.listarPorTicket(ticket.id);
    const plan = planEstadoPorTareas(evento, {
      estadoActual: estadoActual.codigo,
      quedanPendientes: tareas.some((t) => !t.isDeleted() && !t.completada),
      tieneResponsable: ticket.asignadoId !== null,
    });
    if (!plan.asignarAlActor && plan.arcos.length === 0) return ticket;

    const tipoTicket = await this.tipoTicketRepo.findById(ticket.tipoId);
    if (!tipoTicket) {
      throw new Error(
        `Catálogo de tipos de ticket inconsistente: no existe el tipo con id "${ticket.tipoId}" en el tenant activo.`,
      );
    }
    const maquina = this.stateMachineFactory.resolve(tipoTicket.codigo);

    if (
      plan.asignarAlActor &&
      (await this.elegibilidad.esAgenteDeTipo(autorId, clienteId, ticket.tipoId))
    ) {
      ticket.assignTo(autorId);
      await this.operacionRepo.save(
        OperacionTicketEntity.create({
          ticketId: ticket.id,
          tipoOperacionId: await this.resolverTipoOperacion('ASIGNACION'),
          descripcion: null,
          estadoAnteriorId: null,
          estadoNuevoId: null,
          autorId,
          esInterno: false,
          metadata: null,
        }),
      );
      this.txRunner.alCommitear(() =>
        this.eventPublisher.publish(
          new TicketAsignadoEvent({
            ticketId: ticket.id,
            asignadoId: autorId,
            origen: 'MANUAL',
            autorId,
          }),
        ),
      );
    }

    // Se resuelven y validan todos los arcos antes de mutar: el ticket se guarda una sola vez.
    const pasos: Array<{
      anteriorCodigo: string;
      anteriorId: string;
      destino: { id: string; codigo: string };
    }> = [];
    let desdeCodigo = estadoActual.codigo;
    let desdeId = ticket.estadoId;
    for (const arco of plan.arcos) {
      const destino = await this.estadoRepo.findByCodigo(arco.hacia);
      if (!destino) {
        throw new Error(
          `Catálogo de estados inconsistente: no existe el estado con código "${arco.hacia}" en el tenant activo.`,
        );
      }
      const permitido =
        arco.correctivo ||
        (ticket.canTransitionTo(desdeCodigo, destino.codigo) &&
          maquina.puedeTransicionar(desdeCodigo, destino.codigo, {}));
      if (!permitido) break;
      pasos.push({ anteriorCodigo: desdeCodigo, anteriorId: desdeId, destino });
      desdeCodigo = destino.codigo;
      desdeId = destino.id;
    }

    const operacionesDeArco: Array<{
      paso: (typeof pasos)[number];
      operacion: OperacionTicketEntity;
    }> = [];
    const tipoCambioEstadoId =
      pasos.length > 0 ? await this.resolverTipoOperacion('CAMBIO_ESTADO') : '';
    for (const paso of pasos) {
      ticket.updateEstado(paso.destino.id);
      ticket.setFechaCierre(ESTADOS_QUE_CIERRAN.has(paso.destino.codigo) ? this.ahora() : null);
      const operacion = OperacionTicketEntity.create({
        ticketId: ticket.id,
        tipoOperacionId: tipoCambioEstadoId,
        descripcion: null,
        estadoAnteriorId: paso.anteriorId,
        estadoNuevoId: paso.destino.id,
        autorId,
        esInterno: false,
        metadata: null,
      });
      await this.operacionRepo.save(operacion);
      operacionesDeArco.push({ paso, operacion });
    }

    await this.ticketRepo.save(ticket);

    // Reloj y eventos después del save (la fila ya está bloqueada), en el orden de los arcos.
    for (const { paso, operacion } of operacionesDeArco) {
      const { anteriorCodigo, destino } = paso;
      if (afectaRelojSla(anteriorCodigo, destino.codigo)) {
        await this.relojMarcador.marcar(ticket.id, operacion.id);
        this.txRunner.alCommitear(() =>
          this.eventPublisher.publish(
            new TicketTransicionadoEvent({
              ticketId: ticket.id,
              estadoAnteriorCodigo: anteriorCodigo,
              estadoNuevoCodigo: destino.codigo,
            }),
          ),
        );
      }
      if (esEstadoNotificable(destino.codigo)) {
        this.txRunner.alCommitear(() =>
          this.eventPublisher.publish(
            new TicketEstadoCambiadoEvent({
              ticketId: ticket.id,
              estadoAnteriorCodigo: anteriorCodigo,
              estadoNuevoCodigo: destino.codigo,
              autorId,
            }),
          ),
        );
      }
    }

    return ticket;
  }

  private async resolverTipoOperacion(codigo: 'ASIGNACION' | 'CAMBIO_ESTADO'): Promise<string> {
    const id = await this.tipoOperacionRepo.findIdByCodigo(codigo);
    if (!id) {
      throw new Error(
        `Catálogo de tipo_operacion inconsistente: no existe "${codigo}" en el tenant activo.`,
      );
    }
    return id;
  }
}
