/**
 * [INTEGRATION] `OperacionesUnidadInsumo` (ADR-4 y ADR-12 de
 * sdd/repuestos-numero-de-serie) con los repositorios Prisma reales contra
 * `soporte_tenant_test`: alta por lote y reversión ante P2002.
 *
 * Fixtures con prefijo por corrida. No toca `soporte_master_test`, así que no
 * necesita `usarLockMasterTest()`.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { PrismaInsumoRepository } from './prisma-insumo.repository';
import { PrismaMovimientoInsumoRepository } from './prisma-movimiento-insumo.repository';
import { PrismaUnidadInsumoRepository } from './prisma-unidad-insumo.repository';
import { PrismaEventoUnidadInsumoRepository } from './prisma-evento-unidad-insumo.repository';
import { OperacionesUnidadInsumo } from '../../../application/services/operaciones-unidad-insumo.service';
import { FalloOperacionDeUnidad } from '../../../domain/errors/fallo-operacion-de-unidad';
import { SerialDuplicadoError } from '../../../domain/errors/unidades-insumo.errors';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('OperacionesUnidadInsumo — Integration', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let txRunner: PrismaTenantTransactionRunner;
  let servicio: OperacionesUnidadInsumo;

  const PREFIJO = `OPU_${randomBytes(2).toString('hex')}_`;
  const usuarioId = randomUUID();
  let insumoId: string;

  beforeAll(async () => {
    prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    const tenantUrl = prismaServiceParaUrl.buildTenantUrl(TENANT_TEST_DB_NAME);
    pool = new Pool({ connectionString: tenantUrl, max: 5 });
    tenantClient = new TenantPrismaClient({ adapter: new PrismaPg(pool) });

    tenantContext = new TenantContext();
    txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });
    servicio = new OperacionesUnidadInsumo(
      new PrismaInsumoRepository(tenantContext),
      new PrismaMovimientoInsumoRepository(tenantContext),
      new PrismaUnidadInsumoRepository(tenantContext),
      new PrismaEventoUnidadInsumoRepository(tenantContext),
    );

    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}F`, nombre: 'Familia de prueba' },
    });
    const unidadMedida = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}U`, nombre: 'Unidad entera', entera: true },
    });
    insumoId = (
      await tenantClient.insumo.create({
        data: {
          codigo: `${PREFIJO}A`,
          nombre: 'Insumo SERIE',
          familiaId: familia.id,
          unidadMedidaId: unidadMedida.id,
          seguimiento: 'SERIE',
        },
      })
    ).id;
  }, 30_000);

  async function limpiar(): Promise<void> {
    const unidades = await tenantClient.unidadInsumo.findMany({
      where: { insumoId },
      select: { id: true },
    });
    const ids = unidades.map((u) => u.id);
    await tenantClient.eventoUnidadInsumo.deleteMany({ where: { unidadId: { in: ids } } });
    await tenantClient.movimientoInsumo.deleteMany({ where: { insumoId } });
    await tenantClient.unidadInsumo.deleteMany({ where: { insumoId } });
  }

  afterAll(async () => {
    await limpiar();
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.$disconnect();
    await pool.end().catch(() => undefined);
    await prismaServiceParaUrl.onModuleDestroy();
  }, 30_000);

  beforeEach(limpiar);

  function conTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-opu' },
      fn,
    );
  }

  const contar = async () => ({
    unidades: await tenantClient.unidadInsumo.count({ where: { insumoId } }),
    movimientos: await tenantClient.movimientoInsumo.count({ where: { insumoId } }),
    eventos: await tenantClient.eventoUnidadInsumo.count({
      where: { unidad: { insumoId } },
    }),
  });

  it('una entrada de 3 piezas deja 3 unidades, 3 movimientos y 3 eventos en una transacción', async () => {
    const r = await conTenant(() =>
      txRunner.run(() =>
        servicio.ingresar(
          insumoId,
          [{ numeroSerie: 'S-1' }, { numeroSerie: 's 2' }, { numeroSerie: null }],
          { usuarioId, condicion: 'NUEVO', tipo: 'ENTRADA' },
        ),
      ),
    );
    expect(r.getValue()).toHaveLength(3);
    expect(await contar()).toEqual({ unidades: 3, movimientos: 3, eventos: 3 });
    const evento = await tenantClient.eventoUnidadInsumo.findFirstOrThrow({
      where: { unidadId: r.getValue()[0].unidad.id },
    });
    expect(evento.movimientoId).toBe(r.getValue()[0].movimiento.id);
    expect(evento.tipo).toBe('INGRESO');
  });

  it('el P2002 de la tercera pieza lanza FalloOperacionDeUnidad y revierte las tres', async () => {
    await conTenant(() =>
      txRunner.run(() =>
        servicio.ingresar(insumoId, [{ numeroSerie: 'DUP' }], {
          usuarioId,
          condicion: 'NUEVO',
          tipo: 'ENTRADA',
        }),
      ),
    );
    const antes = await contar();

    const error = await conTenant(() =>
      txRunner.run(() =>
        servicio.ingresar(
          insumoId,
          [{ numeroSerie: 'N-1' }, { numeroSerie: 'N-2' }, { numeroSerie: 'dup' }],
          { usuarioId, condicion: 'NUEVO', tipo: 'ENTRADA' },
        ),
      ),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(FalloOperacionDeUnidad);
    expect((error as FalloOperacionDeUnidad).errorDeDominio).toBeInstanceOf(SerialDuplicadoError);
    expect(await contar()).toEqual(antes);
  });
});
