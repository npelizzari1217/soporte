/**
 * Parametros de `predeploy-dump.ps1` — runtime real via pwsh.
 *
 * Misma trampa que `rotate-email-crypto-key.ps1` (fix `ca2dc35`): invocado por
 * ssh contra el VPS, cuyo shell por defecto es cmd, `-File predeploy-dump.ps1
 * -DryRun; echo ...` le pasa a PowerShell el argumento literal `-DryRun;`. Sin
 * `[CmdletBinding()]` el script lo acepta en `$args` sin quejarse, `$DryRun`
 * queda en `$false` y corre la version REAL: detiene los servicios y dumpea
 * todas las bases, cuando lo pedido era un dry-run que no toca nada.
 *
 * Usa el bloque `param` real con un cuerpo inocuo (`testing/pwsh-param-block.ts`):
 * nunca ejecuta el script de dump. Sin pwsh, la suite se skippea.
 */
import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { correrParamBlock, MARCA_CUERPO, pwsh, PWSH_TIMEOUT_MS } from './testing/pwsh-param-block';

vi.setConfig({ testTimeout: PWSH_TIMEOUT_MS, hookTimeout: PWSH_TIMEOUT_MS });

const PS1_PATH = join(__dirname, '..', '..', 'predeploy-dump.ps1');

const suite = pwsh ? describe : describe.skip;

suite('Parametros de predeploy-dump.ps1 — runtime real via pwsh', () => {
  it('-DryRun bien pasado llega al cuerpo con DryRun en true', () => {
    const r = correrParamBlock(PS1_PATH, ['-DryRun']);
    expect(r.exitCode).toBe(0);
    expect(r.salida).toContain(`${MARCA_CUERPO} DryRun=True`);
  });

  it('un argumento desconocido (`-DryRun;`, como lo pasa cmd) corta ANTES de ejecutar el cuerpo', () => {
    const r = correrParamBlock(PS1_PATH, ['-DryRun;']);
    expect(r.exitCode).not.toBe(0);
    expect(r.salida).not.toContain(MARCA_CUERPO);
  });
});
