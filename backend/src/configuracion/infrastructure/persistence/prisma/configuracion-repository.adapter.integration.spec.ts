/**
 * 4.11 TEST — Integración: el partial unique index de `configuracion_runtime`
 * (`(categoria, clave) WHERE deleted_at IS NULL`, Dz9, migración PR1) rechaza
 * dos filas ACTIVAS con la misma `(categoria, clave)` — mismo patrón que el
 * UNIQUE parcial de `numero_serie` en `prisma-equipos.integration.spec.ts`.
 *
 * Inserta directo vía el cliente Prisma (bypass del repo — el repo previene
 * duplicados vía `findFirst`-then-`create`; este test verifica la red de
 * seguridad de la DB en sí, independiente de la lógica de aplicación).
 *
 * Riesgo mitigado (design §15): "Partial unique index olvidado ⇒ claves
 * duplicadas activas".
 *
 * DB de test: `soporte_master_test` (scope global) — PostgreSQL real, sin
 * mocks. Requiere la migración `20260701000000_add_configuracion_runtime_audit`
 * aplicada (PR1).
 *
 * Ref design: §4.1, §15. Ref tasks: 4.11 (PR4).
 */
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';

const TEST_DB_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

describe('ConfiguracionRuntime — partial unique index (categoria, clave) WHERE deleted_at IS NULL (integration, 4.11)', () => {
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
    await masterClient.configuracionRuntime.deleteMany({ where: { categoria: 'smtp-4-11-test' } });
  });

  it('dos filas ACTIVAS con la misma (categoria, clave) → conflicto DB (P2002)', async () => {
    const base = {
      categoria: 'smtp-4-11-test',
      clave: 'host',
      valor: 'primero.ejemplo.com',
      tipo: 'string',
      esSecreto: false,
    };

    await masterClient.configuracionRuntime.create({ data: base });

    await expect(
      masterClient.configuracionRuntime.create({ data: { ...base, valor: 'segundo.ejemplo.com' } }),
    ).rejects.toThrow();
  });

  it('una fila soft-eliminada + una fila ACTIVA con la misma (categoria, clave) coexisten (índice parcial)', async () => {
    const base = {
      categoria: 'smtp-4-11-test',
      clave: 'port',
      valor: '587',
      tipo: 'number',
      esSecreto: false,
    };

    const primera = await masterClient.configuracionRuntime.create({ data: base });
    await masterClient.configuracionRuntime.update({
      where: { id: primera.id },
      data: { deletedAt: new Date() },
    });

    // La primera está soft-eliminada — el índice parcial (WHERE deleted_at
    // IS NULL) NO la considera, así que una nueva fila activa con la misma
    // (categoria, clave) es válida.
    const segunda = await masterClient.configuracionRuntime.create({
      data: { ...base, valor: '465' },
    });

    expect(segunda.deletedAt).toBeNull();
    expect(segunda.valor).toBe('465');
  });

  it('distinta categoria con la misma clave coexisten sin conflicto', async () => {
    await masterClient.configuracionRuntime.create({
      data: {
        categoria: 'smtp-4-11-test',
        clave: 'host',
        valor: 'a.ejemplo.com',
        tipo: 'string',
        esSecreto: false,
      },
    });

    await expect(
      masterClient.configuracionRuntime.create({
        data: {
          categoria: 'smtp-4-11-test-otra',
          clave: 'host',
          valor: 'b.ejemplo.com',
          tipo: 'string',
          esSecreto: false,
        },
      }),
    ).resolves.toBeDefined();

    // Limpieza de la categoría auxiliar usada solo en este test.
    await masterClient.configuracionRuntime.deleteMany({
      where: { categoria: 'smtp-4-11-test-otra' },
    });
  });
});
