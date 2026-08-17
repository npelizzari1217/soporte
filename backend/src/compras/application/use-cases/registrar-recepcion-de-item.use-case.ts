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
 * DTO de entrada de `RegistrarRecepcionDeItemUseCase`. `cantidadRecibida` es
 * el ACUMULADO total, no un delta (spec R1/§4.5) —
 * `ItemCompraEntity.registrarRecepcion()` es quien interpreta ese contrato.
 * `fecha` es opcional (R4/S51): sin ella, la entidad prellena con hoy
 * (Argentina).
 *
 * **Renombrado** (WU-23, `compras-tres-etapas-y-sectores`): reemplaza a
 * `RegistrarCompraDeItemDto`/`RegistrarCompraDeItemUseCase`. "Recibida" es
 * la segunda de las TRES etapas — antes era la primera ("comprada").
 */
export interface RegistrarRecepcionDeItemDto {
  compraId: string;
  itemId: string;
  /** Actor que registra el avance (`JWT.sub`) — autor de la operación de bitácora. */
  usuarioId: string;
  cantidadRecibida: number;
  fecha?: Date;
}

/**
 * RegistrarRecepcionDeItemUseCase — registra el acumulado de cantidad
 * recibida de un ítem con orden emitida (R1/R2, S42-S44, S46).
 *
 * Flujo idéntico al resto de las etapas (ver
 * `RegistrarOrdenDeItemUseCase`/`RegistrarEntregaDeItemUseCase`): carga el
 * agregado, guard de compra cancelada ANTES de la transacción, busca el
 * ítem activo, delega en `ItemCompraEntity.registrarRecepcion()` (que YA
 * resuelve terminalidad/aprobado/exceso/retroceso/fecha — este caso de uso
 * NO reimplementa esa lógica), y si es exitosa persiste + registra
 * `OperacionCompra{RECEPCION_REGISTRADA}` (S35) dentro de la misma
 * transacción.
 *
 * Ref spec: sdd/compras-tres-etapas-y-sectores/spec R1, R2, R4 (S42-S44,
 * S46, S51). Ref design: ADR-T1, ADR-T11.
 */
export class RegistrarRecepcionDeItemUseCase {
  constructor(
    private readonly compraRepo: Pick<ICompraRepository, 'findByIdConItems' | 'guardarItem'>,
    private readonly registrarOperacion: Pick<RegistrarOperacionCompra, 'registrar'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
  ) {}

  async execute(dto: RegistrarRecepcionDeItemDto): Promise<Result<ItemCompraEntity, DomainError>> {
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
        ? item.registrarRecepcion(dto.cantidadRecibida, dto.fecha)
        : item.registrarRecepcion(dto.cantidadRecibida);
    if (registrarResult.isFail()) {
      return Result.fail(registrarResult.getError());
    }

    await this.txRunner.run(async () => {
      await this.compraRepo.guardarItem(item);
      await this.registrarOperacion.registrar({
        compraId: compra.id,
        itemCompraId: item.id,
        tipo: 'RECEPCION_REGISTRADA',
        usuarioId: dto.usuarioId,
        detalle: `Recepción registrada para el ítem "${item.descripcion}": acumulado ${dto.cantidadRecibida}.`,
        datos: null,
      });
    });

    return Result.ok(item);
  }
}
