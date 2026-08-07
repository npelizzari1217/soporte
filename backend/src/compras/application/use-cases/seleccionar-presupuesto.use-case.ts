import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { PresupuestoEntity } from '../../domain/entities/presupuesto.entity';
import { PresupuestoNoEncontradoError } from '../../domain/errors/compras.errors';
import { IPresupuestoRepository } from '../../domain/ports/i-presupuesto.repository';

/** DTO de entrada para seleccionar un presupuesto como el ganador (ADR-7). */
export interface SeleccionarPresupuestoDto {
  /** UUID del presupuesto a marcar como seleccionado. */
  presupuestoId: string;
  /** UUID del ticket_compra dueño (de la URL — defensa en profundidad). */
  ticketCompraId: string;
}

/**
 * SeleccionarPresupuestoUseCase — swap atómico del presupuesto ganador de
 * un ticket de compra (F3-C3, ADR-7).
 *
 * Garantiza la invariante "solo un `seleccionado=true` por
 * `ticket_compra_id`" — SIN constraint de DB, únicamente mediante este
 * swap atómico DENTRO de una transacción.
 *
 * Flujo:
 * 1. Carga el presupuesto a seleccionar; si no existe, o pertenece a OTRO
 *    `ticket_compra` (mismatch con `dto.ticketCompraId` de la URL) →
 *    `PresupuestoNoEncontradoError` (no revela existencia cross-recurso).
 * 2. Busca el presupuesto actualmente seleccionado del mismo `ticket_compra`.
 * 3. Dentro de la transacción:
 *    a. Si hay un anterior Y es distinto del nuevo → lo deselecciona y persiste.
 *    b. Selecciona el nuevo y persiste.
 *
 * Sin throw — todos los fallos esperados retornan `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C3. Ref design: ADR-7.
 * Tarea: T4.4, T4.5.
 */
export class SeleccionarPresupuestoUseCase {
  constructor(
    private readonly presupuestoRepo: Pick<
      IPresupuestoRepository,
      'findById' | 'findSelectedByTicketCompraId' | 'save'
    >,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: SeleccionarPresupuestoDto): Promise<Result<PresupuestoEntity, DomainError>> {
    const presupuesto = await this.presupuestoRepo.findById(dto.presupuestoId);
    if (
      !presupuesto ||
      presupuesto.isDeleted() ||
      presupuesto.ticketCompraId !== dto.ticketCompraId
    ) {
      return Result.fail(new PresupuestoNoEncontradoError(dto.presupuestoId));
    }

    const anteriorSeleccionado = await this.presupuestoRepo.findSelectedByTicketCompraId(
      dto.ticketCompraId,
    );

    await this.txRunner.run(async () => {
      if (anteriorSeleccionado && anteriorSeleccionado.id !== presupuesto.id) {
        anteriorSeleccionado.deseleccionar();
        await this.presupuestoRepo.save(anteriorSeleccionado);
      }
      presupuesto.seleccionar();
      await this.presupuestoRepo.save(presupuesto);
    });

    return Result.ok(presupuesto);
  }
}
