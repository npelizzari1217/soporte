/**
 * prisma-error-codes.integration.spec.ts — ancla empírica de ADR-2
 * (sdd/filtro-prisma/design).
 *
 * El filtro global (`prisma-exception.filter.ts`) reconoce errores de Prisma
 * por `code`. Este spec NO prueba el filtro — verifica, INDEPENDIENTE de él,
 * con QUÉ código llega cada error al borde de la aplicación, contra una base
 * tenant real. La independencia es deliberada, no un accidente de orden de
 * escritura: el guard propio de este archivo (más abajo) no importa
 * `esErrorPrismaConocido` del filtro a propósito, para que un hecho empírico
 * sobre el código de Prisma nunca dependa del sujeto que ese mismo hecho
 * valida — si el guard del filtro se rompiera, esta ancla tiene que poder
 * seguir confirmando o desmintiendo el código real sin arrastrar la misma
 * rotura. El diseño asumió (por lectura estática del código del proveedor,
 * sin poder ejecutar) que tanto el exceso de largo de un `VarChar` como el
 * desborde de un `int4` llegan como `PrismaClientKnownRequestError` con
 * `code` `P2000` y `P2020` respectivamente. Esta corrida lo confirma o lo
 * desmiente por ejecución real, para que la tabla del filtro se escriba
 * sobre un hecho, no sobre una suposición.
 *
 * Usa un tenant EFÍMERO (mismo patrón que `sectores.e2e.spec.ts`):
 * `PostgresAdminService.createDatabase` + `TenantMigrationRunnerAdapter.run`.
 * Llama `usarLockMasterTest()` porque `PostgresAdminService` abre su pool de
 * administración contra la MISMA instancia de Postgres que
 * `soporte_master_test` (conecta a la base de mantenimiento `postgres` de
 * ese cluster) — sin el turno, una corrida concurrente de otro spec podría
 * competir por esa misma instancia mientras esta crea/migra/dropea su base.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from './prisma.service';
import { TenantPrismaClient } from './prisma-clients';
import { PostgresAdminService } from '../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_errcodes_${randomBytes(4).toString('hex')}_test`;

/**
 * Forma mínima que este spec necesita reconocer. Duplicada a propósito del
 * guard homónimo de `prisma-exception.filter.ts` (ver header): esta ancla
 * tiene que seguir siendo INDEPENDIENTE del sujeto que valida, para no poder
 * mentir en conjunto con él si ese guard se rompe.
 */
interface ErrorConNombreYCodigo {
  readonly name: string;
  readonly code: string;
}

function esErrorConNombreYCodigo(error: unknown): error is ErrorConNombreYCodigo {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof error.name === 'string' &&
    'code' in error &&
    typeof error.code === 'string'
  );
}

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('Prisma error codes — ancla empírica (sdd/filtro-prisma ADR-2)', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  const admin = new PostgresAdminService(MASTER_TEST_URL);

  beforeAll(async () => {
    await admin.createDatabase(TENANT_DB_NAME);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(TENANT_DB_NAME);

    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_DB_NAME);
  }, 90_000);

  afterAll(async () => {
    try {
      await prismaService?.onModuleDestroy();
    } catch {
      /* no-op — igual queremos dropear la base aunque el cierre del pool falle. */
    }
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 60_000);

  it('R1 — un `codigo` de 60 chars contra `sectores.codigo VarChar(50)` llega como PrismaClientKnownRequestError P2000', async () => {
    let errorCapturado: unknown;

    try {
      await tenantClient.sector.create({
        data: { codigo: 'A'.repeat(60), nombre: 'Ancla P2000' },
      });
    } catch (error) {
      errorCapturado = error;
    }

    expect(errorCapturado).toBeDefined();
    if (!esErrorConNombreYCodigo(errorCapturado)) {
      throw new Error('El error capturado no tiene la forma esperada (name/code string).');
    }
    expect(errorCapturado.name).toBe('PrismaClientKnownRequestError');
    expect(errorCapturado.code).toBe('P2000');
  });

  it('R2 — un `slaHoras` de 2**31 contra `prioridades.sla_horas int4` llega como PrismaClientKnownRequestError P2020', async () => {
    let errorCapturado: unknown;

    try {
      await tenantClient.prioridad.create({
        data: { codigo: 'ANCLA_P2020', nombre: 'Ancla P2020', slaHoras: 2 ** 31 },
      });
    } catch (error) {
      errorCapturado = error;
    }

    expect(errorCapturado).toBeDefined();
    if (!esErrorConNombreYCodigo(errorCapturado)) {
      throw new Error('El error capturado no tiene la forma esperada (name/code string).');
    }
    expect(errorCapturado.name).toBe('PrismaClientKnownRequestError');
    expect(errorCapturado.code).toBe('P2020');
  });
});
