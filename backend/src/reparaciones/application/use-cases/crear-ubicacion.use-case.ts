import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { UbicacionEntity } from '../../domain/entities/ubicacion.entity';
import { IUbicacionRepository } from '../../domain/ports/i-ubicacion.repository';
import { PadreUbicacionEliminadoError } from '../../domain/errors/reparaciones.errors';

/**
 * DTO para crear una nueva ubicación física.
 */
export interface CrearUbicacionDto {
  /** Nombre del espacio físico. */
  nombre: string;
  /** Descripción adicional (opcional). */
  descripcion?: string | null;
  /** UUID del nodo padre (null = nodo raíz). */
  padreId?: string | null;
}

/**
 * CrearUbicacionUseCase — crea una nueva ubicación física en la jerarquía.
 *
 * Flujo:
 * 1. Si padreId provisto: valida que el padre existe y no fue eliminado (PadreUbicacionEliminadoError).
 * 2. Crea la UbicacionEntity (activo=true, UUIDv7).
 * 3. Persiste en transacción.
 * 4. Retorna Result.ok(ubicacion).
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:reparaciones/Ubicaciones jerárquicas]
 * Tarea: 5.B.7 / 5.B.8
 */
export class CrearUbicacionUseCase {
  constructor(
    private readonly ubicacionRepo: IUbicacionRepository,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: CrearUbicacionDto): Promise<Result<UbicacionEntity, DomainError>> {
    // 1. Validar el padre si se proveyó
    if (dto.padreId) {
      const padre = await this.ubicacionRepo.findById(dto.padreId);
      if (!padre || padre.isDeleted()) {
        return Result.fail(new PadreUbicacionEliminadoError(dto.padreId));
      }
    }

    // 2. Crear la entidad (activo=true por defecto, UUIDv7 generado por BaseEntity)
    const ubicacion = UbicacionEntity.create({
      nombre: dto.nombre,
      descripcion: dto.descripcion ?? null,
      padreId: dto.padreId ?? null,
    });

    // 3. Persistir en transacción
    await this.txRunner.run(async () => {
      await this.ubicacionRepo.save(ubicacion);
    });

    return Result.ok(ubicacion);
  }
}
