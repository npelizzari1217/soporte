import { DomainError, Result } from '../../../shared/domain/result';
import {
  ModeloEquipoEntity,
  normalizarMarcaModeloEquipo,
  normalizarModeloModeloEquipo,
} from '../../domain/entities/modelo-equipo.entity';
import { ModeloEquipoDuplicadoError } from '../../domain/errors/modelos-equipo.errors';
import { IModeloEquipoRepository } from '../../domain/ports/i-modelo-equipo.repository';

/** DTO de entrada de `CrearModeloEquipoUseCase`. */
export interface CrearModeloEquipoDto {
  marca: string;
  modelo: string;
}

/**
 * CrearModeloEquipoUseCase — alta de un modelo en el catálogo del tenant.
 *
 * Normaliza el PAR ANTES de buscar el duplicado y de persistir: el
 * `UNIQUE (marca, modelo)` de `modelos_equipo` es case-sensitive, así que sin
 * esto `hp` y `HP` entrarían como dos marcas distintas.
 *
 * Las dos mitades del par NO se normalizan igual: la `marca` se grita
 * (`trim().toUpperCase()`) y el `modelo` solo se recorta (`trim()`), porque la
 * designación comercial se lee tal como la escribió el fabricante.
 */
export class CrearModeloEquipoUseCase {
  constructor(
    private readonly modeloRepo: Pick<IModeloEquipoRepository, 'findByMarcaModelo' | 'save'>,
  ) {}

  /**
   * @param dto Marca y modelo a crear.
   * @returns El modelo creado, o `ModeloEquipoDuplicadoError` si el par ya está
   *   en uso, esté ese modelo habilitado o no.
   */
  async execute(dto: CrearModeloEquipoDto): Promise<Result<ModeloEquipoEntity, DomainError>> {
    const marca = normalizarMarcaModeloEquipo(dto.marca);
    const modelo = normalizarModeloModeloEquipo(dto.modelo);

    const existente = await this.modeloRepo.findByMarcaModelo(marca, modelo);
    if (existente) {
      return Result.fail(new ModeloEquipoDuplicadoError(marca, modelo));
    }

    const entidad = ModeloEquipoEntity.create({ marca, modelo, activo: true });
    await this.modeloRepo.save(entidad);

    return Result.ok(entidad);
  }
}
