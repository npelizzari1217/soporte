# rotate-email-crypto-key.ps1 - Rota EMAIL_CRYPTO_KEY re-cifrando
# clientes.smtp_password_cifrada de OLD_KEY a NEW_KEY (VPS Windows).
# 100% ASCII (PS 5.1 lee .ps1 sin BOM como ANSI: un solo caracter no-ASCII
# corrompe el parseo, igual que rotate-admin-pw.ps1).
#
# Orden (design sdd/rotacion-email-crypto-key, ADR-4):
#   0. PATH con Node 24 + guarda de version (molde deploy.ps1)
#   1. Cargar backend/.env, validar OLD_KEY, abortar si hay un PENDIENTE sin cerrar
#   2. Generar NEW_KEY en el server
#   3. Node --dry-run (servicios arriba, solo lectura) - falla => exit 1, nada tocado
#      -DryRun de este script termina aca (exit 0)
#   4. predeploy-dump.ps1 como proceso hijo (detiene servicios, dump verificado)
#   5. Escribir el archivo PENDIENTE (OLD+NEW+dump) ANTES del paso que puede hacer COMMIT
#   6. Node (corrida real); si falla, arbol de recuperacion con --verificar OLD/NEW
#   7. Reescribir backend/.env completo (archivo temporal + Replace, nunca Add-Content)
#   8. Releer .env del disco y --verificar con esa clave
#   9. Cerrar el archivo de recuperacion (solo OLD_KEY+DUMP+fecha) y borrar el PENDIENTE
#
# Exit codes: 0 = OK. 1 = no se hizo nada (base en OLD_KEY, servicios arriba).
# 3 = base en NEW_KEY y backend/.env sin actualizar - recuperacion manual, ver
# DEPLOY-VPS-runbook.md Seccion 5. 4 = estado ambiguo, requiere intervencion.
# 5 = rotacion confirmada (base y backend/.env en NEW_KEY, verificados) pero el
# cierre final (archivo de recuperacion permanente, borrar el PENDIENTE, o
# arrancar un servicio) no se completo - revisar a mano, ver
# DEPLOY-VPS-runbook.md Seccion 5.
#
# Ninguna clave se imprime nunca. Solo se reportan longitudes y rutas de archivo.
#
# Uso:
#   powershell -NoProfile -ExecutionPolicy Bypass -File rotate-email-crypto-key.ps1 [-DryRun]
#
# Ver DEPLOY-VPS-runbook.md Seccion 5 para el procedimiento completo y la
# recuperacion manual ante cada exit code.

