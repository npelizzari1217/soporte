/**
 * [INTEGRATION] Lecturas con lock de fila de la invariante L (ADR-12 de
 * sdd/repuestos-numero-de-serie), contra
 * `soporte_tenant_test`.
 *
 * Cada lock se prueba DESDE AFUERA: una sesión testigo, sin Prisma, intenta
 * tomar el mismo lock con `NOWAIT` mientras la transacción bajo prueba lo
 * tiene. `55P03` (lock_not_available) prueba que el lock existe y de qué fuerza
 * es; el caso hermano —un modo compatible que SÍ pasa— es lo que impide dar por
 * bueno un `FOR UPDATE` donde el diseño pide `FOR NO KEY UPDATE` o `FOR SHARE`.
 *
 * Fixtures con prefijo por corrida sobre la base compartida; este spec no toca
 * `soporte_master_test`, así que no necesita `usarLockMasterTest()`.
 */
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { PrismaInsumoRepository } from './prisma-insumo.repository';
import { PrismaUnidadMedidaRepository } from './prisma-unidad-medida.repository';
import { PrismaMovimientoInsumoRepository } from './prisma-movimiento-insumo.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

type ModoDeLock = 'FOR KEY SHARE' | 'FOR SHARE' | 'FOR NO KEY UPDATE' | 'FOR UPDATE';

