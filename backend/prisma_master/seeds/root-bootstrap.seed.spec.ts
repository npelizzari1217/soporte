/**
 * B.11-B.14 [RED→GREEN] — Tests para el bootstrap idempotente del primer root.
 *
 * Contrato verificado (design root-tenant-admin §2.8, Dz3):
 * - requireEnv(): env presente → devuelve el valor; env ausente/vacía → throw ruidoso.
 * - readRootBootstrapEnv(): agrupa las 5 env ROOT_ADMIN_* — falta cualquiera → throw.
 * - bootstrapRoot(): findUnique + create/update por email en `master.usuarios` —
 *   · no existe la fila → la crea con isGlobalAdmin=true (R3-a).
 *   · ya existe (root o no) → re-run idempotente, sin duplicar, isGlobalAdmin
 *     sigue true (R3-b [CRITICAL]).
 *   · ya existe con isGlobalAdmin=false → solo actualiza isGlobalAdmin=true,
 *     NO pisa nombre/apellido/passwordHash (R3-c).
 *   · ya existe → NO rehashea el password (FIX 3, Judgment Day PR-B Ronda 1):
 *     el argon2id hash es costoso y el camino update lo descartaba igual.
 *   · ya existe suspendida/soft-deleted (activo=false/deletedAt seteado) →
 *     el update la reactiva (activo=true, deletedAt=null) además de
 *     isGlobalAdmin=true (FIX 4, Judgment Day PR-B Ronda 1 — Juez B,
 *     robustez R3 "MUST NOT quedar sin ningún root usable").
 *
 * Los tests de bootstrapRoot() son de integración (DB master de test real,
 * mismo patrón que prisma-auth.integration.spec.ts: TEST_DB_URL,
 * soporte_master_test, TRUNCATE en beforeEach).
 *
 * Mocks de IHashProvider tipados a la interfaz completa (sin `as any`,
 * Judgment Day PR-B Ronda 1, FIX 2) — `verify` se incluye aunque el seed no
 * lo invoque, porque `bootstrapRoot` recibe el parámetro tipado como
 * `IHashProvider` completo (no `Partial<...>`).
 *
 * Spec ref: root-tenant-admin R3
 * Tarea: B.11-B.15; Judgment Day root-tenant-admin PR-B Ronda 1 (FIX 2, FIX 3, FIX 4)
 */

import {
  requireEnv,
  readRootBootstrapEnv,
  bootstrapRoot,
  type RootBootstrapEnv,
} from './root-bootstrap.seed';
import { PrismaService } from '../../src/shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../src/shared/infrastructure/persistence/prisma-clients';
import { ClienteEntity } from '../../src/clientes/domain/entities/cliente.entity';
import { PrismaClienteRepository } from '../../src/clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import type { IHashProvider } from '../../src/auth/domain/ports/i-hash.provider';

// ─── requireEnv() / readRootBootstrapEnv() — unit, sin DB ─────────────────────

