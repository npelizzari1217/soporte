import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import { RegistrarOperacionCompra } from '../services/registrar-operacion-compra';
import {
  CompraNoEncontradaError,
  ItemCompraNoEncontradoError,
} from '../../domain/errors/compras.errors';

/**
 * DTO de entrada de `RegistrarCompraDeItemUseCase`. `cantidadComprada` es el
 * ACUMULADO total, no un delta (spec §4.5) — `ItemCompraEntity.registrarCompra()`
 * es quien interpreta ese contrato.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.5 (S15-S18).
 */
export interface RegistrarCompraDeItemDto {
  compraId: string;
  itemId: string;
  /** Actor que registra el avance (`JWT.sub`) — autor de la operación de bitácora. */
  usuarioId: string;
  cantidadComprada: number;
}

/**
 * RegistrarCompraDeItemUseCase — registra el acumulado de cantidad comprada
 * de un ítem aprobado (§4.5, S15-S18).
 *
 * Flujo — TODO dentro de la MISMA transacción (`ITenantTransactionRunner.run`,
 * regla transversal de la Fase D, patrón de `AgregarItemCompraUseCase`):
 * 1. Carga el agregado completo (`findByIdConItems`) — 404
 *    (`CompraNoEncontradaError`) si no existe o está soft-deleted.
 * 2. Busca el ítem ACTIVO (no soft-deleted) dentro del agregado ->
 *    `ItemCompraNoEncontradoError` si no está.
 * 3. `item.registrarCompra(cantidadComprada)` (ADR-C1/ADR-C3): la
 *    terminalidad (S25), "no aprobado" (S16), exceso (S17) y retroceso (S18)
 *    YA están resueltos en `ItemCompraEntity` con aritmética en centésimas —
 *    este caso de uso NO reimplementa esa lógica, solo traduce el `Result`.
 *    Si falla, ni `guardarItem` ni la bitácora se llaman (corolario de S35:
 *    una mutación rechazada no es un evento del timeline).
 * 4. Si la mutación fue exitosa: persiste el ítem y registra EXACTAMENTE 1
 *    `OperacionCompra{COMPRA_REGISTRADA}` (S35) — si `registrar()` lanza,
 *    `txRunner.run` revierte TODO (S36, ADR-C4).
 *
 * No persiste la cabecera (`Compra`): a diferencia del ABM de ítems, esta
 * mutación corre directamente sobre `ItemCompraEntity` y no pasa por
 * `CompraEntity.agregarItem()`/`editarItem()`/`eliminarItem()`, así que la
 * cabecera nunca se toca (mismo criterio que `AprobarItemCompraUseCase`).
 *
 * No hay guarda de "compra cancelada": la spec (§4.5) no reserva esa
 * combinación para S15-S18 y `CompraEntity` no expone un método de
 * ejecución que la aplique — este caso de uso no inventa una regla que la
 * spec no pide.
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.5 (S15-S18), §4.10 (S35).
 * Ref design: ADR-C1, ADR-C2, ADR-C3, ADR-C4. Tarea: PR-17.
 */
export class RegistrarCompraDeItemUseCase {
  constructor(
    private readonly compraRepo: Pick<ICompraRepository, 'findByIdConItems' | 'guardarItem'>,
    private readonly registrarOperacion: Pick<RegistrarOperacionCompra, 'registrar'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
  ) {}

  async execute(dto: RegistrarCompraDeItemDto): Promise<Result<ItemCompraEntity, DomainError>> {
    return this.txRunner.run(async () => {
      const compra = await this.compraRepo.findByIdConItems(dto.compraId);
      if (!compra || compra.isDeleted()) {
        return Result.fail<ItemCompraEntity, DomainError>(
          new CompraNoEncontradaError(dto.compraId),
        );
      }

      const item = compra.items.find((i) => i.id === dto.itemId && !i.isDeleted());
      if (!item) {
        return Result.fail<ItemCompraEntity, DomainError>(
          new ItemCompraNoEncontradoError(dto.itemId),
        );
      }

      const registrarResult = item.registrarCompra(dto.cantidadComprada);
      if (registrarResult.isFail()) {
        return Result.fail<ItemCompraEntity, DomainError>(registrarResult.getError());
      }

      await this.compraRepo.guardarItem(item);
      await this.registrarOperacion.registrar({
        compraId: compra.id,
        itemCompraId: item.id,
        tipo: 'COMPRA_REGISTRADA',
        usuarioId: dto.usuarioId,
        detalle: `Compra registrada para el ítem "${item.descripcion}": acumulado ${dto.cantidadComprada}.`,
        datos: null,
      });

      return Result.ok<ItemCompraEntity, DomainError>(item);
    });
  }
}
