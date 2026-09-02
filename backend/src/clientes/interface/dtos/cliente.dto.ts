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
  registerDecorator,
  ValidationOptions,
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
import { esZonaValida, ZONA_HORARIA_MAX_LENGTH } from '../../../shared/domain/zona-horaria';

/**
 * Decorator de `class-validator` que aplica la MISMA regla que `ZonaHoraria`
 * (D2, `esZonaValida`) — nunca la reimplementa. Sin esto, un candidato con
 * largo válido pero forma inválida (`'A'.repeat(64)`, por ejemplo) pasa el
 * borde y llega a `ZonaHoraria.crear()` dentro del use case, que LANZA (no
 * `Result`) fuera del único `try/catch` de `CrearClienteUseCase.execute()`:
 * 500 crudo en vez de 400 limpio — la misma clase de defecto que
 * `CLIENTE_CUIT_MAX_LENGTH` cerró para `cuit` (ver su JSDoc en
 * `cliente.entity.ts`), un nivel más arriba: acá no es el LARGO lo que
 * diverge entre el borde y el dominio, es la VALIDEZ.
 *
 * Exportado para que `ConfigurarZonaHorariaClienteDto` (C2b) lo reutilice
 * sin reimplementarlo.
 */
export function IsZonaHorariaValida(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (target: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'isZonaHorariaValida',
      target: target.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && esZonaValida(value);
        },
        defaultMessage(): string {
          return '$property no es una zona horaria válida';
        },
      },
    });
  };
}

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
 *
 * `zonaHoraria` es OBLIGATORIA (sdd/zona-horaria-por-tenant, decisión "Zona de
 * un cliente NUEVO: se exige explícita en el alta"): la columna `NOT NULL`
 * tiene un `DEFAULT` de backfill (D8), pero el alta nunca confía en él — el
 * próximo cliente puede ser el que motivó el cambio de zona, así que
 * defaultear acá reabriría el mismo agujero que D8 cerró. El tope de largo se
 * importa del VO (`ZONA_HORARIA_MAX_LENGTH`), no un número tipeado a mano.
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

  @IsString()
  @IsNotEmpty()
  @MaxLength(ZONA_HORARIA_MAX_LENGTH)
  @IsZonaHorariaValida()
  zonaHoraria!: string;
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
  /**
   * Zona horaria operativa del tenant (sdd/zona-horaria-por-tenant). Mismo
   * criterio que `csatHabilitado`: no es un secreto, viaja directo en el
   * listado (`GET /clientes`) y en las respuestas de alta/edición, así el
   * select de `ConfigurarZonaHorariaDialog` (C2c) arranca prellenado con el
   * valor real del tenant y no con un default.
   */
  zonaHoraria: string;
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
 * Body de `PATCH /clientes/:id/zona-horaria` (cambiar la zona operativa del
 * tenant, sdd/zona-horaria-por-tenant C2b). Ruta SEPARADA de
 * `PATCH /clientes/:id` (edición comercial), mismo criterio que `/csat` (D1).
 * Reutiliza `IsZonaHorariaValida` — nunca reimplementa la regla de validez.
 */
export class ConfigurarZonaHorariaClienteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(ZONA_HORARIA_MAX_LENGTH)
  @IsZonaHorariaValida()
  zonaHoraria!: string;
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
