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
# cualquier verificacion falla, BORRA la carpeta de dump del intento (pg_dump
# crea el archivo de salida ANTES de fallar - medido contra produccion, ver
# comentario junto al pg_dump real mas abajo), rearranca los servicios, y
# sale con codigo distinto de cero - el sistema queda exactamente como
# estaba, y backups/ nunca queda con un dump a medias que parezca valido.
#
# TODA URL de conexion pasa SIEMPRE por DbUrl() (unico lugar que la arma) y
# SIEMPRE con -d explicito y las opciones antes: psql y pg_dump usan el
# parser de URI de libpq, que rechaza el "?schema=public" que trae
# DATABASE_URL_MASTER (parametro propio de Prisma) y que, ademas, si la URL
# se pasa como primer argumento posicional, ignora los flags que la siguen.
# Medido contra produccion el 2026-09-14 - ver comentarios en DbUrl().
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
#
# UNICO lugar que arma una URL para psql/pg_dump - por eso el query string se
# descarta ACA, no en cada call site. DATABASE_URL_MASTER trae "?schema=public"
# (parametro propio de Prisma, selecciona el schema logico de la conexion).
# psql y pg_dump usan el parser de URI de libpq, que NO conoce ese parametro y
# lo rechaza de plano: "invalid URI query parameter: schema" (exit 2, medido
# contra el VPS de produccion el 2026-09-14). pg (node-postgres), que es lo
# unico que usaba esta URL hasta este script, lo tolera - por eso ningun otro
# camino de este repo lo habia pisado antes. Que nadie "restaure" el query de
# vuelta: rompe TODO llamado a psql/pg_dump de este archivo por igual.
function DbUrl([string]$dbName) {
  if ($env:DATABASE_URL_MASTER -notmatch '^(.*://[^/]+)/[^/?]*(\?.*)?$') {
    throw ("No se pudo derivar la URL de la base '" + $dbName + "' desde DATABASE_URL_MASTER")
  }
  return $Matches[1] + '/' + $dbName
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
#
# La URL SIEMPRE va con -d explicito, y las opciones ANTES que -d. Medido
# contra el VPS de produccion el 2026-09-14: con la URL como primer argumento
# posicional (`psql <url> -t -A -c "..."`), psql la toma como el nombre de
# base y trata -t/-A/-c como argumentos posicionales EXTRA - los ignora con
# un warning y ninguno de los tres surte efecto. `-d <url>` es la unica forma
# verificada que anda (exit 0).
Step 'Enumerar bases desde el registro'
$tenantNamesRaw = & $PsqlExe -t -A -d (DbUrl $masterDbName) -c "SELECT db_name FROM clientes WHERE activo = true AND deleted_at IS NULL ORDER BY db_name"
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

# 5. Tamano estimado vs. espacio libre, permiso de conexion por base, y
# cantidad de tablas de origen (para la verificacion estructural del dump
# real, mas abajo - se toma ACA, antes de dumpear, sobre la base origen).
#
# "Permiso del rol para dumpear" se verifica por CONEXION (SELECT 1): pg_dump
# no tiene un modo -DryRun propio (necesita un archivo seekable para -Fc), asi
# que una corrida real de pg_dump no se puede simular sin escribir un dump -
# eso es lo unico que -DryRun deja sin ejercitar (ver cabecera del archivo).
Step 'Verificar espacio libre, permiso de conexion, y contar tablas por base'
$estimatedBytes = 0
$tableCounts = @{}
foreach ($db in $dbNames) {
  $sizeRaw = & $PsqlExe -t -A -d (DbUrl $db) -c "SELECT pg_database_size(current_database())"
  AssertOk ("consulta de tamano de " + $db)
  $estimatedBytes += [int64]($sizeRaw.Trim())

  & $PsqlExe -t -A -d (DbUrl $db) -c "SELECT 1" | Out-Null
  AssertOk ("conexion de verificacion a " + $db)

  # Cantidad de tablas de la base ORIGEN, medida ANTES del dump - la unica
  # forma de comparar "el dump tiene todas las tablas que tenia la base" sin
  # asumir CUALES tablas son (ver comentario junto a la verificacion real).
  $tableCountRaw = & $PsqlExe -t -A -d (DbUrl $db) -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'"
  AssertOk ("conteo de tablas de " + $db)
  $tableCounts[$db] = [int]($tableCountRaw.Trim())
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
    # pg_dump usa el mismo parser de URI de libpq que psql (ver DbUrl arriba)
    # - mismo -d explicito, misma razon: una URL posicional se puede tomar
    # como un argumento suelto y dejar -Fc/-f sin efecto. Medido contra el
    # VPS de produccion el 2026-09-14, y PEOR de lo que -DryRun deja ver:
    # con la URL vieja (?schema= sin limpiar) pg_dump salio con exit 1 pero
    # IGUAL CREO el archivo de salida ANTES de fallar - un dump de 0 bytes
    # que a simple vista parece un backup valido. Es la forma exacta del
    # artefacto historico de C:\soporte\backups\ (dump fantasma del
    # 2026-08-20). Por eso la verificacion de abajo (tamano > 0 Y
    # pg_restore --list) NO es decoracion defensiva: es la unica manera de
    # detectar un pg_dump que fallo pero dejo un archivo.
    & $PgDumpExe '-Fc' '-d' (DbUrl $db) '-f' $dumpFile
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
      throw ("Dump de tamano 0 para " + $db + " (" + $dumpFile + ") - exactamente la falla que este script existe para prevenir (pg_dump crea el archivo ANTES de fallar).")
    }

    # pg_restore --list SOLO lee el archivo local $dumpFile - no abre ninguna
    # conexion a base, asi que no necesita -d ni pasa por DbUrl. El parser de
    # URI de libpq (la causa del defecto de arriba) nunca entra en juego aca.
    $toc = & $PgRestoreExe '--list' $dumpFile
    AssertOk ("pg_restore --list de " + $dumpFile)

    # Verificacion ESTRUCTURAL, no de negocio - y esto no es un detalle de
    # estilo, es una correccion sobre una version anterior de este mismo
    # archivo que asumia "clientes" en master y "tickets" en cada tenant.
    # Medido contra produccion el 2026-09-14: los 4 tenants activos corren
    # LAS MISMAS 39 migraciones, pero dos de ellos (los mas viejos, con
    # tablas de ticketing borradas a mano por decision del dueno) tienen 28
    # tablas en vez de 33 - CERO de tickets/compras/items_compra/
    # ticket_edilicia/ticket_soporte. Esa divergencia es legitima, no un
    # defecto: un verificador multi-tenant no puede afirmar nada sobre el
    # catalogo de negocio de un tenant, porque los tenants difieren por
    # motivos validos (intervencion manual, modulos por cliente, alta en
    # distintas fechas). Lo unico que SI tiene que ser cierto para CUALQUIER
    # esquema es que el dump este completo: misma cantidad de tablas que la
    # base origen tenia (medido en el paso 5, ANTES de dumpear). Esto
    # generaliza al caso anterior en vez de debilitarlo: si CUALQUIER tabla
    # -incluida "clientes" en master- faltara en el dump, el conteo no
    # cerraria y esto igual abortaria. `master` no tiene un tratamiento
    # especial aparte: es multi-tenant en el sentido de que su esquema
    # tambien podria evolucionar, y el conteo ya lo cubre sin necesidad de
    # asumir el nombre de ninguna tabla puntual.
    #
    # El patron cuenta entradas "TABLE public <nombre>" del TOC - el tipo de
    # entrada que pg_restore --list emite por la DDL de cada tabla real
    # cuando el dump es de esquema+datos (el default de -Fc, sin
    # --schema-only/--data-only). Deliberadamente NO matchea "TABLE DATA
    # public <nombre>" (la entrada del payload de datos, una por tabla
    # tambien): el "\s+public" inmediatamente despues de "TABLE" no admite
    # la palabra "DATA" en el medio, asi que cada tabla real cuenta UNA sola
    # vez via esta entrada, nunca dos.
    $patronTablasToc = 'TABLE\s+public\s+\S+'
    $tocTableCount = (($toc | Select-String -Pattern $patronTablasToc)).Count
    $sourceTableCount = $tableCounts[$db]
    if ($tocTableCount -ne $sourceTableCount) {
      throw ("El dump de " + $db + " tiene " + $tocTableCount + " tabla(s) en su TOC, pero la base origen tenia " + $sourceTableCount + " tabla(s) en 'public' - dump incompleto.")
    }

    $resumen += [PSCustomObject]@{ Base = $db; Bytes = $file.Length; TablasOrigen = $sourceTableCount; TablasTOC = $tocTableCount; EntradasTOC = ($toc | Measure-Object).Count }
  }

  Step 'Resumen'
  $resumen | Format-Table -AutoSize | Out-String | Write-Host

} catch {
  Step 'FALLO - limpiando dump parcial y rearrancando servicios (fail-closed, ADR-6)'
  # pg_dump crea el archivo de salida ANTES de fallar (medido contra
  # produccion, ver comentario arriba) - un intento fallido puede dejar
  # backups/ con dumps de 0 bytes, o con algunas bases completas y otras no,
  # que a simple vista parecen un backup valido. BORRAR la carpeta entera
  # del intento (nunca dejarla "por las dudas") es lo que evita que un
  # operador futuro confunda un intento fallido con uno verificado - un
  # backup a medias es peor que ninguno, porque miente.
  if (Test-Path $dumpDir) {
    Remove-Item -Path $dumpDir -Recurse -Force
    Write-Host ("Carpeta de dump parcial borrada: " + $dumpDir) -ForegroundColor Yellow
  }
  foreach ($s in $Services) { Start-Service $s }
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host "########## PREDEPLOY-DUMP FALLO - dump parcial borrado, servicios rearrancados, sistema como estaba ##########" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host ("########## PREDEPLOY-DUMP OK (" + $dumpDir + ") ##########") -ForegroundColor Green
Write-Host "Los servicios quedan DETENIDOS a proposito - abri la ventana de deploy (deploy.ps1) recien despues de leer este resumen." -ForegroundColor Yellow
exit 0