# CmdletBinding hace que un argumento desconocido corte ANTES de ejecutar nada.
# Sin el, `-DryRun;` (como lo pasa cmd por ssh) cae en $args y $DryRun queda en
# $false: el 2026-09-29 eso corrio la rotacion real en vez del dry-run.
[CmdletBinding()]
param(
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$RepoRoot     = 'C:\soporte'
$BackendDir   = Join-Path $RepoRoot 'backend'
$BackupDir    = Join-Path $RepoRoot 'backups'
$Services     = @('soporte-backend', 'soporte-frontend')
$NodeExe      = 'C:\nodejs24\node.exe'
$NodeDir      = 'C:\nodejs24'
$ScriptNode   = Join-Path $BackendDir 'scripts\rotar-email-crypto-key.mjs'
$PredeployPs1 = Join-Path $RepoRoot 'predeploy-dump.ps1'

if (-not $env:Path.StartsWith($NodeDir + ';')) {
  $env:Path = $NodeDir + ';' + $env:Path
}

function Step($msg) { Write-Host ("========== " + $msg + " ==========") -ForegroundColor Cyan }

function AssertOk($que) {
  if ($LASTEXITCODE -ne 0) {
    throw ($que + " fallo (exit " + $LASTEXITCODE + ").")
  }
}

# ACL de los archivos de recuperacion: legibles solo por Administrators y
# SYSTEM. Se usan SID en vez de nombres para que funcione en cualquier idioma
# de Windows. Se aplica SIEMPRE antes de escribir ninguna clave en el archivo
# (el llamador crea el archivo vacio primero).
function AplicarAclRecuperacion([string]$Ruta) {
  & icacls $Ruta /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' | Out-Null
  AssertOk ("icacls sobre " + $Ruta)
}

# Setea SOLO las variables que este llamado necesita, invoca Node, y las
# borra en un finally (molde rotate-admin-pw.ps1:66-71, ADR-3: alcance
# acotado a la invocacion). DATABASE_URL_MASTER siempre viaja porque el
# script Node no carga backend/.env (ADR-3).
function InvocarRotacion([string[]]$FlagsNode, [hashtable]$EnvVarsRotacion) {
  $envVarsTodos = @{ DATABASE_URL_MASTER = $script:databaseUrl }
  foreach ($k in $EnvVarsRotacion.Keys) { $envVarsTodos[$k] = $EnvVarsRotacion[$k] }
  foreach ($k in $envVarsTodos.Keys) {
    [System.Environment]::SetEnvironmentVariable($k, $envVarsTodos[$k], 'Process')
  }
  try {
    # `Out-Host` evita que el stdout de Node se mezcle con $LASTEXITCODE en el
    # retorno de la funcion (C1: sin esto, `-eq 0`/`-ne 0` comparan un array).
    & $NodeExe $ScriptNode @FlagsNode | Out-Host
    return [int]$LASTEXITCODE
  } finally {
    foreach ($k in $envVarsTodos.Keys) { Remove-Item ("Env:\" + $k) -ErrorAction SilentlyContinue }
  }
}

Set-Location $RepoRoot

# 0. Guarda de version de Node (molde deploy.ps1:59-73).
Step 'Pre-flight: version de Node'
$nodeVer = (& node -v).Trim()
if ($nodeVer -match '^v(\d+)\.') {
  if ([int]$Matches[1] -lt 24) {
    throw ("Node " + $nodeVer + " resuelve antes que " + $NodeDir + " en el PATH.")
  }
} else {
  throw ("No se pudo leer la version de Node: 'node -v' devolvio '" + $nodeVer + "'.")
}
Write-Host ("Node en uso: " + $nodeVer)

# 1. Cargar backend/.env (sin exportarlo al entorno del proceso: solo se lee
# en memoria), validar OLD_KEY, y abortar si una corrida anterior dejo un
# PENDIENTE sin cerrar (ADR-4: re-correr generaria otra NEW_KEY y chocaria
# contra la primera).
Step 'Cargar backend/.env y validar OLD_KEY'
$envFile = Join-Path $BackendDir '.env'
if (-not (Test-Path $envFile)) { throw "Falta $envFile" }
$lineasEnvOriginal = @(Get-Content $envFile)

$databaseUrl = $null
$oldKey = $null
foreach ($linea in $lineasEnvOriginal) {
  if ($linea -match '^DATABASE_URL_MASTER=(.*)$') { $databaseUrl = $Matches[1].Trim('"') }
  if ($linea -match '^EMAIL_CRYPTO_KEY=([0-9a-fA-F]{64})$') {
    if ($oldKey) { throw "backend/.env tiene mas de una linea EMAIL_CRYPTO_KEY=" }
    $oldKey = $Matches[1]
  }
}
if (-not $databaseUrl) { throw "backend/.env sin DATABASE_URL_MASTER" }
if (-not $oldKey) { throw "backend/.env sin una linea EMAIL_CRYPTO_KEY= valida (64 hex)" }

$pendientePrevio = Get-ChildItem -Path $BackupDir -Filter 'rotacion-email-crypto-key-*.PENDIENTE.txt' -ErrorAction SilentlyContinue
if ($pendientePrevio) {
  throw ("Existe un archivo PENDIENTE sin cerrar: " + $pendientePrevio[0].FullName + " - una corrida anterior no termino. NO se genera una NEW_KEY nueva. Ver DEPLOY-VPS-runbook.md Seccion 5, Recuperacion.")
}

# 2. Generar NEW_KEY EN EL SERVER (molde deploy.ps1:160). Nunca se tipea ni
# se pega: no existe un parametro para proveerla.
Step 'Generar NEW_KEY'
$newKey = & $NodeExe -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
if ($LASTEXITCODE -ne 0) { throw "generacion de NEW_KEY fallo (exit $LASTEXITCODE)" }
if (-not $newKey -or $newKey.Length -ne 64) { throw "generacion de NEW_KEY fallo (formato invalido)" }
Write-Host ("OLD_KEY: " + $oldKey.Length + " caracteres. NEW_KEY: " + $newKey.Length + " caracteres.")

# 3. Dry-run: servicios arriba, transaccion de solo lectura. Revalida todo lo
# que hace la corrida real (ADR-2), asi que es un adelanto del resultado, no
# la garantia.
Step 'Dry-run (servicios arriba, solo lectura)'
$exitDryRun = InvocarRotacion -FlagsNode @('--dry-run') -EnvVarsRotacion @{ ROTACION_OLD_KEY = $oldKey; ROTACION_NEW_KEY = $newKey }
if ($exitDryRun -ne 0) {
  throw ("Dry-run fallo (exit " + $exitDryRun + "). Nada fue tocado. Revisa la salida de arriba.")
}
Write-Host 'Dry-run OK.'

if ($DryRun) {
  Write-Host ''
  Write-Host '########## DRYRUN OK - ninguna base ni servicio fue tocado ##########' -ForegroundColor Green
  exit 0
}

# 4. predeploy-dump.ps1 como proceso hijo (molde deploy.ps1:124, re-exec):
# asi su exit y su propia carga de .env no contaminan este proceso. Si
# falla, el hijo YA rearranco los servicios (fail-closed, ver su cabecera).
Step 'predeploy-dump.ps1 (detiene servicios, dump verificado)'
$antesDump = Get-Date
& powershell -NoProfile -ExecutionPolicy Bypass -File $PredeployPs1
if ($LASTEXITCODE -ne 0) {
  throw ("predeploy-dump.ps1 fallo (exit " + $LASTEXITCODE + "). El hijo ya rearranco los servicios. Nada fue tocado.")
}
# Servicios DETENIDOS desde aca (predeploy-dump.ps1 los paro). W1: atrapar,
# rearrancar, y recien despues re-lanzar para que el exit 1 de abajo sea honesto.
$pendienteFile = $null
try {
  $dumpDir = Get-ChildItem -Path $BackupDir -Directory -Filter 'utc-backfill-*' |
    Where-Object { $_.CreationTime -ge $antesDump } | Sort-Object CreationTime -Descending | Select-Object -First 1
  if (-not $dumpDir) { throw 'No se encontro la carpeta de dump generada por predeploy-dump.ps1.' }
  Write-Host ('Dump verificado en ' + $dumpDir.FullName)

  # 5. Archivo PENDIENTE: existe en disco desde ANTES del primer instante en
  # que la base puede quedar en NEW_KEY (ADR-4). Crear vacio, aplicar el ACL,
  # y recien ahi escribir las claves.
  Step 'Escribir archivo de recuperacion PENDIENTE'
  $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $pendienteFile = Join-Path $BackupDir ('rotacion-email-crypto-key-' + $timestamp + '.PENDIENTE.txt')
  New-Item -ItemType File -Path $pendienteFile -Force | Out-Null
  AplicarAclRecuperacion $pendienteFile
  # Cada elemento va entre parentesis: la coma liga mas fuerte que el `+`, y sin
  # ellos PowerShell concatena todo en UNA linea separada por espacios (le paso
  # a la rotacion en produccion del 2026-09-29).
  Set-Content -Path $pendienteFile -Encoding ascii -Value @(
    ('OLD_KEY=' + $oldKey),
    ('NEW_KEY=' + $newKey),
    ('DUMP=' + $dumpDir.FullName)
  )
  Write-Host ('Archivo de recuperacion: ' + $pendienteFile)
} catch {
  if ($pendienteFile -and (Test-Path $pendienteFile)) {
    $lineasParciales = @(Get-Content $pendienteFile -ErrorAction SilentlyContinue)
    if (-not ($lineasParciales -match '^NEW_KEY=')) {
      Remove-Item -Path $pendienteFile -ErrorAction SilentlyContinue
    }
  }
  foreach ($s in $Services) { Start-Service $s }
  throw ("Paso 4/5 (dump o archivo PENDIENTE) fallo: " + $_.Exception.Message + ". Servicios reiniciados. Nada fue tocado en la base.")
}

# 6. Corrida real. Si falla, el arbol de --verificar (ADR-4) determina si
# hubo COMMIT antes de decidir el exit code.
Step 'Corrida real'
$exitReal = InvocarRotacion -FlagsNode @() -EnvVarsRotacion @{ ROTACION_OLD_KEY = $oldKey; ROTACION_NEW_KEY = $newKey }
if ($exitReal -ne 0) {
  Step 'Corrida real fallo - determinando si hubo COMMIT'
  $exitVerificarOld = InvocarRotacion -FlagsNode @('--verificar') -EnvVarsRotacion @{ ROTACION_VERIFICAR_KEY = $oldKey }
  if ($exitVerificarOld -eq 0) {
    Remove-Item -Path $pendienteFile -ErrorAction SilentlyContinue
    foreach ($s in $Services) { Start-Service $s }
    throw ("Corrida real fallo (exit " + $exitReal + "), pero la base sigue en OLD_KEY: no hubo COMMIT. Nada fue tocado, servicios reiniciados.")
  }
  $exitVerificarNew = InvocarRotacion -FlagsNode @('--verificar') -EnvVarsRotacion @{ ROTACION_VERIFICAR_KEY = $newKey }
  if ($exitVerificarNew -eq 0) {
    Write-Host 'La base SI quedo en NEW_KEY pese al fallo reportado - continuando al paso 7.' -ForegroundColor Yellow
  } else {
    Write-Host ('BASE EN ESTADO AMBIGUO. Servicios DETENIDOS. Archivo de recuperacion: ' + $pendienteFile + '. Ver DEPLOY-VPS-runbook.md Seccion 5, Recuperacion manual.') -ForegroundColor Red
    exit 4
  }
}

# 7. Reescribir backend/.env COMPLETO via archivo temporal + Replace - nunca
# Add-Content (deploy.ps1:162-165: si el .env no termina en salto de linea,
# Add-Content corrompe la variable anterior).
Step 'Reescribir backend/.env con NEW_KEY'
$mensajeBaseRotada = 'BASE YA ROTADA A LA CLAVE NUEVA. backend/.env NO se actualizo. Clave en ' + $pendienteFile + '. NO re-corras este script. Ver DEPLOY-VPS-runbook.md Seccion 5, Recuperacion.'
# Pasos 7-8: pueden correr DESPUES de un COMMIT. Cualquier falla aca (C2,
# incluidos Set-Content/Get-Content, antes sin atrapar) va al mismo exit 3.
try {
  $tmpEnvFile = $envFile + '.rotacion-tmp'
  $reemplazos = 0
  $lineasNuevas = foreach ($linea in $lineasEnvOriginal) {
    if ($linea -match '^EMAIL_CRYPTO_KEY=[0-9a-fA-F]{64}$') { $reemplazos++; 'EMAIL_CRYPTO_KEY=' + $newKey } else { $linea }
  }
  if ($reemplazos -ne 1) { throw "backend/.env no tiene una sola linea EMAIL_CRYPTO_KEY= (encontradas: $reemplazos)" }
  Set-Content -Path $tmpEnvFile -Encoding ascii -Value $lineasNuevas
  # [NullString]::Value, NUNCA $null: el binder de PowerShell convierte $null
  # en "" para un parametro [string] (aca, el backup de Replace), y Replace
  # la rechaza siempre ("empty string") - C-N1, verify-report.
  [System.IO.File]::Replace($tmpEnvFile, $envFile, [NullString]::Value)

  # 8. Releer .env del DISCO (nunca la variable en memoria) y --verificar.
  Step 'Releer backend/.env del disco y verificar'
  $claveReleida = $null
  foreach ($linea in (Get-Content $envFile)) {
    if ($linea -match '^EMAIL_CRYPTO_KEY=([0-9a-fA-F]{64})$') { $claveReleida = $Matches[1] }
  }
  if ($claveReleida -ne $newKey) { throw 'La relectura de backend/.env no coincide con NEW_KEY.' }
  $exitVerificarFinal = InvocarRotacion -FlagsNode @('--verificar') -EnvVarsRotacion @{ ROTACION_VERIFICAR_KEY = $claveReleida }
  if ($exitVerificarFinal -ne 0) { throw ('--verificar final fallo (exit ' + $exitVerificarFinal + ').') }
} catch {
  Write-Host ($mensajeBaseRotada + ' Detalle: ' + $_.Exception.Message) -ForegroundColor Red
  exit 3
}
Write-Host 'backend/.env verificado contra la base.'

# 9. Cerrar el archivo de recuperacion: SOLO OLD_KEY+DUMP+fecha, escrito como
# archivo nuevo (nunca editando el PENDIENTE en el lugar, para que NEW_KEY
# jamas llegue a este archivo). Se verifica ANTES de borrar el PENDIENTE.
# Rotacion ya confirmada aca (base+.env en NEW_KEY, verificados): CUALQUIER
# fallo de aca en mas -- crear/ACL-ar/escribir/leer el archivo permanente, su
# validacion, borrar el PENDIENTE, o arrancar un servicio -- no es "sin
# cambios" (W1) ni "sin actualizar" (W-B): es exit 5, nunca 1 ni 3.
Step 'Cerrar archivo de recuperacion y arrancar servicios'
$permanenteFile = Join-Path $BackupDir ('rotacion-email-crypto-key-' + $timestamp + '.txt')
try {
  New-Item -ItemType File -Path $permanenteFile -Force | Out-Null
  AplicarAclRecuperacion $permanenteFile
  Set-Content -Path $permanenteFile -Encoding ascii -Value @(
    ('OLD_KEY=' + $oldKey),
    ('DUMP=' + $dumpDir.FullName),
    ('ROTADA_EL=' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
  )

  $contenidoPermanente = @(Get-Content $permanenteFile)
  $lineasOldKeyValidas = @($contenidoPermanente | Where-Object { $_ -cmatch '^OLD_KEY=[0-9a-fA-F]{64}$' })
  $tieneNewKey = ($contenidoPermanente | Where-Object { $_ -match 'NEW_KEY' }).Count -gt 0
  $oldKeyEnArchivo = if ($lineasOldKeyValidas.Count -eq 1) { $lineasOldKeyValidas[0].Substring(8) } else { $null }
  if ($lineasOldKeyValidas.Count -ne 1 -or $tieneNewKey -or $oldKeyEnArchivo -ne $oldKey) {
    throw 'El archivo de recuperacion permanente no paso la verificacion.'
  }

  Remove-Item -Path $pendienteFile

  foreach ($s in $Services) { Start-Service $s }
  Start-Sleep -Seconds 5
  foreach ($s in $Services) {
    $st = (Get-Service $s).Status
    Write-Host ($s + ' -> ' + $st)
    if ($st -ne 'Running') { throw "El servicio $s no quedo Running (esta $st)." }
  }
} catch {
  Write-Host ('ROTACION CONFIRMADA (backend/.env actualizado y verificado), pero el cierre final fallo: ' + $_.Exception.Message + '. Se conserva ' + $pendienteFile + ', el archivo permanente puede haber quedado a medias (' + $permanenteFile + '). Revisar y cerrar a mano. Ver DEPLOY-VPS-runbook.md Seccion 5.') -ForegroundColor Yellow
  exit 5
}

Write-Host ''
Write-Host '########## ROTACION OK ##########' -ForegroundColor Green
Write-Host ('Archivo de recuperacion: ' + $permanenteFile) -ForegroundColor Yellow
exit 0
