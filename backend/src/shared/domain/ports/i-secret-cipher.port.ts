/**
 * ISecretCipher — puerto de cifrado simétrico de secretos en reposo
 * (configuración de correo por cliente, N/A ADR pendiente — ver design
 * sdd/configuracion-correo-por-cliente D1).
 *
 * `aad` (additional authenticated data) liga criptográficamente el
 * ciphertext a un identificador de contexto — en este cambio, `clienteId`.
 * Esto NO es decorativo: si un ciphertext se copia (por error o ataque) de
 * la fila de un cliente a la de otro, `decrypt()` con el `aad` del cliente
 * equivocado DEBE fallar en vez de devolver el secreto original. Sin el
 * `aad`, un ciphertext movido de fila igual descifraría correctamente y el
 * sistema mandaría mails haciéndose pasar por otro tenant.
 *
 * `isAvailable()` existe para que el código que envía (send path) pueda
 * degradar explícitamente cuando falta la clave maestra, sin usar
 * try/catch como control de flujo.
 *
 * Ref design: sdd/configuracion-correo-por-cliente D1, D2.
 */
export interface ISecretCipher {
  /**
   * Cifra `plaintext` atado a `aad`. El payload devuelto es un string
   * autodescriptivo (incluye versión de clave y componentes del cifrado);
   * ver el adaptador para el formato exacto persistido.
   *
   * @param plaintext Valor en claro a cifrar.
   * @param aad       Contexto de autenticación (p.ej. `clienteId`).
   * @returns         Payload cifrado listo para persistir.
   */
  encrypt(plaintext: string, aad: string): string;

  /**
   * Descifra un payload producido por `encrypt()`. Lanza si el `aad` no
   * coincide con el usado al cifrar, si el payload fue manipulado (fallo
   * de autenticación GCM) o si la versión de clave no es reconocida.
   *
   * @param payload Payload cifrado (formato `encrypt()`).
   * @param aad     Mismo contexto de autenticación usado al cifrar.
   * @returns       Valor en claro original.
   */
  decrypt(payload: string, aad: string): string;

  /**
   * Indica si el cifrado está operativo (clave maestra presente y válida).
   * Permite al caller degradar explícitamente en vez de esperar una
   * excepción.
   */
  isAvailable(): boolean;
}

/** Token de inyección de dependencias para ISecretCipher en NestJS. */
export const SECRET_CIPHER = Symbol('SECRET_CIPHER');
