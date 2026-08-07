/**
 * Argon2HashProvider — implementación de IHashProvider con argon2id via @node-rs/argon2.
 *
 * Usa @node-rs/argon2 (binarios precompilados, sin node-gyp) en lugar de la
 * librería `argon2` de npm que requiere compilación nativa.
 *
 * Parámetros argon2id (spec R2, R7):
 *   m=19456 (19 MiB), t=2 iteraciones, p=1 hilo. Valores OWASP-recomendados
 *   para autenticación web.
 *
 * Defensa timing: verify() en @node-rs/argon2 corre el ciclo de hash
 * completo antes de retornar — no hace early return en el primer byte
 * distinto. El DUMMY_HASH en LoginUseCase (PR3) agrega una segunda capa de
 * defensa contra timing a nivel de flujo de negocio (usuario no
 * encontrado/no activo, R3).
 *
 * Nota sobre el orden de argumentos de @node-rs/argon2:
 *   verify(hash, password) — hash PRIMERO, password segundo.
 *   IHashProvider.verify(plaintext, hash) — plaintext primero.
 *   → El provider invierte el orden al llamar la lib.
 *
 * Tarea: T2.3 (PR2 — Auth domain + ports + hashing + token service)
 */
import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { IHashProvider } from '../domain/ports/i-hash.provider';

/** Parámetros argon2id según spec R2/R7. */
const ARGON2_OPTIONS = {
  algorithm: 2 as const, // 2 = Argon2id (Argon2Algorithm.Argon2id en @node-rs/argon2)
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class Argon2HashProvider implements IHashProvider {
  async hash(plaintext: string): Promise<string> {
    return hash(plaintext, ARGON2_OPTIONS);
  }

  async verify(plaintext: string, storedHash: string): Promise<boolean> {
    try {
      // @node-rs/argon2: verify(hash, password) — HASH ES EL PRIMER ARGUMENTO
      return await verify(storedHash, plaintext, ARGON2_OPTIONS);
    } catch {
      // Hash malformado u otro error — retornar false para no filtrar info.
      return false;
    }
  }
}
