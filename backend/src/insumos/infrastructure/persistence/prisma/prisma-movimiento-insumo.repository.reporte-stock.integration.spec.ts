/**
 * [INTEGRATION] `PrismaMovimientoInsumoRepository.sumByTipoDeInsumos()` contra
 * Postgres REAL (`soporte_tenant_test`): la lectura de lote del reporte de stock.
 *
 * Fixtures prefijados por corrida sobre la base compartida; la limpieza va
 * acotada por ese prefijo. No toca `soporte_master_test`, así que no necesita
 * `usarLockMasterTest()`.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaMovimientoInsumoRepository } from './prisma-movimiento-insumo.repository';
import {
  CONDICIONES_STOCK,
  CondicionStock,
  TIPOS_MOVIMIENTO_INSUMO,
  TipoMovimientoInsumo,
} from '../../../domain/entities/tipo-movimiento-insumo';
import { sumasCon, sumasEnCero } from '../../../testing/sumas-movimiento';

const TENANT_TEST_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('PrismaMovimientoInsumoRepository.sumByTipoDeInsumos — Integration', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let repo: PrismaMovimientoInsumoRepository;

  const PREFIJO = `MOVB_${randomBytes(2).toString('hex')}_`;
  const usuarioId = randomUUID();
  let insumoA: string;
  let insumoB: string;
  let insumoSinMovimientos: string;

  async function sembrar(
    insumoId: string,
    asientos: Array<{ tipo: TipoMovimientoInsumo; cantidad: number; condicion?: CondicionStock }>,
  ): Promise<void> {
    await tenantClient.movimientoInsumo.createMany({
      data: asientos.map((a) => ({
        insumoId,
        tipo: a.tipo,
        cantidad: a.cantidad,
        usuarioId,
        ...(a.condicion !== undefined ? { condicion: a.condicion } : {}),
      })),
    });
  }

  beforeAll(async () => {
    prismaService = new PrismaService(TENANT_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();
    tenantContext.bind({
      prismaClient: tenantClient,
      dbName: TENANT_TEST_DB_NAME,
      clienteId: 'test-cliente-movb',
    });
    repo = new PrismaMovimientoInsumoRepository(tenantContext);

    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}F`, nombre: 'Familia de prueba' },
    });
    const unidad = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}U`, nombre: 'Unidad de prueba' },
    });
    const crear = async (sufijo: string) =>
      (
        await tenantClient.insumo.create({
          data: {
            codigo: `${PREFIJO}${sufijo}`,
            nombre: `Insumo ${sufijo}`,
            familiaId: familia.id,
            unidadMedidaId: unidad.id,
          },
        })
      ).id;
    insumoA = await crear('A');
    insumoB = await crear('B');
    insumoSinMovimientos = await crear('C');
  }, 30_000);

  afterAll(async () => {
    await tenantClient.movimientoInsumo.deleteMany({
      where: { insumoId: { in: [insumoA, insumoB, insumoSinMovimientos] } },
    });
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.$disconnect();
    await prismaService.onModuleDestroy();
  }, 30_000);

  beforeEach(async () => {
    await tenantClient.movimientoInsumo.deleteMany({
      where: { insumoId: { in: [insumoA, insumoB, insumoSinMovimientos] } },
    });
  });

  it('devuelve ceros completos (2x4) para un insumo sin movimientos', async () => {
    const mapa = await repo.sumByTipoDeInsumos([insumoSinMovimientos]);

    expect(mapa.size).toBe(1);
    expect(mapa.get(insumoSinMovimientos)).toEqual(sumasEnCero());
    const sumas = mapa.get(insumoSinMovimientos)!;
    expect(Object.keys(sumas)).toEqual([...CONDICIONES_STOCK]);
    for (const condicion of CONDICIONES_STOCK) {
      expect(Object.keys(sumas[condicion])).toEqual([...TIPOS_MOVIMIENTO_INSUMO]);
    }
  });

  it('no mezcla los movimientos de dos insumos', async () => {
    await sembrar(insumoA, [
      { tipo: 'ENTRADA', cantidad: 10 },
      { tipo: 'SALIDA', cantidad: 3 },
      { tipo: 'ENTRADA', cantidad: 2, condicion: 'USADO' },
    ]);
    await sembrar(insumoB, [{ tipo: 'AJUSTE_NEGATIVO', cantidad: 7 }]);

    const mapa = await repo.sumByTipoDeInsumos([insumoA, insumoB, insumoSinMovimientos]);

    expect(mapa.size).toBe(3);
    expect(mapa.get(insumoA)).toEqual(
      sumasCon({ NUEVO: { ENTRADA: 10, SALIDA: 3 }, USADO: { ENTRADA: 2 } }),
    );
    expect(mapa.get(insumoB)).toEqual(sumasCon({ NUEVO: { AJUSTE_NEGATIVO: 7 } }));
    expect(mapa.get(insumoSinMovimientos)).toEqual(sumasEnCero());
  });

  it('con lista vacía devuelve un mapa vacío sin ir a la base', async () => {
    const groupBy = vi.fn();
    const clienteEspia = { movimientoInsumo: { groupBy } };
    const repoEspia = new PrismaMovimientoInsumoRepository({
      getClient: () => clienteEspia,
    } as unknown as TenantContext);

    const mapa = await repoEspia.sumByTipoDeInsumos([]);

    expect(mapa.size).toBe(0);
    expect(groupBy).not.toHaveBeenCalled();
  });

  it('resuelve con UNA sola consulta agregada para N insumos', async () => {
    const groupBy = vi.fn().mockResolvedValue([]);
    const repoEspia = new PrismaMovimientoInsumoRepository({
      getClient: () => ({ movimientoInsumo: { groupBy } }),
    } as unknown as TenantContext);

    await repoEspia.sumByTipoDeInsumos([insumoA, insumoB, insumoSinMovimientos]);

    expect(groupBy).toHaveBeenCalledTimes(1);
  });

  it('coincide, insumo por insumo, con sumByTipo()', async () => {
    await sembrar(insumoA, [
      { tipo: 'ENTRADA', cantidad: 5.5 },
      { tipo: 'AJUSTE_POSITIVO', cantidad: 1.25, condicion: 'USADO' },
      { tipo: 'SALIDA', cantidad: 2, condicion: 'USADO' },
    ]);
    await sembrar(insumoB, [{ tipo: 'ENTRADA', cantidad: 4 }]);

    const ids = [insumoA, insumoB, insumoSinMovimientos];
    const lote = await repo.sumByTipoDeInsumos(ids);
    for (const id of ids) {
      const individual = await repo.sumByTipo(id);
      expect(lote.get(id)).toEqual(individual);
    }
  });
});
