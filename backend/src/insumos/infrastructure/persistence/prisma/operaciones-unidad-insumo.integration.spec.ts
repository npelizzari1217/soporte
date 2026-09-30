/**
 * [INTEGRATION] `OperacionesUnidadInsumo` (ADR-4 y ADR-12 de
 * sdd/repuestos-numero-de-serie) con los repositorios Prisma reales contra
 * `soporte_tenant_test`: lote atómico, reversión ante P2002 y concurrencia.
 *
 * La concurrencia es genuina: pool propio e instrumentado, con el máximo
 * observado reiniciado justo antes del bloque concurrente, y afirmado > 1 ANTES
 * de cualquier assert de negocio (ver `prisma-unidad-insumo.repository.integration.spec.ts`).
 *
 * Fixtures con prefijo por corrida. No toca `soporte_master_test`, así que no
 * necesita `usarLockMasterTest()`.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
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
import {
  SerialDuplicadoError,
  UnidadNoDisponibleError,
} from '../../../domain/errors/unidades-insumo.errors';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

const CONCURRENCIA = 6;
const POOL_MAX = CONCURRENCIA + 5;

/** Mide conexiones CHECKED-OUT simultáneas; ver el molde en el spec del repositorio de unidades. */
function instrumentarConcurrenciaDelPool(pool: Pool): { max: () => number; reiniciar: () => void } {
  let activas = 0;
  let maxObservado = 0;
  const connectOriginal = pool.connect.bind(pool);
  type Cb = (err: Error | undefined, client: PoolClient, release: (r?: unknown) => void) => void;
  const connectInstrumentado = (callback?: Cb): Promise<PoolClient> | void => {
    if (callback) return (connectOriginal as unknown as (cb: Cb) => void)(callback);
    return (connectOriginal as () => Promise<PoolClient>)().then((client) => {
      activas += 1;
      maxObservado = Math.max(maxObservado, activas);
      const releaseOriginal = client.release.bind(client);
      client.release = ((err?: Error | boolean) => {
        activas -= 1;
        return releaseOriginal(err);
      }) as typeof client.release;
      return client;
    });
  };
  pool.connect = connectInstrumentado as unknown as typeof pool.connect;
  return {
    max: () => maxObservado,
    reiniciar: () => {
      maxObservado = activas;
    },
  };
}

