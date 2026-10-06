/**
 * IPrimeraRespuestaWriteRepository — escritura acotada de las columnas de primera respuesta (ADR-6).
 * Las columnas no pasan por el upsert de la entidad: solo estos dos métodos las escriben, y los dos
 * llevan la condición `primeraRespuestaAt: null`, así una respuesta ya registrada queda histórica.
 */
export interface IPrimeraRespuestaWriteRepository {
  /** Registra el instante solo si todavia no hay primera respuesta (idempotente y resistente a la concurrencia). */
  registrarSiFalta(ticketId: string, instante: Date): Promise<void>;

  /**
   * Fija (o limpia con `null`) el vencimiento de primera respuesta, solo mientras el ticket no tenga
   * respuesta registrada. Con respuesta no cambia nada.
   */
  fijarVencimientoSiSinRespuesta(ticketId: string, venceAt: Date | null): Promise<void>;
}

export const PRIMERA_RESPUESTA_WRITE_REPOSITORY = Symbol('PRIMERA_RESPUESTA_WRITE_REPOSITORY');
