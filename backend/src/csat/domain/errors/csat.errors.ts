import { DomainError } from '../../../shared/domain/result';

/**
 * EncuestaLinkInvalidoError — el link público de encuesta (GET/POST
 * `/publico/encuesta/:token`) no puede procesarse. Deliberadamente ÚNICA: no
 * existe una variante por motivo (token inexistente, vencido, usado,
 * revocado, cliente inactivo o sin `csat_habilitado`). El endpoint es
 * anónimo — distinguir el motivo en el código/mensaje le filtraría a un
 * actor no autenticado si un token EXISTIÓ alguna vez, lo cual ya es
 * información. Ver `ResolverEncuestaTokenService` (ADR-C1).
 * → HTTP 404 genérico en la capa de presentación.
 *
 * Ref spec: sdd/csat/spec, Requirement "Validación del token en el endpoint
 * público". Ref design: ADR-C1. Tarea: 4.4.
 */
export class EncuestaLinkInvalidoError extends DomainError {
  readonly code = 'ENCUESTA_LINK_INVALIDO';

  constructor() {
    super('El link de la encuesta no es válido.');
  }
}

/**
 * PuntajeInvalidoError — el puntaje recibido no es un entero entre 1 y 5
 * (`PuntajeCsat.create`). A diferencia de `EncuestaLinkInvalidoError`, esta
 * validación NO oculta información: el actor ya pasó el gate del token
 * válido, así que decirle "el puntaje está fuera de rango" no filtra nada
 * sobre la existencia de otros tickets/tokens.
 * → HTTP 400 en la capa de presentación.
 *
 * Ref spec: sdd/csat/spec, Requirement "Registro de la respuesta (uso
 * único)" — "puntaje fuera de rango → 400, sin escritura". Tarea: 4.3.
 */
export class PuntajeInvalidoError extends DomainError {
  readonly code = 'PUNTAJE_INVALIDO';

  constructor(valorRecibido: unknown) {
    super(`El puntaje "${String(valorRecibido)}" no es válido: debe ser un entero entre 1 y 5.`);
  }
}
