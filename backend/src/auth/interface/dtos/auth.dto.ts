/**
 * DTOs de entrada/salida para `AuthController`.
 *
 * Convertidos a `class` (no `interface`) para que `class-validator`
 * funcione con el `ValidationPipe` global (`whitelist: true, transform:
 * true`, ver `app.module.ts`) — con `interface` el metatype es `Object` y el
 * pipe saltea la validación en silencio.
 *
 * Tarea: T6.5 (PR6 — Guards + AuthController + AuthModule)
 */
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

/** Body de `POST /auth/login`. */
export class LoginRequestDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  /** Selección explícita de cliente (R5). Ausente = auto-resolución (R4). */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  clienteId?: string;
}

/** Body de `POST /auth/refresh`. */
export class RefreshRequestDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

/** Body de `POST /auth/logout`. */
export class LogoutRequestDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

/** Body de `POST /auth/switch`. */
export class SwitchTenantRequestDto {
  @IsString()
  @IsNotEmpty()
  clienteId!: string;

  /**
   * Refresh token crudo vigente (cookie `rt`, reenviada por el BFF —
   * fix #168: sin esto, `SwitchTenantUseCase` no puede mantener al día el
   * scope del refresh, y el usuario pierde el tenant elegido a los 15
   * minutos). Opcional para no romper compatibilidad con un BFF viejo.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  refreshToken?: string;
}

/**
 * Body de `POST /auth/change-password` (sdd/cambio-de-contrasena).
 *
 * `passwordActual` solo se exige presente — la verificación de posesión la
 * hace el caso de uso contra el hash almacenado, no el `ValidationPipe`.
 * `passwordNueva` con menos de 8 caracteres se rechaza ACÁ, sin ejecutar el
 * caso de uso (spec, requisito "Autenticación y validación del payload").
 */
export class CambiarPasswordRequestDto {
  @IsString()
  @IsNotEmpty()
  passwordActual!: string;

  @IsString()
  @MinLength(8)
  passwordNueva!: string;
}

/** Respuesta de éxito de login/refresh: tokens emitidos. */
export interface TokensResponseDto {
  accessToken: string;
  refreshToken: string;
}

/**
 * Respuesta de login cuando el usuario tiene >1 membresía activa y no
 * seleccionó `clienteId` explícito (R4) — el front debe mostrar el
 * selector y re-postear con el `clienteId` elegido.
 */
export interface SelectionResponseDto {
  needsClienteSelection: true;
  membresias: { cliente_id: string; nombre: string; rol: string }[];
}

/** Respuesta de `POST /auth/switch`: solo el nuevo access token (R10). */
export interface SwitchTenantResponseDto {
  accessToken: string;
}
