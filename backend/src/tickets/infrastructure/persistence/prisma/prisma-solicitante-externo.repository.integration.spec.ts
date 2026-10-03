/**
 * [INTEGRATION] Solicitantes externos (sdd/formulario-publico-qr, WU-6, tarea 6.4) contra Postgres
 * REAL, en dos bases de INQUILINO EFÍMERAS migradas con todas las migraciones: guardar y leer,
 * `findNombres` en lote, una fila por pedido (sin deduplicar por email), aislamiento entre tenants
 * (el mismo email en A y B son dos externos sin vínculo), y el `rollback.sql`.
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
import { SolicitanteExternoEntity } from '../../../domain/entities/solicitante-externo.entity';
import { PrismaSolicitanteExternoRepository } from './prisma-solicitante-externo.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const sufijo = randomBytes(4).toString('hex');
const DB_A = `soporte_solic_ext_a_${sufijo}_test`;
const DB_B = `soporte_solic_ext_b_${sufijo}_test`;
const CARPETA = path.resolve(
  __dirname,
  '../../../../../prisma_tenant/migrations/20261003140000_solicitantes_externos',
);
const VERIFICADO = new Date('2026-10-03T12:00:00Z');

describe('PrismaSolicitanteExternoRepository (WU-6, tenant efímero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let prismaService: PrismaService;
  let clientA: InstanceType<typeof TenantPrismaClient>;
  let clientB: InstanceType<typeof TenantPrismaClient>;
  const tenantContext = new TenantContext();
  const repo = new PrismaSolicitanteExternoRepository(tenantContext);

  const enA = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: clientA, dbName: DB_A, clienteId: 'cliente-a' }, fn);
  const enB = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: clientB, dbName: DB_B, clienteId: 'cliente-b' }, fn);

  function externo(nombre: string, email = 'ana@ejemplo.com', telefono: string | null = null) {
    return SolicitanteExternoEntity.create({
      nombre,
      email,
      telefono,
      emailVerificadoAt: VERIFICADO,
    }).getValue();
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
      await clientA?.solicitanteExterno.deleteMany();
      await clientB?.solicitanteExterno.deleteMany();
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
    await clientA.solicitanteExterno.deleteMany();
    await clientB.solicitanteExterno.deleteMany();
  });

  it('save + findById devuelven los datos, con y sin teléfono', async () => {
    const conTel = externo('Ana', 'ana@ejemplo.com', '11 5555-0000');
    const sinTel = externo('Luis', 'luis@ejemplo.com');
    await enA(() => repo.save(conTel));
    await enA(() => repo.save(sinTel));

    const a = await enA(() => repo.findById(conTel.id));
    const l = await enA(() => repo.findById(sinTel.id));

    expect(a).toMatchObject({
      id: conTel.id,
      nombre: 'Ana',
      email: 'ana@ejemplo.com',
      telefono: '11 5555-0000',
    });
    expect(a?.emailVerificadoAt).toEqual(VERIFICADO);
    expect(l?.telefono).toBeNull();
  });

  it('findById de un id inexistente devuelve null', async () => {
    expect(await enA(() => repo.findById(externo('x').id))).toBeNull();
  });

  it('findNombres resuelve en lote y omite los ids inexistentes', async () => {
    const a = externo('Ana');
    const b = externo('Beto', 'beto@ejemplo.com');
    await enA(() => repo.save(a));
    await enA(() => repo.save(b));

    const nombres = await enA(() => repo.findNombres([a.id, b.id, externo('x').id]));

    expect(nombres).toEqual(
      new Map([
        [a.id, 'Ana'],
        [b.id, 'Beto'],
      ]),
    );
  });

  it('findNombres con lista vacía devuelve un mapa vacío', async () => {
    expect((await enA(() => repo.findNombres([]))).size).toBe(0);
  });

  it('una fila por pedido: el mismo email dos veces son dos externos con su propio nombre', async () => {
    const primero = externo('Ana', 'ana@ejemplo.com');
    const segundo = externo('Ana P.', 'ana@ejemplo.com');
    await enA(() => repo.save(primero));
    await enA(() => repo.save(segundo));

    expect(await clientA.solicitanteExterno.count()).toBe(2);
    expect((await enA(() => repo.findById(primero.id)))?.nombre).toBe('Ana');
    expect((await enA(() => repo.findById(segundo.id)))?.nombre).toBe('Ana P.');
  });

  it('el mismo email en dos clientes son dos externos sin vínculo (aislamiento)', async () => {
    const deA = externo('Ana A');
    const deB = externo('Ana B');
    await enA(() => repo.save(deA));
    await enB(() => repo.save(deB));

    expect(await enA(() => repo.findById(deB.id))).toBeNull();
    expect(await enB(() => repo.findById(deA.id))).toBeNull();
    expect((await enA(() => repo.findNombres([deA.id, deB.id]))).size).toBe(1);
    expect(await clientA.solicitanteExterno.count()).toBe(1);
    expect(await clientB.solicitanteExterno.count()).toBe(1);
  });

  it('save no admite un id repetido (solo inserta)', async () => {
    const e = externo('Ana');
    await enA(() => repo.save(e));

    await expect(enA(() => repo.save(e))).rejects.toThrow();
  });

  it('rollback.sql borra la tabla y el índice (con el vínculo de la WU-7 revertido antes)', async () => {
    await enA(() => repo.save(externo('Ana')));
    // La FK RESTRICT de `tickets.solicitante_externo_id` (WU-7) frena el DROP: se revierte primero.
    const rollbackWu7 = fs
      .readFileSync(
        path.resolve(CARPETA, '../20261003150000_tickets_solicitante_externo/rollback.sql'),
        'utf8',
      )
      .split('\n')
      .filter((linea) => !linea.startsWith('--'))
      .join('\n')
      .split(';')
      .map((sentencia) => sentencia.trim())
      .filter(Boolean);
    for (const sentencia of rollbackWu7) {
      await clientA.$executeRawUnsafe(sentencia);
    }

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

    const tabla = await clientA.$queryRawUnsafe<{ tablename: string }[]>(
      `SELECT tablename FROM pg_tables WHERE tablename = 'solicitantes_externos'`,
    );
    expect(tabla).toEqual([]);
  });
});
