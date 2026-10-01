import { DomainError, Result } from '../../../shared/domain/result';
import { EstadoUnidadInsumo, UnidadInsumoEntity } from '../../domain/entities/unidad-insumo.entity';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';
import { IUnidadInsumoRepository } from '../../domain/ports/i-unidad-insumo.repository';
import { validarInsumoElegible } from '../services/validar-insumo.service';

/** Filtros de `ListarUnidadesInsumoUseCase`. */
export interface ListarUnidadesInsumoDto {
  insumoId: string;
  /** Solo las unidades en ese estado. */
  estado?: EstadoUnidadInsumo;
  /**
   * `true` = las que se pueden sacar o instalar: `EN_DEPOSITO` CON serial. Las
   * pendientes quedan fuera; el selector del ajuste negativo no lo pide y las
   * recibe con `estado=EN_DEPOSITO`.
   */
  disponibles?: boolean;
}

/** Una unidad listada, con el nombre del equipo donde está instalada. */
export interface UnidadListada {
  unidad: UnidadInsumoEntity;
  equipoNombre: string | null;
}

/**
 * ListarUnidadesInsumoUseCase — las unidades de un insumo con seguimiento por
 * serie (ficha del insumo y selectores de salida, instalación y ajuste).
 *
 * Es una lectura sin lock y sin transacción: una foto. Un insumo `NINGUNO` no
 * tiene unidades y devuelve una lista vacía.
 */
export class ListarUnidadesInsumoUseCase {
  constructor(
    private readonly insumoRepo: Pick<IInsumoRepository, 'findById'>,
    private readonly unidadRepo: Pick<
      IUnidadInsumoRepository,
      'listarPorInsumo' | 'nombresDeEquipos'
    >,
  ) {}

  /**
   * @param dto Insumo y filtros.
   * @returns Las unidades ordenadas por id; o `InsumoNoEncontradoError`.
   */
  async execute(dto: ListarUnidadesInsumoDto): Promise<Result<UnidadListada[], DomainError>> {
    const elegible = await validarInsumoElegible(this.insumoRepo, dto.insumoId);
    if (elegible.isFail()) return Result.fail(elegible.getError());

    const unidades = await this.unidadRepo.listarPorInsumo(
      elegible.getValue().id,
      dto.estado !== undefined ? [dto.estado] : undefined,
    );
    const filtradas =
      dto.disponibles === true
        ? unidades.filter((u) => u.estado === 'EN_DEPOSITO' && u.numeroSerie !== null)
        : unidades;

    const nombres = await this.unidadRepo.nombresDeEquipos(
      filtradas.map((u) => u.equipoId).filter((id): id is string => id !== null),
    );
    return Result.ok(
      filtradas.map((unidad) => ({
        unidad,
        equipoNombre: unidad.equipoId !== null ? (nombres.get(unidad.equipoId) ?? null) : null,
      })),
    );
  }
}
