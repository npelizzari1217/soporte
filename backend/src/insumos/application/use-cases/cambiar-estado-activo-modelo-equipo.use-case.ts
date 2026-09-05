import { DomainError, Result } from '../../../shared/domain/result';
import { ModeloEquipoEntity } from '../../domain/entities/modelo-equipo.entity';
import { ModeloEquipoNoEncontradoError } from '../../domain/errors/modelos-equipo.errors';
import { IModeloEquipoRepository } from '../../domain/ports/i-modelo-equipo.repository';

/** DTO de entrada de `CambiarEstadoActivoModeloEquipoUseCase`. */
export interface CambiarEstadoActivoModeloEquipoDto {
  id: string;
  /** `false` = deshabilitar (el modelo sigue en el listado). `true` = volver a habilitar. */
  activo: boolean;
}

/**
 * CambiarEstadoActivoModeloEquipoUseCase — habilita o deshabilita un modelo.
 *
 * Deshabilitar NO elimina ni oculta: el modelo sigue en el listado con
 * `activo: false`, que es de donde el administrador saca el id para volver a
 * habilitarlo. Tampoco rompe los equipos ni las filas de compatibilidad que lo
 * referencian — no hay borrado físico posible mientras esté en uso.
 */
export class CambiarEstadoActivoModeloEquipoUseCase {
  constructor(private readonly modeloRepo: Pick<IModeloEquipoRepository, 'findById' | 'save'>) {}

  /**
   * @param dto Id del modelo y estado deseado.
   * @returns El modelo con su nuevo estado, o `ModeloEquipoNoEncontradoError`
   *   si el id no existe.
   */
  async execute(
    dto: CambiarEstadoActivoModeloEquipoDto,
  ): Promise<Result<ModeloEquipoEntity, DomainError>> {
    const entidad = await this.modeloRepo.findById(dto.id);
    if (!entidad) {
      return Result.fail(new ModeloEquipoNoEncontradoError(dto.id));
    }

    if (dto.activo) {
      entidad.activar();
    } else {
      entidad.desactivar();
    }

    await this.modeloRepo.save(entidad);

    return Result.ok(entidad);
  }
}
