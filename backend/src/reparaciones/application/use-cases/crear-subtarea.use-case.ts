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
import { TicketEdiliciaNoEncontradoError } from '../../domain/errors/reparaciones.errors';

/**
 * DTO de entrada para crear una subtarea edilicia.
 */
export interface CrearSubtareaDto {
  /** UUID del ticket_edilicia al que pertenece la subtarea. */
  ticketEdiliciaId: string;
  /** Descripción de la tarea concreta (VARCHAR 255). */
  descripcion: string;
  /** Orden de visualización (default 0). */
  orden?: number;
  /** UUID del autor de la acción (soft ref → master.usuarios; extraído del JWT). */
  autorId: string;
}

/**
 * CrearSubtareaUseCase — agrega una subtarea edilicia a un ticket en reparación.
 *
 * Flujo:
 * 1. Carga el ticket_edilicia → 404 si no existe o está eliminado.
 * 2. Resuelve el tipo de operación AVANCE_EDILICIO → falla si no está en catálogo.
 * 3. Carga las subtareas activas actuales.
 * 4. Crea la nueva SubtareaEdiliciaEntity (completada=false).
 * 5. Recalcula el porcentaje de avance con [existentes + nueva] vía AvanceCalculator.
 * 6. Actualiza ticketEdilicia.porcentajeAvance.
 * 7. Crea OperacionTicketEntity AVANCE_EDILICIO con metadata { porcentaje_anterior, porcentaje_nuevo }.
 * 8. Persiste subtarea + ticketEdilicia + operacion en la MISMA transacción (atómico).
 * 9. Retorna Result.ok(subtarea).
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:reparaciones/porcentaje_avance recalculado tras crear subtarea]
 * Tarea: 5.B.3 / 5.B.4
 */
export class CrearSubtareaUseCase {
  constructor(
    private readonly ticketEdiliciaRepo: ITicketEdiliciaRepository,
    private readonly subtareaRepo: ISubtareaEdiliciaRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: CrearSubtareaDto): Promise<Result<SubtareaEdiliciaEntity, DomainError>> {
    // 1. Cargar el ticket_edilicia; tratar soft-deleted como no encontrado
    const ticketEdilicia = await this.ticketEdiliciaRepo.findById(dto.ticketEdiliciaId);
    if (!ticketEdilicia || ticketEdilicia.isDeleted()) {
      return Result.fail(new TicketEdiliciaNoEncontradoError(dto.ticketEdiliciaId));
    }

    // 2. Resolver tipo de operación AVANCE_EDILICIO
    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('AVANCE_EDILICIO');
    if (!tipoOperacionId) {
      return Result.fail(new TipoOperacionNoEncontradoError('AVANCE_EDILICIO'));
    }

    // 3. Cargar subtareas activas (deleted_at IS NULL) actuales para el recálculo
    const subtareasActivas = await this.subtareaRepo.findActiveByTicketEdiliciaId(dto.ticketEdiliciaId);

    // 4. Crear la nueva subtarea (completada = false, UUIDv7 generado por BaseEntity)
    const nuevaSubtarea = SubtareaEdiliciaEntity.create({
      ticketEdiliciaId: dto.ticketEdiliciaId,
      descripcion: dto.descripcion,
      orden: dto.orden ?? 0,
    });

    // 5. Recalcular avance con [existentes + nueva subtarea] (nueva no está completada)
    //    La lista virtual incluye la nueva subtarea como si ya estuviera persistida.
    const listaVirtual = [
      ...subtareasActivas.map((s) => ({ completada: s.completada, deletedAt: s['_deletedAt'] ?? null })),
      { completada: false, deletedAt: null },
    ];
    const porcentajeAnterior = ticketEdilicia.porcentajeAvance;
    const porcentajeNuevo = AvanceCalculator.calcularDesdeSubtareas(listaVirtual);

    // 6. Actualizar el avance en el ticket_edilicia
    ticketEdilicia.actualizarAvance(porcentajeNuevo);

    // 7. Crear operación AVANCE_EDILICIO con metadata
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

    // 8. Persistir subtarea + ticketEdilicia + operacion en la misma transacción (atómico)
    await this.txRunner.run(async () => {
      await this.subtareaRepo.save(nuevaSubtarea);
      await this.ticketEdiliciaRepo.save(ticketEdilicia);
      await this.operacionRepo.save(operacion);
    });

    return Result.ok(nuevaSubtarea);
  }
}
