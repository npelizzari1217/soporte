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

# 6. Backend: generate + build (ANTES de migrar, ver nota de orden abajo)
Set-Location $BackendDir
Step 'Backend: prisma generate'
corepack pnpm run generate:master
corepack pnpm run generate:tenant
Step 'Backend: build'
corepack pnpm run build

# 7. Frontend: build (OJO: BACKEND_URL se hornea aca; debe valer .../api al buildear)
Set-Location $FrontDir
Step 'Frontend: build'
corepack pnpm run build

# 8. Migraciones + restart, en UNA sola ventana con los servicios DETENIDOS.
#
# ORDEN DELIBERADO, no lo muevas: los builds NO dependen de la base, asi que
# van antes. Migrar primero (como estaba hasta el deploy de compras-tres-etapas)
# dejaba al codigo VIEJO corriendo contra el schema NUEVO durante los dos builds,
# varios minutos. Con una migracion aditiva no se nota; con una que RENOMBRA una
# columna que el codigo viejo consulta, cada request falla mientras la app parece
# estar arriba, que es peor que una caida franca.
#
# Deteniendo los servicios antes de migrar, esa ventana desaparece: queda una
# caida controlada de segundos en vez de minutos de errores silenciosos.
Set-Location $RepoRoot
Step 'Detener servicios (ventana de migracion)'
foreach ($s in $Services) { Stop-Service $s -Force }

Set-Location $BackendDir
Step 'Backend: migrate master'
corepack pnpm run migrate:master
Step 'Backend: migrate fan-out a tenants'
corepack pnpm run migrate:tenants

Set-Location $RepoRoot
Step 'Arrancar servicios'
foreach ($s in $Services) { Start-Service $s }
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
