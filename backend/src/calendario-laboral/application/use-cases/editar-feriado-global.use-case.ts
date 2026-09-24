import { DomainError, Result } from '../../../shared/domain/result';
import { FeriadoEntity } from '../../domain/entities/feriado.entity';
import { IFeriadoGlobalRepository } from '../../domain/ports/i-feriado-global.repository';
import {
  FeriadoFechaDuplicadaError,
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

/** DTO de entrada para editar un feriado global (master `feriados`). */
export interface EditarFeriadoGlobalDto {
  feriadoId: string;
  /** `'YYYY-MM-DD'`. El regex/largo ya se validó en el borde (DTO HTTP, tarea 2.2). */
  fecha: string;
  descripcion: string;
}

/**
 * EditarFeriadoGlobalUseCase — edita un feriado existente en el calendario
 * global (master `feriados`, WU2). Full-replace de `fecha` y `descripcion`.
 *
 * Flujo:
 * 1. Busca el feriado por id → `FeriadoNoEncontradoError` si no existe.
 * 2. Valida la nueva `fecha` con `FechaCalendario.crear()` →
 *    `FechaCalendarioInvalidaError` si no matchea `'YYYY-MM-DD'` o no existe
 *    en el calendario (D2).
 * 3. Aplica `FeriadoEntity.editar()` (full-replace) y persiste. Si Postgres
 *    lanza P2002 (carrera concurrente sobre `fecha UNIQUE`), se mapea a
 *    `FeriadoFechaDuplicadaError` — defensa en profundidad, mismo criterio
 *    que `CrearFeriadoGlobalUseCase` (`crear-equipo.use-case.ts:11-19`).
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref: sdd/feriados-configurables, tarea 2.1.
 */
export class EditarFeriadoGlobalUseCase {
  constructor(
    private readonly feriadoRepo: Pick<IFeriadoGlobalRepository, 'buscarPorId' | 'editar'>,
  ) {}

  async execute(dto: EditarFeriadoGlobalDto): Promise<Result<FeriadoEntity, DomainError>> {
    const feriado = await this.feriadoRepo.buscarPorId(dto.feriadoId);
    if (!feriado) {
      return Result.fail(new FeriadoNoEncontradoError(dto.feriadoId));
    }

    const fechaResult = FechaCalendario.crear(dto.fecha);
    if (fechaResult.isFail()) {
      return Result.fail(fechaResult.getError());
    }

    feriado.editar({
      fecha: fechaResult.getValue(),
      descripcion: dto.descripcion,
    });

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
