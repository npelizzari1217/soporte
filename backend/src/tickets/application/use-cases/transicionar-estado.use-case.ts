import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TicketEstadoCambiadoEvent } from '../../domain/events/ticket-estado-cambiado.event';
import { TicketTransicionadoEvent } from '../../domain/events/ticket-transicionado.event';
import { IRelojSlaMarcador } from '../../domain/ports/i-reloj-sla-marcador';
import { esEstadoNotificable } from '../../domain/policies/estados-notificables.policy';
import { TicketStateMachineFactory } from '../../domain/state-machine/ticket-state-machine.factory';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import {
  TicketNoEncontradoError,
  EstadoDestinoInvalidoError,
  TransicionInvalidaError,
} from '../../domain/errors/tickets.errors';
import { AlcanceActorTicket, esTicketAccesiblePara } from '../services/visibilidad-ticket';
import {
  afectaRelojSla,
  ESTADOS_NO_DESTINO_CORRECTIVO,
  ESTADOS_TERMINALES,
} from '../../domain/state-machine/estados.constants';

/**
 * Estados destino que setean `fecha_cierre` al alcanzarse (T12).
 *
 * Ya NO coincide con `estados-notificables.policy`: desde la WU-4 esa política
 * es {RESUELTO, CERRADO, ESPERANDO_CLIENTE} (el mail de espera), mientras que
 * acá solo cierran RESUELTO/CERRADO. Son conceptos distintos de la spec
 * (T12 vs T13) — se mantienen constantes separadas a propósito para no acoplar
 * "cuándo cierra" a "cuándo notifica".
 */
const ESTADOS_QUE_CIERRAN = new Set<string>(['RESUELTO', 'CERRADO']);

/**
 * DTO de entrada de `TransicionarEstadoUseCase`.
 *
 * Deviación del design ("Firmas TS clave"): se omiten `clienteId` y
 * `fechaCierre` del `TransicionarEstadoDto` propuesto — `clienteId` no se
 * usa (no hay validación cross-DB en esta transición, a diferencia de
 * `CrearTicketUseCase`) y `fechaCierre` se calcula siempre server-side
 * (`new Date()`, T12); `FechaCierreRequeridaError` queda reservado para un
 * flujo futuro que sí acepte una fecha explícita del caller.
 */
export interface TransicionarEstadoDto {
  ticketId: string;
  nuevoEstadoCodigo: string;
  autorId: string;
  /**
   * `true` si el actor puede hacer un "salto correctivo": ROOT
   * (`is_global_admin`) o ADMINISTRADOR del cliente. El salto permite mover
   * el ticket a CUALQUIER estado NO terminal salteando el grafo (volver
   * atrás/corregir, incluso reabrir desde un estado terminal). NUNCA lleva a
   * un estado terminal (CERRADO/CANCELADO): para eso están los arcos normales.
   */
  actorEsCorrector: boolean;
  /**
   * Alcance del actor humano (odd/permisos-por-tipo-ticket, S0): si no ve el ticket (módulo del
   * tipo o visibilidad de fila), la transición es 404. `null` SOLO para los flujos de sistema que
   * comparten este caso de uso sin un actor que decida (D3: hoy `ReanudarPorComentarioListener`).
   * Es obligatorio y no opcional para que cada llamador nuevo tenga que elegir de forma explícita.
   */
  alcance: AlcanceActorTicket | null;
}

