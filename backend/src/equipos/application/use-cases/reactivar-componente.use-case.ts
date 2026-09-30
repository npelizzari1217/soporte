import { DomainError, Result } from '../../../shared/domain/result';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import {
  ComponenteDevueltoAlStockError,
  ComponenteNoEncontradoError,
  ComponenteYaActivoError,
} from '../../domain/errors/equipos.errors';

/** DTO de entrada para reactivar un componente de equipo dado de baja. */
export interface ReactivarComponenteDto {
  /** Equipo dueño (de la URL) — se valida que el componente le pertenezca. */
  equipoId: string;
  componenteId: string;
}

/**
 * ReactivarComponenteUseCase — revierte la baja lógica (soft delete) de un
 * componente de equipo (listado enriquecido de componentes).
 *
 * Flujo:
 * 1. Carga el componente → `ComponenteNoEncontradoError` si no existe.
 * 2. Si ya está activo → `ComponenteYaActivoError` (mismo criterio que
 *    `EliminarComponenteUseCase` rechaza la baja de algo ya borrado).
 * 3. Si volvió al stock como USADO (`bajaDestino === 'STOCK_USADO'`) →
 *    `ComponenteDevueltoAlStockError`: reactivarlo lo contaría dos veces.
 * 4. `reactivar()` (limpia `deletedAt` y el registro de retiro) y persiste. Vale
 *    para un `DESCARTE` y para un retiro legado (sin destino).
 *
 * Sin throw — todos los fallos esperados retornan `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q2 (listado enriquecido de
 * componentes — reactivar).
 */
export class ReactivarComponenteUseCase {
  constructor(
    private readonly componenteRepo: Pick<IComponenteEquipoRepository, 'findById' | 'save'>,
  ) {}

  async execute(dto: ReactivarComponenteDto): Promise<Result<ComponenteEquipoEntity, DomainError>> {
    const componente = await this.componenteRepo.findById(dto.componenteId);
    // Pertenencia: un componente de OTRO equipo se trata como no encontrado.
    if (!componente || componente.equipoId !== dto.equipoId) {
      return Result.fail(new ComponenteNoEncontradoError(dto.componenteId));
    }
    if (!componente.isDeleted()) {
      return Result.fail(new ComponenteYaActivoError(dto.componenteId));
    }

    if (componente.bajaDestino === 'STOCK_USADO') {
      return Result.fail(new ComponenteDevueltoAlStockError(dto.componenteId));
    }

    componente.reactivar();
    await this.componenteRepo.save(componente);
    return Result.ok(componente);
  }
}
