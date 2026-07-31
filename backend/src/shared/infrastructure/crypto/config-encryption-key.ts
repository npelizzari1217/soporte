/**
 * config-encryption-key — validación BOOT-TIME (fail-fast) de
 * `CONFIG_ENCRYPTION_KEY`, la clave AES-256 usada por `AesGcmSecretCipher`.
 *
 * F1 (design.md §"Resolución de forks — AUTORITATIVA"): la clave de cifrado
 * es infra tier-bootstrap — mismo trato que `JWT_SECRET`/`DATABASE_URL_MASTER`.
 * Se valida presencia+forma AL ARRANCAR la app; si falta o tiene longitud
 * inválida para AES-256, la app NO arranca (throw en el boot).
 *
 * Distinción clave (spec R2/R6): esta validación es de la CLAVE (infra) — las
 * FILAS de config (datos) siguen degradando graciosamente en send-time
 * (`ISecretCipher.decrypt()` nunca lanza, retorna `Result.fail(CifradoError)`).
 *
 * Se invoca desde el `useFactory` de `SECRET_CIPHER` en `shared.module.ts` —
 * el throw de esta función NUNCA se captura ahí, para que aborte el arranque
 * de la app.
 *
 * Nota (PR6, runtime-config-table): este comentario citaba antes como "mismo
 * patrón" a `loadEmailConfig()` invocado desde el `useFactory` de
 * `EMAIL_SENDER` en `tickets.module.ts` — ese fail-fast se ELIMINÓ en PR6
 * junto con `email-config.ts` (el fail-fast SMTP se corrió a send-time, spec
 * Requirement 6). `JWT_SECRET`/`DATABASE_URL_MASTER` tampoco son un
 * precedente equivalente: ambos degradan silenciosamente a un valor por
 * defecto (`?? 'soporte-dev-secret-change-in-prod'` / `?? ''`) en vez de
 * lanzar — a la fecha, `CONFIG_ENCRYPTION_KEY` es el único valor de infra que
 * hace fail-fast real de boot en este codebase.
 *
 * Formato esperado: base64 de 32 bytes exactos (`openssl rand -base64 32`).
 *
 * Ref design: §14 F1 (autoritativo), §6. Ref spec: R2, R6.
 * Ref tasks: PR1 1.9-1.10.
 */
export const KEY_BYTES = 32; // AES-256. Fuente única — importado por
// `AesGcmSecretCipher` (aes-gcm-secret-cipher.adapter.ts) en vez de
// duplicar la constante (Judgment Day PR1 Ronda 1, SUGGESTION).

/**
 * Formato base64 ESTRICTO para una clave AES-256 (32 bytes exactos): 43
 * caracteres del alfabeto base64 + 1 `=` de padding (32 bytes → 10 grupos
 * completos de 3 bytes + 1 grupo final de 2 bytes → 44 chars totales, el
 * último con un solo `=`).
 *
 * Por qué esto es NECESARIO además del chequeo de longitud decodificada
 * (Judgment Day PR1 Ronda 1, WARNING confirmado): `Buffer.from(raw,'base64')`
 * IGNORA silenciosamente cualquier carácter fuera del alfabeto base64 en vez
 * de rechazarlo. Una clave con basura intercalada (ej. copy-paste corrupto,
 * caracteres de otro encoding) puede seguir decodificando a exactamente 32
 * bytes si conserva ≥43 caracteres base64 válidos — pasando el chequeo de
 * SOLO longitud sin que nadie lo note. Este regex valida la FORMA del string
 * completo, no solo el resultado de decodificarlo.
 */
export const STRICT_BASE64_32_BYTES = /^[A-Za-z0-9+/]{43}=$/;

/**
 * ConfigEncryptionKeyError — error tipado que distingue "clave de cifrado
 * ausente o con formato inválido" de cualquier otro bug en el bootstrap.
 * Nota (PR6, runtime-config-table): este comentario citaba antes como "mismo
 * patrón" a `SmtpConfigError` (`tickets/infrastructure/email/email-config.ts`)
 * — ambos se ELIMINARON en PR6 (el fail-fast SMTP se corrió a send-time).
 */
export class ConfigEncryptionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigEncryptionKeyError';
  }
}

/**
 * Resultado tipado del predicado compartido `checkConfigEncryptionKeyFormat`.
 * `reason` distingue las 3 formas de invalidez que boot-time (throw) y
 * lazy (Result.fail) deben diagnosticar IGUAL para el mismo input.
 */
export type ConfigEncryptionKeyCheckResult =
  | { ok: true; key: Buffer }
  | { ok: false; reason: 'missing' }
  | { ok: false; reason: 'formato' }
  | { ok: false; reason: 'longitud'; receivedBytes: number };

