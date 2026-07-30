/**
 * 2.5-2.10 — RED: `PrismaConfigResolver` — merge por campo tenant→global
 * (Dz4), aislamiento cross-DB por `clienteId` (R9), descifrado de `pass`
 * (esSecreto) vía `ISecretCipher`. `getMasterClient`/`getTenantClient` de
 * `PrismaService` e `ISecretCipher` mockeados — mismo patrón que
 * `solicitante-email.resolver.spec.ts` (precedente cross-DB, sin
 * `TenantContext`).
 *
 * Ref spec: Requirement 1 (escenarios 1-5), Requirement 9 (aislamiento).
 * Ref design: §3.1, §5, Dz4.
 * Ref tasks: PR2 2.5-2.10.
 */
import { PrismaConfigResolver } from './config-resolver.adapter';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { ISecretCipher } from '../../../../shared/domain/ports/i-secret-cipher';
import { Result } from '../../../../shared/domain/result';
import { CifradoError } from '../../../../shared/domain/errors/cifrado.errors';
import { ConfigIncompletaError, NoConfigError } from '../../../domain/errors/config.errors';

type ConfigRow = {
  clave: string;
  valor: string;
  esSecreto: boolean;
  iv: string | null;
  authTag: string | null;
};

const CLIENTE_A = 'cliente-uuid-a';
const DB_A = 'tenant_a_db';

const filaNoSecreta = (clave: string, valor: string): ConfigRow => ({
  clave,
  valor,
  esSecreto: false,
  iv: null,
  authTag: null,
});

const filaSecreta = (valor: string, iv: string, authTag: string): ConfigRow => ({
  clave: 'pass',
  valor,
  esSecreto: true,
  iv,
  authTag,
});

