# predeploy-dump.ps1 - Dump verificado y fail-closed de las bases de soporte.
# Precondicion operativa del deploy con backfill de fechas (ADR-6, sdd/sesion-utc-y-backfill-de-fechas).
# 100% ASCII (PS 5.1 lee .ps1 sin BOM como ANSI: un acento corrompe el parseo).
#
# Reemplaza el metodo ad-hoc que dejo un dump fantasma de 0 bytes en
# C:\soporte\backups\ el 2026-08-20:
#   "                 datname                  _predeploy_20260820.dump"
# producido por un loop que leyo la salida de psql SIN -t -A y tomo el
# ENCABEZADO de la columna como nombre de base. Ese mismo modo de falla puede
# saltearse una base real en silencio - por eso este script enumera siempre
# con -t -A y ABORTA (nunca saltea) ante un identificador invalido.
#
# -DryRun: NO detiene servicios, NO escribe ningun dump, NO toca ninguna
# base. Enumera, valida cada identificador, verifica pg_dump/pg_restore/psql,
# espacio libre, y permiso de conexion por base. Corrible contra produccion
# sin riesgo (decision del dueno del repo, 2026-09-14 - ver tasks.md 5.1b).
# Deja SIN ejercitar solo el Stop-Service y el pg_dump en si.
#
# Corrida real (sin el switch): ademas detiene los dos servicios y los DEJA
# DETENIDOS a proposito (Stop-Service -Force sobre uno ya detenido es
# no-op, igual que en deploy.ps1) - asi el punto de restore es exacto y el
# operador recien despues abre la ventana con deploy.ps1. Fail-closed: si
# cualquier verificacion falla, rearranca los servicios y sale con codigo
# distinto de cero - el sistema queda exactamente como estaba.
#
# Uso:
#   powershell -NoProfile -ExecutionPolicy Bypass -File predeploy-dump.ps1 -DryRun
#   powershell -NoProfile -ExecutionPolicy Bypass -File predeploy-dump.ps1
#
# Ver DEPLOY-VPS-runbook.md para el procedimiento completo (ventana atomica,
# verificacion post-deploy, restore).

param(
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$RepoRoot     = 'C:\soporte'
$BackendDir   = Join-Path $RepoRoot 'backend'
$BackupRoot   = Join-Path $RepoRoot 'backups'
$Services     = @('soporte-backend', 'soporte-frontend')
$PgBinDir     = 'C:\Program Files\PostgreSQL\16\bin'
$PgDumpExe    = Join-Path $PgBinDir 'pg_dump.exe'
$PgRestoreExe = Join-Path $PgBinDir 'pg_restore.exe'
$PsqlExe      = Join-Path $PgBinDir 'psql.exe'

# Identificador Postgres seguro: mismo criterio que assertValidIdentifier
# (backend/src/clientes/infrastructure/postgres-admin.service.ts:27), pero
# restringido a minusculas porque asi nace todo nombre de base de este repo
# (soporte_master, y los tenants con sufijo hex en minusculas).
$ValidIdentifier = '^[a-z_][a-z0-9_]*$'

function Step($msg) { Write-Host ("========== " + $msg + " ==========") -ForegroundColor Cyan }

function AssertOk($que) {
  if ($LASTEXITCODE -ne 0) {
    throw ($que + " fallo (exit " + $LASTEXITCODE + ").")
  }
}

# URL de una base especifica, derivada de DATABASE_URL_MASTER reemplazando
# solo el path - nunca hardcodea host/user/clave. Mismo criterio que
# tenantUrl() en backend/scripts/migrate-tenants.js.
function DbUrl([string]$dbName) {
  if ($env:DATABASE_URL_MASTER -notmatch '^(.*://[^/]+)/[^/?]*(\?.*)?$') {
    throw ("No se pudo derivar la URL de la base '" + $dbName + "' desde DATABASE_URL_MASTER")
  }
  return $Matches[1] + '/' + $dbName + $Matches[2]
}

Set-Location $RepoRoot

# 1. Cargar backend/.env (mismo patron que deploy.ps1, paso 5).
Step 'Cargar backend/.env'
$envFile = Join-Path $BackendDir '.env'
if (-not (Test-Path $envFile)) { throw "Falta $envFile" }
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') {
    [System.Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim('"'), 'Process')
  }
}
if (-not $env:DATABASE_URL_MASTER) { throw "backend/.env sin DATABASE_URL_MASTER" }

