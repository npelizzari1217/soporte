import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import { RegistrarOperacionCompra } from '../services/registrar-operacion-compra';
import {
  CompraCanceladaError,
  CompraNoEncontradaError,
  ItemCompraNoEncontradoError,
} from '../../domain/errors/compras.errors';

/**
 * DTO de entrada de `RegistrarEntregaDeItemUseCase`. `cantidadEntregada` es
 * el ACUMULADO total, no un delta (spec §4.6) — `ItemCompraEntity.registrarEntrega()`
 * es quien interpreta ese contrato.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.6 (S19-S21).
 */
export interface RegistrarEntregaDeItemDto {
  compraId: string;
  itemId: string;
  /** Actor que registra el avance (`JWT.sub`) — autor de la operación de bitácora. */
  usuarioId: string;
  cantidadEntregada: number;
  /** WU-23 (`compras-tres-etapas-y-sectores` R4/S51) — opcional: sin ella, la entidad prellena con hoy (Argentina). */
  fecha?: Date;
}

/**
 * RegistrarEntregaDeItemUseCase — registra el acumulado de cantidad
 * entregada de un ítem (§4.6, S19-S21).
 *
 * Flujo:
 * 1. Carga el agregado completo (`findByIdConItems`) — 404
 *    (`CompraNoEncontradaError`) si no existe o está soft-deleted.
 * 2. Guarda de "compra cancelada" (`compra.canceladaEn !== null`) ->
 *    `CompraCanceladaError`, ANTES de buscar el ítem y SIN entrar a la
 *    transacción. Guard de remediación (mismo criterio que
 *    `AprobarItemCompraUseCase`/`CerrarItemConFaltanteUseCase`/
 *    `RegistrarCompraDeItemUseCase`): S29 prohíbe cancelar una compra con
 *    algún ítem `cantidadComprada > 0`, pero si se pudiera REGISTRAR una
 *    entrega DESPUÉS de cancelar, se llegaría por la puerta de atrás
 *    exactamente al estado que S29 existe para impedir — el invariante
 *    quedaría burlado. No requiere tocar `CompraEntity`: `canceladaEn` es
 *    un getter público y `asegurarNoCancelada()` es privado y exclusivo del
 *    ABM (`agregarItem`/`editarItem`/`eliminarItem`).
 * 3. Busca el ítem ACTIVO (no soft-deleted) dentro del agregado ->
 *    `ItemCompraNoEncontradoError` si no está.
 * 4. `item.registrarEntrega(cantidadEntregada)` (ADR-C1/ADR-C3): la
 *    terminalidad (S25), exceso sobre lo comprado (S20) y retroceso (S21) YA
 *    están resueltos en `ItemCompraEntity` con aritmética en centésimas —
 *    este caso de uso NO reimplementa esa lógica, solo traduce el `Result`.
 *    Si falla, ni `guardarItem` ni la bitácora se llaman, y NO se abre la
 *    transacción (corolario de S35: una mutación rechazada no es un evento
 *    del timeline).
 * 5. Si la mutación fue exitosa: DENTRO de la transacción
 *    (`ITenantTransactionRunner.run`), persiste el ítem y registra
 *    EXACTAMENTE 1 `OperacionCompra{ENTREGA_REGISTRADA}` (S35) — si
 *    `registrar()` lanza, `txRunner.run` revierte TODO (S36, ADR-C4).
 *
 * No persiste la cabecera (`Compra`): a diferencia del ABM de ítems, esta
 * mutación corre directamente sobre `ItemCompraEntity` y no pasa por
 * `CompraEntity.agregarItem()`/`editarItem()`/`eliminarItem()`, así que la
 * cabecera nunca se toca (mismo criterio que `AprobarItemCompraUseCase` y
 * `RegistrarCompraDeItemUseCase`).
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.6 (S19-S21), §4.10 (S35).
 * Ref design: ADR-C1, ADR-C2, ADR-C3, ADR-C4. Tarea: PR-17 + guard de
 * remediación (compra cancelada en registro de entrega por ítem).
 */
export class RegistrarEntregaDeItemUseCase {
  constructor(
    private readonly compraRepo: Pick<ICompraRepository, 'findByIdConItems' | 'guardarItem'>,
    private readonly registrarOperacion: Pick<RegistrarOperacionCompra, 'registrar'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
  ) {}

  async execute(dto: RegistrarEntregaDeItemDto): Promise<Result<ItemCompraEntity, DomainError>> {
    const compra = await this.compraRepo.findByIdConItems(dto.compraId);
    if (!compra || compra.isDeleted()) {
      return Result.fail(new CompraNoEncontradaError(dto.compraId));
    }

    if (compra.canceladaEn !== null) {
      return Result.fail(new CompraCanceladaError(compra.id));
    }

    const item = compra.items.find((i) => i.id === dto.itemId && !i.isDeleted());
    if (!item) {
      return Result.fail(new ItemCompraNoEncontradoError(dto.itemId));
    }

    const registrarResult =
      dto.fecha !== undefined
        ? item.registrarEntrega(dto.cantidadEntregada, dto.fecha)
        : item.registrarEntrega(dto.cantidadEntregada);
    if (registrarResult.isFail()) {
      return Result.fail(registrarResult.getError());
    }

    await this.txRunner.run(async () => {
      await this.compraRepo.guardarItem(item);
      await this.registrarOperacion.registrar({
        compraId: compra.id,
        itemCompraId: item.id,
        tipo: 'ENTREGA_REGISTRADA',
        usuarioId: dto.usuarioId,
        detalle: `Entrega registrada para el ítem "${item.descripcion}": acumulado ${dto.cantidadEntregada}.`,
        datos: null,
      });
    });

    return Result.ok(item);
  }
}
