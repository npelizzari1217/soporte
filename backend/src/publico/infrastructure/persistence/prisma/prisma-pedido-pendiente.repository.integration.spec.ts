/**
 * [INTEGRATION] Pedidos publicos pendientes (sdd/formulario-publico-qr, WU-11, tarea 11.4) contra
 * Postgres REAL, en dos bases de INQUILINO EFIMERAS migradas con todas las migraciones:
 *   - `consumir` (DELETE ... RETURNING): devuelve la fila y la borra; con dos llamadas
 *     concurrentes, cada una en su transaccion, una recibe el pedido y la otra null;
 *     un ROLLBACK restaura la fila.
 *   - `purgarVencidos`: borra solo los vencidos y solo los del tenant activo.
 *   - FK `equipo_id` ON DELETE SET NULL, aislamiento A/B y `rollback.sql`.
 * No toca master: sin `usarLockMasterTest()`. Higiene: filas -> cerrar pool -> dropDatabase.
 */
import { randomBytes } from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { PedidoPendienteEntity } from '../../../domain/entities/pedido-pendiente.entity';
import { PrismaPedidoPendienteRepository } from './prisma-pedido-pendiente.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const sufijo = randomBytes(4).toString('hex');
const DB_A = `soporte_pedido_pend_a_${sufijo}_test`;
const DB_B = `soporte_pedido_pend_b_${sufijo}_test`;
const CARPETA = path.resolve(
  __dirname,
  '../../../../../prisma_tenant/migrations/20261003170000_pedidos_publicos_pendientes',
);
const AHORA = new Date('2026-10-03T12:00:00Z');
const UN_DIA = 24 * 60 * 60 * 1000;