if ($env:DATABASE_URL_MASTER -notmatch '^.*://[^/]+/([^/?]+)') {
  throw "No se pudo leer el nombre de la base master desde DATABASE_URL_MASTER"
}
$masterDbName = $Matches[1]

# 2. pg_dump / pg_restore / psql presentes, y version.
Step 'Verificar herramientas de Postgres'
foreach ($exe in @($PgDumpExe, $PgRestoreExe, $PsqlExe)) {
  if (-not (Test-Path $exe)) { throw ("No se encontro " + $exe) }
}
$pgDumpVersion = & $PgDumpExe --version
AssertOk 'pg_dump --version'
Write-Host ("pg_dump: " + $pgDumpVersion)

# 3. Enumerar bases: master + tenants activos desde el REGISTRO, nunca
# hardcodeadas (el sufijo hex de un tenant cambia si se recrea). SIEMPRE con
# -t -A: columna sola, sin encabezado, sin alineacion - la causa raiz del
# dump fantasma fue justo la falta de estos dos flags.
Step 'Enumerar bases desde el registro'
$tenantNamesRaw = & $PsqlExe $env:DATABASE_URL_MASTER -t -A -c "SELECT db_name FROM clientes WHERE activo = true AND deleted_at IS NULL ORDER BY db_name"
AssertOk 'enumeracion de tenants (psql)'
$tenantNames = @($tenantNamesRaw -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })

$dbNames = @($masterDbName) + $tenantNames
Write-Host (($dbNames.Count).ToString() + " base(s): " + ($dbNames -join ', '))

# 4. Validar CADA identificador antes de componer ningun comando. Uno
# invalido ABORTA - nunca se saltea (saltear en silencio es exactamente el
# otro modo de falla del metodo ad-hoc que este script reemplaza).
Step 'Validar identificadores'
foreach ($db in $dbNames) {
  if ($db -cnotmatch $ValidIdentifier) {
    throw ("Nombre de base invalido: '" + $db + "' no matchea " + $ValidIdentifier + " - abortando, no se saltea ninguna base.")
  }
}
Write-Host "Todos los identificadores son validos."

# 5. Tamano estimado vs. espacio libre, y permiso de conexion por base.
#
# "Permiso del rol para dumpear" se verifica por CONEXION (SELECT 1): pg_dump
# no tiene un modo -DryRun propio (necesita un archivo seekable para -Fc), asi
# que una corrida real de pg_dump no se puede simular sin escribir un dump -
# eso es lo unico que -DryRun deja sin ejercitar (ver cabecera del archivo).
Step 'Verificar espacio libre y permiso de conexion por base'
$estimatedBytes = 0
foreach ($db in $dbNames) {
  $sizeRaw = & $PsqlExe (DbUrl $db) -t -A -c "SELECT pg_database_size(current_database())"
  AssertOk ("consulta de tamano de " + $db)
  $estimatedBytes += [int64]($sizeRaw.Trim())

  & $PsqlExe (DbUrl $db) -t -A -c "SELECT 1" | Out-Null
  AssertOk ("conexion de verificacion a " + $db)
}
$driveLetter = $RepoRoot.Substring(0, 1)
$freeBytes = (Get-PSDrive -Name $driveLetter).Free
Write-Host ("Tamano estimado (bases, sin comprimir): " + [math]::Round($estimatedBytes / 1MB, 1) + " MB")
Write-Host ("Espacio libre en " + $driveLetter + ": " + [math]::Round($freeBytes / 1GB, 1) + " GB")
if ($freeBytes -lt $estimatedBytes) {
  throw "Espacio libre insuficiente para el dump estimado."
}
Write-Host "Permiso de conexion OK para todas las bases."

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dumpDir = Join-Path $BackupRoot ("utc-backfill-" + $timestamp)

