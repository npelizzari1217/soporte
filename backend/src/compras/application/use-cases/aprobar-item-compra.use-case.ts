import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import {
  CompraCanceladaError,
  CompraNoEncontradaError,
  ItemCompraNoEncontradoError,
} from '../../domain/errors/compras.errors';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import { RegistrarOperacionCompra } from '../services/registrar-operacion-compra';

/** DTO de entrada para aprobar un ítem de compra (§4.3, S8). */
export interface AprobarItemCompraDto {
  compraId: string;
  itemId: string;
  /**
   * Usuario que decide — `JWT.sub` del actor con permiso `compra:aprobar`.
   * S11 (`compra:gestionar` sin `compra:aprobar` -> 403) es RBAC de guard,
   * resuelto en el controller (PR-21) — este caso de uso no lo valida.
   */
  usuarioId: string;
}

/**
 * AprobarItemCompraUseCase — aprueba un ítem de compra (§4.3, S8).
 *
 * SEPARADO de `RechazarItemCompraUseCase` (no unificados en un
 * `DecidirItem`) — precedente del módulo actual, fijado por el design.
 *
 * Flujo:
 * 1. Carga la compra CON sus ítems -> `CompraNoEncontradaError` si no existe.
 * 2. Busca el ítem ACTIVO (no soft-deleted) dentro del agregado ->
 *    `ItemCompraNoEncontradoError` si no está.
 * 3. `item.aprobar(usuarioId)` — máquina de un solo paso (S10): si el ítem
 *    ya fue decidido (APROBADO o RECHAZADO), retorna
 *    `ItemCompraYaDecididoError` SIN mutar ningún campo (garantía de la
 *    entidad, ver `ItemCompraEntity.decidir`) y SIN entrar a la
 *    transacción — ni `guardarItem` ni la bitácora se llaman. Una decisión
 *    rechazada no es un evento del timeline.
 * 4. Si la decisión es válida: DENTRO de la transacción
 *    (`ITenantTransactionRunner.run`), persiste el ítem y registra la
 *    operación `ITEM_APROBADO` (S35: exactamente 1 por mutación exitosa).
 *
 * NO existe "aprobar la compra": el estado de la cabecera es 100% derivado
 * (`derivarEstadoCompra`, ADR-C1) — este caso de uso jamás toca `CompraEntity`
 * más que para localizar el ítem y leer `canceladaEn`, y no persiste la
 * cabecera.
 *
 * Guarda de "compra cancelada" (hueco de spec resuelto por el maintainer):
 * §4.2 (S5) SÍ reserva esa combinación para el ABM de ítems, pero §4.3
 * nunca lo dijo para S8/S10 — PR-16 documentó esa ausencia como
 * intencional, y el maintainer la cerró para eliminar la asimetría (no
 * podías editar/eliminar un ítem de una compra cancelada, pero SÍ
 * aprobarlo/rechazarlo). El guard lee `compra.canceladaEn` (getter público
 * ya existente) y corre ANTES de decidir el ítem y ANTES de abrir la
 * transacción — no requiere tocar `CompraEntity`: `asegurarNoCancelada()`
 * es privado y exclusivo del ABM (`agregarItem`/`editarItem`/
 * `eliminarItem`), y este caso de uso nunca llamó a esos métodos.
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.2 (S5), §4.3 (S8, S10),
 * §4.10 (S35). Ref design: ADR-C2, ADR-C4, ADR-C6. Tarea: PR-16 + guard de
 * remediación (compra cancelada en decisión por ítem).
 */
export class AprobarItemCompraUseCase {
  constructor(
    private readonly compraRepo: Pick<ICompraRepository, 'findByIdConItems' | 'guardarItem'>,
    private readonly registrarOperacionCompra: Pick<RegistrarOperacionCompra, 'registrar'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
  ) {}

  async execute(dto: AprobarItemCompraDto): Promise<Result<ItemCompraEntity, DomainError>> {
    const compra = await this.compraRepo.findByIdConItems(dto.compraId);
    if (!compra) {
      return Result.fail(new CompraNoEncontradaError(dto.compraId));
    }

    if (compra.canceladaEn !== null) {
      return Result.fail(new CompraCanceladaError(compra.id));
    }

    const item = compra.items.find((i) => i.id === dto.itemId && !i.isDeleted());
    if (!item) {
      return Result.fail(new ItemCompraNoEncontradoError(dto.itemId));
    }

    const decision = item.aprobar(dto.usuarioId);
    if (decision.isFail()) {
      return Result.fail(decision.getError());
    }

    await this.txRunner.run(async () => {
      await this.compraRepo.guardarItem(item);
      await this.registrarOperacionCompra.registrar({
        compraId: dto.compraId,
        itemCompraId: item.id,
        tipo: 'ITEM_APROBADO',
        usuarioId: dto.usuarioId,
        detalle: `Ítem "${item.descripcion}" aprobado.`,
        datos: null,
      });
    });

    return Result.ok(item);
  }
}
