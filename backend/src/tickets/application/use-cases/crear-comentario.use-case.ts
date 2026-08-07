import { DomainError, Result } from '../../../shared/domain/result';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TicketComentadoEvent } from '../../domain/events/ticket-comentado.event';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import {
  TicketNoEncontradoError,
  ComentarioNoPermitidoError,
} from '../../domain/errors/tickets.errors';

/**
 * Estados en los que un ticket YA NO acepta nuevos comentarios PÚBLICOS
 * (T16). Distinto de `TERMINAL_STATES` de `TicketEntity` (que solo cubre
 * CERRADO/CANCELADO para transiciones, T9/T11): acá RESUELTO también
 * bloquea, aunque tenga arco de salida válido hacia CERRADO (ADR-3).
 *
 * Los comentarios INTERNOS (T17) NO están sujetos a esta restricción — el
 * staff puede seguir dejando notas técnicas aun con el ticket cerrado.
 */
const ESTADOS_SIN_COMENTARIOS_PUBLICOS = new Set<string>(['RESUELTO', 'CERRADO', 'CANCELADO']);

/**
 * DTO de entrada de `CrearComentarioUseCase`.
 *
 * Deviación del design ("Firmas TS clave"): se omite `clienteId` del
 * `CrearComentarioDto` propuesto — no hay validación cross-DB al comentar
 * (a diferencia de `CrearTicketUseCase`/`SolicitanteInvalido`), mismo
 * criterio que la deviación ya documentada en `TransicionarEstadoDto` (PR7).
 */
export interface CrearComentarioDto {
  ticketId: string;
  texto: string;
  autorId: string;
  esInterno: boolean;
}

/**
 * CrearComentarioUseCase — registra un comentario (público o interno) en el
 * timeline de un ticket (T16, T17).
 *
 * Flujo:
 * 1. Carga el ticket. Si no existe o está soft-deleted → `TicketNoEncontradoError` (404).
 * 2. Si el comentario es PÚBLICO (`esInterno=false`, T16): resuelve el
 *    código semántico del estado ACTUAL (`estadoRepo.findById`, catálogo
 *    fijo — su ausencia es un fallo de infraestructura, `throw`
 *    defensivo, mismo patrón que `TransicionarEstadoUseCase`) y rechaza
 *    (422 `ComentarioNoPermitidoError`) si el ticket está en
 *    RESUELTO/CERRADO/CANCELADO. Los comentarios INTERNOS (T17) NO tienen
 *    esta restricción.
 * 3. Resuelve el id del tipo de operación `COMENTARIO` del catálogo tenant
 *    (catálogo FIJO garantizado por el seed — ausencia = `throw` defensivo).
 * 4. Persiste la operación (`OperacionTicketEntity`, timeline). Sin
 *    `ITenantTransactionRunner` (T24 — "los comentarios (write único) MAY
 *    omitir la transacción").
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
    private readonly ticketRepo: Pick<ITicketRepository, 'findById'>,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'save'>,
    private readonly estadoRepo: Pick<IEstadoRepository, 'findById'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly eventPublisher: IDomainEventPublisher,
  ) {}

  async execute(dto: CrearComentarioDto): Promise<Result<OperacionTicketEntity, DomainError>> {
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (!ticket || ticket.isDeleted()) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }

    if (!dto.esInterno) {
      // Catálogo FIJO garantizado por el seed (ADR-1) — su ausencia es un
      // bug de infraestructura, no un error del caller: throw defensivo.
      const estadoActual = await this.estadoRepo.findById(ticket.estadoId);
      if (!estadoActual) {
        throw new Error(
          `Catálogo de estados inconsistente: no existe el estado con id "${ticket.estadoId}" en el tenant activo.`,
        );
      }
      if (ESTADOS_SIN_COMENTARIOS_PUBLICOS.has(estadoActual.codigo)) {
        return Result.fail(new ComentarioNoPermitidoError(estadoActual.codigo));
      }
    }

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

    await this.operacionRepo.save(operacion);

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
}
