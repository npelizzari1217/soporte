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
 * El harness toma el bloque `param` del .ps1 real (con sus atributos, que
 * `ParamBlock.Extent` NO incluye) y le pone un cuerpo inocuo: nunca ejecuta el
 * script de dump.
 *
 * Requiere `pwsh` (7+):
 *   PWSH_PATH=<ruta a pwsh> pnpm vitest run scripts/predeploy-dump.ps1.spec.ts
 * Sin `PWSH_PATH` y sin `pwsh` en el PATH, la suite se skippea.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PS1_PATH = join(__dirname, '..', '..', 'predeploy-dump.ps1');
// pwsh en un contenedor/WSL sin ICU del sistema aborta sin esto.
const PWSH_ENV = { ...process.env, DOTNET_SYSTEM_GLOBALIZATION_INVARIANT: '1' };

function resolverPwsh(): string | null {
  const candidato = process.env.PWSH_PATH || 'pwsh';
  try {
    execFileSync(candidato, ['-NoProfile', '-Command', 'exit 0'], {
      env: PWSH_ENV,
      stdio: 'ignore',
    });
    return candidato;
  } catch {
    return null;
  }
}

const pwsh = resolverPwsh();

const EXTRAER_PARAM_PS1 = [
  'param([string]$RealScriptPath, [string]$OutPath)',
  "$ErrorActionPreference = 'Stop'",
  '$tokens = $null; $errors = $null',
  '$ast = [System.Management.Automation.Language.Parser]::ParseFile($RealScriptPath, [ref]$tokens, [ref]$errors)',
  "if ($errors.Count -gt 0 -or -not $ast.ParamBlock) { throw 'param block not found in real script' }",
  '$atributos = @($ast.ParamBlock.Attributes | ForEach-Object { $_.Extent.Text }) -join [Environment]::NewLine',
  'Set-Content -Path $OutPath -Encoding ascii -Value ($atributos + [Environment]::NewLine + $ast.ParamBlock.Extent.Text + [Environment]::NewLine + \'Write-Host ("CUERPO-EJECUTADO DryRun=" + $DryRun)\')',
].join('\n');

const suite = pwsh ? describe : describe.skip;

suite('Parametros de predeploy-dump.ps1 — runtime real via pwsh', () => {
  function correrConArgs(args: string[]): { exitCode: number; salida: string } {
    const dir = mkdtempSync(join(tmpdir(), 'predeploy-ps1-params-spec-'));
    try {
      const extraerPath = join(dir, 'extraer.ps1');
      const cuerpoPath = join(dir, 'solo-param.ps1');
      writeFileSync(extraerPath, EXTRAER_PARAM_PS1, 'ascii');
      execFileSync(
        pwsh as string,
        ['-NoProfile', '-File', extraerPath, '-RealScriptPath', PS1_PATH, '-OutPath', cuerpoPath],
        { env: PWSH_ENV },
      );
      try {
        const stdout = execFileSync(pwsh as string, ['-NoProfile', '-File', cuerpoPath, ...args], {
          env: PWSH_ENV,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { exitCode: 0, salida: stdout.toString('utf8') };
      } catch (err) {
        const e = err as { status: number | null; stdout: Buffer; stderr: Buffer };
        return {
          exitCode: e.status ?? -1,
          salida: (e.stdout?.toString('utf8') ?? '') + (e.stderr?.toString('utf8') ?? ''),
        };
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('-DryRun bien pasado llega al cuerpo con DryRun en true', () => {
    const r = correrConArgs(['-DryRun']);
    expect(r.exitCode).toBe(0);
    expect(r.salida).toContain('CUERPO-EJECUTADO DryRun=True');
  });

  it('un argumento desconocido (`-DryRun;`, como lo pasa cmd) corta ANTES de ejecutar el cuerpo', () => {
    const r = correrConArgs(['-DryRun;']);
    expect(r.exitCode).not.toBe(0);
    expect(r.salida).not.toContain('CUERPO-EJECUTADO');
  });
});
