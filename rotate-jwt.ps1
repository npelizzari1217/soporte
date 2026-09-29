# rotate-jwt.ps1 - Rotacion de JWT_SECRET (VPS Windows).
# 100% ASCII (PS 5.1 lee .ps1 sin BOM como ANSI: un solo caracter no-ASCII
# corrompe el parseo, igual que rotate-admin-pw.ps1).
#
# QUE HACE: genera un JWT_SECRET nuevo en el server, lo escribe en
# backend/.env y frontend/.env.local (unica linea JWT_SECRET=, resto intacto),
# lo mezcla en el AppEnvironmentExtra del servicio soporte-backend (NSSM),
# borra la variable de entorno MACHINE que dejo una asignacion persistente
# vieja a nivel de sistema, reconstruye el frontend (el build hornea la clave
# nueva) y reinicia
# los dos servicios.
#
# POR QUE backend/.env ES LA UNICA FUENTE: JWT_SECRET vivia en TRES lugares con
# el mismo valor - backend/.env, frontend/.env.local, y esa variable MACHINE.
# Ni dotenv/config (backend src/main.ts) ni la carga de entorno de Next pisan
# una variable de proceso que YA existe. El build del frontend siempre uso la
# de backend/.env, porque deploy.ps1 (paso 5) carga ese archivo en su proceso
# pisando lo heredado, y frontend/next.config.ts la hornea EN TIEMPO DE BUILD.
# Pero el servicio NSSM del backend no recibia JWT_SECRET y heredaba la MACHINE,
# que dotenv no pisa: backend y frontend podian quedar con claves DISTINTAS, y
# con eso nadie puede loguearse. Ademas los
# servicios de Windows (sshd incluido, por donde corre este script) suelen no
# ver un cambio de variable MACHINE hasta un reboot, asi que ni depender de
# ella a mano era confiable. deploy.ps1 (paso 5c) hace la misma correccion:
# carga JWT_SECRET SOLO de backend/.env y lo empuja al proceso y al NSSM.
#
# La version anterior de este script vivia sin versionar en el VPS y quedo
# BLOQUEADA el 2026-09-29 (un throw en la primera sentencia) porque tenia seis
# defectos: no reconstruia el frontend, no reiniciaba servicios, pisaba TODO
# el AppEnvironmentExtra del frontend en vez de mezclar, usaba Node 22, no
# chequeaba el exit code de nssm ni el de la asignacion MACHINE persistente,
# y reescribia los .env sin archivo
# temporal (Get-Content | Set-Content, corrompe si falta la linea). Esta
# reescritura resuelve los seis.
#
# EXIT CODES:
#   0 = rotacion OK: los dos .env, el NSSM del backend, la variable MACHINE, el
#       build del frontend y los dos servicios quedaron consistentes con la
#       clave nueva.
#   1 = nada fue tocado. Validacion, generacion de la clave nueva, o -DryRun.
#       Los servicios NUNCA se detuvieron.
#   3 = fallo DESPUES de detener los servicios. El script intenta reiniciarlos
#       igual (con la clave VIEJA si backend/.env no llego a reescribirse, o ya
#       con la NUEVA si si). Recuperacion: correr deploy.ps1 - carga
#       JWT_SECRET desde backend/.env al build y al NSSM del backend (paso 5c)
#       y deja todo consistente con lo que haya quedado escrito en el .env.
#       Ninguna clave se imprime en ningun mensaje.
#
# USO:
#   powershell -NoProfile -ExecutionPolicy Bypass -File C:\soporte\rotate-jwt.ps1 -DryRun
#   powershell -NoProfile -ExecutionPolicy Bypass -File C:\soporte\rotate-jwt.ps1
#
# Rotar JWT_SECRET SOLO invalida sesiones (no es como EMAIL_CRYPTO_KEY: no hay
# datos cifrados con esta clave), pero la corrida real CIERRA LA SESION DE
# TODOS LOS USUARIOS - correrlo en horario de uso los desloguea a todos.
#
# Por ssh, el shell por defecto suele ser cmd: NO encadenes nada despues del
# switch en la misma linea (p.ej. "-DryRun; echo algo"). Sin [CmdletBinding()]
# ese "-DryRun;" caeria en $args sin quejarse y $DryRun quedaria en $false -
# la trampa real que corrio la rotacion de EMAIL_CRYPTO_KEY el 2026-09-29. Con
# [CmdletBinding()] un argumento asi corta ANTES de ejecutar nada, pero mas
# vale no depender de eso: una invocacion por linea, nada mas.
[CmdletBinding()]
param([switch]$DryRun)

