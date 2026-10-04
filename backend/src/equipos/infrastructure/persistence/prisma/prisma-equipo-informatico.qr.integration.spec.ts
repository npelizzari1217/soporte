/**
 * [INTEGRATION] QR del equipo (sdd/formulario-publico-qr, WU-4) contra Postgres REAL, en una base
 * de INQUILINO EFÍMERA propia migrada con todas las migraciones: `findByQrHash`, `guardarQrHash`
 * (CAS), UNIQUE nullable, aislamiento entre tenants y el `rollback.sql`. No toca master: sin
 * `usarLockMasterTest()`. Higiene: filas -> cerrar pool -> dropDatabase.
 */
import { randomBytes } from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { EquipoInformaticoEntity } from '../../../domain/entities/equipo-informatico.entity';
import { PrismaEquipoInformaticoRepository } from './prisma-equipo-informatico.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const sufijo = randomBytes(4).toString('hex');
const DB_A = `soporte_equipos_qr_a_${sufijo}_test`;
const DB_B = `soporte_equipos_qr_b_${sufijo}_test`;
const CARPETA = path.resolve(
  __dirname,
  '../../../../../prisma_tenant/migrations/20261003130000_equipos_qr',
);

const HASH_1 = 'a'.repeat(64);
const HASH_2 = 'b'.repeat(64);

