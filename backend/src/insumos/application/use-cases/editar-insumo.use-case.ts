import { DomainError, Result } from '../../../shared/domain/result';
import { InsumoCodigoAlternativoEntity } from '../../domain/entities/insumo-codigo-alternativo.entity';
import {
  InsumoEntity,
  normalizarCodigoInsumo,
  normalizarNombreInsumo,
} from '../../domain/entities/insumo.entity';
import {
  InsumoCodigoDuplicadoError,
  InsumoNoEncontradoError,
} from '../../domain/errors/insumos.errors';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';
import {
  CodigoAlternativoInput,
  LectorCatalogoFamilias,
  LectorCatalogoUnidades,
  resolverCodigosAlternativos,
  validarFamiliaInsumoElegible,
  validarUnidadMedidaElegible,
} from '../services/validar-insumo.service';

/** DTO de entrada de `EditarInsumoUseCase` — PATCH semántico. */
export interface EditarInsumoDto {
  id: string;
  codigo?: string;
  nombre?: string;
  familiaId?: string;
  unidadMedidaId?: string;
  /** `undefined` deja el punto de reposición intacto; `null` lo borra. */
  stockMinimo?: number | null;
  /**
   * Lista COMPLETA de códigos alternativos que REEMPLAZA a la guardada.
   * `undefined` deja la lista guardada intacta; `[]` la vacía.
   */
  codigosAlternativos?: CodigoAlternativoInput[];
}

/**
 * EditarInsumoUseCase — edita un insumo del catálogo del tenant.
 *
 * Mantiene el mismo orden de validación que el alta —familia, unidad, código
 * único, códigos alternativos—, con dos diferencias que solo existen en la
 * edición:
 *
 * - **La revalidación del código único corre solo si el código RESULTANTE
 *   cambió**, y se compara sobre los valores YA normalizados: reenviar
 *   `ton-001` sobre un insumo que ya es `TON-001` no es un cambio, y comparar
 *   el crudo dispararía una revalidación que se encuentra a sí misma. Cuando sí
 *   corre, el `findByCodigo` que devuelve el MISMO insumo no es un choque —de
 *   ahí la comparación por id—.
 * - **El conflicto global de códigos alternativos se consulta excluyendo al
 *   insumo que se edita**: sus propios códigos no chocan consigo mismo, y sin
 *   la exclusión reenviar la lista sin cambios se rechazaría a sí misma.
 *
 * Los campos ausentes del PATCH no se validan ni se tocan: consultar el
 * catálogo por una familia que nadie reasignó haría fallar una edición de
 * nombre por una familia que el insumo ya tenía desde antes de deshabilitarse.
 */
export class EditarInsumoUseCase {
  constructor(
    private readonly insumoRepo: Pick<
      IInsumoRepository,
      'findById' | 'findByCodigo' | 'findConflictosDeCodigoAlternativo' | 'save'
    >,
    private readonly familiaRepo: LectorCatalogoFamilias,
    private readonly unidadMedidaRepo: LectorCatalogoUnidades,
  ) {}

  /**
   * @param dto Id del insumo y campos a modificar; los ausentes no se tocan.
   * @returns El insumo editado, o el primer error de negocio que lo impide:
   *   `InsumoNoEncontradoError`, `FamiliaInsumoInexistenteError`,
   *   `FamiliaInsumoDeshabilitadaError`, `UnidadMedidaInexistenteError`,
   *   `UnidadMedidaDeshabilitadaError`, `InsumoCodigoDuplicadoError` o
   *   `CodigoAlternativoDuplicadoError`.
   */
  async execute(dto: EditarInsumoDto): Promise<Result<InsumoEntity, DomainError>> {
    const insumo = await this.insumoRepo.findById(dto.id);
    if (!insumo) {
      return Result.fail(new InsumoNoEncontradoError(dto.id));
    }

    const codigo = dto.codigo === undefined ? undefined : normalizarCodigoInsumo(dto.codigo);
    const nombre = dto.nombre === undefined ? undefined : normalizarNombreInsumo(dto.nombre);

    if (dto.familiaId !== undefined) {
      const familia = await validarFamiliaInsumoElegible(this.familiaRepo, dto.familiaId);
      if (familia.isFail()) {
        return Result.fail(familia.getError());
      }
    }

    if (dto.unidadMedidaId !== undefined) {
      const unidad = await validarUnidadMedidaElegible(this.unidadMedidaRepo, dto.unidadMedidaId);
      if (unidad.isFail()) {
        return Result.fail(unidad.getError());
      }
    }

    const codigoResultante = codigo ?? insumo.codigo;
    if (codigoResultante !== insumo.codigo) {
      const ocupante = await this.insumoRepo.findByCodigo(codigoResultante);
      if (ocupante && ocupante.id !== insumo.id) {
        return Result.fail(new InsumoCodigoDuplicadoError(codigoResultante));
      }
    }

    let codigosAlternativos: InsumoCodigoAlternativoEntity[] | undefined;
    if (dto.codigosAlternativos !== undefined) {
      const resueltos = await resolverCodigosAlternativos(
        dto.codigosAlternativos,
        this.insumoRepo,
        { existentes: insumo.codigosAlternativos, excluyendoInsumoId: insumo.id },
      );
      if (resueltos.isFail()) {
        return Result.fail(resueltos.getError());
      }
      codigosAlternativos = resueltos.getValue();
    }

    insumo.actualizar({
      codigo,
      nombre,
      familiaId: dto.familiaId,
      unidadMedidaId: dto.unidadMedidaId,
      stockMinimo: dto.stockMinimo,
    });

    if (codigosAlternativos !== undefined) {
      insumo.reemplazarCodigosAlternativos(codigosAlternativos);
    }

    await this.insumoRepo.save(insumo);

    return Result.ok(insumo);
  }
}
