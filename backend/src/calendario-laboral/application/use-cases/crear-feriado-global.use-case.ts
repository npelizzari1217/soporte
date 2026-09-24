import { DomainError, Result } from '../../../shared/domain/result';
import { FeriadoEntity } from '../../domain/entities/feriado.entity';
import { IFeriadoGlobalRepository } from '../../domain/ports/i-feriado-global.repository';
import { FeriadoFechaDuplicadaError } from '../../domain/errors/feriados.errors';
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

/** DTO de entrada para crear un feriado global (master `feriados`). */
export interface CrearFeriadoGlobalDto {
  /** `'YYYY-MM-DD'`. El regex/largo ya se validó en el borde (DTO HTTP, tarea 2.2). */
  fecha: string;
  descripcion: string;
}

/**
 * CrearFeriadoGlobalUseCase — da de alta un feriado en el calendario global
 * (master `feriados`, WU2).
 *
 * Flujo:
 * 1. Valida `fecha` con `FechaCalendario.crear()` → `FechaCalendarioInvalidaError`
 *    si no matchea `'YYYY-MM-DD'` o no existe en el calendario (D2).
 * 2. Crea la entidad y persiste. Si Postgres lanza P2002 (carrera concurrente
 *    sobre `fecha UNIQUE`), se mapea a `FeriadoFechaDuplicadaError` — defensa
 *    en profundidad, mismo criterio que `CrearEquipoUseCase`
 *    (`crear-equipo.use-case.ts:11-19`).
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref: sdd/feriados-configurables, tarea 2.1.
 */
export class CrearFeriadoGlobalUseCase {
  constructor(private readonly feriadoRepo: Pick<IFeriadoGlobalRepository, 'crear'>) {}

  async execute(dto: CrearFeriadoGlobalDto): Promise<Result<FeriadoEntity, DomainError>> {
    const fechaResult = FechaCalendario.crear(dto.fecha);
    if (fechaResult.isFail()) {
      return Result.fail(fechaResult.getError());
    }

    const feriado = FeriadoEntity.crear({
      fecha: fechaResult.getValue(),
      descripcion: dto.descripcion,
    });

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
