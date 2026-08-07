import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import { IOperacionTicketRepository } from '../../../tickets/domain/ports/i-operacion-ticket.repository';
import { SubtareaEdiliciaEntity } from '../../domain/entities/subtarea-edilicia.entity';
import { AvanceCalculator } from '../../domain/services/avance-calculator';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { ISubtareaEdiliciaRepository } from '../../domain/ports/i-subtarea-edilicia.repository';
import {
  SubtareaNoEncontradaError,
  TicketEdiliciaNoEncontradoError,
} from '../../domain/errors/reparaciones.errors';

/** DTO de entrada para completar una subtarea edilicia (F3-E4). */
export interface CompletarSubtareaDto {
  /** UUID de la subtarea a completar. */
  subtareaId: string;
  /** UUID del usuario que completa la subtarea (soft ref → master.usuarios; extraído del JWT). También se usa como autor de la operación de timeline. */
  completadaPorId: string;
}

/**
 * CompletarSubtareaUseCase — marca una subtarea edilicia como completada
 * (F3-E4).
 *
 * Flujo:
 * 1. Carga la subtarea → `SubtareaNoEncontradaError` si no existe o está
 *    eliminada.
 * 2. Carga el `ticket_edilicia` asociado.
 * 3. Resuelve el tipo de operación AVANCE_EDILICIO.
 * 4. Carga las subtareas activas actuales (incluye la que se completa).
 * 5. `subtarea.completar(completadaPorId)`.
 * 6. Recalcula `porcentajeAvance` con la lista actualizada (la subtarea
 *    marcada como completada).
 * 7. Actualiza `ticketEdilicia.porcentajeAvance`.
 * 8. Crea `OperacionTicketEntity` AVANCE_EDILICIO con metadata.
 * 9. **DENTRO de la transacción**: persiste subtarea + ticketEdilicia +
 *    operación (atómico).
 *
 * IMPORTANTE (ADR-2): completar la última subtarea (avance→100%) NO
 * transiciona el estado del `Ticket` base — este use case NUNCA recibe
 * `ITicketRepository` ni invoca la máquina de estados. La transición a
 * RESUELTO es explícita vía el endpoint de Fase 2.
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E4. Ref design: ADR-2. Tarea: T9.3, T9.4.
 */
export class CompletarSubtareaUseCase {
  constructor(
    private readonly subtareaRepo: Pick<
      ISubtareaEdiliciaRepository,
      'findById' | 'findActiveByTicketEdiliciaId' | 'save'
    >,
    private readonly ticketEdiliciaRepo: Pick<ITicketEdiliciaRepository, 'findById' | 'save'>,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'save'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: CompletarSubtareaDto): Promise<Result<SubtareaEdiliciaEntity, DomainError>> {
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

    const subtareasActivas = await this.subtareaRepo.findActiveByTicketEdiliciaId(
      subtarea.ticketEdiliciaId,
    );

    subtarea.completar(dto.completadaPorId);

    const porcentajeAnterior = ticketEdilicia.porcentajeAvance;
    const listaActualizada = subtareasActivas.map((s) => ({
      completada: s.id === subtarea.id ? true : s.completada,
      deletedAt: null,
    }));
    const porcentajeNuevo = AvanceCalculator.calcularDesdeSubtareas(listaActualizada);
    ticketEdilicia.actualizarAvance(porcentajeNuevo);

    const operacion = OperacionTicketEntity.create({
      ticketId: ticketEdilicia.ticketId,
      tipoOperacionId,
      descripcion: null,
      estadoAnteriorId: null,
      estadoNuevoId: null,
      autorId: dto.completadaPorId,
      esInterno: false,
      metadata: { porcentaje_anterior: porcentajeAnterior, porcentaje_nuevo: porcentajeNuevo },
    });

    await this.txRunner.run(async () => {
      await this.subtareaRepo.save(subtarea);
      await this.ticketEdiliciaRepo.save(ticketEdilicia);
      await this.operacionRepo.save(operacion);
    });

    return Result.ok(subtarea);
  }
}
