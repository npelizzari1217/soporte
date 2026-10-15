/**
 * `PostgresThrottlerStorage` contra `soporte_master_test` (odd/tasks/throttler-postgres.md).
 * No trunca: usa keys con sufijo aleatorio y borra solo las suyas.
 *
 * CA1 es un test de contrato: la misma secuencia de llamadas corre contra el
 * `ThrottlerStorageService` de memoria (con timers falsos) y contra el de Postgres (con un reloj
 * manual), y los dos tienen que devolver exactamente lo mismo, llamada por llamada.
 */
import { randomBytes } from 'node:crypto';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { Pool } from 'pg';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../../../testing/lock-master-test';
import { PrismaService } from '../persistence/prisma.service';
import { PostgresThrottlerStorage } from './postgres-throttler-storage';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const SUFIJO = randomBytes(4).toString('hex');
const NOMBRE = 'default';
const logger = () => ({ log: vi.fn(), error: vi.fn() });

/** Una llamada: cuantos ms pasan desde la anterior y con que parametros se llama. */
interface Paso {
  despuesDeMs: number;
  ttl: number;
  limit: number;
  blockDuration: number;
}

const pasos = (ttl: number, limit: number, blockDuration: number, esperas: number[]): Paso[] =>
  esperas.map((despuesDeMs) => ({ despuesDeMs, ttl, limit, blockDuration }));

/** Nombre, secuencia y si la secuencia tiene que llegar a bloquear (que no pase de largo). */
const ESCENARIOS: [string, Paso[], boolean][] = [
  // Cuatro pedidos juntos: el cuarto bloquea; mientras dura el bloqueo no cuenta; al vencer
  // el bloqueo arranca de nuevo con un pedido.
  ['bloqueo y reinicio', pasos(10_000, 3, 10_000, [0, 0, 0, 0, 5_000, 4_999, 1, 500, 0, 0]), true],
  // Ventana deslizante: cada pedido deja de contar ttl ms despues de hecho.
  ['vencimiento por pedido', pasos(10_000, 3, 10_000, [0, 6_000, 0, 4_000, 1, 0, 9_999]), true],
  // Bloqueo mas largo que la ventana: los pedidos vencen pero el bloqueo sigue.
  ['bloqueo mas largo que la ventana', pasos(1_000, 2, 5_000, [0, 0, 0, 2_000, 2_999, 1, 0]), true],
  // `timeToExpire`: la ventana informada se renueva recien al vencer.
  ['ventana vencida', pasos(1_000, 5, 1_000, [0, 999, 1, 500, 1_501, 250]), false],
];

/** Corre la secuencia contra el storage de memoria de `@nestjs/throttler`. */
async function correrEnMemoria(key: string, secuencia: Paso[], base: number) {
  vi.useFakeTimers({ now: base });
  const storage = new ThrottlerStorageService();
  try {
    const resultados = [];
    for (const p of secuencia) {
      vi.advanceTimersByTime(p.despuesDeMs);
      resultados.push(await storage.increment(key, p.ttl, p.limit, p.blockDuration, NOMBRE));
    }
    return resultados;
  } finally {
    storage.onApplicationShutdown();
    vi.useRealTimers();
  }
}

usarLockMasterTest();

describe('PostgresThrottlerStorage', () => {
  let pool: InstanceType<typeof Pool>;
  let prismaA: PrismaService;
  let prismaB: PrismaService;
  let n = 0;
  const nuevaKey = (): string => `test-${SUFIJO}-${n++}`;

  beforeAll(() => {
    pool = new Pool({ connectionString: URL_MASTER });
    prismaA = new PrismaService(URL_MASTER);
    prismaB = new PrismaService(URL_MASTER);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM throttler_contadores WHERE clave LIKE $1', [`%${SUFIJO}%`]);
    await pool.end();
    await prismaA.onModuleDestroy();
    await prismaB.onModuleDestroy();
  });

  describe('CA1: mismos resultados que ThrottlerStorageService 6.5.0', () => {
    it.each(ESCENARIOS)('%s', async (_nombre, secuencia, bloquea) => {
      const base = Date.now();
      const key = nuevaKey();
      const esperado = await correrEnMemoria(key, secuencia, base);

      let reloj = base;
      const storage = new PostgresThrottlerStorage(prismaA, logger(), () => reloj);
      const obtenido = [];
      for (const p of secuencia) {
        reloj += p.despuesDeMs;
        obtenido.push(await storage.increment(key, p.ttl, p.limit, p.blockDuration, NOMBRE));
      }

      expect(obtenido).toEqual(esperado);
      expect(esperado.some((r) => r.isBlocked)).toBe(bloquea);
    });
  });

  it('CA2: dos instancias, con su propia conexion cada una, comparten la cuenta de una key', async () => {
    const key = nuevaKey();
    const a = new PostgresThrottlerStorage(prismaA, logger());
    const b = new PostgresThrottlerStorage(prismaB, logger());

    const resultados = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        (i % 2 === 0 ? a : b).increment(key, 60_000, 10, 60_000, NOMBRE),
      ),
    );

    const pasaron = resultados.filter((r) => !r.isBlocked);
    expect(pasaron).toHaveLength(10);
    expect(pasaron.map((r) => r.totalHits).sort((x, y) => x - y)).toEqual(
      Array.from({ length: 10 }, (_, i) => i + 1),
    );
    expect(resultados.filter((r) => r.isBlocked)).toHaveLength(10);
  });

  it('CA4: la purga borra los contadores vencidos hace mas de un dia y deja los vigentes', async () => {
    const vieja = `${NOMBRE}:${nuevaKey()}`;
    const vigente = `${NOMBRE}:${nuevaKey()}`;
    await pool.query(
      `INSERT INTO throttler_contadores (clave, vencimientos, expira_en, bloqueado, bloqueado_hasta)
       VALUES ($1, '{}', now() - interval '2 days', true, now() - interval '2 days'),
              ($2, '{}', now() - interval '2 hours', false, NULL)`,
      [vieja, vigente],
    );

    // Instancia nueva: la primera llamada purga.
    await new PostgresThrottlerStorage(prismaA, logger()).increment(
      nuevaKey(),
      60_000,
      10,
      60_000,
      NOMBRE,
    );

    const r = await pool.query(
      'SELECT clave FROM throttler_contadores WHERE clave = ANY($1) ORDER BY clave',
      [[vieja, vigente]],
    );
    expect(r.rows.map((f) => f.clave)).toEqual([vigente]);
  });
});