describe('requireEnv (B.11-B.14, R3-d)', () => {
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

describe('readRootBootstrapEnv (R3-d)', () => {
  const ORIGINAL_ENV = process.env;
  const ALL_VARS = [
    'ROOT_ADMIN_EMAIL',
    'ROOT_ADMIN_PASSWORD',
    'ROOT_ADMIN_NOMBRE',
    'ROOT_ADMIN_APELLIDO',
    'ROOT_ADMIN_CLIENTE_ID',
  ];

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.ROOT_ADMIN_EMAIL = 'root@empresa.com';
    process.env.ROOT_ADMIN_PASSWORD = 'secret123';
    process.env.ROOT_ADMIN_NOMBRE = 'Root';
    process.env.ROOT_ADMIN_APELLIDO = 'Admin';
    process.env.ROOT_ADMIN_CLIENTE_ID = 'cliente-uuid-1';
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('las 5 env presentes → devuelve el objeto completo', () => {
    const env = readRootBootstrapEnv();
    expect(env).toEqual({
      email: 'root@empresa.com',
      password: 'secret123',
      nombre: 'Root',
      apellido: 'Admin',
      clienteId: 'cliente-uuid-1',
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
    clienteId: '', // seteado en beforeEach con el cliente de test real
    ...overrides,
  };
}

function makeFakeHashProvider(): IHashProvider {
  return {
    hash: vi.fn(async (plaintext: string) => `hashed:${plaintext}`),
    verify: vi.fn(),
  };
}

describe('bootstrapRoot (B.11-B.15, integración)', () => {
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let clienteId: string;

  beforeAll(() => {
    prismaService = new PrismaService(TEST_DB_URL);
    masterClient = prismaService.getMasterClient();
    clienteRepo = new PrismaClienteRepository(prismaService);
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE usuarios_roles, refresh_tokens, usuarios, clientes RESTART IDENTITY CASCADE',
    );
    const cliente = ClienteEntity.create({
      nombre: 'Cliente Bootstrap Test',
      razonSocial: null,
      cuit: null,
      dbName: 'test_root_bootstrap',
      activo: true,
    });
    await clienteRepo.save(cliente);
    clienteId = cliente.id;
  });

  it('crea la fila si no existe, con isGlobalAdmin=true (R3-a)', async () => {
    await bootstrapRoot(masterClient, makeEnv({ clienteId }), makeFakeHashProvider());

    const row = await masterClient.usuario.findUnique({
      where: { email: 'root-bootstrap@integration.test' },
    });
    expect(row).not.toBeNull();
    expect(row?.isGlobalAdmin).toBe(true);
  });

  it('[CRITICAL] re-run idempotente: sin duplicar fila, isGlobalAdmin sigue true (R3-b)', async () => {
    const env = makeEnv({ clienteId });
    const hashProvider = makeFakeHashProvider();

    await bootstrapRoot(masterClient, env, hashProvider);
    await bootstrapRoot(masterClient, env, hashProvider); // re-run (redeploy)

    const rows = await masterClient.usuario.findMany({
      where: { email: 'root-bootstrap@integration.test' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].isGlobalAdmin).toBe(true);
  });

  it('actualiza SOLO isGlobalAdmin=true si ya existe sin root, no pisa otras columnas (R3-c)', async () => {
    // Fila preexistente con isGlobalAdmin=false y datos distintos a los del env.
    await masterClient.usuario.create({
      data: {
        email: 'root-bootstrap@integration.test',
        nombre: 'Nombre Original',
        apellido: 'Apellido Original',
        passwordHash: 'hash-preexistente-no-debe-pisarse',
        clienteId,
        activo: true,
        isGlobalAdmin: false,
      },
    });

    await bootstrapRoot(masterClient, makeEnv({ clienteId }), makeFakeHashProvider());

    const row = await masterClient.usuario.findUnique({
      where: { email: 'root-bootstrap@integration.test' },
    });
    expect(row?.isGlobalAdmin).toBe(true);
    // Columnas preexistentes NO pisadas por el update mínimo.
    expect(row?.nombre).toBe('Nombre Original');
    expect(row?.apellido).toBe('Apellido Original');
    expect(row?.passwordHash).toBe('hash-preexistente-no-debe-pisarse');
  });

  it('[FIX 3, Judgment Day Ronda 1] fila ya existente → NO rehashea el password', async () => {
    await masterClient.usuario.create({
      data: {
        email: 'root-bootstrap@integration.test',
        nombre: 'Nombre Original',
        apellido: 'Apellido Original',
        passwordHash: 'hash-preexistente-no-debe-pisarse',
        clienteId,
        activo: true,
        isGlobalAdmin: false,
      },
    });
    const hashProvider = makeFakeHashProvider();

    await bootstrapRoot(masterClient, makeEnv({ clienteId }), hashProvider);

    // El hash argon2id (costoso) NUNCA debe calcularse cuando el camino es
    // update — el resultado se descarta igual, no hay razón para pagar el costo.
    expect(hashProvider.hash).not.toHaveBeenCalled();
  });

  it('[FIX 4, Judgment Day Ronda 1] fila existente suspendida/soft-deleted → el update la reactiva', async () => {
    // Simula ROOT_ADMIN_EMAIL apuntando a una cuenta dada de baja (activo=false,
    // deletedAt seteado) — sin FIX 4, el seed solo flippea isGlobalAdmin pero la
    // cuenta sigue sin poder loguear (contradice R3: no debe quedar sin ningún
    // root USABLE).
    await masterClient.usuario.create({
      data: {
        email: 'root-bootstrap@integration.test',
        nombre: 'Nombre Original',
        apellido: 'Apellido Original',
        passwordHash: 'hash-preexistente-no-debe-pisarse',
        clienteId,
        activo: false,
        deletedAt: new Date(),
        isGlobalAdmin: false,
      },
    });

    await bootstrapRoot(masterClient, makeEnv({ clienteId }), makeFakeHashProvider());

    const row = await masterClient.usuario.findUnique({
      where: { email: 'root-bootstrap@integration.test' },
    });
    expect(row?.isGlobalAdmin).toBe(true);
    expect(row?.activo).toBe(true);
    expect(row?.deletedAt).toBeNull();
    // Columnas ajenas a la reactivación siguen sin pisarse.
    expect(row?.nombre).toBe('Nombre Original');
    expect(row?.passwordHash).toBe('hash-preexistente-no-debe-pisarse');
  });
});
