/**
 * reset-password.integration.spec.ts — tests para el reset de contraseña de
 * soporte (reemplazo del `rotate-admin-pw.ps1` roto que dependía de un
 * archivo inexistente y mentía "OK" sin haber cambiado nada).
 *
 * Contrato verificado:
 * - readResetPasswordEnv(): falta RESET_EMAIL o RESET_PASSWORD → throw ruidoso.
 * - resetPassword(): email inexistente → throw UsuarioNoEncontradoError, no
 *   crea usuario ni pisa nada (aborta ANTES de hashear).
 * - [CRITICAL] la contraseña seteada por el script VALIDA contra
 *   Argon2HashProvider.verify() — el mismo verificador que usa LoginUseCase
 *   al loguear. Sin este test, el script podría "funcionar" (UPDATE exitoso)
 *   y dejar al usuario sin poder entrar por un hash que no coincide con lo
 *   que el login espera — exactamente el fallo que este script corrige.
 * - la contraseña en texto plano no aparece en el mensaje de error.
 *
 * Integración contra `soporte_master_test` (o DATABASE_URL_MASTER si está
 * seteada) — mismo patrón que `root-bootstrap.seed.integration.spec.ts`:
 * TRUNCATE en beforeEach, nunca toca `soporte_master` (producción).
 */
import { resetPassword, readResetPasswordEnv, UsuarioNoEncontradoError } from './reset-password';
import { Argon2HashProvider } from '../src/auth/infrastructure/argon2-hash.provider';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../src/shared/infrastructure/persistence/prisma-clients';
import type { IHashProvider } from '../src/auth/domain/ports/i-hash.provider';

// ─── readResetPasswordEnv() — unit, sin DB ────────────────────────────────────

describe('readResetPasswordEnv', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.RESET_EMAIL = 'admin@empresa.com';
    process.env.RESET_PASSWORD = 'nueva-clave-123';
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('las 2 env presentes → devuelve el objeto completo', () => {
    expect(readResetPasswordEnv()).toEqual({
      email: 'admin@empresa.com',
      password: 'nueva-clave-123',
    });
  });

  it.each(['RESET_EMAIL', 'RESET_PASSWORD'])(
    '[CRITICAL] falta %s → throw ruidoso (no no-op silencioso)',
    (varName) => {
      delete process.env[varName];
      expect(() => readResetPasswordEnv()).toThrow();
    },
  );
});

// ─── resetPassword() — integración (DB master de test real) ──────────────────

const TEST_DB_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

function makeFakeHashProvider(): IHashProvider {
  return {
    hash: vi.fn(async (plaintext: string) => `hashed:${plaintext}`),
    verify: vi.fn(),
  };
}

describe('resetPassword (integración)', () => {
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

  it('[CRITICAL] email inexistente → throw UsuarioNoEncontradoError, no crea usuario', async () => {
    await expect(
      resetPassword(
        masterClient,
        { email: 'no-existe@integration.test', password: 'clave-nueva' },
        makeFakeHashProvider(),
      ),
    ).rejects.toThrow(UsuarioNoEncontradoError);

    const rows = await masterClient.usuario.findMany({
      where: { email: 'no-existe@integration.test' },
    });
    expect(rows).toHaveLength(0);
  });

  it('usuario existente → actualiza SOLO passwordHash, sin tocar otras columnas', async () => {
    await masterClient.usuario.create({
      data: {
        email: 'reset-password@integration.test',
        nombre: 'Nombre Original',
        apellido: 'Apellido Original',
        passwordHash: 'hash-viejo',
        activo: true,
        isGlobalAdmin: true,
      },
    });

    await resetPassword(
      masterClient,
      { email: 'reset-password@integration.test', password: 'clave-nueva' },
      makeFakeHashProvider(),
    );

    const row = await masterClient.usuario.findUnique({
      where: { email: 'reset-password@integration.test' },
    });
    expect(row?.passwordHash).toBe('hashed:clave-nueva');
    expect(row?.nombre).toBe('Nombre Original');
    expect(row?.apellido).toBe('Apellido Original');
    expect(row?.isGlobalAdmin).toBe(true);
  });

  it('el password en texto plano no aparece en el error de usuario inexistente', async () => {
    try {
      await resetPassword(
        masterClient,
        { email: 'no-existe@integration.test', password: 'PLAINTEXT_SECRET_MUST_NOT_LEAK' },
        makeFakeHashProvider(),
      );
      throw new Error('expected resetPassword to throw');
    } catch (err) {
      expect((err as Error).message).not.toContain('PLAINTEXT_SECRET_MUST_NOT_LEAK');
    }
  });

  // ─── EL PUNTO CRÍTICO: el hash seteado por el script tiene que validar ──────
  // contra el MISMO verificador que usa LoginUseCase al loguear. Acá se usa
  // el Argon2HashProvider REAL (no el fake de arriba) en ambos lados —
  // setear y verificar — para probar la integración real, no un mock que
  // podría estar de acuerdo consigo mismo sin decir nada del sistema real.
  it('[CRITICAL] la contraseña seteada valida contra Argon2HashProvider.verify() (mismo verificador del login)', async () => {
    await masterClient.usuario.create({
      data: {
        email: 'reset-password-argon2@integration.test',
        nombre: 'Admin',
        apellido: 'Real',
        passwordHash: 'hash-viejo-invalido',
        activo: true,
        isGlobalAdmin: true,
      },
    });
    const hashProvider = new Argon2HashProvider();

    await resetPassword(
      masterClient,
      { email: 'reset-password-argon2@integration.test', password: 'clave-nueva-real-123' },
      hashProvider,
    );

    const row = await masterClient.usuario.findUnique({
      where: { email: 'reset-password-argon2@integration.test' },
    });

    // La contraseña correcta valida...
    await expect(hashProvider.verify('clave-nueva-real-123', row!.passwordHash)).resolves.toBe(
      true,
    );
    // ...y una incorrecta NO valida (el hash no es un pasamuros universal).
    await expect(hashProvider.verify('clave-incorrecta', row!.passwordHash)).resolves.toBe(false);
  }, 15_000);
});
