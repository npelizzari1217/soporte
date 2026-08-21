// CLI de regeneración/verificación del entorno local de desarrollo y test.
//
// Ref proposal/spec: sdd/regeneracion-reproducible.
// Ref design: sdd/regeneracion-reproducible D1-D6.
//
// Esta entrega (W2) solo trae el subcomando `verificar`: read-only, NUNCA
// abre una conexión ni toca el filesystem salvo para leer `.env`/`.env.example`
// (dotenv.parse, sin mutar `process.env`). Los subcomandos de escritura
// (`regenerar`, `--confirmar`, `--recrear-test`) llegan en W3-W5.
//
// Idiom (mismo que scripts/backfill-correo-clientes.mjs y scripts/reset-password.ts):
// funciones puras exportadas + `main()` bajo el guard de invocación directa.
// `ejecutarVerificar` recibe los mapas YA PARSEADOS — nunca lee `.env*` por su
// cuenta — para que los tests la ejerciten con literales, sin tocar ningún
// archivo real.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { auditarEntorno } from './lib/guardarrail-host.mjs';
import { clasificarOrigenClaves, compararClaves } from './lib/entorno-claves.mjs';

const RUTA_BACKEND = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

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
 * }} entrada
 * @returns {{exitCode: number, lineas: string[]}}
 */
export function ejecutarVerificar({ envEjemplo, envArchivo, envProceso }) {
  const lineas = [];
  let exitCode = 0;

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
    lineas.push(`[entorno:verificar] Claves faltantes: ${comparacionRequeridas.faltantes.join(', ')}`);
  }
  if (comparacionRequeridas.placeholders.length > 0) {
    exitCode = 1;
    lineas.push(
      `[entorno:verificar] Claves con el valor de ejemplo sin cambiar: ${comparacionRequeridas.placeholders.join(', ')}`,
    );
  }
  if (extras.length > 0) {
    // Informativo, no bloquea: una clave extra en .env no impide que el sistema arranque.
    lineas.push(`[entorno:verificar] Claves extra en .env (no están en .env.example): ${extras.join(', ')}`);
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

/**
 * Punto de entrada del CLI. Único adaptador que lee el mundo (argv, `.env`,
 * `.env.example`, `process.env`) — toda la decisión vive en `ejecutarVerificar`.
 */
async function main() {
  const [subcomando] = process.argv.slice(2);

  if (subcomando !== 'verificar') {
    console.error(
      `[entorno] subcomando desconocido: "${subcomando ?? ''}". Uso: node regenerar-entorno.mjs verificar`,
    );
    process.exitCode = 1;
    return;
  }

  const envEjemplo = leerEnvArchivo(path.join(RUTA_BACKEND, '.env.example'));
  if (envEjemplo === null) {
    console.error(
      '[entorno:verificar] no se pudo leer .env.example — no puedo derivar las claves requeridas.',
    );
    process.exitCode = 1;
    return;
  }
  const envArchivo = leerEnvArchivo(path.join(RUTA_BACKEND, '.env')) ?? {};

  const { exitCode, lineas } = ejecutarVerificar({
    envEjemplo,
    envArchivo,
    envProceso: { ...process.env },
  });

  for (const linea of lineas) console.log(linea);
  process.exitCode = exitCode;
}

// Solo corre el CLI real si el archivo se invoca directamente — así los
// tests pueden importar `ejecutarVerificar` sin tocar ningún `.env*` real.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
