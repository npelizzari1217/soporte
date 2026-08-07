/**
 * T1.4 [INT] — Tests para el bootstrap idempotente del primer ROOT.
 *
 * Contrato verificado (spec R2):
 * - requireEnv(): env presente → devuelve el valor; env ausente/vacía → throw ruidoso.
 * - readRootBootstrapEnv(): agrupa las 4 env ROOT_ADMIN_* — falta cualquiera → throw.
 * - bootstrapRoot(): findUnique + create/no-op por email en `master.usuarios` —
 *   · no existe la fila → la crea con isGlobalAdmin=true, activo=true, sin
 *     membresía ni rol RBAC (R2-a).
 *   · ya existe y está viva → re-run idempotente, sin duplicar, NO rehashea el
 *     password ni pisa nombre/apellido (R2-b [CRITICAL]).
 *   · ya existe pero inactiva (activo=false) o soft-deleted (deletedAt != null)
 *     → throw RootBootstrapAccountInactiveError con mensaje claro (decisión
 *     explícita de este proyecto — NO reactiva en silencio, a diferencia de
 *     soporte1).
 *   · el password en texto plano nunca se loguea (no hay ningún spy sobre
 *     console que lo capture — verificado indirectamente: bootstrapRoot no
 *     recibe ningún logger ni hace console.log).
 *
 * Integración contra `soporte_master_test` (o DATABASE_URL_MASTER si está
 * seteada) — mismo patrón que `prisma-auth.integration.spec.ts`.
 *
 * Ref spec: sdd/auth-multitenancy/spec §R2
 * Tarea: T1.4
 */
import {
  requireEnv,
  readRootBootstrapEnv,
  bootstrapRoot,
  RootBootstrapAccountInactiveError,
  type RootBootstrapEnv,
} from './root-bootstrap.seed';
import { PrismaService } from '../../src/shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../src/shared/infrastructure/persistence/prisma-clients';
import type { IHashProvider } from '../../src/auth/domain/ports/i-hash.provider';

// ─── requireEnv() / readRootBootstrapEnv() — unit, sin DB ─────────────────────

describe('requireEnv (T1.4, R2)', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('devuelve el valor si la env está presente', () => {
    process.env.SOME_VAR = 'valor';
    expect(requireEnv('SOME_VAR')).toBe('valor');
  });

  it('[CRITICAL] falta la env → throw ruidoso (no no-op silencioso)', () => {
    delete process.env.SOME_VAR;
    expect(() => requireEnv('SOME_VAR')).toThrow(/SOME_VAR/);
  });

  it('env vacía (string blanco) → throw ruidoso', () => {
    process.env.SOME_VAR = '   ';
    expect(() => requireEnv('SOME_VAR')).toThrow();
  });
});

describe('readRootBootstrapEnv (R2)', () => {
  const ORIGINAL_ENV = process.env;
  const ALL_VARS = ['ROOT_ADMIN_EMAIL', 'ROOT_ADMIN_PASSWORD', 'ROOT_ADMIN_NOMBRE', 'ROOT_ADMIN_APELLIDO'];

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.ROOT_ADMIN_EMAIL = 'root@empresa.com';
    process.env.ROOT_ADMIN_PASSWORD = 'secret123';
    process.env.ROOT_ADMIN_NOMBRE = 'Root';
    process.env.ROOT_ADMIN_APELLIDO = 'Admin';
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('las 4 env presentes → devuelve el objeto completo', () => {
    const env = readRootBootstrapEnv();
    expect(env).toEqual({
      email: 'root@empresa.com',
      password: 'secret123',
      nombre: 'Root',
      apellido: 'Admin',
    });
  });

  it.each(ALL_VARS)('[CRITICAL] falta %s → throw (cero literales hardcodeados)', (varName) => {
    delete process.env[varName];
    expect(() => readRootBootstrapEnv()).toThrow();
  });
});

// ─── bootstrapRoot() — integración (DB master de test real) ──────────────────

const TEST_DB_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

function makeEnv(overrides?: Partial<RootBootstrapEnv>): RootBootstrapEnv {
  return {
    email: 'root-bootstrap@integration.test',
    password: 'secret123',
    nombre: 'Root',
    apellido: 'Bootstrap',
    ...overrides,
  };
}

function makeFakeHashProvider(): IHashProvider {
  return {
    hash: vi.fn(async (plaintext: string) => `hashed:${plaintext}`),
    verify: vi.fn(),
  };
}

