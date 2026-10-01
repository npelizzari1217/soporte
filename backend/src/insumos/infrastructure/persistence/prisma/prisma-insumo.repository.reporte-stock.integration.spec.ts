/**
 * [INTEGRATION] `PrismaInsumoRepository.listarParaReporteStock()` contra
 * Postgres REAL (`soporte_tenant_test`): el catálogo del reporte de stock.
 *
 * Fixtures prefijados por corrida; limpieza acotada por ese prefijo. Los
 * asserts se hacen sobre los insumos del prefijo (la base es compartida y puede
 * tener otros). No toca `soporte_master_test`, así que no necesita
 * `usarLockMasterTest()`.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaInsumoRepository } from './prisma-insumo.repository';
import type { FilaCatalogoStock } from '../../../domain/ports/i-insumo.repository';

const TENANT_TEST_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('PrismaInsumoRepository.listarParaReporteStock — Integration', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let repo: PrismaInsumoRepository;

  const PREFIJO = `INSR_${randomBytes(2).toString('hex')}_`;
  let familiaConsumible: string;
  let familiaRepuesto: string;
  let familiaDeshabilitada: string;

  /** Solo las filas del fixture: la base de test es compartida. */
  function propias(filas: FilaCatalogoStock[]): FilaCatalogoStock[] {
    return filas.filter((f) => f.codigo.startsWith(PREFIJO));
  }

  beforeAll(async () => {
    prismaService = new PrismaService(TENANT_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();
    tenantContext.bind({
      prismaClient: tenantClient,
      dbName: TENANT_TEST_DB_NAME,
      clienteId: 'test-cliente-insr',
    });
    repo = new PrismaInsumoRepository(tenantContext);

    const familia = async (sufijo: string, extra: { esRepuesto: boolean; activo?: boolean }) =>
      (
        await tenantClient.familiaInsumo.create({
          data: { codigo: `${PREFIJO}${sufijo}`, nombre: `Familia ${sufijo}`, ...extra },
        })
      ).id;
    familiaConsumible = await familia('FC', { esRepuesto: false });
    familiaRepuesto = await familia('FR', { esRepuesto: true });
    familiaDeshabilitada = await familia('FD', { esRepuesto: false, activo: false });

    const entera = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}UE`, nombre: 'Unidad entera', entera: true },
    });
    const fraccionaria = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}UF`, nombre: 'Litro', entera: false },
    });

    const insumo = (
      sufijo: string,
      familiaId: string,
      unidadMedidaId: string,
      extra: Record<string, unknown> = {},
    ) =>
      tenantClient.insumo.create({
        data: {
          codigo: `${PREFIJO}${sufijo}`,
          nombre: `Insumo ${sufijo}`,
          familiaId,
          unidadMedidaId,
          ...extra,
        },
      });
    // Se crean fuera de orden alfabético para probar el orden por código.
    await insumo('C3', familiaRepuesto, entera.id, { seguimiento: 'SERIE', stockMinimo: 2.5 });
    await insumo('A1', familiaConsumible, fraccionaria.id, { stockMinimo: 5 });
    await insumo('B2', familiaConsumible, entera.id);
    await insumo('D4', familiaConsumible, entera.id, { activo: false });
    await insumo('E5', familiaDeshabilitada, entera.id);
    await insumo('F6', familiaConsumible, entera.id, { deletedAt: new Date() });
  }, 30_000);

  afterAll(async () => {
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.$disconnect();
    await prismaService.onModuleDestroy();
  }, 30_000);

  it('excluye la baja lógica, incluye el deshabilitado y el de familia deshabilitada, y ordena por código', async () => {
    const filas = propias(await repo.listarParaReporteStock({}));

    expect(filas.map((f) => f.codigo)).toEqual(
      ['A1', 'B2', 'C3', 'D4', 'E5'].map((c) => `${PREFIJO}${c}`),
    );
    expect(filas.find((f) => f.codigo === `${PREFIJO}D4`)?.activo).toBe(false);
    expect(filas.find((f) => f.codigo === `${PREFIJO}E5`)?.familia.id).toBe(familiaDeshabilitada);
  });

  it('filtra por familiaId', async () => {
    const filas = propias(await repo.listarParaReporteStock({ familiaId: familiaRepuesto }));

    expect(filas.map((f) => f.codigo)).toEqual([`${PREFIJO}C3`]);
  });

  it('filtra por esRepuesto en ambos sentidos', async () => {
    const repuestos = propias(await repo.listarParaReporteStock({ esRepuesto: true }));
    const consumibles = propias(await repo.listarParaReporteStock({ esRepuesto: false }));

    expect(repuestos.map((f) => f.codigo)).toEqual([`${PREFIJO}C3`]);
    expect(consumibles.map((f) => f.codigo)).toEqual(
      ['A1', 'B2', 'D4', 'E5'].map((c) => `${PREFIJO}${c}`),
    );
  });

  it('combina familiaId y esRepuesto', async () => {
    const filas = propias(
      await repo.listarParaReporteStock({ familiaId: familiaConsumible, esRepuesto: true }),
    );

    expect(filas).toEqual([]);
  });

  it('convierte stockMinimo Decimal a number y conserva null', async () => {
    const filas = propias(await repo.listarParaReporteStock({}));
    const porCodigo = (c: string) => filas.find((f) => f.codigo === `${PREFIJO}${c}`)!;

    expect(porCodigo('A1').stockMinimo).toBe(5);
    expect(typeof porCodigo('A1').stockMinimo).toBe('number');
    expect(porCodigo('C3').stockMinimo).toBe(2.5);
    expect(porCodigo('B2').stockMinimo).toBeNull();
  });

  it('trae los campos de familia, unidad de medida y seguimiento', async () => {
    const filas = propias(await repo.listarParaReporteStock({}));
    const a1 = filas.find((f) => f.codigo === `${PREFIJO}A1`)!;
    const c3 = filas.find((f) => f.codigo === `${PREFIJO}C3`)!;

    expect(a1).toEqual({
      insumoId: expect.any(String),
      codigo: `${PREFIJO}A1`,
      nombre: 'Insumo A1',
      activo: true,
      seguimiento: 'NINGUNO',
      stockMinimo: 5,
      familia: { id: familiaConsumible, nombre: 'Familia FC', esRepuesto: false },
      unidadMedida: { codigo: `${PREFIJO}UF`, nombre: 'Litro', entera: false },
    });
    expect(c3.seguimiento).toBe('SERIE');
    expect(c3.familia.esRepuesto).toBe(true);
    expect(c3.unidadMedida.entera).toBe(true);
  });
});
