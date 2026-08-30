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
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  TIPO_COMPONENTE_CODIGO_MAX_LENGTH,
  TIPO_COMPONENTE_NOMBRE_MAX_LENGTH,
  normalizarCodigoTipoComponente,
} from '../../domain/entities/tipo-componente.entity';

/** Body de `POST /tipos-componente`. */
export class CrearTipoComponenteDto {
  /**
   * El `@Transform` NO es cosmético: normaliza con la MISMA función del dominio
   * para que `@MaxLength` mida el string que realmente va a la columna.
   * `toUpperCase()` puede agrandar (`'ß'` → `'SS'`), así que medir el crudo
   * dejaría pasar valores que se expanden al persistir — rama 3 de la "regla de
   * tres ramas" de `equipo-informatico.entity.ts`.
   */
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizarCodigoTipoComponente(value) : value,
  )
  @MaxLength(TIPO_COMPONENTE_CODIGO_MAX_LENGTH)
  codigo!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(TIPO_COMPONENTE_NOMBRE_MAX_LENGTH)
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
  @MaxLength(TIPO_COMPONENTE_NOMBRE_MAX_LENGTH)
  nombre!: string;
}

/** Respuesta de los endpoints de `TiposComponenteController`. */
export interface TipoComponenteResponseDto {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
}
