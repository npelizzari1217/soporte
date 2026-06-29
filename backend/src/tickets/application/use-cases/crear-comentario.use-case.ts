import { DomainError, Result } from '../../../shared/domain/result';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import {
  ComentarioNoPermitidoError,
  EstadoCatalogoNoEncontradoError,
  TicketNoEncontradoError,
  TipoOperacionNoEncontradoError,
} from '../../domain/errors/tickets.errors';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';

/**
 * Códigos de estado que bloquean la creación de comentarios.
 * Incluye los terminales activos y los congelados legacy.
 *
 * Invariante: los comentarios (ticket:comentar) son aclaratorios — no disparan
 * ninguna transición de estado. Por eso el bloqueo aplica igual que para
 * observaciones: no tiene sentido comentar un ticket ya cerrado/resuelto.
 *
 * Ref spec: specs/tickets-core/spec.md §Comentar en estado terminal/congelado
 * Ref design: ADR-2
 */
const ESTADOS_BLOQUEAN_COMENTARIO = new Set<string>([
  'RESUELTO',
  'SIN_SOLUCION',
  'RECHAZADO', // terminales activos
  'CERRADO',
  'CANCELADO',
  'PENDIENTE_APROBACION', // congelados legacy
]);

/**
 * DTO de entrada para crear un comentario sobre un ticket.
 *
 * - `ticketId`: UUID del ticket al que se añade el comentario.
 * - `texto`: contenido del comentario (no vacío — validado en la capa de interfaz).
 * - `autorId`: UUID del usuario que escribe el comentario (del JWT claim `sub`).
 *
 * Ref design: ADR-2, §Interfaces/Contracts
 * Change: tickets-rbac-4-roles / PR4a
 */
export interface CrearComentarioDto {
  ticketId: string;
  texto: string;
  autorId: string;
}

/**
 * CrearComentarioUseCase — caso de uso para registrar un comentario sobre un ticket.
 *
 * Flujo:
 * 1. Cargar el ticket por id → 404 si no existe (cubre aislamiento multi-tenant).
 * 2. Cargar estado actual del ticket → 500 si no está en catálogo (corrupción).
 * 3. Validar que el estado no sea terminal ni congelado → ComentarioNoPermitidoError 422.
 * 4. Resolver tipoOperacionId de 'COMENTARIO' → 500 si no existe (catálogo no sembrado).
 * 5. Crear OperacionTicketEntity con estadoAnteriorId=null y estadoNuevoId=null.
 * 6. Persistir la operación (solo 1 write — sin cambio de estado en el ticket).
 * 7. Retornar Result.ok(comentario).
 *
 * DIFERENCIAS clave vs. CrearObservacionUseCase:
 * - NO usa ITenantTransactionRunner (un solo write → no necesita transacción).
 * - NO realiza auto-transición de estado (ni siquiera desde APROBADO).
 * - Retorna la OperacionTicketEntity creada, no el TicketEntity.
 * - El permiso requerido es ticket:comentar (b0..019), no ticket:observar.
 *
 * Sin throw para errores de dominio esperados — todos retornan Result.fail().
 * Errores de infraestructura (DB) sí burbujean como throw.
 *
 * Ref spec: specs/tickets-core/spec.md §CrearComentarioUseCase
 * Ref design: ADR-2
 * Change: tickets-rbac-4-roles / PR4a — T4A.8
 */
export class CrearComentarioUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly estadoRepo: IEstadoRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
  ) {}

  async execute(dto: CrearComentarioDto): Promise<Result<OperacionTicketEntity, DomainError>> {
    // 1. Cargar ticket → 404 si no existe (también cubre ticket de otro tenant)
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (!ticket) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }

    // 2. Cargar estado actual desde el catálogo del tenant
    //    Null aquí indica corrupción de datos → 500
    const estadoActual = await this.estadoRepo.findById(ticket.estadoId);
    if (!estadoActual) {
      return Result.fail(new EstadoCatalogoNoEncontradoError(ticket.estadoId));
    }

    // 3. Validar que el estado permita comentarios
    if (ESTADOS_BLOQUEAN_COMENTARIO.has(estadoActual.codigo)) {
      return Result.fail(new ComentarioNoPermitidoError(estadoActual.codigo));
    }

    // 4. Resolver tipoOperacionId de COMENTARIO
    //    'COMENTARIO' es el código semántico en tipo_operacion (f0..002 en seed)
    const tipoComentarioId = await this.tipoOperacionRepo.findIdByCodigo('COMENTARIO');
    if (!tipoComentarioId) {
      return Result.fail(new TipoOperacionNoEncontradoError('COMENTARIO'));
    }

    // 5. Crear OperacionTicketEntity tipo COMENTARIO
    //    estadoAnteriorId/estadoNuevoId = null — no es un cambio de estado
    const comentario = OperacionTicketEntity.create({
      ticketId: ticket.id,
      tipoOperacionId: tipoComentarioId,
      descripcion: dto.texto,
      estadoAnteriorId: null,
      estadoNuevoId: null,
      autorId: dto.autorId,
      metadata: null,
    });

    // 6. Persistir la operación (sin modificar el ticket)
    await this.operacionRepo.save(comentario);

    // 7. Retornar la operación creada
    return Result.ok(comentario);
  }
}
