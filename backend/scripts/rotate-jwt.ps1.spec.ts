/**
 * rotate-jwt.ps1.spec.ts — reescritura del script (rota JWT_SECRET con
 * backend/.env como fuente unica).
 *
 * Corre las funciones REALES del .ps1 (extraidas via el AST de PowerShell,
 * nunca copiadas a mano) contra archivos temporales y arrays en memoria.
 * Nunca ejecuta el script completo — no toca servicios ni hace build.
 *
 * Requiere `pwsh` (7+):
 *   PWSH_PATH=<ruta a pwsh> pnpm vitest run scripts/rotate-jwt.ps1.spec.ts
 * Sin `PWSH_PATH` y sin `pwsh` en el PATH, la suite entera se skippea.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { correrParamBlock, MARCA_CUERPO, pwsh, PWSH_ENV } from './testing/pwsh-param-block';

const PS1_PATH = join(__dirname, '..', '..', 'rotate-jwt.ps1');

/**
 * Parametros del script. `-DryRun` es el unico. Mismo motivo que en
 * deploy.ps1 y rotate-email-crypto-key.ps1: sin `[CmdletBinding()]`, un
 * argumento desconocido (como lo pasa cmd por ssh) cae en `$args` sin
 * quejarse y el switch queda en `$false` — corre la rotacion REAL en vez del
 * dry-run.
 */
const suiteParametros = pwsh ? describe : describe.skip;

