import { IsBoolean, IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * UpdateCicloVigenteDto — body de la request PATCH /ciclos-vigentes/:id.
 *
 * Todos los campos son opcionales — el use case aplica solo los presentes.
 *
 * Tarea: T2.6
 */
export class UpdateCicloVigenteDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  nombre?: string;

  @IsDateString()
  @IsOptional()
  fechaInicio?: string;

  @IsDateString()
  @IsOptional()
  fechaFin?: string;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;
}
