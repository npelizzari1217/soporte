/**
 * PR-11 [INTEGRATION] — RED→GREEN: `PrismaCompraRepository.findLastSecuencia`
 * bajo concurrencia REAL (S3, ADR-C5) — Y prueba de que la concurrencia fue
 * GENUINA (H7).
 *
 * ── EL PROBLEMA (H7) ────────────────────────────────────────────────────
 * `PrismaService` (`shared/infrastructure/persistence/prisma.service.ts:60`)
 * construye el pool de un tenant con `new Pool({ connectionString })`, SIN
 * fijar `max`. El default de node-postgres es 10 conexiones. Con
 * `CONCURRENCIA = 10` eso deja CERO margen: si el pool ENCOLA en vez de dar
 * 10 conexiones simultáneas, el encolamiento TAMBIÉN serializa las N
 * transacciones — y entonces `new Set(secuencias) === {1..10}` da verde
 * tanto si el advisory lock funciona como si nunca se ejercitó. Un test que
 * pasa con y sin el mecanismo que dice probar es decorativo.
 *
 * ── LA SOLUCIÓN DE ESTE SPEC ────────────────────────────────────────────
 * 1. Pool PROPIO de este test (no el de `PrismaService.getTenantClient`,
 *    que no permite configurar `max`) con `max = CONCURRENCIA + 5` — margen
 *    real para que las 10 transacciones puedan tener conexión simultánea.
 *    Reutiliza `PrismaService.buildTenantUrl()` (método público existente,
 *    sin abrir pool) solo para construir la connection string del tenant de
 *    test, sin duplicar esa lógica ni tocar `prisma.service.ts` (fuera de
 *    alcance de este PR).
 * 2. `instrumentPoolConcurrency()` monkey-patchea `pool.connect` (el método
 *    que `@prisma/adapter-pg` usa internamente para abrir cada transacción
 *    — ver `PrismaPgAdapter.startTransaction()`, `await this.client.connect()`
 *    en `node_modules/@prisma/adapter-pg/dist/index.js`) para contar cuántas
 *    conexiones estuvieron CHECKED-OUT del pool SIMULTÁNEAMENTE. Si el
 *    máximo observado fuera 1, las N transacciones NUNCA estuvieron en
 *    vuelo a la vez — evidencia de que el test sería decorativo. El assert
 *    de abajo corta esa ambigüedad ANTES de mirar el resultado de negocio.
 *
 * Estructura del resto del spec: espejo de
 * `prisma-ticket-repository.concurrencia.integration.spec.ts` (mismo
 * criterio: `ANIO_TEST` fuera de rango real, `fileParallelism: false` en
 * `vitest.config.ts:11` serializa por ARCHIVO no por `it`, cada creación en
 * su propia `txRunner.run`).
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.1 (S3). Ref design:
 * ADR-C5. Ref tasks: PR-11, hueco H7.
 */
import { randomBytes } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { PrismaCompraRepository } from './prisma-compra.repository';
import { CompraEntity } from '../../../domain/entities/compra.entity';
import { NumeradorCompra } from '../../../domain/services/numerador-compra';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const CLIENTE_ID = 'test-cliente-pr11-concurrencia';
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000001';
const ANIO_TEST = 2099; // año fuera de rango real: aísla de otras suites/reruns
const CONCURRENCIA = 10; // contrato de S3/ADR-C5/tasks PR-11
const POOL_MAX = CONCURRENCIA + 5; // margen real sobre CONCURRENCIA — ver JSDoc de arriba (H7)

/**
 * Instrumenta un `pg.Pool` para medir cuántas conexiones estuvieron
 * CHECKED-OUT simultáneamente (H7). Envuelve `pool.connect()` contando
 * cuántas llamadas resueltas todavía no llamaron `client.release()`.
 * Retorna un getter con el máximo histórico observado.
 *
 * **GOTCHA descubierto empíricamente al escribir este spec (verificado con
 * un script standalone antes de confiar en esto)**: `Pool.connect` tiene DOS
 * formas de uso — `connect()` sin argumentos (retorna `Promise<PoolClient>`,
 * la que usa `PrismaPgAdapter.startTransaction()` para abrir cada
 * transacción) y `connect(callback)` (la que el propio `pool.query()` de
 * `pg` usa INTERNAMENTE para cada query suelta, incluidas las no
 * transaccionales que corren por `PrismaPgAdapterFactory.connect()` — ese
 * factory le pasa el POOL ENTERO como `client` a `PgQueryable`, no una
 * conexión dedicada). Una primera versión de este helper interceptaba
 * TODAS las llamadas asumiendo la forma Promise y ADEMÁS retornaba una
 * promesa en vez de invocar el callback recibido — eso hacía que
 * `pool.query()` (usado por CUALQUIER query no transaccional, incluidas las
 * de los fixtures de `beforeAll`) se quedara esperando para siempre un
 * callback que nunca llegaba: un cuelgue total y silencioso (timeout de
 * `beforeAll`/`afterAll` a los 30s, sin ningún error explícito). Este
 * helper por eso DEJA PASAR sin tocar la variante callback (la de
 * `pool.query()`) y solo instrumenta la variante Promise (la de
 * `startTransaction()`, que es la única relevante para medir cuántas
 * TRANSACCIONES concurrentes tuvo el pool).
 */
