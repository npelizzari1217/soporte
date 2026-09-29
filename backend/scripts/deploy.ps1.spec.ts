/**
 * Parametros de `deploy.ps1` — runtime real via pwsh.
 *
 * `-RollbackCommit` es lo unico que la instancia vieja le pasa a la nueva
 * cuando el pull cambio el script (paso 3b, #139). Sin `[CmdletBinding()]`, un
 * nombre mal tipeado (`-RolbackCommit <sha>`) caia en `$args` sin quejarse, el
 * parametro quedaba vacio y el deploy seguia como una corrida normal. Con
 * `[CmdletBinding()]` un argumento desconocido corta antes de ejecutar nada.
 *
 * Usa el bloque `param` real con un cuerpo inocuo (`testing/pwsh-param-block.ts`):
 * nunca ejecuta el deploy. Sin pwsh, la suite se skippea.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { correrParamBlock, MARCA_CUERPO, pwsh } from './testing/pwsh-param-block';

const PS1_PATH = join(__dirname, '..', '..', 'deploy.ps1');

const suite = pwsh ? describe : describe.skip;

suite('Parametros de deploy.ps1 — runtime real via pwsh', () => {
  it('sin argumentos (corrida normal) llega al cuerpo', () => {
    const r = correrParamBlock(PS1_PATH, []);
    expect(r.exitCode).toBe(0);
    expect(r.salida).toContain(MARCA_CUERPO);
  });

  it('-RollbackCommit, como lo pasa el paso 3b a la version nueva, llega bindeado', () => {
    const r = correrParamBlock(PS1_PATH, ['-RollbackCommit', 'bbc8f07c']);
    expect(r.exitCode).toBe(0);
    expect(r.salida).toContain(`${MARCA_CUERPO} RollbackCommit=bbc8f07c`);
  });

  it('un parametro mal tipeado (`-RolbackCommit`) corta ANTES de ejecutar el cuerpo', () => {
    const r = correrParamBlock(PS1_PATH, ['-RolbackCommit', 'bbc8f07c']);
    expect(r.exitCode).not.toBe(0);
    expect(r.salida).not.toContain(MARCA_CUERPO);
  });
});
