import { IsNotEmpty, IsUUID } from 'class-validator';

/**
 * ElegirCicloDto — body de la request POST /ciclos (tenant-level, ADR-3).
 *
 * Reemplaza CreateCicloDto: el tenant ya no crea un ciclo de cero, elige uno
 * del catálogo master por su id (cicloVigenteId). Validado en integración
 * del controller (T3.8).
 */
export class ElegirCicloDto {
  @IsUUID()
  @IsNotEmpty()
  cicloVigenteId!: string;
}
