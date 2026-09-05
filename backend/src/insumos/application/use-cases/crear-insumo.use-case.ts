import { DomainError, Result } from '../../../shared/domain/result';
import {
  InsumoEntity,
  normalizarCodigoInsumo,
  normalizarNombreInsumo,
} from '../../domain/entities/insumo.entity';
import { InsumoCodigoDuplicadoError } from '../../domain/errors/insumos.errors';
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

/** DTO de entrada de `CrearInsumoUseCase`. */
export interface CrearInsumoDto {
  codigo: string;
  nombre: string;
  familiaId: string;
  unidadMedidaId: string;
  /** Punto de reposición. Ausente o `null` es "sin punto definido", que no es cero. */
  stockMinimo?: number | null;
  /** Lista COMPLETA de códigos alternativos del insumo. Ausente equivale a vacía. */
  codigosAlternativos?: CodigoAlternativoInput[];
  /** Lista COMPLETA de modelos de equipo compatibles. Ausente equivale a vacía. */
  compatibilidad?: CompatibilidadInput[];
}

/**
 * CrearInsumoUseCase — alta de un insumo en el catálogo del tenant, con sus
 * códigos alternativos y con los modelos de equipo a los que sirve.
 *
 * El orden de validación es contrato y no casualidad:
 *
 * 1. Normalizar. Corre ANTES de cualquier búsqueda de duplicado porque los dos
 *    índices involucrados son case-sensitive: buscar el crudo daría por libre
 *    un `ton-001` que el INSERT después rechaza contra el `TON-001` guardado.
 * 2. Familia elegible, 3. unidad elegible. Van primero porque son las únicas
 *    dos validaciones que la base NO puede repetir: la FK atrapa el id
 *    inexistente, pero la familia deshabilitada tiene fila y pasa en silencio.
 * 4. Código único. 5. Códigos alternativos —primero el duplicado dentro del
 *    payload, después el choque global—. 6. Compatibilidad —primero el modelo
 *    repetido dentro del payload, después la elegibilidad de cada uno—. Van al
 *    final porque un error de catálogo hace irrelevante todo lo que viene
 *    después: pedirle al usuario que corrija un código cuando lo que está mal
 *    es la familia lo manda a editar un campo que no tiene nada.
 *
 * Sin `throw` para los fallos esperados: todos se modelan con `Result.fail()`.
 */
export class CrearInsumoUseCase {
  constructor(
    private readonly insumoRepo: Pick<
      IInsumoRepository,
      'findByCodigo' | 'findConflictosDeCodigoAlternativo' | 'save'
    >,
    private readonly familiaRepo: LectorCatalogoFamilias,
    private readonly unidadMedidaRepo: LectorCatalogoUnidades,
    private readonly modeloEquipoRepo: LectorCatalogoModelosEquipo,
  ) {}

  /**
   * @param dto Datos del insumo a crear, tal como llegan del borde.
   * @returns El insumo creado, o el primer error de negocio que lo impide:
   *   `FamiliaInsumoInexistenteError`, `FamiliaInsumoDeshabilitadaError`,
   *   `UnidadMedidaInexistenteError`, `UnidadMedidaDeshabilitadaError`,
   *   `InsumoCodigoDuplicadoError`, `CodigoAlternativoDuplicadoError`,
   *   `CompatibilidadDuplicadaError`, `ModeloEquipoInexistenteError` o
   *   `ModeloEquipoDeshabilitadoError`.
   */
  async execute(dto: CrearInsumoDto): Promise<Result<InsumoEntity, DomainError>> {
    const codigo = normalizarCodigoInsumo(dto.codigo);
    const nombre = normalizarNombreInsumo(dto.nombre);

    const familia = await validarFamiliaInsumoElegible(this.familiaRepo, dto.familiaId);
    if (familia.isFail()) {
      return Result.fail(familia.getError());
    }

    const unidad = await validarUnidadMedidaElegible(this.unidadMedidaRepo, dto.unidadMedidaId);
    if (unidad.isFail()) {
      return Result.fail(unidad.getError());
    }

    const ocupante = await this.insumoRepo.findByCodigo(codigo);
    if (ocupante) {
      return Result.fail(new InsumoCodigoDuplicadoError(codigo));
    }

    const codigosAlternativos = await resolverCodigosAlternativos(
      dto.codigosAlternativos ?? [],
      this.insumoRepo,
    );
    if (codigosAlternativos.isFail()) {
      return Result.fail(codigosAlternativos.getError());
    }

    const compatibilidad = await resolverCompatibilidad(
      dto.compatibilidad ?? [],
      this.modeloEquipoRepo,
    );
    if (compatibilidad.isFail()) {
      return Result.fail(compatibilidad.getError());
    }

    const insumo = InsumoEntity.create({
      codigo,
      nombre,
      familiaId: dto.familiaId,
      unidadMedidaId: dto.unidadMedidaId,
      stockMinimo: dto.stockMinimo ?? null,
      activo: true,
      codigosAlternativos: codigosAlternativos.getValue(),
      compatibilidad: compatibilidad.getValue(),
    });

    await this.insumoRepo.save(insumo);

    return Result.ok(insumo);
  }
}
