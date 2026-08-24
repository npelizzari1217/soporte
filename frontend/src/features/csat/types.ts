/**
 * Tipos del módulo CSAT (frontend) — página pública de la encuesta de
 * satisfacción, WU8.
 *
 * Espejo del contrato del backend (`EncuestaPublicaResponseDto`,
 * `backend/src/csat/interface/dtos/encuesta.dto.ts`): la respuesta pública
 * NUNCA trae título, descripción ni ningún otro dato del tenant — solo el
 * número de ticket (spec, "Respuesta HTTP mínima").
 *
 * Ref spec: sdd/csat/spec. Tarea: 8.2.
 */

/** Respuesta de `GET`/`POST /publico/encuesta/:token`. */
export interface EncuestaPublicaResponse {
  readonly numero: string;
}
