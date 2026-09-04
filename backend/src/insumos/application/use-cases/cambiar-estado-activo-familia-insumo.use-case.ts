import { DomainError, Result } from '../../../shared/domain/result';
import { FamiliaInsumoEntity } from '../../domain/entities/familia-insumo.entity';
import { FamiliaInsumoNoEncontradaError } from '../../domain/errors/familias-insumo.errors';
import { IFamiliaInsumoRepository } from '../../domain/ports/i-familia-insumo.repository';

/** DTO de entrada de `CambiarEstadoActivoFamiliaInsumoUseCase`. */
export interface CambiarEstadoActivoFamiliaInsumoDto {
  id: string;
  /** `false` = deshabilitar (la familia sigue en el listado). `true` = volver a habilitar. */
  activo: boolean;
}

/**
 * CambiarEstadoActivoFamiliaInsumoUseCase — habilita o deshabilita una familia.
 *
 * Deshabilitar NO elimina ni oculta: la familia sigue en el listado con
 * `activo: false`, que es de donde el administrador saca el id para volver a
 * habilitarla. Tampoco rompe los insumos que la referencian — la FK es
 * `ON DELETE RESTRICT`, no hay borrado físico posible mientras esté en uso.
 */
export class CambiarEstadoActivoFamiliaInsumoUseCase {
  constructor(private readonly familiaRepo: Pick<IFamiliaInsumoRepository, 'findById' | 'save'>) {}

  /**
   * @param dto Id de la familia y estado deseado.
   * @returns La familia con su nuevo estado, o
   *   `FamiliaInsumoNoEncontradaError` si el id no existe.
   */
  async execute(
    dto: CambiarEstadoActivoFamiliaInsumoDto,
  ): Promise<Result<FamiliaInsumoEntity, DomainError>> {
    const familia = await this.familiaRepo.findById(dto.id);
    if (!familia) {
      return Result.fail(new FamiliaInsumoNoEncontradaError(dto.id));
    }

    if (dto.activo) {
      familia.activar();
    } else {
      familia.desactivar();
    }

    await this.familiaRepo.save(familia);

    return Result.ok(familia);
  }
}
