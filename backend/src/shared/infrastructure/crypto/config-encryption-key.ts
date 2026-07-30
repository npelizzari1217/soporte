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
 * Se invoca desde el `useFactory` de `SECRET_CIPHER` en `shared.module.ts`
 * (mismo patrón que `loadEmailConfig()` invocado desde el `useFactory` de
 * `EMAIL_SENDER` en `tickets.module.ts` — NUNCA se captura el throw acá).
 *
 * Formato esperado: base64 de 32 bytes exactos (`openssl rand -base64 32`).
 *
 * Ref design: §14 F1 (autoritativo), §6. Ref spec: R2, R6.
 * Ref tasks: PR1 1.9-1.10.
 */
const KEY_BYTES = 32; // AES-256

/**
 * ConfigEncryptionKeyError — error tipado que distingue "clave de cifrado
 * ausente o con formato inválido" de cualquier otro bug en el bootstrap.
 * Mismo patrón que `SmtpConfigError` (tickets/infrastructure/email/email-config.ts).
 */
export class ConfigEncryptionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigEncryptionKeyError';
  }
}

/**
 * Valida presencia+forma de `CONFIG_ENCRYPTION_KEY`. Lanza
 * `ConfigEncryptionKeyError` si falta o si el base64 no decodifica a
 * exactamente 32 bytes. El mensaje de error NUNCA interpola el valor de la
 * clave (spec R2 — el secreto nunca aparece fuera de memoria).
 *
 * @param env fuente de variables de entorno (default `process.env`;
 *            parametrizado para tests deterministas sin mutar el entorno real).
 */
export function validateConfigEncryptionKey(env: NodeJS.ProcessEnv = process.env): void {
  const raw = env.CONFIG_ENCRYPTION_KEY;

  if (!raw) {
    throw new ConfigEncryptionKeyError(
      'CONFIG_ENCRYPTION_KEY ausente. La app no puede arrancar sin una clave de ' +
        'cifrado AES-256 válida (base64 de 32 bytes, ej. "openssl rand -base64 32") ' +
        '(ver shared/infrastructure/crypto/config-encryption-key.ts).',
    );
  }

  const keyLength = Buffer.from(raw, 'base64').length;
  if (keyLength !== KEY_BYTES) {
    throw new ConfigEncryptionKeyError(
      `CONFIG_ENCRYPTION_KEY tiene longitud inválida: se esperaban ${KEY_BYTES} bytes ` +
        `(base64), se recibieron ${keyLength}. Generar con "openssl rand -base64 32".`,
    );
  }
}
