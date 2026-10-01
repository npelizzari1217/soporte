/**
 * [INTEGRATION] Locks LE del equipo (WU-2, baja-equipo-completo, ADR-2): `bloquearParaModificar`
 * (`FOR NO KEY UPDATE`) y `bloquearParaOperarPiezas` (`FOR SHARE`) contra Postgres real.
 *
 * Las compatibilidades se prueban con sondas deterministas: un cliente externo retiene un lock
 * sobre la fila del equipo y un segundo cliente intenta otra operación con `lock_timeout`
 * corto (`55P03` = esperó) o termina sin esperar. No son carreras de dos clientes.
 */
import { randomBytes } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { PrismaEquipoInformaticoRepository } from './prisma-equipo-informatico.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const ESPERA_SONDA_MS = 300;

describe('PrismaEquipoInformaticoRepository — locks LE (WU-2, ADR-2)', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let repo: PrismaEquipoInformaticoRepository;
  let txRunner: PrismaTenantTransactionRunner;

  const PREFIJO = `LEQ_${randomBytes(2).toString('hex')}_`;
  let equipoId: string;
  let equipoBorradoId: string;
  let insumoId: string;
  const idsComponentes: string[] = [];

  function conTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-leq' },
      fn,
    );
  }

  beforeAll(async () => {
    prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    pool = new Pool({
      connectionString: prismaServiceParaUrl.buildTenantUrl(TENANT_TEST_DB_NAME),
      max: 8,
    });
    tenantClient = new TenantPrismaClient({ adapter: new PrismaPg(pool) });
    tenantContext = new TenantContext();
    repo = new PrismaEquipoInformaticoRepository(tenantContext);
    txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });

    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}F`, nombre: 'Familia locks equipo', esRepuesto: true },
    });
    const unidadMedida = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}U`, nombre: 'Entera locks equipo', entera: true },
    });
    insumoId = (
      await tenantClient.insumo.create({
        data: {
          codigo: `${PREFIJO}I`,
          nombre: 'Repuesto locks equipo',
          familiaId: familia.id,
          unidadMedidaId: unidadMedida.id,
        },
      })
    ).id;
    equipoId = (
      await tenantClient.equipoInformatico.create({ data: { nombre: `${PREFIJO}Equipo` } })
    ).id;
    equipoBorradoId = (
      await tenantClient.equipoInformatico.create({
        data: { nombre: `${PREFIJO}Borrado`, deletedAt: new Date() },
      })
    ).id;
  }, 30_000);

  afterAll(async () => {
    await tenantClient.componenteEquipo.deleteMany({ where: { id: { in: idsComponentes } } });
    await tenantClient.equipoInformatico.deleteMany({
      where: { id: { in: [equipoId, equipoBorradoId] } },
    });
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.$disconnect();
    await pool.end().catch(() => undefined);
    await prismaServiceParaUrl.onModuleDestroy();
  }, 30_000);

  describe('contrato', () => {
    it.each([
      ['bloquearParaModificar', () => repo.bloquearParaModificar(equipoId)],
      ['bloquearParaOperarPiezas', () => repo.bloquearParaOperarPiezas(equipoId)],
    ])('%s lanza fuera de una transacción', async (_nombre, llamar) => {
      await expect(conTenant(llamar)).rejects.toThrow(/transacción activa/);
    });

    it.each([
      ['bloquearParaModificar', (id: string) => repo.bloquearParaModificar(id)],
      ['bloquearParaOperarPiezas', (id: string) => repo.bloquearParaOperarPiezas(id)],
    ])(
      '%s devuelve null si no existe y la entidad con deletedAt si está borrado',
      async (_n, f) => {
        await conTenant(() =>
          txRunner.run(async () => {
            expect(await f('01900000-0000-7000-8000-00000000dead')).toBeNull();
            const borrado = await f(equipoBorradoId);
            expect(borrado).not.toBeNull();
            expect(borrado!.isDeleted()).toBe(true);
            const vivo = await f(equipoId);
            expect(vivo!.id).toBe(equipoId);
            expect(vivo!.activo).toBe(true);
          }),
        );
      },
    );
  });

  describe('compatibilidad de locks (sondas deterministas)', () => {
    async function conBloqueador<T>(
      lockSql: string,
      fn: (sonda: PoolClient) => Promise<T>,
    ): Promise<T> {
      const bloqueador = await pool.connect();
      const sonda = await pool.connect();
      try {
        await bloqueador.query('BEGIN');
        await bloqueador.query(lockSql, [equipoId]);
        await sonda.query('BEGIN');
        await sonda.query(`SET LOCAL lock_timeout = '${ESPERA_SONDA_MS}ms'`);
        return await fn(sonda);
      } finally {
        await sonda.query('ROLLBACK').catch(() => undefined);
        await bloqueador.query('ROLLBACK').catch(() => undefined);
        sonda.release();
        bloqueador.release();
      }
    }

    const insertarComponente = async (sonda: PoolClient): Promise<void> => {
      const { rows } = await sonda.query(
        `INSERT INTO componentes_equipo (equipo_id, insumo_id, descripcion, updated_at)
         VALUES ($1, $2, 'sonda', now()) RETURNING id`,
        [equipoId, insumoId],
      );
      idsComponentes.push(rows[0].id as string);
    };

    const SHARE = 'SELECT id FROM equipos_informaticos WHERE id = $1 FOR SHARE';
    const NO_KEY = 'SELECT id FROM equipos_informaticos WHERE id = $1 FOR NO KEY UPDATE';

    it('FOR SHARE retenido no bloquea un INSERT con FK al equipo', async () => {
      await conBloqueador(SHARE, async (sonda) => {
        await expect(insertarComponente(sonda)).resolves.toBeUndefined();
      });
    });

    it('FOR SHARE retenido no bloquea otro FOR SHARE', async () => {
      await conBloqueador(SHARE, async (sonda) => {
        await expect(sonda.query(SHARE, [equipoId])).resolves.toBeDefined();
      });
    });

    it('FOR SHARE retenido hace esperar a un FOR NO KEY UPDATE', async () => {
      await conBloqueador(SHARE, async (sonda) => {
        await expect(sonda.query(NO_KEY, [equipoId])).rejects.toMatchObject({ code: '55P03' });
      });
    });

    it('FOR NO KEY UPDATE retenido no bloquea un INSERT con FK al equipo (base de T6)', async () => {
      await conBloqueador(NO_KEY, async (sonda) => {
        await expect(insertarComponente(sonda)).resolves.toBeUndefined();
      });
    });

    it('FOR NO KEY UPDATE retenido hace esperar a un FOR SHARE', async () => {
      await conBloqueador(NO_KEY, async (sonda) => {
        await expect(sonda.query(SHARE, [equipoId])).rejects.toMatchObject({ code: '55P03' });
      });
    });
  });
});
