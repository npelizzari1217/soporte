import { DomainError, Result } from '../../../shared/domain/result';
import {
  UnidadMedidaEntity,
  normalizarCodigoUnidadMedida,
  normalizarNombreUnidadMedida,
} from '../../domain/entities/unidad-medida.entity';
import {
  UnidadMedidaNoEncontradaError,
  UnidadMedidaCodigoDuplicadoError,
  UnidadMedidaEnUsoPorSerieError,
} from '../../domain/errors/unidades-medida.errors';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';
import { IUnidadMedidaRepository } from '../../domain/ports/i-unidad-medida.repository';

/** DTO de entrada de `EditarUnidadMedidaUseCase` — PATCH semántico. */
export interface EditarUnidadMedidaDto {
  id: string;
  codigo?: string;
  nombre?: string;
  /** `true` marca la unidad como entera; `false` la desmarca (se rechaza si un insumo `SERIE` la usa). */
  entera?: boolean;
}

/**
 * EditarUnidadMedidaUseCase — edita `codigo`/`nombre`/`entera` de una unidad
 * existente. Si `codigo` cambia, revalida unicidad contra el resto del tenant
 * (excluyendo la propia entidad).
 *
 * Corre en `txRunner.run()` y toma L0 de ADR-12 (sdd/repuestos-numero-de-serie)
 * ANTES de leer nada: `FOR UPDATE` siempre que el DTO traiga `codigo` (el
 * `UPDATE` de una columna clave choca con los `FOR KEY SHARE` implícitos de las
 * FK) y `FOR NO KEY UPDATE` si no. Recién entonces cuenta los insumos `SERIE`
 * que usan la unidad: una activación en vuelo (L0 `FOR SHARE`) hace esperar a
 * la edición, y al comitear esa activación el conteo ya la ve. No toma ningún
 * otro lock del orden, así que a lo sumo espera o hace esperar, sin ciclo.
 *
 * La comparación "¿cambió el código?" se hace sobre el valor YA normalizado:
 * re-enviar `un` sobre una unidad que ya es `UN` no es un cambio, y comparar el
 * crudo dispararía una revalidación que se encuentra a sí misma.
 *
 * El `nombre` también se normaliza —recorte de espacios de borde— con la misma
 * regla que en el alta, para que editar no pueda ensuciar lo que crear dejó
 * prolijo.
 *
 * Sin `throw` para los fallos esperados: un `Result.fail` no escribió nada, la
 * transacción solo comitea los locks.
 */
export class EditarUnidadMedidaUseCase {
  constructor(
    private readonly unidadRepo: Pick<
      IUnidadMedidaRepository,
      'bloquearParaEdicion' | 'findByCodigo' | 'save'
    >,
    private readonly insumoRepo: Pick<IInsumoRepository, 'contarSeriePorUnidadMedida'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
  ) {}

  /**
   * @param dto Id de la unidad y campos a modificar (los ausentes no se tocan).
   * @returns La unidad editada, `UnidadMedidaNoEncontradaError` si el id no
   *   existe, `UnidadMedidaCodigoDuplicadoError` si el código nuevo choca, o
   *   `UnidadMedidaEnUsoPorSerieError` si se desmarca `entera` mientras algún
   *   insumo `SERIE` la usa.
   */
  async execute(dto: EditarUnidadMedidaDto): Promise<Result<UnidadMedidaEntity, DomainError>> {
    return this.txRunner.run(async () => {
      // L0: antes de cualquier lectura que decida algo.
      const unidad = await this.unidadRepo.bloquearParaEdicion(
        dto.id,
        dto.codigo === undefined ? 'SIN_CAMBIO_DE_CODIGO' : 'CAMBIA_CODIGO',
      );
      if (!unidad) {
        return Result.fail<UnidadMedidaEntity, DomainError>(
          new UnidadMedidaNoEncontradaError(dto.id),
        );
      }

      const codigo =
        dto.codigo === undefined ? undefined : normalizarCodigoUnidadMedida(dto.codigo);

      if (codigo !== undefined && codigo !== unidad.codigo) {
        const existente = await this.unidadRepo.findByCodigo(codigo);
        if (existente && existente.id !== unidad.id) {
          return Result.fail<UnidadMedidaEntity, DomainError>(
            new UnidadMedidaCodigoDuplicadoError(codigo),
          );
        }
      }

      // Con la fila tomada, el conteo ve todo lo que comiteó una activación en vuelo.
      if (dto.entera === false && unidad.entera) {
        const enUso = await this.insumoRepo.contarSeriePorUnidadMedida(unidad.id);
        if (enUso > 0) {
          return Result.fail<UnidadMedidaEntity, DomainError>(
            new UnidadMedidaEnUsoPorSerieError(unidad.id),
          );
        }
      }

      const nombre =
        dto.nombre === undefined ? undefined : normalizarNombreUnidadMedida(dto.nombre);

      unidad.actualizar({ codigo, nombre, entera: dto.entera });
      await this.unidadRepo.save(unidad);

      return Result.ok<UnidadMedidaEntity, DomainError>(unidad);
    });
  }
}
