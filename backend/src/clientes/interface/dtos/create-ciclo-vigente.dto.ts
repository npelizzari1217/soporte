import { IsBoolean, IsDateString, IsNotEmpty, IsString } from 'class-validator';

/**
 * CreateCicloVigenteDto — body de la request POST /ciclos-vigentes.
 *
 * Las fechas se reciben como string ISO 8601 (YYYY-MM-DD) y se convierten
 * a Date en el controller antes de pasarlas al use case.
 *
 * Tarea: 1.D.2 + tech-debt-validation-pipe (class-validator)
 */
export class CreateCicloVigenteDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @IsDateString()
  fechaInicio!: string;

  @IsDateString()
  fechaFin!: string;

  @IsBoolean()
  activo!: boolean;
}
