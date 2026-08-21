/**
 * [INTEGRATION] `regenerar-entorno.mjs` — subcomando `verificar`.
 *
 * "Integración" acá significa: ejercita `ejecutarVerificar` de punta a
 * punta, combinando el guardarraíl de host (W1) con la comparación de
 * claves y la clasificación de origen (W2) como lo hace el CLI real — no
 * cada pieza por separado (eso ya lo cubren los `.spec.ts` unitarios de
 * `lib/`). NUNCA toca un `.env*` real ni abre una conexión: `ejecutarVerificar`
 * recibe mapas literales, igual que sus dependencias.
 *
 * NOTA DE DESVIACIÓN, cerrada en W3 (ver reporte de cierre de W2 para el
 * historial): la tarea 2.6 original hablaba de un escenario "contenedor
 * ausente simulado", pero en W2 `docker-postgres.mjs` todavía no existía —
 * `verificar` solo podía detectar claves faltantes y host remoto. Con
 * `inspeccionarContenedor` ya disponible (W3) el escenario de abajo lo
 * cierra: la spec "regeneracion-entorno-local", requirement "Verificación
 * read-only", scenario "Entorno incompleto", dice textualmente "GIVEN
 * contenedor Docker ausente ... THEN reporta la falta y termina exit≠0" —
 * no hizo falta decidir nada, la spec ya lo define.
 */
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import {
  crearPuertoPgReal,
  derivarBasesObjetivo,
  ejecutarRecrearTest,
  ejecutarRegenerar,
  ejecutarVerificar,
} from './regenerar-entorno.mjs';
import { inspeccionarContenedor } from './lib/docker-postgres.mjs';

