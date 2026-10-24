import { DomainError, Result } from '../../../shared/domain/result';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TicketComentadoEvent } from '../../domain/events/ticket-comentado.event';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { IPrimeraRespuestaWriteRepository } from '../../domain/ports/i-primera-respuesta-write.repository';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { CalcularSlaHabilVenceService } from '../../../calendario-laboral/domain/services/calcular-sla-habil-vence.service';
import { ICalendarioLaboralSemanalRepository } from '../../../calendario-laboral/domain/ports/i-calendario-laboral-semanal.repository';
import { IFeriadosLaboralesRepository } from '../../../calendario-laboral/domain/ports/i-feriados-laborales.repository';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { esEstadoSoloComentarios } from '../../domain/policies/solo-comentarios.policy';
import { AccionTipoTicket } from '../../domain/permisos-tipo-ticket';
import { AlcanceActorTicket, cargarTicketParaOperar } from '../services/visibilidad-ticket';

/**
 * DTO de entrada de `CrearComentarioUseCase`.
 *
 * Deviación del design ("Firmas TS clave"): se omite `clienteId` del
 * `CrearComentarioDto` propuesto — no hay validación cross-DB al comentar
 * (a diferencia de `CrearTicketUseCase`/`SolicitanteInvalido`), mismo
 * criterio que la deviación ya documentada en `TransicionarEstadoDto` (PR7).
 *
 * El alcance del actor (`AlcanceActorTicket`) lo carga la capa de interface (o lo arma desde la
 * clave de la API pública): lo que el actor no ve, tampoco lo comenta, y comentar exige `COMENTAR`
 * sobre el tipo del ticket, más `OBSERVAR` si es interno (odd/permisos-por-tipo-ticket, D5 c).
 */
export interface CrearComentarioDto extends AlcanceActorTicket {
  ticketId: string;
  texto: string;
  autorId: string;
  esInterno: boolean;
  /**
   * `true` cuando el autor es el usuario de integración de un cliente (API pública `v1`). Ese usuario
   * habla por el cliente, no por soporte: su comentario nunca cuenta como primera respuesta de SLA.
   * Por defecto `false` (la API interna, donde el autor es una persona).
   */
  autorEsIntegracion?: boolean;
}

/**
 * CrearComentarioUseCase — registra un comentario (público o interno) en el
 * timeline de un ticket (T16, T17).
 *
 * Flujo:
 * 1. Carga el ticket. Si no existe, está soft-deleted o el actor no lo ve
 *    (`esTicketAccesiblePara`: `LECTURA` sobre el tipo y fila) → `TicketNoEncontradoError` (404);
 *    si lo ve sin `COMENTAR` (o sin `OBSERVAR`, si es interno) sobre el tipo →
 *    `AccionSobreTipoNoPermitidaError` (403).
 * 2. Comentar no depende del estado: en RESUELTO, CERRADO o CANCELADO, públicos e internos
 *    se aceptan para quien pueda comentar (odd/cerrado-solo-comentarios, S4: es lo único que
 *    queda abierto en esos estados). El comentario no cambia el estado del ticket.
 * 3. Resuelve el id del tipo de operación `COMENTARIO` del catálogo tenant
 *    (catálogo FIJO garantizado por el seed — ausencia = `throw` defensivo).
 * 4. Persiste la operación (`OperacionTicketEntity`, timeline) dentro de
 *    `txRunner.run`. Si el comentario es PÚBLICO, su autor no es el
 *    solicitante (un externo tiene `solicitanteId = null`: cualquier autor
 *    interno cuenta), tampoco es el usuario de integración del cliente
 *    (`autorEsIntegracion`: la API pública habla por el cliente, no por
 *    soporte; decisión del dueño del 2026-10-10, api-publica T5d) y el
 *    ticket no está RESUELTO, CERRADO ni CANCELADO (ya no espera una
 *    primera respuesta, el mismo criterio que el barrido de vencidas de SLA;
 *    el estado se lee del catálogo fijo, con `throw` defensivo si falta),
 *    registra en la misma tx la primera respuesta con
 *    `registrarSiFalta` (`updateMany where primeraRespuestaAt: null`:
 *    idempotente y resistente a la concurrencia; ADR-6, sla-primera-respuesta
 *    R1). Un borrado posterior del comentario no recalcula esa fecha.
 *    En la misma escritura guarda `primera_respuesta_habil_s`: los segundos
 *    hábiles creación → comentario con el calendario vigente
 *    (odd/promedios-dashboard-habiles). El calendario se carga ANTES de la tx
 *    y solo si el comentario puede ser la primera respuesta (cuenta y el
 *    ticket leído todavía no la tiene): los demás comentarios no pagan esas
 *    lecturas. Si otro comentario la registró en el medio, el UPDATE
 *    condicionado no escribe nada. Si la carga del calendario o el cálculo
 *    fallan, se loguea (sin el texto del comentario) y la primera respuesta
 *    se registra igual, con `primera_respuesta_habil_s` NULL: el dato del
 *    dashboard nunca rechaza el comentario.
 * 5. Si es PÚBLICO, publica `TicketComentadoEvent` (log-and-swallow, ADR-6
 *    — un fallo del publisher nunca revierte el comentario ya persistido).
 *    Los comentarios INTERNOS NUNCA emiten evento (T17 — no deben
 *    notificar al solicitante).
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/tickets-core/spec T16, T17. Ref design: ADR-6. Tarea: T9.1, T9.2.
 */
