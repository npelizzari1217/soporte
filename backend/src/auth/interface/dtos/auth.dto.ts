/**
 * DTOs de entrada/salida para AuthController y UsuariosController.
 *
 * CreateUsuarioDto usa validación manual en el controller (rol enum) ya que
 * class-validator no está instalado. La validación de rol se realiza via
 * el enum ROLES_VALIDOS exportado desde este archivo.
 *
 * Tarea: 2.D.4 + T3.7
 */

import { UsuarioEntity } from '../../domain/entities/usuario.entity';

// ─── Auth DTO ─────────────────────────────────────────────────────────────────

export interface LoginDto {
  email: string;
  password: string;
}

export interface RefreshDto {
  /** Token crudo del refresh token (body JSON o httpOnly cookie). */
  refreshToken: string;
}

export interface LogoutDto {
  /** Token crudo a revocar. */
  refreshToken: string;
}

// ─── Usuarios DTO ─────────────────────────────────────────────────────────────

export interface AsignarRolDto {
  rolCodigo: string;
}

/**
 * Roles válidos que se pueden asignar a un usuario nuevo via POST /usuarios.
 * Spec ref: clientes-tenancy/POST /usuarios — campo `rol`
 * Tarea: T3.7
 */
export const ROLES_VALIDOS = ['USUARIO', 'COLABORADOR', 'TECNICO', 'ADMINISTRADOR'] as const;
export type RolValido = (typeof ROLES_VALIDOS)[number];

/**
 * CreateUsuarioDto — body de POST /usuarios.
 *
 * Campos requeridos según spec (clientes-tenancy/POST /usuarios):
 * - email: string (email válido)
 * - nombre, apellido: strings
 * - password: string (se hashea server-side, NEVER en respuesta)
 * - rol: uno de ROLES_VALIDOS
 *
 * El cliente_id NEVER viene del body — lo resuelve TenantGuard server-side.
 *
 * Tarea: T3.7
 */
export interface CreateUsuarioDto {
  email: string;
  nombre: string;
  apellido: string;
  password: string;
  /** Uno de: USUARIO | COLABORADOR | TECNICO | ADMINISTRADOR */
  rol: string;
}

/**
 * UsuarioResponseDto — respuesta de GET /usuarios y POST /usuarios.
 *
 * INVARIANTE DE SEGURIDAD: NUNCA incluye passwordHash ni password.
 *
 * Spec ref: clientes-tenancy/GET /usuarios, POST /usuarios
 * Tarea: T3.7
 */
export interface UsuarioResponseDto {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  clienteId: string;
  activo: boolean;
  isGlobalAdmin: boolean;
  roles: string[];
  createdAt: Date;
}

/**
 * Convierte un UsuarioEntity a UsuarioResponseDto eliminando passwordHash.
 * Función pura, sin estado, usada por los controllers de usuarios.
 */
export function toUsuarioResponse(entity: UsuarioEntity): UsuarioResponseDto {
  return {
    id: entity.id,
    email: entity.email,
    nombre: entity.nombre,
    apellido: entity.apellido,
    clienteId: entity.clienteId,
    activo: entity.activo,
    isGlobalAdmin: entity.isGlobalAdmin,
    roles: entity.roles.map((r) => r.codigo),
    createdAt: entity.createdAt,
  };
  // passwordHash NEVER incluido — invariante de seguridad
}
