// CLI de regeneración/verificación del entorno local de desarrollo y test.
//
// Ref proposal/spec: sdd/regeneracion-reproducible.
// Ref design: sdd/regeneracion-reproducible D1-D6.
//
// Subcomandos:
//   verificar   (W2+W3) read-only, NUNCA abre una conexión de escritura.
//   regenerar   (W4) dry-run por defecto (lee, nunca muta); `--confirmar`
//               crea bases faltantes, migra y siembra.
//   regenerar --recrear-test --confirmar   (W5) ÚNICA operación destructiva:
//               dropea y recrea SOLO las bases de test que gestiona la
//               herramienta (nunca `soporte_master`, nunca un tenant real —
//               ver `validarNombreBaseDestructible` y matriz de amenazas
//               "DDL con identificadores" del design).
//
// Idiom (mismo que scripts/backfill-correo-clientes.mjs y scripts/reset-password.ts):
// funciones puras/inyectadas exportadas + `main()` bajo el guard de invocación
// directa. Cada función de negocio recibe TODO lo que necesita ya resuelto
// (mapas de env, estado del contenedor, un "puerto" de acceso a Postgres, un
// ejecutor de subprocesos) — nunca lee `.env*`, abre una conexión ni lanza un
// proceso por su cuenta. Eso es lo que permite testear la orquestación entera
// con fakes, sin tocar nada real, y correr los tests de integración SOLO
// contra bases efímeras inyectando el puerto real apuntado a esos nombres.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { auditarEntorno } from './lib/guardarrail-host.mjs';
import { clasificarOrigenClaves, compararClaves } from './lib/entorno-claves.mjs';
import { inspeccionarContenedor } from './lib/docker-postgres.mjs';

const RUTA_BACKEND = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/** Nombre del contenedor Postgres del entorno vivo (ver CLAUDE.md — contexto operativo). */
const NOMBRE_CONTENEDOR_POR_DEFECTO = 'soporte-postgres-master';

/**
 * Ejecuta el subcomando `verificar` de punta a punta: read-only, nunca abre
 * una conexión. Compone el guardarraíl de host (`auditarEntorno`, que ya
 * llama `asegurarHostLocal` internamente) con la comparación de claves y la
 * clasificación de origen. NUNCA imprime ni devuelve un valor de clave —
 * `lineas` solo contiene nombres de clave, hosts y URLs ya redactadas.
 *
 * @param {{
 *   envEjemplo: Record<string, string>,
 *   envArchivo: Record<string, string>,
 *   envProceso: Record<string, string | undefined>,
 *   estadoContenedor?: {estado: 'corriendo'|'parado'|'ausente'|'otra-imagen', imagen: string|null} | {errorInspeccion: string},
 * }} entrada
 * @returns {{exitCode: number, lineas: string[]}}
 */
export function ejecutarVerificar({ envEjemplo, envArchivo, envProceso, estadoContenedor }) {
  const lineas = [];
  let exitCode = 0;

  // 0) Contenedor Docker — read-only. `estadoContenedor` ya viene resuelto
  // por el llamador (`inspeccionarContenedor`, W3): esta función se
  // mantiene pura y testeable con literales, igual que los mapas de env.
  // Opcional para no romper a quien todavía no lo pasa (tests previos a W3).
  if (estadoContenedor) {
    if ('errorInspeccion' in estadoContenedor) {
      exitCode = 1;
      lineas.push(
        `[entorno:verificar] Contenedor Docker: no se pudo inspeccionar (${estadoContenedor.errorInspeccion}).`,
      );
    } else if (estadoContenedor.estado === 'ausente') {
      // Spec "regeneracion-entorno-local", scenario "Entorno incompleto":
      // contenedor ausente -> reporta la falta y exit != 0.
      exitCode = 1;
      lineas.push(
        '[entorno:verificar] Contenedor Docker: AUSENTE. Correr "pnpm entorno:regenerar --confirmar" para crearlo.',
      );
    } else if (estadoContenedor.estado === 'otra-imagen') {
      exitCode = 1;
      lineas.push(
        `[entorno:verificar] Contenedor Docker: existe pero con otra imagen (${estadoContenedor.imagen}) — revisar antes de continuar.`,
      );
    } else {
      lineas.push(
        `[entorno:verificar] Contenedor Docker: ${estadoContenedor.estado} (imagen ${estadoContenedor.imagen}).`,
      );
    }
  }

  // 1) Guardarraíl de host — cualquier URL de BD fuera de localhost aborta.
  const { hallazgos, violaciones } = auditarEntorno({ envProceso, envArchivo });
  for (const hallazgo of hallazgos) {
    lineas.push(
      `[entorno:verificar] ${hallazgo.clave}: origen = ${hallazgo.origen}, ` +
        `url = ${hallazgo.urlRedactada}, host local = ${hallazgo.ok ? 'sí' : 'NO'}`,
    );
  }
  if (violaciones.length > 0) {
    exitCode = 1;
    for (const violacion of violaciones) {
      lineas.push(`[entorno:verificar] VIOLACIÓN: ${violacion.mensaje}`);
    }
  }

  // Valor efectivo por clave: el del shell si está en ambos (dotenv no pisa
  // lo ya presente en el shell — ver D3).
  const envEfectivo = { ...envArchivo, ...envProceso };

  // 2) Claves requeridas por .env.example: faltantes, placeholders, extras.
  //
  // ATENCIÓN — dos llamadas con `actual` DISTINTO a propósito, no es un
  // descuido: `envProceso` es TODO el entorno del sistema operativo (PATH,
  // TEMP, USERNAME, npm_*, cientos de claves ajenas a este proyecto). Si
  // "extras" se calculara contra `envEfectivo` (que incluye `envProceso`),
  // cada clave del sistema operativo caería en "extra" y el reporte —la
  // salida que lee una persona— quedaría inundado de ruido ajeno.
  //
  // "Extra" solo tiene sentido semántico como "alguien escribió esta clave
  // en `.env` y no está en `.env.example`" — por eso su `actual` es
  // `envArchivo` SOLO, nunca el entorno del proceso. `faltantes` y
  // `placeholders` sí usan `envEfectivo`: ahí el shell cuenta (una clave
  // seteada en la sesión satisface el requisito aunque no esté en `.env`).
  const comparacionRequeridas = compararClaves({ ejemplo: envEjemplo, actual: envEfectivo });
  const { extras } = compararClaves({ ejemplo: envEjemplo, actual: envArchivo });

  if (comparacionRequeridas.faltantes.length > 0) {
    exitCode = 1;
    lineas.push(
      `[entorno:verificar] Claves faltantes: ${comparacionRequeridas.faltantes.join(', ')}`,
    );
  }
  if (comparacionRequeridas.placeholders.length > 0) {
    exitCode = 1;
    lineas.push(
      `[entorno:verificar] Claves con el valor de ejemplo sin cambiar: ${comparacionRequeridas.placeholders.join(', ')}`,
    );
  }
  if (extras.length > 0) {
    // Informativo, no bloquea: una clave extra en .env no impide que el sistema arranque.
    lineas.push(
      `[entorno:verificar] Claves extra en .env (no están en .env.example): ${extras.join(', ')}`,
    );
  }

  // 3) Origen de cada clave requerida (shell / archivo / "PISA a .env").
  const origenes = clasificarOrigenClaves({ envProceso, envArchivo });
  for (const clave of Object.keys(envEjemplo)) {
    if (clave in envEfectivo) {
      lineas.push(`[entorno:verificar] ${clave}: origen = ${origenes[clave]}`);
    }
  }

  if (exitCode === 0) {
    lineas.push('[entorno:verificar] OK: el entorno local está completo.');
  }

  return { exitCode, lineas };
}

