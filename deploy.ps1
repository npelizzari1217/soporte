# deploy.ps1 - Deploy de soporte (rewrite, rama main) en el VPS Windows.
# Idempotente, aborta ante el primer error. Correr como administrator (restart NSSM).
# 100% ASCII (PS 5.1 lee .ps1 sin BOM como ANSI: un acento corrompe el parseo).
# Ver DEPLOY-VPS-runbook.md para gotchas (pnpm 11 via corepack, hoist Prisma, BACKEND_URL en build).

# Commit al que revertir si el deploy sale mal. Lo pasa la instancia PADRE al
# re-ejecutarse (paso 3b). Sin esto, la hija recapturaba HEAD DESPUES del pull y
# reportaba como rollback el commit recien desplegado - un 'git reset --hard' que
# no revierte nada, y justo en los deploys donde el script cambio, que son los
# que mas probablemente lo necesiten (#139).
#
# Vacio en una corrida normal: ahi lo captura el pre-flight, que corre antes del
# pull y por lo tanto ve el commit correcto.
param([string]$RollbackCommit = '')

$ErrorActionPreference = 'Stop'

$RepoRoot   = 'C:\soporte'
$BackendDir = Join-Path $RepoRoot 'backend'
$FrontDir   = Join-Path $RepoRoot 'frontend'
$Services   = @('soporte-backend', 'soporte-frontend')
$Branch     = 'main'
$NodeExe    = 'C:\nodejs24\node.exe'
$NodeDir    = 'C:\nodejs24'

# Fijar Node 24 para TODO el pipeline, no solo para los tres usos de $NodeExe.
#
# Los dos package.json declaran "engines": { "node": ">=24" }, pero el PATH del
# VPS resuelve node Y corepack a C:\Program Files\nodejs (v22.23.2): corepack.cmd
# vive junto al node que lo instalo y se lo lleva puesto. Invocar $NodeExe por
# ruta absoluta NO alcanzaba: prisma generate, los dos build y los dos migrate
# corren por 'corepack pnpm run ...', asi que corrian en Node 22 mientras pnpm
# avisaba "Unsupported engine" seis veces por deploy sin frenar nada (#137).
#
# Anteponer el directorio al PATH cubre ademas los subprocesos: pnpm, prisma y
# cualquier script que resuelva 'node' a secas heredan el 24. El re-exec de 3b
# hereda este PATH, por eso el guard evita duplicar la entrada.
if (-not $env:Path.StartsWith($NodeDir + ';')) {
  $env:Path = $NodeDir + ';' + $env:Path
}

function Step($msg) { Write-Host ("========== " + $msg + " ==========") -ForegroundColor Cyan }

# Chequeo obligatorio despues de CADA comando nativo (git, corepack, node).
#
# $ErrorActionPreference = 'Stop' NO detiene ante el exit code de un nativo:
# solo atrapa errores de PowerShell. Sin esto, un paso puede fallar y el deploy
# sigue de largo hasta 'DEPLOY OK' con el sistema a medias - un build fallido
# deja el dist viejo, un migrate fallido arranca codigo nuevo contra el schema
# viejo. Paso tres veces el 2026-08-20 (git pull, ts-node, backfill).
function AssertOk($que) {
  if ($LASTEXITCODE -ne 0) {
    throw ($que + " fallo (exit " + $LASTEXITCODE + "). El deploy se detiene: continuar dejaria el sistema a medias.")
  }
}

Set-Location $RepoRoot

# 1. Pre-flight: rama main + commit de rollback
Step 'Pre-flight'
# Guarda dura de la version de Node. El WARN de pnpm ante un engine mismatch NO
# frena el deploy - esto si. Sin esto, que el PATH vuelva a resolver el Node 22
# (reinstalacion, cambio de PATH del sistema) es invisible hasta que algo falle
# en produccion con los servicios detenidos, que es el peor momento posible.
$nodeVer = (& node -v).Trim()
if ($nodeVer -match '^v(\d+)\.') {
  if ([int]$Matches[1] -lt 24) {
    throw ("Node " + $nodeVer + " resuelve antes que " + $NodeDir + " en el PATH. Los package.json exigen >=24 y los build y migrate correrian con el Node viejo (#137).")
  }
} else {
  throw ("No se pudo leer la version de Node: 'node -v' devolvio '" + $nodeVer + "'.")
}
Write-Host ("Node en uso: " + $nodeVer)

$current = (git rev-parse --abbrev-ref HEAD).Trim()
if ($current -ne $Branch) { throw "Debe estar en la rama '$Branch' (esta en '$current')" }
if ($RollbackCommit) {
  $rollback = $RollbackCommit
  Write-Host ("Commit de rollback (heredado de la instancia anterior): " + $rollback)
} else {
  $rollback = (git rev-parse --short HEAD).Trim()
  Write-Host ("Commit actual (rollback): " + $rollback)
}

