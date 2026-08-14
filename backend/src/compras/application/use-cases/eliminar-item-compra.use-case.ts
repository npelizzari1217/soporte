import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import { CompraNoEncontradaError } from '../../domain/errors/compras.errors';
import { RegistrarOperacionCompra } from '../services/registrar-operacion-compra';

/** DTO de entrada de `EliminarItemCompraUseCase` (§4.2, S6-S7). */
export interface EliminarItemCompraDto {
  compraId: string;
  itemId: string;
  /** Actor que ejecuta la eliminación (`JWT.sub`) — autor de la operación de bitácora. */
  usuarioId: string;
}

/**
 * EliminarItemCompraUseCase — baja lógica (soft delete) de un ítem de compra
 * (§4.2, PR-15).
 *
 * S6/S7 YA están resueltos en `CompraEntity.eliminarItem()`: PENDIENTE o
 * RECHAZADO se pueden eliminar (S6); APROBADO está PROHIBIDO ->
 * `ItemCompraAprobadoNoEliminableError` (S7). Este caso de uso NO
 * re-implementa esa regla, sólo la invoca. La eliminación es soft delete
 * (`ItemCompraEntity.softDelete()`, vía `BaseEntity`) — los ítems eliminados
 * quedan con `deletedAt` seteado y `CompraEntity.itemsActivos()` los excluye
 * de la derivación de estado (spec §2: "n = ítems no eliminados").
 *
 * Flujo:
 * 1. Carga la compra CON sus ítems. Si no existe o está soft-deleted →
 *    `CompraNoEncontradaError` (404).
 * 2. Invoca `compra.eliminarItem(itemId)` — puede fallar con
 *    `CompraCanceladaError` (S5), `ItemCompraNoEncontradoError`, o
 *    `ItemCompraAprobadoNoEliminableError` (S7). El guard corre ANTES de
 *    abrir la transacción: si falla, `txRunner.run` NUNCA se invoca, así
 *    que `RegistrarOperacionCompra.registrar()` queda en 0 llamadas de
 *    forma estructural (corolario de S36/S35: una mutación rechazada no es
 *    un evento del timeline).
 * 3. Si la eliminación fue exitosa, **dentro de la misma transacción**
 *    (`ITenantTransactionRunner.run`): persiste la cabecera (`touch()` de
 *    `CompraEntity`, ADR-C2) y el ítem (ahora con `deletedAt` seteado), y
 *    registra EXACTAMENTE 1 `OperacionCompra` de tipo `ITEM_ELIMINADO` (S35).
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.2 (S6-S7), §4.10 (S35). Ref
 * design: ADR-C2, ADR-C4. Tarea: PR-15.
 */
export class EliminarItemCompraUseCase {
  constructor(
    private readonly compraRepo: Pick<
      ICompraRepository,
      'findByIdConItems' | 'guardar' | 'guardarItem'
    >,
    private readonly registrarOperacion: RegistrarOperacionCompra,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: EliminarItemCompraDto): Promise<Result<void, DomainError>> {
    const compra = await this.compraRepo.findByIdConItems(dto.compraId);
    if (!compra || compra.isDeleted()) {
      return Result.fail(new CompraNoEncontradaError(dto.compraId));
    }

    const resultadoEliminacion = compra.eliminarItem(dto.itemId);
    if (resultadoEliminacion.isFail()) {
      return resultadoEliminacion;
    }

    const item = compra.items.find((i) => i.id === dto.itemId);
    if (!item) {
      // Invariante: compra.eliminarItem() ya devolvió Result.ok, así que el
      // ítem existe en el agregado (ahora soft-deleted). Si esto se
      // dispara, es un bug de CompraEntity, no un camino de negocio.
      throw new Error(
        `EliminarItemCompraUseCase: invariante violado — eliminarItem() tuvo éxito pero el ítem "${dto.itemId}" no aparece en compra.items.`,
      );
    }

    await this.txRunner.run(async () => {
      await this.compraRepo.guardar(compra);
      await this.compraRepo.guardarItem(item);
      await this.registrarOperacion.registrar({
        compraId: compra.id,
        itemCompraId: item.id,
        tipo: 'ITEM_ELIMINADO',
        usuarioId: dto.usuarioId,
        detalle: `Ítem "${item.descripcion}" eliminado.`,
        datos: null,
      });
    });

    return Result.ok(undefined);
  }
}
