/**
 * prisma-cliente-email-config.repository.spec.ts (WU3, sdd/configuracion-correo-por-cliente).
 *
 * Mockea `PrismaService.getMasterClient()` (mismo molde que
 * `tipos-componente/infrastructure/persistence/prisma/prisma-tipo-componente-master.repository.spec.ts`)
 * y usa un `ISecretCipher` real (`AesGcmSecretCipher`) para probar el
 * cifrado/descifrado de punta a punta, no solo que se llamó una función.
 *
 * Ref design: D1 (AAD=clienteId), D3 (configRevision), D6 (outcome no toca
 * `smtpConfigUpdatedAt`), D7 (la contraseña nunca sale del adaptador).
 * Ref tasks: WU3 3.3, 3.4.
 */
import { PrismaClienteEmailConfigRepository } from './prisma-cliente-email-config.repository';
import { AesGcmSecretCipher } from '../../../../shared/infrastructure/crypto/aes-gcm-secret-cipher';

const VALID_KEY_HEX = 'b'.repeat(64);
const CLIENTE_ID = 'cliente-1';

function makePrismaService(overrides: {
  findUnique?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
}) {
  const findUnique = overrides.findUnique ?? vi.fn();
  const update = overrides.update ?? vi.fn().mockResolvedValue(undefined);
  const prismaService = { getMasterClient: () => ({ cliente: { findUnique, update } }) };
  return { prismaService, findUnique, update };
}

