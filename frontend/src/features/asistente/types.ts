/**
 * Tipos del asistente de la Ayuda: espejo de `ConsultaAsistenteResponseDto` del backend
 * (odd/asistente-ia-ayuda, T3).
 */

/** `ia`: redactó el modelo; `respaldo`: texto tomado de la Ayuda; `sin_resultados`: no hay nada. */
export type ModoRespuesta = "ia" | "respaldo" | "sin_resultados";

/** Artículo de la Ayuda citado en la respuesta. */
export interface FuenteAsistente {
  articuloId: string;
  titulo: string;
}

/** Respuesta de `POST /asistente/consultas`. */
export interface RespuestaAsistente {
  respuesta: string;
  modo: ModoRespuesta;
  fuentes: FuenteAsistente[];
}

/** Tope de la consulta: `LARGO_MAXIMO_CONSULTA` de `backend/src/asistente/domain/consulta-asistente.ts`. */
export const LARGO_MAXIMO_CONSULTA = 600;
