/**
 * IEmailConnectionVerifier — puerto para probar un handshake SMTP (host,
 * puerto, usuario, contraseña, `secure`) sin enviar ningún mensaje real.
 *
 * Adelantado desde WU5 (sdd/configuracion-correo-por-cliente/tasks, Fase 5)
 * porque WU4 lo necesita como dependencia dura: `ConfigurarCorreoClienteUseCase`
 * verifica al guardar y `ProbarCorreoClienteUseCase` verifica bajo demanda
 * (D6). El resto de WU5 (`TenantAwareEmailSender`, el rebind de `EMAIL_SENDER`
 * en `notificaciones.module.ts`) NO se toca en este work unit.
 *
 * El motivo devuelto por un fallo SIEMPRE pasa por un allowlist saneado
 * (D6) — nunca el mensaje crudo del proveedor SMTP, que suele traer el
 * usuario embebido en respuestas 535.
 *
 * Ref design: sdd/configuracion-correo-por-cliente D6.
 */

/** Config de conexión a probar — contraseña en texto plano (en memoria, no persiste). */
export interface EmailConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  secure: boolean;
}

/** Resultado saneado del handshake (D6). */
export interface VerificationResult {
  ok: boolean;
  /** Motivo saneado del allowlist — `null` cuando `ok` es `true`. */
  motivo: string | null;
}

export interface IEmailConnectionVerifier {
  verify(config: EmailConnectionConfig): Promise<VerificationResult>;
}

/** Token de inyección de dependencias para IEmailConnectionVerifier en NestJS. */
export const EMAIL_CONNECTION_VERIFIER = Symbol('EMAIL_CONNECTION_VERIFIER');
