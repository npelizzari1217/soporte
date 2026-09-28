/**
 * DTOs de `RecuperacionPasswordController` (WU-7/WU-8).
 *
 * `class` (no `interface`): con `interface` el metatype es `Object` y el
 * `ValidationPipe` global (`whitelist: true, transform: true`, ver
 * `app.module.ts`) saltea la validación en silencio — mismo criterio que
 * `auth/interface/dtos/auth.dto.ts`.
 *
 * WU-7 solo define `SolicitarResetDto` (`POST /auth/forgot-password`).
 * `ConfirmarResetDto` (`POST /auth/reset-password`) se suma en WU-8.
 *
 * Ref spec: sdd/auth-reseteo-por-olvido/spec, Requirement "La solicitud de
 * reset devuelve una respuesta uniforme". Ref design: ADR-1, ADR-3. Tarea: 7.1.
 */
import { IsEmail } from 'class-validator';

/** Body de `POST /auth/forgot-password`. */
export class SolicitarResetDto {
  @IsEmail()
  email!: string;
}
