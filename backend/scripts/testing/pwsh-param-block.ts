/**
 * Helper de specs para los scripts de operaciones del VPS (`*.ps1` de la raiz).
 *
 * Toma el bloque `param` del .ps1 real via el AST (nunca una copia pegada a
 * mano), con sus atributos, y lo corre con un cuerpo inocuo que imprime lo que
 * se bindeo. Nunca ejecuta el script: sirve para probar como reacciona la
 * firma a los argumentos, no lo que el script hace despues.
 *
 * Existe por la trampa del 2026-09-29: sin `[CmdletBinding()]`, un script
 * acepta en `$args` cualquier argumento que no reconoce, sin quejarse. Por ssh,
 * cmd le paso a `rotate-email-crypto-key.ps1` el literal `-DryRun;` y corrio la
 * rotacion real.
 *
 * Requiere `pwsh` (7+): `PWSH_PATH=<ruta>` o `pwsh` en el PATH. Sin ninguno,
 * `pwsh` vale `null` y el spec que lo usa se skippea.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** pwsh en un contenedor/WSL sin ICU del sistema aborta sin esto. */
export const PWSH_ENV = { ...process.env, DOTNET_SYSTEM_GLOBALIZATION_INVARIANT: '1' };

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

export const pwsh = resolverPwsh();

/** Marca que imprime el cuerpo inocuo, seguida de `Nombre=valor` por parametro bindeado. */
export const MARCA_CUERPO = 'CUERPO-EJECUTADO';

// `ParamBlock.Extent` NO incluye los atributos (`[CmdletBinding()]`): viven
// aparte, en `ParamBlock.Attributes`, y hay que anteponerlos a mano.
const EXTRAER_PARAM_PS1 = [
  'param([string]$RealScriptPath, [string]$OutPath)',
  "$ErrorActionPreference = 'Stop'",
  '$tokens = $null; $errors = $null',
  '$ast = [System.Management.Automation.Language.Parser]::ParseFile($RealScriptPath, [ref]$tokens, [ref]$errors)',
  "if ($errors.Count -gt 0 -or -not $ast.ParamBlock) { throw 'param block not found in real script' }",
  '$atributos = @($ast.ParamBlock.Attributes | ForEach-Object { $_.Extent.Text }) -join [Environment]::NewLine',
  `$cuerpo = 'Write-Host (''${MARCA_CUERPO} '' + ((@($PSBoundParameters.GetEnumerator()) | Sort-Object Key | ForEach-Object { $_.Key + ''='' + $_.Value }) -join '' ''))'`,
  'Set-Content -Path $OutPath -Encoding ascii -Value ($atributos + [Environment]::NewLine + $ast.ParamBlock.Extent.Text + [Environment]::NewLine + $cuerpo)',
].join('\n');

export interface ResultadoParamBlock {
  exitCode: number;
  salida: string;
}

/**
 * Corre el bloque `param` real de `ps1Path` con `args`, como lo haria
 * `powershell -File <script> <args>`. Solo llamar con `pwsh` resuelto.
 */
export function correrParamBlock(ps1Path: string, args: string[]): ResultadoParamBlock {
  if (!pwsh) throw new Error('correrParamBlock requiere pwsh');
  const dir = mkdtempSync(join(tmpdir(), 'pwsh-param-block-'));
  try {
    const extraerPath = join(dir, 'extraer.ps1');
    const cuerpoPath = join(dir, 'solo-param.ps1');
    writeFileSync(extraerPath, EXTRAER_PARAM_PS1, 'ascii');
    execFileSync(
      pwsh,
      ['-NoProfile', '-File', extraerPath, '-RealScriptPath', ps1Path, '-OutPath', cuerpoPath],
      {
        env: PWSH_ENV,
      },
    );
    try {
      const stdout = execFileSync(pwsh, ['-NoProfile', '-File', cuerpoPath, ...args], {
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
