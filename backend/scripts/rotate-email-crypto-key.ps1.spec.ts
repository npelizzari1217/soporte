/**
 * rotate-email-crypto-key.ps1.spec.ts — WU3-fix (sdd/rotacion-email-crypto-key).
 *
 * Corre `InvocarRotacion` REAL del .ps1 (extraida via el AST de PowerShell,
 * nunca copiada a mano) contra un Node stub. Prueba en runtime lo que C1 del
 * verify-report encontro leyendo el script: sin `Out-Host`, PowerShell mezcla
 * el stdout de Node con `$LASTEXITCODE` en el valor de retorno de la funcion,
 * y todo `-eq 0`/`-ne 0` de mas arriba en el script queda mal.
 *
 * Requiere `pwsh` (7+):
 *   PWSH_PATH=<ruta a pwsh> pnpm vitest run scripts/rotate-email-crypto-key.ps1.spec.ts
 * Sin `PWSH_PATH` y sin `pwsh` en el PATH, la suite entera se skippea — no
 * hay Windows/pwsh en el CI de este repo todavia (DEPLOY-VPS-runbook.md §5).
 *
 * Ref verify-report: C1, C3. Ref tasks: WU3-fix.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PS1_PATH = join(__dirname, '..', '..', 'rotate-email-crypto-key.ps1');
// pwsh en un contenedor/WSL sin ICU del sistema aborta sin esto (ver
// verify-report, "PowerShell runtime evidence").
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

// Extrae InvocarRotacion del .ps1 real via el AST (nunca una copia pegada a
// mano), la redefine en esta sesion apuntando a un Node stub, y la llama dos
// veces (stub que sale 0, stub que sale 3). Vuelca el resultado como JSON.
const HARNESS_PS1 = `
param(
  [Parameter(Mandatory=$true)][string]$RealScriptPath,
  [Parameter(Mandatory=$true)][string]$NodeExePath,
  [Parameter(Mandatory=$true)][string]$StubScriptPath,
  [Parameter(Mandatory=$true)][string]$OutJsonPath
)
$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($RealScriptPath, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { throw 'Parse errors in real script' }
$funcAst = $ast.Find({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'InvocarRotacion' }, $true)
if (-not $funcAst) { throw 'InvocarRotacion not found in real script' }
Invoke-Expression $funcAst.Extent.Text
$script:databaseUrl = 'postgres://stub-only-for-test'
$NodeExe = $NodeExePath
$ScriptNode = $StubScriptPath
$resultados = @()
foreach ($caso in @(
  @{ nombre = 'exito'; flags = @('--ok') },
  @{ nombre = 'fallo'; flags = @('--fail') }
)) {
  $exit = InvocarRotacion -FlagsNode $caso.flags -EnvVarsRotacion @{ ROTACION_OLD_KEY = 'stub-old'; ROTACION_NEW_KEY = 'stub-new' }
  $resultados += [pscustomobject]@{
    caso = $caso.nombre
    exitCode = $exit
    esEntero = $exit -is [int]
    databaseUrlPresente = (Test-Path Env:\\DATABASE_URL_MASTER)
    oldKeyPresente = (Test-Path Env:\\ROTACION_OLD_KEY)
    newKeyPresente = (Test-Path Env:\\ROTACION_NEW_KEY)
  }
}
$resultados | ConvertTo-Json | Set-Content -Path $OutJsonPath -Encoding utf8
`;

// Simula un Node real: escribe a stdout ANTES de salir (como hace
// rotar-email-crypto-key.mjs en --verificar/rotacion), con exit 0 o exit 3.
const STUB_NODE = `
if (process.argv.includes('--ok')) {
  console.log('[stub] migradas=2 yaMigradas=0');
  process.exit(0);
} else {
  console.error('[stub] fallo simulado');
  process.exit(3);
}
`;

type ResultadoCaso = {
  caso: string;
  exitCode: number;
  esEntero: boolean;
  databaseUrlPresente: boolean;
  oldKeyPresente: boolean;
  newKeyPresente: boolean;
};

const suite = pwsh ? describe : describe.skip;

suite(
  'InvocarRotacion (rotate-email-crypto-key.ps1) — runtime real via pwsh (PWSH_PATH o pwsh en PATH; si no hay ninguno, este bloque se skippea)',
  () => {
    let resultados: ResultadoCaso[] = [];

    beforeAll(() => {
      const dir = mkdtempSync(join(tmpdir(), 'rotate-ps1-spec-'));
      const harnessPath = join(dir, 'harness.ps1');
      const stubPath = join(dir, 'stub.mjs');
      const outJsonPath = join(dir, 'out.json');
      writeFileSync(harnessPath, HARNESS_PS1, 'ascii');
      writeFileSync(stubPath, STUB_NODE, 'utf8');

      execFileSync(
        pwsh as string,
        [
          '-NoProfile',
          '-File',
          harnessPath,
          '-RealScriptPath',
          PS1_PATH,
          '-NodeExePath',
          process.execPath,
          '-StubScriptPath',
          stubPath,
          '-OutJsonPath',
          outJsonPath,
        ],
        { env: PWSH_ENV },
      );

      resultados = JSON.parse(readFileSync(outJsonPath, 'utf8'));
      rmSync(dir, { recursive: true, force: true });
    });

    it('exito: exitCode es el entero 0, no un array con el stdout de Node mezclado (C1)', () => {
      const r = resultados.find((x) => x.caso === 'exito');
      expect(r).toBeDefined();
      expect(r!.esEntero).toBe(true);
      expect(r!.exitCode).toBe(0);
    });

    it('fallo: exitCode es el entero 3, no un array con el stdout de Node mezclado (C1)', () => {
      const r = resultados.find((x) => x.caso === 'fallo');
      expect(r).toBeDefined();
      expect(r!.esEntero).toBe(true);
      expect(r!.exitCode).toBe(3);
    });

    it('las variables de entorno de cada invocacion se borran en el finally', () => {
      for (const r of resultados) {
        expect(r.databaseUrlPresente).toBe(false);
        expect(r.oldKeyPresente).toBe(false);
        expect(r.newKeyPresente).toBe(false);
      }
    });
  },
);

/**
 * Reescritura de backend/.env (pasos 7-8) — WU3-fix2. Extrae, via el AST del
 * .ps1 real (nunca una copia pegada a mano), la asignacion de
 * `$mensajeBaseRotada` y el try/catch que hace `Set-Content` + `Replace` +
 * relectura + `--verificar` final, y lo corre contra un `.env` temporal con
 * `InvocarRotacion` stubbed. Prueba en runtime C-N1 del verify-report:
 * `[System.IO.File]::Replace($tmp, $envFile, $null)` — el binder de
 * PowerShell convierte `$null` en `""` para el parametro `[string]` de
 * backup, y `Replace` la rechaza SIEMPRE, incluso en el camino exitoso.
 *
 * RED contra `f7fe6c6` (el bug de C-N1): el caso "camino exitoso" termina en
 * exit 3 ("BASE YA ROTADA...") en vez de reescribir backend/.env. GREEN
 * contra el fix (`[NullString]::Value`). Prueba manual, no comprometida como
 * test (correr `.ps1` de un commit viejo no es responsabilidad de este spec).
 */
