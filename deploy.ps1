# deploy.ps1 - Deploy de soporte (rewrite, rama main) en el VPS Windows.
# Idempotente, aborta ante el primer error. Correr como administrator (restart NSSM).
# 100% ASCII (PS 5.1 lee .ps1 sin BOM como ANSI: un acento corrompe el parseo).
# Ver DEPLOY-VPS-runbook.md para gotchas (pnpm 11 via corepack, hoist Prisma, BACKEND_URL en build).
$ErrorActionPreference = 'Stop'

$RepoRoot   = 'C:\soporte'
$BackendDir = Join-Path $RepoRoot 'backend'
$FrontDir   = Join-Path $RepoRoot 'frontend'
$Services   = @('soporte-backend', 'soporte-frontend')
$Branch     = 'main'

function Step($msg) { Write-Host ("========== " + $msg + " ==========") -ForegroundColor Cyan }

Set-Location $RepoRoot

# 1. Pre-flight: rama main + commit de rollback
Step 'Pre-flight'
$current = (git rev-parse --abbrev-ref HEAD).Trim()
if ($current -ne $Branch) { throw "Debe estar en la rama '$Branch' (esta en '$current')" }
$rollback = (git rev-parse --short HEAD).Trim()
Write-Host ("Commit actual (rollback): " + $rollback)

# 2. Hash de lockfiles ANTES del pull (el deploy NO instala; ver runbook)
$lockBefore = @{}
foreach ($d in @($BackendDir, $FrontDir)) {
  $lf = Join-Path $d 'pnpm-lock.yaml'
  if (Test-Path $lf) { $lockBefore[$d] = (Get-FileHash $lf -Algorithm SHA256).Hash }
}

# 3. Pull ff-only
Step 'git pull --ff-only origin main'
git pull --ff-only origin $Branch
$newCommit = (git rev-parse --short HEAD).Trim()
Write-Host ("Commit nuevo: " + $newCommit)

# 4. Si cambio algun lockfile: abortar (instalar manual con servicios detenidos)
foreach ($d in @($BackendDir, $FrontDir)) {
  $lf = Join-Path $d 'pnpm-lock.yaml'
  if ((Test-Path $lf) -and ($lockBefore[$d] -ne (Get-FileHash $lf -Algorithm SHA256).Hash)) {
    throw "Cambio el lockfile en $d. Instala manual con los servicios DETENIDOS: 'corepack pnpm install' en backend/ y frontend/ (runbook: argon2 EPERM, pnpm 11), luego re-corre deploy.ps1."
  }
}

# 5. Cargar backend/.env al entorno del proceso (DATABASE_URL_MASTER, etc.)
Step 'Cargar backend/.env'
$envFile = Join-Path $BackendDir '.env'
if (-not (Test-Path $envFile)) { throw "Falta $envFile" }
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') {
    [System.Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim('"'), 'Process')
  }
}
if (-not $env:DATABASE_URL_MASTER) { throw "backend/.env sin DATABASE_URL_MASTER" }

# 6. Backend: generate + migrate master + fan-out tenants + build
Set-Location $BackendDir
Step 'Backend: prisma generate'
corepack pnpm run generate:master
corepack pnpm run generate:tenant
Step 'Backend: migrate master'
corepack pnpm run migrate:master
Step 'Backend: migrate fan-out a tenants'
corepack pnpm run migrate:tenants
Step 'Backend: build'
corepack pnpm run build

# 7. Frontend: build (OJO: BACKEND_URL se hornea aca; debe valer .../api al buildear)
Set-Location $FrontDir
Step 'Frontend: build'
corepack pnpm run build

# 8. Restart servicios NSSM + verificar Running
Set-Location $RepoRoot
Step 'Restart servicios'
foreach ($s in $Services) { Restart-Service $s -Force }
Start-Sleep -Seconds 10
foreach ($s in $Services) {
  $st = (Get-Service $s).Status
  Write-Host ($s + ' -> ' + $st)
  if ($st -ne 'Running') { throw "El servicio $s no quedo Running (esta $st). Revisa $BackendDir\service-err.log o $FrontDir\service-err.log." }
}

# 9. Smoke test interno (3101 back da 404 en / = vivo; 3100 front da 200)
Step 'Smoke test interno'
foreach ($p in 3101, 3100) {
  try {
    $r = Invoke-WebRequest ("http://localhost:" + $p + "/") -UseBasicParsing -TimeoutSec 12
    Write-Host ("port " + $p + " -> HTTP " + $r.StatusCode)
  } catch {
    Write-Host ("port " + $p + " -> HTTP " + $_.Exception.Response.StatusCode.value__ + " (responde)")
  }
}

Write-Host ""
Write-Host ("########## DEPLOY OK (" + $newCommit + ") ##########") -ForegroundColor Green
Write-Host ("Rollback: git reset --hard " + $rollback + " ; luego re-corre deploy.ps1") -ForegroundColor Yellow
