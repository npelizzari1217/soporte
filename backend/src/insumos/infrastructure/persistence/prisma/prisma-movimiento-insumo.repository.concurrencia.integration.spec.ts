/**
 * [INTEGRATION] `PrismaMovimientoInsumoRepository.lockAndSumByTipo()` bajo
 * concurrencia REAL — y prueba de que la concurrencia fue GENUINA.
 *
 * Es LA sección crítica de la Entrega 2: todo el resto del módulo se apoya en
 * que dos salidas simultáneas del mismo insumo no puedan pasar las dos.
 *
 * ── EL PROBLEMA QUE HACE DECORATIVO A UN TEST DE CONCURRENCIA ────────────
 * `PrismaService` construye el pool de un tenant con `new Pool({
 * connectionString })`, SIN fijar `max`: el default de node-postgres son 10
 * conexiones. Si el pool ENCOLA en vez de dar N conexiones simultáneas, el
 * encolamiento serializa las N transacciones por su cuenta — y entonces el
 * resultado de negocio da verde tanto si el advisory lock funciona como si
 * nunca se ejercitó. Un test que pasa con y sin el mecanismo que dice probar
 * no prueba nada. Mismo hueco (H7) que atacó
 * `prisma-compra.repository.concurrencia.integration.spec.ts`, de donde sale
 * el patrón de este archivo.
 *
 * ── LO QUE HACE ESTE SPEC ───────────────────────────────────────────────
 * 1. Pool PROPIO con `max = CONCURRENCIA + 5` (el de `PrismaService` no
 *    permite configurar `max`), instrumentado para contar cuántas conexiones
 *    estuvieron CHECKED-OUT simultáneamente. Si el máximo fuera 1, las
 *    transacciones nunca estuvieron en vuelo a la vez y el resto del test no
 *    significa nada: por eso ese assert corre ANTES que los de negocio.
 * 2. Una sesión TESTIGO —un `pg.Pool` aparte, sin Prisma— que sondea el lock
 *    con `pg_try_advisory_xact_lock` desde AFUERA de la transacción. Es la
 *    prueba directa, sin depender de tiempos, de que el lock existe mientras
 *    la transacción vive y de que se libera al terminar.
 * 3. El hermano invertido, sin el cual todo lo anterior sería compatible con
 *    un lock GLOBAL que serializara el sistema entero: dos operaciones sobre
 *    insumos DISTINTOS tienen que solaparse en el tiempo.
 *
 * Ref design: openspec/changes/insumos-entrega-2/design.md, decisión 1.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { PrismaMovimientoInsumoRepository } from './prisma-movimiento-insumo.repository';
import { MovimientoInsumoEntity } from '../../../domain/entities/movimiento-insumo.entity';
import { SumasPorTipoMovimiento } from '../../../domain/ports/i-movimiento-insumo.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

/** Escritores simultáneos sobre el MISMO insumo. */
const CONCURRENCIA = 10;
/** Margen real sobre CONCURRENCIA: sin él, el pool serializa por su cuenta. */
const POOL_MAX = CONCURRENCIA + 5;

/** Existencia inicial del insumo bajo prueba. */
const STOCK_INICIAL = 10;
/** Cuánto pide cada escritor: 10 / 2 = exactamente 5 salidas admisibles. */
const CANTIDAD_POR_SALIDA = 2;
const SALIDAS_ADMISIBLES = STOCK_INICIAL / CANTIDAD_POR_SALIDA;

/**
 * Cuánto se sostiene abierta la transacción después de tomar el lock, en los
 * dos casos que miden VENTANAS de tiempo. Tiene que ser holgadamente mayor
 * que el ruido de una consulta local y holgadamente menor que el timeout de
 * una transacción interactiva de Prisma (5 s por defecto).
 */
const RETENCION_MS = 400;

/**
 * Prefijo de la clave del advisory lock, escrito ACÁ a mano y a propósito.
 *
 * Importarlo del repositorio haría que el test siguiera cualquier cambio de
 * clave sin decir nada, y la clave es un contrato publicado —decisión 1 del
 * diseño—: TODO escritor del stock de un insumo tiene que tomar exactamente
 * esta, o dos escritores bloquearían espacios distintos creyendo que se
 * serializan. Este literal es lo que hace que ese cambio salga en rojo.
 */
