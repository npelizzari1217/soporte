#!/usr/bin/env node
/**
 * Verifica que `docs/roadmap-comercial.md` no este afirmando un estado vencido.
 *
 * El problema que resuelve: el roadmap declara a mano que punto esta entregado y
 * cual sigue abierto, y ese estado envejece sin que nadie se entere. Fallo dos
 * veces por la misma causa (#133 y #205). La segunda vez la correccion duro SEIS
 * HORAS: se escribio a las 16:59 del 2026-09-09 y el punto que daba por pendiente
 * se mergeo a `main` a las 22:52 del mismo dia. Siguio mintiendo dos semanas.
 *
 * Es la misma forma de defecto que resolvio `check-gate-coverage.mjs` — una lista
 * mantenida a mano que envejece — y se ataca con el mismo criterio: en vez de
 * confiar en que alguien se acuerde de actualizarla, se la contrasta contra el
 * repo.
 *
 * Lo que este check SI hace:
 *
 *   1. Exige que el encabezado declare un ancla: contra que commit de `main` se
 *      contrasto el documento la ultima vez.
 *   2. Exige que ese sha exista y sea ancestro de `main`. Un ancla que cita un
 *      commit que nunca llego a `main` no verifica nada.
 *   3. Mide la distancia entre el ancla y `main`, y falla pasado el umbral. Este
 *      es el punto que ataca la causa: el documento no puede envejecer en
 *      silencio, porque el CI cuenta los commits.
 *   4. Exige que todo sha citado como evidencia en la tabla de los seis puntos
 *      exista y sea ancestro de `main`.
 *
 * Lo que este check NO hace, a proposito: decidir si un punto esta hecho. Eso es
 * juicio humano. Un check que pretenda inferir "entregado" leyendo el historial
 * va a dar falsos verdes, y un falso verde es PEOR que el problema que resuelve:
 * entonces mienten el documento Y el control que debia atraparlo.
 *
 * Uso (desde la raiz del repo; no hay package.json raiz, por eso no es un script
 * de npm):
 *
 *   node scripts/check-roadmap-fresco.mjs
 *   node scripts/check-roadmap-fresco.mjs <ruta-al-documento>
 *
 * El segundo argumento existe para poder ejercitar los modos de falla sobre una
 * copia, sin ensuciar el documento real.
 *
 * OJO EN CI: necesita historia completa. `actions/checkout` clona con
 * `fetch-depth: 1` por defecto y sobre un clon superficial `merge-base
 * --is-ancestor` y `rev-list` fallan o mienten. El job declara `fetch-depth: 0`.
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const DOCUMENTO_POR_DEFECTO = 'docs/roadmap-comercial.md';

/**
 * Umbral de distancia, en commits, entre el ancla y `main`.
 *
 * Por que 75 y no un numero mas chico: entre el 2026-09-07 y el 2026-09-23 este
 * repo acumulo 218 commits en `main`, o sea ~13 por dia. Con ese ritmo, 75
 * commits son unos cinco o seis dias de trabajo. Un umbral de 20 o 30 se
 * disparoria dos veces por semana, y un check que se dispara todo el tiempo se
 * ignora — cambiamos un documento que miente por una alarma que nadie lee.
 *
 * El caso #205, que es el que hay que atrapar, quedo a mas de 60 commits del
 * ancla que declaraba. Este umbral lo habria atrapado.
 *
 * Si el ritmo del repo cambia, cambia este numero. Con su motivo escrito.
 */
const UMBRAL_COMMITS = 75;

/** `Actualizado el 2026-09-23 contra el codigo de `main` (`ee7761a`)` */
const ANCLA = /Actualizado el (\d{4}-\d{2}-\d{2}) contra el c[oó]digo de `main` \(`([0-9a-f]{7,40})`\)/;

/** Encabezado de la tabla cuyas celdas de estado se contrastan. */
const SECCION_TABLA = '## Los seis puntos';

/**
 * Un sha citado como evidencia. Exige 7+ digitos hex para no confundirse con una
 * palabra entre backticks. Una palabra de 7+ letras que sean TODAS hexadecimales
 * es rarisima, pero si algun dia aparece este check falla en voz alta y alguien
 * la ve — que es justo lo contrario del modo de falla que estamos corrigiendo.
 */
const SHA_CITADO = /`([0-9a-f]{7,40})`/g;

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

/**
 * Resuelve la referencia a `main`. En un clon de desarrollo alcanza con `main`,
 * pero en CI el checkout de un PR deja la rama solo como `origin/main`: pedir
 * `main` a secas ahi falla con "unknown revision". Se prueban las dos, en ese
 * orden, y si ninguna resuelve el check para en vez de comparar contra nada.
 */