describe('ejecutarVerificar()', () => {
  it('detecta un entorno incompleto (claves faltantes) y sale con código distinto de cero, sin crear ni modificar nada', () => {
    const envEjemplo = {
      DATABASE_URL_MASTER: 'postgresql://usuario:clave@localhost:5432/soporte_master',
      SMTP_HOST: 'cambiame.ejemplo.com',
      SMTP_PORT: 'cambiame',
    };
    // Falta SMTP_PORT por completo: entorno incompleto.
    const envArchivo = {
      DATABASE_URL_MASTER: 'postgresql://real:real@localhost:5432/soporte_master',
      SMTP_HOST: 'smtp.real.com',
    };
    const envProceso = {};

    const resultado = ejecutarVerificar({ envEjemplo, envArchivo, envProceso });

    expect(resultado.exitCode).not.toBe(0);
    expect(resultado.lineas.join('\n')).toContain('SMTP_PORT');

    // "No crea ni modifica nada": la función es pura por construcción — recibe
    // mapas y devuelve strings, sin fs ni red. Se confirma corriéndola dos
    // veces con la misma entrada: si mutara algo (los mapas, un archivo, una
    // conexión) el segundo resultado divergiría del primero.
    const segundaCorrida = ejecutarVerificar({ envEjemplo, envArchivo, envProceso });
    expect(segundaCorrida).toEqual(resultado);
  });

  it('placeholder sin completar (SMTP_HOST quedó igual a .env.example) también cuenta como entorno incompleto', () => {
    const resultado = ejecutarVerificar({
      envEjemplo: { SMTP_HOST: 'cambiame.ejemplo.com' },
      envArchivo: { SMTP_HOST: 'cambiame.ejemplo.com' },
      envProceso: {},
    });

    expect(resultado.exitCode).not.toBe(0);
    expect(resultado.lineas.join('\n')).toContain('SMTP_HOST');
  });

  it('host remoto en una URL de BD aborta con exit ≠ 0, aunque las claves estén todas presentes', () => {
    const resultado = ejecutarVerificar({
      envEjemplo: { DATABASE_URL_MASTER: 'postgresql://u:p@localhost:5432/x' },
      envArchivo: {},
      envProceso: { DATABASE_URL_MASTER: 'postgresql://u:p@10.0.0.5:5432/x' },
    });

    expect(resultado.exitCode).not.toBe(0);
    expect(resultado.lineas.join('\n')).toContain('10.0.0.5');
  });

  it('entorno completo y local: exit 0, y el reporte nunca contiene valores de clave', () => {
    const VALOR_SECRETO = 'clave-super-secreta-no-imprimir';
    const resultado = ejecutarVerificar({
      envEjemplo: { SMTP_HOST: 'cambiame.ejemplo.com', SMTP_PASSWORD: 'cambiame' },
      envArchivo: {},
      envProceso: { SMTP_HOST: 'smtp.real.com', SMTP_PASSWORD: VALOR_SECRETO },
    });

    expect(resultado.exitCode).toBe(0);
    expect(resultado.lineas.join('\n')).not.toContain(VALOR_SECRETO);
  });

  // REGRESIÓN: bug real encontrado en verificación manual (`pnpm entorno:verificar`
  // corrido de verdad, no solo los tests). `envProceso` es TODO el entorno del
  // proceso Node — PATH, TEMP, USERNAME, npm_*, decenas de claves del sistema
  // operativo ajenas a este proyecto. "extras" se calculaba antes contra el
  // entorno EFECTIVO (envArchivo + envProceso), así que cada una de esas claves
  // del sistema caía en "extra" y el reporte real quedaba inundado de ruido.
  //
  // A propósito mira `lineas` (la salida que ve la persona), no la estructura
  // interna de `compararClaves`: un test contra ese objeto con mapas chicos,
  // como los de arriba, sigue verde con el bug — ninguno de ellos tiene una
  // clave de sistema en el `envProceso` literal. Este test la incluye a
  // propósito para morder donde los otros no llegan.
  it('[CRITICAL] las claves de entorno del SISTEMA OPERATIVO (PATH, TEMP, etc.) nunca aparecen en el reporte', () => {
    const resultado = ejecutarVerificar({
      envEjemplo: { SMTP_HOST: 'cambiame.ejemplo.com' },
      envArchivo: { SMTP_HOST: 'smtp.real.com' },
      envProceso: {
        SMTP_HOST: 'smtp.real.com',
        PATH: 'C:\\Windows\\System32;C:\\Windows',
        TEMP: 'C:\\Users\\alguien\\AppData\\Local\\Temp',
        USERNAME: 'alguien',
        npm_config_user_agent: 'pnpm/9.0.0 node/v22.0.0 win32 x64',
      },
    });

    const reporte = resultado.lineas.join('\n');
    expect(reporte).not.toContain('PATH');
    expect(reporte).not.toContain('TEMP');
    expect(reporte).not.toContain('USERNAME');
    expect(reporte).not.toContain('npm_config_user_agent');
  });

  // Cierra la tarea 2.6 original ("contenedor ausente simulado"), pendiente
  // desde W2 porque `docker-postgres.mjs` no existía todavía. INTEGRACIÓN
  // real entre W1/W3: `inspeccionarContenedor` corre con un `execFileSyncFn`
  // inyectado como fake que simula "docker inspect" saliendo con código ≠ 0
  // y stdout "[]" (el contenedor no existe) — el mismo contrato de error que
  // usa `docker-postgres.spec.ts` — y el resultado se alimenta a
  // `ejecutarVerificar` tal como lo hace `main()` en el CLI real.
  it('contenedor Docker ausente: ejecutarVerificar reporta la falta y sale con exit != 0', () => {
    const execFileSyncFn = vi.fn(() => {
      const error = new Error('Command failed: docker inspect (status 1)');
      Object.assign(error, { status: 1, stdout: '[]\n', stderr: '' });
      throw error;
    });

    const estadoContenedor = inspeccionarContenedor({
      nombreContenedor: 'soporte-postgres-master',
      execFileSyncFn,
    });
    expect(estadoContenedor).toEqual({ estado: 'ausente', imagen: null });

    const resultado = ejecutarVerificar({
      envEjemplo: {},
      envArchivo: {},
      envProceso: {},
      estadoContenedor,
    });

    expect(resultado.exitCode).not.toBe(0);
    const salida = resultado.lineas.join('\n');
    expect(salida).toContain('AUSENTE');
    // El mensaje NO debe prometer que --confirmar crea el contenedor: no lo
    // crea, corta con exit 1. Un mensaje que manda a correr un comando que no
    // hace lo que dice deja al usuario girando en falso.
    expect(salida).not.toContain('para crearlo');
    expect(salida).toContain('NO lo crea');
    // Y debe traer el remedio que SI funciona, listo para copiar y pegar.
    expect(salida).toContain('docker run -d --name soporte-postgres-master');
    // Read-only de punta a punta: la única llamada a "Docker" fue el
    // `docker inspect` de solo lectura — nada de crear/arrancar/parar.
    expect(execFileSyncFn).toHaveBeenCalledTimes(1);
    expect(execFileSyncFn).toHaveBeenCalledWith(
      'docker',
      ['inspect', 'soporte-postgres-master'],
      expect.anything(),
    );
  });
});

