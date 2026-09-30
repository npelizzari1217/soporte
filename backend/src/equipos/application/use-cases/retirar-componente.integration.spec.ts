/**
 * [INTEGRATION] `RetirarComponenteUseCase` contra Postgres real
 * (sdd/stock-usado-componentes, WU-7, ADR-4).
 *
 * Cubre lo que un mock no puede: que la ENTRADA y la marca de retiro sean
 * atomicas (si una falla, no queda la otra) y que dos retiros concurrentes del
 * MISMO componente dejen UNA sola ENTRADA. La exclusion mutua sale del
 * `UPDATE ... WHERE deleted_at IS NULL`: el segundo espera el lock de fila,
 * reevalua, toca 0 filas y su ENTRADA se revierte.
 *
 * Como en el spec de concurrencia de la instalacion, el pool es propio e
 * instrumentado: se prueba PRIMERO que hubo conexiones simultaneas, porque un
 * pool que encola serializa por su cuenta y el resultado saldria verde aunque
 * la marca no fuera condicional.
 *
 * Wiring manual sin Nest DI, con repos reales sobre el mismo `TenantContext`.
 */
import { randomBytes } from 'node:crypto';
import { vi } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';

import { PrismaEquipoInformaticoRepository } from '../../infrastructure/persistence/prisma/prisma-equipo-informatico.repository';
import { PrismaComponenteEquipoRepository } from '../../infrastructure/persistence/prisma/prisma-componente-equipo.repository';
import { PrismaInsumoRepository } from '../../../insumos/infrastructure/persistence/prisma/prisma-insumo.repository';
import { PrismaFamiliaInsumoRepository } from '../../../insumos/infrastructure/persistence/prisma/prisma-familia-insumo.repository';
import { PrismaMovimientoInsumoRepository } from '../../../insumos/infrastructure/persistence/prisma/prisma-movimiento-insumo.repository';

import { InstalarComponenteDesdeDepositoUseCase } from './instalar-componente-desde-deposito.use-case';
import { AgregarComponenteUseCase } from './agregar-componente.use-case';
import { RegistrarSalidaInsumoUseCase } from '../../../insumos/application/use-cases/registrar-salida-insumo.use-case';
import { RegistrarEntradaInsumoUseCase } from '../../../insumos/application/use-cases/registrar-entrada-insumo.use-case';
import { RetirarComponenteUseCase } from './retirar-componente.use-case';
import { ComponenteDadoDeBajaError } from '../../domain/errors/equipos.errors';
import { CondicionUsadoNoAdmitidaError } from '../../../insumos/domain/errors/insumos.errors';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

/** Retiros simultaneos del MISMO componente. */
const CONCURRENCIA = 8;
const POOL_MAX = CONCURRENCIA + 5;
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000301';

/** Ver JSDoc de cabecera y el spec de referencia — instrumenta `pool.connect()` (variante Promise, la de `$transaction`). */
function instrumentarConcurrenciaDelPool(pool: Pool): {
  maximo: () => number;
  reiniciar: () => void;
} {
  let conexionesActivas = 0;
  let maxObservado = 0;
  const connectOriginal = pool.connect.bind(pool);

  type ConnectCallback = (
    err: Error | undefined,
    client: PoolClient,
    release: (release?: unknown) => void,
  ) => void;

  const connectInstrumentado = (callback?: ConnectCallback): Promise<PoolClient> | void => {
    if (callback) {
      return (connectOriginal as unknown as (cb: ConnectCallback) => void)(callback);
    }
    return (connectOriginal as () => Promise<PoolClient>)().then((client) => {
      conexionesActivas += 1;
      maxObservado = Math.max(maxObservado, conexionesActivas);
      const releaseOriginal = client.release.bind(client);
      client.release = ((err?: Error | boolean) => {
        conexionesActivas -= 1;
        return releaseOriginal(err);
      }) as typeof client.release;
      return client;
    });
  };

  pool.connect = connectInstrumentado as unknown as typeof pool.connect;
  return {
    maximo: () => maxObservado,
    // El maximo es de toda la suite: se reinicia justo antes del bloque concurrente
    // para que la prueba no dependa de lo que ejecutaron los casos anteriores.
    reiniciar: () => {
      maxObservado = conexionesActivas;
    },
  };
}

