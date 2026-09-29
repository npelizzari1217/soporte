/**
 * Lectura saneada de los errores de nodemailer.
 *
 * Nunca se usa el `error.message` crudo: los servidores SMTP suelen devolver el
 * usuario dentro de la propia respuesta 535 de autenticacion, y un regex de
 * scrub eventualmente se olvida de un caso. De un error solo salen dos datos,
 * ninguno de los cuales puede traer texto del servidor:
 *
 * - el `code` de nodemailer, contra un allowlist cerrado (fuera de la lista se
 *   reporta como `OTRO`, sin su texto);
 * - el `responseCode`, solo si es un numero de status SMTP (200-599).
 *
 * Ref design: sdd/configuracion-correo-por-cliente D6.
 */

/** `code` de un error, si lo tiene y es un string. Sin validar contra el allowlist. */
export function extractErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/** Codigos de error de nodemailer (y de red de Node) que se pueden loguear tal cual. */
const CODIGOS_LOGUEABLES: ReadonlySet<string> = new Set([
  'EAUTH',
  'ENOAUTH',
  'EOAUTH2',
  'ECONNECTION',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EDNS',
  'ETIMEDOUT',
  'ESOCKET',
  'ETLS',
  'EREQUIRETLS',
  'EPROTOCOL',
  'EENVELOPE',
  'EMESSAGE',
  'ESTREAM',
]);

/** Codigo para el log: el `code` si esta en el allowlist, `OTRO` en cualquier otro caso. */
export function codigoSmtpParaLog(error: unknown): string {
  const code = extractErrorCode(error);
  return code && CODIGOS_LOGUEABLES.has(code) ? code : 'OTRO';
}

/** Status SMTP para el log: el `responseCode` si es un status valido (200-599), `-` si no. */
export function statusSmtpParaLog(error: unknown): string {
  if (error && typeof error === 'object' && 'responseCode' in error) {
    const status = (error as { responseCode: unknown }).responseCode;
    if (typeof status === 'number' && Number.isInteger(status) && status >= 200 && status <= 599) {
      return String(status);
    }
  }
  return '-';
}
