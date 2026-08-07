/**
 * T2.3 TEST — Unit tests de Argon2HashProvider (RED → GREEN)
 *
 * Cubre (R2, R7 — argon2id m=19456,t=2,p=1):
 * - hash(): produce un hash argon2id distinto del plaintext
 * - verify(): true para el password correcto
 * - verify(): false para el password incorrecto
 * - verify(): false (no throw) ante un hash malformado — no debe filtrar info
 */
import { Argon2HashProvider } from './argon2-hash.provider';

describe('Argon2HashProvider', () => {
  const provider = new Argon2HashProvider();

  describe('hash()', () => {
    it('produce un hash con prefijo argon2id', async () => {
      const hash = await provider.hash('mi_password_123');
      expect(hash).toMatch(/^\$argon2id\$/);
    });

    it('el hash resultante nunca contiene el plaintext', async () => {
      const plaintext = 'super_secret_password';
      const hash = await provider.hash(plaintext);
      expect(hash).not.toContain(plaintext);
    });

    it('produce hashes distintos para el mismo password (salt aleatorio)', async () => {
      const h1 = await provider.hash('same_password');
      const h2 = await provider.hash('same_password');
      expect(h1).not.toBe(h2);
    });
  });

  describe('verify()', () => {
    it('retorna true cuando el plaintext coincide con el hash', async () => {
      const hash = await provider.hash('correct_password');
      const result = await provider.verify('correct_password', hash);
      expect(result).toBe(true);
    });

    it('retorna false cuando el plaintext NO coincide con el hash', async () => {
      const hash = await provider.hash('correct_password');
      const result = await provider.verify('wrong_password', hash);
      expect(result).toBe(false);
    });

    it('retorna false (sin throw) ante un hash malformado', async () => {
      await expect(provider.verify('any_password', 'not-a-valid-hash')).resolves.toBe(false);
    });

    it('retorna false (sin throw) ante un hash vacío', async () => {
      await expect(provider.verify('any_password', '')).resolves.toBe(false);
    });
  });
});
