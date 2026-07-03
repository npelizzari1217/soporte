/**
 * DTOs de entrada/salida para AuthController y UsuariosController.
 *
 * CreateUsuarioDto usa class-validator (convertido de interface a class):
 * la validación de rol se realiza via @IsIn(ROLES_VALIDOS), reemplazando el
 * chequeo manual que existía en el controller.
 *
 * Tarea: 2.D.4 + T3.7 + tech-debt-validation-pipe (class-validator)
 */

import { IsEmail, IsIn, IsNotEmpty, IsString, MinLength } from 'class-validator';
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

/**
 * Roles válidos que se pueden asignar a un usuario nuevo via POST /usuarios.
 * Spec ref: clientes-tenancy/POST /usuarios — campo `rol`
 * Tarea: T3.7
 */
export const ROLES_VALIDOS = ['USUARIO', 'COLABORADOR', 'TECNICO', 'ADMINISTRADOR'] as const;
export type RolValido = (typeof ROLES_VALIDOS)[number];

/**
 * AsignarRolDto — body de POST /usuarios/:id/roles (endpoint legacy, permiso rol:asignar).
 *
 * Convertida de interface a class (class-validator): sin este cambio el
 * ValidationPipe global saltea la validación en silencio (metatype === Object),
 * permitiendo asignar códigos de rol legacy soft-deleted (ej. 'ADMIN').
 *
 * Tarea: rbac-security-hardening — Fix 3
 */
export class AsignarRolDto {
  @IsIn(ROLES_VALIDOS)
  rolCodigo!: string;
}

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
 * Tarea: T3.7 + tech-debt-validation-pipe (class-validator)
 */
export class CreateUsuarioDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @IsString()
  @IsNotEmpty()
  apellido!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  /** Uno de: USUARIO | COLABORADOR | TECNICO | ADMINISTRADOR */
  @IsIn(ROLES_VALIDOS)
  rol!: string;
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
