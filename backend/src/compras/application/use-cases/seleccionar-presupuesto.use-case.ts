import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { PresupuestoEntity } from '../../domain/entities/presupuesto.entity';
import { PresupuestoNoEncontradoError } from '../../domain/errors/compras.errors';
import { IPresupuestoRepository } from '../../domain/ports/i-presupuesto.repository';

/**
 * DTO de entrada para seleccionar un presupuesto como el ganador de una compra.
 */
export interface SeleccionarPresupuestoDto {
  /** UUID del presupuesto a marcar como seleccionado. */
  presupuestoId: string;
}

/**
 * SeleccionarPresupuestoUseCase — swap atómico del presupuesto ganador de un ticket de compra.
 *
 * Garantiza la invariante: solo un presupuesto puede estar marcado `seleccionado = true`
 * por ticket_compra. El intercambio se realiza en una sola transacción.
 *
 * Flujo:
 * 1. Carga el presupuesto a seleccionar → PresupuestoNoEncontradoError si no existe.
 * 2. Busca el presupuesto actualmente seleccionado para el mismo ticket_compra.
 * 3. Dentro de una transacción atómica:
 *    a. Si hay un presupuesto anterior Y es diferente del nuevo → lo deselecciona y persiste.
 *    b. Selecciona el nuevo presupuesto y persiste.
 * 4. Retorna Result.ok(presupuesto) con seleccionado = true.
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:compras/Selección única de presupuesto, Swap atómico]
 * Tarea: 4.B.7 / 4.B.8
 */
export class SeleccionarPresupuestoUseCase {
  constructor(
    private readonly presupuestoRepo: IPresupuestoRepository,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: SeleccionarPresupuestoDto): Promise<Result<PresupuestoEntity, DomainError>> {
    // 1. Cargar el presupuesto a seleccionar
    const presupuesto = await this.presupuestoRepo.findById(dto.presupuestoId);
    if (!presupuesto) {
      return Result.fail(new PresupuestoNoEncontradoError(dto.presupuestoId));
    }

    // 2. Buscar el presupuesto actualmente seleccionado para el mismo ticket_compra
    const anteriorSeleccionado = await this.presupuestoRepo.findSelectedByTicketCompraId(
      presupuesto.ticketCompraId,
    );

    // 3. Swap atómico dentro del txRunner
    await this.txRunner.run(async () => {
      // 3a. Deseleccionar el anterior si existe y es diferente del nuevo
      if (anteriorSeleccionado && anteriorSeleccionado.id !== presupuesto.id) {
        anteriorSeleccionado.deseleccionar();
        await this.presupuestoRepo.save(anteriorSeleccionado);
      }

      // 3b. Seleccionar el nuevo presupuesto
      presupuesto.seleccionar();
      await this.presupuestoRepo.save(presupuesto);
    });

    return Result.ok(presupuesto);
  }
}
