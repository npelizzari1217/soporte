import { DomainError, Result } from '../../../shared/domain/result';
import {
  UnidadMedidaEntity,
  normalizarCodigoUnidadMedida,
  normalizarNombreUnidadMedida,
} from '../../domain/entities/unidad-medida.entity';
import { UnidadMedidaCodigoDuplicadoError } from '../../domain/errors/unidades-medida.errors';
import { IUnidadMedidaRepository } from '../../domain/ports/i-unidad-medida.repository';

/** DTO de entrada de `CrearUnidadMedidaUseCase`. */
export interface CrearUnidadMedidaDto {
  codigo: string;
  nombre: string;
  /** `true` si la unidad mide piezas enteras (F3); por defecto `false`. */
  entera?: boolean;
}

/**
 * CrearUnidadMedidaUseCase — alta de una unidad en el catálogo del tenant.
 *
 * Normaliza `codigo` a mayúscula ANTES de buscar el duplicado y de persistir:
 * `unidades_medida.codigo` es UNIQUE case-sensitive, así que sin esto `un` y
 * `UN` entrarían como dos unidades distintas.
 *
 * El `nombre` pasa por la misma capa: se le recortan los espacios de borde para
 * que `'  Unidad  '` no entre al catálogo desalineado.
 */
export class CrearUnidadMedidaUseCase {
  constructor(
    private readonly unidadRepo: Pick<IUnidadMedidaRepository, 'findByCodigo' | 'save'>,
  ) {}

  /**
   * @param dto Código y nombre de la unidad a crear.
   * @returns La unidad creada, o `UnidadMedidaCodigoDuplicadoError` si el
   *   código ya está en uso, esté esa unidad habilitada o no.
   */
  async execute(dto: CrearUnidadMedidaDto): Promise<Result<UnidadMedidaEntity, DomainError>> {
    const codigo = normalizarCodigoUnidadMedida(dto.codigo);

    const existente = await this.unidadRepo.findByCodigo(codigo);
    if (existente) {
      return Result.fail(new UnidadMedidaCodigoDuplicadoError(codigo));
    }

    const nombre = normalizarNombreUnidadMedida(dto.nombre);
    const unidad = UnidadMedidaEntity.create({
      codigo,
      nombre,
      activo: true,
      entera: dto.entera,
    });
    await this.unidadRepo.save(unidad);

    return Result.ok(unidad);
  }
}
