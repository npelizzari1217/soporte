import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

/**
 * CreateCicloDto — body de la request POST /ciclos (tenant-level).
 *
 * Las fechas se reciben como string ISO 8601 (YYYY-MM-DD) y se convierten
 * a Date en el controller antes de pasarlas al use case.
 *
 * Tarea: T2.15 + tech-debt-validation-pipe (class-validator)
 */
export class CreateCicloDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  /** Fecha de inicio del ciclo. Formato ISO 8601 (ej. "2026-01-01"). */
  @IsDateString()
  fechaInicio!: string;

  /** Fecha de fin del ciclo. Formato ISO 8601 (ej. "2026-12-31"). */
  @IsDateString()
  fechaFin!: string;
}
