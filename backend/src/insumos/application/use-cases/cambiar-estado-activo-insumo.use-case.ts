import { DomainError, Result } from '../../../shared/domain/result';
import { InsumoEntity } from '../../domain/entities/insumo.entity';
import { InsumoNoEncontradoError } from '../../domain/errors/insumos.errors';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';

/** DTO de entrada de `CambiarEstadoActivoInsumoUseCase`. */
export interface CambiarEstadoActivoInsumoDto {
  id: string;
  /** `false` = deshabilitar (el insumo sigue en el listado). `true` = volver a habilitar. */
  activo: boolean;
}

/**
 * CambiarEstadoActivoInsumoUseCase — habilita o deshabilita un insumo del
 * catálogo del tenant.
 *
 * Deshabilitar NO elimina ni oculta: el insumo sigue en el listado con
 * `activo: false`, que es de donde el administrador saca el id para volver a
 * habilitarlo. Tampoco libera su `codigo` —`insumos_codigo_key` no es un índice
 * parcial— ni rompe lo que ya lo referencia.
 */
export class CambiarEstadoActivoInsumoUseCase {
  constructor(private readonly insumoRepo: Pick<IInsumoRepository, 'findById' | 'save'>) {}

  /**
   * @param dto Id del insumo y estado deseado.
   * @returns El insumo con su nuevo estado, o `InsumoNoEncontradoError` si el
   *   id no existe en el catálogo del tenant.
   */
  async execute(dto: CambiarEstadoActivoInsumoDto): Promise<Result<InsumoEntity, DomainError>> {
    const insumo = await this.insumoRepo.findById(dto.id);
    if (!insumo) {
      return Result.fail(new InsumoNoEncontradoError(dto.id));
    }

    if (dto.activo) {
      insumo.activar();
    } else {
      insumo.desactivar();
    }

    await this.insumoRepo.save(insumo);

    return Result.ok(insumo);
  }
}