describe('OperacionesUnidadInsumo — Integration', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let txRunner: PrismaTenantTransactionRunner;
  let servicio: OperacionesUnidadInsumo;
  let medidorDelPool: ReturnType<typeof instrumentarConcurrenciaDelPool>;

  const PREFIJO = `OPU_${randomBytes(2).toString('hex')}_`;
  const usuarioId = randomUUID();
  let insumoId: string;

  beforeAll(async () => {
    prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    const tenantUrl = prismaServiceParaUrl.buildTenantUrl(TENANT_TEST_DB_NAME);
    pool = new Pool({ connectionString: tenantUrl, max: POOL_MAX });
    medidorDelPool = instrumentarConcurrenciaDelPool(pool);
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

  it('un lote con una unidad inválida se devuelve como Result.fail y, aun con commit, no escribe la válida', async () => {
    const alta = await conTenant(() =>
      txRunner.run(() =>
        servicio.ingresar(insumoId, [{ numeroSerie: 'V-1' }, { numeroSerie: 'V-2' }], {
          usuarioId,
          condicion: 'NUEVO',
          tipo: 'ENTRADA',
        }),
      ),
    );
    const [valida, yaEntregada] = alta.getValue().map((x) => x.unidad.id);
    await conTenant(() =>
      txRunner.run(() =>
        servicio.sacarDelDeposito(insumoId, [yaEntregada], { usuarioId, tipo: 'SALIDA' }),
      ),
    );
    const antes = await contar();

    // El llamador NO lanza: la transacción se confirma con lo que el servicio haya escrito.
    const r = await conTenant(() =>
      txRunner.run(() =>
        servicio.sacarDelDeposito(insumoId, [valida, yaEntregada], { usuarioId, tipo: 'SALIDA' }),
      ),
    );

    expect(r.getError()).toBeInstanceOf(UnidadNoDisponibleError);
    expect(await contar()).toEqual(antes);
    const fila = await tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id: valida } });
    expect(fila.estado).toBe('EN_DEPOSITO');
  });

  it(`${CONCURRENCIA} sacarDelDeposito simultáneos sobre la MISMA unidad: una sola entrega y las demás la ven entregada`, async () => {
    const alta = await conTenant(() =>
      txRunner.run(() =>
        servicio.ingresar(insumoId, [{ numeroSerie: 'RACE' }], {
          usuarioId,
          condicion: 'NUEVO',
          tipo: 'ENTRADA',
        }),
      ),
    );
    const unidadId = alta.getValue()[0].unidad.id;

    medidorDelPool.reiniciar();
    const resultados = await conTenant(() =>
      Promise.all(
        Array.from({ length: CONCURRENCIA }, () =>
          txRunner.run(() =>
            servicio.sacarDelDeposito(insumoId, [unidadId], { usuarioId, tipo: 'SALIDA' }),
          ),
        ),
      ),
    );

    expect(medidorDelPool.max()).toBeGreaterThan(1);
    expect(resultados.filter((r) => r.isOk())).toHaveLength(1);
    const fallidos = resultados.filter((r) => r.isFail());
    expect(fallidos).toHaveLength(CONCURRENCIA - 1);
    expect(fallidos.every((r) => r.getError() instanceof UnidadNoDisponibleError)).toBe(true);
    const { movimientos, eventos } = await contar();
    expect(movimientos).toBe(2); // la entrada y una sola salida
    expect(eventos).toBe(2); // INGRESO y una sola ENTREGA
  }, 30_000);
  /** Da de alta piezas y las entrega; devuelve los ids, para las pruebas de devolución. */
  async function altaYEntrega(seriales: string[]): Promise<string[]> {
    const alta = await conTenant(() =>
      txRunner.run(() =>
        servicio.ingresar(
          insumoId,
          seriales.map((numeroSerie) => ({ numeroSerie })),
          { usuarioId, condicion: 'NUEVO', tipo: 'ENTRADA' },
        ),
      ),
    );
    const ids = alta.getValue().map((x) => x.unidad.id);
    await conTenant(() =>
      txRunner.run(() => servicio.sacarDelDeposito(insumoId, ids, { usuarioId, tipo: 'SALIDA' })),
    );
    return ids;
  }

  it('devolverEntregas de un lote de 2 deja EN_DEPOSITO en la condición elegida, con ENTRADA y evento', async () => {
    const ids = await altaYEntrega(['D-1', 'D-2']);
    const antes = await contar();

    const r = await conTenant(() =>
      txRunner.run(() =>
        servicio.devolverEntregas(insumoId, ids, { usuarioId, condicion: 'USADO' }),
      ),
    );

    expect(r.getValue()).toHaveLength(2);
    const filas = await tenantClient.unidadInsumo.findMany({ where: { id: { in: ids } } });
    expect(filas.map((f) => [f.estado, f.condicion, f.numeroSerie].join('|')).sort()).toEqual([
      'EN_DEPOSITO|USADO|D-1',
      'EN_DEPOSITO|USADO|D-2',
    ]);
    expect(await contar()).toEqual({
      unidades: antes.unidades,
      movimientos: antes.movimientos + 2,
      eventos: antes.eventos + 2,
    });
    const evento = await tenantClient.eventoUnidadInsumo.findFirstOrThrow({
      where: { unidadId: ids[0], tipo: 'DEVOLUCION_DE_ENTREGA' },
    });
    expect(evento.movimientoId).toBe(r.getValue()[0].movimiento.id);
  });

  it('una devolución con una unidad no entregada se devuelve como Result.fail y, aun con commit, no escribe la entregada', async () => {
    const [entregada] = await altaYEntrega(['E-1']);
    const alta = await conTenant(() =>
      txRunner.run(() =>
        servicio.ingresar(insumoId, [{ numeroSerie: 'E-2' }], {
          usuarioId,
          condicion: 'NUEVO',
          tipo: 'ENTRADA',
        }),
      ),
    );
    const enDeposito = alta.getValue()[0].unidad.id;
    const antes = await contar();

    const r = await conTenant(() =>
      txRunner.run(() =>
        servicio.devolverEntregas(insumoId, [entregada, enDeposito], {
          usuarioId,
          condicion: 'NUEVO',
        }),
      ),
    );

    expect(r.getError()).toBeInstanceOf(UnidadNoDisponibleError);
    expect(await contar()).toEqual(antes);
    const fila = await tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id: entregada } });
    expect(fila.estado).toBe('ENTREGADA');
  });
});
