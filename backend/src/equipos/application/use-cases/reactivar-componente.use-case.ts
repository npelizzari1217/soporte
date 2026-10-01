import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { OperacionesUnidadInsumo } from '../../../insumos/application/services/operaciones-unidad-insumo.service';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import {
  ComponenteDevueltoAlStockError,
  ComponenteNoEncontradoError,
  ComponenteYaActivoError,
  UnidadDelComponenteNoDisponibleError,
} from '../../domain/errors/equipos.errors';

/** DTO de entrada para reactivar un componente de equipo dado de baja. */
export interface ReactivarComponenteDto {
  /** Equipo dueño (de la URL) — se valida que el componente le pertenezca. */
  equipoId: string;
  componenteId: string;
  /** Quién reactiva (firma el evento `REACTIVACION` de la unidad). Lo pone el borde desde el JWT. */
  usuarioId: string;
}

/**
 * ReactivarComponenteUseCase — revierte la baja lógica (soft delete) de un
 * componente de equipo (listado enriquecido de componentes).
 *
 * Flujo:
 * 1. Carga el componente → `ComponenteNoEncontradoError` si no existe.
 * 2. Si ya está activo → `ComponenteYaActivoError` (mismo criterio que
 *    `RetirarComponenteUseCase` rechaza el retiro de algo ya dado de baja).
 * 3. Si volvió al stock como USADO (`bajaDestino === 'STOCK_USADO'`) →
 *    `ComponenteDevueltoAlStockError`: reactivarlo lo contaría dos veces.
 * 4. Con unidad, dentro de `txRunner.run()` y en este orden (ADR-12, el componente es
 *    L4 y va último): `operaciones.reinstalar` (L1, L2, L3; la unidad vuelve a
 *    `INSTALADA` solo si su último evento es el `DESCARTE` de este componente) y
 *    después `reactivar()` + `save()`. Una unidad recuperada o movida por otra vía
 *    ⇒ `UnidadDelComponenteNoDisponibleError`; un insumo que ya no es `SERIE` ⇒
 *    `SeguimientoNoModificableError`. Ninguna escribe nada antes de fallar.
 * 5. Sin unidad (retiro legado, o de un insumo `NINGUNO`): `reactivar()` y `save()`
 *    como siempre. Vale para un `DESCARTE` y para un retiro legado (sin destino).
 *
 * Sin throw — todos los fallos esperados retornan `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q2 (listado enriquecido de
 * componentes — reactivar).
 */
export class ReactivarComponenteUseCase {
  constructor(
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
    private readonly componenteRepo: Pick<IComponenteEquipoRepository, 'findById' | 'save'>,
    private readonly operaciones: Pick<OperacionesUnidadInsumo, 'reinstalar'>,
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

    return this.txRunner.run(async () => {
      if (componente.unidadId !== null) {
        const reinstalada = await this.operaciones.reinstalar(
          [
            {
              unidadId: componente.unidadId,
              equipoId: dto.equipoId,
              componenteId: componente.id,
              insumoId: componente.insumoId,
            },
          ],
          { usuarioId: dto.usuarioId },
        );
        if (reinstalada.isFail()) {
          const error = reinstalada.getError();
          // El servicio de insumos tiene su propia clase (insumos no importa equipos):
          // misma condición y mismo `code`, así que se traduce por `code`.
          return Result.fail<ComponenteEquipoEntity, DomainError>(
            error.code === 'UNIDAD_DEL_COMPONENTE_NO_DISPONIBLE'
              ? new UnidadDelComponenteNoDisponibleError(componente.id)
              : error,
          );
        }
      }

      componente.reactivar();
      await this.componenteRepo.save(componente);
      return Result.ok<ComponenteEquipoEntity, DomainError>(componente);
    });
  }
}
