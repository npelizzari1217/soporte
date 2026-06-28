import { ApiError } from '@/shared/api/types'

/**
 * mapApiError — traduce errores de API a cadenas de UI legibles.
 *
 * ADR-1: errores del servidor son form-level (strings de dominio únicos).
 * Responsabilidades:
 *   - statusCode=0 → error de red
 *   - statusCode=401 → sesión expirada
 *   - statusCode=403 → sin permiso
 *   - statusCode=404 → recurso no existe
 *   - statusCode=422 → err.message tal cual (string de dominio)
 *   - otros → mensaje genérico o err.message
 *   - no-ApiError → genérico, sin relanzar
 *
 * Design: §1.6 mapApiError contract.
 */
export function mapApiError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.statusCode) {
      case 0:
        return 'Error de red. Revisá tu conexión.'
      case 401:
        return 'Tu sesión expiró. Iniciá sesión de nuevo.'
      case 403:
        return 'No tenés permiso para esta acción.'
      case 404:
        return 'El recurso ya no existe.'
      case 422:
        return err.message
      default:
        return err.message || 'Ocurrió un error inesperado.'
    }
  }
  return 'Ocurrió un error inesperado.'
}