export class CrearComentarioUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'esVisiblePara'>,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'save'>,
    private readonly estadoRepo: Pick<IEstadoRepository, 'findById'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly eventPublisher: IDomainEventPublisher,
    private readonly txRunner: ITenantTransactionRunner,
    private readonly primeraRespuestaRepo: Pick<
      IPrimeraRespuestaWriteRepository,
      'registrarSiFalta'
    >,
    private readonly calculoHabil: CalcularSlaHabilVenceService,
    private readonly calendarioRepo: Pick<ICalendarioLaboralSemanalRepository, 'obtener'>,
    private readonly feriadosRepo: Pick<IFeriadosLaboralesRepository, 'obtener'>,
    private readonly logger: Pick<ILogger, 'error'>,
  ) {}

  async execute(dto: CrearComentarioDto): Promise<Result<OperacionTicketEntity, DomainError>> {
    const requisitos: AccionTipoTicket[] = dto.esInterno ? ['COMENTAR', 'OBSERVAR'] : ['COMENTAR'];
    const ticketResult = await cargarTicketParaOperar(
      this.ticketRepo,
      dto.ticketId,
      dto,
      ...requisitos,
    );
    if (ticketResult.isFail()) return Result.fail(ticketResult.getError());
    const ticket = ticketResult.getValue();

    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('COMENTARIO');
    if (!tipoOperacionId) {
      throw new Error(
        'Catálogo de tipo_operacion inconsistente: no existe "COMENTARIO" en el tenant activo.',
      );
    }

    const operacion = OperacionTicketEntity.create({
      ticketId: ticket.id,
      tipoOperacionId,
      descripcion: dto.texto,
      estadoAnteriorId: null,
      estadoNuevoId: null,
      autorId: dto.autorId,
      esInterno: dto.esInterno,
      metadata: null,
    });

    const cuentaComoPrimeraRespuesta =
      !dto.esInterno &&
      dto.autorId !== ticket.solicitanteId &&
      dto.autorEsIntegracion !== true &&
      (await this.esperaPrimeraRespuesta(ticket.estadoId));
    const habilS =
      cuentaComoPrimeraRespuesta && !ticket.relojSla?.primeraRespuestaAt
        ? await this.segundosHabiles(ticket.id, ticket.createdAt, operacion.createdAt)
        : null;
    await this.txRunner.run(async () => {
      await this.operacionRepo.save(operacion);
      if (cuentaComoPrimeraRespuesta) {
        await this.primeraRespuestaRepo.registrarSiFalta(ticket.id, operacion.createdAt, habilS);
      }
    });

    if (!dto.esInterno) {
      try {
        this.eventPublisher.publish(
          new TicketComentadoEvent({
            ticketId: ticket.id,
            operacionId: operacion.id,
            autorId: dto.autorId,
          }),
        );
      } catch {
        // log-and-swallow (ADR-6): un fallo del publisher NUNCA revierte un
        // comentario ya persistido. Defensa adicional a la que ya aplica el
        // adapter concreto (EventEmitter2DomainEventPublisher.publish nunca
        // lanza) — protege también contra implementaciones mockeadas.
      }
    }

    return Result.ok(operacion);
  }
  /**
   * ¿El ticket todavía espera una primera respuesta? No en RESUELTO, CERRADO ni CANCELADO: un
   * comentario después del cierre no es la primera respuesta del pedido.
   */
  private async esperaPrimeraRespuesta(estadoId: string): Promise<boolean> {
    // Catálogo FIJO garantizado por el seed (ADR-1) — su ausencia es un
    // bug de infraestructura, no un error del caller: throw defensivo.
    const estado = await this.estadoRepo.findById(estadoId);
    if (!estado) {
      throw new Error(
        `Catálogo de estados inconsistente: no existe el estado con id "${estadoId}" en el tenant activo.`,
      );
    }
    return !esEstadoSoloComentarios(estado.codigo);
  }

  /**
   * Segundos hábiles entre dos instantes con el calendario y los feriados vigentes del tenant, o
   * `null` si no se pudieron calcular (lectura del master o guarda de rango): se loguea y sigue.
   */
  private async segundosHabiles(
    ticketId: string,
    desde: Date,
    hasta: Date,
  ): Promise<number | null> {
    try {
      const [calendario, feriados] = await Promise.all([
        this.calendarioRepo.obtener(),
        this.feriadosRepo.obtener(),
      ]);
      return Math.round(
        this.calculoHabil.msHabilesEntre(desde, hasta, calendario, feriados) / 1000,
      );
    } catch (error) {
      this.logger.error(`PRIMERA_RESPUESTA_HABIL_FALLO | ticket=${ticketId} | ${String(error)}`);
      return null;
    }
  }
}
