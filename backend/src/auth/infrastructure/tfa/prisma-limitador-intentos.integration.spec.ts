/**
 * Limitador de intentos sobre `soporte_master_test` (WU-3, ADR-6). No trunca: usa claves con
 * sufijo aleatorio (`randomBytes`) y borra solo las suyas. El purgado se prueba con claves
 * viejas propias; la purga borra filas ajenas de mas de un dia, que ningun spec necesita.
 */
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../../../testing/lock-master-test';
import { PrismaLimitadorIntentos } from './prisma-limitador-intentos';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const SUFIJO = randomBytes(4).toString('hex');

usarLockMasterTest();

describe('PrismaLimitadorIntentos', () => {
  let pool: InstanceType<typeof Pool>;
  let prismaService: PrismaService;
  let limitador: PrismaLimitadorIntentos;
  let reloj = Date.now();
  const claves: string[] = [];

  const nuevaClave = (): string => {
    const clave = `test:${SUFIJO}:${claves.length}`;
    claves.push(clave);
    return clave;
  };
  const fallos = async (clave: string): Promise<number | null> => {
    const r = await pool.query('SELECT fallos FROM auth_intentos_fallidos WHERE clave = $1', [
      clave,
    ]);
    return r.rows[0]?.fallos ?? null;
  };
  const sembrar = (clave: string, nFallos: number, intervalo: string) =>
    pool.query(
      `INSERT INTO auth_intentos_fallidos (clave, fallos, ventana_inicio)
       VALUES ($1, $2, now() - $3::interval)
       ON CONFLICT (clave) DO UPDATE SET fallos = $2, ventana_inicio = now() - $3::interval`,
      [clave, nFallos, intervalo],
    );

  beforeAll(() => {
    pool = new Pool({ connectionString: URL_MASTER });
    prismaService = new PrismaService(URL_MASTER);
    limitador = new PrismaLimitadorIntentos(prismaService, () => reloj);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM auth_intentos_fallidos WHERE clave = ANY($1)', [claves]);
    await pool.end();
    await prismaService.onModuleDestroy();
  });

  it('10 reservas concurrentes con la clave en 0: exactamente 5 devuelven reserva (I1)', async () => {
    const clave = nuevaClave();
    const resultados = await Promise.all(
      Array.from({ length: 10 }, () => limitador.reservar(clave)),
    );
    expect(resultados.filter((r) => r !== null)).toHaveLength(5);
    expect(await fallos(clave)).toBe(5);
  });

  it('reservar bloqueado devuelve null y no incrementa (I7)', async () => {
    const clave = nuevaClave();
    await sembrar(clave, 5, '1 minute');
    expect(await limitador.reservar(clave)).toBeNull();
    expect(await fallos(clave)).toBe(5);
  });

  it('una ventana vencida reinicia en 1', async () => {
    const clave = nuevaClave();
    await sembrar(clave, 5, '16 minutes');
    const reserva = await limitador.reservar(clave);
    expect(reserva).not.toBeNull();
    expect(await fallos(clave)).toBe(1);
  });

  it('liberar borra la fila (I2)', async () => {
    const clave = nuevaClave();
    await limitador.reservar(clave);
    await limitador.liberar(clave);
    expect(await fallos(clave)).toBeNull();
  });

  it('devolver resta solo la reserva propia y deja los fallos previos', async () => {
    const clave = nuevaClave();
    await limitador.reservar(clave);
    await limitador.reservar(clave);
    const reserva = await limitador.reservar(clave);
    await limitador.devolver(reserva!);
    expect(await fallos(clave)).toBe(2);
  });

  it('devolver con una ventana renovada no cambia nada', async () => {
    const clave = nuevaClave();
    await sembrar(clave, 5, '16 minutes');
    const vieja = { clave, ventanaInicio: new Date(Date.now() - 16 * 60_000) };
    const nueva = await limitador.reservar(clave);
    expect(nueva).not.toBeNull();
    await limitador.devolver(vieja);
    expect(await fallos(clave)).toBe(1);
  });

  it('purga filas de mas de un dia como maximo una vez por hora', async () => {
    const primera = nuevaClave();
    const segunda = nuevaClave();
    const disparo = nuevaClave();
    await sembrar(primera, 1, '2 days');
    reloj += 2 * 3_600_000;
    await limitador.reservar(disparo);
    expect(await fallos(primera)).toBeNull();

    await sembrar(segunda, 1, '2 days');
    reloj += 60_000;
    await limitador.reservar(disparo);
    expect(await fallos(segunda)).toBe(1);

    reloj += 3_600_000;
    await limitador.reservar(disparo);
    expect(await fallos(segunda)).toBeNull();
  });
});
