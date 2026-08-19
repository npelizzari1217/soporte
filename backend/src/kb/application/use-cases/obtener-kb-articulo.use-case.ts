import { DomainError, Result } from '../../../shared/domain/result';
import { KbArticuloEntity } from '../../domain/entities/kb-articulo.entity';
import { IKbArticuloRepository } from '../../domain/ports/i-kb-articulo.repository';
import { KbArticuloNoEncontradoError } from '../../domain/errors/kb.errors';

/**
 * DTO de entrada de `ObtenerKbArticuloUseCase`. `tienePermisoVerTodos` lo
 * calcula el controller con `puedeEjecutar(user, 'KB:VER_TODOS')`
 * (sdd/matriz-permisos-por-usuario, R11; antes K3) — la capa de aplicación
 * no conoce el JWT.
 */
export interface ObtenerKbArticuloDto {
  id: string;
  tienePermisoVerTodos: boolean;
}

/**
 * ObtenerKbArticuloUseCase — consulta un artículo de KB con scope por rol
 * (K3).
 *
 * - staff (`KB:VER_TODOS`) → puede ver cualquier artículo (interno o
 *   publicado) del tenant activo, incluso inactivo (gestión).
 * - USUARIO (sin el permiso) → solo si `visibleParaSolicitante=true` Y
 *   `activo=true`; caso contrario `KbArticuloNoEncontradoError` (404) — NO
 *   revela la existencia de un artículo interno (mismo criterio que
 *   `ObtenerTicketUseCase`, T6).
 * - Un artículo soft-deleted se trata como inexistente, incluso para staff.
 *
 * Ref spec: sdd/premium/spec K3. Tarea: K3/K4.
 */
export class ObtenerKbArticuloUseCase {
  constructor(private readonly repo: Pick<IKbArticuloRepository, 'findById'>) {}

  async execute(dto: ObtenerKbArticuloDto): Promise<Result<KbArticuloEntity, DomainError>> {
    const articulo = await this.repo.findById(dto.id);
    if (!articulo || articulo.isDeleted()) {
      return Result.fail(new KbArticuloNoEncontradoError(dto.id));
    }
    if (!dto.tienePermisoVerTodos && !articulo.visibleParaSolicitante) {
      return Result.fail(new KbArticuloNoEncontradoError(dto.id));
    }
    return Result.ok(articulo);
  }
}
