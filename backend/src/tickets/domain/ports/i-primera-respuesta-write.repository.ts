/**
 * IPrimeraRespuestaWriteRepository — escritura acotada de las columnas de primera respuesta (ADR-6).
 * Las columnas no pasan por el upsert de la entidad: solo un repo acotado las escribe, con la condición
 * `primeraRespuestaAt: null`, así una respuesta ya registrada queda histórica.
 */
export interface IPrimeraRespuestaWriteRepository {
  /** Registra el instante solo si todavia no hay primera respuesta (idempotente y resistente a la concurrencia). */
  registrarSiFalta(ticketId: string, instante: Date): Promise<void>;
}

export const PRIMERA_RESPUESTA_WRITE_REPOSITORY = Symbol('PRIMERA_RESPUESTA_WRITE_REPOSITORY');
