import { Result } from '../../shared/domain/result';
import { ConsultaAsistenteInvalidaError } from './asistente.errors';

/** Largo máximo de una consulta al asistente (como en sesitec). */
export const LARGO_MAXIMO_CONSULTA = 600;

/** Recorta la consulta y exige que no quede vacía ni supere el tope. */
export function validarConsulta(valor: string): Result<string, ConsultaAsistenteInvalidaError> {
  const consulta = valor.trim();
  if (consulta.length === 0 || consulta.length > LARGO_MAXIMO_CONSULTA) {
    return Result.fail(new ConsultaAsistenteInvalidaError());
  }
  return Result.ok(consulta);
}

/**
 * Cómo se armó la respuesta:
 * - `ia`: la redactó el modelo con los fragmentos de la Ayuda;
 * - `respaldo`: el cliente no tiene IA o el proveedor falló, y se devuelve el fragmento más parecido;
 * - `sin_resultados`: la Ayuda no tiene nada parecido a la consulta.
 */
export type ModoRespuesta = 'ia' | 'respaldo' | 'sin_resultados';

/** Artículo citado en una respuesta, para enlazarlo. */
export interface FuenteRespuesta {
  articuloId: string;
  titulo: string;
}

/** Respuesta del asistente. */
export interface RespuestaAsistente {
  respuesta: string;
  modo: ModoRespuesta;
  fuentes: FuenteRespuesta[];
}

/** Texto cuando la Ayuda no tiene nada parecido a la consulta (S6). */
export const RESPUESTA_SIN_RESULTADOS =
  'No encontré información sobre eso en la Ayuda. Si necesita asistencia, puede crear un ticket ' +
  'y el equipo de soporte lo va a atender.';
