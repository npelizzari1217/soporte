import { DomainError } from '../../../shared/domain/result';

/**
 * NoCicloActivoError — se lanza cuando se solicita un reporte sin proveer
 * cicloId y el tenant no tiene ningún ciclo con activo=TRUE.
 *
 * → HTTP 422 Unprocessable Entity en la capa de presentación.
 *
 * Spec ref: reportes/Ciclo default
 * Tarea: T4.1 (PR4, admin-general)
 */
export class NoCicloActivoError extends DomainError {
  readonly code = 'NO_CICLO_ACTIVO';

  constructor() {
    super(
      'No hay ciclo activo en este tenant. Especificá un cicloId via query param para continuar.',
    );
  }
}
