/**
 * ITfaRepository — puerto del estado de 2FA de un usuario (WU-4a, sdd/verificacion-dos-pasos).
 * Cada operacion que decide algo (replay, uso unico, promocion) es un CAS: devuelve `false`
 * cuando la fila ya no es la que el llamador leyo.
 */
export interface EstadoTfa {
  /** `null` = 2FA no activo (puede haber un pendiente). */
  secretoCifrado: string | null;
  confirmadoAt: Date | null;
  ultimoPaso: number;
  secretoPendienteCifrado: string | null;
  pendienteCreadoAt: Date | null;
}

export interface CodigoRecuperacionDisponible {
  id: string;
  codigoHash: string;
}

export interface ITfaRepository {
  obtener(usuarioId: string): Promise<EstadoTfa | null>;
  /** Crea la fila o reemplaza el pendiente; nunca toca el secreto activo. */
  guardarPendiente(usuarioId: string, secretoPendienteCifrado: string): Promise<void>;
  /** CAS: promueve el pendiente leido y fija `ultimo_paso` = paso de la confirmacion. */
  promoverPendiente(usuarioId: string, pendienteLeido: string, paso: number): Promise<boolean>;
  /** CAS antireplay: solo avanza si `paso > ultimo_paso` y el secreto sigue siendo el leido. */
  registrarPaso(usuarioId: string, paso: number, secretoCifradoLeido: string): Promise<boolean>;
  /** Borra el juego previo e inserta el nuevo (hashes argon2id) en una transaccion. */
  reemplazarCodigos(usuarioId: string, codigosHash: string[]): Promise<void>;
  /** Codigos sin usar, para que el llamador compare con `IHashProvider.verify`. */
  obtenerCodigosDisponibles(usuarioId: string): Promise<CodigoRecuperacionDisponible[]>;
  /** CAS de uso unico: `UPDATE ... WHERE usado_at IS NULL`. */
  consumirCodigo(codigoId: string): Promise<boolean>;
  contarCodigosRestantes(usuarioId: string): Promise<number>;
  /** Una transaccion: borra 2FA y codigos, revoca dispositivos, invalida desafios abiertos. */
  eliminarTodo(usuarioId: string): Promise<void>;
}

export const TFA_REPOSITORY = Symbol('ITfaRepository');
