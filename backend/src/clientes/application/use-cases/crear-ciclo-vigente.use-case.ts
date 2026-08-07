import { Result } from '../../../shared/domain/result';
import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';
import { ICicloVigenteRepository } from '../../domain/ports/i-ciclo-vigente.repository';
import { CicloVigenteInvalidDatesError } from '../../domain/errors/clientes.errors';

/** CrearCicloVigenteDto — datos para crear un nuevo ciclo del catálogo global (master). */
export interface CrearCicloVigenteDto {
  nombre: string;
  fechaInicio: Date;
  fechaFin: Date;
}

/**
 * CrearCicloVigenteUseCase — crea un nuevo ciclo en el catálogo global
 * (`master.ciclos_vigentes`), exclusivo de ROOT (R20).
 *
 * Autorización: `GlobalAdminGuard` en el controller (T9.3) + revalidación
 * del actor.isRoot queda fuera de este use case (mismo criterio que
 * `resolverScope` en auth: el use case no vuelve a resolver `is_global_admin`
 * porque no recibe `actor` — el controller es quien garantiza el guard).
 *
 * Sin validación de solapamiento entre ciclos del catálogo global (R20 no la
 * exige — a diferencia de la adopción por tenant, R21, donde SÍ se valida
 * contra el ciclo activo del tenant).
 *
 * El único invariante enforced es estructural: `fechaFin > fechaInicio`
 * (validado en `CicloVigenteEntity.create()`, defensa en profundidad del
 * CHECK de la migración SQL — T9.2).
 *
 * Tarea: T9.1 (PR9 — Ciclos: catálogo master + adopción/activación)
 */
export class CrearCicloVigenteUseCase {
  constructor(private readonly cicloVigenteRepo: ICicloVigenteRepository) {}

  async execute(
    dto: CrearCicloVigenteDto,
  ): Promise<Result<CicloVigenteEntity, CicloVigenteInvalidDatesError>> {
    let ciclo: CicloVigenteEntity;
    try {
      ciclo = CicloVigenteEntity.create({
        nombre: dto.nombre,
        fechaInicio: dto.fechaInicio,
        fechaFin: dto.fechaFin,
        activo: true,
      });
    } catch (error) {
      if (error instanceof CicloVigenteInvalidDatesError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.cicloVigenteRepo.save(ciclo);
    return Result.ok(ciclo);
  }
}