/**
 * TransicionarEstadoUseCase — transición de estado de un ticket (T9, T10,
 * T11, T12, T13).
 *
 * Flujo:
 * 1. Resuelve el estado DESTINO por código (`nuevoEstadoCodigo`); si no
 *    existe en el catálogo del tenant → `EstadoDestinoInvalidoError` (422).
 *    No depende del ticket, así que va antes de la transacción.
 * 2. **DENTRO de la transacción** (`ITenantTransactionRunner.run`), y en este
 *    orden (odd/escrituras-manuales-con-lock, S1): bloquea la fila del ticket
 *    (`ITicketRepository.bloquear`), recién entonces lo carga —si no existe,
 *    está soft-deleted o el actor no lo ve (`dto.alcance`) →
 *    `TicketNoEncontradoError` (404)— y resuelve el
 *    código del estado ACTUAL (`estadoRepo.findById`, catálogo fijo — su
 *    ausencia es un fallo de infraestructura, `throw` defensivo) y el del
 *    tipo de ticket (`tipoTicketRepo.findById`, para resolver la máquina de
 *    estados por tipo, ADR-3). Cargar después del lock es lo que evita la
 *    actualización perdida: la validación mira el estado que otro actor (una
 *    persona o las tareas, odd/estado-por-tareas) acaba de dejar, no uno leído
 *    antes.
 * 3. Valida la transición en DOS capas: invariantes de la ENTIDAD
 *    (`ticket.canTransitionTo` — soft-delete, estado terminal, T11) Y el
 *    grafo de arcos (`ITicketStateMachine.puedeTransicionar`, T9). Si
 *    cualquiera de las dos rechaza → `TransicionInvalidaError` (422), SIN
 *    mutar ni escribir nada: la transacción cierra sin cambios.
 * 4. Sigue dentro de la transacción (T12/T24): muta el estado, setea
 *    `fecha_cierre` si el destino cierra (T12), crea la operación
 *    `CAMBIO_ESTADO` del timeline, y persiste ambos.
 * 5. **POST-COMMIT** (fuera de la tx): si el destino es notificable
 *    (`estados-notificables.policy`, T13), publica `TicketEstadoCambiadoEvent`.
 *    Un fallo del publisher se atrapa y se swallowea (ADR-6) — la
 *    transición ya committeada NUNCA se revierte por un error de
 *    notificación. El evento no lleva PII (solo IDs/códigos).
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/tickets-core/spec T9, T10, T11, T12, T13. Ref design:
 * ADR-3, ADR-6. Tarea: T7.2, T7.3, T7.4.
 */
