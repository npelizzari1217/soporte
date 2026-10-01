/**
 * [INTEGRATION] `PrismaUnidadInsumoRepository.serialesExistentes()` contra
 * Postgres REAL (`soporte_tenant_test`). Fixtures con prefijo por corrida; este
 * spec no toca `soporte_master_test`, así que no necesita `usarLockMasterTest()`.
 */
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaUnidadInsumoRepository } from './prisma-unidad-insumo.repository';
import { UnidadInsumoEntity } from '../../../domain/entities/unidad-insumo.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('PrismaUnidadInsumoRepository.serialesExistentes — Integration', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let repo: PrismaUnidadInsumoRepository;

  const PREFIJO = `SEX_${randomBytes(2).toString('hex')}_`;
  let insumoId: string;
  let otroInsumoId: string;

  beforeAll(async () => {
    prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    pool = new Pool({
      connectionString: prismaServiceParaUrl.buildTenantUrl(TENANT_TEST_DB_NAME),
      max: 3,
    });
    tenantClient = new TenantPrismaClient({ adapter: new PrismaPg(pool) });
    tenantContext = new TenantContext();
    repo = new PrismaUnidadInsumoRepository(tenantContext);

    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}F`, nombre: 'Familia de prueba' },
    });
    const unidadMedida = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}U`, nombre: 'Unidad entera', entera: true },
    });
    const crearInsumo = (sufijo: string) =>
      tenantClient.insumo.create({
        data: {
          codigo: `${PREFIJO}${sufijo}`,
          nombre: `Insumo ${sufijo}`,
          familiaId: familia.id,
          unidadMedidaId: unidadMedida.id,
          seguimiento: 'SERIE',
        },
      });
    insumoId = (await crearInsumo('A')).id;
    otroInsumoId = (await crearInsumo('B')).id;
  }, 30_000);

  afterAll(async () => {
    await tenantClient.unidadInsumo.deleteMany({
      where: { insumoId: { in: [insumoId, otroInsumoId] } },
    });
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.$disconnect();
    await pool.end().catch(() => undefined);
    await prismaServiceParaUrl.onModuleDestroy();
  }, 30_000);

  beforeEach(async () => {
    await tenantClient.unidadInsumo.deleteMany({
      where: { insumoId: { in: [insumoId, otroInsumoId] } },
    });
  });

  const conTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-sex' },
      fn,
    );

  const nueva = (numeroSerie: string | null, insumo = insumoId) =>
    UnidadInsumoEntity.crearEnDeposito({
      insumoId: insumo,
      condicion: 'NUEVO',
      numeroSerie,
    }).getValue();

  it('devuelve los seriales que ya existen, normalizados, y omite los que no', async () => {
    await conTenant(async () => {
      await repo.insertar(nueva(' ab 12 '));
      await repo.insertar(nueva('cd34'));
    });

    const existentes = await conTenant(() => repo.serialesExistentes(insumoId, ['AB12', 'ZZ99']));
    expect([...existentes]).toEqual(['AB12']);
  });

  it('cuenta también una unidad descartada y no confunde las pendientes (sin serial)', async () => {
    const descartada = nueva('DESC1');
    await conTenant(async () => {
      await repo.insertar(descartada);
      await repo.insertar(nueva(null));
      descartada.descartarDeDeposito();
      await repo.guardarConEstadoEsperado(descartada, 'EN_DEPOSITO');
    });

    const existentes = await conTenant(() => repo.serialesExistentes(insumoId, ['DESC1']));
    expect([...existentes]).toEqual(['DESC1']);
  });

  it('ignora los seriales de otros insumos', async () => {
    await conTenant(() => repo.insertar(nueva('COMPARTIDO', otroInsumoId)));

    const existentes = await conTenant(() => repo.serialesExistentes(insumoId, ['COMPARTIDO']));
    expect(existentes.size).toBe(0);
  });

  it('una lista vacía devuelve vacío sin consultar la base', async () => {
    const espia = vi.spyOn(tenantClient.unidadInsumo, 'findMany');
    const existentes = await conTenant(() => repo.serialesExistentes(insumoId, []));
    expect(existentes.size).toBe(0);
    expect(espia).not.toHaveBeenCalled();
    espia.mockRestore();
  });
});
