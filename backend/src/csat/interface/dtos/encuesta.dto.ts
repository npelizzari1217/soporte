/**
 * DTOs de entrada/salida de `EncuestaPublicaController` (WU7, tarea 7.2).
 *
 * `class` (no `interface`): con `interface` el metatype es `Object` y el
 * `ValidationPipe` global (`whitelist: true, transform: true`, ver
 * `app.module.ts`) saltea la validación en silencio — mismo criterio que
 * `auth/interface/dtos/auth.dto.ts`.
 *
 * `puntaje` SIN `@Min`/`@Max` a propósito: el rango 1-5 lo valida
 * `PuntajeCsat` en `ResponderEncuestaUseCase` (dominio), no el DTO — el DTO
 * solo garantiza el TIPO (número). Duplicar el rango acá lo dejaría en dos
 * lugares que podrían desincronizarse.
 *
 * Ref spec: sdd/csat/spec, Requirement "Registro de la respuesta (uso
 * único)". Ref design: sección "Contratos" (respuesta pública mínima).
 * Tarea: 7.2.
 */
import { IsNumber, IsOptional, IsString } from 'class-validator';

/** Body de `POST /publico/encuesta/:token`. */
export class ResponderEncuestaRequestDto {
  @IsNumber()
  puntaje!: number;

  @IsOptional()
  @IsString()
  comentario?: string;
}

/**
 * Respuesta pública de `GET`/`POST /publico/encuesta/:token` — SOLO el
 * número de ticket (spec, "Respuesta HTTP mínima"). Nunca título,
 * descripción, ni ningún otro dato del tenant.
 */
export interface EncuestaPublicaResponseDto {
  readonly numero: string;
}