function resolverMain() {
  for (const ref of ['main', 'origin/main', 'refs/remotes/origin/main']) {
    try {
      execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { stdio: 'ignore' });
      return ref;
    } catch {
      // probamos la siguiente
    }
  }
  console.error(
    'ERROR: no pude resolver `main` ni `origin/main` en este clon.\n' +
      '  En CI suele ser un clon superficial: el job necesita `fetch-depth: 0`.',
  );
  process.exit(1);
}

const MAIN = resolverMain();

/** true si `sha` existe y es ancestro de `main`. */
function esAncestroDeMain(sha) {
  try {
    // stdio ignorado: si el sha no existe, `cat-file` escupe un "fatal:" a stderr
    // que no aporta nada — el mensaje de error de este check ya dice que pasa.
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
  } catch {
    return { ok: false, motivo: 'no existe en el repo' };
  }
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sha, MAIN], { stdio: 'ignore' });
  } catch {
    return { ok: false, motivo: 'existe pero NO es ancestro de `main`' };
  }
  return { ok: true };
}

/** Extrae las filas de la tabla de los seis puntos, con su numero de linea. */
function filasDeLaTabla(lineas) {
  const inicio = lineas.findIndex((l) => l.trim() === SECCION_TABLA);
  if (inicio === -1) return null;

  const filas = [];
  for (let i = inicio + 1; i < lineas.length; i += 1) {
    const linea = lineas[i];
    if (linea.startsWith('## ')) break;
    if (!linea.startsWith('|')) continue;
    if (/^\|[\s|:-]+\|$/.test(linea)) continue; // separador
    filas.push({ numero: i + 1, texto: linea });
  }
  return filas;
}

const ruta = process.argv[2] ?? DOCUMENTO_POR_DEFECTO;
const errores = [];

let contenido;
try {
  contenido = readFileSync(ruta, 'utf8');
} catch {
  console.error(`ERROR: no pude leer "${ruta}".`);
  process.exit(1);
}
const lineas = contenido.split('\n');

// 1 y 2 — el ancla existe, y su sha llego a `main`.
const ancla = contenido.match(ANCLA);
if (!ancla) {
  errores.push(
    'El encabezado no declara contra que commit se contrasto el documento.\n' +
      '  Tiene que decir, textual: Actualizado el YYYY-MM-DD contra el codigo de `main` (`sha`).\n' +
      '  Sin ancla no hay forma de saber si lo que afirma sigue siendo cierto.',
  );
} else {
  const [, fecha, sha] = ancla;
  const veredicto = esAncestroDeMain(sha);

  if (!veredicto.ok) {
    errores.push(
      `El ancla del encabezado cita \`${sha}\` (${fecha}), que ${veredicto.motivo}.\n` +
        '  Un ancla que apunta a un commit que no llego a `main` no verifica nada.',
    );
  } else {
    // 3 — la distancia al `main` actual.
    const distancia = Number(git('rev-list', '--count', `${sha}..${MAIN}`));
    console.log(`Ancla: ${sha} (${fecha}) | distancia a main: ${distancia} commits (umbral: ${UMBRAL_COMMITS})`);

    if (distancia > UMBRAL_COMMITS) {
      errores.push(
        `El documento se contrasto por ultima vez contra \`${sha}\` (${fecha}) y desde ` +
          `entonces entraron ${distancia} commits a \`main\` — pasa el umbral de ${UMBRAL_COMMITS}.\n` +
          '  Re-contrastalo contra el codigo, archivo por archivo, y actualiza el ancla del\n' +
          '  encabezado al `main` con el que lo verificaste. Este check no puede saber si lo\n' +
          '  que el documento afirma sigue siendo cierto: solo sabe que hace rato que nadie\n' +
          '  lo mira.',
      );
    }
  }
}

// 4 — los shas citados como evidencia en la tabla de los seis puntos.
const filas = filasDeLaTabla(lineas);
if (filas === null) {
  errores.push(`No encontre la seccion "${SECCION_TABLA}" en el documento.`);
} else {
  let citados = 0;
  for (const fila of filas) {
    for (const [, sha] of fila.texto.matchAll(SHA_CITADO)) {
      citados += 1;
      const veredicto = esAncestroDeMain(sha);
      if (!veredicto.ok) {
        errores.push(
          `${ruta}:${fila.numero} cita \`${sha}\` como evidencia, y ${veredicto.motivo}.\n` +
            '  Un estado que se apoya en evidencia inverificable no es mejor que uno sin evidencia.',
        );
      }
    }
  }
  console.log(`Tabla de los seis puntos: ${filas.length} filas | ${citados} shas citados`);
}

if (errores.length > 0) {
  for (const error of errores) console.error(`\nERROR: ${error}`);
  process.exit(1);
}

console.log('El roadmap esta fresco.');