/**
 * [INTEGRATION][W4] `ejecutarRegenerar()` — dry-run y `--confirmar` contra
 * Postgres REAL, sobre bases físicas efímeras con prefijo `soporte_regen_` y
 * sufijo `_test`, nunca contra `soporte_master`/`soporte_master_test`/
 * `soporte_tenant_test`/`soporte_019f...` reales.
 *
 * `puertoPg` (crear/consultar bases reales) y `execFileSyncFn` (subprocesos
 * REALES de `prisma migrate deploy/status`) SÍ son los de producción: crear
 * una base y migrarla es una operación segura y acotada a los nombres
 * efímeros que este archivo genera y borra. `ejecutarSeed`, en cambio, va
 * SIEMPRE inyectado con un fake — ver la nota de desviación en el reporte de
 * cierre de W4: `seed:demo` real (`prisma_master/seeds/demo-seed.ts` vía
 * `ts-node`, sin override de `dbNameGenerator` desde el CLI) crea una DB de
 * TENANT física con un nombre que NO termina en `_test`
 * (`CrearClienteUseCase.deriveDbName`), así que jamás puede invocarse de
 * verdad contra una base efímera de test: dejaría una base huérfana fuera
 * de la convención de seguridad de este archivo. El fake sí ejecuta
 * escrituras REALES y mínimas contra las tablas `usuarios`/`clientes` de la
 * base efímera — imita exactamente el contrato de idempotencia de cada seed
 * (columnas NOT NULL sin default incluidas, ver `sync-ayuda.js`) sin
 * levantar el árbol de dependencias completo de Nest.
 */
/**
 * Compartido entre W4 y W5 (ambas describes de abajo trabajan contra
 * Postgres real, con el mismo patrón `soporte_regen_<hex>_<etiqueta>_test`):
 * levantado a nivel de módulo para no duplicarlo — DRY, mismo criterio que
 * el resto del proyecto.
 */
const MASTER_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

/** SIEMPRE `soporte_regen_<hex>_<etiqueta>_test` — nunca un nombre real. */
function nombreEfimero(etiqueta: string): string {
  return `soporte_regen_${randomBytes(4).toString('hex')}_${etiqueta}_test`;
}

const PATRON_EFIMERO_SEGURO = /^soporte_regen_[a-z0-9]+_[a-z]+_test$/;

/** DROP solo si el nombre matchea el patrón efímero — rechaza cualquier otra cosa antes de tocar Postgres. */
async function dropSiEsEfimera(nombreDb: string): Promise<void> {
  if (!PATRON_EFIMERO_SEGURO.test(nombreDb)) {
    throw new Error(
      `[test] rechazo por seguridad: "${nombreDb}" no matchea el patrón de bases efímeras`,
    );
  }
  const admin = new URL(MASTER_URL);
  admin.pathname = '/postgres';
  const pool = new Pool({ connectionString: admin.toString(), connectionTimeoutMillis: 5000 });
  try {
    await pool.query(`DROP DATABASE IF EXISTS "${nombreDb}"`);
  } finally {
    await pool.end();
  }
}

