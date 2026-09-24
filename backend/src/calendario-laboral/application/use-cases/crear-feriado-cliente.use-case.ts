import { DomainError, Result } from '../../../shared/domain/result';
import { FeriadoEntity } from '../../domain/entities/feriado.entity';
import { IFeriadoClienteRepository } from '../../domain/ports/i-feriado-cliente.repository';
import { IFeriadosGlobalesChecker } from '../../domain/ports/i-feriados-globales.checker';
import {
  FeriadoFechaDuplicadaError,
  FeriadoFechaEsGlobalError,
} from '../../domain/errors/feriados.errors';
import { FechaCalendario } from '../../domain/value-objects/fecha-calendario';

/** Detecta el error P2002 de Prisma (UNIQUE constraint violation) sin importar tipos de infraestructura. */
function isPrismaUniqueConstraintError(err: unknown): err is { code: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}

/** DTO de entrada para crear un feriado de cliente (tenant `feriados_cliente`). */
export interface CrearFeriadoClienteDto {
  /** `'YYYY-MM-DD'`. El regex/largo ya se validó en el borde (DTO HTTP, WU4b). */
  fecha: string;
  descripcion: string;
}

/**
 * CrearFeriadoClienteUseCase — da de alta un feriado propio del TENANT
 * (`feriados_cliente`, WU4a).
 *
 * Flujo:
 * 1. Valida `fecha` con `FechaCalendario.crear()` → `FechaCalendarioInvalidaError`
 *    si no matchea `'YYYY-MM-DD'` o no existe en el calendario (D2).
 * 2. Chequea contra el listado GLOBAL vía `IFeriadosGlobalesChecker.esGlobal()`
 *    (D4) → `FeriadoFechaEsGlobalError` si esa fecha ya es un feriado global.
 *    Read-only, master: este use case nunca escribe ahí.
 * 3. Crea la entidad y persiste en el tenant. Si Postgres lanza P2002
 *    (duplicado dentro del mismo listado de cliente, `fecha UNIQUE`), se
 *    mapea a `FeriadoFechaDuplicadaError` — mismo criterio que
 *    `CrearFeriadoGlobalUseCase` (`crear-feriado-global.use-case.ts:54-61`).
 *    No hay pre-check adicional contra el propio listado: D4 acepta la
 *    carrera cross-DB (fecha global agregada mientras se crea la de
 *    cliente) — la unión en `PrismaFeriadosLaboralesRepository.obtener()`
 *    dedupea igual.
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref: sdd/feriados-configurables, tarea 4.1 (WU4a).
 */
export class CrearFeriadoClienteUseCase {
  constructor(
    private readonly feriadoRepo: Pick<IFeriadoClienteRepository, 'crear'>,
    private readonly feriadosGlobalesChecker: Pick<IFeriadosGlobalesChecker, 'esGlobal'>,
  ) {}

  async execute(dto: CrearFeriadoClienteDto): Promise<Result<FeriadoEntity, DomainError>> {
    const fechaResult = FechaCalendario.crear(dto.fecha);
    if (fechaResult.isFail()) {
      return Result.fail(fechaResult.getError());
    }
    const fecha = fechaResult.getValue();

    const esGlobal = await this.feriadosGlobalesChecker.esGlobal(fecha);
    if (esGlobal) {
      return Result.fail(new FeriadoFechaEsGlobalError(dto.fecha));
    }

    const feriado = FeriadoEntity.crear({ fecha, descripcion: dto.descripcion });

    try {
      await this.feriadoRepo.crear(feriado);
    } catch (err: unknown) {
      if (isPrismaUniqueConstraintError(err)) {
        return Result.fail(new FeriadoFechaDuplicadaError(dto.fecha));
      }
      throw err;
    }

    return Result.ok(feriado);
  }
}
