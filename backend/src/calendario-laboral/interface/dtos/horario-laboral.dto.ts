/**
 * DTOs de entrada/salida de `HorarioLaboralController` (horario laboral del
 * TENANT, `calendario_laboral_dias_cliente`). Tarea 6a.1, sdd/horario-laboral-por-cliente.
 *
 * `dias` es un `PUT` full-replace de las 7 filas (D6/D9, `design.md`): siempre
 * exactamente 7 entradas, una por `diaSemana` (0..6). `aperturaMinuto`/
 * `cierreMinuto` van con `@ValidateIf(v !== null)` y no con `@IsOptional`
 * (precedente `catalogo.dto.ts:95`): `@IsOptional` saltea también el `null`,
 * que llegaría intacto a `HorarioLaboralSemanal.crear()` en vez de rechazarse
 * acá cuando falta directamente. `@ValidateNested`/`@Type` de la lista sigue
 * el precedente de `insumos.dto.ts:206-208`. Los números y el largo fijo
 * salen de `horario-laboral.constants.ts` (D9/D15): borde y dominio nunca
 * divergen.
 */
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  DIAS_POR_SEMANA,
  MINUTO_MINIMO_DIA,
  MINUTOS_POR_DIA,
} from '../../domain/constants/horario-laboral.constants';

/** Un día del body de `PUT /horario-laboral`. */
export class DiaHorarioLaboralDto {
  @IsInt()
  @Min(0)
  @Max(6)
  diaSemana!: number;

  @ValidateIf((_objeto: DiaHorarioLaboralDto, valor: unknown) => valor !== null)
  @IsInt()
  @Min(MINUTO_MINIMO_DIA)
  @Max(MINUTOS_POR_DIA)
  aperturaMinuto!: number | null;

  @ValidateIf((_objeto: DiaHorarioLaboralDto, valor: unknown) => valor !== null)
  @IsInt()
  @Min(MINUTO_MINIMO_DIA)
  @Max(MINUTOS_POR_DIA)
  cierreMinuto!: number | null;
}

/** Body de `PUT /horario-laboral`. Siempre las 7 filas completas (full-replace, D6). */
export class HorarioLaboralDto {
  @IsArray()
  @ArrayMinSize(DIAS_POR_SEMANA)
  @ArrayMaxSize(DIAS_POR_SEMANA)
  @ValidateNested({ each: true })
  @Type(() => DiaHorarioLaboralDto)
  dias!: DiaHorarioLaboralDto[];
}

/** Un día en la respuesta de `GET`/`PUT /horario-laboral`, ordenado 0..6. */
export interface DiaHorarioLaboralResponseDto {
  diaSemana: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  aperturaMinuto: number | null;
  cierreMinuto: number | null;
}

/** Respuesta de `GET`/`PUT /horario-laboral` (Interfaces/Contratos, `design.md`). */
export interface HorarioLaboralResponseDto {
  dias: DiaHorarioLaboralResponseDto[];
}
