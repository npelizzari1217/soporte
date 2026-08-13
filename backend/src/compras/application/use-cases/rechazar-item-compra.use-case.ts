import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import {
  CompraNoEncontradaError,
  ItemCompraNoEncontradoError,
} from '../../domain/errors/compras.errors';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import { RegistrarOperacionCompra } from '../services/registrar-operacion-compra';

/** DTO de entrada para rechazar un ítem de compra (§4.3, S9). */
export interface RechazarItemCompraDto {
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
 * RechazarItemCompraUseCase — rechaza un ítem de compra (§4.3, S9).
 *
 * SEPARADO de `AprobarItemCompraUseCase` (no unificados en un
 * `DecidirItem`) — precedente del módulo actual, fijado por el design.
 *
 * Flujo:
 * 1. Carga la compra CON sus ítems -> `CompraNoEncontradaError` si no existe.
 * 2. Busca el ítem ACTIVO (no soft-deleted) dentro del agregado ->
 *    `ItemCompraNoEncontradoError` si no está.
 * 3. `item.rechazar(usuarioId)` — máquina de un solo paso (S10): si el ítem
 *    ya fue decidido (APROBADO o RECHAZADO), retorna
 *    `ItemCompraYaDecididoError` SIN mutar ningún campo (garantía de la
 *    entidad, ver `ItemCompraEntity.decidir`) y SIN entrar a la
 *    transacción — ni `guardarItem` ni la bitácora se llaman. Una decisión
 *    rechazada no es un evento del timeline.
 * 4. Si la decisión es válida: DENTRO de la transacción
 *    (`ITenantTransactionRunner.run`), persiste el ítem y registra la
 *    operación `ITEM_RECHAZADO` (S35: exactamente 1 por mutación exitosa).
 *
 * Los campos escritos son `decididoPorId`/`decididoEn` (ADR-C6, rename
 * declarado en design) — nombres neutros porque también se escriben en el
 * RECHAZO: `aprobadoPorId`/`aprobadoEn` mentirían sobre una fila RECHAZADO.
 *
 * NO existe "rechazar la compra": el estado de la cabecera es 100% derivado
 * (`derivarEstadoCompra`, ADR-C1) — este caso de uso jamás toca `CompraEntity`
 * más que para localizar el ítem, y no persiste la cabecera.
 *
 * No hay guarda de "compra cancelada" (a diferencia del ABM de ítems, S5):
 * la spec (§4.3) no reserva esa combinación para S9/S10, y `CompraEntity`
 * no expone un método de decisión que la aplique — este caso de uso no
 * inventa una regla que la spec no pide.
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.3 (S9, S10), §4.10 (S35).
 * Ref design: ADR-C2, ADR-C4, ADR-C6. Tarea: PR-16.
 */
export class RechazarItemCompraUseCase {
  constructor(
    private readonly compraRepo: Pick<ICompraRepository, 'findByIdConItems' | 'guardarItem'>,
    private readonly registrarOperacionCompra: Pick<RegistrarOperacionCompra, 'registrar'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
  ) {}

  async execute(dto: RechazarItemCompraDto): Promise<Result<ItemCompraEntity, DomainError>> {
    const compra = await this.compraRepo.findByIdConItems(dto.compraId);
    if (!compra) {
      return Result.fail(new CompraNoEncontradaError(dto.compraId));
    }

    const item = compra.items.find((i) => i.id === dto.itemId && !i.isDeleted());
    if (!item) {
      return Result.fail(new ItemCompraNoEncontradoError(dto.itemId));
    }

    const decision = item.rechazar(dto.usuarioId);
    if (decision.isFail()) {
      return Result.fail(decision.getError());
    }

    await this.txRunner.run(async () => {
      await this.compraRepo.guardarItem(item);
      await this.registrarOperacionCompra.registrar({
        compraId: dto.compraId,
        itemCompraId: item.id,
        tipo: 'ITEM_RECHAZADO',
        usuarioId: dto.usuarioId,
        detalle: `Ítem "${item.descripcion}" rechazado.`,
        datos: null,
      });
    });

    return Result.ok(item);
  }
}
