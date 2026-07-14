<#
.SYNOPSIS
    Deploy ordenado de Soporte en el VPS Windows (educandow-vps).

.DESCRIPTION
    Actualiza produccion de forma determinista e idempotente, en el orden correcto
    para una app multi-tenant (NestJS + Next.js) servida por servicios NSSM.

    ARCHIVO 100% ASCII a proposito: Windows PowerShell 5.1 lee los .ps1 sin BOM como
    ANSI (no UTF-8). Cualquier caracter no-ASCII (acentos, simbolos) se corrompe y
    puede romper el parseo. NO agregar tildes ni simbolos a este archivo.

    IMPORTANTE -- toolchain del server (Node 20 + pnpm 9.15.4) vs repo (pnpm 11 / Node 22):
    El server NO puede correr 'pnpm install' de este repo:
      - --ignore-workspace recrea node_modules y falla con EPERM al no poder borrar
        el binario nativo de argon2 (bloqueado por el servicio backend en ejecucion).
      - Sin --ignore-workspace, pnpm 9 no parsea el lockfile pnpm 11 (ERR_PNPM_BROKEN_LOCKFILE)
        ni el pnpm-workspace.yaml (sintaxis pnpm 10/11).

    Por eso este deploy NO corre 'pnpm install'. Para un deploy de solo-codigo (el caso
    normal) NO hace falta: node_modules ya esta instalado y los binarios directos de
    node_modules\.bin (prisma, ts-node, tsc, tsc-alias, next) buildean sin tocar deps.

    Si el LOCKFILE cambio (dependencias nuevas), el script AVISA: esa instalacion es
    una operacion de mantenimiento aparte (Node 22 + pnpm 11, o servicios detenidos).

    Los config de Prisma resuelven la conexion desde DATABASE_URL_MASTER / DATABASE_URL_TENANT
    del entorno, que este script carga desde backend/.env antes de migrar.

    Orden:
      1. Pre-flight y punto de rollback (commit actual).
      2. git pull --ff-only origin master.
      3. Carga backend/.env al entorno de la sesion.
      4. Backend: (aviso si cambio lockfile) generate -> migrate master -> migrate tenants -> build.
      5. Frontend: (aviso si cambio lockfile) build.
      6. Restart de servicios NSSM y verificacion de estado.

    Cualquier error ABORTA el deploy (ErrorActionPreference = Stop) y deja impreso
    el commit de rollback. Idempotente: se puede re-ejecutar sin efectos adversos.

.PARAMETER SkipBuild
    Salta los builds (solo pull + migraciones + restart). Uso excepcional.

.NOTES
    Requiere ejecutarse como administrator (control de servicios NSSM).
    Correr desde la raiz del repo:  powershell -ExecutionPolicy Bypass -File .\deploy.ps1

    TODO (deuda): alinear el server a Node 22 + pnpm 11 y restaurar 'pnpm install' +
    los scripts 'pnpm run' nativos. Hasta entonces, binarios directos y sin install.
#>

[CmdletBinding()]
param(
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot   = 'C:\soporte'
$BackendDir = Join-Path $RepoRoot 'backend'
$FrontDir   = Join-Path $RepoRoot 'frontend'
$Services   = @('soporte-backend', 'soporte-frontend')

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Info($msg) { Write-Host "    $msg" -ForegroundColor Gray }
function Warn($msg) { Write-Host "    [!] $msg" -ForegroundColor Yellow }

# Corre un comando de PATH (git) y aborta si el exit code != 0.
function Invoke-Checked($file, [string[]]$cmdArgs) {
    Info "> $file $($cmdArgs -join ' ')"
    & $file @cmdArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Comando fallo (exit $LASTEXITCODE): $file $($cmdArgs -join ' ')"
    }
}

# Corre un binario local de node_modules\.bin (prisma, tsc, next, ts-node...) por
# ruta absoluta al shim .cmd de Windows. Esquiva pnpm y el pnpm-workspace.yaml.
function Invoke-Bin($binDir, $tool, [string[]]$cmdArgs) {
    $exe = Join-Path $binDir ($tool + '.cmd')
    if (-not (Test-Path $exe)) { $exe = Join-Path $binDir $tool }
    if (-not (Test-Path $exe)) { throw "Binario no encontrado: $exe (node_modules incompleto)." }
    Info "> $tool $($cmdArgs -join ' ')"
    & $exe @cmdArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Comando fallo (exit $LASTEXITCODE): $tool $($cmdArgs -join ' ')"
    }
}

