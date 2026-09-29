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
import { describe, expect, it, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { correrParamBlock, MARCA_CUERPO, pwsh, PWSH_ENV } from './testing/pwsh-param-block';

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

/**
 * Get-ValorUnicoEnv y Merge-EntradasEnv (JWT_SECRET fuente unica, paso 5c) —
 * runtime real via pwsh.
 *
 * Extrae las dos funciones del .ps1 real via el AST (nunca una copia pegada a
 * mano) y las corre contra archivos temporales y arrays en memoria. Nunca
 * ejecuta el deploy completo.
 *
 * Get-ValorUnicoEnv reemplaza al gotcha de "backend/.env sin JWT_SECRET
 * termina en la variable MACHINE ganando en silencio" (ver DEPLOY-VPS-runbook.md):
 * si el archivo no tiene EXACTAMENTE una linea de la clave pedida, corta.
 *
 * Merge-EntradasEnv reemplaza al defecto 3 del rotate-jwt.ps1 viejo (bloqueado
 * el 2026-09-29): `nssm set ... AppEnvironmentExtra` pisa la lista ENTERA, asi
 * que agregar JWT_SECRET sin mezclar borraba PORT y NODE_ENV del servicio.
 */
const HARNESS_FUNCIONES_PS1 = `
param(
  [Parameter(Mandatory=$true)][string]$RealScriptPath,
  [Parameter(Mandatory=$true)][string]$OutJsonPath
)
$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($RealScriptPath, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { throw 'Parse errors in real script' }

foreach ($nombre in @('Get-ValorUnicoEnv', 'Merge-EntradasEnv')) {
  $funcAst = $ast.Find({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $nombre }, $true)
  if (-not $funcAst) { throw ($nombre + ' not found in real script') }
  Invoke-Expression $funcAst.Extent.Text
}

$resultados = @{}
$dirTmp = Join-Path ([System.IO.Path]::GetTempPath()) ('deploy-ps1-spec-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $dirTmp | Out-Null
try {
  $envCero = Join-Path $dirTmp 'cero.env'
  Set-Content -Path $envCero -Encoding ascii -Value @('OTRA=x')
  $envDos = Join-Path $dirTmp 'dos.env'
  Set-Content -Path $envDos -Encoding ascii -Value @('JWT_SECRET=aaa', 'JWT_SECRET=bbb')
  $envQuoted = Join-Path $dirTmp 'quoted.env'
  Set-Content -Path $envQuoted -Encoding ascii -Value @('JWT_SECRET="valorcomillas"')
  $envVacio = Join-Path $dirTmp 'vacio.env'
  Set-Content -Path $envVacio -Encoding ascii -Value @('JWT_SECRET=')

  $errorCero = $null
  try { Get-ValorUnicoEnv $envCero 'JWT_SECRET' } catch { $errorCero = $_.Exception.Message }

  $errorDos = $null
  try { Get-ValorUnicoEnv $envDos 'JWT_SECRET' } catch { $errorDos = $_.Exception.Message }

  $casoQuoted = Get-ValorUnicoEnv $envQuoted 'JWT_SECRET'

  $errorVacio = $null
  try { Get-ValorUnicoEnv $envVacio 'JWT_SECRET' } catch { $errorVacio = $_.Exception.Message }

  $resultados.getValorUnicoEnv = [pscustomobject]@{
    ceroLanzoError = [bool]$errorCero
    dosLanzoError = [bool]$errorDos
    quotedValor = $casoQuoted
    vacioLanzoError = [bool]$errorVacio
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

type ResultadoFunciones = {
  getValorUnicoEnv: {
    ceroLanzoError: boolean;
    dosLanzoError: boolean;
    quotedValor: string;
    vacioLanzoError: boolean;
  };
  mergeEntradasEnv: {
    sinJwt: string[];
    conJwtExistente: string[];
  };
};

const suiteFunciones = pwsh ? describe : describe.skip;

suiteFunciones('Get-ValorUnicoEnv y Merge-EntradasEnv (deploy.ps1) — runtime real via pwsh', () => {
  let resultados: ResultadoFunciones;

  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), 'deploy-ps1-func-spec-'));
    const harnessPath = join(dir, 'harness.ps1');
    const outJsonPath = join(dir, 'out.json');
    writeFileSync(harnessPath, HARNESS_FUNCIONES_PS1, 'ascii');
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

  it('Get-ValorUnicoEnv: 0 lineas con la clave -> lanza', () => {
    expect(resultados.getValorUnicoEnv.ceroLanzoError).toBe(true);
  });

  it('Get-ValorUnicoEnv: 2 lineas con la clave -> lanza', () => {
    expect(resultados.getValorUnicoEnv.dosLanzoError).toBe(true);
  });

  it('Get-ValorUnicoEnv: recorta las comillas del borde del valor', () => {
    expect(resultados.getValorUnicoEnv.quotedValor).toBe('valorcomillas');
  });

  it('Get-ValorUnicoEnv: valor vacio -> lanza', () => {
    expect(resultados.getValorUnicoEnv.vacioLanzoError).toBe(true);
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
});

/**
 * Test-JwtFrontendDistinto (deploy.ps1, paso 5c). Regresion del deploy del
 * 2026-09-29: con los tres JWT_SECRET iguales (verificado por huella), el
 * deploy igual advirtio que frontend/.env.local era distinto. Un filtro de
 * PowerShell que devuelve UNA sola linea da un string, no un array, y `[0]`
 * sobre un string es su primer caracter: se comparaba "J" contra la clave.
 */
const HARNESS_JWT_FRONT_PS1 = `
param(
  [Parameter(Mandatory=$true)][string]$RealScriptPath,
  [Parameter(Mandatory=$true)][string]$Dir,
  [Parameter(Mandatory=$true)][string]$OutJsonPath
)
$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($RealScriptPath, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { throw 'Parse errors in real script' }
$funcAst = $ast.Find({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Test-JwtFrontendDistinto' }, $true)
if (-not $funcAst) { throw 'Test-JwtFrontendDistinto not found in real script' }
Invoke-Expression $funcAst.Extent.Text

$clave = 'ab' * 32
$archivo = Join-Path $Dir 'front.env'
Set-Content -Path $archivo -Encoding ascii -Value @('BACKEND_URL=http://localhost:3101/api', ('JWT_SECRET=' + $clave))
$archivoComillas = Join-Path $Dir 'front-comillas.env'
Set-Content -Path $archivoComillas -Encoding ascii -Value @(('JWT_SECRET="' + $clave + '"'))

[pscustomobject]@{
  igual = (Test-JwtFrontendDistinto $archivo $clave)
  distinto = (Test-JwtFrontendDistinto $archivo ('cd' * 32))
  igualConComillas = (Test-JwtFrontendDistinto $archivoComillas $clave)
  sinArchivo = (Test-JwtFrontendDistinto (Join-Path $Dir 'no-existe.env') $clave)
} | ConvertTo-Json | Set-Content -Path $OutJsonPath -Encoding utf8
`;

const suiteJwtFront = pwsh ? describe : describe.skip;

suiteJwtFront('Test-JwtFrontendDistinto (deploy.ps1) — runtime real via pwsh', () => {
  let r: { igual: boolean; distinto: boolean; igualConComillas: boolean; sinArchivo: boolean };

  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), 'deploy-ps1-jwt-front-'));
    try {
      const harnessPath = join(dir, 'harness.ps1');
      const outJsonPath = join(dir, 'out.json');
      writeFileSync(harnessPath, HARNESS_JWT_FRONT_PS1, 'ascii');
      execFileSync(
        pwsh as string,
        [
          '-NoProfile',
          '-File',
          harnessPath,
          '-RealScriptPath',
          PS1_PATH,
          '-Dir',
          dir,
          '-OutJsonPath',
          outJsonPath,
        ],
        { env: PWSH_ENV },
      );
      r = JSON.parse(readFileSync(outJsonPath, 'utf8'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('con la misma clave NO advierte (la regresion: comparaba el primer caracter)', () => {
    expect(r.igual).toBe(false);
  });

  it('con otra clave advierte', () => {
    expect(r.distinto).toBe(true);
  });

  it('la misma clave entre comillas tampoco advierte', () => {
    expect(r.igualConComillas).toBe(false);
  });

  it('sin frontend/.env.local no opina', () => {
    expect(r.sinArchivo).toBe(false);
  });
});