$ErrorActionPreference = 'Stop'

$RepoRoot   = 'C:\soporte'
$BackendDir = Join-Path $RepoRoot 'backend'
$FrontDir   = Join-Path $RepoRoot 'frontend'
$Services   = @('soporte-backend', 'soporte-frontend')
$NodeExe    = 'C:\nodejs24\node.exe'
$NodeDir    = 'C:\nodejs24'

if (-not $env:Path.StartsWith($NodeDir + ';')) {
  $env:Path = $NodeDir + ';' + $env:Path
}

function Step($msg) { Write-Host ("========== " + $msg + " ==========") -ForegroundColor Cyan }

function AssertOk($que) {
  if ($LASTEXITCODE -ne 0) {
    throw ($que + " fallo (exit " + $LASTEXITCODE + ").")
  }
}

# Get-ValorUnicoEnv: identica en logica a la de deploy.ps1 (duplicada aca:
# este script no dot-sourcea nada, corre standalone por ssh). Lee un archivo
# .env y devuelve el valor de EXACTAMENTE una linea "Clave=valor"; corta si
# hay cero lineas, mas de una, o el valor queda vacio tras sacar las comillas
# del borde.
function Get-ValorUnicoEnv([string]$Ruta, [string]$Clave) {
  $patron = '^' + [regex]::Escape($Clave) + '=(.*)$'
  $coincidencias = @(@(Get-Content $Ruta) | Where-Object { $_ -match $patron })
  if ($coincidencias.Count -ne 1) {
    throw ($Ruta + " no tiene una sola linea " + $Clave + "= (encontradas: " + $coincidencias.Count + ").")
  }
  $null = $coincidencias[0] -match $patron
  $valor = $Matches[1].Trim('"')
  if (-not $valor) {
    throw ($Ruta + " tiene " + $Clave + "= vacia.")
  }
  return $valor
}

# Merge-EntradasEnv: identica en logica a la de deploy.ps1 (duplicada aca por
# el mismo motivo). Mezcla Clave=Valor en un array de lineas "Clave=Valor" (lo
# que devuelve `nssm get <servicio> AppEnvironmentExtra`, una por linea): si
# Clave ya esta, la REEMPLAZA en su misma posicion; si no, la agrega al final.
# Nunca toca otra entrada - `nssm set` reemplaza la lista ENTERA.
function Merge-EntradasEnv([string[]]$Entradas, [string]$Clave, [string]$Valor) {
  $nuevaLinea = $Clave + '=' + $Valor
  $reemplazada = $false
  $resultado = @(
    foreach ($entrada in $Entradas) {
      if ($entrada -match ('^' + [regex]::Escape($Clave) + '=')) {
        $reemplazada = $true
        $nuevaLinea
      } else {
        $entrada
      }
    }
  )
  if (-not $reemplazada) { $resultado = $resultado + $nuevaLinea }
  return $resultado
}

# Set-JwtSecretEnArchivo: reemplaza SOLO la linea JWT_SECRET= de un .env por
# el valor nuevo, byte a byte igual en todo lo demas. Archivo temporal +
# Replace, nunca Add-Content ni Get-Content | Set-Content directo sobre el
# original (deploy.ps1, EMAIL_CRYPTO_KEY: si el .env no termina en salto de
# linea, Add-Content corrompe la variable anterior; y un Set-Content a medio
# escribir sobre el original deja el archivo roto si el proceso corta ahi).
# [NullString]::Value, NUNCA $null, como tercer argumento de Replace: el
# binder de PowerShell convierte $null en "" para un parametro [string], y
# Replace la rechaza siempre (ver rotate-email-crypto-key.ps1, C-N1). Corta si
# el archivo no tiene EXACTAMENTE una linea JWT_SECRET=.
function Set-JwtSecretEnArchivo([string]$Ruta, [string]$NuevoValor) {
  $lineasOriginales = @(Get-Content $Ruta)
  $coincidencias = 0
  $lineasNuevas = @(
    foreach ($linea in $lineasOriginales) {
      if ($linea -match '^JWT_SECRET=') {
        $coincidencias++
        'JWT_SECRET=' + $NuevoValor
      } else {
        $linea
      }
    }
  )
  if ($coincidencias -ne 1) {
    throw ($Ruta + " no tiene una sola linea JWT_SECRET= (encontradas: " + $coincidencias + ").")
  }
  $tmp = $Ruta + '.rotacion-tmp'
  Set-Content -Path $tmp -Encoding ascii -Value $lineasNuevas
  [System.IO.File]::Replace($tmp, $Ruta, [NullString]::Value)
}

