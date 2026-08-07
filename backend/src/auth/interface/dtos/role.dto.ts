/**
 * DTOs de salida para `RolesController` (`GET /roles`, sdd/beta-frontend
 * item 3). Catálogo de solo lectura — sin DTOs de entrada.
 */
import { RoleEntity } from '../../domain/entities/role.entity';

/** Shape de respuesta de un rol del catálogo global RBAC. */
export interface RoleResponseDto {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
}

/** Convierte `RoleEntity` (sin permisos cargados) al shape de respuesta HTTP. */
export function toRoleResponseDto(role: RoleEntity): RoleResponseDto {
  return {
    id: role.id,
    codigo: role.codigo,
    nombre: role.nombre,
    descripcion: role.descripcion,
  };
}
