/**
 * DTOs de entrada/salida de `FeriadosClienteController` (feriados de
 * TENANT, `feriados_cliente`). Tarea 4.2, sdd/feriados-configurables.
 *
 * Mismo shape que `feriado.dto.ts` (feriados GLOBALES), reusando las
 * constantes del dominio (D9), pero clases separadas: dos recursos HTTP
 * distintos (`/feriados` vs `/feriados-cliente`) con owners de escritura
 * distintos (ROOT vs ADMINISTRADOR de cliente) — mismo criterio que
 * `catalogo.dto.ts` frente a otros DTOs de shape similar.
 *
 * `fecha` usa `@Matches(FECHA_CALENDARIO_REGEX)`, NO `@IsDateString` (D2):
 * el regex es NECESARIO pero no SUFICIENTE — `2026-02-30` lo pasa igual;
 * la validación real corre en `FechaCalendario.crear()`, mapeada a 422 por
 * `FechaCalendarioInvalidaError` (D7).
 */
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import {
  FECHA_CALENDARIO_REGEX,
  FERIADO_DESCRIPCION_MAX_LENGTH,
} from '../../domain/feriados.constants';

const FECHA_MENSAJE = "fecha debe tener el formato 'YYYY-MM-DD'";

/** Body de `POST /feriados-cliente`. */
export class CreateFeriadoClienteDto {
  @IsString()
  @Matches(FECHA_CALENDARIO_REGEX, { message: FECHA_MENSAJE })
  fecha!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(FERIADO_DESCRIPCION_MAX_LENGTH)
  descripcion!: string;
}

/**
 * Body de `PATCH /feriados-cliente/:id`. Full-replace (mismo criterio que
 * `UpdateFeriadoDto`): `EditarFeriadoClienteUseCase` reemplaza `fecha` y
 * `descripcion` enteras, así que ambos campos son obligatorios acá.
 */
export class UpdateFeriadoClienteDto {
  @IsString()
  @Matches(FECHA_CALENDARIO_REGEX, { message: FECHA_MENSAJE })
  fecha!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(FERIADO_DESCRIPCION_MAX_LENGTH)
  descripcion!: string;
}

/** Respuesta de `GET`/`POST`/`PATCH /feriados-cliente` (Interfaces/Contracts, design.md). */
export interface FeriadoClienteResponseDto {
  id: string;
  fecha: string;
  descripcion: string;
}
