// Inspección de contenedor Docker y readiness de Postgres, para
// `regenerar-entorno.mjs`.
//
// Ref spec: sdd/regeneracion-reproducible, spec "regeneracion-entorno-local".
// Ref design: sdd/regeneracion-reproducible D4 (readiness), matriz de
// amenazas — frontera "Subprocesos".
//
// PURO por construcción, igual que guardarrail-host.mjs y entorno-claves.mjs:
// `execFileSyncFn` (para `docker inspect`) y `crearCliente`/`dormir`/`ahora`
// (para el readiness de Postgres) SIEMPRE se reciben por parámetro. Este
// módulo nunca ejecuta Docker real ni abre un socket por su cuenta — eso lo
// hace el adaptador (`main()` de `regenerar-entorno.mjs`), que es quien
// inyecta las implementaciones reales.
//
// `docker inspect` es de solo lectura y está permitido acá. Crear, arrancar
// o parar contenedores NO — eso es W4/W5.
import { Client } from 'pg';

/** Nombre de contenedor seguro: arranca alfanumérico, sigue con al menos un carácter más de `[a-zA-Z0-9_.-]`. */
const PATRON_NOMBRE_CONTENEDOR = /^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/;

const PUERTO_MIN = 1024;
const PUERTO_MAX = 65535;

const IMAGEN_POR_DEFECTO = 'postgres:16';

const DEADLINE_MS_POR_DEFECTO = 90_000;
const BACKOFF_INICIAL_MS = 500;
const BACKOFF_FACTOR = 1.5;
const BACKOFF_MAX_MS = 2_000;

/**
 * SQLSTATE de credenciales inválidas. Lista CERRADA y deliberadamente corta
 * (D4): reintentar esto 90 segundos es exactamente lo que hace creer que
 * "Docker tarda en levantar" cuando el problema real es la contraseña.
 * Cualquier código NO listado acá se trata como reintentable por defecto.
 */
const CODIGOS_FATALES = new Set(['28P01', '28000']);

/** Nombre de contenedor rechazado antes de tocar Docker. */
export class ErrorNombreContenedorInvalido extends Error {
  /** @param {unknown} nombre */
  constructor(nombre) {
    super(
      `Nombre de contenedor inválido, se rechaza SIN ejecutar Docker: ${JSON.stringify(nombre)}. ` +
        `Debe matchear ${PATRON_NOMBRE_CONTENEDOR}.`,
    );
    this.name = 'ErrorNombreContenedorInvalido';
    this.nombre = nombre;
  }
}

/** Puerto rechazado antes de usarlo. */
export class ErrorPuertoInvalido extends Error {
  /** @param {unknown} puerto */
  constructor(puerto) {
    super(
      `Puerto inválido (debe ser un entero entre ${PUERTO_MIN} y ${PUERTO_MAX}): ${JSON.stringify(puerto)}.`,
    );
    this.name = 'ErrorPuertoInvalido';
    this.puerto = puerto;
  }
}

/** Postgres no quedó listo dentro del deadline, o cortó por un error fatal. */
export class ErrorPostgresNoListo extends Error {
  /**
   * @param {string} mensaje
   * @param {unknown} [causa]
   */
  constructor(mensaje, causa) {
    super(mensaje);
    this.name = 'ErrorPostgresNoListo';
    if (causa !== undefined) this.cause = causa;
  }
}

/**
 * ¿`nombre` es un identificador seguro de contenedor? Rechaza CUALQUIER
 * cosa que no matchee el patrón — no intenta "sanear", solo acepta o
 * rechaza. Esta es la única defensa que importa contra inyección de
 * argumentos hacia `execFileSync` (ver matriz de amenazas, frontera
 * "Subprocesos"): un nombre que no pasa acá nunca llega a un subproceso.
 * @param {unknown} nombre
 * @returns {boolean}
 */
export function validarNombreContenedor(nombre) {
  return typeof nombre === 'string' && PATRON_NOMBRE_CONTENEDOR.test(nombre);
}

/**
 * ¿`puerto` es un entero dentro del rango de puertos no privilegiados
 * (1024-65535)?
 * @param {unknown} puerto
 * @returns {boolean}
 */
export function validarPuerto(puerto) {
  const numero = Number(puerto);
  return Number.isInteger(numero) && numero >= PUERTO_MIN && numero <= PUERTO_MAX;
}

/**
 * Inspecciona un contenedor Docker por nombre, en sus cuatro estados
 * posibles. NUNCA ejecuta `execFileSyncFn` si el nombre no pasa
 * `validarNombreContenedor` primero — esa es la propiedad de seguridad que
 * prueba la tarea 3.3 con un spy que jamás se invoca.
 *
 * @param {{
 *   nombreContenedor: string,
 *   imagenEsperada?: string,
 *   execFileSyncFn: (comando: string, argumentos: string[], opciones: Record<string, unknown>) => string,
 * }} entrada
 * @returns {{estado: 'corriendo' | 'parado' | 'ausente' | 'otra-imagen', imagen: string | null}}
 */
