/**
 * [INTEGRATION] Reglas de asignación (sdd/asignacion-automatica-por-tipo, WU-1, tarea 1.4) contra
 * Postgres REAL, en una base de INQUILINO EFÍMERA migrada con todas las migraciones: una regla por
 * tipo (PK), `fijar` como upsert, FK con cascada al borrar el tipo, `quitar` idempotente,
 * `findByTipoId` sin fila -> null y el `rollback.sql`.
 * No toca master: sin `usarLockMasterTest()`. Higiene: filas -> cerrar pool -> dropDatabase.
 */
import { randomBytes } from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { PrismaReglaAsignacionRepository } from './prisma-regla-asignacion.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const sufijo = randomBytes(4).toString('hex');
const DB = `soporte_regla_asig_${sufijo}_test`;
const CARPETA = path.resolve(
  __dirname,
  '../../../../../prisma_tenant/migrations/20261009120000_reglas_asignacion',
);
const RESPONSABLE_1 = '11111111-1111-4111-8111-111111111111';
const RESPONSABLE_2 = '22222222-2222-4222-8222-222222222222';
const ACTOR = '33333333-3333-4333-8333-333333333333';

describe('PrismaReglaAsignacionRepository (WU-1, tenant efímero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let prismaService: PrismaService;
  let client: InstanceType<typeof TenantPrismaClient>;
  const tenantContext = new TenantContext();
  const repo = new PrismaReglaAsignacionRepository(tenantContext);

  const enTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: client, dbName: DB, clienteId: 'cliente-a' }, fn);

  async function crearTipo(codigo: string): Promise<string> {
    const tipo = await client.tipoTicket.create({
      data: { codigo, nombre: codigo, modulo: 'TICKETS' },
    });
    return tipo.id;
  }

  beforeAll(async () => {
    await admin.createDatabase(DB);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(DB);
    prismaService = new PrismaService(MASTER_TEST_URL);
    client = prismaService.getTenantClient(DB);
  }, 120_000);

  afterAll(async () => {
    try {
      await client?.reglaAsignacion.deleteMany();
      await client?.tipoTicket.deleteMany();
    } catch {
      /* no-op */
    }
    try {
      await prismaService?.onModuleDestroy();
    } catch {
      /* no-op */
    }
    await admin.dropDatabase(DB);
  }, 60_000);

  beforeEach(async () => {
    await client.reglaAsignacion.deleteMany();
    await client.tipoTicket.deleteMany();
  });

  it('findByTipoId sin fila devuelve null', async () => {
    const tipoId = await crearTipo('T-SIN-REGLA');

    await expect(enTenant(() => repo.findByTipoId(tipoId))).resolves.toBeNull();
  });

  it('fijar crea la regla y findByTipoId / listar la devuelven', async () => {
    const tipoId = await crearTipo('T-A');

    const creada = await enTenant(() => repo.fijar(tipoId, RESPONSABLE_1, ACTOR));

    expect(creada).toMatchObject({
      tipoId,
      responsableId: RESPONSABLE_1,
      actualizadoPor: ACTOR,
    });
    await expect(enTenant(() => repo.findByTipoId(tipoId))).resolves.toMatchObject({
      responsableId: RESPONSABLE_1,
    });
    await expect(enTenant(() => repo.listar())).resolves.toHaveLength(1);
  });

  it('fijar es upsert: una sola regla por tipo (PK) y se actualiza el responsable', async () => {
    const tipoId = await crearTipo('T-B');
    await enTenant(() => repo.fijar(tipoId, RESPONSABLE_1, ACTOR));

    await enTenant(() => repo.fijar(tipoId, RESPONSABLE_2, ACTOR));

    const reglas = await enTenant(() => repo.listar());
    expect(reglas).toHaveLength(1);
    expect(reglas[0]).toMatchObject({ tipoId, responsableId: RESPONSABLE_2 });
  });

  it('la PK impide dos filas para el mismo tipo por fuera del repo', async () => {
    const tipoId = await crearTipo('T-C');
    await client.reglaAsignacion.create({
      data: { tipoId, responsableId: RESPONSABLE_1, actualizadoPor: ACTOR },
    });

    await expect(
      client.reglaAsignacion.create({
        data: { tipoId, responsableId: RESPONSABLE_2, actualizadoPor: ACTOR },
      }),
    ).rejects.toThrow();
  });

  it('la FK impide una regla para un tipo inexistente', async () => {
    await expect(
      enTenant(() => repo.fijar('99999999-9999-4999-8999-999999999999', RESPONSABLE_1, ACTOR)),
    ).rejects.toThrow();
  });

  it('al borrar el tipo se borra su regla (ON DELETE CASCADE)', async () => {
    const tipoId = await crearTipo('T-D');
    await enTenant(() => repo.fijar(tipoId, RESPONSABLE_1, ACTOR));

    await client.tipoTicket.delete({ where: { id: tipoId } });

    await expect(enTenant(() => repo.listar())).resolves.toEqual([]);
  });

  it('quitar borra la regla y es idempotente (sin regla no falla)', async () => {
    const tipoId = await crearTipo('T-E');
    await enTenant(() => repo.fijar(tipoId, RESPONSABLE_1, ACTOR));

    await enTenant(() => repo.quitar(tipoId));
    await expect(enTenant(() => repo.quitar(tipoId))).resolves.toBeUndefined();

    await expect(enTenant(() => repo.findByTipoId(tipoId))).resolves.toBeNull();
  });

  it('rollback.sql elimina la tabla y es re-ejecutable', async () => {
    const rollback = fs.readFileSync(path.join(CARPETA, 'rollback.sql'), 'utf8');

    await client.$executeRawUnsafe(rollback);
    await client.$executeRawUnsafe(rollback);

    const filas = await client.$queryRawUnsafe<{ existe: boolean }[]>(
      `SELECT to_regclass('reglas_asignacion') IS NOT NULL AS existe`,
    );
    expect(filas[0].existe).toBe(false);
  });
});