/**
 * checkConfigEncryptionKeyFormat — predicado ÚNICO de validación de
 * presencia+forma de `CONFIG_ENCRYPTION_KEY`, compartido por
 * `validateConfigEncryptionKey()` (boot-time, throw) y
 * `AesGcmSecretCipher.loadKey()` (lazy, `Result.fail`).
 *
 * FIX (Judgment Day PR1 Ronda 2, confirmado A+B): antes de este predicado,
 * `validateConfigEncryptionKey()` chequeaba longitud→formato y `loadKey()`
 * chequeaba formato→longitud — el MISMO input inválido producía DOS
 * diagnósticos distintos según qué camino lo validara. Ahora ambos DEBEN
 * llamar a este predicado — nunca reimplementar el orden.
 *
 * Orden FIJO: trim → formato (regex) → longitud decodificada. El chequeo de
 * FORMATO va primero: `STRICT_BASE64_32_BYTES` ancla el string a exactamente
 * 44 caracteres (43 + "="), así que cualquier clave con largo genuinamente
 * incorrecto (ej. 16 u 48 bytes) ya falla el regex por forma — el branch
 * `'longitud'` queda como defensa adicional (solo alcanzable si el regex se
 * relajara a futuro para admitir strings de otro largo).
 *
 * `.trim()` sobre el valor CRUDO, ANTES de regex/decode (Judgment Day PR1
 * Ronda 2, REGRESIÓN confirmada): el recipe documentado
 * `openssl rand -base64 32 > key.txt` agrega un `\n` final — una clave VÁLIDA
 * leída de archivo (ej. K8s `secretKeyRef`) sería rechazada sin este trim.
 * Solo se recorta whitespace en los EXTREMOS: basura intercalada en el medio
 * sigue siendo rechazada (el regex no la tolera).
 *
 * @param raw valor crudo de `CONFIG_ENCRYPTION_KEY` (puede venir con
 *            whitespace de borde si se cargó desde archivo).
 */
export function checkConfigEncryptionKeyFormat(
  raw: string | undefined,
): ConfigEncryptionKeyCheckResult {
  if (!raw) {
    return { ok: false, reason: 'missing' };
  }

  const trimmed = raw.trim();

  if (!STRICT_BASE64_32_BYTES.test(trimmed)) {
    return { ok: false, reason: 'formato' };
  }

  const key = Buffer.from(trimmed, 'base64');
  if (key.length !== KEY_BYTES) {
    return { ok: false, reason: 'longitud', receivedBytes: key.length };
  }

  return { ok: true, key };
}

/**
 * Valida presencia+forma de `CONFIG_ENCRYPTION_KEY`. Lanza
 * `ConfigEncryptionKeyError` si falta o si el base64 no decodifica a
 * exactamente 32 bytes. El mensaje de error NUNCA interpola el valor de la
 * clave (spec R2 — el secreto nunca aparece fuera de memoria).
 *
 * Delega TODO el chequeo a `checkConfigEncryptionKeyFormat()` (fuente única
 * del orden trim→formato→longitud) — solo mapea el resultado a un mensaje.
 *
 * @param env fuente de variables de entorno (default `process.env`;
 *            parametrizado para tests deterministas sin mutar el entorno real).
 */
export function validateConfigEncryptionKey(env: NodeJS.ProcessEnv = process.env): void {
  const result = checkConfigEncryptionKeyFormat(env.CONFIG_ENCRYPTION_KEY);

  if (result.ok) {
    return;
  }

  switch (result.reason) {
    case 'missing':
      throw new ConfigEncryptionKeyError(
        'CONFIG_ENCRYPTION_KEY ausente. La app no puede arrancar sin una clave de ' +
          'cifrado AES-256 válida (base64 de 32 bytes, ej. "openssl rand -base64 32") ' +
          '(ver shared/infrastructure/crypto/config-encryption-key.ts).',
      );
    case 'formato':
      throw new ConfigEncryptionKeyError(
        'CONFIG_ENCRYPTION_KEY tiene formato base64 inválido: se esperan 43 caracteres ' +
          'base64 + 1 "=" de padding (32 bytes exactos). Generar con "openssl rand -base64 32".',
      );
    case 'longitud':
      throw new ConfigEncryptionKeyError(
        `CONFIG_ENCRYPTION_KEY tiene longitud inválida: se esperaban ${KEY_BYTES} bytes ` +
          `(base64), se recibieron ${result.receivedBytes}. Generar con "openssl rand -base64 32".`,
      );
  }
}
