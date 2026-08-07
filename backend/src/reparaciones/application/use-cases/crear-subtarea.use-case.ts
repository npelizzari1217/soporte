import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import { IOperacionTicketRepository } from '../../../tickets/domain/ports/i-operacion-ticket.repository';
import { SubtareaEdiliciaEntity } from '../../domain/entities/subtarea-edilicia.entity';
import { AvanceCalculator } from '../../domain/services/avance-calculator';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { ISubtareaEdiliciaRepository } from '../../domain/ports/i-subtarea-edilicia.repository';
import { TicketEdiliciaNoEncontradoError } from '../../domain/errors/reparaciones.errors';

/** DTO de entrada para crear una subtarea edilicia (F3-E3). */
export interface CrearSubtareaDto {
  /** UUID del `ticket_edilicia` al que pertenece la subtarea. */
  ticketEdiliciaId: string;
  /** Descripción de la tarea concreta (VARCHAR 255). */
  descripcion: string;
  /** Orden de visualización (default 0). */
  orden?: number;
  /** UUID del autor de la acción (soft ref → master.usuarios; extraído del JWT). */
  autorId: string;
}

/**
 * CrearSubtareaUseCase — agrega una subtarea al checklist de un ticket en
 * reparación (F3-E3).
 *
 * Flujo:
 * 1. Carga el `ticket_edilicia` → `TicketEdiliciaNoEncontradoError` si no
 *    existe o está eliminado.
 * 2. Resuelve el tipo de operación AVANCE_EDILICIO (catálogo FIJO,
 *    sembrado desde Fase 1).
 * 3. Carga las subtareas activas actuales.
 * 4. Crea la nueva `SubtareaEdiliciaEntity` (completada=false).
 * 5. Recalcula `porcentajeAvance` con [existentes + nueva] vía
 *    `AvanceCalculator` (la nueva no está completada).
 * 6. Actualiza `ticketEdilicia.porcentajeAvance`.
 * 7. Crea `OperacionTicketEntity` AVANCE_EDILICIO con
 *    `metadata={porcentaje_anterior, porcentaje_nuevo}`.
 * 8. **DENTRO de la transacción**: persiste subtarea + ticketEdilicia +
 *    operación (atómico).
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E3. Tarea: T9.1, T9.2.
 */
export class CrearSubtareaUseCase {
  constructor(
    private readonly ticketEdiliciaRepo: Pick<ITicketEdiliciaRepository, 'findById' | 'save'>,
    private readonly subtareaRepo: Pick<
      ISubtareaEdiliciaRepository,
      'findActiveByTicketEdiliciaId' | 'save'
    >,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'save'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: CrearSubtareaDto): Promise<Result<SubtareaEdiliciaEntity, DomainError>> {
    const ticketEdilicia = await this.ticketEdiliciaRepo.findById(dto.ticketEdiliciaId);
    if (!ticketEdilicia || ticketEdilicia.isDeleted()) {
      return Result.fail(new TicketEdiliciaNoEncontradoError(dto.ticketEdiliciaId));
    }

    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('AVANCE_EDILICIO');
    if (!tipoOperacionId) {
      throw new Error(
        'Catálogo de tipo_operacion inconsistente: no existe "AVANCE_EDILICIO" en el tenant activo.',
      );
    }

    const subtareasActivas = await this.subtareaRepo.findActiveByTicketEdiliciaId(
      dto.ticketEdiliciaId,
    );

    const nuevaSubtarea = SubtareaEdiliciaEntity.create({
      ticketEdiliciaId: dto.ticketEdiliciaId,
      descripcion: dto.descripcion,
      orden: dto.orden ?? 0,
    });

    // Lista virtual: las existentes + la nueva (aún no persistida, completada=false).
    const listaVirtual = [
      ...subtareasActivas.map((s) => ({ completada: s.completada, deletedAt: null })),
      { completada: false, deletedAt: null },
    ];
    const porcentajeAnterior = ticketEdilicia.porcentajeAvance;
    const porcentajeNuevo = AvanceCalculator.calcularDesdeSubtareas(listaVirtual);
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
      await this.subtareaRepo.save(nuevaSubtarea);
      await this.ticketEdiliciaRepo.save(ticketEdilicia);
      await this.operacionRepo.save(operacion);
    });

    return Result.ok(nuevaSubtarea);
  }
}
