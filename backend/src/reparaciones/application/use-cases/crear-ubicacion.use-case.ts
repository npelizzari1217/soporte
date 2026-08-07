import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { UbicacionEntity } from '../../domain/entities/ubicacion.entity';
import { IUbicacionRepository } from '../../domain/ports/i-ubicacion.repository';
import { UbicacionInvalidaError } from '../../domain/errors/reparaciones.errors';

/** DTO para crear una nueva ubicación física (F3-E2). */
export interface CrearUbicacionDto {
  /** Nombre del espacio físico. */
  nombre: string;
  /** Descripción adicional (opcional). */
  descripcion?: string | null;
  /** UUID del nodo padre. Omitido/`null` = nodo raíz. */
  padreId?: string | null;
}

/**
 * CrearUbicacionUseCase — crea una nueva ubicación física en la jerarquía
 * del tenant (F3-E2, catálogo `catalogo:gestionar`).
 *
 * Flujo:
 * 1. Si `padreId` fue provisto: valida que exista y no esté eliminado
 *    (soft delete) → `UbicacionInvalidaError` si no.
 * 2. Crea la `UbicacionEntity` (`activo=true` por defecto, UUIDv7).
 * 3. Persiste en transacción.
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E2. Tarea: T8.3.
 */
export class CrearUbicacionUseCase {
  constructor(
    private readonly ubicacionRepo: Pick<IUbicacionRepository, 'findById' | 'save'>,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: CrearUbicacionDto): Promise<Result<UbicacionEntity, DomainError>> {
    if (dto.padreId) {
      const padre = await this.ubicacionRepo.findById(dto.padreId);
      if (!padre || padre.isDeleted()) {
        return Result.fail(new UbicacionInvalidaError(dto.padreId));
      }
    }

    const ubicacion = UbicacionEntity.create({
      nombre: dto.nombre,
      descripcion: dto.descripcion ?? null,
      padreId: dto.padreId ?? null,
    });

    await this.txRunner.run(async () => {
      await this.ubicacionRepo.save(ubicacion);
    });

    return Result.ok(ubicacion);
  }
}
