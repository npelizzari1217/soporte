import { DomainError, Result } from '../../../shared/domain/result';
import { IFeriadoGlobalRepository } from '../../domain/ports/i-feriado-global.repository';
import { FeriadoNoEncontradoError } from '../../domain/errors/feriados.errors';

/** DTO de entrada para eliminar un feriado global. */
export interface EliminarFeriadoGlobalDto {
  feriadoId: string;
}

/**
 * EliminarFeriadoGlobalUseCase — da de baja un feriado global (master
 * `feriados`, WU2). Baja FÍSICA — el feriado global no tiene soft delete
 * (D1), a diferencia de `EliminarEquipoUseCase`.
 *
 * Flujo:
 * 1. Verifica que el feriado exista → `FeriadoNoEncontradoError` si no.
 * 2. Ejecuta `repo.eliminar()` — DELETE físico.
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref: sdd/feriados-configurables, tarea 2.1.
 */
export class EliminarFeriadoGlobalUseCase {
  constructor(
    private readonly feriadoRepo: Pick<IFeriadoGlobalRepository, 'buscarPorId' | 'eliminar'>,
  ) {}

  async execute(dto: EliminarFeriadoGlobalDto): Promise<Result<void, DomainError>> {
    const feriado = await this.feriadoRepo.buscarPorId(dto.feriadoId);
    if (!feriado) {
      return Result.fail(new FeriadoNoEncontradoError(dto.feriadoId));
    }

    await this.feriadoRepo.eliminar(dto.feriadoId);
    return Result.ok(undefined);
  }
}
