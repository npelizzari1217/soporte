/**
 * IHashProvider — puerto para hashing y verificación de contraseñas.
 *
 * La implementación concreta (Argon2HashProvider con @node-rs/argon2) vive
 * en auth/infrastructure/. El dominio y la aplicación dependen exclusivamente
 * de esta interfaz.
 *
 * Algoritmo esperado: argon2id, m=19456 (19 MiB), t=2, p=1 (R2, R7 — ver spec).
 *
 * Tarea: T2.2 (PR2 — Auth domain + ports + hashing + token service)
 */
export interface IHashProvider {
  /**
   * Genera un hash seguro del texto plano dado.
   *
   * @param plaintext  Password u otro valor a hashear.
   * @returns          Hash resultante (formato específico del algoritmo).
   */
  hash(plaintext: string): Promise<string>;

  /**
   * Verifica que un texto plano corresponde al hash almacenado.
   *
   * @param plaintext  Password en texto plano a verificar.
   * @param hash       Hash almacenado previamente.
   * @returns          true si coinciden, false en caso contrario.
   */
  verify(plaintext: string, hash: string): Promise<boolean>;
}

/** Token de inyección de dependencias para IHashProvider en NestJS. */
export const HASH_PROVIDER = Symbol('HASH_PROVIDER');
