/**
 * DTOs de entrada/salida para `TiposComponenteController` (catálogo MASTER
 * de tipos de componente).
 *
 * `class` (no `interface`) para que `class-validator` funcione con el
 * `ValidationPipe` global (ver `auth.dto.ts`/`ciclo-vigente.dto.ts` para el
 * porqué).
 *
 * Tarea: sdd/tipos-componente-master (PR2 — ABM del catálogo maestro).
 */
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

/** Body de `POST /tipos-componente`. */
export class CrearTipoComponenteDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  codigo!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  nombre!: string;
}

/**
 * Body de `PATCH /tipos-componente/:id`. Solo `nombre` — `codigo` es
 * inmutable (ver JSDoc de `TipoComponente`), no se acepta en este DTO.
 */
export class RenombrarTipoComponenteDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  nombre!: string;
}

/** Respuesta de los endpoints de `TiposComponenteController`. */
export interface TipoComponenteResponseDto {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
}
