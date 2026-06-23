import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import { TipoOperacionNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';
import { IOperacionTicketRepository } from '../../../tickets/domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import { SubtareaEdiliciaEntity } from '../../domain/entities/subtarea-edilicia.entity';
import { AvanceCalculator } from '../../domain/services/avance-calculator';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { ISubtareaEdiliciaRepository } from '../../domain/ports/i-subtarea-edilicia.repository';
import {
  SubtareaEdiliciaNoEncontradaError,
  SubtareaYaCompletadaError,
} from '../../domain/errors/reparaciones.errors';

/**
 * DTO de entrada para completar una subtarea edilicia.
 */
export interface CompletarSubtareaDto {
  /** UUID de la subtarea a completar. */
  subtareaId: string;
  /** UUID del usuario que completa la subtarea (soft ref → master.usuarios). */
  completadaPorId: string;
  /** UUID del autor de la acción (para el registro en operaciones_ticket). */
  autorId: string;
}

/**
 * CompletarSubtareaUseCase — marca una subtarea edilicia como completada.
 *
 * Flujo:
 * 1. Carga la subtarea → 404 si no existe o está eliminada.
 * 2. Verifica que no esté ya completada → SubtareaYaCompletadaError.
 * 3. Carga el ticket_edilicia asociado.
 * 4. Resuelve el tipo de operación AVANCE_EDILICIO.
 * 5. Carga las subtareas activas actuales (incluye la que vamos a completar).
 * 6. Marca la subtarea como completada (completar()).
 * 7. Recalcula el porcentaje de avance con AvanceCalculator (la subtarea completada cuenta).
 * 8. Actualiza ticketEdilicia.porcentajeAvance.
 * 9. Crea OperacionTicketEntity AVANCE_EDILICIO con metadata { porcentaje_anterior, porcentaje_nuevo }.
 * 10. Persiste subtarea + ticketEdilicia + operacion en la MISMA transacción (atómico).
 * 11. Retorna Result.ok(subtarea).
 *
 * IMPORTANTE: Completar la última subtarea (avance → 100%) NO transiciona el estado del
 * ticket automáticamente. La transición a RESUELTO es explícita (guard de EdiliciaStateMachine).
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:reparaciones/porcentaje_avance recalculado tras completar, Guard de avance]
 * Ref spec: [SPEC:reparaciones/Completar subtarea no transiciona automáticamente]
 * Tarea: 5.B.5 / 5.B.6
 */
export class CompletarSubtareaUseCase {
  constructor(
    private readonly subtareaRepo: ISubtareaEdiliciaRepository,
    private readonly ticketEdiliciaRepo: ITicketEdiliciaRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: CompletarSubtareaDto): Promise<Result<SubtareaEdiliciaEntity, DomainError>> {
    // 1. Cargar la subtarea; tratar soft-deleted como no encontrada
    const subtarea = await this.subtareaRepo.findById(dto.subtareaId);
    if (!subtarea || subtarea.isDeleted()) {
      return Result.fail(new SubtareaEdiliciaNoEncontradaError(dto.subtareaId));
    }

    // 2. Verificar que la subtarea no esté ya completada
    if (subtarea.completada) {
      return Result.fail(new SubtareaYaCompletadaError(dto.subtareaId));
    }

    // 3. Cargar el ticket_edilicia asociado (para actualizar el avance y obtener ticketId)
    const ticketEdilicia = await this.ticketEdiliciaRepo.findById(subtarea.ticketEdiliciaId);
    if (!ticketEdilicia || ticketEdilicia.isDeleted()) {
      // Esto indica inconsistencia en los datos — la subtarea refiere a un edilicia eliminado
      return Result.fail(new SubtareaEdiliciaNoEncontradaError(dto.subtareaId));
    }

    // 4. Resolver tipo de operación AVANCE_EDILICIO
    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('AVANCE_EDILICIO');
    if (!tipoOperacionId) {
      return Result.fail(new TipoOperacionNoEncontradoError('AVANCE_EDILICIO'));
    }

    // 5. Cargar las subtareas activas actuales (incluye la subtarea que vamos a completar)
    const subtareasActivas = await this.subtareaRepo.findActiveByTicketEdiliciaId(
      subtarea.ticketEdiliciaId,
    );

    // 6. Marcar la subtarea como completada (modifica el estado de la entidad en memoria)
    subtarea.completar(dto.completadaPorId);

    // 7. Recalcular avance con la lista actualizada.
    //    Construir la lista virtual con la subtarea ya marcada como completada.
    const porcentajeAnterior = ticketEdilicia.porcentajeAvance;
    const listaActualizada = subtareasActivas.map((s) => ({
      completada: s.id === subtarea.id ? true : s.completada,
      deletedAt: s._deletedAt,
    }));
    const porcentajeNuevo = AvanceCalculator.calcularDesdeSubtareas(listaActualizada);

    // 8. Actualizar el avance en el ticket_edilicia
    ticketEdilicia.actualizarAvance(porcentajeNuevo);

    // 9. Crear operación AVANCE_EDILICIO con metadata
    //    NOTA: No se transiciona el estado del ticket aunque avance = 100.
    //    La transición a RESUELTO es explícita vía EdiliciaStateMachine (guard).
    const operacion = OperacionTicketEntity.create({
      ticketId: ticketEdilicia.ticketId,
      tipoOperacionId,
      descripcion: null,
      estadoAnteriorId: null,
      estadoNuevoId: null,
      autorId: dto.autorId,
      metadata: {
        porcentaje_anterior: porcentajeAnterior,
        porcentaje_nuevo: porcentajeNuevo,
      },
    });

    // 10. Persistir subtarea + ticketEdilicia + operacion en la misma transacción (atómico)
    await this.txRunner.run(async () => {
      await this.subtareaRepo.save(subtarea);
      await this.ticketEdiliciaRepo.save(ticketEdilicia);
      await this.operacionRepo.save(operacion);
    });

    return Result.ok(subtarea);
  }
}
