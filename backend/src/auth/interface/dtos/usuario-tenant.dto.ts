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
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CATALOGO_MODULOS, CodigoAccion, PARES_VALIDOS } from '../../../shared/domain/acciones';

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

/**
 * Body de `PATCH /usuarios/:id/rol`. `AdminClienteGuard`.
 *
 * `reaplicarPreset` (R6, confirmado por el usuario — #2220): OPCIONAL, default
 * `false`/ausente. Con `true`, SOBRESCRIBE (no fusiona) la matriz de permisos
 * del usuario en este cliente con el preset del rol DESTINO (`rolCodigo`) —
 * el frontend DEBE mostrar confirmación explícita antes de enviarlo, porque
 * pisa cualquier ajuste fino que el ADMINISTRADOR haya hecho a mano en la
 * grilla de ese usuario.
 */
export class CambiarRolUsuarioDto {
  @IsString()
  @Matches(ROL_CODIGO_PATTERN, {
    message: 'rolCodigo debe ser mayúsculas/guion bajo, sin espacios',
  })
  rolCodigo!: string;

  @IsOptional()
  @IsBoolean()
  reaplicarPreset?: boolean;
}

/**
 * Body de `PATCH /usuarios/:id`. Permiso `usuario:gestionar` (ADMINISTRADOR;
 * ROOT bypassa el guard). Edita SOLO nombre y/o apellido — el `email` NO es
 * editable (identidad de acceso global). Ambos campos son opcionales (patch
 * parcial): enviar solo los que se quieren cambiar. `@MaxLength(100)` acota la
 * longitud, mismo criterio que el resto de datos de identidad.
 */
export class EditarUsuarioDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  apellido?: string;
}

// ─── ABM de la matriz de permisos (WU-7.4, sdd/matriz-permisos-por-usuario, ADR-P10) ───

/**
 * Body de `PATCH /usuarios/:id/permisos`. `AdminClienteGuard`. Reemplaza el
 * set COMPLETO de celdas del usuario en el cliente del token (semántica de
 * reemplazo total, no de fusión — mismo criterio que tenía el ABM viejo de
 * módulos, retirado en WU-7.6).
 * `@IsIn([...PARES_VALIDOS])` valida contra el catálogo real de la matriz
 * (única fuente de verdad, `shared/domain/acciones`) — un código inválido da
 * 422 acá, antes de llegar al CHECK de la DB (última red, ADR-P10).
 * `@ArrayUnique` evita duplicados en el body (el repo igual deduplica).
 */
export class AsignarPermisosDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  @IsIn([...PARES_VALIDOS], { each: true })
  celdas!: CodigoAccion[];
}

/**
 * Body de `POST /usuarios/:id/permisos/aplicar-preset`. `AdminClienteGuard`.
 * Copia la plantilla del rol `rolCodigo` sobre la matriz del usuario `:id`
 * EN EL CLIENTE DEL TOKEN (ADR-P9) — acción explícita de UI ("copiar
 * plantilla"), independiente de `PATCH /usuarios/:id/rol`.
 */
export class AplicarPresetPermisosDto {
  @IsString()
  @Matches(ROL_CODIGO_PATTERN, {
    message: 'rolCodigo debe ser mayúsculas/guion bajo, sin espacios',
  })
  rolCodigo!: string;
}

/**
 * Respuesta de `GET /usuarios/:id/permisos`. `catalogo` viaja completo para
 * que el frontend arme la grilla módulo × acción sin una segunda llamada
 * (ADR-P10) — incluye qué acciones del "piso" soporta cada módulo, para
 * deshabilitar las que no aplican (R1).
 */
export interface PermisosUsuarioTenantResponseDto {
  celdas: CodigoAccion[];
  esAdministrador: boolean;
  catalogo: typeof CATALOGO_MODULOS;
}

/**
 * Item de `GET /usuarios` — usuarios con membresía activa en el cliente del
 * token. `email` es OMITIDO salvo que el actor sea ADMINISTRADOR o ROOT (R10,
 * `esAdminDeCliente`) — la lista básica para el selector de asignación
 * (`TICKETS:ASIGNAR`/`TICKETS:VER_TODOS`) no lo necesita.
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
