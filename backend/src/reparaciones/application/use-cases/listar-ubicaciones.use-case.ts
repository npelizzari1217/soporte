import { DomainError, Result } from '../../../shared/domain/result';
import { UbicacionEntity } from '../../domain/entities/ubicacion.entity';
import { IUbicacionRepository } from '../../domain/ports/i-ubicacion.repository';

/**
 * ListarUbicacionesUseCase — caso de uso de consulta para el catálogo de
 * ubicaciones del tenant (F3-E2).
 *
 * Retorna todas las ubicaciones (activas e inactivas; excluye
 * soft-deleted) — el endpoint es de lectura abierta (cualquier usuario
 * autenticado), necesario para poblar selectores de ubicación en la UI.
 *
 * Tarea: T8.5.
 */
export class ListarUbicacionesUseCase {
  constructor(private readonly ubicacionRepo: Pick<IUbicacionRepository, 'findAll'>) {}

  async execute(): Promise<Result<UbicacionEntity[], DomainError>> {
    const ubicaciones = await this.ubicacionRepo.findAll();
    return Result.ok(ubicaciones);
  }
}
