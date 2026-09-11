import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import {
  InsumoEntity,
  normalizarCodigoInsumo,
  normalizarNombreInsumo,
} from '../../domain/entities/insumo.entity';
import { InsumoCodigoDuplicadoError } from '../../domain/errors/insumos.errors';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';
import { NumeradorInsumo } from '../../domain/services/numerador-insumo.service';
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
  /**
   * Ausente ⇒ SE AUTOGENERA (issue #162): `REP-0001` si la familia es de
   * repuestos, `INS-0001` si no, correlativo e independiente por serie
   * dentro del tenant. Si el caller manda un valor, se respeta tal cual —el
   * autogenerado es el default, no una imposición— y pasa por el mismo
   * chequeo de unicidad de siempre.
   */
  codigo?: string;
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
 * 1. Familia elegible, 2. unidad elegible. Van primero porque son las únicas
 *    dos validaciones que la base NO puede repetir: la FK atrapa el id
 *    inexistente, pero la familia deshabilitada tiene fila y pasa en silencio.
 * 2. Códigos alternativos —primero el duplicado dentro del payload, después
 *    el choque global—. 3. Compatibilidad —primero el modelo repetido dentro
 *    del payload, después la elegibilidad de cada uno—. Van antes que el
 *    código porque un error de catálogo hace irrelevante todo lo que viene
 *    después: pedirle al usuario que corrija un código cuando lo que está mal
 *    es la familia lo manda a editar un campo que no tiene nada.
 * 3. Código: si el caller lo manda (`dto.codigo !== undefined`), se normaliza
 *    y se verifica único, IGUAL que siempre — sin transacción ni lock, esa
 *    carrera es teórica (dos personas tendrían que tipear el mismo código a
 *    mano en el mismo instante) y sigue siéndolo. Si NO lo manda, se
 *    AUTOGENERA (issue #162) dentro de una transacción que serializa la
 *    numeración con un advisory lock — ver el JSDoc de
 *    `PrismaInsumoRepository.findLastSecuenciaCodigo` para el porqué: sin
 *    ella, dos altas simultáneas calculan el mismo "próximo código" y la
 *    segunda choca contra el `@unique` con un "código duplicado" sobre un
 *    código que el usuario nunca escribió.
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
    private readonly numerador: Pick<NumeradorInsumo, 'generarCodigo'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
  ) {}

  /**
   * @param dto Datos del insumo a crear, tal como llegan del borde.
   * @returns El insumo creado, o el primer error de negocio que lo impide:
   *   `FamiliaInsumoInexistenteError`, `FamiliaInsumoDeshabilitadaError`,
   *   `UnidadMedidaInexistenteError`, `UnidadMedidaDeshabilitadaError`,
   *   `CodigoAlternativoDuplicadoError`, `CompatibilidadDuplicadaError`,
   *   `ModeloEquipoInexistenteError`, `ModeloEquipoDeshabilitadoError`,
   *   `InsumoCodigoDuplicadoError` (código a mano) o
   *   `SecuenciaCodigoInsumoAgotadaError` (autogenerado).
   */
  async execute(dto: CrearInsumoDto): Promise<Result<InsumoEntity, DomainError>> {
    const nombre = normalizarNombreInsumo(dto.nombre);

    const familia = await validarFamiliaInsumoElegible(this.familiaRepo, dto.familiaId);
    if (familia.isFail()) {
      return Result.fail(familia.getError());
    }

    const unidad = await validarUnidadMedidaElegible(this.unidadMedidaRepo, dto.unidadMedidaId);
    if (unidad.isFail()) {
      return Result.fail(unidad.getError());
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

    // Código escrito a mano: se respeta tal cual (issue #162, "el
    // autogenerado es el default, no una imposición"). Sin transacción ni
    // lock — ver el JSDoc de la clase para el porqué de esa asimetría.
    if (dto.codigo !== undefined) {
      const codigo = normalizarCodigoInsumo(dto.codigo);

      const ocupante = await this.insumoRepo.findByCodigo(codigo);
      if (ocupante) {
        return Result.fail(new InsumoCodigoDuplicadoError(codigo));
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

    // Autogeneración (issue #162). La familia YA se validó elegible arriba;
    // esta segunda lectura solo resuelve `esRepuesto` para elegir la serie,
    // no repite ningún chequeo de elegibilidad.
    const familiaEntidad = await this.familiaRepo.findById(dto.familiaId);
    const esRepuesto = familiaEntidad?.esRepuesto ?? false;

    // Sección crítica: numeración (advisory lock) + persistencia, atómicas
    // en la MISMA transacción — mismo patrón que `CrearCompraUseCase`
    // (ADR-C5) y `CrearTicketUseCase` (ADR-5).
    return this.txRunner.run(async () => {
      const codigoResult = await this.numerador.generarCodigo(esRepuesto);
      if (codigoResult.isFail()) {
        return Result.fail<InsumoEntity, DomainError>(codigoResult.getError());
      }

      const insumo = InsumoEntity.create({
        codigo: codigoResult.getValue(),
        nombre,
        familiaId: dto.familiaId,
        unidadMedidaId: dto.unidadMedidaId,
        stockMinimo: dto.stockMinimo ?? null,
        activo: true,
        codigosAlternativos: codigosAlternativos.getValue(),
        compatibilidad: compatibilidad.getValue(),
      });

      await this.insumoRepo.save(insumo);
      return Result.ok<InsumoEntity, DomainError>(insumo);
    });
  }
}
