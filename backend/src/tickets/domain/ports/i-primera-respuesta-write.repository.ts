/**
 * IPrimeraRespuestaWriteRepository — escritura acotada de `primera_respuesta_at` (ADR-6).
 * Solo se declara el puerto en esta WU; su implementacion llega con la WU de la primera respuesta.
 */
export interface IPrimeraRespuestaWriteRepository {
  /** Registra el instante solo si todavia no hay primera respuesta (idempotente y resistente a la concurrencia). */
  registrarSiFalta(ticketId: string, instante: Date): Promise<void>;
}

export const PRIMERA_RESPUESTA_WRITE_REPOSITORY = Symbol('PRIMERA_RESPUESTA_WRITE_REPOSITORY');