const PREFIJO_LOCK_STOCK = 'insumo-stock:';

/**
 * Instrumenta un `pg.Pool` para medir cuántas conexiones estuvieron
 * CHECKED-OUT simultáneamente. Retorna un getter con el máximo observado.
 *
 * `Pool.connect` tiene DOS formas de uso: `connect()` sin argumentos (devuelve
 * `Promise<PoolClient>`, la que usa `PrismaPgAdapter.startTransaction()` para
 * abrir cada transacción) y `connect(callback)`, que es la que `pool.query()`
 * usa INTERNAMENTE para cada consulta suelta. Instrumentar la variante
 * callback devolviendo una promesa deja a `pool.query()` esperando para
 * siempre un callback que nunca llega —un cuelgue total y silencioso—, así
 * que acá se la deja pasar sin tocar: la única que interesa medir es la de
 * las transacciones. Esto está documentado en el spec de compras del que sale
 * el patrón, verificado ahí empíricamente.
 */
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
      // Variante callback (pool.query() interno) — pass-through SIN instrumentar.
      return (connectOriginal as unknown as (cb: ConnectCallback) => void)(callback);
    }
    // Variante Promise (startTransaction()): una transacción = una conexión.
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

/**
 * Stock a partir del desglose por tipo. La regla de en qué dirección pesa cada
 * tipo es de NEGOCIO y vive en `calcularStock()`
 * (`domain/entities/tipo-movimiento-insumo.ts`), no en el repositorio — el
 * puerto devuelve un desglose justamente para no fijarla.
 *
 * Acá se escribe una segunda vez, a mano, y es deliberado: este spec verifica
 * que el LOCK serializa, y afirmarlo con la misma función que usa el código
 * bajo prueba haría que un error en esa función se cancelara contra sí mismo.
 * Es una comprobación independiente, no una copia por descuido.
 */
function stockDe(sumas: SumasPorTipoMovimiento): number {
  return sumas.ENTRADA + sumas.AJUSTE_POSITIVO - sumas.SALIDA - sumas.AJUSTE_NEGATIVO;
}

/** Ventana de tiempo en la que una transacción tuvo el lock del insumo. */
interface VentanaDelLock {
  inicio: number;
  fin: number;
}

/**
 * Solape, en milisegundos, entre dos ventanas. Positivo = las dos estuvieron
 * en vuelo a la vez; negativo = una terminó antes de que la otra empezara.
 */
function solapeMs(a: VentanaDelLock, b: VentanaDelLock): number {
  return Math.min(a.fin, b.fin) - Math.max(a.inicio, b.inicio);
}