// ─── regenerar (W4) ─────────────────────────────────────────────────────────

/**
 * Nombres FIJOS de las bases que gestiona `entorno:regenerar` en modo real
 * (D5): la de desarrollo y las dos de test que exige la suite completa
 * (`CLAUDE.md`, sección "Comandos"). Overridable SOLO para tests contra
 * bases efímeras `soporte_regen_<hex>_test` — nunca se debe pasar un nombre
 * real desde `main()`.
 */
export const NOMBRES_BASES_POR_DEFECTO = [
  'soporte_master',
  'soporte_master_test',
  'soporte_tenant_test',
];

/** Mismo nombre que `DEFAULT_DEMO_CLIENTE_NOMBRE` en `prisma_master/seeds/demo-seed.ts` — duplicado a propósito: ese archivo es TypeScript y este `.mjs` corre con `node` plano, sin loader de TS. */
const NOMBRE_CLIENTE_DEMO_POR_DEFECTO = 'Demo Soporte';

const PATRON_NOMBRE_BASE = /^[a-z0-9_]+$/;

/** Nombre de base rechazado antes de ejecutar `CREATE DATABASE` (amenaza "DDL con identificadores", D-matriz). */
export class ErrorNombreBaseInvalido extends Error {
  /** @param {unknown} nombre */
  constructor(nombre) {
    super(
      `Nombre de base inválido, se rechaza SIN ejecutar CREATE DATABASE: ${JSON.stringify(nombre)}. ` +
        `Debe matchear ${PATRON_NOMBRE_BASE}.`,
    );
    this.name = 'ErrorNombreBaseInvalido';
  }
}

/**
 * ¿`nombre` es un identificador seguro de base de datos? `CREATE DATABASE`
 * no admite parámetros preparados — esta es la única defensa antes de
 * interpolar el nombre en el SQL (junto con el quoting, defensa en
 * profundidad). Mismo criterio que `validarNombreContenedor` (W3).
 * @param {unknown} nombre
 * @returns {boolean}
 */
export function validarNombreBaseDatos(nombre) {
  return typeof nombre === 'string' && PATRON_NOMBRE_BASE.test(nombre);
}

// ─── recrear-test (W5) — validador de "base destructible" ─────────────────

/**
 * Nombres explícitamente prohibidos para `--recrear-test`.
 *
 * OJO con lo que esta lista hace y lo que NO hace. Hoy ninguno de estos dos
 * nombres depende de ella para quedar afuera: los excluye antes la regla del
 * sufijo `_test`, porque ni la base de desarrollo ni una base de tenant real
 * terminan así. La lista es la SEGUNDA capa, para el día que un nombre
 * protegido sí termine en `_test` y el sufijo deje de alcanzar.
 *
 * El `db_name` del tenant sale de `soporte_master.clientes` y CAMBIA si el
 * tenant se recrea, así que hardcodearlo acá envejece mal. Ya pasó: esta
 * lista arrastró un nombre que hacía rato no existía en ningún Postgres,
 * mientras el tenant real quedaba afuera de la lista y protegido solo por
 * el sufijo. El chequeo durable es contra el registro de clientes, y NO
 * puede vivir en este validador porque es puro a propósito: valida antes de
 * abrir conexión. Va como barrera aparte dentro del flujo destructivo.
 */
const NOMBRES_PROHIBIDOS_DESTRUCCION = new Set([
  'soporte_master',
  'soporte_01a0253ef26f78b88b02d5161410d8fd',
]);

/** Nombre de base rechazado antes de ejecutar `DROP DATABASE` (amenaza DDL, igual criterio que `ErrorNombreBaseInvalido`). */
export class ErrorBaseNoDestructible extends Error {
  /** @param {unknown} nombre */
  constructor(nombre) {
    super(
      `Base no destructible, se rechaza SIN conectar ni interpolar en SQL: ${JSON.stringify(nombre)}. ` +
        `Debe matchear ${PATRON_NOMBRE_BASE}, terminar en "_test", y no estar en la lista de bases protegidas.`,
    );
    this.name = 'ErrorBaseNoDestructible';
  }
}

