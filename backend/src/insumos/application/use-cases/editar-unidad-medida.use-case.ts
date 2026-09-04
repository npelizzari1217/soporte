import { DomainError, Result } from '../../../shared/domain/result';
import {
  UnidadMedidaEntity,
  normalizarCodigoUnidadMedida,
  normalizarNombreUnidadMedida,
} from '../../domain/entities/unidad-medida.entity';
import {
  UnidadMedidaNoEncontradaError,
  UnidadMedidaCodigoDuplicadoError,
} from '../../domain/errors/unidades-medida.errors';
import { IUnidadMedidaRepository } from '../../domain/ports/i-unidad-medida.repository';

/** DTO de entrada de `EditarUnidadMedidaUseCase` — PATCH semántico. */
export interface EditarUnidadMedidaDto {
  id: string;
  codigo?: string;
  nombre?: string;
}

/**
 * EditarUnidadMedidaUseCase — edita `codigo`/`nombre` de una unidad existente.
 * Si `codigo` cambia, revalida unicidad contra el resto del tenant (excluyendo
 * la propia entidad).
 *
 * La comparación "¿cambió el código?" se hace sobre el valor YA normalizado:
 * re-enviar `un` sobre una unidad que ya es `UN` no es un cambio, y comparar el
 * crudo dispararía una revalidación que se encuentra a sí misma.
 *
 * El `nombre` también se normaliza —recorte de espacios de borde— con la misma
 * regla que en el alta, para que editar no pueda ensuciar lo que crear dejó
 * prolijo.
 */
export class EditarUnidadMedidaUseCase {
  constructor(
    private readonly unidadRepo: Pick<
      IUnidadMedidaRepository,
      'findById' | 'findByCodigo' | 'save'
    >,
  ) {}

  /**
   * @param dto Id de la unidad y campos a modificar (los ausentes no se tocan).
   * @returns La unidad editada, `UnidadMedidaNoEncontradaError` si el id no
   *   existe, o `UnidadMedidaCodigoDuplicadoError` si el código nuevo choca.
   */
  async execute(dto: EditarUnidadMedidaDto): Promise<Result<UnidadMedidaEntity, DomainError>> {
    const unidad = await this.unidadRepo.findById(dto.id);
    if (!unidad) {
      return Result.fail(new UnidadMedidaNoEncontradaError(dto.id));
    }

    const codigo = dto.codigo === undefined ? undefined : normalizarCodigoUnidadMedida(dto.codigo);

    if (codigo !== undefined && codigo !== unidad.codigo) {
      const existente = await this.unidadRepo.findByCodigo(codigo);
      if (existente && existente.id !== unidad.id) {
        return Result.fail(new UnidadMedidaCodigoDuplicadoError(codigo));
      }
    }

    const nombre = dto.nombre === undefined ? undefined : normalizarNombreUnidadMedida(dto.nombre);

    unidad.actualizar({ codigo, nombre });
    await this.unidadRepo.save(unidad);

    return Result.ok(unidad);
  }
}