# 2. Hash de lockfiles ANTES del pull (el deploy NO instala; ver runbook)
$lockBefore = @{}
foreach ($d in @($BackendDir, $FrontDir)) {
  $lf = Join-Path $d 'pnpm-lock.yaml'
  if (Test-Path $lf) { $lockBefore[$d] = (Get-FileHash $lf -Algorithm SHA256).Hash }
}

# 2b. Hash de ESTE script ANTES del pull.
#
# PowerShell carga el .ps1 ENTERO en memoria al invocarlo. Si el pull trae una
# version nueva de deploy.ps1, la instancia que esta corriendo SIGUE SIENDO LA
# VIEJA y los pasos nuevos NO se ejecutan - el script se actualiza a si mismo y
# se ignora. Paso de verdad el 2026-08-20: el deploy migro las columnas de
# correo y arranco el codigo nuevo salteandose la provision de la clave y el
# backfill, porque esos dos pasos solo existian en la version recien bajada.
$selfPath   = $PSCommandPath
$selfBefore = (Get-FileHash $selfPath -Algorithm SHA256).Hash

# 3. Pull ff-only
#
# EL CHEQUEO DE $LASTEXITCODE NO ES OPCIONAL. $ErrorActionPreference = 'Stop'
# NO detiene ante el exit code de un comando NATIVO, y git lo es. Sin esto, un
# pull fallido deja el deploy corriendo TODO el pipeline sobre el codigo VIEJO
# y terminando en DEPLOY OK. Paso el 2026-08-20: un archivo sin versionar en el
# VPS (rotate-admin-pw.ps1) bloqueo el merge con "untracked working tree files
# would be overwritten", el pull fallo, y el deploy reporto exito igual.
Step 'git pull --ff-only origin main'
git pull --ff-only origin $Branch
if ($LASTEXITCODE -ne 0) {
  throw "git pull --ff-only fallo (exit $LASTEXITCODE). El deploy NO puede continuar: correria sobre el codigo viejo. Causa tipica: un archivo sin versionar en el VPS que el pull pisaria - moverlo o borrarlo y re-correr."
}
$newCommit = (git rev-parse --short HEAD).Trim()
Write-Host ("Commit nuevo: " + $newCommit)

# 3b. Si el pull cambio ESTE script, re-ejecutar la version nueva y salir.
if ((Get-FileHash $selfPath -Algorithm SHA256).Hash -ne $selfBefore) {
  Step 'deploy.ps1 cambio en el pull - re-ejecutando la version nueva'
  # -RollbackCommit: lo unico del arranque original que la hija NO puede
  # recalcular, porque su pre-flight corre con el pull ya hecho (#139).
  & powershell -NoProfile -ExecutionPolicy Bypass -File $selfPath -RollbackCommit $rollback
  exit $LASTEXITCODE
}

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

# 5a. Precondicion: calendario master = default (D18, sdd/horario-laboral-por-cliente)
#
# La migracion de WU-1 siembra `calendario_laboral_dias_cliente` por tenant
# con un valor FIJO (lun-vie 9-18, sab/dom sin horario) - NUNCA copia master.
# El riesgo es el inverso: si alguien cambio la master de produccion a mano,
# el deploy cambiaria en silencio el horario vigente (y el sla_vence_at) de
# TODOS los clientes al valor fijo del seed. Este paso lo bloquea ANTES de
# builds y migraciones, sin downtime: el script es de solo lectura.
#
# Correccion del 2026-09-29 (fix W5, verify-report.md): antes decia que el
# seed "copia el default de master a cada tenant". El seed nunca lee master.
#
# Se retira en un follow-up despues del primer deploy exitoso: a partir de
# ahi master queda sin lectores y el chequeo deja de proteger algo.
Set-Location $BackendDir
Step 'Precondicion: calendario master = default'
& $NodeExe scripts/check-calendario-master-default.mjs
AssertOk 'check-calendario-master-default'
Set-Location $RepoRoot

# 5b. EMAIL_CRYPTO_KEY: cifra en reposo la contrasena SMTP de cada cliente.
#
# SE GENERA UNA SOLA VEZ. Si ya existe NO se toca, y eso NO es una
# optimizacion: regenerarla convierte TODA credencial guardada en basura
# indescifrable. No es como JWT_SECRET, donde rotar solo invalida sesiones.
# Una rotacion real exige una migracion de re-cifrado (por eso el payload
# lleva el prefijo de version v1:).
#
# Se genera en el server y NUNCA se imprime; se reporta solo la longitud.
Step 'EMAIL_CRYPTO_KEY'
if ($env:EMAIL_CRYPTO_KEY) {
  Write-Host ("EMAIL_CRYPTO_KEY ya presente (len=" + $env:EMAIL_CRYPTO_KEY.Length + ") - no se toca")
} else {
  $cryptoKey = & $NodeExe -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
  if (-not $cryptoKey -or $cryptoKey.Length -ne 64) { throw "generacion de EMAIL_CRYPTO_KEY fallo" }
  # Reescribir el archivo entero en vez de Add-Content: si el .env NO termina en
  # salto de linea, Add-Content pega el valor al final de la ULTIMA VARIABLE y
  # corrompe DOS cosas de una - la clave queda ilegible y la variable anterior
  # queda con basura pegada. Paso el 2026-08-20 contra ROOT_ADMIN_PASSWORD.
  $lineasEnv = @(Get-Content $envFile) + ("EMAIL_CRYPTO_KEY=" + $cryptoKey)
  Set-Content -Path $envFile -Value $lineasEnv -Encoding ascii
  if ((Select-String -Path $envFile -Pattern '^EMAIL_CRYPTO_KEY=[0-9a-f]{64}$' | Measure-Object).Count -ne 1) {
    throw "EMAIL_CRYPTO_KEY no quedo como una linea propia y valida en backend/.env"
  }
  [System.Environment]::SetEnvironmentVariable('EMAIL_CRYPTO_KEY', $cryptoKey, 'Process')
  Write-Host ("EMAIL_CRYPTO_KEY generada y agregada a backend/.env (len=" + $cryptoKey.Length + ")")
  Write-Host "IMPORTANTE: respaldala junto con la base. Sin ella, las contrasenas SMTP guardadas no se pueden descifrar." -ForegroundColor Yellow
}