# Avisa (sin abortar) si el lockfile cambio entre el commit previo y HEAD: las deps
# pueden necesitar instalacion manual, que este deploy NO hace. Si faltan modulos,
# el build fallara despues con un error claro.
function Warn-IfLockfileChanged($fromCommit, $lockPath, $label) {
    & git diff --quiet $fromCommit HEAD -- $lockPath 2>$null
    if ($LASTEXITCODE -ne 0) {
        Warn "El lockfile de $label ($lockPath) CAMBIO respecto de $($fromCommit.Substring(0,7))."
        Warn "  Este deploy NO corre 'pnpm install' (server pnpm 9 incompatible con lockfile pnpm 11)."
        Warn "  Si el build falla por modulos faltantes: instala con Node 22 + pnpm 11 (servicios detenidos)."
    }
}

# Carga un archivo .env (KEY=VALUE) al entorno del proceso actual.
function Import-DotEnv($path) {
    if (-not (Test-Path $path)) { throw ".env no encontrado en $path" }
    Get-Content $path | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq '' -or $line.StartsWith('#')) { return }
        $idx = $line.IndexOf('=')
        if ($idx -lt 1) { return }
        $key = $line.Substring(0, $idx).Trim()
        $val = $line.Substring($idx + 1).Trim().Trim('"').Trim("'")
        [Environment]::SetEnvironmentVariable($key, $val, 'Process')
    }
}

$deployStart = Get-Date
Write-Host "########## DEPLOY SOPORTE -- $deployStart ##########" -ForegroundColor Green

# --- 1. Pre-flight ----------------------------------------------------------
Step '1/6  Pre-flight'
Set-Location $RepoRoot
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne 'master') { throw "Rama inesperada '$branch' (se esperaba master). Abortando." }
$rollback = (git rev-parse HEAD).Trim()
Info "Rama: $branch"
Info "Commit actual (rollback): $rollback"

# --- 2. Pull ----------------------------------------------------------------
Step '2/6  git pull --ff-only origin master'
Invoke-Checked 'git' @('fetch', 'origin')
Invoke-Checked 'git' @('pull', '--ff-only', 'origin', 'master')
$newHead = (git rev-parse --short HEAD).Trim()
Info "Nuevo HEAD: $newHead"

# --- 3. Cargar entorno ------------------------------------------------------
Step '3/6  Cargar backend/.env'
Import-DotEnv (Join-Path $BackendDir '.env')
if (-not $env:DATABASE_URL_MASTER) {
    throw 'DATABASE_URL_MASTER no quedo definida tras cargar .env. Abortando ANTES de migrar (el fan-out caeria a localhost).'
}
Info 'DATABASE_URL_MASTER cargada (valor oculto).'

# --- 4. Backend -------------------------------------------------------------
Step '4/6  Backend: generate / migrate / build'
Set-Location $BackendDir
$backBin = Join-Path $BackendDir 'node_modules\.bin'
Warn-IfLockfileChanged $rollback 'backend/pnpm-lock.yaml' 'backend'

Invoke-Bin $backBin 'prisma' @('generate', '--schema=prisma_master/schema.prisma')
Invoke-Bin $backBin 'prisma' @('generate', '--schema=prisma_tenant/schema.prisma')

Info 'Migrando DB master...'
Invoke-Bin $backBin 'prisma' @('migrate', 'deploy', '--schema=prisma_master/schema.prisma')

Info 'Migrando TODOS los tenants activos (fan-out)...'
Invoke-Bin $backBin 'ts-node' @('scripts/migrate-tenants.ts')

if (-not $SkipBuild) {
    Info 'Compilando backend...'
    Invoke-Bin $backBin 'tsc' @('-p', 'tsconfig.build.json')
    Invoke-Bin $backBin 'tsc-alias' @('-p', 'tsconfig.build.json')
}

# --- 5. Frontend ------------------------------------------------------------
Step '5/6  Frontend: build'
Set-Location $FrontDir
$frontBin = Join-Path $FrontDir 'node_modules\.bin'
Warn-IfLockfileChanged $rollback 'frontend/pnpm-lock.yaml' 'frontend'

if (-not $SkipBuild) {
    Invoke-Bin $frontBin 'next' @('build')
}

# --- 6. Restart servicios ---------------------------------------------------
Step '6/6  Restart de servicios NSSM'
foreach ($svc in $Services) {
    Info "Reiniciando $svc..."
    Restart-Service -Name $svc -Force
}
Start-Sleep -Seconds 4
foreach ($svc in $Services) {
    $status = (Get-Service -Name $svc).Status
    if ($status -ne 'Running') { throw "El servicio $svc quedo en estado '$status' tras el restart." }
    Info "$svc -> Running OK"
}

$elapsed = [int]((Get-Date) - $deployStart).TotalSeconds
Write-Host "`n########## DEPLOY OK ($newHead) en ${elapsed}s ##########" -ForegroundColor Green
Write-Host "Rollback si algo salio mal: git reset --hard $rollback ; re-deploy" -ForegroundColor Yellow
