import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import { CompraNoEncontradaError } from '../../domain/errors/compras.errors';
import { RegistrarOperacionCompra } from '../services/registrar-operacion-compra';

/**
 * DTO de entrada de `EditarItemCompraUseCase` (§4.2/§4.4, PATCH semántico —
 * `undefined` no toca el campo, mismo criterio que `ItemCompraActualizarProps`).
 */
export interface EditarItemCompraDto {
  compraId: string;
  itemId: string;
  /** Actor que ejecuta la edición (`JWT.sub`) — autor de la operación de bitácora. */
  usuarioId: string;
  descripcion?: string;
  cantidad?: number;
  proveedor?: string;
  monto?: number;
  moneda?: string;
  fechaCotizacion?: Date;
  observaciones?: string | null;
}

/**
 * EditarItemCompraUseCase — edita los campos de solicitud de un ítem de
 * compra existente (§4.2/§4.4, PR-15).
 *
 * El congelamiento (S13: `cantidad`/`monto`/`moneda` bloqueados con el ítem
 * APROBADO **o** RECHAZADO) y los campos libres (S14: `descripcion`/
 * `proveedor`/`fechaCotizacion`/`observaciones` siempre editables) YA están
 * resueltos en `ItemCompraEntity.actualizar()` (ADR-C3) — este caso de uso
 * NO re-implementa esa regla, sólo la invoca a través de
 * `CompraEntity.editarItem()` (que además valida S5: compra cancelada, y
 * que el ítem pertenezca al agregado).
 *
 * Flujo:
 * 1. Carga la compra CON sus ítems. Si no existe o está soft-deleted →
 *    `CompraNoEncontradaError` (404).
 * 2. Invoca `compra.editarItem(itemId, datos)` — puede fallar con
 *    `CompraCanceladaError` (S5), `ItemCompraNoEncontradoError`, o
 *    `ItemCompraCongeladoError` (S13). El guard corre ANTES de abrir la
 *    transacción: si falla, `txRunner.run` NUNCA se invoca, así que
 *    `RegistrarOperacionCompra.registrar()` queda en 0 llamadas de forma
 *    estructural (corolario de S36/S35: una mutación rechazada no es un
 *    evento del timeline).
 * 3. Si la edición fue exitosa, **dentro de la misma transacción**
 *    (`ITenantTransactionRunner.run`): persiste la cabecera (`touch()` de
 *    `CompraEntity`, ADR-C2 — `guardar()` sólo persiste campos de cabecera)
 *    y el ítem editado, y registra EXACTAMENTE 1 `OperacionCompra` de tipo
 *    `ITEM_EDITADO` (S35).
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.2 (S12-S14), §4.4, §4.10
 * (S35). Ref design: ADR-C2, ADR-C3, ADR-C4. Tarea: PR-15.
 */
export class EditarItemCompraUseCase {
  constructor(
    private readonly compraRepo: Pick<
      ICompraRepository,
      'findByIdConItems' | 'guardar' | 'guardarItem'
    >,
    private readonly registrarOperacion: RegistrarOperacionCompra,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: EditarItemCompraDto): Promise<Result<ItemCompraEntity, DomainError>> {
    const compra = await this.compraRepo.findByIdConItems(dto.compraId);
    if (!compra || compra.isDeleted()) {
      return Result.fail(new CompraNoEncontradaError(dto.compraId));
    }

    const resultadoEdicion = compra.editarItem(dto.itemId, {
      descripcion: dto.descripcion,
      cantidad: dto.cantidad,
      proveedor: dto.proveedor,
      monto: dto.monto,
      moneda: dto.moneda,
      fechaCotizacion: dto.fechaCotizacion,
      observaciones: dto.observaciones,
    });
    if (resultadoEdicion.isFail()) {
      return Result.fail(resultadoEdicion.getError());
    }

    const item = compra.items.find((i) => i.id === dto.itemId);
    if (!item) {
      // Invariante: compra.editarItem() ya devolvió Result.ok, así que el
      // ítem existe en el agregado. Si esto se dispara, es un bug de
      // CompraEntity, no un camino de negocio a modelar con Result.
      throw new Error(
        `EditarItemCompraUseCase: invariante violado — editarItem() tuvo éxito pero el ítem "${dto.itemId}" no aparece en compra.items.`,
      );
    }

    await this.txRunner.run(async () => {
      await this.compraRepo.guardar(compra);
      await this.compraRepo.guardarItem(item);
      await this.registrarOperacion.registrar({
        compraId: compra.id,
        itemCompraId: item.id,
        tipo: 'ITEM_EDITADO',
        usuarioId: dto.usuarioId,
        detalle: `Ítem "${item.descripcion}" editado.`,
        datos: null,
      });
    });

    return Result.ok(item);
  }
}
