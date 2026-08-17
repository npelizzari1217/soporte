import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { EtapaEjecucion, ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import { RegistrarOperacionCompra } from '../services/registrar-operacion-compra';
import {
  CompraCanceladaError,
  CompraNoEncontradaError,
  ItemCompraNoEncontradoError,
} from '../../domain/errors/compras.errors';

/** DTO de entrada de `EditarFechaEtapaDeItemUseCase` (R4/S55). */
export interface EditarFechaEtapaDeItemDto {
  compraId: string;
  itemId: string;
  /** Actor que edita la fecha (`JWT.sub`) — autor de la operación de bitácora. */
  usuarioId: string;
  etapa: EtapaEjecucion;
  fecha: Date;
}

/**
 * EditarFechaEtapaDeItemUseCase — edita la fecha de una etapa YA registrada,
 * de forma independiente de su cantidad (R4/S55, `compras-tres-etapas-y-sectores`).
 *
 * S55 YA está resuelto en `ItemCompraEntity.editarFechaEtapa()` (validación
 * de futuro + orden cronológico, rechazo COMPLETO sin persistir el valor
 * inconsistente) — este caso de uso NO reimplementa esa lógica.
 *
 * Bitácora: `ITEM_EDITADO` (no hace falta un tipo nuevo — es una edición de
 * dato, no el registro de una etapa nueva; ADR-T11 no lista un tipo propio
 * para esto).
 *
 * Flujo: carga el agregado, guard de compra cancelada ANTES de la
 * transacción, busca el ítem activo, delega en la entidad, y si es exitosa
 * persiste + registra bitácora (S35) dentro de la misma transacción.
 *
 * Ref spec: sdd/compras-tres-etapas-y-sectores/spec R4 (S55). Ref design:
 * ADR-T1.
 */
export class EditarFechaEtapaDeItemUseCase {
  constructor(
    private readonly compraRepo: Pick<ICompraRepository, 'findByIdConItems' | 'guardarItem'>,
    private readonly registrarOperacion: Pick<RegistrarOperacionCompra, 'registrar'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
  ) {}

  async execute(dto: EditarFechaEtapaDeItemDto): Promise<Result<ItemCompraEntity, DomainError>> {
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

    const editarResult = item.editarFechaEtapa(dto.etapa, dto.fecha);
    if (editarResult.isFail()) {
      return Result.fail(editarResult.getError());
    }

    await this.txRunner.run(async () => {
      await this.compraRepo.guardarItem(item);
      await this.registrarOperacion.registrar({
        compraId: compra.id,
        itemCompraId: item.id,
        tipo: 'ITEM_EDITADO',
        usuarioId: dto.usuarioId,
        detalle: `Fecha de etapa ${dto.etapa} editada para el ítem "${item.descripcion}".`,
        datos: null,
      });
    });

    return Result.ok(item);
  }
}
