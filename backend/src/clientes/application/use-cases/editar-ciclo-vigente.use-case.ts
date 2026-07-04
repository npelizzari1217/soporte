import { Result } from '../../../shared/domain/result';
import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';
import { ICicloVigenteRepository } from '../../domain/ports/i-ciclo-vigente.repository';
import {
  CicloVigenteNotFoundError,
  CicloVigenteInvalidDatesError,
  CicloVigenteOverlapError,
} from '../../domain/errors/clientes.errors';

/**
 * EditarCicloVigenteDto — campos opcionales a aplicar sobre un ciclo vigente existente.
 */
export interface EditarCicloVigenteDto {
  nombre?: string;
  fechaInicio?: Date | string;
  fechaFin?: Date | string;
  activo?: boolean;
}

/**
 * EditarCicloVigenteUseCase — edita un ciclo del catálogo global (MASTER).
 *
 * ADR-2 (design): editar el catálogo NO propaga a `ciclos_cliente` ya elegidos
 * (modelo snapshot, cross-DB sin TX atómica) — por eso el constructor SOLO
 * recibe `ICicloVigenteRepository`, sin conocer `ICicloClienteRepository`.
 *
 * Si se reprograman fechas y el ciclo queda `activo=true`, revalida el
 * solapamiento contra los demás ciclos activos, EXCLUYENDO el propio id de
 * la comparación (mismo algoritmo que CrearCicloVigenteUseCase).
 *
 * Satisface: PATCH /ciclos-vigentes/:id.
 *
 * Tarea: T2.4
 */
export class EditarCicloVigenteUseCase {
  constructor(private readonly cicloRepo: ICicloVigenteRepository) {}

  async execute(
    id: string,
    dto: EditarCicloVigenteDto,
  ): Promise<
    Result<
      CicloVigenteEntity,
      CicloVigenteNotFoundError | CicloVigenteInvalidDatesError | CicloVigenteOverlapError
    >
  > {
    const ciclo = await this.cicloRepo.findById(id);
    if (!ciclo) {
      return Result.fail(new CicloVigenteNotFoundError(id));
    }

    if (dto.nombre !== undefined) {
      ciclo.rename(dto.nombre);
    }

    if (dto.fechaInicio !== undefined && dto.fechaFin !== undefined) {
      const nuevaInicio = new Date(dto.fechaInicio);
      const nuevaFin = new Date(dto.fechaFin);

      try {
        ciclo.reschedule(nuevaInicio, nuevaFin);
      } catch (error) {
        if (error instanceof CicloVigenteInvalidDatesError) {
          return Result.fail(error);
        }
        throw error;
      }
    }

    if (dto.activo !== undefined) {
      if (dto.activo) {
        ciclo.activate();
      } else {
        ciclo.deactivate();
      }
    }

    if (dto.fechaInicio !== undefined && dto.fechaFin !== undefined && ciclo.activo) {
      const activos = await this.cicloRepo.findActiveNonDeleted();
      const solapa = activos
        .filter((c) => c.id !== id)
        .some((c) => ciclo.fechaInicio <= c.fechaFin && ciclo.fechaFin >= c.fechaInicio);

      if (solapa) {
        return Result.fail(new CicloVigenteOverlapError());
      }
    }

    await this.cicloRepo.save(ciclo);

    return Result.ok(ciclo);
  }
}
