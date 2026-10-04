/**
 * Parametros de `rotate-admin-pw.ps1` — runtime real via pwsh.
 *
 * Sin `-Email`, el script rota la clave de `ROOT_ADMIN_EMAIL`. Sin
 * `[CmdletBinding()]`, un nombre mal tipeado (`-Emial otro@x.com`) caia en
 * `$args` sin quejarse, `$Email` quedaba vacio y el script rotaba la clave del
 * admin ROOT en vez de la del usuario pedido. Con `[CmdletBinding()]` un
 * argumento desconocido corta antes de ejecutar nada.
 *
 * Usa el bloque `param` real con un cuerpo inocuo (`testing/pwsh-param-block.ts`):
 * nunca rota nada. Sin pwsh, la suite se skippea.
 */
import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { correrParamBlock, MARCA_CUERPO, pwsh, PWSH_TIMEOUT_MS } from './testing/pwsh-param-block';

vi.setConfig({ testTimeout: PWSH_TIMEOUT_MS, hookTimeout: PWSH_TIMEOUT_MS });

const PS1_PATH = join(__dirname, '..', '..', 'rotate-admin-pw.ps1');

const suite = pwsh ? describe : describe.skip;

suite('Parametros de rotate-admin-pw.ps1 — runtime real via pwsh', () => {
  it('-Email bien pasado llega bindeado', () => {
    const r = correrParamBlock(PS1_PATH, ['-Email', 'tecnico@ejemplo.com']);
    expect(r.exitCode).toBe(0);
    expect(r.salida).toContain(`${MARCA_CUERPO} Email=tecnico@ejemplo.com`);
  });

  it('un parametro mal tipeado (`-Emial`) corta ANTES de ejecutar el cuerpo, en vez de caer al ROOT', () => {
    const r = correrParamBlock(PS1_PATH, ['-Emial', 'tecnico@ejemplo.com']);
    expect(r.exitCode).not.toBe(0);
    expect(r.salida).not.toContain(MARCA_CUERPO);
  });
});
