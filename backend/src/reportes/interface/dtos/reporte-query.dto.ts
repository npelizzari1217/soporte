import { IsOptional, IsUUID } from 'class-validator';

/**
 * ReporteQueryDto — query params compartidos por todos los endpoints de reportes.
 *
 * cicloId es opcional: si se omite, el use case usa el ciclo activo del tenant.
 *
 * Convertido de interface a class para que el ValidationPipe global pueda
 * validarlo: una interface se borra en compilación (metatype queda en Object)
 * y el pipe saltea la validación en silencio.
 *
 * Tarea: T4.13 (PR4, admin-general) + tech-debt-validation-pipe (class-validator)
 */
export class ReporteQueryDto {
  @IsOptional()
  @IsUUID()
  cicloId?: string;
}
