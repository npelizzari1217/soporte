import { DomainError, Result } from '../../../shared/domain/result';
import { UnidadMedidaEntity } from '../../domain/entities/unidad-medida.entity';
import { UnidadMedidaNoEncontradaError } from '../../domain/errors/unidades-medida.errors';
import { IUnidadMedidaRepository } from '../../domain/ports/i-unidad-medida.repository';

/** DTO de entrada de `CambiarEstadoActivoUnidadMedidaUseCase`. */
export interface CambiarEstadoActivoUnidadMedidaDto {
  id: string;
  /** `false` = deshabilitar (la unidad sigue en el listado). `true` = volver a habilitar. */
  activo: boolean;
}

/**
 * CambiarEstadoActivoUnidadMedidaUseCase — habilita o deshabilita una unidad.
 *
 * Deshabilitar NO elimina ni oculta: la unidad sigue en el listado con
 * `activo: false`, que es de donde el administrador saca el id para volver a
 * habilitarla. Tampoco rompe los insumos que la referencian — la FK es
 * `ON DELETE RESTRICT`, no hay borrado físico posible mientras esté en uso.
 */
export class CambiarEstadoActivoUnidadMedidaUseCase {
  constructor(private readonly unidadRepo: Pick<IUnidadMedidaRepository, 'findById' | 'save'>) {}

  /**
   * @param dto Id de la unidad y estado deseado.
   * @returns La unidad con su nuevo estado, o `UnidadMedidaNoEncontradaError`
   *   si el id no existe.
   */
  async execute(
    dto: CambiarEstadoActivoUnidadMedidaDto,
  ): Promise<Result<UnidadMedidaEntity, DomainError>> {
    const unidad = await this.unidadRepo.findById(dto.id);
    if (!unidad) {
      return Result.fail(new UnidadMedidaNoEncontradaError(dto.id));
    }

    if (dto.activo) {
      unidad.activar();
    } else {
      unidad.desactivar();
    }

    await this.unidadRepo.save(unidad);

    return Result.ok(unidad);
  }
}