export function inspeccionarContenedor({
  nombreContenedor,
  imagenEsperada = IMAGEN_POR_DEFECTO,
  execFileSyncFn,
}) {
  if (!validarNombreContenedor(nombreContenedor)) {
    throw new ErrorNombreContenedorInvalido(nombreContenedor);
  }

  let salida;
  try {
    salida = execFileSyncFn('docker', ['inspect', nombreContenedor], { encoding: 'utf8' });
  } catch (error) {
    if (esContenedorAusente(error)) {
      return { estado: 'ausente', imagen: null };
    }
    // Cualquier otro fallo (Docker Desktop apagado, permisos, etc.) no es
    // "ausente": se propaga tal cual para que el llamador lo reporte
    // como lo que es, no como un contenedor inexistente.
    throw error;
  }

  const datos = JSON.parse(salida);
  const contenedor = datos[0];
  const imagen = contenedor?.Config?.Image ?? null;
  const corriendo = contenedor?.State?.Running === true;

  if (imagenEsperada && imagen !== imagenEsperada) {
    // Existe, pero con otra imagen: podría tener datos de otro propósito.
    // No se recrea automáticamente — el llamador decide (D5).
    return { estado: 'otra-imagen', imagen };
  }
  return { estado: corriendo ? 'corriendo' : 'parado', imagen };
}

/**
 * ¿El error de `execFileSyncFn` corresponde a "el contenedor no existe"?
 * `docker inspect` sale con código ≠ 0 y stdout `"[]\n"` cuando el nombre
 * no matchea ningún objeto — a diferencia de, por ejemplo, el daemon
 * apagado, que no produce ese stdout.
 * @param {{stdout?: string | Buffer}} error
 * @returns {boolean}
 */
function esContenedorAusente(error) {
  const salida = typeof error.stdout === 'string' ? error.stdout : error.stdout?.toString('utf8');
  if (!salida) return false;
  try {
    const parseado = JSON.parse(salida);
    return Array.isArray(parseado) && parseado.length === 0;
  } catch {
    return false;
  }
}

/**
 * Clasifica un error de conexión a Postgres. La lista de códigos FATALES es
 * cerrada (`28P01`/`28000`, credenciales); todo lo demás — incluido un
 * código desconocido — se trata como reintentable por defecto, porque la
 * lista de errores transitorios que puede tirar un contenedor arrancando no
 * está cerrada y fallar closed ahí generaría cortes falsos.
 * @param {{code?: unknown}} error
 * @returns {'reintentable' | 'fatal'}
 */
export function clasificarErrorPostgres(error) {
  const codigo = error?.code;
  if (typeof codigo === 'string' && CODIGOS_FATALES.has(codigo)) return 'fatal';
  return 'reintentable';
}

/**
 * Espera a que Postgres acepte conexiones, con deadline y backoff — nunca
 * con un `sleep` fijo. Reintenta ante errores transitorios (`ECONNREFUSED`,
 * `ECONNRESET`, `ETIMEDOUT`, `57P03` = el contenedor está arrancando —
 * ver `clasificarErrorPostgres`) y corta en el PRIMER intento ante un error
 * fatal (credenciales inválidas, `28P01`/`28000`): reintentar eso no lo
 * arregla nunca.
 *
 * `crearCliente`, `dormir` y `ahora` son inyectables a propósito — así los
 * tests ejercitan el deadline de 90s y el backoff sin esperar de verdad
 * (ver design D4 y la advertencia de la tarea 3.1: un test que duerme en
 * serio es un test que alguien va a borrar).
 *
 * @param {{
 *   urlAdmin?: string,
 *   timeoutMs?: number,
 *   crearCliente?: () => {connect: () => Promise<void>, query: (sql: string) => Promise<unknown>, end: () => Promise<void>},
 *   dormir?: (ms: number) => Promise<void>,
 *   ahora?: () => number,
 * }} entrada
 * @returns {Promise<{listo: true, intentos: number}>}
 * @throws {ErrorPostgresNoListo}
 */
export async function esperarPostgresListo({
  urlAdmin,
  timeoutMs = DEADLINE_MS_POR_DEFECTO,
  crearCliente = () => new Client({ connectionString: urlAdmin, connectionTimeoutMillis: 3000 }),
  dormir = dormirReal,
  ahora = Date.now,
}) {
  const deadline = ahora() + timeoutMs;
  let backoffMs = BACKOFF_INICIAL_MS;
  let ultimoError;
  let intentos = 0;

  while (ahora() < deadline) {
    intentos += 1;
    const cliente = crearCliente();
    try {
      await cliente.connect();
      await cliente.query('SELECT 1');
      await cerrarSinFallar(cliente);
      return { listo: true, intentos };
    } catch (error) {
      ultimoError = error;
      await cerrarSinFallar(cliente);

      if (clasificarErrorPostgres(error) === 'fatal') {
        throw new ErrorPostgresNoListo(
          `Postgres rechazó la conexión de forma FATAL (credenciales) en el intento ${intentos} — no se reintenta: ${error.message}`,
          error,
        );
      }

      await dormir(Math.min(backoffMs, BACKOFF_MAX_MS));
      backoffMs = Math.min(backoffMs * BACKOFF_FACTOR, BACKOFF_MAX_MS);
    }
  }

  throw new ErrorPostgresNoListo(
    `Postgres no quedó listo en ${timeoutMs}ms tras ${intentos} intento(s). Último error: ${ultimoError?.message ?? '(desconocido)'}`,
    ultimoError,
  );
}

/** Cierra el cliente sin dejar que un fallo de cierre tape el error real de conexión. */
async function cerrarSinFallar(cliente) {
  try {
    await cliente.end();
  } catch {
    // Un cliente que nunca llegó a conectar puede fallar al cerrar —
    // irrelevante para la decisión de reintentar o no.
  }
}

/** `dormir` real: único punto que usa `setTimeout` de verdad (nunca en tests). */
function dormirReal(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms));
}
