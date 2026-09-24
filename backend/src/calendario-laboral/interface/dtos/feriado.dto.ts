/**
 * DTOs de entrada/salida de `FeriadosController` (feriados GLOBALES, master
 * `feriados`). Tarea 2.2, sdd/feriados-configurables.
 *
 * `fecha` usa `@Matches(FECHA_CALENDARIO_REGEX)`, NO `@IsDateString` (D2,
 * design.md): `@IsDateString` acepta un datetime con offset
 * (`'2026-10-12T02:00:00-03:00'`), que puede caer en otro día UTC. El regex
 * es NECESARIO pero no SUFICIENTE — `2026-02-30` lo pasa igual; la
 * validación de fecha real corre en `FechaCalendario.crear()` (dominio),
 * mapeada a 422 por `FechaCalendarioInvalidaError` (D7), no acá.
 *
 * `descripcion` reusa `FERIADO_DESCRIPCION_MAX_LENGTH` del dominio (D9): el
 * borde nunca inventa su propio límite.
 */
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import {
  FECHA_CALENDARIO_REGEX,
  FERIADO_DESCRIPCION_MAX_LENGTH,
} from '../../domain/feriados.constants';

const FECHA_MENSAJE = "fecha debe tener el formato 'YYYY-MM-DD'";

/** Body de `POST /feriados`. */
export class CreateFeriadoDto {
  @IsString()
  @Matches(FECHA_CALENDARIO_REGEX, { message: FECHA_MENSAJE })
  fecha!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(FERIADO_DESCRIPCION_MAX_LENGTH)
  descripcion!: string;
}

/**
 * Body de `PATCH /feriados/:id`. Full-replace (no PATCH semántico
 * parcial): `EditarFeriadoGlobalUseCase` reemplaza `fecha` y `descripcion`
 * enteras (mismo contrato que `FeriadoEntity.editar()`), así que ambos
 * campos son obligatorios acá — a diferencia de `UpdateCicloVigenteDto`.
 */
export class UpdateFeriadoDto {
  @IsString()
  @Matches(FECHA_CALENDARIO_REGEX, { message: FECHA_MENSAJE })
  fecha!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(FERIADO_DESCRIPCION_MAX_LENGTH)
  descripcion!: string;
}

/** Respuesta de `GET`/`POST`/`PATCH /feriados` (Interfaces/Contracts, design.md). */
export interface FeriadoResponseDto {
  id: string;
  fecha: string;
  descripcion: string;
}
