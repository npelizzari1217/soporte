#!/usr/bin/env node
/**
 * Verifica que TODOS los proyectos npm del repo esten cubiertos por las compuertas
 * de calidad (lint, test, build).
 *
 * El problema que resuelve: no hay monorepo tool (ni pnpm workspaces raiz ni turbo)
 * en este repo — `backend/` y `frontend/` son dos proyectos pnpm independientes, cada
 * uno con su propio pnpm-lock.yaml — asi que nada corre "todas las compuertas de
 * todos los proyectos" en un solo comando. Si un proyecto nuevo se agrega y nadie
 * actualiza el workflow de CI, ese proyecto queda sin cubrir en silencio: el CI sigue
 * en verde sin haberlo revisado. Una lista de proyectos hardcodeada tiene el mismo
 * problema: envejece.
 *
 * Por eso este check NO mantiene una lista fija: enumera escaneando los
 * directorios de primer nivel del repo que contengan un package.json propio. Asi,
 * un proyecto nuevo entra solo, sin tocar este archivo.
 *
 * Excluir un proyecto es legitimo, pero tiene que estar declarado acá con su
 * motivo por escrito. Exclusion declarada, si. Exclusion silenciosa, no.
 *
 * Uso: se invoca desde la raiz del repo (no hay package.json raiz, por eso no es
 * un script de npm):
 *
 *   node scripts/check-gate-coverage.mjs
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Scripts que todo proyecto debe declarar para estar cubierto. */
const REQUIRED_SCRIPTS = ['lint', 'test', 'build'];

/**
 * Proyectos excluidos, con el motivo. La clave es el nombre del directorio de
 * primer nivel (no el `name` del package.json). Un proyecto listado acá que YA
 * declare todos los scripts se reporta como excepcion vencida y hace fallar el
 * check: obliga a limpiar la lista en vez de dejarla crecer.
 *
 * Vacio a proposito: al verificar backend/package.json y frontend/package.json
 * (2026-09-08), ambos declaran lint, test y build. No hay hueco real que
 * declarar todavia.
 */
const EXCEPTIONS = {};

const ROOT = process.cwd();

/** Enumera los directorios de primer nivel que contienen un package.json propio. */
function listProjects() {
  const entries = readdirSync(ROOT, { withFileTypes: true });
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    if (entry.name === 'node_modules') continue;
    const pkgPath = join(ROOT, entry.name, 'package.json');
    if (!existsSync(pkgPath)) continue;
    projects.push({ name: entry.name, path: join(ROOT, entry.name) });
  }
  return projects;
}

function missingScripts(projectPath) {
  const pkg = JSON.parse(readFileSync(join(projectPath, 'package.json'), 'utf8'));
  const scripts = pkg.scripts ?? {};
  return REQUIRED_SCRIPTS.filter((s) => !scripts[s]);
}

const projects = listProjects();
const uncovered = [];
const staleExceptions = [];
const declared = [];

for (const project of projects) {
  const missing = missingScripts(project.path);
  const reason = EXCEPTIONS[project.name];

  if (missing.length === 0) {
    if (reason) staleExceptions.push(project.name);
    continue;
  }
  if (reason) declared.push({ name: project.name, missing, reason });
  else uncovered.push({ name: project.name, missing });
}

const covered = projects.length - uncovered.length - declared.length;
console.log(`Proyectos: ${projects.length} | cubiertos: ${covered} | excluidos: ${declared.length}`);

for (const d of declared) {
  console.log(`  - ${d.name}: sin [${d.missing.join(', ')}] — excluido: ${d.reason}`);
}

let failed = false;

for (const u of uncovered) {
  console.error(
    `\nERROR: el proyecto "${u.name}" no declara [${u.missing.join(', ')}] y no esta ` +
      'declarado como excepcion.\n' +
      '  Las compuertas lo saltean en silencio: pasan en verde sin haberlo revisado.\n' +
      `  Agregale los scripts, o declaralo con su motivo en EXCEPTIONS de ${import.meta.url.split('/').pop()}.`,
  );
  failed = true;
}

for (const name of staleExceptions) {
  console.error(
    `\nERROR: "${name}" figura en EXCEPTIONS pero ya declara todos los scripts.\n` +
      '  Sacalo de la lista: una excepcion vencida esconde la proxima de verdad.',
  );
  failed = true;
}

process.exit(failed ? 1 : 0);
