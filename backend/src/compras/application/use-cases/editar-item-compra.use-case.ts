import { DomainError, Result } from '../../../shared/domain/result';
import { esElMismoId } from '../../../shared/domain/identidad-uuid';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import { CompraNoEncontradaError } from '../../domain/errors/compras.errors';
import { RegistrarOperacionCompra } from '../services/registrar-operacion-compra';
import {
  LectorCatalogoInsumos,
  validarInsumoElegible,
} from '../../../insumos/application/services/validar-insumo.service';

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
  /**
   * Insumo del catálogo, con las TRES posibilidades del PATCH distinguidas:
   * ausente no toca el vínculo, un id lo asigna o lo cambia, y un `null`
   * EXPLÍCITO lo borra (insumos-entrega-3).
   */
  insumoId?: string | null;
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
 * ## El `insumoId`, y por qué se verifica DESPUÉS de la entidad
 *
 * `insumoId` es el tercer grupo de campos: no lo alcanza el congelamiento y
 * tiene su propio guard de dominio (`asegurarInsumoReasignable`, decisión 5 del
 * diseño de la Entrega 3), que bloquea el cambio en cuanto el ítem recibió
 * mercadería. Este caso de uso agrega una sola cosa: que el id NUEVO exista de
 * verdad en el catálogo, con `validarInsumoElegible` de `insumos` —la función
 * que además sabe que la baja lógica cuenta como inexistencia, un caso que la
 * FK no puede atrapar porque la fila sigue estando—.
 *
 * El ORDEN es una decisión, no una casualidad. La verificación de catálogo
 * corre DESPUÉS de `compra.editarItem()`, es decir después de los guards del
 * dominio, por dos razones:
 *
 * 1. **El guard de reasignación tiene que ganar.** Si el ítem ya recibió, el
 *    cambio está prohibido cualquiera sea el id nuevo; contestar "ese insumo no
 *    existe" mandaría a corregir el dato equivocado.
 * 2. **Solo se verifica lo que cambia.** El formulario reenvía el shape
 *    completo, así que toda edición incluye el insumo que el ítem ya tenía;
 *    revalidarlo convertiría una baja del catálogo en una trampa —quedaría sin
 *    poder editarse ni la descripción de esos ítems—. Es el mismo criterio con
 *    el que `resolverCompatibilidad` no revalida los modelos ya declarados.
 *
 * Que la entidad se haya mutado en memoria antes del rechazo no persiste nada:
 * el `Result.fail` sale ANTES de abrir la transacción, y el caller descarta el
 * agregado —mismo criterio que `RegistrarRecepcionDeItemUseCase` documenta para
 * su rollback—.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.2 (S12-S14), §4.4, §4.10
 * (S35). Ref design: ADR-C2, ADR-C3, ADR-C4;
 * openspec/changes/insumos-entrega-3/design.md, decisión 5. Tarea: PR-15.
 */
export class EditarItemCompraUseCase {
  constructor(
    private readonly compraRepo: Pick<
      ICompraRepository,
      'findByIdConItems' | 'guardar' | 'guardarItem'
    >,
    private readonly catalogoInsumos: LectorCatalogoInsumos,
    private readonly registrarOperacion: RegistrarOperacionCompra,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: EditarItemCompraDto): Promise<Result<ItemCompraEntity, DomainError>> {
    const compra = await this.compraRepo.findByIdConItems(dto.compraId);
    if (!compra || compra.isDeleted()) {
      return Result.fail(new CompraNoEncontradaError(dto.compraId));
    }

    // El insumo que el ítem tenía ANTES de editar: es lo que distingue un
    // cambio real de un reenvío del mismo valor. Después de `editarItem()` ya
    // se perdió.
    const insumoIdPrevio =
      compra.items.find((i) => i.id === dto.itemId && !i.isDeleted())?.insumoId ?? null;

    const resultadoEdicion = compra.editarItem(dto.itemId, {
      descripcion: dto.descripcion,
      insumoId: dto.insumoId,
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

    // Solo el id NUEVO y no nulo se verifica contra el catálogo: borrar el
    // vínculo no tiene nada que verificar, y revalidar el que ya estaba
    // trabaría la edición de un ítem cuyo insumo se dio de baja después.
    //
    // La igualdad se pregunta con `esElMismoId`, el mismo que usa la guarda de
    // reasignación de la entidad. La columna es `uuid`: para Postgres `9F1B…` y
    // `9f1b…` son la misma fila, y comparando en crudo un reenvío con otra
    // capitalización se lee como un cambio. Es UNA sola función y no dos
    // comparaciones parecidas a propósito: la entidad decide primero y con un
    // 422, así que si las dos no responden igual, la que gobierna es la que no
    // se normalizó.
    if (dto.insumoId != null && !esElMismoId(dto.insumoId, insumoIdPrevio)) {
      const elegible = await validarInsumoElegible(this.catalogoInsumos, dto.insumoId);
      if (elegible.isFail()) {
        return Result.fail(elegible.getError());
      }
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