describe('PrismaEquipoInformaticoRepository — QR del equipo (WU-4, tenant efímero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let prismaService: PrismaService;
  let clientA: InstanceType<typeof TenantPrismaClient>;
  let clientB: InstanceType<typeof TenantPrismaClient>;
  const tenantContext = new TenantContext();
  const repo = new PrismaEquipoInformaticoRepository(tenantContext);

  const enA = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: clientA, dbName: DB_A, clienteId: 'cliente-a' }, fn);
  const enB = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: clientB, dbName: DB_B, clienteId: 'cliente-b' }, fn);

  async function crearEquipo(
    ejecutar: <T>(fn: () => Promise<T>) => Promise<T>,
    nombre = 'Equipo QR',
  ): Promise<EquipoInformaticoEntity> {
    const equipo = EquipoInformaticoEntity.create({
      nombre,
      numeroSerie: null,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacion: null,
      importe: null,
      fechaValoracion: null,
      observaciones: null,
      valorResidual: null,
      fechaValorResidual: null,
    });
    await ejecutar(() => repo.save(equipo));
    return equipo;
  }

  beforeAll(async () => {
    await admin.createDatabase(DB_A);
    await admin.createDatabase(DB_B);
    const runner = new TenantMigrationRunnerAdapter(MASTER_TEST_URL);
    await runner.run(DB_A);
    await runner.run(DB_B);
    prismaService = new PrismaService(MASTER_TEST_URL);
    clientA = prismaService.getTenantClient(DB_A);
    clientB = prismaService.getTenantClient(DB_B);
  }, 120_000);

  afterAll(async () => {
    try {
      await clientA?.equipoInformatico.deleteMany();
      await clientB?.equipoInformatico.deleteMany();
    } catch {
      /* no-op */
    }
    try {
      await prismaService?.onModuleDestroy();
    } catch {
      /* no-op */
    }
    await admin.dropDatabase(DB_A);
    await admin.dropDatabase(DB_B);
  }, 60_000);

  beforeEach(async () => {
    await clientA.equipoInformatico.deleteMany();
    await clientB.equipoInformatico.deleteMany();
  });

  it('guardarQrHash escribe el hash y findByQrHash devuelve el equipo', async () => {
    const equipo = await crearEquipo(enA);

    const guardado = await enA(() => repo.guardarQrHash(equipo.id, HASH_1, new Date()));
    const hallado = await enA(() => repo.findByQrHash(HASH_1));

    expect(guardado).toBe(true);
    expect(hallado?.id).toBe(equipo.id);
  });

  it('un hash inexistente no resuelve', async () => {
    await crearEquipo(enA);
    expect(await enA(() => repo.findByQrHash(HASH_2))).toBeNull();
  });

  it('regenerar reemplaza el hash: el anterior deja de resolver', async () => {
    const equipo = await crearEquipo(enA);
    await enA(() => repo.guardarQrHash(equipo.id, HASH_1, new Date()));

    await enA(() => repo.guardarQrHash(equipo.id, HASH_2, new Date()));

    expect(await enA(() => repo.findByQrHash(HASH_1))).toBeNull();
    expect((await enA(() => repo.findByQrHash(HASH_2)))?.id).toBe(equipo.id);
  });

  it('el hash de un equipo del tenant B no resuelve en el tenant A', async () => {
    const deB = await crearEquipo(enB);
    await enB(() => repo.guardarQrHash(deB.id, HASH_1, new Date()));

    expect(await enA(() => repo.findByQrHash(HASH_1))).toBeNull();
    expect((await enB(() => repo.findByQrHash(HASH_1)))?.id).toBe(deB.id);
  });

  it('CAS: un equipo dado de baja, borrado o inexistente no recibe QR', async () => {
    const baja = await crearEquipo(enA, 'De baja');
    await clientA.equipoInformatico.update({ where: { id: baja.id }, data: { activo: false } });
    const borrado = await crearEquipo(enA, 'Borrado');
    await enA(() => repo.delete(borrado.id));

    expect(await enA(() => repo.guardarQrHash(baja.id, HASH_1, new Date()))).toBe(false);
    expect(await enA(() => repo.guardarQrHash(borrado.id, HASH_2, new Date()))).toBe(false);
    expect(
      await enA(() =>
        repo.guardarQrHash('00000000-0000-4000-8000-000000000000', HASH_1, new Date()),
      ),
    ).toBe(false);
  });

  it('findByQrHash devuelve un equipo dado de baja con QR emitido antes de la baja', async () => {
    const equipo = await crearEquipo(enA);
    await enA(() => repo.guardarQrHash(equipo.id, HASH_1, new Date()));
    await clientA.equipoInformatico.update({ where: { id: equipo.id }, data: { activo: false } });

    const hallado = await enA(() => repo.findByQrHash(HASH_1));

    expect(hallado?.id).toBe(equipo.id);
    expect(hallado?.activo).toBe(false);
  });

  it('el UNIQUE rechaza el mismo hash en dos equipos; varios equipos sin QR conviven', async () => {
    const uno = await crearEquipo(enA, 'Uno');
    const dos = await crearEquipo(enA, 'Dos');
    await crearEquipo(enA, 'Tres sin QR');
    await enA(() => repo.guardarQrHash(uno.id, HASH_1, new Date()));

    await expect(enA(() => repo.guardarQrHash(dos.id, HASH_1, new Date()))).rejects.toThrow();
  });

  it('save() con una entidad vieja no pisa el QR', async () => {
    const equipo = await crearEquipo(enA);
    await enA(() => repo.guardarQrHash(equipo.id, HASH_1, new Date()));

    await enA(() => repo.save(equipo));

    expect((await enA(() => repo.findByQrHash(HASH_1)))?.id).toBe(equipo.id);
  });

  it('rollback.sql quita las columnas y el índice sin tocar las filas', async () => {
    const equipo = await crearEquipo(enA);
    await enA(() => repo.guardarQrHash(equipo.id, HASH_1, new Date()));

    const sentencias = fs
      .readFileSync(path.join(CARPETA, 'rollback.sql'), 'utf8')
      .split('\n')
      .filter((linea) => !linea.startsWith('--'))
      .join('\n')
      .split(';')
      .map((sentencia) => sentencia.trim())
      .filter(Boolean);
    for (const sentencia of sentencias) {
      await clientA.$executeRawUnsafe(sentencia);
    }

    const columnas = await clientA.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'equipos_informaticos' AND column_name LIKE 'qr_%'`,
    );
    const filas = await clientA.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM equipos_informaticos WHERE id = '${equipo.id}'`,
    );
    expect(columnas).toEqual([]);
    expect(filas).toHaveLength(1);
  });
});
