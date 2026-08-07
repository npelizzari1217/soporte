import { Result } from '../../../shared/domain/result';
import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';
import { ICicloVigenteRepository } from '../../domain/ports/i-ciclo-vigente.repository';
import {
  CicloVigenteInvalidDatesError,
  CicloVigenteNotFoundError,
} from '../../domain/errors/clientes.errors';

/**
 * DTO para editar un ciclo del catálogo global (PATCH semántico — campos
 * `undefined` no se tocan). `nombre` se aplica solo, las fechas se aplican
 * juntas (`reschedule` revalida el invariante `fechaFin > fechaInicio`
 * contra el valor efectivo: el nuevo si vino en el DTO, el actual si no).
 */
export interface EditarCicloVigenteDto {
  cicloVigenteId: string;
  nombre?: string;
  fechaInicio?: Date;
  fechaFin?: Date;
}

/**
 * EditarCicloVigenteUseCase — edita nombre/fechas de un ciclo del catálogo
 * global (`master.ciclos_vigentes`), exclusivo de ROOT (autorización
 * enforced por `GlobalAdminGuard` en el controller, mismo criterio que
 * `CrearCicloVigenteUseCase`: el use case no vuelve a resolver
 * `is_global_admin` porque no recibe `actor`).
 *
 * Un ciclo ya soft-deleted no se puede editar — se trata como "no
 * encontrado" (mismo criterio que `EditarUbicacionUseCase`).
 *
 * Tarea: sdd/ciclos-abm-root (ABM completo del catálogo maestro por ROOT).
 */
export class EditarCicloVigenteUseCase {
  constructor(
    private readonly cicloVigenteRepo: Pick<ICicloVigenteRepository, 'findById' | 'save'>,
  ) {}

  async execute(
    dto: EditarCicloVigenteDto,
  ): Promise<
    Result<CicloVigenteEntity, CicloVigenteInvalidDatesError | CicloVigenteNotFoundError>
  > {
    const ciclo = await this.cicloVigenteRepo.findById(dto.cicloVigenteId);
    if (!ciclo || ciclo.isDeleted()) {
      return Result.fail(new CicloVigenteNotFoundError(dto.cicloVigenteId));
    }

    if (dto.nombre !== undefined) {
      ciclo.rename(dto.nombre);
    }

    if (dto.fechaInicio !== undefined || dto.fechaFin !== undefined) {
      try {
        ciclo.reschedule(dto.fechaInicio ?? ciclo.fechaInicio, dto.fechaFin ?? ciclo.fechaFin);
      } catch (error) {
        if (error instanceof CicloVigenteInvalidDatesError) {
          return Result.fail(error);
        }
        throw error;
      }
    }

    await this.cicloVigenteRepo.save(ciclo);
    return Result.ok(ciclo);
  }
}
