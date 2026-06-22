/**
 * 2.A.1 TEST — Unit tests de RefreshTokenEntity (RED → GREEN con 2.A.2)
 *
 * Cubre:
 * - Construcción con UUIDv7 y revokedAt=null
 * - isExpired(): compara expiresAt con now
 * - isRevoked(): verifica si revokedAt IS NOT NULL
 * - revoke(): setea revokedAt a now
 */
import { RefreshTokenEntity } from './refresh-token.entity';

const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7 días
const past = new Date(Date.now() - 1000); // hace 1 segundo

const makeToken = (
  overrides: Partial<{
    usuarioId: string;
    tokenHash: string;
    expiresAt: Date;
    revokedAt: Date | null;
  }> = {},
) =>
  RefreshTokenEntity.create({
    usuarioId: 'usuario-uuid',
    tokenHash: 'sha256hashvalue',
    expiresAt: future,
    revokedAt: null,
    ...overrides,
  });

describe('RefreshTokenEntity', () => {
  describe('create()', () => {
    it('crea token con UUIDv7', () => {
      const token = makeToken();
      expect(token.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('revokedAt es null al crear (token activo)', () => {
      const token = makeToken();
      expect(token.revokedAt).toBeNull();
    });

    it('expone usuarioId', () => {
      const token = makeToken({ usuarioId: 'user-123' });
      expect(token.usuarioId).toBe('user-123');
    });

    it('expone tokenHash', () => {
      const token = makeToken({ tokenHash: 'abc123sha256hash' });
      expect(token.tokenHash).toBe('abc123sha256hash');
    });

    it('expone expiresAt', () => {
      const exp = new Date(Date.now() + 1000);
      const token = makeToken({ expiresAt: exp });
      expect(token.expiresAt.getTime()).toBe(exp.getTime());
    });

    it('genera IDs únicos entre instancias', () => {
      const a = makeToken();
      const b = makeToken();
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('isExpired()', () => {
    it('retorna false si expiresAt está en el futuro', () => {
      const token = makeToken({ expiresAt: future });
      expect(token.isExpired()).toBe(false);
    });

    it('retorna true si expiresAt está en el pasado', () => {
      const token = makeToken({ expiresAt: past });
      expect(token.isExpired()).toBe(true);
    });

    it('retorna true si expiresAt es exactamente now (borde expirado)', () => {
      const exactNow = new Date();
      // Crear con fecha ya pasada (exactNow puede haberse ido unos ms)
      const token = makeToken({ expiresAt: new Date(exactNow.getTime() - 1) });
      expect(token.isExpired()).toBe(true);
    });
  });

  describe('isRevoked()', () => {
    it('retorna false si revokedAt es null', () => {
      const token = makeToken({ revokedAt: null });
      expect(token.isRevoked()).toBe(false);
    });

    it('retorna true si revokedAt es una fecha', () => {
      const token = makeToken({ revokedAt: new Date() });
      expect(token.isRevoked()).toBe(true);
    });
  });

  describe('revoke()', () => {
    it('setea revokedAt a la fecha actual', () => {
      const token = makeToken();
      const before = new Date();
      token.revoke();
      const after = new Date();
      expect(token.revokedAt).not.toBeNull();
      expect(token.revokedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(token.revokedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('isRevoked() retorna true después de revoke()', () => {
      const token = makeToken();
      expect(token.isRevoked()).toBe(false);
      token.revoke();
      expect(token.isRevoked()).toBe(true);
    });

    it('revoke() es idempotente (segunda llamada no cambia revokedAt)', () => {
      const token = makeToken();
      token.revoke();
      const firstRevoke = token.revokedAt!.getTime();
      token.revoke();
      expect(token.revokedAt!.getTime()).toBe(firstRevoke);
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye token desde persistencia con todos los campos', () => {
      const exp = new Date(Date.now() + 3600000);
      const rev = new Date();
      const token = RefreshTokenEntity.reconstitute(
        { usuarioId: 'u1', tokenHash: 'hash', expiresAt: exp, revokedAt: rev },
        'token-id',
      );
      expect(token.id).toBe('token-id');
      expect(token.revokedAt).toBe(rev);
      expect(token.isRevoked()).toBe(true);
    });
  });
});