const HARNESS_ENV_PS1 = `
param(
  [Parameter(Mandatory=$true)][string]$RealScriptPath,
  [Parameter(Mandatory=$true)][string]$EnvFilePath,
  [Parameter(Mandatory=$true)][string]$NewKey,
  [Parameter(Mandatory=$true)][string]$PendienteFilePath,
  [Parameter(Mandatory=$true)][int]$ExitVerificarFinal
)
$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($RealScriptPath, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { throw 'Parse errors in real script' }

function Step($msg) { Write-Host ("========== " + $msg + " ==========") }
function InvocarRotacion([string[]]$FlagsNode, [hashtable]$EnvVarsRotacion) { return $ExitVerificarFinal }

$asignacionMensajeAst = $ast.Find({ param($n) $n -is [System.Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq '$mensajeBaseRotada' }, $true)
if (-not $asignacionMensajeAst) { throw 'mensajeBaseRotada assignment not found in real script' }
$tryAst = $ast.Find({ param($n) $n -is [System.Management.Automation.Language.TryStatementAst] -and $n.Extent.Text.Contains('[System.IO.File]::Replace') }, $true)
if (-not $tryAst) { throw 'Reescritura de .env (try/catch pasos 7-8) not found in real script' }

$envFile = $EnvFilePath
$pendienteFile = $PendienteFilePath
$newKey = $NewKey
$lineasEnvOriginal = @(Get-Content $envFile)

Invoke-Expression $asignacionMensajeAst.Extent.Text
Invoke-Expression $tryAst.Extent.Text
Write-Host 'REESCRITURA-OK'
`;

const suiteEnv = pwsh ? describe : describe.skip;

suiteEnv(
  'Reescritura de backend/.env (pasos 7-8, rotate-email-crypto-key.ps1) — runtime real via pwsh (C-N1)',
  () => {
    const oldKey = '11'.repeat(32);
    const newKey = '22'.repeat(32);
    let dir: string;
    let envFilePath: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'rotate-ps1-env-spec-'));
      envFilePath = join(dir, '.env');
      writeFileSync(
        envFilePath,
        ['DATABASE_URL_MASTER=postgres://x', 'EMAIL_CRYPTO_KEY=' + oldKey, ''].join('\n'),
        'ascii',
      );
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    function correr(exitVerificarFinal: number): { exitCode: number; salida: string } {
      const harnessPath = join(dir, 'harness-env.ps1');
      writeFileSync(harnessPath, HARNESS_ENV_PS1, 'ascii');
      try {
        const stdout = execFileSync(
          pwsh as string,
          [
            '-NoProfile',
            '-File',
            harnessPath,
            '-RealScriptPath',
            PS1_PATH,
            '-EnvFilePath',
            envFilePath,
            '-NewKey',
            newKey,
            '-PendienteFilePath',
            '/fake/pendiente.txt',
            '-ExitVerificarFinal',
            String(exitVerificarFinal),
          ],
          { env: PWSH_ENV },
        );
        return { exitCode: 0, salida: stdout.toString('utf8') };
      } catch (err) {
        const e = err as { status: number | null; stdout: Buffer; stderr: Buffer };
        return {
          exitCode: e.status ?? -1,
          salida: (e.stdout?.toString('utf8') ?? '') + (e.stderr?.toString('utf8') ?? ''),
        };
      }
    }

    it('camino exitoso: reescribe backend/.env con NEW_KEY, exit 0', () => {
      const r = correr(0);
      expect(r.exitCode).toBe(0);
      const contenido = readFileSync(envFilePath, 'ascii');
      expect(contenido).toContain('EMAIL_CRYPTO_KEY=' + newKey);
      expect(contenido).not.toContain('EMAIL_CRYPTO_KEY=' + oldKey);
    });

    it('fallo forzado en --verificar final: imprime BASE YA ROTADA, exit 3, sin claves', () => {
      const r = correr(3);
      expect(r.exitCode).toBe(3);
      expect(r.salida).toContain('BASE YA ROTADA');
      expect(r.salida).not.toContain(oldKey);
      expect(r.salida).not.toContain(newKey);
    });
  },
);
