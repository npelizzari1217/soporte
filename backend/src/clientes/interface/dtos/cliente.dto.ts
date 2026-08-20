/**
 * DTOs de entrada/salida para `ClientesController` (alta de tenant, R16).
 *
 * `class` (no `interface`) para que `class-validator` funcione con el
 * `ValidationPipe` global (ver `auth.dto.ts` para el porqué).
 *
 * Tarea: T8.4 (PR8 — CrearClienteUseCase + ClientesController)
 */
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Body de `POST /clientes`. Solo ROOT (`GlobalAdminGuard`, R16). */
export class CreateClienteDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @IsOptional()
  @IsString()
  razonSocial?: string;

  @IsOptional()
  @IsString()
  cuit?: string;

  @IsEmail()
  adminEmail!: string;

  @IsString()
  @IsNotEmpty()
  adminNombre!: string;

  @IsString()
  @IsNotEmpty()
  adminApellido!: string;

  @IsString()
  @IsNotEmpty()
  adminPassword!: string;
}

/**
 * Body de `PATCH /clientes/:id` (edición de datos comerciales, solo ROOT).
 * Patch parcial: todos los campos son opcionales. NO incluye `dbName`
 * (inmutable — identifica la DB física) ni campos de admin (el ABM de admins
 * es otro flujo).
 */
export class UpdateClienteDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  razonSocial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cuit?: string;
}

/** Respuesta de `POST /clientes`. */
export interface ClienteResponseDto {
  id: string;
  nombre: string;
  razonSocial: string | null;
  cuit: string | null;
  dbName: string;
  activo: boolean;
}

/**
 * Body de `PATCH /clientes/:id/correo` (configurar correo de un cliente,
 * sdd/configuracion-correo-por-cliente D7). Todo-o-nada salvo `password`:
 * host/port/user/secure/from son SIEMPRE requeridos; `password` es el ÚNICO
 * campo opcional — omitirlo preserva la contraseña ya guardada, un string
 * vacío se rechaza (`@IsNotEmpty()`, NUNCA significa "borrar" — borrar es
 * `DELETE /clientes/:id/correo`, una acción explícita y separada).
 */
export class ConfigurarCorreoClienteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  host!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  user!: string;

  @IsBoolean()
  secure!: boolean;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  from!: string;

  /** `undefined` = preservar la contraseña existente. `""` se rechaza. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  password?: string;
}

/**
 * Respuesta de `GET/PATCH/DELETE /clientes/:id/correo` y
 * `POST /clientes/:id/correo/probar` (D7). Espejo intencional de
 * `ClienteEmailConfigState` (domain) — la contraseña NO existe en este tipo
 * bajo NINGUNA forma (ni null, ni "***", ni su longitud): un campo que no
 * existe no se puede filtrar por accidente.
 */
export interface ClienteCorreoResponseDto {
  configurado: boolean;
  host: string | null;
  port: number | null;
  user: string | null;
  secure: boolean | null;
  from: string | null;
  verificadoAt: Date | null;
  verificacionError: string | null;
}

/**
 * Resumen MÍNIMO de correo embebido en `GET /clientes` (listado). Solo lo
 * necesario para que el estado "correo no configurado" sea VISIBLE en el
 * listado (decisión #2359 del usuario) sin abrir la ficha de cada cliente —
 * deliberadamente NO incluye host/user/from (eso vive solo en el detalle,
 * `GET /clientes/:id/correo`). Contraseña: fuera de este tipo, como siempre.
 */
export interface ClienteCorreoResumenDto {
  configurado: boolean;
  verificadoAt: Date | null;
}

/** Respuesta de `GET /clientes` (listado) — `ClienteResponseDto` + resumen de correo. */
export interface ClienteListItemResponseDto extends ClienteResponseDto {
  correo: ClienteCorreoResumenDto;
}
