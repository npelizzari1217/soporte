/**
 * [INTEGRATION] `PrismaUnidadInsumoRepository.contarEnDepositoPorCondicionDeInsumos()`
 * contra Postgres REAL (`soporte_tenant_test`): el conteo de lote del reporte
 * de stock para los insumos `SERIE`.
 *
 * Fixtures prefijados por corrida; limpieza acotada por ese prefijo. No toca
 * `soporte_master_test`, así que no necesita `usarLockMasterTest()`.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaUnidadInsumoRepository } from './prisma-unidad-insumo.repository';
import { CondicionStock } from '../../../domain/entities/tipo-movimiento-insumo';
import { EstadoUnidadInsumo } from '../../../domain/entities/unidad-insumo.entity';

const TENANT_TEST_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('PrismaUnidadInsumoRepository.contarEnDepositoPorCondicionDeInsumos — Integration', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let repo: PrismaUnidadInsumoRepository;

  const PREFIJO = `UNIB_${randomBytes(2).toString('hex')}_`;
  let insumoA: string;
  let insumoB: string;
  let insumoSinUnidades: string;
  let equipoId: string;

  let serie = 0;
  async function sembrar(
    insumoId: string,
    unidades: Array<{
      condicion: CondicionStock;
      estado: EstadoUnidadInsumo;
      pendiente?: boolean;
    }>,
  ): Promise<void> {
    for (const u of unidades) {
      serie += 1;
      const numeroSerie = u.pendiente === true ? null : `${PREFIJO}S${serie}`;
      await tenantClient.unidadInsumo.create({
        data: {
          insumoId,
          numeroSerie,
          numeroSerieNormalizado: numeroSerie?.toUpperCase() ?? null,
          condicion: u.condicion,
          estado: u.estado,
          equipoId: u.estado === 'INSTALADA' ? equipoId : null,
        },
      });
    }
  }

  beforeAll(async () => {
    prismaService = new PrismaService(TENANT_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();
    tenantContext.bind({
      prismaClient: tenantClient,
      dbName: TENANT_TEST_DB_NAME,
      clienteId: 'test-cliente-unib',
    });
    repo = new PrismaUnidadInsumoRepository(tenantContext);

    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}F`, nombre: 'Familia de prueba' },
    });
    const unidad = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}U`, nombre: 'Unidad entera', entera: true },
    });
    const crear = async (sufijo: string) =>
      (
        await tenantClient.insumo.create({
          data: {
            codigo: `${PREFIJO}${sufijo}`,
            nombre: `Insumo ${sufijo}`,
            familiaId: familia.id,
            unidadMedidaId: unidad.id,
            seguimiento: 'SERIE',
          },
        })
      ).id;
    insumoA = await crear('A');
    insumoB = await crear('B');
    insumoSinUnidades = await crear('C');

    // Una unidad `INSTALADA` exige un equipo (CHECK + FK): se crea uno propio del prefijo.
    equipoId = (
      await tenantClient.equipoInformatico.create({ data: { nombre: `${PREFIJO}equipo` } })
    ).id;
  }, 30_000);

  afterAll(async () => {
    await tenantClient.unidadInsumo.deleteMany({
      where: { insumoId: { in: [insumoA, insumoB, insumoSinUnidades] } },
    });
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.equipoInformatico.deleteMany({ where: { nombre: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.$disconnect();
    await prismaService.onModuleDestroy();
  }, 30_000);

  beforeEach(async () => {
    await tenantClient.unidadInsumo.deleteMany({
      where: { insumoId: { in: [insumoA, insumoB, insumoSinUnidades] } },
    });
  });

  it('cuenta solo las EN_DEPOSITO y descarta INSTALADA, ENTREGADA y DESCARTADA', async () => {
    await sembrar(insumoA, [
      { condicion: 'NUEVO', estado: 'EN_DEPOSITO' },
      { condicion: 'NUEVO', estado: 'EN_DEPOSITO' },
      { condicion: 'USADO', estado: 'EN_DEPOSITO' },
      { condicion: 'NUEVO', estado: 'INSTALADA' },
      { condicion: 'USADO', estado: 'ENTREGADA' },
      { condicion: 'USADO', estado: 'DESCARTADA' },
    ]);

    const mapa = await repo.contarEnDepositoPorCondicionDeInsumos([insumoA]);

    expect(mapa.get(insumoA)).toEqual({ NUEVO: 2, USADO: 1 });
  });

  it('la unidad pendiente de serie suma al conteo', async () => {
    await sembrar(insumoA, [
      { condicion: 'NUEVO', estado: 'EN_DEPOSITO' },
      { condicion: 'NUEVO', estado: 'EN_DEPOSITO', pendiente: true },
    ]);

    const mapa = await repo.contarEnDepositoPorCondicionDeInsumos([insumoA]);

    expect(mapa.get(insumoA)).toEqual({ NUEVO: 2, USADO: 0 });
  });

  it('devuelve ceros para un id sin unidades y no mezcla insumos', async () => {
    await sembrar(insumoA, [{ condicion: 'NUEVO', estado: 'EN_DEPOSITO' }]);
    await sembrar(insumoB, [{ condicion: 'USADO', estado: 'EN_DEPOSITO' }]);

    const mapa = await repo.contarEnDepositoPorCondicionDeInsumos([
      insumoA,
      insumoB,
      insumoSinUnidades,
    ]);

    expect(mapa.size).toBe(3);
    expect(mapa.get(insumoA)).toEqual({ NUEVO: 1, USADO: 0 });
    expect(mapa.get(insumoB)).toEqual({ NUEVO: 0, USADO: 1 });
    expect(mapa.get(insumoSinUnidades)).toEqual({ NUEVO: 0, USADO: 0 });
  });

  it('con lista vacía devuelve un mapa vacío sin ir a la base', async () => {
    const groupBy = vi.fn();
    const repoEspia = new PrismaUnidadInsumoRepository({
      getClient: () => ({ unidadInsumo: { groupBy } }),
    } as unknown as TenantContext);

    const mapa = await repoEspia.contarEnDepositoPorCondicionDeInsumos([]);

    expect(mapa.size).toBe(0);
    expect(groupBy).not.toHaveBeenCalled();
  });

  it('resuelve con UNA sola consulta agregada para N insumos', async () => {
    const groupBy = vi.fn().mockResolvedValue([]);
    const repoEspia = new PrismaUnidadInsumoRepository({
      getClient: () => ({ unidadInsumo: { groupBy } }),
    } as unknown as TenantContext);

    await repoEspia.contarEnDepositoPorCondicionDeInsumos([insumoA, insumoB, insumoSinUnidades]);

    expect(groupBy).toHaveBeenCalledTimes(1);
  });

  it('coincide, insumo por insumo, con contarEnDepositoPorCondicion()', async () => {
    await sembrar(insumoA, [
      { condicion: 'NUEVO', estado: 'EN_DEPOSITO' },
      { condicion: 'USADO', estado: 'EN_DEPOSITO', pendiente: true },
      { condicion: 'USADO', estado: 'DESCARTADA' },
    ]);
    await sembrar(insumoB, [{ condicion: 'USADO', estado: 'EN_DEPOSITO' }]);

    const ids = [insumoA, insumoB, insumoSinUnidades];
    const lote = await repo.contarEnDepositoPorCondicionDeInsumos(ids);
    for (const id of ids) {
      expect(lote.get(id)).toEqual(await repo.contarEnDepositoPorCondicion(id));
    }
  });
});
