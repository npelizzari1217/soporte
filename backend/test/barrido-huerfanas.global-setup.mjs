// Adaptador del barrido de bases efímeras huérfanas (ver scripts/lib/barrido-huerfanas.mjs).
//
// Corre UNA vez al arrancar la suite, DESPUÉS del guardarraíl de host — el
// orden importa y está fijado en vitest.config.ts: si alguna DATABASE_URL_*
// apunta fuera de localhost, el guardarraíl ya cortó la corrida y este archivo
// ni se ejecuta. Igual vuelve a exigir host local por su cuenta, porque un
// módulo que dropea bases no delega su propia seguridad en el orden de una
// lista de configuración.
//
// TRES PUERTAS, todas fail-closed. Una base se borra sólo si:
//   1. su nombre matchea el patrón estricto de base efímera de test;
//   2. NO figura en el registro de clientes reales (tabla `clientes` de la
//      master de DESARROLLO — la de test no sirve, ahí los specs siembran y
//      truncan sus propias filas);
//   3. no tiene ninguna conexión viva (si alguien la usa, es de una corrida en
//      curso, no una huérfana).
// Si el registro no se puede leer, NO se barre nada y se avisa. Acumular basura
// una corrida más es barato; borrar una base que no había que borrar, no.
//
// Además toma el MISMO advisory lock que `usarLockMasterTest()`. Eso da la
// garantía que hace seguro el barrido frente a corridas concurrentes: cada spec
// crea su base efímera DESPUÉS de tomar el turno y la dropea ANTES de soltarlo,
// así que mientras el barrido tiene el turno, no existe ninguna base efímera de
// una corrida viva. Si el turno no se consigue rápido, el barrido se saltea: es
// tarea de limpieza, nunca puede demorar el arranque de los tests.
import pg from 'pg';

import { asegurarHostLocal, redactarUrl } from '../scripts/lib/guardarrail-host.mjs';
import { claveDeLockMaster, seleccionarHuerfanas } from '../scripts/lib/barrido-huerfanas.mjs';

const { Client } = pg;

const URL_MASTER_TEST_POR_DEFECTO =
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

/** Base que lleva el registro de clientes REALES. */
const BASE_REGISTRO = 'soporte_master';

/** Cuánto se espera el turno antes de saltear el barrido. Corto a propósito. */
const ESPERA_TURNO_MS = 30_000;
const REINTENTO_MS = 100;

const PREFIJO = '[barrido-huerfanas]';

function urlHacia(urlBase, nombreBase) {
  const url = new URL(urlBase);
  url.pathname = `/${nombreBase}`;
  return url.toString();
}

async function conectar(url) {
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

async function tomarTurno(client, clave) {
  const limite = Date.now() + ESPERA_TURNO_MS;
  for (;;) {
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS tomado', [clave]);
    if (rows[0]?.tomado) return true;
    if (Date.now() > limite) return false;
    await new Promise((resolve) => setTimeout(resolve, REINTENTO_MS));
  }
}

/**
 * Vacia `auth_intentos_fallidos` de la master de test una vez por corrida (I8): el estado del
 * limitador sobrevive entre corridas y arrastraria bloqueos a los e2e que hacen login. Corre con
 * el turno tomado, asi que no pisa a una corrida viva. Nunca aborta la suite.
 */
async function vaciarIntentosFallidos(urlMaster) {
  let client;
  try {
    client = await conectar(urlMaster);
    await client.query('TRUNCATE auth_intentos_fallidos');
  } catch (error) {
    console.warn(`${PREFIJO} No se pudo vaciar auth_intentos_fallidos: ${error.message}`);
  } finally {
    await client?.end();
  }
}

/**
 * Lee los `db_name` de los tenants reales.
 * @returns {Promise<string[] | null>} `null` si no se pudo leer (y entonces no se barre).
 */
async function leerRegistroDeClientes(urlMaster) {
  let client;
  try {
    client = await conectar(urlHacia(urlMaster, BASE_REGISTRO));
    const { rows } = await client.query('SELECT db_name FROM clientes');
    return rows.map((row) => row.db_name);
  } catch (error) {
    console.warn(
      `${PREFIJO} No se pudo leer el registro de clientes en ${BASE_REGISTRO}, ` +
        `no se barre nada esta corrida: ${error.message}`,
    );
    return null;
  } finally {
    await client?.end();
  }
}

export default async function globalSetup() {
  const urlMaster = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
  asegurarHostLocal(urlMaster, 'DATABASE_URL_MASTER (barrido de huérfanas)');

  const clave = claveDeLockMaster(urlMaster);
  let admin;

  try {
    admin = await conectar(urlHacia(urlMaster, 'postgres'));

    if (!(await tomarTurno(admin, clave))) {
      console.warn(
        `${PREFIJO} Otra corrida tiene el turno sobre la master de test; ` +
          'se saltea el barrido (no bloquea el arranque).',
      );
      return;
    }

    try {
      await vaciarIntentosFallidos(urlMaster);
      const dbNamesRegistrados = await leerRegistroDeClientes(urlMaster);
      if (dbNamesRegistrados === null) return;

      const { rows: filasBases } = await admin.query(
        'SELECT datname FROM pg_database WHERE NOT datistemplate',
      );
      const { rows: filasEnUso } = await admin.query(
        'SELECT DISTINCT datname FROM pg_stat_activity WHERE datname IS NOT NULL',
      );

      const { aBorrar } = seleccionarHuerfanas({
        bases: filasBases.map((f) => f.datname),
        dbNamesRegistrados,
        basesConConexiones: filasEnUso.map((f) => f.datname),
      });

      if (aBorrar.length === 0) return;

      for (const nombre of aBorrar) {
        // El nombre viene de pg_database y ya pasó el patrón estricto; se cita
        // igual porque construir DDL sin citar el identificador es una mala
        // costumbre incluso cuando en este caso concreto no puede morder.
        await admin.query(`DROP DATABASE IF EXISTS "${nombre}"`);
      }
      console.info(
        `${PREFIJO} ${aBorrar.length} base(s) efímera(s) huérfana(s) borrada(s): ` +
          `${aBorrar.join(', ')}`,
      );
    } finally {
      await admin.query('SELECT pg_advisory_unlock($1)', [clave]);
    }
  } catch (error) {
    // Limpiar es opcional; correr los tests no. Un fallo acá se avisa y se sigue
    // — jamás aborta la suite. (El corte por host no local sí aborta: ese sale
    // antes de este try, a propósito.)
    console.warn(
      `${PREFIJO} El barrido falló contra ${redactarUrl(urlMaster)}, se sigue igual: ` +
        `${error.message}`,
    );
  } finally {
    await admin?.end();
  }
}
