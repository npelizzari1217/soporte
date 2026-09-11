import { DomainError, Result } from '../../../shared/domain/result';
import { CompatibilidadModelo } from '../../domain/entities/compatibilidad-modelo';
import { InsumoCodigoAlternativoEntity } from '../../domain/entities/insumo-codigo-alternativo.entity';
import { InsumoEntity, normalizarNombreInsumo } from '../../domain/entities/insumo.entity';
import { InsumoNoEncontradoError } from '../../domain/errors/insumos.errors';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';
import {
  CodigoAlternativoInput,
  CompatibilidadInput,
  LectorCatalogoFamilias,
  LectorCatalogoModelosEquipo,
  LectorCatalogoUnidades,
  resolverCodigosAlternativos,
  resolverCompatibilidad,
  validarFamiliaInsumoElegible,
  validarUnidadMedidaElegible,
} from '../services/validar-insumo.service';

/**
 * DTO de entrada de `EditarInsumoUseCase` — PATCH semántico.
 *
 * **Sin `codigo` (issue #166).** Cierra el agujero que el #162 dejaba
 * abierto: no alcanzaba con que el alta no aceptara un código a mano si
 * Editar sí lo cambiaba treinta segundos después. `EditInsumoDto` —el borde—
 * tampoco lo declara, y el `ValidationPipe` global (`whitelist: true`)
 * descarta en silencio cualquier `codigo` que llegue en el body. Esta
 * interfaz no lo declara tampoco por el mismo motivo que `CrearInsumoDto`: el
 * caso de uso no tiene nada que traducir si el tipo no admite el campo.
 */
export interface EditarInsumoDto {
  id: string;
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
  /**
   * Lista COMPLETA de modelos compatibles que REEMPLAZA a la guardada.
   * `undefined` deja la lista guardada intacta; `[]` la vacía.
   */
  compatibilidad?: CompatibilidadInput[];
}

/**
 * EditarInsumoUseCase — edita un insumo del catálogo del tenant.
 *
 * Mantiene el mismo orden de validación que el alta —familia, unidad, códigos
 * alternativos, compatibilidad—, con dos diferencias que solo existen en la
 * edición:
 *
 * - **El conflicto global de códigos alternativos se consulta excluyendo al
 *   insumo que se edita**: sus propios códigos no chocan consigo mismo, y sin
 *   la exclusión reenviar la lista sin cambios se rechazaría a sí misma.
 * - **La elegibilidad de los modelos se verifica solo sobre los que el insumo
 *   NO tenía ya declarados.** Es el equivalente de la exclusión de arriba: la
 *   lista se reemplaza entera, así que revalidar lo viejo convertiría una baja
 *   del catálogo en una trampa —deshabilitar un modelo dejaría sin poder
 *   editar, ni el nombre, a los insumos ya compatibles con él—.
 *
 * **El `codigo` NO es un campo editable (issue #166).** `EditarInsumoDto` no
 * lo declara —ver su JSDoc—, así que no hay nada que normalizar ni revalidar
 * acá: `insumo.actualizar()` tampoco acepta un `codigo` en su tipo (ver el
 * JSDoc de `InsumoEntity.actualizar()`). La consecuencia asumida por el
 * dueño: un código con typo queda congelado con el typo, para siempre, y
 * reasignar la familia de un insumo NUNCA le toca el código —ni el prefijo—,
 * como ya fijaba el test de esta clase desde el #162.
 *
 * Los campos ausentes del PATCH no se validan ni se tocan: consultar el
 * catálogo por una familia que nadie reasignó haría fallar una edición de
 * nombre por una familia que el insumo ya tenía desde antes de deshabilitarse.
 * Lo mismo vale para las DOS listas del agregado: `undefined` deja la guardada
 * intacta y `[]` la vacía, y confundirlos borra datos que nadie pidió borrar.
 */
export class EditarInsumoUseCase {
  constructor(
    private readonly insumoRepo: Pick<
      IInsumoRepository,
      'findById' | 'findConflictosDeCodigoAlternativo' | 'save'
    >,
    private readonly familiaRepo: LectorCatalogoFamilias,
    private readonly unidadMedidaRepo: LectorCatalogoUnidades,
    private readonly modeloEquipoRepo: LectorCatalogoModelosEquipo,
  ) {}

  /**
   * @param dto Id del insumo y campos a modificar; los ausentes no se tocan.
   *   Nunca trae `codigo`: no es un campo editable.
   * @returns El insumo editado, o el primer error de negocio que lo impide:
   *   `InsumoNoEncontradoError`, `FamiliaInsumoInexistenteError`,
   *   `FamiliaInsumoDeshabilitadaError`, `UnidadMedidaInexistenteError`,
   *   `UnidadMedidaDeshabilitadaError`, `CodigoAlternativoDuplicadoError`,
   *   `CompatibilidadDuplicadaError`, `ModeloEquipoInexistenteError` o
   *   `ModeloEquipoDeshabilitadoError`.
   */
  async execute(dto: EditarInsumoDto): Promise<Result<InsumoEntity, DomainError>> {
    const insumo = await this.insumoRepo.findById(dto.id);
    if (!insumo) {
      return Result.fail(new InsumoNoEncontradoError(dto.id));
    }

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

    let compatibilidad: CompatibilidadModelo[] | undefined;
    if (dto.compatibilidad !== undefined) {
      const resuelta = await resolverCompatibilidad(dto.compatibilidad, this.modeloEquipoRepo, {
        existentes: insumo.compatibilidad,
      });
      if (resuelta.isFail()) {
        return Result.fail(resuelta.getError());
      }
      compatibilidad = resuelta.getValue();
    }

    insumo.actualizar({
      nombre,
      familiaId: dto.familiaId,
      unidadMedidaId: dto.unidadMedidaId,
      stockMinimo: dto.stockMinimo,
    });

    if (codigosAlternativos !== undefined) {
      insumo.reemplazarCodigosAlternativos(codigosAlternativos);
    }

    if (compatibilidad !== undefined) {
      insumo.reemplazarCompatibilidad(compatibilidad);
    }

    await this.insumoRepo.save(insumo);

    return Result.ok(insumo);
  }
}