function urlDe(nombreDb: string): string {
  const u = new URL(MASTER_URL);
  u.pathname = '/' + nombreDb;
  return u.toString();
}

async function contarFilas(urlDb: string, tabla: string): Promise<number> {
  const pool = new Pool({ connectionString: urlDb, connectionTimeoutMillis: 5000 });
  try {
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${tabla}`);
    return rows[0].n as number;
  } finally {
    await pool.end();
  }
}

async function existenBases(nombres: string[]): Promise<boolean[]> {
  const puertoPg = crearPuertoPgReal();
  const bases = derivarBasesObjetivo(MASTER_URL, nombres);
  return Promise.all(bases.map((b) => puertoPg.baseExiste(b.url)));
}

describe('ejecutarRegenerar() (W4, integración — Postgres real)', () => {
  const ROOT_ADMIN_EMAIL = 'root-regen-w4@example.com';
  const NOMBRE_CLIENTE_DEMO = 'Demo Soporte W4 Test';

  /**
   * Fake de `ejecutarSeed`: registra el ORDEN de invocación en `llamadas` y,
   * opcionalmente, ejecuta la escritura real mínima de `seed:root`/
   * `seed:demo` (nunca la de `seed:demo` REAL — ver JSDoc del describe).
   */
  function crearEjecutorSeedFake(
    llamadas: string[],
    opciones: { insertarRoot?: boolean; insertarDemo?: boolean } = {},
  ) {
    return async (paso: 'seed:root' | 'seed:demo' | 'sync:ayuda', ctx: { urlMaster: string }) => {
      llamadas.push(paso);
      if (paso === 'seed:root' && opciones.insertarRoot) {
        const pool = new Pool({ connectionString: ctx.urlMaster, connectionTimeoutMillis: 5000 });
        try {
          await pool.query(
            'INSERT INTO usuarios (email, nombre, apellido, password_hash, activo, is_global_admin, updated_at) ' +
              "VALUES ($1, 'Root', 'DeTest', 'hash-fake-de-test', true, true, now()) " +
              'ON CONFLICT (email) DO NOTHING',
            [ROOT_ADMIN_EMAIL],
          );
        } finally {
          await pool.end();
        }
      }
      if (paso === 'seed:demo' && opciones.insertarDemo) {
        const pool = new Pool({ connectionString: ctx.urlMaster, connectionTimeoutMillis: 5000 });
        try {
          const dbNameFake = `soporte_regen_${randomBytes(4).toString('hex')}_demofake_test`;
          await pool.query(
            'INSERT INTO clientes (nombre, db_name, updated_at) VALUES ($1, $2, now()) ON CONFLICT (db_name) DO NOTHING',
            [NOMBRE_CLIENTE_DEMO, dbNameFake],
          );
        } finally {
          await pool.end();
        }
      }
      // sync:ayuda: no necesita escritura para lo que testea este archivo —
      // su propia idempotencia la cubre sync-ayuda.js/el script real.
    };
  }

  let estadoContenedor: Awaited<ReturnType<typeof inspeccionarContenedor>>;
  const nombresCreadosEnEsteArchivo: string[] = [];

  beforeAll(() => {
    estadoContenedor = inspeccionarContenedor({
      nombreContenedor: 'soporte-postgres-master',
      execFileSyncFn: execFileSync,
    });
  });

  afterEach(async () => {
    // Limpieza defensiva: DROP de TODO lo que este archivo pudo haber
    // creado, incluso si un `expect` cortó el test a mitad de camino.
    // Orden (SEGURIDAD del prompt de W4): acá no hay pools de larga vida
    // que cerrar antes — cada operación de este archivo abre y cierra su
    // propio `Pool` inmediatamente — así que DROP directo es seguro.
    while (nombresCreadosEnEsteArchivo.length > 0) {
      const nombre = nombresCreadosEnEsteArchivo.pop()!;
      await dropSiEsEfimera(nombre);
    }
  });

  it('[4.1][RED→GREEN] sin --confirmar: el estado de bases/migraciones/seeds queda IDÉNTICO antes y después', async () => {
    const nombres = [
      nombreEfimero('master'),
      nombreEfimero('mastertest'),
      nombreEfimero('tenanttest'),
    ];
    nombresCreadosEnEsteArchivo.push(...nombres);

    // Setup: deja el entorno "ya regenerado" (bases creadas, migradas,
    // sembradas) para que el dry-run tenga algo real que inspeccionar.
    const llamadasSetup: string[] = [];
    const setup = await ejecutarRegenerar({
      confirmar: true,
      envEjemplo: {},
      envArchivo: {},
      envProceso: { DATABASE_URL_MASTER: MASTER_URL },
      estadoContenedor,
      nombresBases: nombres,
      rootAdminEmail: ROOT_ADMIN_EMAIL,
      nombreClienteDemo: NOMBRE_CLIENTE_DEMO,
      puertoPg: crearPuertoPgReal(),
      execFileSyncFn: execFileSync,
      ejecutarSeed: crearEjecutorSeedFake(llamadasSetup, {
        insertarRoot: true,
        insertarDemo: true,
      }),
    });
    expect(setup.exitCode).toBe(0);

    const urlMaster = urlDe(nombres[0]);
    const fotoAntes = {
      bases: await existenBases(nombres),
      usuarios: await contarFilas(urlMaster, 'usuarios'),
      clientes: await contarFilas(urlMaster, 'clientes'),
    };

    const llamadasDryRun: string[] = [];
    const dryRun = await ejecutarRegenerar({
      confirmar: false,
      envEjemplo: {},
      envArchivo: {},
      envProceso: { DATABASE_URL_MASTER: MASTER_URL },
      estadoContenedor,
      nombresBases: nombres,
      rootAdminEmail: ROOT_ADMIN_EMAIL,
      nombreClienteDemo: NOMBRE_CLIENTE_DEMO,
      puertoPg: crearPuertoPgReal(),
      execFileSyncFn: execFileSync,
      // Si el dry-run alguna vez llamara a `ejecutarSeed` sería un bug de
      // mutación — este fake explota para que ese bug se vea como test rojo.
      ejecutarSeed: async () => {
        throw new Error('[4.1] ejecutarSeed NO debe invocarse en dry-run');
      },
    });

    const fotoDespues = {
      bases: await existenBases(nombres),
      usuarios: await contarFilas(urlMaster, 'usuarios'),
      clientes: await contarFilas(urlMaster, 'clientes'),
    };

    // La prueba de igualdad es contra el estado REAL de Postgres, no contra
    // una suposición: si el dry-run mutara algo, `fotoDespues` divergiría.
    expect(fotoDespues).toEqual(fotoAntes);
    expect(llamadasDryRun).toEqual([]);
    expect(dryRun.exitCode).toBe(0);
    expect(dryRun.lineas.join('\n')).toContain('DRY-RUN: no se mutó nada');
  }, 60_000);

  it('[4.3][RED→GREEN] --confirmar: crea las bases faltantes, migra x3 y siembra en orden seed:root → seed:demo → sync:ayuda', async () => {
    const nombres = [
      nombreEfimero('master'),
      nombreEfimero('mastertest'),
      nombreEfimero('tenanttest'),
    ];
    nombresCreadosEnEsteArchivo.push(...nombres);

    expect(await existenBases(nombres)).toEqual([false, false, false]);

    const llamadas: string[] = [];
    const resultado = await ejecutarRegenerar({
      confirmar: true,
      envEjemplo: {},
      envArchivo: {},
      envProceso: { DATABASE_URL_MASTER: MASTER_URL },
      estadoContenedor,
      nombresBases: nombres,
      rootAdminEmail: ROOT_ADMIN_EMAIL,
      nombreClienteDemo: NOMBRE_CLIENTE_DEMO,
      puertoPg: crearPuertoPgReal(),
      execFileSyncFn: execFileSync,
      ejecutarSeed: crearEjecutorSeedFake(llamadas, { insertarRoot: true, insertarDemo: true }),
    });

    expect(resultado.exitCode).toBe(0);
    expect(await existenBases(nombres)).toEqual([true, true, true]);
    // ORDEN exacto — no solo "que se hayan llamado los tres".
    expect(llamadas).toEqual(['seed:root', 'seed:demo', 'sync:ayuda']);

    const urlMaster = urlDe(nombres[0]);
    await expect(contarFilas(urlMaster, 'usuarios')).resolves.toBeGreaterThan(0);
    await expect(contarFilas(urlMaster, 'clientes')).resolves.toBeGreaterThan(0);
  }, 60_000);

  it('[4.5][RED→GREEN] --confirmar dos veces seguidas: la segunda reporta "nada que hacer", exit 0, sin duplicar ni fallar', async () => {
    const nombres = [
      nombreEfimero('master'),
      nombreEfimero('mastertest'),
      nombreEfimero('tenanttest'),
    ];
    nombresCreadosEnEsteArchivo.push(...nombres);

    const llamadas1: string[] = [];
    const primera = await ejecutarRegenerar({
      confirmar: true,
      envEjemplo: {},
      envArchivo: {},
      envProceso: { DATABASE_URL_MASTER: MASTER_URL },
      estadoContenedor,
      nombresBases: nombres,
      rootAdminEmail: ROOT_ADMIN_EMAIL,
      nombreClienteDemo: NOMBRE_CLIENTE_DEMO,
      puertoPg: crearPuertoPgReal(),
      execFileSyncFn: execFileSync,
      ejecutarSeed: crearEjecutorSeedFake(llamadas1, { insertarRoot: true, insertarDemo: true }),
    });
    expect(primera.exitCode).toBe(0);
    expect(llamadas1).toEqual(['seed:root', 'seed:demo', 'sync:ayuda']);

    const urlMaster = urlDe(nombres[0]);
    const usuariosTrasPrimera = await contarFilas(urlMaster, 'usuarios');
    const clientesTrasPrimera = await contarFilas(urlMaster, 'clientes');

    const llamadas2: string[] = [];
    const segunda = await ejecutarRegenerar({
      confirmar: true,
      envEjemplo: {},
      envArchivo: {},
      envProceso: { DATABASE_URL_MASTER: MASTER_URL },
      estadoContenedor,
      nombresBases: nombres,
      rootAdminEmail: ROOT_ADMIN_EMAIL,
      nombreClienteDemo: NOMBRE_CLIENTE_DEMO,
      puertoPg: crearPuertoPgReal(),
      execFileSyncFn: execFileSync,
      // Root y demo YA existen: si el orquestador los re-insertara, esto
      // fallaría por violar el ON CONFLICT DO NOTHING solo si hubiera un
      // bug real de duplicado — acá lo relevante es que NO se invoquen.
      ejecutarSeed: crearEjecutorSeedFake(llamadas2, { insertarRoot: true, insertarDemo: true }),
    });

    expect(segunda.exitCode).toBe(0);
    expect(segunda.lineas.join('\n')).toContain('Nada que hacer');
    // seed:root y seed:demo NO se re-invocan (ya existen); sync:ayuda SIEMPRE
    // corre (es idempotente internamente, D5) — esto es lo que prueba que la
    // segunda corrida "no hizo nada" de verdad, no solo que salió exit 0.
    expect(llamadas2).toEqual(['sync:ayuda']);

    // Sin duplicar: mismo conteo de filas tras la segunda corrida.
    expect(await contarFilas(urlMaster, 'usuarios')).toBe(usuariosTrasPrimera);
    expect(await contarFilas(urlMaster, 'clientes')).toBe(clientesTrasPrimera);
  }, 90_000);

  it('[4.6][RED→GREEN] seed:root con el usuario inactivo: se salta ESE paso, reporta el remedio, el resto continúa, exit 2 (no 1)', async () => {
    const nombres = [
      nombreEfimero('master'),
      nombreEfimero('mastertest'),
      nombreEfimero('tenanttest'),
    ];
    nombresCreadosEnEsteArchivo.push(...nombres);

    // Primera corrida: crea el root ACTIVO, pero sin sembrar el demo — así
    // la segunda corrida todavía tiene seed:demo pendiente y puede probar
    // que "el resto continúa" de verdad, no solo que no explota.
    const llamadas1: string[] = [];
    const primera = await ejecutarRegenerar({
      confirmar: true,
      envEjemplo: {},
      envArchivo: {},
      envProceso: { DATABASE_URL_MASTER: MASTER_URL },
      estadoContenedor,
      nombresBases: nombres,
      rootAdminEmail: ROOT_ADMIN_EMAIL,
      nombreClienteDemo: NOMBRE_CLIENTE_DEMO,
      puertoPg: crearPuertoPgReal(),
      execFileSyncFn: execFileSync,
      ejecutarSeed: crearEjecutorSeedFake(llamadas1, { insertarRoot: true, insertarDemo: false }),
    });
    expect(primera.exitCode).toBe(0);

    // Inactiva la cuenta a mano — mismo estado que dejaría una baja real.
    const urlMaster = urlDe(nombres[0]);
    const pool = new Pool({ connectionString: urlMaster, connectionTimeoutMillis: 5000 });
    try {
      await pool.query('UPDATE usuarios SET activo = false WHERE email = $1', [ROOT_ADMIN_EMAIL]);
    } finally {
      await pool.end();
    }

    const llamadas2: string[] = [];
    const segunda = await ejecutarRegenerar({
      confirmar: true,
      envEjemplo: {},
      envArchivo: {},
      envProceso: { DATABASE_URL_MASTER: MASTER_URL },
      estadoContenedor,
      nombresBases: nombres,
      rootAdminEmail: ROOT_ADMIN_EMAIL,
      nombreClienteDemo: NOMBRE_CLIENTE_DEMO,
      puertoPg: crearPuertoPgReal(),
      execFileSyncFn: execFileSync,
      ejecutarSeed: crearEjecutorSeedFake(llamadas2, { insertarRoot: true, insertarDemo: true }),
    });

    // Exit 2, NO 1: no es una falla dura.
    expect(segunda.exitCode).toBe(2);
    const reporte = segunda.lineas.join('\n');
    expect(reporte).toContain('SALTEADO');
    expect(reporte).toContain(ROOT_ADMIN_EMAIL);
    // El remedio textual, concreto y accionable — no solo "hay un problema".
    expect(reporte.toLowerCase()).toContain('reactivar');
    expect(reporte).toContain('--confirmar');

    // El RESTO continúa: seed:demo (pendiente desde la primera corrida) y
    // sync:ayuda SÍ se invocan — seed:root es el ÚNICO que se salta.
    expect(llamadas2).toEqual(['seed:demo', 'sync:ayuda']);

    // seed:root sigue en el mismo estado que dejó la primera corrida: no se
    // tocó ni se duplicó nada por el intento salteado.
    expect(await contarFilas(urlMaster, 'usuarios')).toBe(1);
  }, 90_000);
});

/**
 * [INTEGRATION][W5] `ejecutarRecrearTest()` — SOLO contra bases físicas
 * efímeras (`soporte_regen_<hex>_<etiqueta>_test`), nunca contra
 * `soporte_master_test`/`soporte_tenant_test` reales: aunque el validador
 * las acepta a propósito (son el objetivo declarado de `--recrear-test`,
 * ver JSDoc de `validarNombreBaseDestructible`), este archivo nunca les
 * pasa esos nombres — siempre `nombresBases` efímero, mismo mecanismo que
 * el describe de W4 de arriba.
 */
describe('ejecutarRecrearTest() (W5, integración — Postgres real)', () => {
  const nombresCreados: string[] = [];
  let estadoContenedor: Awaited<ReturnType<typeof inspeccionarContenedor>>;

  beforeAll(() => {
    estadoContenedor = inspeccionarContenedor({
      nombreContenedor: 'soporte-postgres-master',
      execFileSyncFn: execFileSync,
    });
  });

  afterEach(async () => {
    while (nombresCreados.length > 0) {
      const nombre = nombresCreados.pop()!;
      await dropSiEsEfimera(nombre);
    }
  });

  async function contarTablas(urlDb: string): Promise<number> {
    const pool = new Pool({ connectionString: urlDb, connectionTimeoutMillis: 5000 });
    try {
      const { rows } = await pool.query(
        "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'",
      );
      return rows[0].n as number;
    } finally {
      await pool.end();
    }
  }

  it('[5.3][RED→GREEN] --confirmar: dropea y recrea SOLO las bases _test — el rastro previo desaparece de verdad', async () => {
    const nombres = [nombreEfimero('recreara'), nombreEfimero('recrearb')];
    nombresCreados.push(...nombres);
    const puertoPg = crearPuertoPgReal();
    const bases = derivarBasesObjetivo(MASTER_URL, nombres);
    for (const base of bases) await puertoPg.crearBase(base.url);

    // Rastro previo en la primera base: si `--recrear-test` no dropeara de
    // verdad (fuera un no-op disfrazado de éxito), esta tabla seguiría ahí.
    const poolMarca = new Pool({ connectionString: bases[0].url, connectionTimeoutMillis: 5000 });
    try {
      await poolMarca.query('CREATE TABLE marca_previa (id int)');
    } finally {
      await poolMarca.end();
    }
    expect(await contarTablas(bases[0].url)).toBe(1);

    const resultado = await ejecutarRecrearTest({
      envArchivo: {},
      envProceso: { DATABASE_URL_MASTER: MASTER_URL },
      estadoContenedor,
      nombresBases: nombres,
      confirmar: true,
      puertoPg,
    });

    expect(resultado.exitCode).toBe(0);
    expect(await existenBases(nombres)).toEqual([true, true]);
    expect(await contarTablas(bases[0].url)).toBe(0);
  }, 60_000);

  it('[5.3][RED→GREEN] rechaza un nombre sin sufijo _test SIN tocar ninguna base — todo o nada', async () => {
    const nombreValido = nombreEfimero('valido');
    const nombreInvalido = `soporte_regen_${randomBytes(4).toString('hex')}_sinsufijo`;
    nombresCreados.push(nombreValido);
    const puertoPg = crearPuertoPgReal();
    const baseValida = derivarBasesObjetivo(MASTER_URL, [nombreValido])[0];
    await puertoPg.crearBase(baseValida.url);

    const resultado = await ejecutarRecrearTest({
      envArchivo: {},
      envProceso: { DATABASE_URL_MASTER: MASTER_URL },
      estadoContenedor,
      nombresBases: [nombreValido, nombreInvalido],
      confirmar: true,
      puertoPg,
    });

    expect(resultado.exitCode).toBe(1);
    expect(resultado.lineas.join('\n')).toContain(nombreInvalido);
    // La base VÁLIDA tampoco se tocó — la validación es todo o nada, ANTES
    // de dropear la primera de la lista.
    expect(await existenBases([nombreValido])).toEqual([true]);
  }, 30_000);

  it('[5.3][RED→GREEN] rechaza host remoto ANTES de conectar (reusa asegurarHostLocal) — ninguna conexión real', async () => {
    const puertoPgEspia = {
      baseExiste: vi.fn(),
      crearBase: vi.fn(),
      dropBase: vi.fn(),
      consultarUsuarioRoot: vi.fn(),
      consultarClienteDemo: vi.fn(),
    };

    const resultado = await ejecutarRecrearTest({
      envArchivo: {},
      envProceso: { DATABASE_URL_MASTER: 'postgresql://u:p@10.0.0.5:5432/soporte_master_test' },
      estadoContenedor,
      nombresBases: ['soporte_master_test', 'soporte_tenant_test'],
      confirmar: true,
      puertoPg: puertoPgEspia,
    });

    expect(resultado.exitCode).toBe(1);
    expect(resultado.lineas.join('\n')).toContain('10.0.0.5');
    expect(puertoPgEspia.dropBase).not.toHaveBeenCalled();
    expect(puertoPgEspia.crearBase).not.toHaveBeenCalled();
  });
});
