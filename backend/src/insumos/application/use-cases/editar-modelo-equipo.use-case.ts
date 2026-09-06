import { DomainError, Result } from '../../../shared/domain/result';
import {
  ModeloEquipoEntity,
  normalizarMarcaModeloEquipo,
  normalizarModeloModeloEquipo,
} from '../../domain/entities/modelo-equipo.entity';
import {
  ModeloEquipoNoEncontradoError,
  ModeloEquipoDuplicadoError,
} from '../../domain/errors/modelos-equipo.errors';
import { IModeloEquipoRepository } from '../../domain/ports/i-modelo-equipo.repository';

/** DTO de entrada de `EditarModeloEquipoUseCase` — PATCH semántico. */
export interface EditarModeloEquipoDto {
  id: string;
  marca?: string;
  modelo?: string;
}

/**
 * EditarModeloEquipoUseCase — edita `marca`/`modelo` de un modelo existente.
 *
 * La revalidación de unicidad se hace sobre el PAR RESULTANTE, no sobre el
 * campo que llegó en el body: la unicidad es de la dupla, así que cambiar SOLO
 * la marca también puede chocar contra otra fila (mover "BROTHER M404" a
 * "HP M404"). Revalidando únicamente cuando cambia el `modelo`, ese caso
 * pasaría el chequeo de la aplicación y explotaría recién contra el UNIQUE de
 * Postgres, como un error de driver sin mensaje de negocio.
 *
 * La comparación "¿cambió el par?" se hace sobre los valores YA normalizados:
 * re-enviar `hp` sobre un modelo que ya es `HP` no es un cambio, y comparar el
 * crudo dispararía una revalidación que se encuentra a sí misma.
 */
export class EditarModeloEquipoUseCase {
  constructor(
    private readonly modeloRepo: Pick<
      IModeloEquipoRepository,
      'findById' | 'findByMarcaModelo' | 'save'
    >,
  ) {}

  /**
   * @param dto Id del modelo y campos a modificar (los ausentes no se tocan).
   * @returns El modelo editado, `ModeloEquipoNoEncontradoError` si el id no
   *   existe, o `ModeloEquipoDuplicadoError` si el par nuevo choca.
   */
  async execute(dto: EditarModeloEquipoDto): Promise<Result<ModeloEquipoEntity, DomainError>> {
    const entidad = await this.modeloRepo.findById(dto.id);
    if (!entidad) {
      return Result.fail(new ModeloEquipoNoEncontradoError(dto.id));
    }

    const marca = dto.marca === undefined ? undefined : normalizarMarcaModeloEquipo(dto.marca);
    const modelo = dto.modelo === undefined ? undefined : normalizarModeloModeloEquipo(dto.modelo);

    const marcaResultante = marca ?? entidad.marca;
    const modeloResultante = modelo ?? entidad.modelo;

    if (marcaResultante !== entidad.marca || modeloResultante !== entidad.modelo) {
      const existente = await this.modeloRepo.findByMarcaModelo(marcaResultante, modeloResultante);
      if (existente && existente.id !== entidad.id) {
        return Result.fail(new ModeloEquipoDuplicadoError(marcaResultante, modeloResultante));
      }
    }

    entidad.actualizar({ marca, modelo });
    await this.modeloRepo.save(entidad);

    return Result.ok(entidad);
  }
}
