/**
 * SmtpConnectionVerifier — implementación de IEmailConnectionVerifier sobre
 * nodemailer (D6). Adelantado desde WU5 como dependencia dura de WU4 (ver
 * i-email-connection-verifier.port.ts para el porqué).
 *
 * `transporter.verify()` corre con timeouts explícitos (~10s) para que un
 * puerto que no responde (black hole) no cuelgue el request HTTP de
 * "Probar conexión" ni el guardado de la config.
 *
 * Sanitización por ALLOWLIST cerrado, nunca un scrub del `error.message`
 * crudo: los servidores SMTP suelen devolver el usuario dentro de la propia
 * respuesta 535 de autenticación — un regex de scrub eventualmente se
 * olvida de un caso. Un código no mapeado loguea el mensaje crudo del lado
 * servidor (no llega al caller) y devuelve el motivo genérico.
 *
 * Ref design: sdd/configuracion-correo-por-cliente D6.
 */
import * as nodemailer from 'nodemailer';
import {
  EmailConnectionConfig,
  IEmailConnectionVerifier,
  VerificationResult,
} from '../../../shared/domain/ports/i-email-connection-verifier.port';

const CONNECTION_TIMEOUT_MS = 10_000;
const GREETING_TIMEOUT_MS = 10_000;

/** Allowlist cerrado de motivos saneados (D6) — jamás el mensaje crudo del proveedor. */
const SANITIZED_REASONS: Readonly<Record<string, string>> = {
  EAUTH: 'Credenciales rechazadas por el servidor',
  ECONNECTION: 'No se pudo conectar con el servidor',
  ENOTFOUND: 'No se pudo conectar con el servidor',
  ETIMEDOUT: 'El servidor no respondió a tiempo',
  ESOCKET: 'Fallo de TLS',
};

const DEFAULT_REASON = 'Fallo de verificación';

function extractErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

export class SmtpConnectionVerifier implements IEmailConnectionVerifier {
  async verify(config: EmailConnectionConfig): Promise<VerificationResult> {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      greetingTimeout: GREETING_TIMEOUT_MS,
    });

    try {
      await transporter.verify();
      return { ok: true, motivo: null };
    } catch (error) {
      const code = extractErrorCode(error);
      const motivo = (code && SANITIZED_REASONS[code]) ?? DEFAULT_REASON;
      return { ok: false, motivo };
    } finally {
      transporter.close();
    }
  }
}
