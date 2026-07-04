import { Result } from '../../../shared/domain/result';
import { ICicloVigenteRepository } from '../../domain/ports/i-ciclo-vigente.repository';
import { CicloVigenteNotFoundError } from '../../domain/errors/clientes.errors';

/**
 * DesactivarCicloVigenteUseCase — baja lógica (soft-delete) de un ciclo del
 * catálogo global.
 *
 * ADR-1 (design): "desactivar" = soft-delete (BaseEntity.softDelete), NUNCA
 * baja física — la constitución del proyecto prohíbe delete() físico. Este
 * use case JAMÁS invoca `cicloRepo.delete()`.
 *
 * Satisface: DELETE /ciclos-vigentes/:id.
 *
 * Tarea: T2.5
 */
export class DesactivarCicloVigenteUseCase {
  constructor(private readonly cicloRepo: ICicloVigenteRepository) {}

  async execute(id: string): Promise<Result<void, CicloVigenteNotFoundError>> {
    const ciclo = await this.cicloRepo.findById(id);
    if (!ciclo) {
      return Result.fail(new CicloVigenteNotFoundError(id));
    }

    ciclo.softDelete();
    await this.cicloRepo.save(ciclo);

    return Result.ok(undefined);
  }
}
