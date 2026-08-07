import { Result } from '../../../shared/domain/result';
import { ICicloVigenteRepository } from '../../domain/ports/i-ciclo-vigente.repository';
import { CicloVigenteNotFoundError } from '../../domain/errors/clientes.errors';

/** DTO para dar de baja (soft-delete) un ciclo del catálogo global. */
export interface EliminarCicloVigenteDto {
  cicloVigenteId: string;
}

/**
 * EliminarCicloVigenteUseCase — da de baja lógica (soft-delete) un ciclo
 * del catálogo global (`master.ciclos_vigentes`), exclusivo de ROOT
 * (autorización enforced por `GlobalAdminGuard` en el controller).
 *
 * Un ciclo ya adoptado por algún tenant (`ciclos_cliente.ciclo_vigente_id`)
 * NO se ve afectado por el soft-delete: es un soft-ref sin FK física (ver
 * JSDoc de `CicloVigenteEntity`), y la baja lógica solo saca al ciclo de
 * `findAllActivos()` (deja de ofrecerse para NUEVAS adopciones) — las
 * adopciones existentes siguen funcionando exactamente igual.
 *
 * Un ciclo ya soft-deleted es idempotentemente tratado como "no
 * encontrado" (evita doble baja silenciosa, mismo criterio que
 * `EliminarUbicacionUseCase`).
 *
 * Tarea: sdd/ciclos-abm-root (ABM completo del catálogo maestro por ROOT).
 */
export class EliminarCicloVigenteUseCase {
  constructor(
    private readonly cicloVigenteRepo: Pick<ICicloVigenteRepository, 'findById' | 'save'>,
  ) {}

  async execute(dto: EliminarCicloVigenteDto): Promise<Result<void, CicloVigenteNotFoundError>> {
    const ciclo = await this.cicloVigenteRepo.findById(dto.cicloVigenteId);
    if (!ciclo || ciclo.isDeleted()) {
      return Result.fail(new CicloVigenteNotFoundError(dto.cicloVigenteId));
    }

    ciclo.softDelete();
    await this.cicloVigenteRepo.save(ciclo);

    return Result.ok(undefined);
  }
}
