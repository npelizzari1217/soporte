import { DomainError, Result } from '../../../shared/domain/result';
import {
  FamiliaInsumoEntity,
  normalizarCodigoFamiliaInsumo,
  normalizarNombreFamiliaInsumo,
} from '../../domain/entities/familia-insumo.entity';
import {
  FamiliaInsumoNoEncontradaError,
  FamiliaInsumoCodigoDuplicadoError,
} from '../../domain/errors/familias-insumo.errors';
import { IFamiliaInsumoRepository } from '../../domain/ports/i-familia-insumo.repository';

/** DTO de entrada de `EditarFamiliaInsumoUseCase` — PATCH semántico. */
export interface EditarFamiliaInsumoDto {
  id: string;
  codigo?: string;
  nombre?: string;
}

/**
 * EditarFamiliaInsumoUseCase — edita `codigo`/`nombre` de una familia
 * existente. Si `codigo` cambia, revalida unicidad contra el resto del tenant
 * (excluyendo la propia entidad).
 *
 * La comparación "¿cambió el código?" se hace sobre el valor YA normalizado:
 * re-enviar `toner` sobre una familia que ya es `TONER` no es un cambio, y
 * comparar el crudo dispararía una revalidación que se encuentra a sí misma.
 *
 * El `nombre` también se normaliza —recorte de espacios de borde— con la misma
 * regla que en el alta, para que editar no pueda ensuciar lo que crear dejó
 * prolijo.
 */
export class EditarFamiliaInsumoUseCase {
  constructor(
    private readonly familiaRepo: Pick<
      IFamiliaInsumoRepository,
      'findById' | 'findByCodigo' | 'save'
    >,
  ) {}

  /**
   * @param dto Id de la familia y campos a modificar (los ausentes no se tocan).
   * @returns La familia editada, `FamiliaInsumoNoEncontradaError` si el id no
   *   existe, o `FamiliaInsumoCodigoDuplicadoError` si el código nuevo choca.
   */
  async execute(dto: EditarFamiliaInsumoDto): Promise<Result<FamiliaInsumoEntity, DomainError>> {
    const familia = await this.familiaRepo.findById(dto.id);
    if (!familia) {
      return Result.fail(new FamiliaInsumoNoEncontradaError(dto.id));
    }

    const codigo = dto.codigo === undefined ? undefined : normalizarCodigoFamiliaInsumo(dto.codigo);

    if (codigo !== undefined && codigo !== familia.codigo) {
      const existente = await this.familiaRepo.findByCodigo(codigo);
      if (existente && existente.id !== familia.id) {
        return Result.fail(new FamiliaInsumoCodigoDuplicadoError(codigo));
      }
    }

    const nombre = dto.nombre === undefined ? undefined : normalizarNombreFamiliaInsumo(dto.nombre);

    familia.actualizar({ codigo, nombre });
    await this.familiaRepo.save(familia);

    return Result.ok(familia);
  }
}
