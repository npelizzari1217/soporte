// Rotación de `EMAIL_CRYPTO_KEY`: re-cifra `clientes.smtp_password_cifrada`
// de una clave anterior (`OLD_KEY`) a una nueva (`NEW_KEY`), preservando el
// formato `v1` de `AesGcmSecretCipher` sin introducir keyring ni `kid`.
//
// Ref proposal/spec: sdd/rotacion-email-crypto-key. Ref design: ADR-1 a
// ADR-5. Ref tasks: WU1 (1.3, 1.4) — esta unidad agrega SOLO la validación
// de claves y la clasificación por fila, sin conexión a base. La
// transacción real (`ejecutarRotacion`), `--dry-run`, `--verificar` y
// `main()`/CLI se agregan en WU2a/WU2b sobre este mismo archivo.
//
// El cifrado v1 vive aparte, en `scripts/lib/cifrado-secreto-v1.mjs` (ADR-5):
// ese módulo es puro y tiene su propio test de descifrado cruzado contra
// `AesGcmSecretCipher`; este archivo solo orquesta validación, clasificación
// y (más adelante) la transacción.
import { descifrarV1, leerClaveHex } from './lib/cifrado-secreto-v1.mjs';

/**
 * Valida `OLD_KEY` y `NEW_KEY` ANTES de abrir cualquier conexión a la base
 * (spec: "Validación de las claves de entrada"): cada una debe decodificar
 * como 64 caracteres hexadecimales (32 bytes), y no pueden ser la misma
 * clave. La igualdad se compara **como bytes** — `'AB…'` y `'ab…'` son la
 * misma clave — para que una rotación con la misma clave en mayúsculas y
 * minúsculas también se rechace.
 *
 * Lanza `Error` ante cualquier incumplimiento; nunca abre `pg.Pool`.
 * @param {unknown} oldKey
 * @param {unknown} newKey
 * @returns {{ oldKeyBuf: Buffer, newKeyBuf: Buffer }}
 */
export function validarClaves(oldKey, newKey) {
  const oldKeyBuf = leerClaveHex(oldKey);
  if (!oldKeyBuf) {
    throw new Error('OLD_KEY inválida: se esperan 64 caracteres hexadecimales');
  }

  const newKeyBuf = leerClaveHex(newKey);
  if (!newKeyBuf) {
    throw new Error('NEW_KEY inválida: se esperan 64 caracteres hexadecimales');
  }

  if (oldKeyBuf.equals(newKeyBuf)) {
    throw new Error(
      'OLD_KEY y NEW_KEY son la misma clave (comparadas como bytes) — no hay nada que rotar',
    );
  }

  return { oldKeyBuf, newKeyBuf };
}

/**
 * Clasifica una fila de `clientes` según la tabla ADR-1: prueba primero
 * `OLD_KEY`, y solo si falla prueba `NEW_KEY`.
 *
 * - `pendiente`: descifra con `OLD_KEY` (y no se prueba `NEW_KEY`) → hay
 *   que re-cifrarla. Devuelve también el texto plano ya descifrado, para
 *   que `ejecutarRotacion` (WU2a) no tenga que volver a descifrar.
 * - `ya_migrada`: no descifra con `OLD_KEY` pero sí con `NEW_KEY` → no-op
 *   explícito, se cuenta pero no se toca.
 * - `indescifrable`: no descifra con ninguna de las dos claves. Un payload
 *   malformado (≠ 4 segmentos o prefijo ≠ `v1`) también cae acá, porque
 *   `descifrarV1` lanza en ambos intentos.
 *
 * Nunca lanza: el llamador decide qué hacer con `indescifrable` (abortar la
 * corrida entera, ADR-1).
 * @param {{ id: string, smtp_password_cifrada: string }} fila
 * @param {Buffer} oldKeyBuf
 * @param {Buffer} newKeyBuf
 * @returns {{ estado: 'pendiente', textoPlano: string } | { estado: 'ya_migrada' } | { estado: 'indescifrable' }}
 */
export function clasificarFila(fila, oldKeyBuf, newKeyBuf) {
  const aad = String(fila.id);
  const payload = fila.smtp_password_cifrada;

  try {
    const textoPlano = descifrarV1(oldKeyBuf, payload, aad);
    return { estado: 'pendiente', textoPlano };
  } catch {
    // No descifró con OLD_KEY — sigue probando con NEW_KEY antes de rendirse.
  }

  try {
    descifrarV1(newKeyBuf, payload, aad);
    return { estado: 'ya_migrada' };
  } catch {
    return { estado: 'indescifrable' };
  }
}