# 6. Backend: generate + build (ANTES de migrar, ver nota de orden abajo)
Set-Location $BackendDir
Step 'Backend: prisma generate'
corepack pnpm run generate:master
AssertOk 'generate:master'
corepack pnpm run generate:tenant
AssertOk 'generate:tenant'
Step 'Backend: build'
corepack pnpm run build
AssertOk 'build del backend'

# 7. Frontend: build (OJO: BACKEND_URL se hornea aca; debe valer .../api al buildear)
Set-Location $FrontDir
Step 'Frontend: build'
corepack pnpm run build
AssertOk 'build del frontend'

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
AssertOk 'migrate:master'
Step 'Backend: migrate fan-out a tenants'
corepack pnpm run migrate:tenants
AssertOk 'migrate:tenants'

# 8b. Backfill de la config de correo - SOLO la primera vez.
#
# El backfill siembra en cada cliente la config SMTP global, cifrada, para que
# los clientes que YA existian no pierdan notificaciones al pasar el envio a
# per-tenant. Corre ANTES de arrancar los servicios: si el codigo nuevo
# levantara primero, habria una ventana con los clientes sin config.
#
# LA GUARDA IMPORTA: corre solo si NINGUN cliente tiene config todavia. Si
# corriera en cada deploy, cada cliente NUEVO que no configuro su correo
# quedaria auto-sembrado con el SMTP global - que es exactamente el respaldo
# silencioso que se descarto por decision de producto (los mails saldrian de
# una direccion generica sin que el cliente lo sepa).
#
# El script ademas es idempotente por su cuenta (WHERE smtp_password_cifrada
# IS NULL) y nunca pisa una config cargada a mano por ROOT. Esta guarda es la
# segunda linea, no la unica.
Set-Location $BackendDir
Step 'Backfill de config de correo (solo la primera vez)'
$yaHayConfig = & $NodeExe -e "const{Client}=require('pg');const c=new Client({connectionString:process.env.DATABASE_URL_MASTER.replace(/\?.*$/,'')});c.connect().then(()=>c.query('SELECT COUNT(*)::int AS n FROM clientes WHERE smtp_password_cifrada IS NOT NULL')).then(r=>{process.stdout.write(String(r.rows[0].n));return c.end()}).catch(e=>{console.error(e.message);process.exit(1)})"
if ($LASTEXITCODE -ne 0) { throw "no se pudo consultar el estado de la config de correo" }
if ([int]$yaHayConfig -gt 0) {
  Write-Host ("Ya hay " + $yaHayConfig + " cliente(s) con correo configurado - backfill OMITIDO (correcto: no debe auto-sembrar clientes nuevos)")
} else {
  # Si no hay una config SMTP global completa de la cual sembrar, el backfill
  # aborta a proposito (el CHECK de la base exige todo-o-nada). Eso NO es un
  # fallo del deploy: es un estado legitimo - significa que nunca hubo envio
  # global configurado, asi que no hay notificaciones que preservar. Tratarlo
  # como error dejaba el deploy cortado CON LOS SERVICIOS DETENIDOS, que es
  # muchisimo peor que no sembrar. Paso el 2026-08-20.
  $faltantes = @('SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD','SMTP_FROM','SMTP_SECURE') |
    Where-Object { -not [System.Environment]::GetEnvironmentVariable($_) }
  if ($faltantes.Count -gt 0) {
    Write-Host ("Backfill OMITIDO: faltan " + ($faltantes -join ', ') + " en backend/.env - no hay config global de la cual sembrar.") -ForegroundColor Yellow
    Write-Host "Cada cliente debe cargar su propia cuenta SMTP desde la pantalla ROOT." -ForegroundColor Yellow
  } else {
    Write-Host 'Ningun cliente tiene correo configurado todavia - corriendo el backfill'
    & $NodeExe scripts/backfill-correo-clientes.mjs
    if ($LASTEXITCODE -ne 0) { throw "el backfill de config de correo fallo" }
  }
}

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
