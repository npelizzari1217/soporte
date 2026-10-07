/**
 * ITotpService — puerto del TOTP (RFC 6238). WU-2 (sdd/verificacion-dos-pasos, ADR-2).
 * La implementacion concreta usa `crypto` de Node y vive en auth/infrastructure/tfa/.
 */
export interface ITotpService {
  /** Secreto nuevo: 20 bytes aleatorios en base32 RFC 4648 sin padding. */
  generarSecreto(): string;
  /** URI `otpauth://` para el QR / alta manual. */
  uri(secreto: string, email: string): string;
  /** Devuelve el paso aceptado (ventana +-1) o `null` si el codigo no vale. */
  verificar(secreto: string, codigo: string, ahora: Date): number | null;
}

export const TOTP_SERVICE = Symbol('ITotpService');
