/**
 * lock-master-test.ts — turno exclusivo sobre la base master de TEST.
 *
 * POR QUÉ EXISTE: `soporte_master_test` es UNA SOLA base compartida por todos
 * los specs de integración y e2e, y cada uno arranca su `beforeEach` con un
 * `TRUNCATE TABLE ... usuarios, clientes, refresh_tokens ... CASCADE`. Mientras
 * un solo proceso de vitest corra, `fileParallelism: false` (ver vitest.config.ts)
 * alcanza: los archivos van en fila y nadie pisa a nadie.
 *
 * Entre PROCESOS no protege nada. Dos corridas solapadas — CI lanzando back y
 * front a la vez, un `test:watch` abierto mientras alguien corre `pnpm test`,
 * dos agentes trabajando sobre el mismo checkout — y el TRUNCATE de una le
 * borra el usuario a la otra justo entre `crearUsuario()` y `login()`. El
 * síntoma es feo de leer: el login falla al guardar el refresh token con
 * `P2003` (ForeignKeyConstraintViolation, el token apunta a un usuario que
 * dejó de existir hace milisegundos), no se emite token, y todo lo que sigue
 * responde 401 donde el test esperaba 403. Parece un bug de permisos y no lo es.
 *
 * QUÉ HACE: toma un advisory lock de sesión de Postgres, derivado del nombre de
 * la base, antes de que el spec toque nada, y lo suelta al final. Extiende entre
 * procesos la misma garantía que `fileParallelism: false` da adentro de uno.
 *
 * El lock es de SESIÓN, no de transacción: vive atado a esta conexión dedicada.
 * Si el proceso se muere de golpe, Postgres cierra la conexión y suelta el lock
 * solo — no queda un turno colgado bloqueando a todos para siempre.
 */
import { Client } from 'pg';

/** Mismo default que usan los specs cuando no hay `DATABASE_URL_MASTER` en el entorno. */
export const URL_MASTER_TEST_POR_DEFECTO =
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

/** Cuánto se espera el turno antes de darlo por colgado y fallar con un mensaje legible. */
const ESPERA_MAXIMA_MS = 180_000;

/** Cada cuánto se reintenta tomar el turno mientras otro proceso lo tiene. */
const REINTENTO_MS = 100;

function resolverUrlMaster(): string {
  return process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
}

/**
 * Deriva una clave estable de 32 bits del NOMBRE de la base (FNV-1a).
 *
 * Del nombre y no de la URL entera para que dos formas de escribir la misma
 * conexión (credenciales distintas, `localhost` vs `127.0.0.1`) caigan en el
 * mismo turno. Y del nombre y no de una constante fija para que un master de
 * test distinto no quede serializado contra este sin necesidad.
 */
export function claveDeLock(urlMaster: string): number {
  const nombreBase = new URL(urlMaster).pathname.replace(/^\//, '');
  let hash = 0x811c9dc5;
  for (let i = 0; i < nombreBase.length; i += 1) {
    hash ^= nombreBase.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // `| 0` lo deja como int32 con signo, que entra sin drama en el bigint que
  // espera pg_advisory_lock.
  return hash | 0;
}

async function esperarTurno(client: Client, clave: number): Promise<void> {
  const limite = Date.now() + ESPERA_MAXIMA_MS;

  for (;;) {
    const { rows } = await client.query<{ tomado: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS tomado',
      [clave],
    );
    if (rows[0]?.tomado) return;

    if (Date.now() > limite) {
      throw new Error(
        `[lock-master-test] No se pudo tomar el turno sobre la base master de test ` +
          `en ${ESPERA_MAXIMA_MS / 1000}s. Hay otra corrida de tests usándola. ` +
          `Esperá a que termine, o matá el proceso que quedó colgado.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, REINTENTO_MS));
  }
}

/**
 * Registra el turno exclusivo para TODO el archivo de spec.
 *
 * Se llama UNA vez, en el nivel superior del archivo y ANTES del `describe`:
 * así el `beforeAll` del turno queda registrado primero y corre antes que el
 * `beforeAll` propio del spec, y su `afterAll` corre último (vitest desapila
 * los `afterAll` en orden inverso al de registro). O sea: el turno se toma
 * antes de crear nada y se suelta después de limpiar todo.
 *
 * @param urlMaster URL de la master de test. Por defecto la resuelve del entorno.
 */
export function usarLockMasterTest(urlMaster?: string): void {
  let client: Client | null = null;
  let clave: number | null = null;

  beforeAll(async () => {
    const url = urlMaster ?? resolverUrlMaster();
    clave = claveDeLock(url);
    client = new Client({ connectionString: url });
    await client.connect();
    await esperarTurno(client, clave);
  }, ESPERA_MAXIMA_MS + 20_000);

  afterAll(async () => {
    if (!client) return;
    try {
      if (clave !== null) {
        await client.query('SELECT pg_advisory_unlock($1)', [clave]);
      }
    } catch (error) {
      // No es fatal ni debe tapar el resultado de los tests: cerrar la conexión
      // (el `finally`) suelta el lock igual, porque es de sesión. Se avisa para
      // que no quede invisible si algún día pasa seguido.
      console.warn('[lock-master-test] Falló el unlock explícito, se suelta al cerrar:', error);
    } finally {
      await client.end();
      client = null;
      clave = null;
    }
  }, 30_000);
}