describe('RetirarComponenteUseCase - base real (WU-7, ADR-4)', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let pruebaConcurrencia: ReturnType<typeof instrumentarConcurrenciaDelPool>;

  let equipoRepo: PrismaEquipoInformaticoRepository;
  let componenteRepo: PrismaComponenteEquipoRepository;
  let insumoRepo: PrismaInsumoRepository;
  let familiaInsumoRepo: PrismaFamiliaInsumoRepository;
  let movimientoRepo: PrismaMovimientoInsumoRepository;

  const PREFIJO = `RETC_${randomBytes(2).toString('hex')}_`;

  let unidadMedidaId: string;
  let insumoId: string;
  let insumoNoRepuestoId: string;
  let equipoId: string;

  beforeAll(async () => {
    prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    const tenantUrl = prismaServiceParaUrl.buildTenantUrl(TENANT_TEST_DB_NAME);

    pool = new Pool({ connectionString: tenantUrl, max: POOL_MAX });
    pruebaConcurrencia = instrumentarConcurrenciaDelPool(pool);
    tenantClient = new TenantPrismaClient({ adapter: new PrismaPg(pool) });

    tenantContext = new TenantContext();
    equipoRepo = new PrismaEquipoInformaticoRepository(tenantContext);
    componenteRepo = new PrismaComponenteEquipoRepository(tenantContext);
    insumoRepo = new PrismaInsumoRepository(tenantContext);
    familiaInsumoRepo = new PrismaFamiliaInsumoRepository(tenantContext);
    movimientoRepo = new PrismaMovimientoInsumoRepository(tenantContext);

    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}F`, nombre: 'Familia repuesto retiro', esRepuesto: true },
    });
    const familiaNoRepuesto = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}N`, nombre: 'Familia no repuesto retiro', esRepuesto: false },
    });
    const unidad = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}U`, nombre: 'Unidad retiro' },
    });
    unidadMedidaId = unidad.id;
    insumoId = (
      await tenantClient.insumo.create({
        data: {
          codigo: `${PREFIJO}I`,
          nombre: 'Repuesto bajo prueba de retiro',
          familiaId: familia.id,
          unidadMedidaId,
        },
      })
    ).id;
    insumoNoRepuestoId = (
      await tenantClient.insumo.create({
        data: {
          codigo: `${PREFIJO}X`,
          nombre: 'Insumo no repuesto de retiro',
          familiaId: familiaNoRepuesto.id,
          unidadMedidaId,
        },
      })
    ).id;
    equipoId = (await tenantClient.equipoInformatico.create({ data: { nombre: 'Equipo retiro' } }))
      .id;
  }, 30_000);

  afterAll(async () => {
    // Orden por FK: componentes (apuntan a movimientos) -> movimientos -> equipo -> catalogo.
    await limpiar();
    await tenantClient.equipoInformatico.deleteMany({ where: { id: equipoId } });
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.$disconnect();
    await pool.end().catch(() => undefined);
    await prismaServiceParaUrl.onModuleDestroy();
  }, 30_000);

  beforeEach(limpiar);

  async function limpiar() {
    await tenantClient.componenteEquipo.deleteMany({ where: { equipoId } });
    await tenantClient.movimientoInsumo.deleteMany({
      where: { insumoId: { in: [insumoId, insumoNoRepuestoId] } },
    });
  }

  function conTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-retc' },
      fn,
    );
  }

  function makeTxRunner() {
    return new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });
  }

  function makeRetirar(
    repo: Pick<PrismaComponenteEquipoRepository, 'findById' | 'retirar'> = componenteRepo,
  ) {
    return new RetirarComponenteUseCase(
      makeTxRunner(),
      repo,
      new RegistrarEntradaInsumoUseCase(insumoRepo, movimientoRepo, familiaInsumoRepo),
    );
  }

  async function sembrarComponente(
    insumo: string = insumoId,
    instalacionMovimientoId: string | null = null,
  ): Promise<string> {
    const c = await tenantClient.componenteEquipo.create({
      data: { equipoId, insumoId: insumo, instalacionMovimientoId },
    });
    return c.id;
  }

  /** Saldo por condicion, sumado directo de la tabla (verificacion independiente del codigo bajo prueba). */
  async function saldo(condicion: 'NUEVO' | 'USADO'): Promise<number> {
    const filas = await tenantClient.movimientoInsumo.findMany({ where: { insumoId, condicion } });
    return filas.reduce(
      (acc, m) => acc + (m.tipo === 'SALIDA' ? -Number(m.cantidad) : Number(m.cantidad)),
      0,
    );
  }

  it('STOCK_USADO: deja una ENTRADA USADO con equipoId, saldo USADO 1 sin tocar NUEVO, y baja_movimiento_id apunta a ella', async () => {
    await tenantClient.movimientoInsumo.create({
      data: {
        insumoId,
        tipo: 'ENTRADA',
        condicion: 'NUEVO',
        cantidad: 3,
        usuarioId: DUMMY_USUARIO_ID,
      },
    });
    const componenteId = await sembrarComponente();

    const result = await conTenant(() =>
      makeRetirar().execute({
        equipoId,
        componenteId,
        destino: 'STOCK_USADO',
        motivo: 'recambio',
        usuarioId: DUMMY_USUARIO_ID,
      }),
    );
    expect(result.isOk()).toBe(true);

    const entradas = await tenantClient.movimientoInsumo.findMany({
      where: { insumoId, tipo: 'ENTRADA', condicion: 'USADO' },
    });
    expect(entradas).toHaveLength(1);
    expect(entradas[0].equipoId).toBe(equipoId);
    expect(entradas[0].motivo).toBe('recambio');
    expect(await saldo('USADO')).toBe(1);
    expect(await saldo('NUEVO')).toBe(3);

    const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
      where: { id: componenteId },
    });
    expect(fila.deletedAt).not.toBeNull();
    expect(fila.bajaDestino).toBe('STOCK_USADO');
    expect(fila.bajaMovimientoId).toBe(entradas[0].id);
    expect(fila.bajaUsuarioId).toBe(DUMMY_USUARIO_ID);
  });

  it('DESCARTE: no crea ningun movimiento y registra el destino y el motivo', async () => {
    const componenteId = await sembrarComponente();

    const result = await conTenant(() =>
      makeRetirar().execute({
        equipoId,
        componenteId,
        destino: 'DESCARTE',
        motivo: 'quemado',
        usuarioId: DUMMY_USUARIO_ID,
      }),
    );
    expect(result.isOk()).toBe(true);

    expect(await tenantClient.movimientoInsumo.count({ where: { insumoId } })).toBe(0);
    const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
      where: { id: componenteId },
    });
    expect(fila.bajaDestino).toBe('DESCARTE');
    expect(fila.bajaMotivo).toBe('quemado');
    expect(fila.bajaMovimientoId).toBeNull();
  });

  it('un componente instalado CON descuento informa bajaSinSalidaPrevia = false tras retirarse (deuda de WU-6)', async () => {
    await tenantClient.movimientoInsumo.create({
      data: {
        insumoId,
        tipo: 'ENTRADA',
        condicion: 'NUEVO',
        cantidad: 1,
        usuarioId: DUMMY_USUARIO_ID,
      },
    });
    const txRunner = makeTxRunner();
    const instalar = new InstalarComponenteDesdeDepositoUseCase(
      txRunner,
      new AgregarComponenteUseCase(equipoRepo, componenteRepo, insumoRepo, familiaInsumoRepo),
      new RegistrarSalidaInsumoUseCase(insumoRepo, movimientoRepo, txRunner, familiaInsumoRepo),
      componenteRepo,
    );

    const instalado = await conTenant(() =>
      instalar.execute({ equipoId, insumoId, usuarioId: DUMMY_USUARIO_ID }),
    );
    expect(instalado.isOk()).toBe(true);
    const componenteId = instalado.getValue().id;

    // Sin motivo: la SALIDA vinculada lo vuelve opcional.
    const retirado = await conTenant(() =>
      makeRetirar().execute({
        equipoId,
        componenteId,
        destino: 'STOCK_USADO',
        usuarioId: DUMMY_USUARIO_ID,
      }),
    );
    expect(retirado.isOk()).toBe(true);

    const leido = await conTenant(() => componenteRepo.findById(componenteId));
    expect(leido?.bajaDestino).toBe('STOCK_USADO');
    expect(leido?.bajaSinSalidaPrevia).toBe(false);
  });

  it('la ENTRADA falla (insumo de familia no repuesto): el componente queda activo y sin registro de retiro', async () => {
    const componenteId = await sembrarComponente(insumoNoRepuestoId);

    const result = await conTenant(() =>
      makeRetirar().execute({
        equipoId,
        componenteId,
        destino: 'STOCK_USADO',
        motivo: 'x',
        usuarioId: DUMMY_USUARIO_ID,
      }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CondicionUsadoNoAdmitidaError);
    const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
      where: { id: componenteId },
    });
    expect(fila.deletedAt).toBeNull();
    expect(fila.bajaDestino).toBeNull();
    expect(fila.bajaMovimientoId).toBeNull();
    expect(
      await tenantClient.movimientoInsumo.count({ where: { insumoId: insumoNoRepuestoId } }),
    ).toBe(0);
  });

  it('la marca toca 0 filas: la ENTRADA se revierte y no queda ningun movimiento', async () => {
    const componenteId = await sembrarComponente();
    // Repo que reproduce "otro retiro comiteo primero": la marca nunca toca la fila.
    const repoPerdedor = {
      findById: (id: string) => componenteRepo.findById(id),
      retirar: () => Promise.resolve(false),
    };

    const result = await conTenant(() =>
      makeRetirar(repoPerdedor).execute({
        equipoId,
        componenteId,
        destino: 'STOCK_USADO',
        motivo: 'x',
        usuarioId: DUMMY_USUARIO_ID,
      }),
    );

    expect(result.getError()).toBeInstanceOf(ComponenteDadoDeBajaError);
    expect(await tenantClient.movimientoInsumo.count({ where: { insumoId } })).toBe(0);
    const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
      where: { id: componenteId },
    });
    expect(fila.deletedAt).toBeNull();
  });

  it(`${CONCURRENCIA} retiros simultaneos del MISMO componente: UNA ENTRADA y el resto rechazado`, async () => {
    const componenteId = await sembrarComponente();

    // Determinismo: la exclusion mutua solo se ejercita si al menos dos retiros
    // llegan a la ENTRADA (y por ende a la marca condicional).
    const espiaDevolucion = vi.spyOn(
      RegistrarEntradaInsumoUseCase.prototype,
      'registrarDevolucionDeComponente',
    );
    pruebaConcurrencia.reiniciar();
    const resultados = await conTenant(() =>
      Promise.all(
        Array.from({ length: CONCURRENCIA }, () =>
          makeRetirar().execute({
            equipoId,
            componenteId,
            destino: 'STOCK_USADO',
            motivo: 'carrera',
            usuarioId: DUMMY_USUARIO_ID,
          }),
        ),
      ),
    );

    const llamadasADevolucion = espiaDevolucion.mock.calls.length;
    espiaDevolucion.mockRestore();
    const maxConcurrente = pruebaConcurrencia.maximo();
    console.info(
      `[concurrencia] retirar-componente - maximo de conexiones simultaneas: ${maxConcurrente} (pool max=${POOL_MAX}).`,
    );
    // Prueba de CONCURRENCIA REAL antes que el resultado de negocio.
    expect(maxConcurrente).toBeGreaterThan(1);
    expect(llamadasADevolucion).toBeGreaterThanOrEqual(2);

    expect(resultados.filter((r) => r.isOk())).toHaveLength(1);
    const fallidos = resultados.filter((r) => r.isFail());
    expect(fallidos).toHaveLength(CONCURRENCIA - 1);
    for (const fallido of fallidos) {
      expect(fallido.getError()).toBeInstanceOf(ComponenteDadoDeBajaError);
    }

    const entradas = await tenantClient.movimientoInsumo.findMany({ where: { insumoId } });
    expect(entradas).toHaveLength(1);
    expect(await saldo('USADO')).toBe(1);
    const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
      where: { id: componenteId },
    });
    expect(fila.bajaMovimientoId).toBe(entradas[0].id);
  }, 60_000);
});