/**
 * ¿`nombre` es una base que `--recrear-test` puede dropear? Spec
 * "regeneracion-entorno-local", requirement "Alcance destructivo acotado":
 * MUST limitar a sufijo `_test`, MUST NOT destruir `soporte_master` ni un
 * tenant real. Tres barreras independientes, TODAS antes de abrir una
 * conexión o interpolar el nombre en SQL:
 *
 * 1. Identificador seguro (`/^[a-z0-9_]+$/`) — misma amenaza DDL que
 *    `validarNombreBaseDatos`; rechaza cualquier intento de inyección
 *    (`x"; DROP ...` no matchea: tiene `"`, `;` y espacios).
 * 2. Termina en `_test` — sin esto, cualquier base pasaría.
 * 3. NO está en `NOMBRES_PROHIBIDOS_DESTRUCCION` — la barrera que protege
 *    `soporte_master` y el tenant real NO depende del sufijo (ver comentario
 *    de la constante): aunque algún día un nombre protegido terminara en
 *    `_test`, esta lista lo sigue rechazando.
 *
 * `soporte_master_test` y `soporte_tenant_test` SÍ pasan las tres barreras
 * a propósito: son el objetivo declarado de `--recrear-test` (spec
 * #2416, "Alcance destructivo acotado" las nombra explícitamente como
 * destructibles). La protección de este work unit para esas dos bases NO es
 * "el validador las rechaza" — es que `ejecutarRecrearTest` nunca les pasa
 * un nombre real durante los tests de este archivo: los tests de integración
 * SIEMPRE inyectan `nombresBases` efímeros (`soporte_regen_<hex>_test`,
 * mismo mecanismo que W4), nunca las reales. Ver detalle en el reporte de
 * cierre de W5.
 * @param {unknown} nombre
 * @returns {boolean}
 */
export function validarNombreBaseDestructible(nombre) {
  if (typeof nombre !== 'string') return false;
  if (!PATRON_NOMBRE_BASE.test(nombre)) return false;
  if (!nombre.endsWith('_test')) return false;
  if (NOMBRES_PROHIBIDOS_DESTRUCCION.has(nombre)) return false;
  return true;
}