function instrumentPoolConcurrency(pool: Pool): () => number {
  let conexionesActivas = 0;
  let maxObservado = 0;
  const originalConnect = pool.connect.bind(pool);

  type ConnectCallback = (
    err: Error | undefined,
    client: PoolClient,
    release: (release?: unknown) => void,
  ) => void;

  const connectInstrumentado = (callback?: ConnectCallback): Promise<PoolClient> | void => {
    if (callback) {
      // Variante callback (pool.query() interno) — pass-through SIN instrumentar.
      return (originalConnect as unknown as (cb: ConnectCallback) => void)(callback);
    }
    // Variante Promise (PrismaPgAdapter.startTransaction()) — la única que
    // nos interesa medir: una transacción = una conexión checked-out.
    return (originalConnect as () => Promise<PoolClient>)().then((client) => {
      conexionesActivas += 1;
      maxObservado = Math.max(maxObservado, conexionesActivas);

      const originalRelease = client.release.bind(client);
      client.release = ((err?: Error | boolean) => {
        conexionesActivas -= 1;
        return originalRelease(err);
      }) as typeof client.release;

      return client;
    });
  };

  pool.connect = connectInstrumentado as unknown as typeof pool.connect;
  return () => maxObservado;
}

describe('PrismaCompraRepository.findLastSecuencia — Concurrencia real (S3, ADR-C5, H7)', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let txRunner: PrismaTenantTransactionRunner;
  let compraRepo: PrismaCompraRepository;
  let getMaxConcurrente: () => number;
  let cicloId: string;

  beforeAll(async () => {
    // Solo para reusar buildTenantUrl() (método público existente) — este
    // PrismaService NUNCA abre su propio pool de tenant (getTenantClient no
    // se llama sobre esta instancia), así que no interfiere con el pool
    // instrumentado de abajo.
    prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    const tenantUrl = prismaServiceParaUrl.buildTenantUrl(TENANT_TEST_DB_NAME);

    pool = new Pool({ connectionString: tenantUrl, max: POOL_MAX });
    getMaxConcurrente = instrumentPoolConcurrency(pool);
    const adapter = new PrismaPg(pool);
    tenantClient = new TenantPrismaClient({ adapter });

    tenantContext = new TenantContext();
    txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });
    compraRepo = new PrismaCompraRepository(tenantContext);

    const suffix = randomBytes(3).toString('hex');
    const ciclo = await tenantClient.cicloCliente.create({
      data: {
        cicloVigenteId: DUMMY_USUARIO_ID,
        nombre: `PR11TEST_CONC_${suffix}`,
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        // activo: false — higiene de DB: nunca dejar un ciclo activo=true de
        // test vivo (flakiness real de esta semana: findActive() sin
        // orderBy puede recoger un ciclo ajeno).
        activo: false,
      },
    });
    cicloId = ciclo.id;
  }, 30_000);

  afterAll(async () => {
    // Cleanup acotado por año de fixture (ANIO_TEST=2099, fuera de rango
    // real) y por el ciclo propio — nunca TRUNCATE ni deleteMany sin filtro.
    await tenantClient.compra.deleteMany({
      where: { numero: { startsWith: `COM-${ANIO_TEST}-` } },
    });
    await tenantClient.cicloCliente.delete({ where: { id: cicloId } });
    await tenantClient.$disconnect();
    await pool.end().catch(() => undefined);
    await prismaServiceParaUrl.onModuleDestroy();
  }, 30_000);

  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: CLIENTE_ID },
      fn,
    );
  }

  it(
    `${CONCURRENCIA} creaciones simultáneas del mismo año generan secuencias 1..${CONCURRENCIA} ` +
      `sin duplicados ni huecos, CON concurrencia real demostrada en el pool (H7)`,
    async () => {
      const numerosGenerados = await withTenant(async () => {
        const tareas = Array.from({ length: CONCURRENCIA }, () =>
          txRunner.run(async () => {
            const lastSecuencia = await compraRepo.findLastSecuencia(ANIO_TEST);
            const numero = NumeradorCompra.generarFormato(ANIO_TEST, lastSecuencia + 1);
            const compra = CompraEntity.create({
              numero,
              fechaSolicitud: new Date('2099-06-01'),
              motivo: 'Compra concurrente PR-11',
              descripcion: null,
              solicitanteId: DUMMY_USUARIO_ID,
              cicloId,
            });
            await compraRepo.guardar(compra);
            return numero;
          }),
        );

        return Promise.all(tareas);
      });

      // ── Prueba de CONCURRENCIA REAL (H7) — corre ANTES que las
      // aserciones de negocio a propósito: si esto no se cumple, el
      // resultado de abajo (secuencias sin huecos) no prueba nada sobre el
      // advisory lock — pudo haber pasado por encolamiento del pool.
      const maxConcurrente = getMaxConcurrente();

      console.info(
        `[H7] Máximo de conexiones concurrentes observadas en el pool durante ` +
          `${CONCURRENCIA} transacciones simultáneas: ${maxConcurrente} (pool max=${POOL_MAX}).`,
      );
      expect(maxConcurrente).toBeGreaterThan(1);

      const unicos = new Set(numerosGenerados);
      expect(unicos.size).toBe(CONCURRENCIA);

      const secuencias = numerosGenerados
        .map((n) => parseInt(n.split('-')[2], 10))
        .sort((a, b) => a - b);
      expect(secuencias).toEqual(Array.from({ length: CONCURRENCIA }, (_, i) => i + 1));
    },
    60_000,
  );
});