describe('PrismaPedidoPendienteRepository (WU-11, tenant efimero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let prismaService: PrismaService;
  let clientA: InstanceType<typeof TenantPrismaClient>;
  let clientB: InstanceType<typeof TenantPrismaClient>;
  const tenantContext = new TenantContext();
  const repo = new PrismaPedidoPendienteRepository(tenantContext);
  const txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });

  const enA = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: clientA, dbName: DB_A, clienteId: 'cliente-a' }, fn);
  const enB = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: clientB, dbName: DB_B, clienteId: 'cliente-b' }, fn);

  function pedido(
    overrides: Partial<{ ahora: Date; equipoId: string | null; email: string }> = {},
  ): PedidoPendienteEntity {
    return PedidoPendienteEntity.create({
      nombre: 'Ana Perez',
      email: overrides.email ?? 'ana@ejemplo.com',
      telefono: '1155550000',
      titulo: 'No enciende',
      descripcion: 'La PC no enciende',
      equipoId: overrides.equipoId ?? null,
      ahora: overrides.ahora ?? new Date(),
    }).getValue();
  }

  const contar = (client: InstanceType<typeof TenantPrismaClient>): Promise<number> =>
    client.pedidoPublicoPendiente.count();

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

  beforeEach(async () => {
    await clientA.pedidoPublicoPendiente.deleteMany();
    await clientB.pedidoPublicoPendiente.deleteMany();
  });

  afterAll(async () => {
    try {
      await clientA?.pedidoPublicoPendiente.deleteMany();
      await clientB?.pedidoPublicoPendiente.deleteMany();
      await clientA?.equipoInformatico.deleteMany();
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

  describe('save() y consumir()', () => {
    it('consumir devuelve el pedido completo y lo borra', async () => {
      const p = pedido();
      await enA(() => repo.save(p));

      const consumido = await enA(() => repo.consumir(p.id));

      expect(consumido).not.toBeNull();
      expect(consumido!.id).toBe(p.id);
      expect(consumido!.nombre).toBe('Ana Perez');
      expect(consumido!.email).toBe('ana@ejemplo.com');
      expect(consumido!.telefono).toBe('1155550000');
      expect(consumido!.titulo).toBe('No enciende');
      expect(consumido!.descripcion).toBe('La PC no enciende');
      expect(consumido!.equipoId).toBeNull();
      expect(consumido!.expiresAt.getTime()).toBe(p.expiresAt.getTime());
      expect(consumido!.isExpired()).toBe(false);
      expect(await contar(clientA)).toBe(0);
    });

    it('consumir un id inexistente da null', async () => {
      expect(await enA(() => repo.consumir('01977a00-0000-7000-8000-0000000000aa'))).toBeNull();
    });

    it('consumir no filtra por vigencia: devuelve un vencido para que el caller decida', async () => {
      const p = pedido({ ahora: new Date(Date.now() - 2 * UN_DIA) });
      await enA(() => repo.save(p));

      const consumido = await enA(() => repo.consumir(p.id));

      expect(consumido!.isExpired()).toBe(true);
    });

    it('DELETE concurrente: de varias confirmaciones, cada una en su transaccion, gana una sola', async () => {
      const p = pedido();
      await enA(() => repo.save(p));

      const resultados = await Promise.all(
        Array.from({ length: 6 }, () => enA(() => txRunner.run(() => repo.consumir(p.id)))),
      );

      expect(resultados.filter((r) => r !== null)).toHaveLength(1);
      expect(await contar(clientA)).toBe(0);
    });

    it('un ROLLBACK posterior al consumir restaura la fila y el link sigue valido', async () => {
      const p = pedido();
      await enA(() => repo.save(p));
      const centinela = new Error('sin ciclo activo');

      await expect(
        enA(() =>
          txRunner.run(async () => {
            expect(await repo.consumir(p.id)).not.toBeNull();
            throw centinela;
          }),
        ),
      ).rejects.toBe(centinela);

      expect(await contar(clientA)).toBe(1);
      expect(await enA(() => repo.consumir(p.id))).not.toBeNull();
    });

    it('con el equipo borrado fisicamente el pedido sigue valido y queda sin equipo (SET NULL)', async () => {
      const equipo = await clientA.equipoInformatico.create({ data: { nombre: 'PC de prueba' } });
      const p = pedido({ equipoId: equipo.id });
      await enA(() => repo.save(p));

      await clientA.equipoInformatico.delete({ where: { id: equipo.id } });
      const consumido = await enA(() => repo.consumir(p.id));

      expect(consumido).not.toBeNull();
      expect(consumido!.equipoId).toBeNull();
    });
  });

  describe('purgarVencidos()', () => {
    it('borra solo los vencidos y deja los vigentes', async () => {
      const vencido1 = pedido({ ahora: new Date(Date.now() - 2 * UN_DIA), email: 'v1@x.com' });
      const vencido2 = pedido({ ahora: new Date(Date.now() - 3 * UN_DIA), email: 'v2@x.com' });
      const vigente = pedido({ email: 'ok@x.com' });
      for (const p of [vencido1, vencido2, vigente]) await enA(() => repo.save(p));

      const borrados = await enA(() => repo.purgarVencidos());

      expect(borrados).toBe(2);
      const quedan = await clientA.pedidoPublicoPendiente.findMany();
      expect(quedan.map((f) => f.id)).toEqual([vigente.id]);
    });

    it('el instante exacto del vencimiento ya se purga', async () => {
      const p = pedido({ ahora: AHORA });
      await enA(() => repo.save(p));

      expect(await enA(() => repo.purgarVencidos(new Date(p.expiresAt.getTime() - 1)))).toBe(0);
      expect(await enA(() => repo.purgarVencidos(p.expiresAt))).toBe(1);
    });

    it('sin vencidos devuelve 0', async () => {
      await enA(() => repo.save(pedido()));
      expect(await enA(() => repo.purgarVencidos())).toBe(0);
      expect(await contar(clientA)).toBe(1);
    });

    it('purga solo el tenant activo: los vencidos de B no se tocan', async () => {
      const enAVencido = pedido({ ahora: new Date(Date.now() - 2 * UN_DIA) });
      const enBVencido = pedido({ ahora: new Date(Date.now() - 2 * UN_DIA) });
      await enA(() => repo.save(enAVencido));
      await enB(() => repo.save(enBVencido));

      expect(await enA(() => repo.purgarVencidos())).toBe(1);

      expect(await contar(clientA)).toBe(0);
      expect(await contar(clientB)).toBe(1);
    });
  });

  describe('aislamiento entre tenants', () => {
    it('un pedido de A no se consume desde B', async () => {
      const p = pedido();
      await enA(() => repo.save(p));

      expect(await enB(() => repo.consumir(p.id))).toBeNull();
      expect(await contar(clientA)).toBe(1);
    });
  });

  // Ultimo a proposito: deja a B sin la tabla.
  it('rollback.sql borra la tabla y los indices', async () => {
    const sentencias = fs
      .readFileSync(path.join(CARPETA, 'rollback.sql'), 'utf8')
      .split('\n')
      .filter((linea) => !linea.startsWith('--'))
      .join('\n')
      .split(';')
      .map((sentencia) => sentencia.trim())
      .filter(Boolean);
    for (const sentencia of sentencias) {
      await clientB.$executeRawUnsafe(sentencia);
    }

    const tabla = await clientB.$queryRawUnsafe<{ tablename: string }[]>(
      `SELECT tablename FROM pg_tables WHERE tablename = 'pedidos_publicos_pendientes'`,
    );
    expect(tabla).toEqual([]);
  });
});
