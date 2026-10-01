/**
 * [INTEGRATION] `InstalarComponenteDesdeDepositoUseCase` bajo concurrencia
 * REAL (WU-4, sdd/repuestos-instalar-desde-deposito, issue #153).
 *
 * "Dos instalaciones simultáneas del ÚLTIMO repuesto en stock: una gana, la
 * otra falla por stock insuficiente, y el stock nunca queda negativo" (issue
 * #153, criterio de aceptación de concurrencia).
 *
 * Mismo patrón y mismo motivo que
 * `prisma-movimiento-insumo.repository.concurrencia.integration.spec.ts`, de
 * donde sale el mecanismo entero: `PrismaService` abre el pool del tenant SIN
 * fijar `max` (default 10 de node-postgres) — si el pool ENCOLA en vez de dar
 * conexiones simultáneas, el encolamiento serializa las transacciones por su
 * cuenta y el resultado de negocio sale igual de verde con o sin el advisory
 * lock. Por eso este spec arma su PROPIO pool instrumentado (mismo criterio
 * que el spec de referencia) y prueba PRIMERO que hubo concurrencia real
 * antes de mirar el resultado de negocio.
 *
 * Wiring manual (sin Nest DI, mismo patrón que
 * `prisma-equipos.integration.spec.ts`): los cuatro repos reales
 * (`PrismaEquipoInformaticoRepository`, `PrismaComponenteEquipoRepository`,
 * `PrismaInsumoRepository`, `PrismaFamiliaInsumoRepository`,
 * `PrismaMovimientoInsumoRepository`) comparten el MISMO `TenantContext` y el
 * MISMO cliente instrumentado.
 */
import { randomBytes } from 'node:crypto';
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

import { AgregarComponenteUseCase } from './agregar-componente.use-case';
import { RegistrarSalidaInsumoUseCase } from '../../../insumos/application/use-cases/registrar-salida-insumo.use-case';
import { construirOperacionesReal } from '../../../insumos/testing/operaciones-unidad-real';
import { InstalarComponenteDesdeDepositoUseCase } from './instalar-componente-desde-deposito.use-case';
import { StockInsuficienteError } from '../../../insumos/domain/errors/insumos.errors';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

/** Instalaciones simultáneas del MISMO insumo, con stock para UNA sola. */
const CONCURRENCIA = 10;
const POOL_MAX = CONCURRENCIA + 5;
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000201';

/** Ver JSDoc de cabecera y el spec de referencia — instrumenta `pool.connect()` (variante Promise, la de `$transaction`). */
function instrumentarConcurrenciaDelPool(pool: Pool): () => number {
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
  return () => maxObservado;
}

