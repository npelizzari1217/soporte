<#
.SYNOPSIS
    Deploy ordenado de Soporte en el VPS Windows (educandow-vps).

.DESCRIPTION
    Actualiza producción de forma determinista e idempotente, en el orden correcto
    para una app multi-tenant (NestJS + Next.js) servida por servicios NSSM.

    Orden:
      1. Pre-flight y punto de rollback (commit actual).
      2. git pull --ff-only origin master.
      3. Carga backend/.env al entorno de la sesión (necesario para el fan-out de tenants).
      4. Backend: install -> prisma generate -> migrate master -> migrate TODOS los tenants -> build.
      5. Frontend: install -> build.
      6. Restart de servicios NSSM y verificación de estado.

    Cualquier error ABORTA el deploy (ErrorActionPreference = Stop) y deja impreso
    el commit de rollback. Las migraciones Prisma son idempotentes (migrate deploy
    no re-aplica); volver a correr el script es seguro.

.PARAMETER SkipBuild
    Salta los builds (solo pull + migraciones + restart). Uso excepcional.

.NOTES
    Requiere ejecutarse como administrator (control de servicios NSSM).
    Correr desde la raíz del repo:  powershell -ExecutionPolicy Bypass -File .\deploy.ps1
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

# Corre un comando externo y aborta si el exit code != 0 (PowerShell no lo hace solo).
function Invoke-Checked($file, [string[]]$cmdArgs) {
    Info "> $file $($cmdArgs -join ' ')"
    & $file @cmdArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Comando falló (exit $LASTEXITCODE): $file $($cmdArgs -join ' ')"
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
Write-Host "########## DEPLOY SOPORTE — $deployStart ##########" -ForegroundColor Green

# ─── 1. Pre-flight ───────────────────────────────────────────────────────────
Step '1/6  Pre-flight'
Set-Location $RepoRoot
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne 'master') { throw "Rama inesperada '$branch' (se esperaba master). Abortando." }
$rollback = (git rev-parse HEAD).Trim()
Info "Rama: $branch"
Info "Commit actual (rollback): $rollback"

# ─── 2. Pull ─────────────────────────────────────────────────────────────────
Step '2/6  git pull --ff-only origin master'
Invoke-Checked 'git' @('fetch', 'origin')
$behind = (git rev-list --count "HEAD..origin/master").Trim()
if ($behind -eq '0' -and -not $SkipBuild) {
    Info 'Ya está al día con origin/master. Rebuild/restart igual para asegurar estado.'
}
Invoke-Checked 'git' @('pull', '--ff-only', 'origin', 'master')
$newHead = (git rev-parse --short HEAD).Trim()
Info "Nuevo HEAD: $newHead"

# ─── 3. Cargar entorno ───────────────────────────────────────────────────────
Step '3/6  Cargar backend/.env'
Import-DotEnv (Join-Path $BackendDir '.env')
if (-not $env:DATABASE_URL_MASTER) {
    throw 'DATABASE_URL_MASTER no quedó definida tras cargar .env. Abortando ANTES de migrar (el fan-out caería a localhost).'
}
Info 'DATABASE_URL_MASTER cargada (valor oculto).'

# ─── 4. Backend ──────────────────────────────────────────────────────────────
Step '4/6  Backend: install / generate / migrate / build'
Set-Location $BackendDir
Invoke-Checked 'pnpm' @('install', '--frozen-lockfile')
Invoke-Checked 'pnpm' @('run', 'generate:master')
Invoke-Checked 'pnpm' @('run', 'generate:tenant')

Info 'Migrando DB master...'
Invoke-Checked 'pnpm' @('run', 'migrate:master')

Info 'Migrando TODOS los tenants activos (fan-out)...'
Invoke-Checked 'pnpm' @('exec', 'ts-node', 'scripts/migrate-tenants.ts')

if (-not $SkipBuild) {
    Info 'Compilando backend...'
    Invoke-Checked 'pnpm' @('run', 'build')
}

# ─── 5. Frontend ─────────────────────────────────────────────────────────────
Step '5/6  Frontend: install / build'
Set-Location $FrontDir
Invoke-Checked 'pnpm' @('install', '--frozen-lockfile')
if (-not $SkipBuild) {
    Invoke-Checked 'pnpm' @('run', 'build')
}

# ─── 6. Restart servicios ────────────────────────────────────────────────────
Step '6/6  Restart de servicios NSSM'
foreach ($svc in $Services) {
    Info "Reiniciando $svc..."
    Restart-Service -Name $svc -Force
}
Start-Sleep -Seconds 3
foreach ($svc in $Services) {
    $status = (Get-Service -Name $svc).Status
    if ($status -ne 'Running') { throw "El servicio $svc quedó en estado '$status' tras el restart." }
    Info "$svc -> Running OK"
}

$elapsed = [int]((Get-Date) - $deployStart).TotalSeconds
Write-Host "`n########## DEPLOY OK ($newHead) en ${elapsed}s ##########" -ForegroundColor Green
Write-Host "Rollback si algo salió mal: git reset --hard $rollback && re-deploy" -ForegroundColor Yellow