if ($DryRun) {
  Step 'DryRun: precondiciones en verde'
  Write-Host "Bases que se dumpearian:"
  foreach ($db in $dbNames) {
    Write-Host ("  " + $db + " -> " + (Join-Path $dumpDir ($db + '.dump')))
  }
  Write-Host ""
  Write-Host "########## DRYRUN OK - ninguna base ni servicio fue tocado ##########" -ForegroundColor Green
  exit 0
}

# 6. Detener servicios - EXACTO, no aproximado: nadie escribe a partir de
# aca, asi que el dump que sigue es el punto de restore real.
Step 'Detener servicios (dump exacto)'
foreach ($s in $Services) { Stop-Service $s -Force }

try {
  Step 'Crear carpeta de backup'
  New-Item -ItemType Directory -Path $dumpDir -Force | Out-Null

  Step 'Dump de cada base (-Fc)'
  foreach ($db in $dbNames) {
    $dumpFile = Join-Path $dumpDir ($db + '.dump')
    Write-Host ("  " + $db + " -> " + $dumpFile)
    & $PgDumpExe (DbUrl $db) '-Fc' '-f' $dumpFile
    AssertOk ("pg_dump de " + $db)
  }

  Step 'Verificar dumps (cantidad, tamano, contenido)'
  $dumpFiles = Get-ChildItem -Path $dumpDir -Filter '*.dump'
  if ($dumpFiles.Count -ne $dbNames.Count) {
    throw ("Cantidad de archivos de dump (" + $dumpFiles.Count + ") distinta de la cantidad de bases enumeradas (" + $dbNames.Count + ").")
  }

  $resumen = @()
  foreach ($db in $dbNames) {
    $dumpFile = Join-Path $dumpDir ($db + '.dump')
    $file = Get-Item $dumpFile
    if ($file.Length -le 0) {
      throw ("Dump de tamano 0 para " + $db + " (" + $dumpFile + ") - exactamente la falla que este script existe para prevenir.")
    }

    $toc = & $PgRestoreExe '--list' $dumpFile
    AssertOk ("pg_restore --list de " + $dumpFile)

    $tablaEsperada = if ($db -eq $masterDbName) { 'clientes' } else { 'tickets' }
    $patronTabla = 'TABLE\s+public\s+' + [regex]::Escape($tablaEsperada) + '\b'
    $tieneTablaEsperada = ($toc | Select-String -Pattern $patronTabla -Quiet)
    if (-not $tieneTablaEsperada) {
      throw ("El dump de " + $db + " no lista la tabla esperada '" + $tablaEsperada + "' en su TOC.")
    }

    $resumen += [PSCustomObject]@{ Base = $db; Bytes = $file.Length; EntradasTOC = ($toc | Measure-Object).Count }
  }

  Step 'Resumen'
  $resumen | Format-Table -AutoSize | Out-String | Write-Host

} catch {
  Step 'FALLO - rearrancando servicios (fail-closed, ADR-6)'
  foreach ($s in $Services) { Start-Service $s }
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host "########## PREDEPLOY-DUMP FALLO - servicios rearrancados, sistema como estaba ##########" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host ("########## PREDEPLOY-DUMP OK (" + $dumpDir + ") ##########") -ForegroundColor Green
Write-Host "Los servicios quedan DETENIDOS a proposito - abri la ventana de deploy (deploy.ps1) recien despues de leer este resumen." -ForegroundColor Yellow
exit 0
