/**
 * [INTEGRATION] El reporte de stock da, para cada insumo, el mismo saldo y el
 * mismo estado de reposicion que la ficha (`ConsultarStockInsumoUseCase`),
 * contra Postgres REAL (`soporte_tenant_test`) y los repositorios Prisma.
 *
 * Es el spec que impide que el reporte derive de la ficha: dos caminos de
 * lectura, una sola respuesta. Incluye un `SERIE` cuyo libro difiere de sus
 * unidades (la fila sigue a las unidades, como la ficha).
 *
 * Fixtures prefijados por corrida sobre la base compartida; la limpieza va
 * acotada por ese prefijo (filas, y recien despues la desconexion). No toca
 * `soporte_master_test`, asi que no necesita `usarLockMasterTest()`.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaFamiliaInsumoRepository } from '../../infrastructure/persistence/prisma/prisma-familia-insumo.repository';
import { PrismaInsumoRepository } from '../../infrastructure/persistence/prisma/prisma-insumo.repository';
import { PrismaMovimientoInsumoRepository } from '../../infrastructure/persistence/prisma/prisma-movimiento-insumo.repository';
import { PrismaUnidadInsumoRepository } from '../../infrastructure/persistence/prisma/prisma-unidad-insumo.repository';
import { ConsultarReporteStockUseCase } from './consultar-reporte-stock.use-case';
import { ConsultarStockInsumoUseCase } from './consultar-stock-insumo.use-case';
import { CondicionStock, TipoMovimientoInsumo } from '../../domain/entities/tipo-movimiento-insumo';
import { EstadoUnidadInsumo } from '../../domain/entities/unidad-insumo.entity';

const TENANT_TEST_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('Reporte de stock vs. ficha — Integration', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let reporte: ConsultarReporteStockUseCase;
  let ficha: ConsultarStockInsumoUseCase;

  const PREFIJO = `RPT_${randomBytes(2).toString('hex')}_`;
  const usuarioId = randomUUID();
  let familiaActivaId: string;
  let familiaDeshabilitadaId: string;
  let unidadId: string;
  let equipoId: string;
  const ids: Record<string, string> = {};
  let serie = 0;

  async function crearInsumo(
    clave: string,
    datos: {
      stockMinimo?: number;
      seguimiento?: 'NINGUNO' | 'SERIE';
      activo?: boolean;
      familiaId?: string;
      deletedAt?: Date;
    } = {},
  ): Promise<void> {
    ids[clave] = (
      await tenantClient.insumo.create({
        data: {
          codigo: `${PREFIJO}${clave}`,
          nombre: `Insumo ${clave}`,
          familiaId: datos.familiaId ?? familiaActivaId,
          unidadMedidaId: unidadId,
          stockMinimo: datos.stockMinimo ?? null,
          seguimiento: datos.seguimiento ?? 'NINGUNO',
          activo: datos.activo ?? true,
          deletedAt: datos.deletedAt ?? null,
        },
      })
    ).id;
  }

  async function asentar(
    clave: string,
    asientos: Array<{ tipo: TipoMovimientoInsumo; cantidad: number; condicion: CondicionStock }>,
  ): Promise<void> {
    await tenantClient.movimientoInsumo.createMany({
      data: asientos.map((a) => ({ insumoId: ids[clave], usuarioId, ...a })),
    });
  }

  async function unidades(
    clave: string,
    lista: Array<{ condicion: CondicionStock; estado: EstadoUnidadInsumo; pendiente?: boolean }>,
  ): Promise<void> {
    for (const u of lista) {
      serie += 1;
      const numeroSerie = u.pendiente === true ? null : `${PREFIJO}S${serie}`;
      await tenantClient.unidadInsumo.create({
        data: {
          insumoId: ids[clave],
          numeroSerie,
          numeroSerieNormalizado: numeroSerie?.toUpperCase() ?? null,
          condicion: u.condicion,
          estado: u.estado,
          equipoId: u.estado === 'INSTALADA' ? equipoId : null,
        },
      });
    }
  }

  const todosLosIds = (): string[] => Object.values(ids);

  beforeAll(async () => {
    prismaService = new PrismaService(TENANT_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();
    tenantContext.bind({
      prismaClient: tenantClient,
      dbName: TENANT_TEST_DB_NAME,
      clienteId: 'test-cliente-rpt',
    });
    const insumoRepo = new PrismaInsumoRepository(tenantContext);
    const movimientoRepo = new PrismaMovimientoInsumoRepository(tenantContext);
    const unidadRepo = new PrismaUnidadInsumoRepository(tenantContext);
    const familiaRepo = new PrismaFamiliaInsumoRepository(tenantContext);
    reporte = new ConsultarReporteStockUseCase(
      insumoRepo,
      movimientoRepo,
      unidadRepo,
      () => new Date(),
    );
    ficha = new ConsultarStockInsumoUseCase(insumoRepo, movimientoRepo, familiaRepo, unidadRepo);

    familiaActivaId = (
      await tenantClient.familiaInsumo.create({
        data: { codigo: `${PREFIJO}FA`, nombre: 'Familia activa' },
      })
    ).id;
    familiaDeshabilitadaId = (
      await tenantClient.familiaInsumo.create({
        data: { codigo: `${PREFIJO}FD`, nombre: 'Familia deshabilitada', activo: false },
      })
    ).id;
    unidadId = (
      await tenantClient.unidadMedida.create({
        data: { codigo: `${PREFIJO}U`, nombre: 'Unidad de prueba', entera: false },
      })
    ).id;
    // Una unidad `INSTALADA` exige un equipo (CHECK + FK).
    equipoId = (
      await tenantClient.equipoInformatico.create({ data: { nombre: `${PREFIJO}equipo` } })
    ).id;

    // NINGUNO con ambas condiciones y una cantidad fraccionaria.
    await crearInsumo('N1', { stockMinimo: 8 });
    await asentar('N1', [
      { tipo: 'ENTRADA', cantidad: 10.5, condicion: 'NUEVO' },
      { tipo: 'SALIDA', cantidad: 4, condicion: 'NUEVO' },
      { tipo: 'ENTRADA', cantidad: 3, condicion: 'USADO' },
    ]);
    // NINGUNO con saldo negativo.
    await crearInsumo('N2', { stockMinimo: 1 });
    await asentar('N2', [{ tipo: 'SALIDA', cantidad: 5, condicion: 'NUEVO' }]);
    // NINGUNO sin movimientos ni punto de reposicion.
    await crearInsumo('N3');
    // SERIE con unidades en los cuatro estados, ambas condiciones y una pendiente.
    await crearInsumo('S1', { seguimiento: 'SERIE', stockMinimo: 3 });
    await unidades('S1', [
      { condicion: 'NUEVO', estado: 'EN_DEPOSITO' },
      { condicion: 'NUEVO', estado: 'EN_DEPOSITO', pendiente: true },
      { condicion: 'USADO', estado: 'EN_DEPOSITO' },
      { condicion: 'NUEVO', estado: 'INSTALADA' },
      { condicion: 'USADO', estado: 'ENTREGADA' },
      { condicion: 'USADO', estado: 'DESCARTADA' },
    ]);
    // SERIE cuyo libro difiere de sus unidades: el movimiento va directo.
    await crearInsumo('S2', { seguimiento: 'SERIE', stockMinimo: 5 });
    await unidades('S2', [{ condicion: 'NUEVO', estado: 'EN_DEPOSITO' }]);
    await asentar('S2', [{ tipo: 'ENTRADA', cantidad: 50, condicion: 'NUEVO' }]);
    // Deshabilitado y de familia deshabilitada: presentes.
    await crearInsumo('D1', { activo: false, stockMinimo: 10 });
    await asentar('D1', [{ tipo: 'ENTRADA', cantidad: 4, condicion: 'NUEVO' }]);
    await crearInsumo('FD', { familiaId: familiaDeshabilitadaId, stockMinimo: 2 });
    await asentar('FD', [{ tipo: 'ENTRADA', cantidad: 7, condicion: 'NUEVO' }]);
    // Baja logica: ausente del reporte y no encontrado en la ficha.
    await crearInsumo('BAJA', { deletedAt: new Date('2026-01-01T00:00:00Z') });
    await asentar('BAJA', [{ tipo: 'ENTRADA', cantidad: 9, condicion: 'NUEVO' }]);
  }, 30_000);

  afterAll(async () => {
    // Orden de higiene: filas -> desconexion (el DROP no aplica: base compartida).
    await tenantClient.movimientoInsumo.deleteMany({ where: { insumoId: { in: todosLosIds() } } });
    await tenantClient.unidadInsumo.deleteMany({ where: { insumoId: { in: todosLosIds() } } });
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.equipoInformatico.deleteMany({ where: { nombre: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.$disconnect();
    await prismaService.onModuleDestroy();
  }, 30_000);

  async function filasPropias() {
    const { filas } = await reporte.execute();
    return filas.filter((f) => f.codigo.startsWith(PREFIJO));
  }

  it('cada fila del reporte coincide con la ficha en saldos y estado de reposicion', async () => {
    const filas = await filasPropias();

    expect(filas.map((f) => f.codigo.slice(PREFIJO.length)).sort()).toEqual(
      ['D1', 'FD', 'N1', 'N2', 'N3', 'S1', 'S2'].sort(),
    );
    for (const f of filas) {
      const stock = (await ficha.execute(f.insumoId)).getValue();
      expect({ clave: f.codigo, saldos: f.saldos, estado: f.estadoReposicion }).toEqual({
        clave: f.codigo,
        saldos: { NUEVO: stock.saldos.NUEVO, USADO: stock.saldos.USADO, total: stock.stock },
        estado: stock.estadoReposicion,
      });
    }
  });

  it('NINGUNO: valores esperados (condiciones, negativo y sin movimientos)', async () => {
    const porClave = new Map(
      (await filasPropias()).map((f) => [f.codigo.slice(PREFIJO.length), f]),
    );

    expect(porClave.get('N1')?.saldos).toEqual({ NUEVO: 6.5, USADO: 3, total: 9.5 });
    expect(porClave.get('N1')?.estadoReposicion).toBe('BAJO_MINIMO');
    expect(porClave.get('N2')?.saldos).toEqual({ NUEVO: -5, USADO: 0, total: -5 });
    expect(porClave.get('N3')?.saldos).toEqual({ NUEVO: 0, USADO: 0, total: 0 });
    expect(porClave.get('N3')?.estadoReposicion).toBe('SIN_PUNTO_DEFINIDO');
  });

  it('SERIE: cuenta solo EN_DEPOSITO, con la pendiente de serie incluida', async () => {
    const porClave = new Map(
      (await filasPropias()).map((f) => [f.codigo.slice(PREFIJO.length), f]),
    );

    expect(porClave.get('S1')?.saldos).toEqual({ NUEVO: 2, USADO: 1, total: 3 });
  });

  it('SERIE con el libro desfasado: la fila sigue a las unidades, igual que la ficha', async () => {
    const porClave = new Map(
      (await filasPropias()).map((f) => [f.codigo.slice(PREFIJO.length), f]),
    );
    const fila = porClave.get('S2');

    expect(fila?.saldos).toEqual({ NUEVO: 1, USADO: 0, total: 1 });
    expect(fila?.estadoReposicion).toBe('BAJO_MINIMO');
    const stock = (await ficha.execute(ids.S2)).getValue();
    expect(stock.saldos.NUEVO).toBe(1);
  });

  it('el deshabilitado y el de familia deshabilitada estan presentes con su estado', async () => {
    const porClave = new Map(
      (await filasPropias()).map((f) => [f.codigo.slice(PREFIJO.length), f]),
    );

    expect(porClave.get('D1')).toMatchObject({ activo: false, estadoReposicion: 'BAJO_MINIMO' });
    expect(porClave.get('FD')).toMatchObject({
      saldos: { NUEVO: 7, USADO: 0, total: 7 },
      estadoReposicion: 'SUFICIENTE',
    });
  });

  it('la baja logica no esta en el reporte y la ficha responde no encontrado', async () => {
    const filas = await filasPropias();

    expect(filas.some((f) => f.insumoId === ids.BAJA)).toBe(false);
    expect((await ficha.execute(ids.BAJA)).isFail()).toBe(true);
  });
});
