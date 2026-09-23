#!/usr/bin/env node
/**
 * Ratchet de los casts que apagan el chequeo de tipos en los specs de backend.
 *
 * El problema que resuelve: un `equipoRepo as never` pasado al constructor de un
 * caso de uso compila aunque al puerto le agreguen un metodo, aunque el mock
 * tenga un nombre mal escrito, o aunque una firma cambie. El test sigue verde
 * describiendo un contrato que ya no existe. Y `pnpm typecheck` no lo frena:
 * `as never` compila. No habia nada que frenara esto.
 *
 * Medido sobre los commits reales, el conteo paso de 527 (2026-08-21) a 693
 * (2026-09-23): +31% en 33 dias, unas 5 por dia.
 *
 * La convencion correcta ya existe y es anterior a esta deuda: completar el mock
 * contra su interfaz real, con `unstubbed(nombre)` de `src/testing/mocks.ts` para
 * los metodos que el test no ejercita — asi fallan ruidoso en vez de devolver
 * `undefined` en silencio. Nacio el 2026-08-21, en el MISMO commit que instalo el
 * gate de tipos sobre specs. El `as never` no es la ausencia de una convencion:
 * es su elusion.
 *
 * Este check no migra nada. Congela el numero y obliga a que cada cambio lo baje
 * o lo deje igual.
 *
 * Uso (desde la raiz del repo):
 *
 *   node scripts/check-casts-en-specs.mjs
 *   node scripts/check-casts-en-specs.mjs <directorio-raiz-alternativo>
 *
 * El argumento existe para poder ejercitar los modos de falla sobre una copia del
 * arbol, sin ensuciar el repo.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * Linea base: el conteo del 2026-09-23 sobre `main` (`1263213`), medido por este
 * mismo script.
 *
 * Se baja cuando un cambio convierte casts a mocks completos. Se sube SOLO con
 * una justificacion escrita en el PR — y si hace falta subirla seguido, el que
 * esta mal es el criterio, no el numero.
 */
const BASE_OCURRENCIAS = 693;
const BASE_ARCHIVOS = 123;

/**
 * Se ratchetean las DOS cifras. Solo el total dejaria pasar que la deuda se
 * disperse a mas archivos, y solo los archivos dejarian pasar que se concentre.
 * Ninguno de los dos movimientos la reduce.
 */

const CAST = /\bas\s+(never|any)\b/g;
const ES_SPEC = /\.(spec|test)\.tsx?$/;

const raiz = process.argv[2] ?? process.cwd();
const dirSpecs = join(raiz, 'backend', 'src');

function listarSpecs(dir) {
  const encontrados = [];
  let entradas;
  try {
    entradas = readdirSync(dir, { withFileTypes: true });
  } catch {
    return encontrados;
  }
  for (const entrada of entradas) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === 'node_modules') continue;
      encontrados.push(...listarSpecs(ruta));
    } else if (ES_SPEC.test(entrada.name)) {
      encontrados.push(ruta);
    }
  }
  return encontrados;
}

/** Cuenta los casts de un texto. */
function contar(texto) {
  return (texto.match(CAST) ?? []).length;
}

const specs = listarSpecs(dirSpecs);
if (specs.length === 0) {
  console.error(`ERROR: no encontre ningun spec bajo "${dirSpecs}".`);
  process.exit(1);
}

const porArchivo = new Map();
let ocurrencias = 0;
for (const ruta of specs) {
  const n = contar(readFileSync(ruta, 'utf8'));
  if (n === 0) continue;
  porArchivo.set(relative(raiz, ruta), n);
  ocurrencias += n;
}
const archivos = porArchivo.size;

console.log(
  `Casts en specs de backend: ${ocurrencias} en ${archivos} archivos ` +
    `(base: ${BASE_OCURRENCIAS} en ${BASE_ARCHIVOS}) — ${specs.length} specs revisados`,
);

/**
 * Atribucion por archivo contra `main`, sin mantener una linea base por archivo:
 * esa lista tendria 123 entradas, cambiaria en cada PR que toque un spec, y
 * envejeceria igual que el numero que este check existe para arreglar. Se
 * calcula sobre la marcha, y si `main` no se puede resolver el check informa
 * igual el total — no se cae por no poder dar el detalle.
 */
function culpablesContraMain() {
  let ref = null;
  for (const candidato of ['main', 'origin/main']) {
    try {
      execFileSync('git', ['rev-parse', '--verify', `${candidato}^{commit}`], { stdio: 'ignore' });
      ref = candidato;
      break;
    } catch {
      // probamos la siguiente
    }
  }
  if (ref === null) return null;

  const subieron = [];
  for (const [ruta, ahora] of porArchivo) {
    let antes = 0;
    try {
      antes = contar(execFileSync('git', ['show', `${ref}:${ruta}`], { encoding: 'utf8' }));
    } catch {
      antes = 0; // archivo nuevo
    }
    if (ahora > antes) subieron.push({ ruta, antes, ahora });
  }
  return subieron;
}

if (ocurrencias > BASE_OCURRENCIAS || archivos > BASE_ARCHIVOS) {
  console.error(
    `\nERROR: los casts en specs SUBIERON — ${ocurrencias} ocurrencias en ${archivos} ` +
      `archivos, contra una base de ${BASE_OCURRENCIAS} en ${BASE_ARCHIVOS}.`,
  );
  const subieron = culpablesContraMain();
  if (subieron && subieron.length > 0) {
    console.error('\n  Archivos que subieron respecto de `main`:');
    for (const { ruta, antes, ahora } of subieron) {
      console.error(`    ${ruta}: ${antes} -> ${ahora}`);
    }
  }
  console.error(
    '\n  La salida NO es agregar el cast: es completar el mock contra su interfaz real.\n' +
      '  `backend/src/testing/mocks.ts` exporta `unstubbed(nombre)` para los metodos que el\n' +
      '  test no ejercita — fallan ruidoso en vez de devolver `undefined` en silencio.\n' +
      '  Un `as never` apaga el chequeo entero: el test sigue verde aunque al puerto le\n' +
      '  agreguen un metodo o le cambien una firma.',
  );
  process.exit(1);
}

if (ocurrencias < BASE_OCURRENCIAS || archivos < BASE_ARCHIVOS) {
  console.error(
    `\nERROR: los casts BAJARON y la linea base quedo vencida.\n` +
      `  Actualizala en ${'scripts/check-casts-en-specs.mjs'}:\n\n` +
      `    const BASE_OCURRENCIAS = ${ocurrencias};\n` +
      `    const BASE_ARCHIVOS = ${archivos};\n\n` +
      '  Una base mas alta que la realidad deja crecer en silencio hasta alcanzarla —\n' +
      '  el mismo motivo por el que check-gate-coverage.mjs falla ante una excepcion\n' +
      '  vencida: esconde la proxima de verdad.',
  );
  process.exit(1);
}

console.log('El ratchet se sostiene: los casts no subieron.');
