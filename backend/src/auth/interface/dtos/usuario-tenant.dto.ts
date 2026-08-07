/**
 * DTOs de entrada/salida de `UsuariosController` — gestión mínima de
 * usuarios del tenant (sdd/beta-frontend/spec §5).
 *
 * `CreateUsuarioTenantDto`/`CambiarRolUsuarioDto` NO declaran un campo
 * `clienteId`: el `ValidationPipe` global (`whitelist: true`, ver
 * `auth.dto.ts`) descarta cualquier propiedad no declarada en el body — el
 * `clienteId` de la membresía creada/mutada SIEMPRE es `actor.cliente_id`
 * (JWT), nunca un valor de la request. Es el mecanismo de aislamiento
 * estricto (spec §5: "NUNCA permite crear membresías en otro cliente que no
 * sea el del token").
 */
import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

/** `rolCodigo`: mayúsculas/guion bajo, sin espacios (consistente con el seed RBAC real). */
const ROL_CODIGO_PATTERN = /^[A-Z_]+$/;

/** Body de `POST /usuarios`. Permisos `usuario:gestionar` + `rol:asignar`. */
export class CreateUsuarioTenantDto {
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

  @IsString()
  @Matches(ROL_CODIGO_PATTERN, {
    message: 'rolCodigo debe ser mayúsculas/guion bajo, sin espacios',
  })
  rolCodigo!: string;
}

/** Body de `PATCH /usuarios/:id/rol`. Permisos `usuario:gestionar` + `rol:asignar`. */
export class CambiarRolUsuarioDto {
  @IsString()
  @Matches(ROL_CODIGO_PATTERN, {
    message: 'rolCodigo debe ser mayúsculas/guion bajo, sin espacios',
  })
  rolCodigo!: string;
}

/**
 * Item de `GET /usuarios` — usuarios con membresía activa en el cliente del
 * token. `email` es OMITIDO salvo que el actor tenga `usuario:gestionar`
 * ("datos sensibles solo con usuario:gestionar", spec §5) — la lista básica
 * para el selector de asignación (`ticket:asignar`/`ticket:ver_todos`) no lo
 * necesita.
 */
export interface UsuarioTenantResponseDto {
  id: string;
  nombre: string;
  apellido: string;
  rol: string;
  email?: string;
}

/** Respuesta de `POST /usuarios` y `PATCH /usuarios/:id/rol`. */
export interface UsuarioTenantMembresiaResponseDto {
  usuarioId: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: string;
  membresiaId: string;
  activo: boolean;
}