describe('PrismaClienteEmailConfigRepository', () => {
  const originalEnv = process.env.EMAIL_CRYPTO_KEY;

  beforeEach(() => {
    process.env.EMAIL_CRYPTO_KEY = VALID_KEY_HEX;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.EMAIL_CRYPTO_KEY;
    else process.env.EMAIL_CRYPTO_KEY = originalEnv;
  });

  describe('save() + findForSend()', () => {
    it('cifra la contraseña al guardar y la devuelve descifrada al leer para enviar', async () => {
      let storedRow: Record<string, unknown> = {};
      const update = vi.fn().mockImplementation(({ data }) => {
        storedRow = { ...storedRow, ...data };
        return Promise.resolve(undefined);
      });
      const findUnique = vi.fn().mockImplementation(() => Promise.resolve(storedRow));
      const { prismaService } = makePrismaService({ findUnique, update });
      const repo = new PrismaClienteEmailConfigRepository(
        prismaService as never,
        new AesGcmSecretCipher(),
      );

      await repo.save(CLIENTE_ID, {
        host: 'smtp.ejemplo.com',
        port: 587,
        user: 'no-reply@ejemplo.com',
        password: 'super-secreta',
        secure: true,
        from: 'no-reply@ejemplo.com',
      });

      // La contraseña NUNCA se persiste en claro.
      expect(String(storedRow.smtpPasswordCifrada)).not.toContain('super-secreta');
      expect(String(storedRow.smtpPasswordCifrada)).toMatch(/^v1:/);

      const config = await repo.findForSend(CLIENTE_ID);

      expect(config?.password).toBe('super-secreta');
      expect(config?.host).toBe('smtp.ejemplo.com');
      expect(config?.configRevision).toBe((storedRow.smtpConfigUpdatedAt as Date).getTime());
    });

    it('usa clienteId como AAD — un ciphertext leído con otro clienteId falla al descifrar', async () => {
      let storedRow: Record<string, unknown> = {};
      const update = vi.fn().mockImplementation(({ data }) => {
        storedRow = { ...storedRow, ...data };
        return Promise.resolve(undefined);
      });
      const findUnique = vi.fn().mockImplementation(() => Promise.resolve(storedRow));
      const { prismaService } = makePrismaService({ findUnique, update });
      const repo = new PrismaClienteEmailConfigRepository(
        prismaService as never,
        new AesGcmSecretCipher(),
      );

      await repo.save(CLIENTE_ID, {
        host: 'smtp.ejemplo.com',
        port: 587,
        user: 'a@ejemplo.com',
        password: 'secreta',
        secure: false,
        from: 'a@ejemplo.com',
      });

      await expect(repo.findForSend('cliente-suplantador')).rejects.toThrow();
    });

    it('findForSend() retorna null si el cliente no tiene configuración', async () => {
      const { prismaService } = makePrismaService({ findUnique: vi.fn().mockResolvedValue(null) });
      const repo = new PrismaClienteEmailConfigRepository(
        prismaService as never,
        new AesGcmSecretCipher(),
      );

      expect(await repo.findForSend(CLIENTE_ID)).toBeNull();
    });
  });

  describe('findState()', () => {
    it('nunca expone la contraseña bajo ninguna clave', async () => {
      const { prismaService } = makePrismaService({
        findUnique: vi.fn().mockResolvedValue({
          smtpHost: 'smtp.ejemplo.com',
          smtpPort: 587,
          smtpUser: 'a@ejemplo.com',
          smtpSecure: true,
          smtpFrom: 'a@ejemplo.com',
          smtpPasswordCifrada: 'v1:iv:tag:ct',
          smtpVerificadoAt: null,
          smtpVerificacionError: null,
        }),
      });
      const repo = new PrismaClienteEmailConfigRepository(
        prismaService as never,
        new AesGcmSecretCipher(),
      );

      const state = await repo.findState(CLIENTE_ID);

      expect(state.configurado).toBe(true);
      const serialized = JSON.stringify(state).toLowerCase();
      expect(serialized).not.toMatch(/pass|contrasena|contraseña|cifrada/i);
      expect(Object.keys(state).some((k) => /pass|contrasena/i.test(k))).toBe(false);
    });

    it('configurado=false cuando el cliente no tiene contraseña guardada', async () => {
      const { prismaService } = makePrismaService({
        findUnique: vi.fn().mockResolvedValue({
          smtpHost: null,
          smtpPort: null,
          smtpUser: null,
          smtpSecure: null,
          smtpFrom: null,
          smtpPasswordCifrada: null,
          smtpVerificadoAt: null,
          smtpVerificacionError: null,
        }),
      });
      const repo = new PrismaClienteEmailConfigRepository(
        prismaService as never,
        new AesGcmSecretCipher(),
      );

      expect((await repo.findState(CLIENTE_ID)).configurado).toBe(false);
    });
  });

  describe('saveVerificationOutcome()', () => {
    it('en éxito, setea smtpVerificadoAt y limpia el error', async () => {
      const { prismaService, update } = makePrismaService({});
      const repo = new PrismaClienteEmailConfigRepository(
        prismaService as never,
        new AesGcmSecretCipher(),
      );

      await repo.saveVerificationOutcome(CLIENTE_ID, { ok: true, motivo: null });

      expect(update).toHaveBeenCalledWith({
        where: { id: CLIENTE_ID },
        data: { smtpVerificadoAt: expect.any(Date), smtpVerificacionError: null },
      });
    });

    it('en fallo, solo escribe el motivo saneado — no toca smtpConfigUpdatedAt', async () => {
      const { prismaService, update } = makePrismaService({});
      const repo = new PrismaClienteEmailConfigRepository(
        prismaService as never,
        new AesGcmSecretCipher(),
      );

      await repo.saveVerificationOutcome(CLIENTE_ID, {
        ok: false,
        motivo: 'Credenciales rechazadas por el servidor',
      });

      const call = update.mock.calls[0][0];
      expect(call.data).toEqual({
        smtpVerificacionError: 'Credenciales rechazadas por el servidor',
      });
      expect(call.data).not.toHaveProperty('smtpConfigUpdatedAt');
    });
  });

  describe('clear()', () => {
    it('limpia las 9 columnas SMTP', async () => {
      const { prismaService, update } = makePrismaService({});
      const repo = new PrismaClienteEmailConfigRepository(
        prismaService as never,
        new AesGcmSecretCipher(),
      );

      await repo.clear(CLIENTE_ID);

      expect(update).toHaveBeenCalledWith({
        where: { id: CLIENTE_ID },
        data: {
          smtpHost: null,
          smtpPort: null,
          smtpUser: null,
          smtpSecure: null,
          smtpFrom: null,
          smtpPasswordCifrada: null,
          smtpConfigUpdatedAt: null,
          smtpVerificadoAt: null,
          smtpVerificacionError: null,
        },
      });
    });
  });
});
