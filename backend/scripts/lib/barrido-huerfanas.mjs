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
 * borrada. Cuatro familias, cada una atada a su generador exacto — si el
 * generador cambia de forma, este patrón se queda corto A PROPÓSITO (fail
 * closed) y hay que ampliarlo a mano, no al revés:
 *
 * 1. `soporte_prov_(<slug>_)?<8 hex>_test` — `randomBytes(4).toString('hex')`
 *    colgado al nombre por la mayoría de los specs e2e/integration
 *    (`test/preventivo.e2e.spec.ts`,
 *    `src/tickets/interface/controllers/tickets.e2e.spec.ts`, y el resto de
 *    los `*.e2e.spec.ts` de `src/`). El slug es opcional porque hay specs que
 *    lo ponen (`autorizE2E`, `tickiso`) y uno que no.
 *
 * 2. `soporte_e2e_cliente_<16 hex>_test` — de
 *    `src/clientes/interface/controllers/crear-cliente.e2e.spec.ts`:
 *    ``soporte_e2e_cliente_${clienteId.replace(/-/g,'').slice(0,16)}_test``.
 *    `clienteId` es el UUID de Postgres (`gen_random_uuid()`, siempre
 *    minúsculas) sin guiones, cortado a 16 caracteres.
 *
 * 3. `soporte_demo_seed_it_<16 hex>_test` — de
 *    `prisma_master/seeds/demo-seed.integration.spec.ts`, misma construcción
 *    que la familia 2 (mismo `clienteId` de Postgres, mismo corte a 16).
 *
 * 4. `soporte_regen_<8 hex>_<etiqueta>_test` — de
 *    `scripts/regenerar-entorno.integration.spec.ts`:
 *    ``soporte_regen_${randomBytes(4).toString('hex')}_${etiqueta}_test``.
 *    La etiqueta es siempre una palabra en minúsculas fija en el código del
 *    spec (`master`, `tenanttest`, `recreara`...), nunca generada al azar.
 *
 * Todas exigen hex en minúsculas porque `randomBytes().toString('hex')` y los
 * UUID de Postgres siempre dan minúsculas — un hex en mayúsculas no es un
 * nombre que ningún generador produzca, así que no se acepta.
 *
 * Una base de tenant REAL se llama `soporte_<32 hex>`: no tiene `_prov_`,
 * `_e2e_cliente_`, `_demo_seed_it_` ni `_regen_`, así que no puede entrar ni
 * por error. `soporte_prov_demo_test` tampoco entra — es un nombre fijo de
 * tests unitarios, sin segmento hex.
 */
export const PATRON_BASE_EFIMERA =
  /^soporte_(?:prov_(?:[A-Za-z0-9]+_)?[0-9a-f]{8}|e2e_cliente_[0-9a-f]{16}|demo_seed_it_[0-9a-f]{16}|regen_[0-9a-f]{8}_[a-z]+)_test$/;

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