describe('bootstrapRoot (T1.4, integración)', () => {
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;

  beforeAll(() => {
    prismaService = new PrismaService(TEST_DB_URL);
    masterClient = prismaService.getMasterClient();
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, usuarios RESTART IDENTITY CASCADE',
    );
  });

  it('crea la fila si no existe, con isGlobalAdmin=true, activo=true, sin membresía (R2-a)', async () => {
    await bootstrapRoot(masterClient, makeEnv(), makeFakeHashProvider());

    const row = await masterClient.usuario.findUnique({
      where: { email: 'root-bootstrap@integration.test' },
    });
    expect(row).not.toBeNull();
    expect(row?.isGlobalAdmin).toBe(true);
    expect(row?.activo).toBe(true);

    const membresias = await masterClient.membresia.findMany({ where: { usuarioId: row!.id } });
    expect(membresias).toHaveLength(0);
  });

  it('[CRITICAL] re-run idempotente: sin duplicar fila (R2-b)', async () => {
    const env = makeEnv();
    const hashProvider = makeFakeHashProvider();

    await bootstrapRoot(masterClient, env, hashProvider);
    await bootstrapRoot(masterClient, env, hashProvider); // re-run (redeploy)

    const rows = await masterClient.usuario.findMany({
      where: { email: 'root-bootstrap@integration.test' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].isGlobalAdmin).toBe(true);
  });

  it('[FIX] fila ya existente y viva → NO rehashea el password ni pisa otras columnas', async () => {
    await masterClient.usuario.create({
      data: {
        email: 'root-bootstrap@integration.test',
        nombre: 'Nombre Original',
        apellido: 'Apellido Original',
        passwordHash: 'hash-preexistente-no-debe-pisarse',
        activo: true,
        isGlobalAdmin: true,
      },
    });
    const hashProvider = makeFakeHashProvider();

    await bootstrapRoot(masterClient, makeEnv(), hashProvider);

    expect(hashProvider.hash).not.toHaveBeenCalled();
    const row = await masterClient.usuario.findUnique({
      where: { email: 'root-bootstrap@integration.test' },
    });
    expect(row?.nombre).toBe('Nombre Original');
    expect(row?.apellido).toBe('Apellido Original');
    expect(row?.passwordHash).toBe('hash-preexistente-no-debe-pisarse');
  });

  it('[CRITICAL] fila existente inactiva (activo=false) → throw RootBootstrapAccountInactiveError, no reactiva en silencio', async () => {
    await masterClient.usuario.create({
      data: {
        email: 'root-bootstrap@integration.test',
        nombre: 'Nombre Original',
        apellido: 'Apellido Original',
        passwordHash: 'hash-preexistente-no-debe-pisarse',
        activo: false,
        isGlobalAdmin: false,
      },
    });

    await expect(bootstrapRoot(masterClient, makeEnv(), makeFakeHashProvider())).rejects.toThrow(
      RootBootstrapAccountInactiveError,
    );

    const row = await masterClient.usuario.findUnique({
      where: { email: 'root-bootstrap@integration.test' },
    });
    // No se tocó nada — el throw ocurre ANTES de cualquier mutación.
    expect(row?.activo).toBe(false);
    expect(row?.isGlobalAdmin).toBe(false);
  });

  it('[CRITICAL] fila existente soft-deleted (deleted_at != null) → throw RootBootstrapAccountInactiveError', async () => {
    await masterClient.usuario.create({
      data: {
        email: 'root-bootstrap@integration.test',
        nombre: 'Nombre Original',
        apellido: 'Apellido Original',
        passwordHash: 'hash-preexistente-no-debe-pisarse',
        activo: true,
        deletedAt: new Date(),
        isGlobalAdmin: false,
      },
    });

    await expect(bootstrapRoot(masterClient, makeEnv(), makeFakeHashProvider())).rejects.toThrow(
      /inactiva o borrada/,
    );
  });

  it('el password en texto plano no aparece en el error de cuenta inactiva', async () => {
    await masterClient.usuario.create({
      data: {
        email: 'root-bootstrap@integration.test',
        nombre: 'Nombre Original',
        apellido: 'Apellido Original',
        passwordHash: 'hash-preexistente-no-debe-pisarse',
        activo: false,
        isGlobalAdmin: false,
      },
    });

    try {
      await bootstrapRoot(
        masterClient,
        makeEnv({ password: 'PLAINTEXT_SECRET_MUST_NOT_LEAK' }),
        makeFakeHashProvider(),
      );
      throw new Error('expected bootstrapRoot to throw');
    } catch (err) {
      expect((err as Error).message).not.toContain('PLAINTEXT_SECRET_MUST_NOT_LEAK');
    }
  });
});
