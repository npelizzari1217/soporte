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
import {
  CLIENTE_CUIT_MAX_LENGTH,
  CLIENTE_NOMBRE_MAX_LENGTH,
  CLIENTE_RAZON_SOCIAL_MAX_LENGTH,
} from '../../domain/entities/cliente.entity';
import {
  USUARIO_APELLIDO_MAX_LENGTH,
  USUARIO_NOMBRE_MAX_LENGTH,
} from '../../../auth/domain/entities/usuario.entity';

/**
 * Body de `POST /clientes`. Solo ROOT (`GlobalAdminGuard`, R16).
 *
 * Topes de largo, y de quién es la autoridad de cada uno: `nombre`,
 * `razonSocial` y `cuit` los importan de `ClienteEntity`;
 * `adminNombre`/`adminApellido` de `UsuarioEntity`, porque escriben
 * `usuarios.nombre`/`apellido` — las MISMAS columnas que el ABM de usuarios.
 * Esa columna se escribe desde dos altas distintas y hasta este cambio ninguna
 * la acotaba; cerrar una sola habría dejado la clase abierta con apariencia de
 * cerrada.
 *
 * `adminEmail` es el único sin tope propio, a propósito: `@IsEmail` ya acota
 * más fuerte que su columna `VarChar(255)` — el RFC limita el total a 254, así
 * que un `@MaxLength` ahí sería un guard que nunca podría dispararse.
 */
export class CreateClienteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(CLIENTE_NOMBRE_MAX_LENGTH)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(CLIENTE_RAZON_SOCIAL_MAX_LENGTH)
  razonSocial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(CLIENTE_CUIT_MAX_LENGTH)
  cuit?: string;

  @IsEmail()
  adminEmail!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(USUARIO_NOMBRE_MAX_LENGTH)
  adminNombre!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(USUARIO_APELLIDO_MAX_LENGTH)
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
  @MaxLength(CLIENTE_NOMBRE_MAX_LENGTH)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(CLIENTE_RAZON_SOCIAL_MAX_LENGTH)
  razonSocial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(CLIENTE_CUIT_MAX_LENGTH)
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
  /**
   * Habilita la emisión de encuestas CSAT al cerrar un ticket de este
   * cliente (sdd/csat). A diferencia de la contraseña de correo, no es un
   * secreto — se incluye directo en el listado (`GET /clientes`) sin
   * necesitar un detalle aparte, así el checkbox de
   * `ConfigurarCsatDialog` arranca prellenado con el valor real.
   */
  csatHabilitado: boolean;
}

/**
 * Body de `PATCH /clientes/:id/csat` (prender/apagar CSAT de un cliente,
 * sdd/csat WU10.2). Ruta SEPARADA de `PATCH /clientes/:id` (edición
 * comercial), mismo criterio que `/correo` (D7).
 */
export class ConfigurarCsatClienteDto {
  @IsBoolean()
  habilitado!: boolean;
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
