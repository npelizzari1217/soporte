import { DomainError, Result } from '../../../shared/domain/result';
import { FeriadoEntity } from '../../domain/entities/feriado.entity';
import { IFeriadoClienteRepository } from '../../domain/ports/i-feriado-cliente.repository';
import { IFeriadosGlobalesChecker } from '../../domain/ports/i-feriados-globales.checker';
import {
  FeriadoFechaDuplicadaError,
  FeriadoFechaEsGlobalError,
  FeriadoNoEncontradoError,
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

/** DTO de entrada para editar un feriado de cliente (tenant `feriados_cliente`). */
export interface EditarFeriadoClienteDto {
  feriadoId: string;
  /** `'YYYY-MM-DD'`. El regex/largo ya se validó en el borde (DTO HTTP, WU4b). */
  fecha: string;
  descripcion: string;
}

/**
 * EditarFeriadoClienteUseCase — edita un feriado existente del TENANT
 * (`feriados_cliente`, WU4a2). Full-replace de `fecha` y `descripcion`,
 * mismo shape que `EditarFeriadoGlobalUseCase`, más el pre-check contra el
 * calendario GLOBAL que `CrearFeriadoClienteUseCase` ya aplica al crear (D4
 * exige el mismo chequeo en edit).
 *
 * Flujo:
 * 1. Busca el feriado por id → `FeriadoNoEncontradoError` si no existe
 *    (`EditarFeriadoGlobalUseCase`: buscar antes de validar).
 * 2. Valida la nueva `fecha` con `FechaCalendario.crear()` →
 *    `FechaCalendarioInvalidaError` si no matchea `'YYYY-MM-DD'` o no existe
 *    en el calendario (D2).
 * 3. Chequea contra el listado GLOBAL vía `IFeriadosGlobalesChecker.esGlobal()`
 *    (D4) → `FeriadoFechaEsGlobalError` si la nueva fecha ya es un feriado
 *    global. Read-only, master: este use case nunca escribe ahí.
 * 4. Aplica `FeriadoEntity.editar()` (full-replace) y persiste. Si Postgres
 *    lanza P2002 (duplicado dentro del mismo listado de cliente, `fecha
 *    UNIQUE`), se mapea a `FeriadoFechaDuplicadaError` — mismo criterio que
 *    `CrearFeriadoClienteUseCase` (`crear-feriado-cliente.use-case.ts:71-78`).
 *    No hay pre-check adicional contra el propio listado: D4 acepta la
 *    carrera cross-DB, la unión en `PrismaFeriadosLaboralesRepository.obtener()`
 *    dedupea igual.
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref: sdd/feriados-configurables, tarea 4.1 (WU4a2).
 */
export class EditarFeriadoClienteUseCase {
  constructor(
    private readonly feriadoRepo: Pick<IFeriadoClienteRepository, 'buscarPorId' | 'editar'>,
    private readonly feriadosGlobalesChecker: Pick<IFeriadosGlobalesChecker, 'esGlobal'>,
  ) {}

  async execute(dto: EditarFeriadoClienteDto): Promise<Result<FeriadoEntity, DomainError>> {
    const feriado = await this.feriadoRepo.buscarPorId(dto.feriadoId);
    if (!feriado) {
      return Result.fail(new FeriadoNoEncontradoError(dto.feriadoId));
    }

    const fechaResult = FechaCalendario.crear(dto.fecha);
    if (fechaResult.isFail()) {
      return Result.fail(fechaResult.getError());
    }
    const fecha = fechaResult.getValue();

    const esGlobal = await this.feriadosGlobalesChecker.esGlobal(fecha);
    if (esGlobal) {
      return Result.fail(new FeriadoFechaEsGlobalError(dto.fecha));
    }

    feriado.editar({ fecha, descripcion: dto.descripcion });

    try {
      await this.feriadoRepo.editar(feriado);
    } catch (err: unknown) {
      if (isPrismaUniqueConstraintError(err)) {
        return Result.fail(new FeriadoFechaDuplicadaError(dto.fecha));
      }
      throw err;
    }

    return Result.ok(feriado);
  }
}