describe('InstalarComponenteDesdeDepositoUseCase — Concurrencia real (WU-4, issue #153)', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let maxConcurrenteObservado: () => number;

  let equipoRepo: PrismaEquipoInformaticoRepository;
  let componenteRepo: PrismaComponenteEquipoRepository;
  let insumoRepo: PrismaInsumoRepository;
  let familiaInsumoRepo: PrismaFamiliaInsumoRepository;
  let movimientoRepo: PrismaMovimientoInsumoRepository;

  const PREFIJO = `INSTC_${randomBytes(2).toString('hex')}_`;

  let familiaId: string;
  let unidadMedidaId: string;
  let insumoId: string;
  /** Un equipo DISTINTO por escritor: el foco es el lock del INSUMO, no una colisión de equipo. */
  let equipoIds: string[];

  beforeAll(async () => {
    prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    const tenantUrl = prismaServiceParaUrl.buildTenantUrl(TENANT_TEST_DB_NAME);

    pool = new Pool({ connectionString: tenantUrl, max: POOL_MAX });
    maxConcurrenteObservado = instrumentarConcurrenciaDelPool(pool);
    tenantClient = new TenantPrismaClient({ adapter: new PrismaPg(pool) });

    tenantContext = new TenantContext();
    equipoRepo = new PrismaEquipoInformaticoRepository(tenantContext);
    componenteRepo = new PrismaComponenteEquipoRepository(tenantContext);
    insumoRepo = new PrismaInsumoRepository(tenantContext);
    familiaInsumoRepo = new PrismaFamiliaInsumoRepository(tenantContext);
    movimientoRepo = new PrismaMovimientoInsumoRepository(tenantContext);

    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}F`, nombre: 'Familia repuesto concurrencia', esRepuesto: true },
    });
    familiaId = familia.id;
    const unidad = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}U`, nombre: 'Unidad concurrencia' },
    });
    unidadMedidaId = unidad.id;
    const insumo = await tenantClient.insumo.create({
      data: {
        codigo: `${PREFIJO}I`,
        nombre: 'Repuesto bajo prueba de concurrencia',
        familiaId,
        unidadMedidaId,
      },
    });
    insumoId = insumo.id;

    equipoIds = [];
    for (let i = 0; i < CONCURRENCIA; i += 1) {
      const equipo = await tenantClient.equipoInformatico.create({
        data: { nombre: `Equipo concurrencia ${i}` },
      });
      equipoIds.push(equipo.id);
    }
  }, 30_000);

  afterAll(async () => {
    // Orden obligado por las FK: `movimientos_insumo.equipo_id` referencia
    // `equipos_informaticos.id` (misma base, a diferencia de `itemCompraId`) —
    // hay que borrar la bitácora ANTES de poder borrar los equipos.
    await tenantClient.componenteEquipo.deleteMany({ where: { equipoId: { in: equipoIds } } });
    await tenantClient.movimientoInsumo.deleteMany({ where: { insumoId } });
    await tenantClient.equipoInformatico.deleteMany({ where: { id: { in: equipoIds } } });
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.$disconnect();
    await pool.end().catch(() => undefined);
    await prismaServiceParaUrl.onModuleDestroy();
  }, 30_000);

  beforeEach(async () => {
    await tenantClient.componenteEquipo.deleteMany({ where: { equipoId: { in: equipoIds } } });
    await tenantClient.movimientoInsumo.deleteMany({ where: { insumoId } });
  });

  function conTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-instc' },
      fn,
    );
  }

  async function sembrarEntrada(cantidad: number, condicion: 'NUEVO' | 'USADO' = 'NUEVO') {
    await tenantClient.movimientoInsumo.create({
      data: { insumoId, tipo: 'ENTRADA', condicion, cantidad, usuarioId: DUMMY_USUARIO_ID },
    });
  }

  /** Una instancia NUEVA por escritor (mismo criterio que el spec de referencia: sin estado compartido entre corridas). */
  function makeUseCase(): InstalarComponenteDesdeDepositoUseCase {
    const txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });
    const agregarComponenteUseCase = new AgregarComponenteUseCase(
      equipoRepo,
      componenteRepo,
      insumoRepo,
      familiaInsumoRepo,
    );
    const operaciones = construirOperacionesReal({ tenantContext, insumoRepo, movimientoRepo });
    const registrarSalidaInsumoUseCase = new RegistrarSalidaInsumoUseCase(
      insumoRepo,
      movimientoRepo,
      txRunner,
      familiaInsumoRepo,
      operaciones,
    );
    return new InstalarComponenteDesdeDepositoUseCase(
      txRunner,
      agregarComponenteUseCase,
      registrarSalidaInsumoUseCase,
      operaciones,
      componenteRepo,
    );
  }

  it(
    `${CONCURRENCIA} instalaciones simultáneas del ÚLTIMO repuesto en stock (stock=1): ` +
      `UNA gana, las demás fallan con StockInsuficienteError, y el stock nunca queda negativo`,
    async () => {
      await sembrarEntrada(1);

      const resultados = await conTenant(() =>
        Promise.all(
          equipoIds.map((equipoId) =>
            makeUseCase().execute({
              equipoId,
              insumoId,
              usuarioId: DUMMY_USUARIO_ID,
            }),
          ),
        ),
      );

      const maxConcurrente = maxConcurrenteObservado();
      console.info(
        `[concurrencia] instalar-desde-deposito — máximo de conexiones simultáneas: ` +
          `${maxConcurrente} (pool max=${POOL_MAX}).`,
      );
      // Prueba de CONCURRENCIA REAL antes que nada — ver JSDoc de cabecera.
      expect(maxConcurrente).toBeGreaterThan(1);

      const exitosos = resultados.filter((r) => r.isOk());
      const fallidos = resultados.filter((r) => r.isFail());
      expect(exitosos).toHaveLength(1);
      expect(fallidos).toHaveLength(CONCURRENCIA - 1);
      for (const fallido of fallidos) {
        expect(fallido.getError()).toBeInstanceOf(StockInsuficienteError);
      }

      // El stock nunca queda negativo: exactamente 1 ENTRADA y 1 SALIDA, saldo 0.
      // Lectura DIRECTA contra la tabla (no vía el puerto): es la verificación
      // final, independiente de cualquier lectura que el propio código bajo
      // prueba haga.
      const movimientos = await tenantClient.movimientoInsumo.findMany({ where: { insumoId } });
      const salidas = movimientos.filter((m) => m.tipo === 'SALIDA');
      expect(salidas).toHaveLength(1);

      // Y EXACTAMENTE un componente se creó — nunca más de uno, aunque los
      // 10 escritores hayan intentado la validación/creación en paralelo.
      const componentesCreados = await tenantClient.componenteEquipo.findMany({
        where: { equipoId: { in: equipoIds } },
      });
      expect(componentesCreados).toHaveLength(1);
    },
    60_000,
  );

  it(
    `${CONCURRENCIA} instalaciones simultáneas USADO con saldo USADO 1 (y NUEVO 100): ` +
      `UNA gana y queda vinculada a su SALIDA USADO; las demás fallan`,
    async () => {
      await sembrarEntrada(100, 'NUEVO');
      await sembrarEntrada(1, 'USADO');

      const resultados = await conTenant(() =>
        Promise.all(
          equipoIds.map((equipoId) =>
            makeUseCase().execute({
              equipoId,
              insumoId,
              usuarioId: DUMMY_USUARIO_ID,
              condicion: 'USADO',
            }),
          ),
        ),
      );

      expect(maxConcurrenteObservado()).toBeGreaterThan(1);
      expect(resultados.filter((r) => r.isOk())).toHaveLength(1);
      const fallidos = resultados.filter((r) => r.isFail());
      expect(fallidos).toHaveLength(CONCURRENCIA - 1);
      for (const fallido of fallidos) {
        expect(fallido.getError()).toBeInstanceOf(StockInsuficienteError);
      }

      const salidas = await tenantClient.movimientoInsumo.findMany({
        where: { insumoId, tipo: 'SALIDA' },
      });
      expect(salidas).toHaveLength(1);
      expect(salidas[0].condicion).toBe('USADO');

      const componentes = await tenantClient.componenteEquipo.findMany({
        where: { equipoId: { in: equipoIds } },
      });
      expect(componentes).toHaveLength(1);
      expect(componentes[0].instalacionMovimientoId).toBe(salidas[0].id);
    },
    60_000,
  );
});
