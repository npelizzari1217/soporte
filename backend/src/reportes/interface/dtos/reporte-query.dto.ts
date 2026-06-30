/**
 * ReporteQueryDto — query params compartidos por todos los endpoints de reportes.
 *
 * cicloId es opcional: si se omite, el use case usa el ciclo activo del tenant.
 *
 * Tarea: T4.13 (PR4, admin-general)
 */
export interface ReporteQueryDto {
  cicloId?: string;
}
