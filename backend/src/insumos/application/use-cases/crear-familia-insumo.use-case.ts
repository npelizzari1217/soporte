import { DomainError, Result } from '../../../shared/domain/result';
import {
  FamiliaInsumoEntity,
  normalizarCodigoFamiliaInsumo,
  normalizarNombreFamiliaInsumo,
} from '../../domain/entities/familia-insumo.entity';
import { FamiliaInsumoCodigoDuplicadoError } from '../../domain/errors/familias-insumo.errors';
import { IFamiliaInsumoRepository } from '../../domain/ports/i-familia-insumo.repository';

/** DTO de entrada de `CrearFamiliaInsumoUseCase`. */
export interface CrearFamiliaInsumoDto {
  codigo: string;
  nombre: string;
}

/**
 * CrearFamiliaInsumoUseCase — alta de una familia en el catálogo del tenant.
 *
 * Normaliza `codigo` a mayúscula ANTES de buscar el duplicado y de persistir:
 * `familias_insumo.codigo` es UNIQUE case-sensitive, así que sin esto `toner` y
 * `TONER` entrarían como dos familias distintas.
 *
 * El `nombre` pasa por la misma capa: se le recortan los espacios de borde para
 * que `'  Tóner  '` no entre al catálogo desalineado.
 */
export class CrearFamiliaInsumoUseCase {
  constructor(
    private readonly familiaRepo: Pick<IFamiliaInsumoRepository, 'findByCodigo' | 'save'>,
  ) {}

  /**
   * @param dto Código y nombre de la familia a crear.
   * @returns La familia creada, o `FamiliaInsumoCodigoDuplicadoError` si el
   *   código ya está en uso, esté esa familia habilitada o no.
   */
  async execute(dto: CrearFamiliaInsumoDto): Promise<Result<FamiliaInsumoEntity, DomainError>> {
    const codigo = normalizarCodigoFamiliaInsumo(dto.codigo);

    const existente = await this.familiaRepo.findByCodigo(codigo);
    if (existente) {
      return Result.fail(new FamiliaInsumoCodigoDuplicadoError(codigo));
    }

    const nombre = normalizarNombreFamiliaInsumo(dto.nombre);
    const familia = FamiliaInsumoEntity.create({ codigo, nombre, activo: true });
    await this.familiaRepo.save(familia);

    return Result.ok(familia);
  }
}
