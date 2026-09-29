/**
 * DTOs de `RecuperacionPasswordController` (WU-7/WU-8).
 *
 * `class` (no `interface`): con `interface` el metatype es `Object` y el
 * `ValidationPipe` global (`whitelist: true, transform: true`, ver
 * `app.module.ts`) saltea la validación en silencio — mismo criterio que
 * `auth/interface/dtos/auth.dto.ts`.
 *
 * `ConfirmarResetDto` NO declara `usuarioId` ni `clienteId` (design,
 * "Autorización: los dos lugares donde vive" — la posesión del token ES la
 * autorización): `whitelist: true` los descartaría en silencio si llegaran.
 * `passwordNueva` usa el mismo `@MinLength(8)` que
 * `CambiarPasswordRequestDto.passwordNueva` (`auth.dto.ts:75`).
 *
 * Ref spec: sdd/auth-reseteo-por-olvido/spec, Requirement "La solicitud de
 * reset devuelve una respuesta uniforme", "La contraseña nueva respeta el
 * mínimo de alta y usa el hasher del login". Ref design: ADR-1, ADR-3.
 * Tarea: 7.1, 8.1.
 */
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

/** Body de `POST /auth/forgot-password`. */
export class SolicitarResetDto {
  @IsEmail()
  email!: string;
}

/** Body de `POST /auth/reset-password`. */
export class ConfirmarResetDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(8)
  passwordNueva!: string;
}
