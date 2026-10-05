/**
 * [INTEGRATION] QR del equipo (sdd/formulario-publico-qr, WU-4) contra Postgres REAL, en una base
 * de INQUILINO EFÍMERA propia migrada con todas las migraciones: `findByQrHash`, `guardarQr`/`findQrById`
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

const CARPETA_TOKEN = path.resolve(
  __dirname,
  '../../../../../prisma_tenant/migrations/20261005120000_equipos_qr_token_claro',
);

const HASH_1 = 'a'.repeat(64);
const HASH_2 = 'b'.repeat(64);
const TOKEN_1 = 'token-uno-AAAAAAAAAAAA';
const TOKEN_2 = 'token-dos-BBBBBBBBBBBB';

/** Sentencias de un rollback.sql, sin comentarios, para correrlas una por una. */
function sentenciasDe(archivo: string): string[] {
  return fs
    .readFileSync(archivo, 'utf8')
    .split('\n')
    .filter((linea) => !linea.startsWith('--'))
    .join('\n')
    .split(';')
    .map((sentencia) => sentencia.trim())
    .filter(Boolean);
}

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

  it('guardarQr escribe token y hash y findByQrHash devuelve el equipo', async () => {
    const equipo = await crearEquipo(enA);

    const guardado = await enA(() => repo.guardarQr(equipo.id, TOKEN_1, HASH_1, new Date()));
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
    await enA(() => repo.guardarQr(equipo.id, TOKEN_1, HASH_1, new Date()));

    await enA(() => repo.guardarQr(equipo.id, TOKEN_2, HASH_2, new Date()));

    expect(await enA(() => repo.findByQrHash(HASH_1))).toBeNull();
    expect((await enA(() => repo.findByQrHash(HASH_2)))?.id).toBe(equipo.id);
  });

  it('el hash de un equipo del tenant B no resuelve en el tenant A', async () => {
    const deB = await crearEquipo(enB);
    await enB(() => repo.guardarQr(deB.id, TOKEN_1, HASH_1, new Date()));

    expect(await enA(() => repo.findByQrHash(HASH_1))).toBeNull();
    expect((await enB(() => repo.findByQrHash(HASH_1)))?.id).toBe(deB.id);
  });

  it('CAS: un equipo dado de baja, borrado o inexistente no recibe QR', async () => {
    const baja = await crearEquipo(enA, 'De baja');
    await clientA.equipoInformatico.update({ where: { id: baja.id }, data: { activo: false } });
    const borrado = await crearEquipo(enA, 'Borrado');
    await enA(() => repo.delete(borrado.id));

    expect(await enA(() => repo.guardarQr(baja.id, TOKEN_1, HASH_1, new Date()))).toBe(false);
    expect(await enA(() => repo.guardarQr(borrado.id, TOKEN_2, HASH_2, new Date()))).toBe(false);
    expect(
      await enA(() =>
        repo.guardarQr('00000000-0000-4000-8000-000000000000', TOKEN_1, HASH_1, new Date()),
      ),
    ).toBe(false);
  });

  it('findByQrHash devuelve un equipo dado de baja con QR emitido antes de la baja', async () => {
    const equipo = await crearEquipo(enA);
    await enA(() => repo.guardarQr(equipo.id, TOKEN_1, HASH_1, new Date()));
    await clientA.equipoInformatico.update({ where: { id: equipo.id }, data: { activo: false } });

    const hallado = await enA(() => repo.findByQrHash(HASH_1));

    expect(hallado?.id).toBe(equipo.id);
    expect(hallado?.activo).toBe(false);
  });

  it('el UNIQUE rechaza el mismo hash en dos equipos; varios equipos sin QR conviven', async () => {
    const uno = await crearEquipo(enA, 'Uno');
    const dos = await crearEquipo(enA, 'Dos');
    await crearEquipo(enA, 'Tres sin QR');
    await enA(() => repo.guardarQr(uno.id, TOKEN_1, HASH_1, new Date()));

    await expect(enA(() => repo.guardarQr(dos.id, TOKEN_1, HASH_1, new Date()))).rejects.toThrow();
  });

  it('save() con una entidad vieja no pisa el QR', async () => {
    const equipo = await crearEquipo(enA);
    await enA(() => repo.guardarQr(equipo.id, TOKEN_1, HASH_1, new Date()));

    await enA(() => repo.save(equipo));

    expect((await enA(() => repo.findByQrHash(HASH_1)))?.id).toBe(equipo.id);
  });

  it('guardarQr guarda token y hash juntos y findQrById los devuelve; regenerar reemplaza ambos', async () => {
    const equipo = await crearEquipo(enA);
    const emitido = new Date('2026-10-05T12:00:00Z');

    await enA(() => repo.guardarQr(equipo.id, TOKEN_1, HASH_1, emitido));
    expect(await enA(() => repo.findQrById(equipo.id))).toEqual({
      activo: true,
      qrToken: TOKEN_1,
      qrTokenHash: HASH_1,
      qrEmitidoAt: emitido,
    });

    await enA(() => repo.guardarQr(equipo.id, TOKEN_2, HASH_2, emitido));
    const regenerado = await enA(() => repo.findQrById(equipo.id));
    expect(regenerado?.qrToken).toBe(TOKEN_2);
    expect(regenerado?.qrTokenHash).toBe(HASH_2);
  });

  it('findQrById: sin QR devuelve todo en null; inexistente o borrado devuelve null; de baja se devuelve', async () => {
    const sinQr = await crearEquipo(enA, 'Sin QR');
    const borrado = await crearEquipo(enA, 'Borrado');
    await enA(() => repo.delete(borrado.id));
    const baja = await crearEquipo(enA, 'De baja');
    await clientA.equipoInformatico.update({ where: { id: baja.id }, data: { activo: false } });

    expect(await enA(() => repo.findQrById(sinQr.id))).toEqual({
      activo: true,
      qrToken: null,
      qrTokenHash: null,
      qrEmitidoAt: null,
    });
    expect(await enA(() => repo.findQrById(borrado.id))).toBeNull();
    expect(await enA(() => repo.findQrById('00000000-0000-4000-8000-000000000000'))).toBeNull();
    expect((await enA(() => repo.findQrById(baja.id)))?.activo).toBe(false);
  });

  it('un QR anterior al cambio (hash sin token) se lee con token null', async () => {
    const equipo = await crearEquipo(enA);
    await clientA.equipoInformatico.update({
      where: { id: equipo.id },
      data: { qrTokenHash: HASH_1, qrEmitidoAt: new Date() },
    });

    const qr = await enA(() => repo.findQrById(equipo.id));

    expect(qr?.qrToken).toBeNull();
    expect(qr?.qrTokenHash).toBe(HASH_1);
  });

  it('el CHECK rechaza un token sin hash', async () => {
    const equipo = await crearEquipo(enA);
    await expect(
      clientA.equipoInformatico.update({ where: { id: equipo.id }, data: { qrToken: TOKEN_1 } }),
    ).rejects.toThrow();
  });

  it('los rollback.sql quitan token, CHECK, columnas e índice sin tocar las filas', async () => {
    const equipo = await crearEquipo(enA);
    await enA(() => repo.guardarQr(equipo.id, TOKEN_1, HASH_1, new Date()));

    // Se deshacen en orden inverso. Primero solo la del token en claro: quita la columna y el
    // CHECK pero deja el hash, así que el QR impreso sigue resolviendo.
    for (const sentencia of sentenciasDe(path.join(CARPETA_TOKEN, 'rollback.sql'))) {
      await clientA.$executeRawUnsafe(sentencia);
    }
    const sinToken = await clientA.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'equipos_informaticos' AND column_name = 'qr_token'`,
    );
    expect(sinToken).toEqual([]);
    // Raw: con la columna ya fuera, el cliente de Prisma (que la conoce) no puede leer la fila.
    const conHash = await clientA.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM equipos_informaticos WHERE qr_token_hash = '${HASH_1}'`,
    );
    expect(conHash.map((f) => f.id)).toEqual([equipo.id]);

    for (const sentencia of sentenciasDe(path.join(CARPETA, 'rollback.sql'))) {
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
