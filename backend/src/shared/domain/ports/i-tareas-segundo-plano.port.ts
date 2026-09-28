/**
 * ITareasSegundoPlano — puerto para diferir trabajo fuera del camino de
 * respuesta HTTP (ADR-2, `reseteo-contrasena-olvidada`).
 *
 * `lanzar()` encola `tarea` y retorna de inmediato: nunca corre
 * síncronamente dentro del handler que la invoca. Es lo que permite que
 * `POST /auth/forgot-password` responda 204 antes de ejecutar cualquier
 * consulta que dependa de la rama (existencia del email, membresías, SMTP
 * del tenant) — la defensa de timing contra enumeración.
 *
 * Mecanismo transversal (shared/domain), sin semántica de auth.
 *
 * Ref design: ADR-2. Tarea: 4.1.
 */
export interface ITareasSegundoPlano {
  /**
   * Encola `tarea` para correr después de que el handler actual retorne. Un
   * rechazo de `tarea` se atrapa y loguea (ver `TareasSegundoPlano`) — nunca
   * se propaga ni revienta el proceso.
   *
   * @param etiqueta Identificador corto para el log de error (ej.
   *   `'reset-password.solicitud'`). Nunca debe llevar PII ni secretos.
   * @param tarea Función a diferir.
   */
  lanzar(etiqueta: string, tarea: () => Promise<void>): void;
}

/** Token de inyección de dependencias para ITareasSegundoPlano en NestJS. */
export const TAREAS_SEGUNDO_PLANO = Symbol('TAREAS_SEGUNDO_PLANO');
