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
  MotivoCorreccionSerialInvalidoError,
  SerialDuplicadoError,
  UnidadNoDisponibleError,
} from '../../../domain/errors/unidades-insumo.errors';
import { leerYVerificarInvarianteSerie } from '../../../testing/invariante-serie';

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
  let equipoId: string;

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

    equipoId = (await tenantClient.equipoInformatico.create({ data: { nombre: `${PREFIJO}EQ0` } }))
      .id;
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
    await tenantClient.equipoInformatico.deleteMany({ where: { nombre: { startsWith: PREFIJO } } });
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

  const repos = () => ({
    unidadRepo: new PrismaUnidadInsumoRepository(tenantContext),
    movimientoRepo: new PrismaMovimientoInsumoRepository(tenantContext),
    eventoRepo: new PrismaEventoUnidadInsumoRepository(tenantContext),
  });

  it('devolverEntregas de un lote de 2 deja EN_DEPOSITO en la condición elegida, con ENTRADA y evento, y cumple el invariante', async () => {
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
    const violaciones = await conTenant(() => leerYVerificarInvarianteSerie(repos(), insumoId));
    expect(violaciones).toEqual([]);
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

  it('cargarSerial completa una pendiente con su evento y un serial repetido lanza FalloOperacionDeUnidad y revierte', async () => {
    const alta = await conTenant(() =>
      txRunner.run(() =>
        servicio.ingresar(insumoId, [{ numeroSerie: 'C-1' }, { numeroSerie: null }], {
          usuarioId,
          condicion: 'NUEVO',
          tipo: 'ENTRADA',
        }),
      ),
    );
    const pendiente = alta.getValue()[1].unidad.id;

    const repetido = await conTenant(() =>
      txRunner.run(() => servicio.cargarSerial(pendiente, ' c-1', { usuarioId })),
    ).catch((e: unknown) => e);
    expect(repetido).toBeInstanceOf(FalloOperacionDeUnidad);
    expect((repetido as FalloOperacionDeUnidad).errorDeDominio).toBeInstanceOf(
      SerialDuplicadoError,
    );
    const sinCambios = await tenantClient.unidadInsumo.findUniqueOrThrow({
      where: { id: pendiente },
    });
    expect(sinCambios.numeroSerie).toBeNull();
    expect(
      await tenantClient.eventoUnidadInsumo.count({
        where: { unidadId: pendiente, tipo: 'SERIAL_CARGADO' },
      }),
    ).toBe(0);

    const movimientosAntes = (await contar()).movimientos;
    const ok = await conTenant(() =>
      txRunner.run(() => servicio.cargarSerial(pendiente, 'C-2', { usuarioId })),
    );
    expect(ok.getValue().numeroSerieNormalizado).toBe('C-2');
    const fila = await tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id: pendiente } });
    expect(fila).toMatchObject({ numeroSerie: 'C-2', numeroSerieNormalizado: 'C-2' });
    const evento = await tenantClient.eventoUnidadInsumo.findFirstOrThrow({
      where: { unidadId: pendiente, tipo: 'SERIAL_CARGADO' },
    });
    expect(evento).toMatchObject({ movimientoId: null, motivo: null, serialNuevo: 'C-2' });
    expect((await contar()).movimientos).toBe(movimientosAntes);
  });

  it('corregirSerial audita anterior, nuevo, motivo y usuario; sin motivo y a un serial existente no escriben', async () => {
    const alta = await conTenant(() =>
      txRunner.run(() =>
        servicio.ingresar(insumoId, [{ numeroSerie: 'K-1' }, { numeroSerie: 'K-2' }], {
          usuarioId,
          condicion: 'NUEVO',
          tipo: 'ENTRADA',
        }),
      ),
    );
    const [primera] = alta.getValue().map((x) => x.unidad.id);

    const sinMotivo = await conTenant(() =>
      txRunner.run(() => servicio.corregirSerial(primera, 'K-9', { usuarioId })),
    );
    expect(sinMotivo.getError()).toBeInstanceOf(MotivoCorreccionSerialInvalidoError);
    const antes = await contar();
    expect(
      (await tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id: primera } })).numeroSerie,
    ).toBe('K-1');

    const aExistente = await conTenant(() =>
      txRunner.run(() => servicio.corregirSerial(primera, 'k-2', { usuarioId, motivo: 'typo' })),
    ).catch((e: unknown) => e);
    expect(aExistente).toBeInstanceOf(FalloOperacionDeUnidad);
    expect(await contar()).toEqual(antes);
    expect(
      (await tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id: primera } })).numeroSerie,
    ).toBe('K-1');

    const ok = await conTenant(() =>
      txRunner.run(() => servicio.corregirSerial(primera, 'K-3', { usuarioId, motivo: ' typo ' })),
    );
    expect(ok.isOk()).toBe(true);
    const evento = await tenantClient.eventoUnidadInsumo.findFirstOrThrow({
      where: { unidadId: primera, tipo: 'CORRECCION_SERIAL' },
    });
    expect(evento).toMatchObject({
      serialAnterior: 'K-1',
      serialNuevo: 'K-3',
      motivo: 'typo',
      usuarioId,
      movimientoId: null,
    });
    expect(
      (await tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id: primera } }))
        .numeroSerieNormalizado,
    ).toBe('K-3');
  });

  it('corregirSerial sobre una unidad INSTALADA se devuelve como Result.fail y, aun con commit, no escribe', async () => {
    const alta = await conTenant(() =>
      txRunner.run(() =>
        servicio.ingresar(insumoId, [{ numeroSerie: 'I-1' }], {
          usuarioId,
          condicion: 'NUEVO',
          tipo: 'ENTRADA',
        }),
      ),
    );
    const id = alta.getValue()[0].unidad.id;
    // La instalación llega con WU-5; acá se fija el estado directo para probar el rechazo.
    const equipo = await tenantClient.equipoInformatico.create({
      data: { nombre: `${PREFIJO}EQ` },
    });
    await tenantClient.unidadInsumo.update({
      where: { id },
      data: { estado: 'INSTALADA', equipoId: equipo.id },
    });
    const antes = await contar();

    const r = await conTenant(() =>
      txRunner.run(() => servicio.corregirSerial(id, 'I-9', { usuarioId, motivo: 'typo' })),
    );

    expect(r.getError()).toBeInstanceOf(UnidadNoDisponibleError);
    expect(await contar()).toEqual(antes);
  });

  describe('operaciones de equipo (WU-5)', () => {
    /** Da de alta piezas EN_DEPOSITO y devuelve sus ids. */
    async function alta(seriales: string[]): Promise<string[]> {
      const r = await conTenant(() =>
        txRunner.run(() =>
          servicio.ingresar(
            insumoId,
            seriales.map((numeroSerie) => ({ numeroSerie })),
            { usuarioId, condicion: 'NUEVO', tipo: 'ENTRADA' },
          ),
        ),
      );
      return r.getValue().map((x) => x.unidad.id);
    }

    const itemsDe = (ids: string[]) =>
      ids.map((unidadId) => ({ unidadId, equipoId, componenteId: randomUUID() }));

    const estadoDe = async (id: string) =>
      (await tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id } })).estado;

    it('instalar un lote de 2 en una transacción: INSTALADA, SALIDA y evento INSTALACION con el componente, y cumple el invariante', async () => {
      const ids = await alta(['IN-1', 'IN-2']);
      const items = itemsDe(ids);
      const antes = await contar();

      const r = await conTenant(() =>
        txRunner.run(() => servicio.instalar(items, { usuarioId, motivo: 'alta de equipo' })),
      );

      expect(r.getValue()).toHaveLength(2);
      const filas = await tenantClient.unidadInsumo.findMany({ where: { id: { in: ids } } });
      expect(filas.map((f) => [f.estado, f.equipoId])).toEqual([
        ['INSTALADA', equipoId],
        ['INSTALADA', equipoId],
      ]);
      expect(await contar()).toEqual({
        unidades: antes.unidades,
        movimientos: antes.movimientos + 2,
        eventos: antes.eventos + 2,
      });
      const evento = await tenantClient.eventoUnidadInsumo.findFirstOrThrow({
        where: { unidadId: items[0].unidadId, tipo: 'INSTALACION' },
      });
      expect(evento).toMatchObject({
        equipoId,
        componenteId: items[0].componenteId,
        movimientoId: r.getValue()[0].movimiento.id,
        motivo: 'alta de equipo',
      });
      expect(await conTenant(() => leerYVerificarInvarianteSerie(repos(), insumoId))).toEqual([]);
    });

    it('un lote con una serie pendiente se devuelve como Result.fail y, aun con commit, no instala la válida', async () => {
      const [valida] = await alta(['F-1']);
      const pendiente = (
        await conTenant(() =>
          txRunner.run(() =>
            servicio.ingresar(insumoId, [{ numeroSerie: null }], {
              usuarioId,
              condicion: 'NUEVO',
              tipo: 'ENTRADA',
            }),
          ),
        )
      ).getValue()[0].unidad.id;
      const antes = await contar();

      const r = await conTenant(() =>
        txRunner.run(() => servicio.instalar(itemsDe([valida, pendiente]), { usuarioId })),
      );

      expect(r.getError()).toBeInstanceOf(UnidadNoDisponibleError);
      expect(await contar()).toEqual(antes);
      expect(await estadoDe(valida)).toBe('EN_DEPOSITO');
    });

    it('dos clientes con lotes en orden opuesto sobre las mismas unidades: uno instala, el otro ve la unidad instalada, sin 40P01 ni bloqueo', async () => {
      const ids = await alta(['X-1', 'X-2', 'X-3']);
      const [a, b, c] = ids;

      medidorDelPool.reiniciar();
      const resultados = await conTenant(() =>
        Promise.all([
          txRunner.run(() => servicio.instalar(itemsDe([a, b, c]), { usuarioId })),
          txRunner.run(() => servicio.instalar(itemsDe([c, b, a]), { usuarioId })),
        ]),
      );

      expect(medidorDelPool.max()).toBeGreaterThan(1);
      expect(resultados.filter((r) => r.isOk())).toHaveLength(1);
      const fallido = resultados.find((r) => r.isFail());
      expect(fallido?.getError()).toBeInstanceOf(UnidadNoDisponibleError);
      expect(await Promise.all(ids.map(estadoDe))).toEqual(['INSTALADA', 'INSTALADA', 'INSTALADA']);
      expect((await contar()).movimientos).toBe(3 + 3); // tres entradas y tres salidas
    }, 30_000);
  });
});
