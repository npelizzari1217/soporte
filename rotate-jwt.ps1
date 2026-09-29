# rotate-jwt.ps1 - Rotacion de JWT_SECRET (VPS Windows). **BLOQUEADO: NO USAR.**
# 100% ASCII (PS 5.1 lee .ps1 sin BOM como ANSI).
#
# Versionado el 2026-09-29 desde el VPS, donde vivia sin versionar. El cuerpo de
# abajo es el original (solo se cambio un guion no-ASCII de un comentario), y
# queda como referencia para reescribirlo. La primera sentencia corta a
# proposito: tal como esta, el script reporta "OK" y deja el sistema
# inconsistente.
#
# Defectos conocidos (los tiene que resolver la reescritura):
#   1. No reconstruye el frontend. `frontend/next.config.ts` inlinea JWT_SECRET
#      en el bundle EN TIEMPO DE BUILD (clave `env`), asi que el middleware Edge
#      sigue verificando con la clave VIEJA hasta el proximo build.
#   2. No reinicia servicios: el backend sigue firmando con la clave vieja hasta
#      que reinicie. Cuando reinicia, backend y frontend quedan con claves
#      distintas y nadie puede loguearse hasta un rebuild del frontend.
#   3. `nssm set soporte-frontend AppEnvironmentExtra ...` REEMPLAZA la lista
#      entera de variables del servicio: cualquier otra que tuviera se pierde.
#   4. Usa C:\nodejs22; deploy.ps1 usa C:\nodejs24.
#   5. No chequea $LASTEXITCODE de nssm ni de setx (misma falla que el deploy del
#      2026-08-20: $ErrorActionPreference no frena ante un comando nativo).
#   6. Reescribe los .env con Get-Content | Set-Content, sin archivo temporal +
#      Replace, y si falta la linea JWT_SECRET= no hace nada y reporta OK igual.
#
# Rotar JWT_SECRET solo invalida sesiones (no es como EMAIL_CRYPTO_KEY), asi que
# mientras no exista la version buena, el camino seguro es a mano: cambiar
# JWT_SECRET en backend/.env y frontend/.env.local con el mismo valor y correr
# deploy.ps1, que reconstruye el frontend y reinicia los dos servicios. Ver
# DEPLOY-VPS-runbook.md, seccion "Scripts de operaciones sin pipeline".

throw 'rotate-jwt.ps1 esta BLOQUEADO: reporta OK y deja backend y frontend con claves distintas (no reconstruye el frontend). Ver la cabecera del script y DEPLOY-VPS-runbook.md.'

$ErrorActionPreference = 'Stop'
# Genera el nuevo JWT_SECRET en el server (node crypto) - nunca se imprime.
$jwt = & 'C:\nodejs22\node.exe' -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
if (-not $jwt -or $jwt.Length -ne 64) { throw "generacion de JWT fallo" }

$back  = 'C:\soporte\backend\.env'
$front = 'C:\soporte\frontend\.env.local'

# Reemplaza la linea JWT_SECRET= en ambos .env (sin tocar el resto).
(Get-Content $back)  -replace '^JWT_SECRET=.*', "JWT_SECRET=$jwt" | Set-Content $back  -Encoding ascii
(Get-Content $front) -replace '^JWT_SECRET=.*', "JWT_SECRET=$jwt" | Set-Content $front -Encoding ascii

# Actualiza el env del servicio frontend (NSSM) y el system env.
& nssm set soporte-frontend AppEnvironmentExtra NODE_ENV=production BACKEND_URL=http://localhost:3101 "JWT_SECRET=$jwt" | Out-Null
& setx JWT_SECRET $jwt /M | Out-Null

Write-Output ("JWT_SECRET rotado OK (len=" + $jwt.Length + ")")
