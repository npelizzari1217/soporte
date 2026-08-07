import { DomainError } from '../../../shared/domain/result';

/**
 * KbArticuloNoEncontradoError — el artículo de KB con el id indicado no
 * existe en el tenant activo, está soft-deleted, o (para un actor sin
 * `ticket:ver_todos`) no es visible para el solicitante — en los tres casos
 * se responde 404 sin revelar cuál de las condiciones aplica (mismo criterio
 * que `TicketNoEncontradoError`, K3).
 * → HTTP 404 en la capa de presentación.
 *
 * Ref spec: sdd/premium/spec K1, K3. Tarea: K2.
 */
export class KbArticuloNoEncontradoError extends DomainError {
  readonly code = 'KB_ARTICULO_NO_ENCONTRADO';

  constructor(id: string) {
    super(`Artículo de KB con id "${id}" no encontrado.`);
  }
}

/**
 * TituloVacioError — el `titulo` de un artículo de KB es vacío/blank al
 * crear o editar.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: sdd/premium/spec K1. Tarea: K2.
 */
export class TituloVacioError extends DomainError {
  readonly code = 'TITULO_VACIO';

  constructor() {
    super('El título del artículo de KB no puede estar vacío.');
  }
}

/**
 * ContenidoVacioError — el `contenido` de un artículo de KB es vacío/blank
 * al crear o editar.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: sdd/premium/spec K1. Tarea: K2.
 */
export class ContenidoVacioError extends DomainError {
  readonly code = 'CONTENIDO_VACIO';

  constructor() {
    super('El contenido del artículo de KB no puede estar vacío.');
  }
}