Set-Location $RepoRoot

# 1. Pre-flight: version de Node (molde deploy.ps1).
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

# 1b. Validar que los dos .env existen y tienen una sola linea JWT_SECRET=.
Step 'Validar backend/.env y frontend/.env.local'
$backEnvFile = Join-Path $BackendDir '.env'
$frontEnvFile = Join-Path $FrontDir '.env.local'
if (-not (Test-Path $backEnvFile)) { throw "Falta $backEnvFile" }
if (-not (Test-Path $frontEnvFile)) { throw "Falta $frontEnvFile" }
$oldKeyBack = Get-ValorUnicoEnv $backEnvFile 'JWT_SECRET'
$oldKeyFront = Get-ValorUnicoEnv $frontEnvFile 'JWT_SECRET'
Write-Host ("backend/.env: JWT_SECRET presente (len=" + $oldKeyBack.Length + "). frontend/.env.local: JWT_SECRET presente (len=" + $oldKeyFront.Length + ").")

# 1c. Validar nssm, los dos servicios, y corepack (build del frontend).
Step 'Validar nssm, servicios y corepack'
if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) {
  throw 'nssm no esta en el PATH.'
}
if (-not (Get-Command corepack -ErrorAction SilentlyContinue)) {
  throw 'corepack no esta en el PATH: no se puede buildear el frontend.'
}
foreach ($s in $Services) {
  if (-not (Get-Service $s -ErrorAction SilentlyContinue)) {
    throw "El servicio $s no existe."
  }
}

# 2. Generar NEW_KEY EN EL SERVER (molde deploy.ps1 / rotate-email-crypto-key.ps1).
# Nunca se tipea ni se pega: no existe un parametro para proveerla.
Step 'Generar NEW_KEY'
$newKey = & $NodeExe -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
if ($LASTEXITCODE -ne 0) { throw "generacion de NEW_KEY fallo (exit $LASTEXITCODE)" }
if (-not $newKey -or $newKey -notmatch '^[0-9a-f]{64}$') { throw "generacion de NEW_KEY fallo (formato invalido)" }
$huella = (Get-FileHash -InputStream ([System.IO.MemoryStream]::new([System.Text.Encoding]::ASCII.GetBytes($newKey))) -Algorithm SHA256).Hash.Substring(0, 8)
Write-Host ("OLD_KEY: " + $oldKeyBack.Length + " caracteres. NEW_KEY: " + $newKey.Length + " caracteres (huella " + $huella + ", nunca la clave).")

# 3. -DryRun: plan completo, servicios y archivos SIN TOCAR. Va DESPUES de
# validar y generar la clave (molde rotate-email-crypto-key.ps1), asi el
# dry-run adelanta el resultado real en vez de ser un chequeo mas liviano.
if ($DryRun) {
  Write-Host ''
  Write-Host 'Plan (nada fue tocado):'
  Write-Host ('  1. Detener ' + ($Services -join ', '))
  Write-Host ('  2. Reescribir la linea JWT_SECRET= en ' + $backEnvFile + ' y ' + $frontEnvFile + ' (huella nueva ' + $huella + ')')
  Write-Host '  3. Mezclar JWT_SECRET en el AppEnvironmentExtra de soporte-backend (NSSM), preservando el resto'
  Write-Host '  4. Borrar la variable de entorno MACHINE JWT_SECRET'
  Write-Host '  5. Reconstruir el frontend con la clave nueva en el proceso'
  Write-Host ('  6. Arrancar ' + ($Services -join ', ') + ' y hacer smoke test en 3101/3100')
  Write-Host ''
  Write-Host '########## DRYRUN OK - nada fue tocado ##########' -ForegroundColor Green
  exit 0
}