suiteParametros('Parametros de rotate-jwt.ps1 — runtime real via pwsh', () => {
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

/**
 * Set-JwtSecretEnArchivo (reemplazo de la linea JWT_SECRET=) y
 * Merge-EntradasEnv (mezcla del AppEnvironmentExtra de NSSM, duplicada de
 * deploy.ps1 porque un script standalone no dot-sourcea nada).
 *
 * Set-JwtSecretEnArchivo prueba en runtime el defecto 6 del script viejo
 * (bloqueado el 2026-09-29): reescribia con `Get-Content | Set-Content` sin
 * archivo temporal, y si faltaba la linea JWT_SECRET= no hacia nada y
 * reportaba OK igual. La version nueva usa archivo temporal + Replace (molde
 * rotate-email-crypto-key.ps1, C-N1) y corta si no hay EXACTAMENTE una linea.
 *
 * Merge-EntradasEnv prueba el defecto 3: `nssm set ... AppEnvironmentExtra`
 * pisa la lista ENTERA, asi que agregar JWT_SECRET sin mezclar borraba
 * cualquier otra variable que el servicio ya tuviera.
 */
const HARNESS_JWT_PS1 = `
param(
  [Parameter(Mandatory=$true)][string]$RealScriptPath,
  [Parameter(Mandatory=$true)][string]$OutJsonPath
)
$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($RealScriptPath, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { throw 'Parse errors in real script' }

foreach ($nombre in @('Set-JwtSecretEnArchivo', 'Merge-EntradasEnv')) {
  $funcAst = $ast.Find({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $nombre }, $true)
  if (-not $funcAst) { throw ($nombre + ' not found in real script') }
  Invoke-Expression $funcAst.Extent.Text
}

$resultados = @{}
$dirTmp = Join-Path ([System.IO.Path]::GetTempPath()) ('rotate-jwt-ps1-spec-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $dirTmp | Out-Null
try {
  $viejaClave = ('vi' * 32)
  $nuevaClave = ('nu' * 32)

  $envOk = Join-Path $dirTmp 'ok.env'
  $lineasOriginales = @('DATABASE_URL_MASTER=postgres://x', ('JWT_SECRET=' + $viejaClave), 'OTRA_VAR=valor-sin-tocar', '')
  Set-Content -Path $envOk -Encoding ascii -Value $lineasOriginales
  Set-JwtSecretEnArchivo $envOk $nuevaClave
  $lineasFinal = @(Get-Content $envOk)

  $envCero = Join-Path $dirTmp 'cero.env'
  Set-Content -Path $envCero -Encoding ascii -Value @('OTRA=x')
  $errorCero = $null
  try { Set-JwtSecretEnArchivo $envCero $nuevaClave } catch { $errorCero = $_.Exception.Message }
  $envCeroDespues = (@(Get-Content $envCero) -join '|')

  $envDos = Join-Path $dirTmp 'dos.env'
  Set-Content -Path $envDos -Encoding ascii -Value @('JWT_SECRET=uno', 'JWT_SECRET=dos')
  $errorDos = $null
  try { Set-JwtSecretEnArchivo $envDos $nuevaClave } catch { $errorDos = $_.Exception.Message }
  $envDosDespues = (@(Get-Content $envDos) -join '|')

  $resultados.setJwtSecretEnArchivo = [pscustomobject]@{
    lineasFinal = $lineasFinal
    ceroLanzoError = [bool]$errorCero
    envCeroSinTocar = $envCeroDespues
    dosLanzoError = [bool]$errorDos
    envDosSinTocar = $envDosDespues
    nuevaClave = $nuevaClave
    viejaClave = $viejaClave
  }
} finally {
  Remove-Item -Recurse -Force $dirTmp
}

$entradasBase = @('PORT=3101', 'NODE_ENV=production')
$sinJwt = @(Merge-EntradasEnv $entradasBase 'JWT_SECRET' 'nuevo1')
$conJwtExistente = @(Merge-EntradasEnv @('PORT=3101', 'JWT_SECRET=viejo', 'NODE_ENV=production') 'JWT_SECRET' 'nuevo2')

$resultados.mergeEntradasEnv = [pscustomobject]@{
  sinJwt = $sinJwt
  conJwtExistente = $conJwtExistente
}

$resultados | ConvertTo-Json -Depth 5 | Set-Content -Path $OutJsonPath -Encoding utf8
`;

type ResultadoJwt = {
  setJwtSecretEnArchivo: {
    lineasFinal: string[];
    ceroLanzoError: boolean;
    envCeroSinTocar: string;
    dosLanzoError: boolean;
    envDosSinTocar: string;
    nuevaClave: string;
    viejaClave: string;
  };
  mergeEntradasEnv: {
    sinJwt: string[];
    conJwtExistente: string[];
  };
};

const suiteFunciones = pwsh ? describe : describe.skip;

suiteFunciones(
  'Set-JwtSecretEnArchivo y Merge-EntradasEnv (rotate-jwt.ps1) — runtime real via pwsh',
  () => {
    let resultados: ResultadoJwt;

    beforeAll(() => {
      const dir = mkdtempSync(join(tmpdir(), 'rotate-jwt-ps1-func-spec-'));
      const harnessPath = join(dir, 'harness.ps1');
      const outJsonPath = join(dir, 'out.json');
      writeFileSync(harnessPath, HARNESS_JWT_PS1, 'ascii');
      try {
        execFileSync(
          pwsh as string,
          [
            '-NoProfile',
            '-File',
            harnessPath,
            '-RealScriptPath',
            PS1_PATH,
            '-OutJsonPath',
            outJsonPath,
          ],
          { env: PWSH_ENV },
        );
        resultados = JSON.parse(readFileSync(outJsonPath, 'utf8'));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('camino feliz: reemplaza solo la linea JWT_SECRET=, el resto queda byte a byte igual', () => {
      const r = resultados.setJwtSecretEnArchivo;
      expect(r.lineasFinal).toEqual([
        'DATABASE_URL_MASTER=postgres://x',
        'JWT_SECRET=' + r.nuevaClave,
        'OTRA_VAR=valor-sin-tocar',
        '',
      ]);
      expect(r.lineasFinal.join('\n')).not.toContain(r.viejaClave);
    });

    it('0 lineas JWT_SECRET= -> lanza y no toca el archivo', () => {
      const r = resultados.setJwtSecretEnArchivo;
      expect(r.ceroLanzoError).toBe(true);
      expect(r.envCeroSinTocar).toBe('OTRA=x');
    });

    it('2 lineas JWT_SECRET= -> lanza y no toca el archivo', () => {
      const r = resultados.setJwtSecretEnArchivo;
      expect(r.dosLanzoError).toBe(true);
      expect(r.envDosSinTocar).toBe('JWT_SECRET=uno|JWT_SECRET=dos');
    });

    it('Merge-EntradasEnv: sin JWT_SECRET previo, agrega al final y preserva PORT/NODE_ENV', () => {
      expect(resultados.mergeEntradasEnv.sinJwt).toEqual([
        'PORT=3101',
        'NODE_ENV=production',
        'JWT_SECRET=nuevo1',
      ]);
    });

    it('Merge-EntradasEnv: con JWT_SECRET previo, lo reemplaza en su misma posicion', () => {
      expect(resultados.mergeEntradasEnv.conJwtExistente).toEqual([
        'PORT=3101',
        'JWT_SECRET=nuevo2',
        'NODE_ENV=production',
      ]);
    });
  },
);
