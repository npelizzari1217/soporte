/**
 * IDispositivoConfiableRepository — puerto de los dispositivos confiables del segundo paso
 * (WU-6a, sdd/verificacion-dos-pasos, D2, D3, D7). Solo viaja el SHA-256 del token: el crudo
 * nunca se persiste.
 */
export interface IDispositivoConfiableRepository {
  crear(usuarioId: string, tokenHash: string, expiraAt: Date): Promise<void>;
  /** Vale solo si es del usuario, no esta revocado y no vencio. */
  esValido(usuarioId: string, tokenHash: string, ahora: Date): Promise<boolean>;
  /** Lanza ante fallo: la invalidacion es fail-closed (D5, D7). */
  revocarTodosDe(usuarioId: string): Promise<void>;
}

export const DISPOSITIVO_CONFIABLE_REPOSITORY = Symbol('IDispositivoConfiableRepository');
