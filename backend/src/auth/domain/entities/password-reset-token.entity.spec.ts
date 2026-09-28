/**
 * 1.4 TEST — Unit tests de PasswordResetTokenEntity.
 *
 * Vigencia para cada combinación de expiresAt/usedAt/revokedAt (Req 6:
 * "Confirmar con un token inválido responde igual sin importar la causa" —
 * las cuatro causas, vencido/usado/revocado/inexistente, son indistinguibles
 * en `ConfirmarResetPasswordUseCase`, que se apoya en estos tres predicados).
 *
 * Ref spec: sdd/auth-reseteo-por-olvido/spec, Requirement "El token es opaco
 * y solo su hash se persiste", "Confirmar con un token inválido responde
 * igual sin importar la causa". Ref design: ADR-6. Tarea: 1.4.
 */
import { PasswordResetTokenEntity } from './password-reset-token.entity';

const future = new Date(Date.now() + 60 * 60 * 1000); // +60 min (TTL de diseño)
const past = new Date(Date.now() - 1000); // hace 1 segundo

const makeToken = (
  overrides: Partial<{
    usuarioId: string;
    clienteId: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt: Date | null;
    revokedAt: Date | null;
  }> = {},
) =>
  PasswordResetTokenEntity.create({
    usuarioId: 'usuario-uuid',
    clienteId: 'cliente-uuid',
    tokenHash: 'sha256hashvalue',
    expiresAt: future,
    usedAt: null,
    revokedAt: null,
    ...overrides,
  });

describe('PasswordResetTokenEntity', () => {
  describe('create()', () => {
    it('expone usuarioId, clienteId y tokenHash', () => {
      const token = makeToken({ usuarioId: 'u1', clienteId: 'c1', tokenHash: 'hash1' });
      expect(token.usuarioId).toBe('u1');
      expect(token.clienteId).toBe('c1');
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
      expect(makeToken({ expiresAt: future }).isExpired()).toBe(false);
    });

    it('retorna true si expiresAt está en el pasado', () => {
      expect(makeToken({ expiresAt: past }).isExpired()).toBe(true);
    });
  });

  describe('isUsed()', () => {
    it('retorna false si usedAt es null', () => {
      expect(makeToken({ usedAt: null }).isUsed()).toBe(false);
    });

    it('retorna true si usedAt es una fecha', () => {
      expect(makeToken({ usedAt: new Date() }).isUsed()).toBe(true);
    });
  });

  describe('isRevoked()', () => {
    it('retorna false si revokedAt es null', () => {
      expect(makeToken({ revokedAt: null }).isRevoked()).toBe(false);
    });

    it('retorna true si revokedAt es una fecha', () => {
      expect(makeToken({ revokedAt: new Date() }).isRevoked()).toBe(true);
    });
  });

  describe('combinaciones de vigencia', () => {
    it('vigente: no vencido, no usado, no revocado', () => {
      const token = makeToken({ expiresAt: future, usedAt: null, revokedAt: null });
      expect(token.isExpired()).toBe(false);
      expect(token.isUsed()).toBe(false);
      expect(token.isRevoked()).toBe(false);
    });

    it('vencido y usado', () => {
      const token = makeToken({ expiresAt: past, usedAt: new Date(), revokedAt: null });
      expect(token.isExpired()).toBe(true);
      expect(token.isUsed()).toBe(true);
      expect(token.isRevoked()).toBe(false);
    });

    it('vencido y revocado', () => {
      const token = makeToken({ expiresAt: past, usedAt: null, revokedAt: new Date() });
      expect(token.isExpired()).toBe(true);
      expect(token.isUsed()).toBe(false);
      expect(token.isRevoked()).toBe(true);
    });

    it('usado y revocado, sin vencer', () => {
      const token = makeToken({ expiresAt: future, usedAt: new Date(), revokedAt: new Date() });
      expect(token.isExpired()).toBe(false);
      expect(token.isUsed()).toBe(true);
      expect(token.isRevoked()).toBe(true);
    });

    it('vencido, usado y revocado a la vez', () => {
      const token = makeToken({ expiresAt: past, usedAt: new Date(), revokedAt: new Date() });
      expect(token.isExpired()).toBe(true);
      expect(token.isUsed()).toBe(true);
      expect(token.isRevoked()).toBe(true);
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye desde persistencia con todos los campos', () => {
      const exp = new Date(Date.now() + 3600000);
      const rev = new Date();
      const token = PasswordResetTokenEntity.reconstitute(
        {
          usuarioId: 'u1',
          clienteId: 'c1',
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
