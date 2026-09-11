/**
 * [INTEGRATION] `PrismaInsumoRepository.findLastSecuenciaCodigo()` bajo
 * concurrencia REAL (issue #162) — y prueba de que la concurrencia fue
 * GENUINA.
 *
 * ES la sección crítica del issue: `insumos.codigo` es `@unique`, y con la
 * autogeneración dos altas simultáneas en la misma familia calculan el mismo
 * "próximo código" salvo que algo las serialice. El riesgo, tal como lo
 * describe el issue, es que la segunda choque contra el `@unique` con
 * "código duplicado" sobre un código que el usuario nunca escribió.
 *
 * ── EL PROBLEMA QUE HACE DECORATIVO A UN TEST DE CONCURRENCIA (H7) ────────
 * `PrismaService` construye el pool de un tenant con `new Pool({
 * connectionString })`, SIN fijar `max`: el default de node-postgres son 10
 * conexiones. Si el pool ENCOLA en vez de dar N conexiones simultáneas, el
 * encolamiento serializa las N transacciones por su cuenta — y entonces el
 * resultado de negocio da verde tanto si el advisory lock funciona como si
 * nunca se ejercitó. Mismo hueco que atacaron
 * `prisma-compra.repository.concurrencia.integration.spec.ts` y
 * `prisma-movimiento-insumo.repository.concurrencia.integration.spec.ts`, de
 * donde sale el patrón de este archivo (pool propio instrumentado +
 * `poolTestigo` para sondear el lock desde afuera).
 *
 * Ref: issue #162. Precedente: `NumeradorTicket`/`NumeradorCompra`,
 * `prisma-ticket.repository.ts` (ADR-5), `prisma-compra.repository.ts`
 * (ADR-C5).
 */
import { randomBytes } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { PrismaInsumoRepository } from './prisma-insumo.repository';
import { InsumoEntity } from '../../../domain/entities/insumo.entity';
import { NumeradorInsumo } from '../../../domain/services/numerador-insumo.service';
import { PrefijoCodigoInsumo } from '../../../domain/ports/i-insumo.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

/** Altas simultáneas en la MISMA familia (misma serie de código). */
const CONCURRENCIA = 10;
/** Margen real sobre CONCURRENCIA: sin él, el pool serializa por su cuenta. */
const POOL_MAX = CONCURRENCIA + 5;

/**
 * Prefijo de la clave del advisory lock, escrito ACÁ a mano y a propósito
 * (mismo criterio que `PREFIJO_LOCK_STOCK` en el spec de movimientos): es un
 * contrato publicado en el JSDoc de
 * `IInsumoRepository.findLastSecuenciaCodigo` — TODO escritor de la serie
 * tiene que tomar EXACTAMENTE esta clave, o dos escritores bloquearían
 * espacios distintos creyendo que se serializan. Importarla del repositorio
 * dejaría a este test sin poder detectar ese cambio.
 */
const PREFIJO_LOCK_CODIGO_INSUMO = 'insumo-codigo:';

/** Cuánto se sostiene abierta la transacción tras tomar el lock (ver los dos tests de ventana). */
const RETENCION_MS = 400;

/**
 * Instrumenta un `pg.Pool` para medir cuántas conexiones estuvieron
 * CHECKED-OUT simultáneamente. Retorna un getter con el máximo observado.
 *
 * `Pool.connect` tiene DOS formas de uso: `connect()` sin argumentos (la que
 * usa `PrismaPgAdapter.startTransaction()` para abrir cada transacción) y
 * `connect(callback)` (la que `pool.query()` usa INTERNAMENTE para cada
 * consulta suelta). Instrumentar la variante callback devolviendo una
 * promesa deja a `pool.query()` esperando para siempre un callback que nunca
 * llega —un cuelgue total y silencioso—, así que acá se la deja pasar sin
 * tocar. Documentado empíricamente en el spec de compras del que sale el
 * patrón (H7).
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

/** Ventana de tiempo en la que una transacción tuvo el lock de la serie. */
interface VentanaDelLock {
  inicio: number;
  fin: number;
}

