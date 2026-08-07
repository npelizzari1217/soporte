import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import { IOperacionTicketRepository } from '../../../tickets/domain/ports/i-operacion-ticket.repository';
import { AvanceCalculator } from '../../domain/services/avance-calculator';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { ISubtareaEdiliciaRepository } from '../../domain/ports/i-subtarea-edilicia.repository';
import {
  SubtareaNoEncontradaError,
  TicketEdiliciaNoEncontradoError,
} from '../../domain/errors/reparaciones.errors';

/** DTO de entrada para eliminar (soft delete) una subtarea edilicia (F3-E5). */
export interface EliminarSubtareaDto {
  /** UUID de la subtarea a eliminar. */
  subtareaId: string;
  /** UUID del autor de la acción (soft ref → master.usuarios; extraído del JWT). */
  autorId: string;
}

/**
 * EliminarSubtareaUseCase — soft delete de una subtarea edilicia,
 * recalculando el avance sobre las activas restantes (F3-E5).
 *
 * Flujo:
 * 1. Carga la subtarea → `SubtareaNoEncontradaError` si no existe o ya fue
 *    eliminada.
 * 2. Carga el `ticket_edilicia` asociado.
 * 3. Resuelve el tipo de operación AVANCE_EDILICIO.
 * 4. Carga las subtareas activas actuales (excluye la que se va a
 *    eliminar — la lectura ocurre ANTES del `delete`, así que se filtra
 *    explícitamente por id para simular el estado post-delete).
 * 5. Recalcula `porcentajeAvance` sobre las activas restantes.
 * 6. **DENTRO de la transacción**: soft-delete de la subtarea + persiste
 *    ticketEdilicia + operación AVANCE_EDILICIO (atómico).
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E5. Tarea: T9.5.
 */
export class EliminarSubtareaUseCase {
  constructor(
    private readonly subtareaRepo: Pick<
      ISubtareaEdiliciaRepository,
      'findById' | 'findActiveByTicketEdiliciaId' | 'delete'
    >,
    private readonly ticketEdiliciaRepo: Pick<ITicketEdiliciaRepository, 'findById' | 'save'>,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'save'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: EliminarSubtareaDto): Promise<Result<void, DomainError>> {
    const subtarea = await this.subtareaRepo.findById(dto.subtareaId);
    if (!subtarea || subtarea.isDeleted()) {
      return Result.fail(new SubtareaNoEncontradaError(dto.subtareaId));
    }

    const ticketEdilicia = await this.ticketEdiliciaRepo.findById(subtarea.ticketEdiliciaId);
    if (!ticketEdilicia || ticketEdilicia.isDeleted()) {
      return Result.fail(new TicketEdiliciaNoEncontradoError(subtarea.ticketEdiliciaId));
    }

    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('AVANCE_EDILICIO');
    if (!tipoOperacionId) {
      throw new Error(
        'Catálogo de tipo_operacion inconsistente: no existe "AVANCE_EDILICIO" en el tenant activo.',
      );
    }

    // La query es previa al delete efectivo — se excluye la subtarea a
    // eliminar explícitamente para reflejar el estado post-delete.
    const activasActuales = await this.subtareaRepo.findActiveByTicketEdiliciaId(
      subtarea.ticketEdiliciaId,
    );
    const restantes = activasActuales
      .filter((s) => s.id !== subtarea.id)
      .map((s) => ({ completada: s.completada, deletedAt: null }));

    const porcentajeAnterior = ticketEdilicia.porcentajeAvance;
    const porcentajeNuevo = AvanceCalculator.calcularDesdeSubtareas(restantes);
    ticketEdilicia.actualizarAvance(porcentajeNuevo);

    const operacion = OperacionTicketEntity.create({
      ticketId: ticketEdilicia.ticketId,
      tipoOperacionId,
      descripcion: null,
      estadoAnteriorId: null,
      estadoNuevoId: null,
      autorId: dto.autorId,
      esInterno: false,
      metadata: { porcentaje_anterior: porcentajeAnterior, porcentaje_nuevo: porcentajeNuevo },
    });

    await this.txRunner.run(async () => {
      await this.subtareaRepo.delete(subtarea.id);
      await this.ticketEdiliciaRepo.save(ticketEdilicia);
      await this.operacionRepo.save(operacion);
    });

    return Result.ok(undefined);
  }
}
