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

  // Chequeo de LONGITUD primero (mensaje específico "longitud" para claves
  // genuinamente cortas/largas — preserva el contrato de mensaje existente).
  const keyLength = Buffer.from(raw, 'base64').length;
  if (keyLength !== KEY_BYTES) {
    throw new ConfigEncryptionKeyError(
      `CONFIG_ENCRYPTION_KEY tiene longitud inválida: se esperaban ${KEY_BYTES} bytes ` +
        `(base64), se recibieron ${keyLength}. Generar con "openssl rand -base64 32".`,
    );
  }

  // Chequeo de FORMATO junto/después del de longitud: atrapa el caso donde
  // `Buffer.from(raw,'base64')` IGNORÓ basura no-base64 y aun así decodificó
  // a 32 bytes "por casualidad" — la longitud sola no lo detecta.
  if (!STRICT_BASE64_32_BYTES.test(raw)) {
    throw new ConfigEncryptionKeyError(
      'CONFIG_ENCRYPTION_KEY tiene formato base64 inválido: se esperan 43 caracteres ' +
        'base64 + 1 "=" de padding (32 bytes exactos). Generar con "openssl rand -base64 32".',
    );
  }
}
