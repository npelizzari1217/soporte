/**
 * DTOs de entrada/salida para `CicloVigenteController` (catálogo master).
 *
 * `class` (no `interface`) para que `class-validator` funcione con el
 * `ValidationPipe` global (ver `auth.dto.ts` para el porqué).
 *
 * Tarea: T9.3 (PR9 — Ciclos)
 */
import { MaxLength, IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CICLO_VIGENTE_NOMBRE_MAX_LENGTH } from '../../domain/entities/ciclo-vigente.entity';

/** Body de `POST /ciclos-vigentes`. Fechas como ISO 8601 (YYYY-MM-DD). */
export class CreateCicloVigenteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(CICLO_VIGENTE_NOMBRE_MAX_LENGTH)
  nombre!: string;

  @IsDateString()
  fechaInicio!: string;

  @IsDateString()
  fechaFin!: string;
}

/**
 * Body de `PATCH /ciclos-vigentes/:id` (sdd/ciclos-abm-root). PATCH
 * semántico: campos ausentes/`undefined` no se tocan. `nombre` no acepta
 * string vacío si viene provisto (`@IsNotEmpty` solo corre si el campo
 * está presente, por `@IsOptional`).
 */
export class UpdateCicloVigenteDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(CICLO_VIGENTE_NOMBRE_MAX_LENGTH)
  nombre?: string;

  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsDateString()
  fechaFin?: string;
}

/** Respuesta de `POST /ciclos-vigentes` y `GET /ciclos-vigentes` (item 4). */
export interface CicloVigenteResponseDto {
  id: string;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  activo: boolean;
}

/**
 * Respuesta de `GET /ciclos-vigentes/admin` (sdd/ciclos-abm-root, ROOT).
 * Extiende la respuesta pública con `eliminado` — la pantalla ABM necesita
 * distinguir ciclos soft-deleted (deshabilita editar/eliminar) sin exponer
 * ese detalle en la respuesta pública que consume el tenant.
 */
export interface CicloVigenteAdminResponseDto extends CicloVigenteResponseDto {
  eliminado: boolean;
}
