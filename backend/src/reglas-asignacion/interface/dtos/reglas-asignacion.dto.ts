import { IsDefined, IsUUID, ValidateIf } from 'class-validator';

/**
 * Body de `PUT /reglas-asignacion/:tipoId`. `null` quita la regla del tipo (R3).
 * Solo el responsable: la regla no tiene orden, prioridad, grupo ni ubicación (R1).
 */
export class ConfigurarReglaAsignacionBodyDto {
  @IsDefined()
  @ValidateIf((_, valor: unknown) => valor !== null)
  @IsUUID()
  responsableId!: string | null;
}
