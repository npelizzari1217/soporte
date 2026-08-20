# rotate-admin-pw.ps1 - Rota la clave de un usuario admin de soporte (VPS Windows).
# Genera una clave nueva en el server y la aplica via backend/scripts/reset-password.ts.
# Correr como administrator, con backend/.env presente (DATABASE_URL_MASTER).
# 100% ASCII (PS 5.1 lee .ps1 sin BOM como ANSI: un solo caracter no-ASCII corrompe el parseo).
#
# Reemplaza la version anterior (no versionada) que tenia tres defectos:
#   1. Dependia de backend/scripts/reset-password.ts, que no existia.
#   2. No chequeaba $LASTEXITCODE despues de invocar ts-node (comando nativo:
#      $ErrorActionPreference = 'Stop' NO detiene ante un exit code nativo) y
#      por eso seguia de largo y escribia el archivo de clave nueva aunque el
#      cambio hubiera fallado - reporto OK sin haber rotado nada.
#   3. Tenia la contrasena de DATABASE_URL_MASTER hardcodeada en texto plano.
#
# Uso:
#   powershell -NoProfile -ExecutionPolicy Bypass -File rotate-admin-pw.ps1 [-Email admin@x.com]
#   Sin -Email, usa ROOT_ADMIN_EMAIL de backend/.env como default.

param(
  [string]$Email
)

$ErrorActionPreference = 'Stop'

$RepoRoot   = 'C:\soporte'
$BackendDir = Join-Path $RepoRoot 'backend'
$OutFile    = Join-Path $RepoRoot 'NUEVA-CLAVE-ADMIN.txt'

function Step($msg) { Write-Host ("========== " + $msg + " ==========") -ForegroundColor Cyan }

Set-Location $RepoRoot

# 1. Cargar backend/.env al entorno del proceso (DATABASE_URL_MASTER, ROOT_ADMIN_EMAIL).
# Mismo patron que deploy.ps1 paso 5 - sin credenciales hardcodeadas en este script.
Step 'Cargar backend/.env'
$envFile = Join-Path $BackendDir '.env'
if (-not (Test-Path $envFile)) { throw "Falta $envFile" }
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') {
    [System.Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim('"'), 'Process')
  }
}
if (-not $env:DATABASE_URL_MASTER) { throw "backend/.env sin DATABASE_URL_MASTER" }

# 2. Resolver el email objetivo: -Email explicito, o ROOT_ADMIN_EMAIL de backend/.env.
if (-not $Email) {
  if (-not $env:ROOT_ADMIN_EMAIL) {
    throw "Falta -Email y backend/.env no tiene ROOT_ADMIN_EMAIL para usar como default"
  }
  $Email = $env:ROOT_ADMIN_EMAIL
}
Write-Host ("Email objetivo: " + $Email)

# 3. Generar la clave nueva EN EL SERVER (crypto.randomBytes). Nunca se imprime.
Step 'Generar clave nueva'
$newPassword = & 'C:\nodejs22\node.exe' -e "process.stdout.write(require('crypto').randomBytes(24).toString('base64'))"
if ($LASTEXITCODE -ne 0) { throw "generacion de la clave nueva fallo (exit $LASTEXITCODE)" }
if (-not $newPassword) { throw "generacion de la clave nueva fallo (salida vacia)" }

# 4. Aplicar el cambio via reset-password.ts, pasando email y clave por entorno
# (nunca por argumento de linea de comandos, para no dejarlos en el historial
# de procesos). El script aborta con exit distinto de cero si el email no
# existe o si el UPDATE no se aplico de verdad - ver backend/scripts/reset-password.ts.
Step 'Aplicar el cambio (reset-password.ts)'
Set-Location $BackendDir
$env:RESET_EMAIL = $Email
$env:RESET_PASSWORD = $newPassword
corepack pnpm exec ts-node scripts/reset-password.ts
$resetExitCode = $LASTEXITCODE
Remove-Item Env:\RESET_EMAIL -ErrorAction SilentlyContinue
Remove-Item Env:\RESET_PASSWORD -ErrorAction SilentlyContinue

# EL FIX CENTRAL: chequear $LASTEXITCODE explicitamente. Si el cambio fallo,
# cortar ACA - nunca escribir el archivo de clave nueva con una clave que
# jamas se aplico (ese fue el defecto que dejaba a alguien afuera creyendo
# que la rotacion habia funcionado).
if ($resetExitCode -ne 0) {
  throw "reset-password.ts fallo (exit $resetExitCode) - la clave NO se aplico, no se escribe $OutFile"
}

# 5. Solo si el cambio se aplico de verdad: dejar la clave para retiro por RDP.
Set-Location $RepoRoot
Step 'Escribir archivo de clave nueva'
Set-Content -Path $OutFile -Value $newPassword -Encoding ascii
Write-Host ("Clave nueva escrita en " + $OutFile) -ForegroundColor Yellow
Write-Host "IMPORTANTE: retirala por RDP y BORRA el archivo del server apenas la uses." -ForegroundColor Yellow

Write-Host ""
Write-Host ("########## ROTACION OK (" + $Email + ") ##########") -ForegroundColor Green
