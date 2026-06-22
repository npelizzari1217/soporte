/**
 * IHashProvider — puerto para hashing y verificación de contraseñas.
 *
 * La implementación concreta (Argon2HashProvider con argon2 lib) vive
 * en auth/infrastructure/ → PR-06. El dominio y la aplicación dependen
 * exclusivamente de esta interfaz.
 *
 * Algoritmo esperado: argon2id (ver spec auth-rbac).
 * Tarea: 2.A.3
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
