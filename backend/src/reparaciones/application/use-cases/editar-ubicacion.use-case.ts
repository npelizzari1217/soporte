import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { UbicacionEntity } from '../../domain/entities/ubicacion.entity';
import { IUbicacionRepository } from '../../domain/ports/i-ubicacion.repository';
import {
  UbicacionInvalidaError,
  UbicacionNoEncontradaError,
} from '../../domain/errors/reparaciones.errors';

/**
 * DTO para editar una ubicación (F3-E2): edición de datos (PATCH semántico,
 * campos `undefined` no se tocan) + activar/desactivar. Fusiona en un único
 * use case las 4 operaciones de "CRUD ubicaciones" listadas en la tarea
 * (crear/editar/activar/desactivar) — el design solo lista `editar-ubicacion`
 * como archivo, no 2 use cases separados para activar/desactivar.
 */
export interface EditarUbicacionDto {
  /** UUID de la ubicación a editar. */
  ubicacionId: string;
  nombre?: string;
  descripcion?: string | null;
  /** UUID del nuevo padre (`null` = pasa a ser raíz). `undefined` = no se toca. */
  padreId?: string | null;
  /** `true` reactiva, `false` desactiva. `undefined` = no se toca. */
  activo?: boolean;
}

/**
 * EditarUbicacionUseCase — edita los datos de una ubicación existente y/o
 * cambia su estado `activo` (F3-E2).
 *
 * Flujo:
 * 1. Carga la ubicación → `UbicacionNoEncontradaError` si no existe/eliminada.
 * 2. Si `padreId` fue provisto (y no es `null`): valida que el nuevo padre
 *    exista y no esté eliminado → `UbicacionInvalidaError` si no.
 * 3. Aplica `actualizar()` (nombre/descripcion/padreId) y, si `activo` fue
 *    provisto, `activar()`/`desactivar()`.
 * 4. Persiste en transacción.
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E2. Tarea: T8.3.
 */
export class EditarUbicacionUseCase {
  constructor(
    private readonly ubicacionRepo: Pick<IUbicacionRepository, 'findById' | 'save'>,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: EditarUbicacionDto): Promise<Result<UbicacionEntity, DomainError>> {
    const ubicacion = await this.ubicacionRepo.findById(dto.ubicacionId);
    if (!ubicacion || ubicacion.isDeleted()) {
      return Result.fail(new UbicacionNoEncontradaError(dto.ubicacionId));
    }

    if (dto.padreId) {
      const padre = await this.ubicacionRepo.findById(dto.padreId);
      if (!padre || padre.isDeleted()) {
        return Result.fail(new UbicacionInvalidaError(dto.padreId));
      }
    }

    ubicacion.actualizar({
      nombre: dto.nombre,
      descripcion: dto.descripcion,
      padreId: dto.padreId,
    });
    if (dto.activo !== undefined) {
      if (dto.activo) {
        ubicacion.activar();
      } else {
        ubicacion.desactivar();
      }
    }

    await this.txRunner.run(async () => {
      await this.ubicacionRepo.save(ubicacion);
    });

    return Result.ok(ubicacion);
  }
}