/** @param {string} url @returns {string} */
function extraerNombreDb(url) {
  return new URL(url).pathname.replace(/^\//, '');
}

/** URL de mantenimiento (`/postgres`, mismo host/credenciales) para poder CREATE/SELECT sobre `pg_database` — la DB objetivo no puede administrarse a sí misma. */
function urlAdminDesde(url) {
  const admin = new URL(url);
  admin.pathname = '/postgres';
  return admin.toString();
}

/**
 * Deriva las bases objetivo a partir de una URL "base" (host/puerto/
 * credenciales de `DATABASE_URL_MASTER`), sustituyendo el nombre de la DB
 * por cada uno de `nombres`. Puro: solo arma URLs, no conecta.
 * @param {string} urlBase
 * @param {string[]} [nombres]
 * @returns {Array<{nombreDb: string, url: string}>}
 */
export function derivarBasesObjetivo(urlBase, nombres = NOMBRES_BASES_POR_DEFECTO) {
  return nombres.map((nombreDb) => {
    const u = new URL(urlBase);
    u.pathname = '/' + nombreDb;
    return { nombreDb, url: u.toString() };
  });
}

/**
 * "Puerto" de acceso a Postgres que necesita `ejecutarRegenerar` — SIEMPRE
 * inyectado (nunca se abre un `Pool` real dentro de esa función), mismo
 * criterio que `execFileSyncFn` en W3. La implementación real es
 * `crearPuertoPgReal`, más abajo; los tests inyectan fakes.
 * @typedef {{
 *   baseExiste: (url: string) => Promise<boolean>,
 *   crearBase: (url: string) => Promise<void>,
 *   dropBase: (url: string) => Promise<void>,
 *   consultarUsuarioRoot: (urlMaster: string, email: string) => Promise<{estado: 'activo'|'inactivo'|'ausente'}>,
 *   consultarClienteDemo: (urlMaster: string, nombreCliente: string) => Promise<boolean>,
 * }} PuertoPg
 */

/**
 * Implementación real del `PuertoPg`: un `pg.Pool` propio por operación,
 * cerrado en `finally` (mismo criterio que `PostgresAdminService` — sin
 * pools de larga vida en una herramienta de uso infrecuente).
 * @returns {PuertoPg}
 */
export function crearPuertoPgReal() {
  return {
    async baseExiste(url) {
      const nombreDb = extraerNombreDb(url);
      const pool = new Pool({
        connectionString: urlAdminDesde(url),
        connectionTimeoutMillis: 5000,
      });
      try {
        const { rowCount } = await pool.query('SELECT 1 FROM pg_database WHERE datname = $1', [
          nombreDb,
        ]);
        return (rowCount ?? 0) > 0;
      } finally {
        await pool.end();
      }
    },
    async crearBase(url) {
      const nombreDb = extraerNombreDb(url);
      if (!validarNombreBaseDatos(nombreDb)) throw new ErrorNombreBaseInvalido(nombreDb);
      const pool = new Pool({
        connectionString: urlAdminDesde(url),
        connectionTimeoutMillis: 5000,
      });
      try {
        // Sin parámetros preparados posibles (DDL): el nombre YA fue
        // validado arriba y se quotea (duplica comillas internas) — mismo
        // patrón que `PostgresAdminService.quoteIdentifier`.
        await pool.query(`CREATE DATABASE "${nombreDb.replace(/"/g, '""')}"`);
      } finally {
        await pool.end();
      }
    },
    async dropBase(url) {
      const nombreDb = extraerNombreDb(url);
      // Re-valida acá también (defensa en profundidad, mismo criterio que
      // `crearBase`): el llamador YA validó, pero `DROP DATABASE` es
      // irreversible — esta función nunca confía únicamente en el llamador.
      if (!validarNombreBaseDestructible(nombreDb)) throw new ErrorBaseNoDestructible(nombreDb);
      const pool = new Pool({
        connectionString: urlAdminDesde(url),
        connectionTimeoutMillis: 5000,
      });
      try {
        await pool.query(`DROP DATABASE IF EXISTS "${nombreDb.replace(/"/g, '""')}"`);
      } finally {
        await pool.end();
      }
    },
    async consultarUsuarioRoot(urlMaster, email) {
      const pool = new Pool({ connectionString: urlMaster, connectionTimeoutMillis: 5000 });
      try {
        const { rows } = await pool.query(
          'SELECT activo, deleted_at FROM usuarios WHERE email = $1',
          [email],
        );
        if (rows.length === 0) return { estado: 'ausente' };
        const fila = rows[0];
        return { estado: fila.activo && fila.deleted_at === null ? 'activo' : 'inactivo' };
      } finally {
        await pool.end();
      }
    },
    async consultarClienteDemo(urlMaster, nombreCliente) {
      const pool = new Pool({ connectionString: urlMaster, connectionTimeoutMillis: 5000 });
      try {
        const { rowCount } = await pool.query(
          'SELECT 1 FROM clientes WHERE nombre = $1 AND deleted_at IS NULL',
          [nombreCliente],
        );
        return (rowCount ?? 0) > 0;
      } finally {
        await pool.end();
      }
    },
  };
}

/** Resuelve el binario de un paquete con `bin`, igual que `scripts/migrate-tenants.js` (sin depender de `node_modules/.bin`, funciona en Windows). */
function resolverBin(paquete, nombreBin = paquete) {
  const pkgJson = require.resolve(`${paquete}/package.json`);
  const bin = require(pkgJson).bin;
  const rel = typeof bin === 'string' ? bin : bin[nombreBin];
  return path.join(path.dirname(pkgJson), rel);
}

const PRISMA_BIN = resolverBin('prisma');

const ARGS_MIGRATE = {
  master: (accion) => [PRISMA_BIN, 'migrate', accion, '--schema=prisma_master/schema.prisma'],
  tenant: (accion) => [
    PRISMA_BIN,
    'migrate',
    accion,
    '--schema=prisma_tenant/schema.prisma',
    '--config',
    'prisma.tenant.config.ts',
  ],
};
const ENV_VAR_POR_SCHEMA = { master: 'DATABASE_URL_MASTER', tenant: 'DATABASE_URL_TENANT' };

/**
 * `prisma migrate status` (read-only) contra `url`, para el diagnóstico del
 * dry-run. Nunca lanza: un error (ej. la base todavía no existe) se reporta
 * como texto, no corta el resto del plan.
 * @param {{url: string, schema: 'master'|'tenant', execFileSyncFn: Function}} entrada
 * @returns {string}
 */
function estadoMigracionSchema({ url, schema, execFileSyncFn }) {
  try {
    const salida = execFileSyncFn(process.execPath, ARGS_MIGRATE[schema]('status'), {
      cwd: RUTA_BACKEND,
      env: { ...process.env, [ENV_VAR_POR_SCHEMA[schema]]: url },
      encoding: 'utf8',
    });
    return salida.includes('Database schema is up to date') ? 'al día' : 'pendiente';
  } catch (error) {
    return `no se pudo determinar (${String(error.message).split('\n')[0]})`;
  }
}

/**
 * `prisma migrate deploy` (muta) contra `url`. Idempotente nativo de
 * Prisma: no reaplica una migración ya aplicada.
 * @param {{url: string, schema: 'master'|'tenant', execFileSyncFn: Function}} entrada
 */
function aplicarMigracionSchema({ url, schema, execFileSyncFn }) {
  execFileSyncFn(process.execPath, ARGS_MIGRATE[schema]('deploy'), {
    cwd: RUTA_BACKEND,
    env: { ...process.env, [ENV_VAR_POR_SCHEMA[schema]]: url },
    stdio: 'pipe',
  });
}

/**
 * Ejecución REAL de un paso de seed, como proceso externo — mismo criterio
 * que `scripts/migrate-tenants.js`: resuelve el binario sin depender de
 * `node_modules/.bin` y nunca usa `shell: true`. Es el default de `main()`;
 * los tests SIEMPRE inyectan su propio `ejecutarSeed` (ver JSDoc de
 * `ejecutarRegenerar`) — correr `seed:demo` de verdad crea una DB física de
 * tenant con un nombre que NO termina en `_test` (`CrearClienteUseCase`, ver
 * nota de desviación en el reporte de cierre de W4), así que jamás debe
 * invocarse contra una base efímera de test.
 * @param {'seed:root'|'seed:demo'|'sync:ayuda'} paso
 * @param {{urlMaster: string, urlTenant: string, execFileSyncFn?: Function}} entrada
 */
export function ejecutarSeedPasoReal(
  paso,
  { urlMaster, urlTenant, execFileSyncFn = execFileSync },
) {
  const env = { ...process.env, DATABASE_URL_MASTER: urlMaster, DATABASE_URL_TENANT: urlTenant };
  if (paso === 'seed:root') {
    const bin = resolverBin('ts-node');
    execFileSyncFn(process.execPath, [bin, 'prisma_master/seeds/root-bootstrap.seed.ts'], {
      cwd: RUTA_BACKEND,
      env,
      stdio: 'pipe',
    });
    return;
  }
  if (paso === 'seed:demo') {
    const bin = resolverBin('ts-node');
    execFileSyncFn(
      process.execPath,
      [bin, '-r', 'tsconfig-paths/register', 'prisma_master/seeds/demo-seed.ts'],
      { cwd: RUTA_BACKEND, env, stdio: 'pipe' },
    );
    return;
  }
  if (paso === 'sync:ayuda') {
    execFileSyncFn(process.execPath, [path.join(RUTA_BACKEND, 'scripts', 'sync-ayuda.js')], {
      cwd: RUTA_BACKEND,
      env,
      stdio: 'pipe',
    });
    return;
  }
  throw new Error(`[entorno:regenerar] paso de seed desconocido: ${paso}`);
}

/** Consulta el estado de `seed:root`, tolerando que `usuarios` todavía no exista (dry-run sobre una base recién creada). */
async function consultarUsuarioRootSeguro(puertoPg, urlMaster, email) {
  if (!email) return { estado: 'desconocido', motivo: 'falta ROOT_ADMIN_EMAIL' };
  try {
    return await puertoPg.consultarUsuarioRoot(urlMaster, email);
  } catch {
    return { estado: 'desconocido', motivo: 'no se pudo consultar (¿faltan migraciones?)' };
  }
}

/** Formatea el estado de `seed:root` para una línea de reporte. */
function describirEstadoRoot(estado, email) {
  if (!email) return 'no se puede determinar — falta ROOT_ADMIN_EMAIL';
  if (estado.estado === 'activo') return `"${email}" ya existe y está activo`;
  if (estado.estado === 'inactivo')
    return `"${email}" existe pero está inactivo/borrado — requiere acción manual`;
  if (estado.estado === 'ausente') return 'pendiente (no existe todavía)';
  return `no se pudo determinar (${estado.motivo ?? 'desconocido'})`;
}

/** Consulta si el cliente demo ya existe, tolerando que `clientes` todavía no exista. */
async function consultarClienteDemoSeguro(puertoPg, urlMaster, nombreCliente) {
  try {
    return await puertoPg.consultarClienteDemo(urlMaster, nombreCliente);
  } catch {
    return false;
  }
}

/**
 * Ejecuta el subcomando `regenerar`: dry-run por defecto (lee, nunca muta),
 * `confirmar: true` crea/migra/siembra de verdad. Orden: guardarraíl de host
 * → contenedor → claves (informativo) → bases → migraciones → seeds
 * (`seed:root` → `seed:demo` → `sync:ayuda`, D5/D1-D6).
 *
 * Todo colaborador con efecto (`puertoPg`, `execFileSyncFn`, `ejecutarSeed`)
 * se recibe por parámetro, SIN default: `main()` es quien decide instanciar
 * las implementaciones reales. Así los tests de integración pueden apuntar
 * `puertoPg`/`execFileSyncFn` reales a una base efímera (crear/migrar es
 * seguro) e inyectar un `ejecutarSeed` propio para los pasos de seed (ver
 * JSDoc de `ejecutarSeedPasoReal` — `seed:demo` real crea una DB de tenant
 * fuera de la convención `_test`, así que nunca corre de verdad en un test).
 *
 * @param {{
 *   confirmar?: boolean,
 *   envEjemplo: Record<string, string>,
 *   envArchivo: Record<string, string>,
 *   envProceso: Record<string, string | undefined>,
 *   estadoContenedor?: {estado: 'corriendo'|'parado'|'ausente'|'otra-imagen', imagen: string|null} | {errorInspeccion: string},
 *   nombresBases?: string[],
 *   nombreClienteDemo?: string,
 *   rootAdminEmail?: string,
 *   puertoPg: PuertoPg,
 *   execFileSyncFn: Function,
 *   ejecutarSeed: (paso: 'seed:root'|'seed:demo'|'sync:ayuda', ctx: {urlMaster: string, urlTenant: string}) => Promise<void> | void,
 * }} entrada
 * @returns {Promise<{exitCode: number, lineas: string[]}>}
 */
export async function ejecutarRegenerar({
  confirmar = false,
  envEjemplo,
  envArchivo,
  envProceso,
  estadoContenedor,
  nombresBases = NOMBRES_BASES_POR_DEFECTO,
  nombreClienteDemo = NOMBRE_CLIENTE_DEMO_POR_DEFECTO,
  rootAdminEmail,
  puertoPg,
  execFileSyncFn,
  ejecutarSeed,
}) {
  const lineas = [];

  // 1) Guardarraíl de host — SIEMPRE antes de abrir cualquier conexión
  // (spec "La herramienta valida antes de conectar"). A diferencia de
  // `ejecutarVerificar` (pura, nunca conecta), acá SÍ hay conexiones reales
  // más abajo: una violación corta la función entera, sin tocar nada más.
  const { hallazgos, violaciones } = auditarEntorno({ envProceso, envArchivo });
  for (const hallazgo of hallazgos) {
    lineas.push(
      `[entorno:regenerar] ${hallazgo.clave}: origen = ${hallazgo.origen}, ` +
        `url = ${hallazgo.urlRedactada}, host local = ${hallazgo.ok ? 'sí' : 'NO'}`,
    );
  }
  if (violaciones.length > 0) {
    for (const violacion of violaciones)
      lineas.push(`[entorno:regenerar] VIOLACIÓN: ${violacion.mensaje}`);
    return { exitCode: 1, lineas };
  }

  // 2) Contenedor — otro hard-blocker: sin Postgres corriendo no hay nada
  // para diagnosticar ni mutar.
  if (estadoContenedor) {
    if ('errorInspeccion' in estadoContenedor) {
      lineas.push(
        `[entorno:regenerar] Contenedor Docker: no se pudo inspeccionar (${estadoContenedor.errorInspeccion}).`,
      );
      return { exitCode: 1, lineas };
    }
    if (estadoContenedor.estado === 'ausente' || estadoContenedor.estado === 'otra-imagen') {
      lineas.push(
        `[entorno:regenerar] Contenedor Docker: ${estadoContenedor.estado.toUpperCase()} — no se puede continuar.`,
      );
      return { exitCode: 1, lineas };
    }
    lineas.push(
      `[entorno:regenerar] Contenedor Docker: ${estadoContenedor.estado} (imagen ${estadoContenedor.imagen}).`,
    );
  }

  // 3) Claves — informativo, NUNCA aborta acá (para eso está `entorno:verificar`).
  const envEfectivo = { ...envArchivo, ...envProceso };
  const { faltantes, placeholders } = compararClaves({ ejemplo: envEjemplo, actual: envEfectivo });
  if (faltantes.length > 0)
    lineas.push(`[entorno:regenerar] Claves faltantes: ${faltantes.join(', ')}`);
  if (placeholders.length > 0)
    lineas.push(`[entorno:regenerar] Claves sin completar: ${placeholders.join(', ')}`);

  const urlBase = envEfectivo.DATABASE_URL_MASTER;
  if (!urlBase) {
    lineas.push('[entorno:regenerar] No se pudo derivar la URL base: falta DATABASE_URL_MASTER.');
    return { exitCode: 1, lineas };
  }

  // 4) Bases objetivo — SIEMPRE se inspeccionan (read-only), en dry-run y en --confirmar.
  const basesObjetivo = derivarBasesObjetivo(urlBase, nombresBases);
  const faltantesBases = [];
  for (const base of basesObjetivo) {
    const existe = await puertoPg.baseExiste(base.url);
    lineas.push(`[entorno:regenerar] Base ${base.nombreDb}: ${existe ? 'presente' : 'FALTA'}`);
    if (!existe) faltantesBases.push(base);
  }
  const [baseMaster, baseMasterTest, baseTenantTest] = basesObjetivo;

  if (!confirmar) {
    // DRY-RUN: reporta migraciones/seeds SIN mutar. Si una base todavía no
    // existe, ni `prisma migrate status` ni las queries de seed pueden
    // correr contra ella — se reporta como "no determinable", no falla.
    for (const [base, schema] of [
      [baseMaster, 'master'],
      [baseMasterTest, 'master'],
      [baseTenantTest, 'tenant'],
    ]) {
      const estado = faltantesBases.includes(base)
        ? 'no se puede determinar (la base todavía no existe)'
        : estadoMigracionSchema({ url: base.url, schema, execFileSyncFn });
      lineas.push(`[entorno:regenerar] Migraciones (${schema}) sobre ${base.nombreDb}: ${estado}`);
    }

    if (!faltantesBases.includes(baseMaster)) {
      const estadoRoot = await consultarUsuarioRootSeguro(puertoPg, baseMaster.url, rootAdminEmail);
      lineas.push(
        `[entorno:regenerar] seed:root: ${describirEstadoRoot(estadoRoot, rootAdminEmail)}`,
      );
      const demoExiste = await consultarClienteDemoSeguro(
        puertoPg,
        baseMaster.url,
        nombreClienteDemo,
      );
      lineas.push(
        `[entorno:regenerar] seed:demo: ${demoExiste ? 'el cliente demo ya existe' : 'pendiente'}`,
      );
    }

    lineas.push(
      faltantesBases.length > 0
        ? `[entorno:regenerar] DRY-RUN: crearía ${faltantesBases.length} base(s): ${faltantesBases
            .map((b) => b.nombreDb)
            .join(', ')}.`
        : '[entorno:regenerar] DRY-RUN: todas las bases objetivo ya existen.',
    );
    lineas.push(
      '[entorno:regenerar] DRY-RUN: no se mutó nada. Correr con --confirmar para aplicar.',
    );
    return { exitCode: 0, lineas };
  }

  // --confirmar: mutación real, en el orden del design (D1-D6/D5).
  for (const base of faltantesBases) {
    await puertoPg.crearBase(base.url);
    lineas.push(`[entorno:regenerar] Base ${base.nombreDb}: creada.`);
  }

  aplicarMigracionSchema({ url: baseMaster.url, schema: 'master', execFileSyncFn });
  lineas.push(`[entorno:regenerar] Migración (master) aplicada sobre ${baseMaster.nombreDb}.`);
  aplicarMigracionSchema({ url: baseMasterTest.url, schema: 'master', execFileSyncFn });
  lineas.push(`[entorno:regenerar] Migración (master) aplicada sobre ${baseMasterTest.nombreDb}.`);
  aplicarMigracionSchema({ url: baseTenantTest.url, schema: 'tenant', execFileSyncFn });
  lineas.push(`[entorno:regenerar] Migración (tenant) aplicada sobre ${baseTenantTest.nombreDb}.`);

  let exitCode = 0;
  const ctxSeed = { urlMaster: baseMaster.url, urlTenant: baseTenantTest.url };

  // seed:root — el ÚNICO paso que puede saltearse sin ser una falla dura.
  if (!rootAdminEmail) {
    lineas.push(
      '[entorno:regenerar] seed:root: SALTEADO — falta ROOT_ADMIN_EMAIL en el entorno, no se puede chequear idempotencia.',
    );
    exitCode = 2;
  } else {
    const estadoRoot = await puertoPg.consultarUsuarioRoot(baseMaster.url, rootAdminEmail);
    if (estadoRoot.estado === 'activo') {
      lineas.push(
        `[entorno:regenerar] seed:root: "${rootAdminEmail}" ya existe y está activo — nada que hacer.`,
      );
    } else if (estadoRoot.estado === 'inactivo') {
      lineas.push(
        `[entorno:regenerar] seed:root: SALTEADO — la cuenta "${rootAdminEmail}" existe pero está inactiva o ` +
          'borrada. Remedio: reactivarla a mano (UPDATE usuarios SET activo=true, deleted_at=NULL WHERE email=...) ' +
          'o usar otro ROOT_ADMIN_EMAIL, y volver a correr "pnpm entorno:regenerar --confirmar".',
      );
      exitCode = 2;
    } else {
      await ejecutarSeed('seed:root', ctxSeed);
      lineas.push('[entorno:regenerar] seed:root: ejecutado.');
    }
  }

  // seed:demo — el resto SIEMPRE continúa, incluso si seed:root se salteó.
  const demoYaExiste = await puertoPg.consultarClienteDemo(baseMaster.url, nombreClienteDemo);
  if (demoYaExiste) {
    lineas.push('[entorno:regenerar] seed:demo: el cliente demo ya existe — nada que hacer.');
  } else {
    await ejecutarSeed('seed:demo', ctxSeed);
    lineas.push('[entorno:regenerar] seed:demo: ejecutado.');
  }

  // sync:ayuda — idempotente internamente (upsert por slug), siempre corre.
  await ejecutarSeed('sync:ayuda', ctxSeed);
  lineas.push('[entorno:regenerar] sync:ayuda: ejecutado.');

  if (exitCode === 0 && faltantesBases.length === 0) {
    lineas.push(
      '[entorno:regenerar] Nada que hacer: el entorno ya estaba regenerado (bases, migraciones y seeds al día).',
    );
  }
  lineas.push(
    exitCode === 0
      ? '[entorno:regenerar] OK.'
      : '[entorno:regenerar] Completado con salvedades — ver arriba (exit 2, no es una falla dura).',
  );

  return { exitCode, lineas };
}

// ─── recrear-test (W5) ──────────────────────────────────────────────────────

/**
 * Nombres que gestiona `--recrear-test` en modo real: SOLO las dos bases de
 * test — nunca `soporte_master` (el "reset de dev" quedó fuera de alcance,
 * proposal #2415). Overridable SOLO para tests contra bases efímeras
 * `soporte_regen_<hex>_test`, mismo criterio que `NOMBRES_BASES_POR_DEFECTO`.
 */
export const NOMBRES_BASES_TEST_POR_DEFECTO = ['soporte_master_test', 'soporte_tenant_test'];

/**
 * Guardarraíles compartidos por `regenerar` y `recrear-test`, en el mismo
 * orden que D1-D6: 1) host (`auditarEntorno`, ANTES de cualquier conexión),
 * 2) contenedor. `prefijo` deja cada línea de log identificada por
 * subcomando. Devuelve `corte: true` si hay que abortar YA, con las líneas
 * ya armadas para que el llamador no repita el formateo.
 * @param {{envProceso, envArchivo, estadoContenedor, prefijo: string}} entrada
 * @returns {{lineas: string[], corte: boolean, exitCode: number}}
 */
function verificarPrerrequisitos({ envProceso, envArchivo, estadoContenedor, prefijo }) {
  const lineas = [];
  const { hallazgos, violaciones } = auditarEntorno({ envProceso, envArchivo });
  for (const hallazgo of hallazgos) {
    lineas.push(
      `${prefijo} ${hallazgo.clave}: origen = ${hallazgo.origen}, ` +
        `url = ${hallazgo.urlRedactada}, host local = ${hallazgo.ok ? 'sí' : 'NO'}`,
    );
  }
  if (violaciones.length > 0) {
    for (const violacion of violaciones) lineas.push(`${prefijo} VIOLACIÓN: ${violacion.mensaje}`);
    return { lineas, corte: true, exitCode: 1 };
  }
  if (estadoContenedor) {
    if ('errorInspeccion' in estadoContenedor) {
      lineas.push(
        `${prefijo} Contenedor Docker: no se pudo inspeccionar (${estadoContenedor.errorInspeccion}).`,
      );
      return { lineas, corte: true, exitCode: 1 };
    }
    if (estadoContenedor.estado === 'ausente' || estadoContenedor.estado === 'otra-imagen') {
      lineas.push(
        `${prefijo} Contenedor Docker: ${estadoContenedor.estado.toUpperCase()} — no se puede continuar.`,
      );
      return { lineas, corte: true, exitCode: 1 };
    }
    lineas.push(
      `${prefijo} Contenedor Docker: ${estadoContenedor.estado} (imagen ${estadoContenedor.imagen}).`,
    );
  }
  return { lineas, corte: false, exitCode: 0 };
}

/**
 * Ejecuta `--recrear-test`: DROP + CREATE de cada base en `nombresBases`
 * (spec "Alcance destructivo acotado"). Orden, todo ANTES de tocar
 * Postgres: 1) `asegurarHostLocal` (vía `verificarPrerrequisitos`), 2)
 * CADA nombre debe pasar `validarNombreBaseDestructible` — si uno solo
 * falla, NINGUNA base se toca (fail-closed, todo o nada), 3) requiere
 * `--confirmar` (misma exigencia que `regenerar`, D-decisiones cerradas #4).
 * Deja las bases vacías: no migra ni siembra — ese es el trabajo de
 * `entorno:regenerar --confirmar`, que el reporte le indica al usuario que
 * corra después.
 * @param {{
 *   envArchivo: Record<string, string>,
 *   envProceso: Record<string, string | undefined>,
 *   estadoContenedor?: {estado: 'corriendo'|'parado'|'ausente'|'otra-imagen', imagen: string|null} | {errorInspeccion: string},
 *   nombresBases?: string[],
 *   confirmar: boolean,
 *   puertoPg: PuertoPg,
 * }} entrada
 * @returns {Promise<{exitCode: number, lineas: string[]}>}
 */
export async function ejecutarRecrearTest({
  envArchivo,
  envProceso,
  estadoContenedor,
  nombresBases = NOMBRES_BASES_TEST_POR_DEFECTO,
  confirmar,
  puertoPg,
}) {
  const prefijo = '[entorno:regenerar --recrear-test]';
  const pre = verificarPrerrequisitos({ envProceso, envArchivo, estadoContenedor, prefijo });
  if (pre.corte) return { exitCode: pre.exitCode, lineas: pre.lineas };
  const lineas = pre.lineas;

  // Validación de nombres — SIN abrir conexión, ANTES de interpolar nada en
  // SQL. Todo o nada: un solo nombre inválido corta la operación entera.
  const invalidos = nombresBases.filter((nombre) => !validarNombreBaseDestructible(nombre));
  if (invalidos.length > 0) {
    lineas.push(
      `${prefijo} Nombre(s) no destructible(s), rechazado(s) SIN tocar la base: ${invalidos.join(', ')}`,
    );
    return { exitCode: 1, lineas };
  }

  if (!confirmar) {
    lineas.push(`${prefijo} Requiere --confirmar: no se dropeó nada.`);
    return { exitCode: 1, lineas };
  }

  const urlBase = { ...envArchivo, ...envProceso }.DATABASE_URL_MASTER;
  if (!urlBase) {
    lineas.push(`${prefijo} No se pudo derivar la URL base: falta DATABASE_URL_MASTER.`);
    return { exitCode: 1, lineas };
  }

  const basesObjetivo = derivarBasesObjetivo(urlBase, nombresBases);
  for (const base of basesObjetivo) {
    await puertoPg.dropBase(base.url);
    lineas.push(`${prefijo} Base ${base.nombreDb}: dropeada.`);
    await puertoPg.crearBase(base.url);
    lineas.push(`${prefijo} Base ${base.nombreDb}: recreada (vacía).`);
  }

  lineas.push(
    `${prefijo} OK — bases recreadas vacías. Correr "pnpm entorno:regenerar --confirmar" para migrar y sembrar.`,
  );
  return { exitCode: 0, lineas };
}

/**
 * Lee y parsea un archivo `.env*` con `dotenv.parse`, sin mutar `process.env`.
 * `null` si el archivo no existe o no se puede leer — el llamador decide qué
 * hacer con la ausencia (fail-closed para `.env.example`, tolerante para `.env`).
 * @param {string} ruta
 * @returns {Record<string, string> | null}
 */
function leerEnvArchivo(ruta) {
  try {
    return dotenv.parse(readFileSync(ruta));
  } catch {
    return null;
  }
}

/** Inspecciona el contenedor de forma tolerante — read-only, nunca cuelga el resto si Docker no está disponible. */
function inspeccionarContenedorTolerante() {
  try {
    return inspeccionarContenedor({
      nombreContenedor: NOMBRE_CONTENEDOR_POR_DEFECTO,
      execFileSyncFn: execFileSync,
    });
  } catch (error) {
    return { errorInspeccion: error.message };
  }
}

/**
 * Punto de entrada del CLI. Único adaptador que lee el mundo (argv, `.env`,
 * `.env.example`, `process.env`, Docker, Postgres) — toda la decisión vive
 * en `ejecutarVerificar`/`ejecutarRegenerar`.
 */
async function main() {
  const [subcomando, ...resto] = process.argv.slice(2);

  const envEjemplo = leerEnvArchivo(path.join(RUTA_BACKEND, '.env.example'));
  if (envEjemplo === null) {
    console.error(
      `[entorno:${subcomando ?? '?'}] no se pudo leer .env.example — no puedo derivar las claves requeridas.`,
    );
    process.exitCode = 1;
    return;
  }
  const envArchivo = leerEnvArchivo(path.join(RUTA_BACKEND, '.env')) ?? {};
  const envProceso = { ...process.env };

  if (subcomando === 'verificar') {
    const { exitCode, lineas } = ejecutarVerificar({
      envEjemplo,
      envArchivo,
      envProceso,
      estadoContenedor: inspeccionarContenedorTolerante(),
    });
    for (const linea of lineas) console.log(linea);
    process.exitCode = exitCode;
    return;
  }

  if (subcomando === 'regenerar' && resto.includes('--recrear-test')) {
    const { exitCode, lineas } = await ejecutarRecrearTest({
      envArchivo,
      envProceso,
      estadoContenedor: inspeccionarContenedorTolerante(),
      confirmar: resto.includes('--confirmar'),
      puertoPg: crearPuertoPgReal(),
    });
    for (const linea of lineas) console.log(linea);
    process.exitCode = exitCode;
    return;
  }

  if (subcomando === 'regenerar') {
    const envEfectivo = { ...envArchivo, ...envProceso };
    const { exitCode, lineas } = await ejecutarRegenerar({
      confirmar: resto.includes('--confirmar'),
      envEjemplo,
      envArchivo,
      envProceso,
      estadoContenedor: inspeccionarContenedorTolerante(),
      rootAdminEmail: envEfectivo.ROOT_ADMIN_EMAIL,
      puertoPg: crearPuertoPgReal(),
      execFileSyncFn: execFileSync,
      ejecutarSeed: ejecutarSeedPasoReal,
    });
    for (const linea of lineas) console.log(linea);
    process.exitCode = exitCode;
    return;
  }

  console.error(
    `[entorno] subcomando desconocido: "${subcomando ?? ''}". Uso: node regenerar-entorno.mjs verificar|regenerar [--confirmar]`,
  );
  process.exitCode = 1;
}

// Solo corre el CLI real si el archivo se invoca directamente — así los
// tests pueden importar `ejecutarVerificar`/`ejecutarRegenerar` sin tocar
// ningún `.env*` real.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