/** Solape en ms entre dos ventanas. Positivo = en vuelo a la vez; negativo = una terminó antes de que la otra empezara. */
function solapeMs(a: VentanaDelLock, b: VentanaDelLock): number {
  return Math.min(a.fin, b.fin) - Math.max(a.inicio, b.inicio);
}

describe('PrismaInsumoRepository.findLastSecuenciaCodigo — Concurrencia real (issue #162)', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  /** Sesión aparte, sin Prisma: sondea el lock desde AFUERA de la transacción. */
  let poolTestigo: Pool;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let txRunner: PrismaTenantTransactionRunner;
  let repo: PrismaInsumoRepository;
  let numerador: NumeradorInsumo;
  let maxConcurrenteObservado: () => number;

  /** Prefijo único por corrida: dos procesos en paralelo no se pisan (nombre, no código). */
  const PREFIJO = `INSC_${randomBytes(2).toString('hex')}_`;

  let familiaId: string;
  let unidadMedidaId: string;
  /** ids de los insumos creados por esta suite, para limpiar por id exacto. */
  const insumosIdsCreados: string[] = [];

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
    repo = new PrismaInsumoRepository(tenantContext);
    numerador = new NumeradorInsumo(repo);

    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}F`, nombre: 'Familia de prueba' },
    });
    const unidad = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}U`, nombre: 'Unidad de prueba' },
    });
    familiaId = familia.id;
    unidadMedidaId = unidad.id;
  }, 30_000);

  afterAll(async () => {
    if (insumosIdsCreados.length > 0) {
      await tenantClient.insumo.deleteMany({ where: { id: { in: insumosIdsCreados } } });
    }
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.$disconnect();
    await pool.end().catch(() => undefined);
    await poolTestigo.end().catch(() => undefined);
    await prismaServiceParaUrl.onModuleDestroy();
  }, 30_000);

  function conTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      {
        prismaClient: tenantClient,
        dbName: TENANT_TEST_DB_NAME,
        clienteId: 'test-cliente-insumos-conc',
      },
      fn,
    );
  }

  /** Genera y guarda un insumo con el código que el numerador resuelva; devuelve el código. */
  async function crearInsumoAutogenerado(esRepuesto: boolean): Promise<string> {
    const codigoResult = await numerador.generarCodigo(esRepuesto);
    const codigo = codigoResult.getValue();
    const insumo = InsumoEntity.create({
      codigo,
      nombre: `Insumo concurrente ${codigo}`,
      familiaId,
      unidadMedidaId,
      stockMinimo: null,
      activo: true,
      codigosAlternativos: [],
      compatibilidad: [],
    });
    await repo.save(insumo);
    insumosIdsCreados.push(insumo.id);
    return codigo;
  }

  /**
   * Pregunta desde la sesión TESTIGO si el lock de la serie está libre.
   * `pg_try_advisory_xact_lock` no espera: `false` si otra sesión lo tiene.
   */
  async function lockEstaLibre(prefijo: PrefijoCodigoInsumo): Promise<boolean> {
    const resultado = await poolTestigo.query<{ libre: boolean }>(
      'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS libre',
      [PREFIJO_LOCK_CODIGO_INSUMO + prefijo],
    );
    return resultado.rows[0].libre;
  }

  /** Corre una transacción que toma el lock de la serie y lo sostiene `RETENCION_MS`. */
  async function retenerElLock(prefijo: PrefijoCodigoInsumo): Promise<VentanaDelLock> {
    return txRunner.run(async () => {
      await repo.findLastSecuenciaCodigo(prefijo);
      const inicio = Date.now();
      await new Promise((resolve) => setTimeout(resolve, RETENCION_MS));
      return { inicio, fin: Date.now() };
    });
  }

  /**
   * EL ASSERT QUE DECIDE (issue #162): dos — acá, diez — altas SIMULTÁNEAS en
   * la MISMA familia tienen que producir códigos DISTINTOS, y NINGUNA puede
   * fallar con "código duplicado". Sin el advisory lock, las `CONCURRENCIA`
   * transacciones leerían la MISMA "última secuencia", calcularían el MISMO
   * "próximo código", y todas menos la primera en comitear chocarían contra
   * el `@unique` de `insumos.codigo` con un `PrismaClientKnownRequestError`
   * (P2002) — el "código duplicado" que el usuario nunca escribió.
   */
  it(
    `${CONCURRENCIA} altas simultáneas en la misma familia producen ${CONCURRENCIA} códigos ` +
      `DISTINTOS, ninguna falla con código duplicado, CON concurrencia real demostrada en el pool`,
    async () => {
      const resultados = await conTenant(() =>
        Promise.allSettled(
          Array.from({ length: CONCURRENCIA }, () =>
            txRunner.run(() => crearInsumoAutogenerado(false)),
          ),
        ),
      );

      // Prueba de CONCURRENCIA REAL, antes que nada: si las transacciones no
      // estuvieron en vuelo a la vez, el resultado de abajo pudo salir del
      // encolamiento del pool y no del advisory lock.
      const maxConcurrente = maxConcurrenteObservado();
      console.info(
        `[concurrencia] máximo de conexiones simultáneas del pool durante ${CONCURRENCIA} ` +
          `transacciones: ${maxConcurrente} (pool max=${POOL_MAX}).`,
      );
      expect(maxConcurrente).toBeGreaterThan(1);

      const fallidos = resultados.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      if (fallidos.length > 0) {
        console.error(
          '[concurrencia] rechazos:',
          fallidos.map((f) => (f.reason instanceof Error ? f.reason.message : f.reason)),
        );
      }
      // LA prueba que decide: ninguna alta falla con "código duplicado".
      expect(fallidos).toHaveLength(0);

      const exitosos = resultados.filter(
        (r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled',
      );
      const codigosUnicos = new Set(exitosos.map((r) => r.value));
      expect(codigosUnicos.size).toBe(CONCURRENCIA);
    },
    60_000,
  );

  it('dos series DISTINTAS (INS/REP) no se bloquean entre sí', async () => {
    const [ventanaIns, ventanaRep] = await conTenant(() =>
      Promise.all([retenerElLock('INS'), retenerElLock('REP')]),
    );

    const maxConcurrente = maxConcurrenteObservado();
    const solape = solapeMs(ventanaIns, ventanaRep);
    console.info(
      `[concurrencia] series distintas — solape: ${solape} ms, máximo de conexiones ` +
        `simultáneas: ${maxConcurrente}.`,
    );

    // Sin esto, un pool que hubiera encolado las dos transacciones daría el
    // mismo "se solapan" sin que el lock hubiera hecho nada.
    expect(maxConcurrente).toBeGreaterThan(1);
    // Si el lock fuera GLOBAL (sin scopear por serie), las dos transacciones
    // se serializarían igual que dos escritores de la MISMA serie, y este
    // assert se pondría rojo.
    expect(solape).toBeGreaterThan(RETENCION_MS / 2);
  }, 60_000);

  /**
   * El lock se toma de verdad y se libera al terminar la transacción, probado
   * desde una sesión AJENA y sin depender de tiempos.
   *
   * Los dos asserts son hermanos y ninguno vale solo: "no está libre" se pone
   * rojo si alguien saca el `pg_advisory_xact_lock`; "vuelve a estar libre"
   * se pone rojo si alguien lo cambia por un lock de SESIÓN
   * (`pg_advisory_lock`), que sobreviviría al commit y dejaría colgado al
   * siguiente escritor de la serie.
   */
  it('el lock está tomado mientras la transacción vive y libre después del commit', async () => {
    const libreDurante = await conTenant(() =>
      txRunner.run(async () => {
        await repo.findLastSecuenciaCodigo('INS');
        return lockEstaLibre('INS');
      }),
    );

    expect(libreDurante).toBe(false);
    await expect(lockEstaLibre('INS')).resolves.toBe(true);
  }, 60_000);
});