export class TransicionarEstadoUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly estadoRepo: IEstadoRepository,
    private readonly tipoTicketRepo: ITipoTicketRepository,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
    private readonly stateMachineFactory: Pick<TicketStateMachineFactory, 'resolve'>,
    private readonly eventPublisher: IDomainEventPublisher,
    private readonly txRunner: ITenantTransactionRunner,
    private readonly relojMarcador: IRelojSlaMarcador,
  ) {}

  async execute(dto: TransicionarEstadoDto): Promise<Result<TicketEntity, DomainError>> {
    const estadoDestino = await this.estadoRepo.findByCodigo(dto.nuevoEstadoCodigo);
    if (!estadoDestino) {
      return Result.fail(new EstadoDestinoInvalidoError(dto.nuevoEstadoCodigo));
    }

    const transicion = await this.txRunner.run(() =>
      this.transicionarBloqueado(dto, estadoDestino),
    );
    if (transicion.isFail()) return Result.fail(transicion.getError());
    const { ticket, estadoAnteriorCodigo } = transicion.getValue();

    // POST-COMMIT (T13): solo si el destino es notificable.
    if (esEstadoNotificable(estadoDestino.codigo)) {
      try {
        this.eventPublisher.publish(
          new TicketEstadoCambiadoEvent({
            ticketId: ticket.id,
            estadoAnteriorCodigo,
            estadoNuevoCodigo: estadoDestino.codigo,
            autorId: dto.autorId,
          }),
        );
      } catch {
        // log-and-swallow (ADR-6): un fallo del publisher NUNCA revierte una
        // transición ya committeada. Defensa adicional a la que ya aplica
        // el adapter concreto (EventEmitter2DomainEventPublisher.publish
        // nunca lanza) — protege también contra implementaciones mockeadas.
      }
    }

    return Result.ok(ticket);
  }

  /**
   * Pasos 2 a 4 del flujo, dentro de la transacción: lock, carga, validación y
   * escritura. Devuelve el ticket mutado y el código del estado que tenía.
   */
  private async transicionarBloqueado(
    dto: TransicionarEstadoDto,
    estadoDestino: EstadoEntity,
  ): Promise<Result<{ ticket: TicketEntity; estadoAnteriorCodigo: string }, DomainError>> {
    await this.ticketRepo.bloquear(dto.ticketId);
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (
      !ticket ||
      ticket.isDeleted() ||
      (dto.alcance !== null &&
        !(await esTicketAccesiblePara(
          { ticketRepo: this.ticketRepo, tipoTicketRepo: this.tipoTicketRepo },
          ticket,
          dto.alcance,
        )))
    ) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }

    // Catálogos FIJOS garantizados por el seed (ADR-1) — su ausencia es un
    // bug de infraestructura, no un error del caller: throw defensivo.
    const estadoActual = await this.estadoRepo.findById(ticket.estadoId);
    if (!estadoActual) {
      throw new Error(
        `Catálogo de estados inconsistente: no existe el estado con id "${ticket.estadoId}" en el tenant activo.`,
      );
    }
    const tipoTicket = await this.tipoTicketRepo.findById(ticket.tipoId);
    if (!tipoTicket) {
      throw new Error(
        `Catálogo de tipos de ticket inconsistente: no existe el tipo con id "${ticket.tipoId}" en el tenant activo.`,
      );
    }

    // Doble validación (T9/T11) del ARCO NORMAL: invariantes de la ENTIDAD
    // (soft-delete, estado terminal — cubre el rechazo de reapertura T7.4) Y
    // el grafo de arcos de la máquina de estados resuelta por tipo (ADR-3).
    const entidadPermite = ticket.canTransitionTo(estadoActual.codigo, estadoDestino.codigo);
    const maquina = this.stateMachineFactory.resolve(tipoTicket.codigo);
    const arcoValido = maquina.puedeTransicionar(estadoActual.codigo, estadoDestino.codigo, {});
    const arcoNormal = entidadPermite && arcoValido;

    // Salto correctivo (ROOT/ADMINISTRADOR): mover el ticket a CUALQUIER
    // estado NO terminal salteando el grafo — incluso reabrir desde un estado
    // terminal (CERRADO/CANCELADO). BYPASSEA `canTransitionTo`/`puedeTransicionar`
    // a propósito. NUNCA lleva a un terminal (para CERRAR/CANCELAR van los
    // arcos normales) NI a ESPERANDO_CLIENTE (solo se entra por el arco desde
    // EN_PROCESO). El ticket soft-deleted YA se rechazó como 404 arriba,
    // así que el salto nunca opera sobre un ticket borrado.
    const saltoCorrectivo =
      dto.actorEsCorrector &&
      !ESTADOS_TERMINALES.has(estadoDestino.codigo) &&
      !ESTADOS_NO_DESTINO_CORRECTIVO.has(estadoDestino.codigo);

    if (!arcoNormal && !saltoCorrectivo) {
      return Result.fail(new TransicionInvalidaError(estadoActual.codigo, estadoDestino.codigo));
    }

    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('CAMBIO_ESTADO');
    if (!tipoOperacionId) {
      throw new Error(
        'Catálogo de tipo_operacion inconsistente: no existe "CAMBIO_ESTADO" en el tenant activo.',
      );
    }

    const estadoAnteriorId = ticket.estadoId;
    const estadoAnteriorCodigo = estadoActual.codigo;

    ticket.updateEstado(estadoDestino.id);
    // Invariante: `fecha_cierre` es no-nula SI Y SOLO SI el estado cierra
    // (RESUELTO/CERRADO). Al alcanzar un estado que cierra la seteamos; al
    // salir de él (salto correctivo que reabre un ticket terminal) la
    // limpiamos — de lo contrario quedaría pegada la fecha del cierre viejo.
    //
    // `new Date()` es el INSTANTE real de cierre — correcto tal cual está.
    // `fecha_cierre` es `timestamptz` (sdd/corregir-fecha-cierre-tickets,
    // D1/D2): ya no se trunca a un `date` en la escritura, así que este
    // punto no necesita `hoyArgentina()` ni ningún otro ajuste de zona
    // horaria. El día argentino se deriva recién en presentación (CSV,
    // dashboard), nunca acá.
    if (ESTADOS_QUE_CIERRAN.has(estadoDestino.codigo)) {
      ticket.setFechaCierre(new Date());
    } else {
      ticket.setFechaCierre(null);
    }

    const operacion = OperacionTicketEntity.create({
      ticketId: ticket.id,
      tipoOperacionId,
      descripcion: null,
      estadoAnteriorId,
      estadoNuevoId: estadoDestino.id,
      autorId: dto.autorId,
      esInterno: false,
      metadata: null,
    });

    await this.ticketRepo.save(ticket);
    await this.operacionRepo.save(operacion);

    // Reloj de SLA (ADR-3): dentro de la tx, DESPUÉS de guardar ticket y operación (el save del
    // ticket ya tomó el lock de la fila), solo si la transición afecta el reloj. El evento sale
    // post-commit: un rollback no deja ni la versión incrementada ni el evento.
    if (afectaRelojSla(estadoAnteriorCodigo, estadoDestino.codigo)) {
      await this.relojMarcador.marcar(ticket.id, operacion.id);
      this.txRunner.alCommitear(() =>
        this.eventPublisher.publish(
          new TicketTransicionadoEvent({
            ticketId: ticket.id,
            estadoAnteriorCodigo,
            estadoNuevoCodigo: estadoDestino.codigo,
          }),
        ),
      );
    }

    return Result.ok({ ticket, estadoAnteriorCodigo });
  }
}
