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

/**
 * Archivos de recuperacion (pasos 5 y 9). Extrae via el AST del .ps1 real los
 * dos `Set-Content` que escriben el PENDIENTE y el permanente, y los corre
 * contra archivos temporales.
 *
 * Regresion de la rotacion en produccion del 2026-09-29: `@('OLD_KEY=' +
 * $oldKey, 'NEW_KEY=' + $newKey, ...)` se evalua como `'OLD_KEY=' + ($oldKey,
 * 'NEW_KEY=', ...)` porque la coma liga mas fuerte que el `+`. El resultado es
 * UNA sola linea con los valores separados por espacios: la verificacion del
 * permanente fallo (exit 5) y la recuperacion manual del runbook
 * (`Select-String '^NEW_KEY='`) no habria encontrado la clave en el PENDIENTE.
 */
const HARNESS_RECUPERACION_PS1 = `
param(
  [Parameter(Mandatory=$true)][string]$RealScriptPath,
  [Parameter(Mandatory=$true)][string]$PendienteFilePath,
  [Parameter(Mandatory=$true)][string]$PermanenteFilePath,
  [Parameter(Mandatory=$true)][string]$OldKey,
  [Parameter(Mandatory=$true)][string]$NewKey,
  [Parameter(Mandatory=$true)][string]$DumpDirPath
)
$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($RealScriptPath, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { throw 'Parse errors in real script' }

function EscrituraDe([string]$variable) {
  $encontrados = @($ast.FindAll({ param($n)
    $n -is [System.Management.Automation.Language.CommandAst] -and
    $n.GetCommandName() -eq 'Set-Content' -and
    $n.Extent.Text.Contains('-Path ' + $variable)
  }, $true))
  if ($encontrados.Count -ne 1) { throw ('Se esperaba un solo Set-Content sobre ' + $variable + ', hay ' + $encontrados.Count) }
  return $encontrados[0].Extent.Text
}

$oldKey = $OldKey
$newKey = $NewKey
# Las variables de PowerShell no distinguen mayusculas: un parametro
# '[string]$DumpDir' seria la misma variable que '$dumpDir' y convertiria el
# objeto a texto. Por eso el parametro se llama distinto.
$dumpDir = [pscustomobject]@{ FullName = $DumpDirPath }
$pendienteFile = $PendienteFilePath
$permanenteFile = $PermanenteFilePath

Invoke-Expression (EscrituraDe '$pendienteFile')
Invoke-Expression (EscrituraDe '$permanenteFile')
`;

const suiteRecuperacion = pwsh ? describe : describe.skip;

suiteRecuperacion(
  'Archivos de recuperacion (pasos 5 y 9, rotate-email-crypto-key.ps1) — runtime real via pwsh',
  () => {
    const oldKey = 'aa'.repeat(32);
    const newKey = 'bb'.repeat(32);
    const dumpDir = 'C:\\soporte\\backups\\utc-backfill-20260929-060853';
    let pendiente: string[];
    let permanente: string[];

    beforeAll(() => {
      const dir = mkdtempSync(join(tmpdir(), 'rotate-ps1-recuperacion-spec-'));
      const harnessPath = join(dir, 'harness-recuperacion.ps1');
      const pendientePath = join(dir, 'recuperacion.PENDIENTE.txt');
      const permanentePath = join(dir, 'recuperacion.txt');
      writeFileSync(harnessPath, HARNESS_RECUPERACION_PS1, 'ascii');
      try {
        execFileSync(
          pwsh as string,
          [
            '-NoProfile',
            '-File',
            harnessPath,
            '-RealScriptPath',
            PS1_PATH,
            '-PendienteFilePath',
            pendientePath,
            '-PermanenteFilePath',
            permanentePath,
            '-OldKey',
            oldKey,
            '-NewKey',
            newKey,
            '-DumpDirPath',
            dumpDir,
          ],
          { env: PWSH_ENV },
        );
        const lineas = (ruta: string) => readFileSync(ruta, 'ascii').split(/\r?\n/).filter(Boolean);
        pendiente = lineas(pendientePath);
        permanente = lineas(permanentePath);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('el PENDIENTE lleva una clave por linea: OLD_KEY, NEW_KEY y DUMP', () => {
      expect(pendiente).toEqual(['OLD_KEY=' + oldKey, 'NEW_KEY=' + newKey, 'DUMP=' + dumpDir]);
    });

    it('el permanente lleva OLD_KEY, DUMP y ROTADA_EL en lineas separadas, sin NEW_KEY', () => {
      expect(permanente).toHaveLength(3);
      expect(permanente[0]).toBe('OLD_KEY=' + oldKey);
      expect(permanente[1]).toBe('DUMP=' + dumpDir);
      expect(permanente[2]).toMatch(/^ROTADA_EL=\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(permanente.join('\n')).not.toContain(newKey);
    });
  },
);

/**
 * Parametros del script. Regresion del 2026-09-29: invocado por ssh contra el
 * VPS, cuyo shell por defecto es cmd, `-File rotate-email-crypto-key.ps1
 * -DryRun; echo ...` le paso a PowerShell el argumento literal `-DryRun;`. Sin
 * `[CmdletBinding()]` un script acepta argumentos desconocidos en `$args` sin
 * quejarse: `$DryRun` quedo en `$false` y corrio la rotacion REAL.
 *
 * El harness toma el bloque `param` del .ps1 real (con sus atributos) y le
 * pone un cuerpo inocuo: nunca ejecuta el script de rotacion.
 */
const suiteParametros = pwsh ? describe : describe.skip;

suiteParametros('Parametros de rotate-email-crypto-key.ps1 — runtime real via pwsh', () => {
  function correrConArgs(args: string[]): { exitCode: number; salida: string } {
    const dir = mkdtempSync(join(tmpdir(), 'rotate-ps1-params-spec-'));
    try {
      const extraerPath = join(dir, 'extraer.ps1');
      const cuerpoPath = join(dir, 'solo-param.ps1');
      writeFileSync(
        extraerPath,
        [
          'param([string]$RealScriptPath, [string]$OutPath)',
          "$ErrorActionPreference = 'Stop'",
          '$tokens = $null; $errors = $null',
          '$ast = [System.Management.Automation.Language.Parser]::ParseFile($RealScriptPath, [ref]$tokens, [ref]$errors)',
          "if ($errors.Count -gt 0 -or -not $ast.ParamBlock) { throw 'param block not found in real script' }",
          // `ParamBlock.Extent` NO incluye los atributos (`[CmdletBinding()]`):
          // viven aparte, en `ParamBlock.Attributes`.
          '$atributos = @($ast.ParamBlock.Attributes | ForEach-Object { $_.Extent.Text }) -join [Environment]::NewLine',
          'Set-Content -Path $OutPath -Encoding ascii -Value ($atributos + [Environment]::NewLine + $ast.ParamBlock.Extent.Text + [Environment]::NewLine + \'Write-Host ("CUERPO-EJECUTADO DryRun=" + $DryRun)\')',
        ].join('\n'),
        'ascii',
      );
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
