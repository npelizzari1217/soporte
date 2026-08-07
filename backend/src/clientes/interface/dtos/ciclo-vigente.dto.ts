/**
 * DTOs de entrada/salida para `CicloVigenteController` (catálogo master).
 *
 * `class` (no `interface`) para que `class-validator` funcione con el
 * `ValidationPipe` global (ver `auth.dto.ts` para el porqué).
 *
 * Tarea: T9.3 (PR9 — Ciclos)
 */
import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

/** Body de `POST /ciclos-vigentes`. Fechas como ISO 8601 (YYYY-MM-DD). */
export class CreateCicloVigenteDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @IsDateString()
  fechaInicio!: string;

  @IsDateString()
  fechaFin!: string;
}

/** Respuesta de `POST /ciclos-vigentes` y `GET /ciclos-vigentes` (item 4). */
export interface CicloVigenteResponseDto {
  id: string;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  activo: boolean;
}