# 4. Corrida real. Todo lo de aca en mas puede dejar los servicios detenidos:
# el catch los reinicia y sale exit 3, nunca los deja abajo en silencio.
Step 'Detener servicios'
foreach ($s in $Services) { Stop-Service $s -Force }

try {
  Step 'Reescribir backend/.env y frontend/.env.local con NEW_KEY'
  Set-JwtSecretEnArchivo $backEnvFile $newKey
  Set-JwtSecretEnArchivo $frontEnvFile $newKey

  Step 'Releer los dos archivos del disco y verificar'
  $releidoBack = Get-ValorUnicoEnv $backEnvFile 'JWT_SECRET'
  $releidoFront = Get-ValorUnicoEnv $frontEnvFile 'JWT_SECRET'
  if ($releidoBack -ne $newKey -or $releidoFront -ne $newKey) {
    throw 'La relectura de backend/.env o frontend/.env.local no coincide con NEW_KEY.'
  }
  Write-Host 'Los dos archivos verificados contra el disco.'

  Step 'Actualizar AppEnvironmentExtra de soporte-backend (NSSM)'
  $nssmSalidaCruda = @(& nssm get 'soporte-backend' AppEnvironmentExtra)
  AssertOk 'nssm get soporte-backend AppEnvironmentExtra'
  $nssmEntradasActuales = @($nssmSalidaCruda | ForEach-Object { ($_ -replace [char]0, '').Trim() } | Where-Object { $_ -ne '' })
  $nssmEntradasNuevas = Merge-EntradasEnv $nssmEntradasActuales 'JWT_SECRET' $newKey
  & nssm set 'soporte-backend' AppEnvironmentExtra @nssmEntradasNuevas | Out-Null
  AssertOk 'nssm set soporte-backend AppEnvironmentExtra'
  Write-Host 'AppEnvironmentExtra actualizado (el resto de las variables se preservo).'

  Step 'Quitar la variable de entorno MACHINE JWT_SECRET'
  [System.Environment]::SetEnvironmentVariable('JWT_SECRET', $null, 'Machine')
  Write-Host 'Variable MACHINE JWT_SECRET eliminada (backend/.env pasa a ser la unica fuente).'

  Step 'Frontend: build (hornea la clave nueva)'
  [System.Environment]::SetEnvironmentVariable('JWT_SECRET', $newKey, 'Process')
  Set-Location $FrontDir
  corepack pnpm run build
  AssertOk 'build del frontend'
  Set-Location $RepoRoot

  Step 'Arrancar servicios'
  foreach ($s in $Services) { Start-Service $s }
  Start-Sleep -Seconds 10
  foreach ($s in $Services) {
    $st = (Get-Service $s).Status
    Write-Host ($s + ' -> ' + $st)
    if ($st -ne 'Running') { throw "El servicio $s no quedo Running (esta $st). Revisa $BackendDir\service-err.log o $FrontDir\service-err.log." }
  }

  Step 'Smoke test interno'
  foreach ($p in 3101, 3100) {
    try {
      $r = Invoke-WebRequest ("http://localhost:" + $p + "/") -UseBasicParsing -TimeoutSec 12
      Write-Host ("port " + $p + " -> HTTP " + $r.StatusCode)
    } catch {
      Write-Host ("port " + $p + " -> HTTP " + $_.Exception.Response.StatusCode.value__ + " (responde)")
    }
  }
} catch {
  Write-Host ('Fallo con los servicios detenidos: ' + $_.Exception.Message) -ForegroundColor Red
  foreach ($s in $Services) { Start-Service $s -ErrorAction SilentlyContinue }
  Write-Host 'Servicios reiniciados (con lo que haya quedado escrito). backend/.env puede ya tener la NEW_KEY si la reescritura llego a correr. Recuperacion: correr deploy.ps1 - carga JWT_SECRET desde backend/.env al build del frontend y al NSSM del backend, y deja todo consistente con el .env. Ninguna clave se imprime.' -ForegroundColor Yellow
  exit 3
}

Write-Host ''
Write-Host '########## ROTACION OK ##########' -ForegroundColor Green
Write-Host 'Todos los usuarios tienen que volver a loguearse.' -ForegroundColor Yellow
exit 0
