import { DomainError, Result } from '../../../shared/domain/result';
import { IFeriadoClienteRepository } from '../../domain/ports/i-feriado-cliente.repository';
import { FeriadoNoEncontradoError } from '../../domain/errors/feriados.errors';

/** DTO de entrada para eliminar un feriado de cliente. */
export interface EliminarFeriadoClienteDto {
  feriadoId: string;
}

/**
 * EliminarFeriadoClienteUseCase — da de baja un feriado propio del TENANT
 * (`feriados_cliente`, WU4a). Baja FÍSICA — el feriado de cliente no tiene
 * soft delete (D1), mismo criterio que `EliminarFeriadoGlobalUseCase`.
 *
 * Flujo:
 * 1. Verifica que el feriado exista (dentro del tenant vigente, D6 — la
 *    aislación es estructural vía `TenantContext`) → `FeriadoNoEncontradoError`
 *    si no.
 * 2. Ejecuta `repo.eliminar()` — DELETE físico.
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref: sdd/feriados-configurables, tarea 4.1 (WU4a).
 */
export class EliminarFeriadoClienteUseCase {
  constructor(
    private readonly feriadoRepo: Pick<IFeriadoClienteRepository, 'buscarPorId' | 'eliminar'>,
  ) {}

  async execute(dto: EliminarFeriadoClienteDto): Promise<Result<void, DomainError>> {
    const feriado = await this.feriadoRepo.buscarPorId(dto.feriadoId);
    if (!feriado) {
      return Result.fail(new FeriadoNoEncontradoError(dto.feriadoId));
    }

    await this.feriadoRepo.eliminar(dto.feriadoId);
    return Result.ok(undefined);
  }
}
