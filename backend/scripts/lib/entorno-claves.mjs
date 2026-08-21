// Comparación de claves de entorno y clasificación de su origen.
//
// Ref spec: sdd/regeneracion-reproducible, spec "entorno-verificar-claves".
// Ref design: sdd/regeneracion-reproducible D3, D6.
//
// PURO por construcción, igual que guardarrail-host.mjs: recibe mapas ya
// parseados (nunca lee `.env*` ni `process.env`) y NUNCA devuelve un valor de
// clave — solo nombres. Es lo que hace estructuralmente imposible que un
// reporte filtre un secreto.
import { clasificarOrigen } from './guardarrail-host.mjs';

/**
 * Compara las claves requeridas (`.env.example`) contra las efectivas del
 * entorno actual. Nunca imprime ni devuelve un valor, solo nombres de clave.
 *
 * - `faltantes`: clave de `ejemplo` ausente en `actual`.
 * - `placeholders`: la clave está presente pero quedó con exactamente el
 *   mismo valor que `.env.example` — indicio de que nadie la completó.
 *   Un valor de ejemplo vacío (`''`) nunca cuenta como placeholder: no hay
 *   "valor de ejemplo sin cambiar" que detectar ahí.
 * - `extras`: clave presente en `actual` que no existe en `.env.example`.
 *
 * @param {{ejemplo: Record<string, string>, actual: Record<string, string>}} entrada
 * @returns {{faltantes: string[], placeholders: string[], extras: string[]}}
 */
export function compararClaves({ ejemplo = {}, actual = {} } = {}) {
  const clavesEjemplo = Object.keys(ejemplo);
  const clavesActual = Object.keys(actual);

  const faltantes = clavesEjemplo.filter((clave) => !(clave in actual));
  const placeholders = clavesEjemplo.filter(
    (clave) => clave in actual && ejemplo[clave] !== '' && actual[clave] === ejemplo[clave],
  );
  const extras = clavesActual.filter((clave) => !(clave in ejemplo));

  return { faltantes, placeholders, extras };
}

/**
 * Clasifica el origen de cada clave presente en `envProceso` y/o
 * `envArchivo`. Wrapper DELGADO sobre `clasificarOrigen` (guardarrail-host.mjs,
 * W1): esa función ya trae exactamente esta regla, incluido el caso
 * "sesión de shell (PISA a .env)" — acá solo se la aplica clave por clave
 * sobre un mapa entero en vez de recibir dos booleanos sueltos. Reusar en
 * vez de reimplementar evita dos fuentes de verdad para la misma
 * clasificación.
 * @param {{envProceso?: Record<string, string|undefined>, envArchivo?: Record<string, string|undefined>}} entrada
 * @returns {Record<string, 'sesión de shell' | 'archivo .env' | 'sesión de shell (PISA a .env)' | 'desconocido'>}
 */
export function clasificarOrigenClaves({ envProceso = {}, envArchivo = {} } = {}) {
  const claves = new Set([...Object.keys(envProceso), ...Object.keys(envArchivo)]);

  const resultado = {};
  for (const clave of claves) {
    resultado[clave] = clasificarOrigen(clave in envProceso, clave in envArchivo);
  }
  return resultado;
}
