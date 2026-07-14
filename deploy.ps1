<#
.SYNOPSIS
    Deploy ordenado de Soporte en el VPS Windows (educandow-vps).

.DESCRIPTION
    Actualiza producción de forma determinista e idempotente, en el orden correcto
    para una app multi-tenant (NestJS + Next.js) servida por servicios NSSM.

    Compatibilidad con el toolchain REAL del server (Node 20 + pnpm 9.15.4):
    el repo fija pnpm@11 (Node 22+), pero el VPS corre Node 20. Además, cada
    paquete tiene un `pnpm-workspace.yaml` (solo `allowBuilds:`, sintaxis pnpm 10/11)
    que pnpm 9 interpreta como raíz de workspace sin `packages:` → error
    "packages field missing or empty" en CUALQUIER comando pnpm.

    Solución adoptada:
      - `pnpm install` con `--ignore-workspace` (+ CI=true para no ser interactivo).
      - generate / migrate / build vía BINARIOS DIRECTOS de node_modules\.bin
        (prisma, ts-node, tsc, tsc-alias, next), que NO leen el pnpm-workspace.yaml.

    Los config de Prisma (prisma.config.ts / prisma.tenant.config.ts) resuelven la
    conexión desde DATABASE_URL_MASTER / DATABASE_URL_TENANT del entorno, que este
    script carga desde backend/.env antes de migrar.

    Orden:
      1. Pre-flight y punto de rollback (commit actual).
      2. git pull --ff-only origin master.
      3. Carga backend/.env al entorno de la sesión.
      4. Backend: install -> prisma generate -> migrate master -> migrate TODOS los tenants -> build.
      5. Frontend: install -> build.
      6. Restart de servicios NSSM y verificación de estado.

    Cualquier error ABORTA el deploy (ErrorActionPreference = Stop) y deja impreso
    el commit de rollback. Idempotente: se puede re-ejecutar sin efectos adversos.

.PARAMETER SkipBuild
    Salta los builds (solo pull + migraciones + restart). Uso excepcional.

.NOTES
    Requiere ejecutarse como administrator (control de servicios NSSM).
    Correr desde la raíz del repo:  powershell -ExecutionPolicy Bypass -File .\deploy.ps1

    TODO (deuda): alinear el server a Node 22 + pnpm 11 y volver a los scripts
    `pnpm run` nativos. Hasta entonces, este script usa binarios directos.
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

# Corre un comando de PATH (pnpm, git) y aborta si el exit code != 0.
function Invoke-Checked($file, [string[]]$cmdArgs) {
    Info "> $file $($cmdArgs -join ' ')"
    & $file @cmdArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Comando falló (exit $LASTEXITCODE): $file $($cmdArgs -join ' ')"
    }
}

# Corre un binario local de node_modules\.bin (prisma, tsc, next, ts-node...) por
# ruta absoluta al shim .cmd de Windows. Esquiva pnpm y el pnpm-workspace.yaml.
function Invoke-Bin($binDir, $tool, [string[]]$cmdArgs) {
    $exe = Join-Path $binDir ($tool + '.cmd')
    if (-not (Test-Path $exe)) { $exe = Join-Path $binDir $tool }
    if (-not (Test-Path $exe)) { throw "Binario no encontrado: $exe (¿corriste install?)" }
    Info "> $tool $($cmdArgs -join ' ')"
    & $exe @cmdArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Comando falló (exit $LASTEXITCODE): $tool $($cmdArgs -join ' ')"
    }
}

# Instala deps con pnpm 9 esquivando el pnpm-workspace.yaml. CI=true evita el
# prompt interactivo de "reinstalar node_modules". Restaura CI al salir.
function Invoke-PnpmInstall {
    $prev = $env:CI
    $env:CI = 'true'
    try {
        Invoke-Checked 'pnpm' @('install', '--frozen-lockfile', '--ignore-workspace')
    } finally {
        if ($null -eq $prev) { Remove-Item Env:CI -ErrorAction SilentlyContinue } else { $env:CI = $prev }
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
    throw 'DATABASE_URL_MASTER no quedó definida tras cargar .env. Abortando ANTES de migrar (el fan-out caería a localhost).'
}
Info 'DATABASE_URL_MASTER cargada (valor oculto).'

# --- 4. Backend -------------------------------------------------------------
Step '4/6  Backend: install / generate / migrate / build'
Set-Location $BackendDir
$backBin = Join-Path $BackendDir 'node_modules\.bin'

Invoke-PnpmInstall

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
Step '5/6  Frontend: install / build'
Set-Location $FrontDir
$frontBin = Join-Path $FrontDir 'node_modules\.bin'

Invoke-PnpmInstall

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
    if ($status -ne 'Running') { throw "El servicio $svc quedó en estado '$status' tras el restart." }
    Info "$svc -> Running OK"
}

$elapsed = [int]((Get-Date) - $deployStart).TotalSeconds
Write-Host "`n########## DEPLOY OK ($newHead) en ${elapsed}s ##########" -ForegroundColor Green
Write-Host "Rollback si algo salió mal: git reset --hard $rollback ; re-deploy" -ForegroundColor Yellow
