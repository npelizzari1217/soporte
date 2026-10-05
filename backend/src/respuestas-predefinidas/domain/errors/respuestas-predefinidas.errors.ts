import { DomainError } from '../../../shared/domain/result';

/**
 * RespuestaPredefinidaNoEncontradaError — el `id` no existe en el catálogo del tenant.
 * → HTTP 404 en la capa de presentación.
 */
export class RespuestaPredefinidaNoEncontradaError extends DomainError {
  readonly code = 'RESPUESTA_PREDEFINIDA_NO_ENCONTRADA';

  constructor(id: string) {
    super(`Respuesta predefinida con id "${id}" no encontrada en el catálogo del tenant.`);
  }
}

/**
 * RespuestaPredefinidaTituloDuplicadoError — ya hay otra respuesta con ese `titulo`, sin
 * distinguir mayúsculas y contando las desactivadas (índice único sobre `lower(titulo)`).
 * → HTTP 422 en la capa de presentación.
 */
export class RespuestaPredefinidaTituloDuplicadoError extends DomainError {
  readonly code = 'RESPUESTA_PREDEFINIDA_TITULO_DUPLICADO';

  constructor(titulo: string) {
    super(`Ya existe una respuesta predefinida con título "${titulo}" (activa o desactivada).`);
  }
}