describe('PrismaMovimientoInsumoRepository — Concurrencia real del advisory lock', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  /** Sesión aparte, sin Prisma: sondea el lock desde AFUERA de la transacción. */
  let poolTestigo: Pool;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let txRunner: PrismaTenantTransactionRunner;
  let repo: PrismaMovimientoInsumoRepository;
  let maxConcurrenteObservado: () => number;

  /** Prefijo único por corrida: dos procesos en paralelo no se pisan. */
  const PREFIJO = `MOVC_${randomBytes(2).toString('hex')}_`;
  const usuarioId = randomUUID();

  let insumoId: string;
  /** El OTRO insumo: sin él no existe el caso que descarta un lock global. */
  let otroInsumoId: string;

  beforeAll(async () => {
    // Solo para reusar buildTenantUrl(): esta instancia NUNCA abre su propio
    // pool de tenant, así que no interfiere con el pool instrumentado.
    prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    const tenantUrl = prismaServiceParaUrl.buildTenantUrl(TENANT_TEST_DB_NAME);

    pool = new Pool({ connectionString: tenantUrl, max: POOL_MAX });
    maxConcurrenteObservado = instrumentarConcurrenciaDelPool(pool);
    tenantClient = new TenantPrismaClient({ adapter: new PrismaPg(pool) });

    poolTestigo = new Pool({ connectionString: tenantUrl, max: 2 });

    tenantContext = new TenantContext();
    txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });
    repo = new PrismaMovimientoInsumoRepository(tenantContext);

    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}F`, nombre: 'Familia de prueba' },
    });
    const unidad = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}U`, nombre: 'Unidad de prueba' },
    });

    const insumo = await tenantClient.insumo.create({
      data: {
        codigo: `${PREFIJO}A`,
        nombre: 'Insumo bajo prueba',
        familiaId: familia.id,
        unidadMedidaId: unidad.id,
      },
    });
    insumoId = insumo.id;

    const otroInsumo = await tenantClient.insumo.create({
      data: {
        codigo: `${PREFIJO}B`,
        nombre: 'Otro insumo',
        familiaId: familia.id,
        unidadMedidaId: unidad.id,
      },
    });
    otroInsumoId = otroInsumo.id;
  }, 30_000);

  // Orden obligado por las FK con RESTRICT: la bitácora, después los insumos,
  // al final los catálogos. Los pools se cierran recién después.
  afterAll(async () => {
    await tenantClient.movimientoInsumo.deleteMany({
      where: { insumoId: { in: [insumoId, otroInsumoId] } },
    });
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.$disconnect();
    await pool.end().catch(() => undefined);
    await poolTestigo.end().catch(() => undefined);
    await prismaServiceParaUrl.onModuleDestroy();
  }, 30_000);

  beforeEach(async () => {
    await tenantClient.movimientoInsumo.deleteMany({
      where: { insumoId: { in: [insumoId, otroInsumoId] } },
    });
  });

  function conTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-conc' },
      fn,
    );
  }

  /** Siembra la existencia inicial sin pasar por el repositorio. */
  async function sembrarEntrada(idDelInsumo: string, cantidad: number): Promise<void> {
    await tenantClient.movimientoInsumo.create({
      data: { insumoId: idDelInsumo, tipo: 'ENTRADA', cantidad, usuarioId },
    });
  }

  /**
   * Pregunta desde la sesión TESTIGO si el lock del insumo está libre.
   * `pg_try_advisory_xact_lock` no espera: devuelve `false` si otra sesión lo
   * tiene. Si lo consigue, lo suelta al terminar su propia transacción
   * implícita, así que sondear no deja nada tomado.
   */
  async function lockEstaLibre(idDelInsumo: string): Promise<boolean> {
    const resultado = await poolTestigo.query<{ libre: boolean }>(
      'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS libre',
      [PREFIJO_LOCK_STOCK + idDelInsumo],
    );
    return resultado.rows[0].libre;
  }

  /**
   * Corre una transacción que toma el lock del insumo, lo sostiene
   * `RETENCION_MS` y devuelve la ventana en que lo tuvo. `inicio` se marca
   * DESPUÉS de que `lockAndSumByTipo()` volvió, o sea con el lock ya en la
   * mano: es lo que hace comparable una ventana con la otra.
   */
  async function retenerElLock(idDelInsumo: string): Promise<VentanaDelLock> {
    return txRunner.run(async () => {
      await repo.lockAndSumByTipo(idDelInsumo);
      const inicio = Date.now();
      await new Promise((resolve) => setTimeout(resolve, RETENCION_MS));
      return { inicio, fin: Date.now() };
    });
  }

  it(
    `${CONCURRENCIA} salidas simultáneas del MISMO insumo se serializan: pasan exactamente ` +
      `${SALIDAS_ADMISIBLES} y el stock nunca queda negativo`,
    async () => {
      await sembrarEntrada(insumoId, STOCK_INICIAL);

      const resultados = await conTenant(async () => {
        const tareas = Array.from({ length: CONCURRENCIA }, () =>
          txRunner.run(async () => {
            const sumas = await repo.lockAndSumByTipo(insumoId);
            if (stockDe(sumas) < CANTIDAD_POR_SALIDA) {
              return 'rechazada';
            }
            await repo.insert(
              MovimientoInsumoEntity.create({
                insumoId,
                tipo: 'SALIDA',
                cantidad: CANTIDAD_POR_SALIDA,
                usuarioId,
              }).getValue(),
            );
            return 'asentada';
          }),
        );

        return Promise.all(tareas);
      });

      // Prueba de CONCURRENCIA REAL, antes que nada: si las transacciones no
      // estuvieron en vuelo a la vez, el resultado de negocio de abajo pudo
      // salir del encolamiento del pool y no del advisory lock.
      const maxConcurrente = maxConcurrenteObservado();
      console.info(
        `[concurrencia] máximo de conexiones simultáneas del pool durante ` +
          `${CONCURRENCIA} transacciones: ${maxConcurrente} (pool max=${POOL_MAX}).`,
      );
      expect(maxConcurrente).toBeGreaterThan(1);

      expect(resultados.filter((r) => r === 'asentada')).toHaveLength(SALIDAS_ADMISIBLES);
      expect(resultados.filter((r) => r === 'rechazada')).toHaveLength(
        CONCURRENCIA - SALIDAS_ADMISIBLES,
      );

      // El stock final es la prueba de la invariante: sin el lock, los 10
      // escritores leerían la misma existencia inicial y quedaría en -10.
      const sumas = await conTenant(() => txRunner.run(() => repo.lockAndSumByTipo(insumoId)));
      expect(stockDe(sumas)).toBe(0);
    },
    60_000,
  );

  it('dos operaciones simultáneas sobre el MISMO insumo no se solapan en el tiempo', async () => {
    await sembrarEntrada(insumoId, STOCK_INICIAL);

    const [primera, segunda] = await conTenant(() =>
      Promise.all([retenerElLock(insumoId), retenerElLock(insumoId)]),
    );

    const maxConcurrente = maxConcurrenteObservado();
    console.info(
      `[concurrencia] mismo insumo — solape: ${solapeMs(primera, segunda)} ms, ` +
        `máximo de conexiones simultáneas: ${maxConcurrente}.`,
    );

    // Sin esto, un pool que hubiera encolado las dos transacciones daría el
    // mismo "no se solapan" sin que el lock hubiera hecho nada.
    expect(maxConcurrente).toBeGreaterThan(1);
    // La segunda no arrancó hasta que la primera terminó: solape negativo.
    expect(solapeMs(primera, segunda)).toBeLessThan(0);
  }, 60_000);

  /**
   * HERMANO INVERTIDO del caso de arriba, y el que impide dar por bueno un
   * lock GLOBAL. Un lock que no discriminara por insumo pasaría el test
   * anterior igual, serializando de paso a todo el sistema, y nadie se
   * enteraría: dos técnicos sacando cosas distintas se esperarían entre sí.
   */
  it('dos operaciones simultáneas sobre insumos DISTINTOS sí se solapan', async () => {
    await sembrarEntrada(insumoId, STOCK_INICIAL);
    await sembrarEntrada(otroInsumoId, STOCK_INICIAL);

    const [ventanaA, ventanaB] = await conTenant(() =>
      Promise.all([retenerElLock(insumoId), retenerElLock(otroInsumoId)]),
    );

    const solape = solapeMs(ventanaA, ventanaB);
    console.info(`[concurrencia] insumos distintos — solape: ${solape} ms.`);

    // La mitad de la retención: serializadas darían solape NEGATIVO, y en
    // paralelo dan casi RETENCION_MS entero. El corte al medio deja margen
    // para el ruido de arranque sin admitir una serialización disfrazada.
    expect(solape).toBeGreaterThan(RETENCION_MS / 2);
  }, 60_000);

  /**
   * El lock se toma de verdad y se libera al terminar la transacción, probado
   * desde una sesión AJENA y sin depender de tiempos.
   *
   * Los dos asserts son hermanos y ninguno vale solo: el de "no está libre"
   * es el que se pone rojo si alguien saca el `pg_advisory_xact_lock`, y el de
   * "vuelve a estar libre" es el que se pone rojo si alguien lo cambia por un
   * lock de SESIÓN (`pg_advisory_lock`), que sobreviviría al commit y dejaría
   * colgado al siguiente escritor del insumo.
   */
  it('el lock está tomado mientras la transacción vive y libre después del commit', async () => {
    const libreDurante = await conTenant(() =>
      txRunner.run(async () => {
        await repo.lockAndSumByTipo(insumoId);
        return lockEstaLibre(insumoId);
      }),
    );

    expect(libreDurante).toBe(false);
    await expect(lockEstaLibre(insumoId)).resolves.toBe(true);
  }, 60_000);
});
