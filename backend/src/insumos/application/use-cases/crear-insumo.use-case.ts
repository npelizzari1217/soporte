import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { InsumoEntity, normalizarNombreInsumo } from '../../domain/entities/insumo.entity';
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

/**
 * DTO de entrada de `CrearInsumoUseCase`.
 *
 * **Sin `codigo` (issue #166).** El #162 lo dejaba opcional y, si el caller lo
 * mandaba, lo respetaba tal cual. El dueño pidió cerrar esa puerta: el código
 * lo pone el sistema SIEMPRE, nunca el cliente. El borde ya ni siquiera deja
 * pasar la clave —`CreateInsumoDto` no la declara, y el `ValidationPipe`
 * global (`whitelist: true`) la descarta en silencio si alguien la manda—,
 * así que esta interfaz no la declara tampoco: el borde no tiene nada que
 * traducir.
 */
export interface CrearInsumoDto {
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
 *    del payload, después la elegibilidad de cada uno—.
 *
 * **El código SIEMPRE se autogenera (issue #166 cierra la puerta que el #162
 * dejaba abierta).** No hay más rama de "código a mano": la única fuente es
 * `NumeradorInsumo`, dentro de una transacción que serializa la numeración
 * con un advisory lock — ver el JSDoc de
 * `PrismaInsumoRepository.findLastSecuenciaCodigo` para el porqué: sin ella,
 * dos altas simultáneas calculan el mismo "próximo código" y la segunda choca
 * contra el `@unique`. `CrearInsumoDto` ni siquiera declara un campo `codigo`
 * — ver su JSDoc.
 *
 * Sin `throw` para los fallos esperados: todos se modelan con `Result.fail()`.
 */
export class CrearInsumoUseCase {
  constructor(
    private readonly insumoRepo: Pick<
      IInsumoRepository,
      'findConflictosDeCodigoAlternativo' | 'save'
    >,
    private readonly familiaRepo: LectorCatalogoFamilias,
    private readonly unidadMedidaRepo: LectorCatalogoUnidades,
    private readonly modeloEquipoRepo: LectorCatalogoModelosEquipo,
    private readonly numerador: Pick<NumeradorInsumo, 'generarCodigo'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
  ) {}

  /**
   * @param dto Datos del insumo a crear, tal como llegan del borde. Nunca
   *   trae `codigo`: lo pone el sistema.
   * @returns El insumo creado, o el primer error de negocio que lo impide:
   *   `FamiliaInsumoInexistenteError`, `FamiliaInsumoDeshabilitadaError`,
   *   `UnidadMedidaInexistenteError`, `UnidadMedidaDeshabilitadaError`,
   *   `CodigoAlternativoDuplicadoError`, `CompatibilidadDuplicadaError`,
   *   `ModeloEquipoInexistenteError`, `ModeloEquipoDeshabilitadoError` o
   *   `SecuenciaCodigoInsumoAgotadaError`.
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

    // Autogeneración (issue #162, único camino desde el #166). La familia YA
    // se validó elegible arriba; esta segunda lectura solo resuelve
    // `esRepuesto` para elegir la serie, no repite ningún chequeo de
    // elegibilidad.
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
