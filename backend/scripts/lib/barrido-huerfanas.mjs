// Barrido de bases tenant EFÍMERAS que quedaron huérfanas.
//
// POR QUÉ EXISTE: cada spec de integración/e2e con tenant propio crea su base
// en el `beforeAll` y la dropea en el `afterAll`. Si el proceso se muere antes
// del `afterAll` — Ctrl+C, un crash, el guardarraíl de host cortando la corrida
// — nadie limpia, y la base queda dando vueltas para siempre. Se acumulan.
//
// PURO por construcción, igual que `guardarrail-host.mjs`: ninguna función de
// este módulo se conecta, lee el filesystem ni toca `process.env`. Recibe la
// foto ya tomada (qué bases hay, cuáles están registradas como clientes reales,
// cuáles tienen conexiones vivas) y devuelve la decisión. El adaptador
// (`test/barrido-huerfanas.global-setup.mjs`) es el que mira el mundo y ejecuta.
// Eso es lo que permite testear a fondo un módulo que dropea bases sin dropear
// ninguna.

/**
 * Nombre de una base tenant EFÍMERA de test.
 *
 * Estricto a propósito, porque el precio de un falso positivo acá es una base
 * borrada. Exige las TRES cosas: el prefijo `soporte_prov_`, un segmento de 8
 * caracteres hexadecimales (el `randomBytes(4).toString('hex')` que los specs
 * le cuelgan al nombre) y el sufijo `_test`. El slug del medio es opcional
 * porque hay specs que lo ponen (`autorizE2E`, `tickiso`) y uno que no.
 *
 * Una base de tenant REAL se llama `soporte_<32 hex>`: no tiene `_prov_` ni
 * `_test`, así que no puede entrar ni por error. `soporte_prov_demo_test`
 * tampoco entra — es un nombre fijo de tests unitarios, sin segmento hex.
 */
export const PATRON_BASE_EFIMERA = /^soporte_prov_(?:[A-Za-z0-9]+_)?[0-9a-f]{8}_test$/;

/** Motivos por los que una base se conserva. Sirven para el log del adaptador. */
export const MOTIVO = {
  NO_ES_EFIMERA: 'no_es_efimera',
  TENANT_REGISTRADO: 'tenant_registrado',
  EN_USO: 'en_uso',
};

/**
 * Decide qué bases se pueden dropear.
 *
 * Fail-closed en las tres puertas: una base se borra sólo si pasa TODAS. Si
 * falta información (por ejemplo no se pudo leer el registro de clientes), el
 * llamador debe pasar listas vacías sólo cuando sabe que están vacías de
 * verdad — ante la duda, no barrer es la respuesta correcta.
 *
 * @param {object} params
 * @param {string[]} params.bases Todas las bases que existen en el servidor.
 * @param {string[]} params.dbNamesRegistrados `db_name` de la tabla `clientes` (tenants REALES).
 * @param {string[]} params.basesConConexiones Bases con al menos una conexión viva.
 * @returns {{ aBorrar: string[], conservadas: Array<{ nombre: string, motivo: string }> }}
 */
export function seleccionarHuerfanas({
  bases = [],
  dbNamesRegistrados = [],
  basesConConexiones = [],
}) {
  const registrados = new Set(dbNamesRegistrados);
  const enUso = new Set(basesConConexiones);

  const aBorrar = [];
  const conservadas = [];

  for (const nombre of bases) {
    if (!PATRON_BASE_EFIMERA.test(nombre)) {
      conservadas.push({ nombre, motivo: MOTIVO.NO_ES_EFIMERA });
      continue;
    }
    // Cinturón y tiradores: por el patrón esto no debería pasar nunca, pero un
    // tenant real borrado no se recupera y la comprobación cuesta nada.
    if (registrados.has(nombre)) {
      conservadas.push({ nombre, motivo: MOTIVO.TENANT_REGISTRADO });
      continue;
    }
    // Alguien la está usando: es de una corrida VIVA, no una huérfana.
    if (enUso.has(nombre)) {
      conservadas.push({ nombre, motivo: MOTIVO.EN_USO });
      continue;
    }
    aBorrar.push(nombre);
  }

  return { aBorrar, conservadas };
}

/**
 * Clave del advisory lock que serializa el acceso a la master de test.
 *
 * DUPLICADA a propósito de `src/testing/lock-master-test.ts`: este módulo es
 * `.mjs` y aquél es `.ts`, y el proyecto no tiene `allowJs`, así que uno no
 * puede importar al otro sin romper el typecheck. La duplicación está
 * amarrada por un test que compara las dos implementaciones — si alguna
 * cambia sola, ese test falla. Sin esa amarra sería una bomba de tiempo:
 * dos claves distintas serían dos turnos distintos sobre la misma base, es
 * decir, ninguna exclusión.
 *
 * @param {string} urlMaster
 * @returns {number}
 */
export function claveDeLockMaster(urlMaster) {
  const nombreBase = new URL(urlMaster).pathname.replace(/^\//, '');
  let hash = 0x811c9dc5;
  for (let i = 0; i < nombreBase.length; i += 1) {
    hash ^= nombreBase.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}
