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
 * DTO de entrada de `RegistrarOrdenDeItemUseCase`. `cantidadOrdenada` es el
 * ACUMULADO total, no un delta (R1/§4.5) —
 * `ItemCompraEntity.registrarOrden()` es quien interpreta ese contrato.
 * `fecha` es opcional (R4/S51): sin ella, la entidad prellena con hoy
 * (Argentina).
 *
 * **Nuevo** (WU-23, `compras-tres-etapas-y-sectores`): PRIMERA de las tres
 * etapas — espejo de `RegistrarRecepcionDeItemDto`/`RegistrarEntregaDeItemDto`.
 */
export interface RegistrarOrdenDeItemDto {
  compraId: string;
  itemId: string;
  /** Actor que registra el avance (`JWT.sub`) — autor de la operación de bitácora. */
  usuarioId: string;
  cantidadOrdenada: number;
  fecha?: Date;
}

/**
 * RegistrarOrdenDeItemUseCase — registra el acumulado de cantidad ordenada
 * de un ítem aprobado (R1/R2, S42, S45-S47).
 *
 * Flujo idéntico al resto de las etapas (mismo patrón que
 * `RegistrarRecepcionDeItemUseCase`/`RegistrarEntregaDeItemUseCase`): carga
 * el agregado, guard de compra cancelada ANTES de la transacción, busca el
 * ítem activo, delega en `ItemCompraEntity.registrarOrden()` (que YA
 * resuelve terminalidad/aprobado/exceso/retroceso/fecha), y si es exitosa
 * persiste + registra `OperacionCompra{ORDEN_REGISTRADA}` (S35) dentro de la
 * misma transacción.
 *
 * Ref spec: sdd/compras-tres-etapas-y-sectores/spec R1, R2, R4 (S42, S45-S47,
 * S51). Ref design: ADR-T1, ADR-T11.
 */
export class RegistrarOrdenDeItemUseCase {
  constructor(
    private readonly compraRepo: Pick<ICompraRepository, 'findByIdConItems' | 'guardarItem'>,
    private readonly registrarOperacion: Pick<RegistrarOperacionCompra, 'registrar'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
  ) {}

  async execute(dto: RegistrarOrdenDeItemDto): Promise<Result<ItemCompraEntity, DomainError>> {
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
        ? item.registrarOrden(dto.cantidadOrdenada, dto.fecha)
        : item.registrarOrden(dto.cantidadOrdenada);
    if (registrarResult.isFail()) {
      return Result.fail(registrarResult.getError());
    }

    await this.txRunner.run(async () => {
      await this.compraRepo.guardarItem(item);
      await this.registrarOperacion.registrar({
        compraId: compra.id,
        itemCompraId: item.id,
        tipo: 'ORDEN_REGISTRADA',
        usuarioId: dto.usuarioId,
        detalle: `Orden registrada para el ítem "${item.descripcion}": acumulado ${dto.cantidadOrdenada}.`,
        datos: null,
      });
    });

    return Result.ok(item);
  }
}
