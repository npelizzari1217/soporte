/**
 * 4.1 TEST — Unit tests de EncuestaTokenEntity (RED → GREEN).
 *
 * Mismo patrón que `RefreshTokenEntity` (auth/domain): isExpired/isRevoked
 * comparan contra `Date.now()`, `revoke()` es idempotente. Se agrega
 * `isUsed()` (encuesta_tokens.used_at, ADR-C2 del design).
 *
 * Ref spec: sdd/csat/spec, Requirement "Validación del token en el endpoint
 * público", "Revocación de tokens previos en reapertura". Ref design: ADR-C1,
 * ADR-C2. Tarea: 4.1.
 */
import { EncuestaTokenEntity } from './encuesta-token.entity';

const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // +30 días
const past = new Date(Date.now() - 1000); // hace 1 segundo

const makeToken = (
  overrides: Partial<{
    clienteId: string;
    ticketId: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt: Date | null;
    revokedAt: Date | null;
  }> = {},
) =>
  EncuestaTokenEntity.create({
    clienteId: 'cliente-uuid',
    ticketId: 'ticket-uuid',
    tokenHash: 'sha256hashvalue',
    expiresAt: future,
    usedAt: null,
    revokedAt: null,
    ...overrides,
  });

describe('EncuestaTokenEntity', () => {
  describe('create()', () => {
    it('expone clienteId, ticketId y tokenHash', () => {
      const token = makeToken({ clienteId: 'c1', ticketId: 't1', tokenHash: 'hash1' });
      expect(token.clienteId).toBe('c1');
      expect(token.ticketId).toBe('t1');
      expect(token.tokenHash).toBe('hash1');
    });

    it('usedAt y revokedAt son null al crear', () => {
      const token = makeToken();
      expect(token.usedAt).toBeNull();
      expect(token.revokedAt).toBeNull();
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
  });

  describe('isUsed()', () => {
    it('retorna false si usedAt es null', () => {
      const token = makeToken({ usedAt: null });
      expect(token.isUsed()).toBe(false);
    });

    it('retorna true si usedAt es una fecha', () => {
      const token = makeToken({ usedAt: new Date() });
      expect(token.isUsed()).toBe(true);
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

    /**
     * Reloj falso a propósito: sin él las dos llamadas caen en el mismo
     * milisegundo, los timestamps coinciden por casualidad y el test pasa
     * incluso con una implementación NO idempotente. Avanzar el reloj entre
     * llamadas es lo que hace que la aserción realmente muerda.
     */
    it('es idempotente: una segunda llamada no cambia revokedAt', () => {
      vi.useFakeTimers();
      try {
        const token = makeToken();
        token.revoke();
        const firstRevoke = token.revokedAt!.getTime();

        vi.advanceTimersByTime(5000);
        token.revoke();

        expect(token.revokedAt!.getTime()).toBe(firstRevoke);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye desde persistencia con todos los campos', () => {
      const exp = new Date(Date.now() + 3600000);
      const rev = new Date();
      const token = EncuestaTokenEntity.reconstitute(
        {
          clienteId: 'c1',
          ticketId: 't1',
          tokenHash: 'hash',
          expiresAt: exp,
          usedAt: null,
          revokedAt: rev,
        },
        'token-id',
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-06-01T00:00:00Z'),
        null,
      );
      expect(token.id).toBe('token-id');
      expect(token.revokedAt).toBe(rev);
      expect(token.isRevoked()).toBe(true);
    });
  });
});