describe('PrismaConfigResolver', () => {
  let resolver: PrismaConfigResolver;

  const mockClienteFindFirst = vi.fn();
  const mockGlobalConfigFindMany = vi.fn();
  const mockTenantConfigFindMany = vi.fn();
  const mockGetTenantClient = vi.fn();

  const mockMasterClient = {
    cliente: { findFirst: mockClienteFindFirst },
    configuracionRuntime: { findMany: mockGlobalConfigFindMany },
  };

  const buildTenantClient = (findMany: ReturnType<typeof vi.fn>) => ({
    configuracionRuntime: { findMany },
  });

  const mockPrismaService = {
    getMasterClient: vi.fn().mockReturnValue(mockMasterClient),
    getTenantClient: mockGetTenantClient,
  } as PrismaService;

  const mockDecrypt = vi.fn();
  const mockEncrypt = vi.fn();
  const mockSecretCipher: ISecretCipher = {
    encrypt: mockEncrypt,
    decrypt: mockDecrypt,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClienteFindFirst.mockResolvedValue({ dbName: DB_A });
    mockGetTenantClient.mockReturnValue(buildTenantClient(mockTenantConfigFindMany));
    resolver = new PrismaConfigResolver(mockPrismaService, mockSecretCipher);
  });

  describe('resolveSmtp() — merge tenant→global (R1)', () => {
    it('2.5: tenant con smtp.* completa + global distinta ⇒ usa los valores del TENANT', async () => {
      mockTenantConfigFindMany.mockResolvedValue([
        filaNoSecreta('host', 'tenant.smtp.com'),
        filaNoSecreta('port', '587'),
        filaNoSecreta('secure', 'true'),
        filaNoSecreta('user', 'tenant-user'),
        filaSecreta('ciphertext-tenant', 'iv-tenant', 'tag-tenant'),
        filaNoSecreta('from', 'tenant@dominio.com'),
      ]);
      mockGlobalConfigFindMany.mockResolvedValue([
        filaNoSecreta('host', 'global.smtp.com'),
        filaNoSecreta('port', '25'),
        filaNoSecreta('secure', 'false'),
        filaNoSecreta('user', 'global-user'),
        filaSecreta('ciphertext-global', 'iv-global', 'tag-global'),
        filaNoSecreta('from', 'global@dominio.com'),
      ]);
      mockDecrypt.mockReturnValue(Result.ok('tenant-pass-plano'));

      const result = await resolver.resolveSmtp(CLIENTE_A);

      expect(result.isOk()).toBe(true);
      const config = result.getValue();
      expect(config.host).toBe('tenant.smtp.com');
      expect(config.port).toBe(587);
      expect(config.secure).toBe(true);
      expect(config.user).toBe('tenant-user');
      expect(config.pass).toBe('tenant-pass-plano');
      expect(config.from).toBe('tenant@dominio.com');
      expect(mockDecrypt).toHaveBeenCalledWith({
        valor: 'ciphertext-tenant',
        iv: 'iv-tenant',
        authTag: 'tag-tenant',
      });
    });

    it('2.6: tenant sin fila, global completa ⇒ usa los valores GLOBALES', async () => {
      mockTenantConfigFindMany.mockResolvedValue([]);
      mockGlobalConfigFindMany.mockResolvedValue([
        filaNoSecreta('host', 'global.smtp.com'),
        filaNoSecreta('port', '25'),
        filaNoSecreta('secure', 'false'),
        filaNoSecreta('user', 'global-user'),
        filaSecreta('ciphertext-global', 'iv-global', 'tag-global'),
        filaNoSecreta('from', 'global@dominio.com'),
      ]);
      mockDecrypt.mockReturnValue(Result.ok('global-pass-plano'));

      const result = await resolver.resolveSmtp(CLIENTE_A);

      expect(result.isOk()).toBe(true);
      const config = result.getValue();
      expect(config.host).toBe('global.smtp.com');
      expect(config.port).toBe(25);
      expect(config.secure).toBe(false);
      expect(config.user).toBe('global-user');
      expect(config.pass).toBe('global-pass-plano');
      expect(config.from).toBe('global@dominio.com');
    });

    it('2.7: ni tenant ni global tienen config ⇒ Result.fail(NoConfigError), sin throw', async () => {
      mockTenantConfigFindMany.mockResolvedValue([]);
      mockGlobalConfigFindMany.mockResolvedValue([]);

      await expect(resolver.resolveSmtp(CLIENTE_A)).resolves.not.toThrow();
      const result = await resolver.resolveSmtp(CLIENTE_A);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(NoConfigError);
      expect(result.getError().code).toBe('NO_CONFIG');
    });

    it('2.8a: merge por campo — tenant {host} + global {port,secure,user,pass,from} ⇒ ok (config completa vía merge)', async () => {
      mockTenantConfigFindMany.mockResolvedValue([filaNoSecreta('host', 'tenant.smtp.com')]);
      mockGlobalConfigFindMany.mockResolvedValue([
        filaNoSecreta('port', '25'),
        filaNoSecreta('secure', 'false'),
        filaNoSecreta('user', 'global-user'),
        filaSecreta('ciphertext-global', 'iv-global', 'tag-global'),
        filaNoSecreta('from', 'global@dominio.com'),
      ]);
      mockDecrypt.mockReturnValue(Result.ok('global-pass-plano'));

      const result = await resolver.resolveSmtp(CLIENTE_A);

      expect(result.isOk()).toBe(true);
      const config = result.getValue();
      expect(config.host).toBe('tenant.smtp.com');
      expect(config.port).toBe(25);
      expect(config.user).toBe('global-user');
      expect(config.pass).toBe('global-pass-plano');
    });

    it('2.8b: merge por campo — tenant {host} + global {host,port} sin user/pass/from/secure ⇒ Result.fail(ConfigIncompletaError)', async () => {
      mockTenantConfigFindMany.mockResolvedValue([filaNoSecreta('host', 'tenant.smtp.com')]);
      mockGlobalConfigFindMany.mockResolvedValue([
        filaNoSecreta('host', 'global.smtp.com'),
        filaNoSecreta('port', '25'),
      ]);

      const result = await resolver.resolveSmtp(CLIENTE_A);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ConfigIncompletaError);
      expect(result.getError().code).toBe('CONFIG_INCOMPLETA');
    });
  });

  describe('resolveSmtp() — aislamiento cross-DB por clienteId (R1 escenario 5, R9)', () => {
    it('2.9: resuelve dbName de A desde master.clientes por clienteId y consulta SOLO esa DB — nunca mezcla con B', async () => {
      const DB_B = 'tenant_b_db';
      const mockTenantBFindMany = vi
        .fn()
        .mockResolvedValue([
          filaNoSecreta('host', 'b.smtp.com'),
          filaNoSecreta('port', '25'),
          filaNoSecreta('secure', 'false'),
          filaNoSecreta('user', 'b-user'),
          filaNoSecreta('pass', 'b-pass'),
          filaNoSecreta('from', 'b@dominio.com'),
        ]);
      mockGetTenantClient.mockImplementation((dbName: string) =>
        dbName === DB_A
          ? buildTenantClient(mockTenantConfigFindMany)
          : buildTenantClient(mockTenantBFindMany),
      );
      mockClienteFindFirst.mockResolvedValue({ dbName: DB_A });
      mockTenantConfigFindMany.mockResolvedValue([
        filaNoSecreta('host', 'a.smtp.com'),
        filaNoSecreta('port', '587'),
        filaNoSecreta('secure', 'true'),
        filaNoSecreta('user', 'a-user'),
        filaNoSecreta('pass', 'a-pass'),
        filaNoSecreta('from', 'a@dominio.com'),
      ]);
      mockGlobalConfigFindMany.mockResolvedValue([]);

      const result = await resolver.resolveSmtp(CLIENTE_A);

      expect(result.isOk()).toBe(true);
      expect(result.getValue().host).toBe('a.smtp.com');
      expect(mockGetTenantClient).toHaveBeenCalledWith(DB_A);
      expect(mockGetTenantClient).not.toHaveBeenCalledWith(DB_B);
      expect(mockTenantBFindMany).not.toHaveBeenCalled();
    });
  });

  describe('resolveSmtp() — descifrado del secreto (R2)', () => {
    it('2.10: `pass` (esSecreto) se descifra vía ISecretCipher.decrypt(); falla ⇒ Result.fail(CifradoError) propagado', async () => {
      mockTenantConfigFindMany.mockResolvedValue([
        filaNoSecreta('host', 'tenant.smtp.com'),
        filaNoSecreta('port', '587'),
        filaNoSecreta('secure', 'true'),
        filaNoSecreta('user', 'tenant-user'),
        filaSecreta('ciphertext-tenant', 'iv-tenant', 'tag-tenant'),
        filaNoSecreta('from', 'tenant@dominio.com'),
      ]);
      mockGlobalConfigFindMany.mockResolvedValue([]);
      mockDecrypt.mockReturnValue(Result.fail(new CifradoError('No se pudo descifrar el secreto')));

      const result = await resolver.resolveSmtp(CLIENTE_A);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CifradoError);
      expect(result.getError().code).toBe('CONFIG_CIFRADO_INVALIDO');
      expect(mockDecrypt).toHaveBeenCalledTimes(1);
    });
  });
});