describe('lecturas con lock de fila (ADR-12)', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  let poolTestigo: Pool;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let txRunner: PrismaTenantTransactionRunner;
  let insumoRepo: PrismaInsumoRepository;
  let unidadMedidaRepo: PrismaUnidadMedidaRepository;
  let movimientoRepo: PrismaMovimientoInsumoRepository;

  const PREFIJO = `LCK_${randomBytes(2).toString('hex')}_`;
  let familiaId: string;
  let unidadMedidaId: string;
  let insumoId: string;

  beforeAll(async () => {
    prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    const tenantUrl = prismaServiceParaUrl.buildTenantUrl(TENANT_TEST_DB_NAME);
    pool = new Pool({ connectionString: tenantUrl, max: 5 });
    tenantClient = new TenantPrismaClient({ adapter: new PrismaPg(pool) });
    poolTestigo = new Pool({ connectionString: tenantUrl, max: 3 });

    tenantContext = new TenantContext();
    txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });
    insumoRepo = new PrismaInsumoRepository(tenantContext);
    unidadMedidaRepo = new PrismaUnidadMedidaRepository(tenantContext);
    movimientoRepo = new PrismaMovimientoInsumoRepository(tenantContext);

    familiaId = (
      await tenantClient.familiaInsumo.create({
        data: { codigo: `${PREFIJO}F`, nombre: 'Familia de prueba' },
      })
    ).id;
    unidadMedidaId = (
      await tenantClient.unidadMedida.create({
        data: { codigo: `${PREFIJO}U`, nombre: 'Unidad entera', entera: true },
      })
    ).id;
    insumoId = (
      await tenantClient.insumo.create({
        data: {
          codigo: `${PREFIJO}A`,
          nombre: 'Insumo bajo prueba',
          familiaId,
          unidadMedidaId,
        },
      })
    ).id;
  }, 30_000);

  afterAll(async () => {
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.$disconnect();
    await pool.end().catch(() => undefined);
    await poolTestigo.end().catch(() => undefined);
    await prismaServiceParaUrl.onModuleDestroy();
  }, 30_000);

  beforeEach(async () => {
    await tenantClient.insumo.update({ where: { id: insumoId }, data: { seguimiento: 'NINGUNO' } });
  });

  function conTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-lck' },
      fn,
    );
  }

  /** `true` si la sesión testigo consigue el lock; `false` si está ocupado (55P03). */
  async function testigoConsigue(
    tabla: 'insumos' | 'unidades_medida',
    id: string,
    modo: ModoDeLock,
  ): Promise<boolean> {
    const cliente = await poolTestigo.connect();
    try {
      await cliente.query('BEGIN');
      try {
        await cliente.query(`SELECT 1 FROM ${tabla} WHERE id = $1 ${modo} NOWAIT`, [id]);
        return true;
      } catch (err) {
        if ((err as { code?: string }).code === '55P03') return false;
        throw err;
      } finally {
        await cliente.query('ROLLBACK');
      }
    } finally {
      cliente.release();
    }
  }

  describe('fuera de una transacción', () => {
    const casos: Array<[string, () => Promise<unknown>]> = [
      ['leerSeguimientoParaMovimiento', () => insumoRepo.leerSeguimientoParaMovimiento(insumoId)],
      [
        'bloquearParaCambioDeSeguimiento',
        () => insumoRepo.bloquearParaCambioDeSeguimiento(insumoId),
      ],
      ['leerParaUso', () => unidadMedidaRepo.leerParaUso(unidadMedidaId)],
      [
        'bloquearParaEdicion',
        () => unidadMedidaRepo.bloquearParaEdicion(unidadMedidaId, 'SIN_CAMBIO_DE_CODIGO'),
      ],
      ['bloquearStock', () => movimientoRepo.bloquearStock(insumoId)],
    ];

    it.each(casos)('%s falla nombrando la transacción faltante', async (_nombre, llamar) => {
      await expect(conTenant(llamar)).rejects.toThrow(/requiere una transacción activa/);
    });
  });

  describe('insumo — L1', () => {
    it('leerSeguimientoParaMovimiento toma FOR SHARE: otro FOR SHARE pasa, FOR NO KEY UPDATE espera', async () => {
      const visto = await conTenant(() =>
        txRunner.run(async () => {
          const seguimiento = await insumoRepo.leerSeguimientoParaMovimiento(insumoId);
          return {
            seguimiento,
            compartido: await testigoConsigue('insumos', insumoId, 'FOR SHARE'),
            exclusivo: await testigoConsigue('insumos', insumoId, 'FOR NO KEY UPDATE'),
          };
        }),
      );
      expect(visto).toEqual({ seguimiento: 'NINGUNO', compartido: true, exclusivo: false });
      await expect(testigoConsigue('insumos', insumoId, 'FOR NO KEY UPDATE')).resolves.toBe(true);
    });

    it('leerSeguimientoParaMovimiento de un insumo inexistente devuelve null', async () => {
      const r = await conTenant(() =>
        txRunner.run(() =>
          insumoRepo.leerSeguimientoParaMovimiento('00000000-0000-4000-8000-000000000000'),
        ),
      );
      expect(r).toBeNull();
    });

    it('bloquearParaCambioDeSeguimiento toma FOR NO KEY UPDATE: FOR SHARE espera, FOR KEY SHARE pasa', async () => {
      const visto = await conTenant(() =>
        txRunner.run(async () => {
          const fila = await insumoRepo.bloquearParaCambioDeSeguimiento(insumoId);
          return {
            fila,
            share: await testigoConsigue('insumos', insumoId, 'FOR SHARE'),
            // Los FOR KEY SHARE implícitos de las FK no pueden quedar bloqueados.
            keyShare: await testigoConsigue('insumos', insumoId, 'FOR KEY SHARE'),
          };
        }),
      );
      expect(visto.fila).toEqual({ seguimiento: 'NINGUNO', unidadMedidaId });
      expect(visto.share).toBe(false);
      expect(visto.keyShare).toBe(true);
    });
  });

  describe('unidad de medida — L0', () => {
    it('leerParaUso devuelve entera y toma FOR SHARE', async () => {
      const visto = await conTenant(() =>
        txRunner.run(async () => ({
          lectura: await unidadMedidaRepo.leerParaUso(unidadMedidaId),
          compartido: await testigoConsigue('unidades_medida', unidadMedidaId, 'FOR SHARE'),
          exclusivo: await testigoConsigue('unidades_medida', unidadMedidaId, 'FOR NO KEY UPDATE'),
        })),
      );
      expect(visto).toEqual({ lectura: { entera: true }, compartido: true, exclusivo: false });
    });

    it('leerParaUso de una unidad inexistente devuelve null', async () => {
      const r = await conTenant(() =>
        txRunner.run(() => unidadMedidaRepo.leerParaUso('00000000-0000-4000-8000-000000000000')),
      );
      expect(r).toBeNull();
    });

    it('bloquearParaEdicion sin cambio de código toma FOR NO KEY UPDATE (FOR KEY SHARE pasa)', async () => {
      const visto = await conTenant(() =>
        txRunner.run(async () => ({
          unidad: await unidadMedidaRepo.bloquearParaEdicion(
            unidadMedidaId,
            'SIN_CAMBIO_DE_CODIGO',
          ),
          share: await testigoConsigue('unidades_medida', unidadMedidaId, 'FOR SHARE'),
          keyShare: await testigoConsigue('unidades_medida', unidadMedidaId, 'FOR KEY SHARE'),
        })),
      );
      expect(visto.unidad?.id).toBe(unidadMedidaId);
      expect(visto.share).toBe(false);
      expect(visto.keyShare).toBe(true);
    });

    it('bloquearParaEdicion con cambio de código toma FOR UPDATE (FOR KEY SHARE espera)', async () => {
      const keyShare = await conTenant(() =>
        txRunner.run(async () => {
          await unidadMedidaRepo.bloquearParaEdicion(unidadMedidaId, 'CAMBIA_CODIGO');
          return testigoConsigue('unidades_medida', unidadMedidaId, 'FOR KEY SHARE');
        }),
      );
      expect(keyShare).toBe(false);
    });
  });

  describe('stock — L2', () => {
    it('bloquearStock toma el advisory lock insumo-stock:<id> y lo suelta al commit', async () => {
      const sondear = async (): Promise<boolean> => {
        const r = await poolTestigo.query<{ libre: boolean }>(
          'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS libre',
          [`insumo-stock:${insumoId}`],
        );
        return r.rows[0].libre;
      };
      const durante = await conTenant(() =>
        txRunner.run(async () => {
          await movimientoRepo.bloquearStock(insumoId);
          return sondear();
        }),
      );
      expect(durante).toBe(false);
      await expect(sondear()).resolves.toBe(true);
    });
  });
});
