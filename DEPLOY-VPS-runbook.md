# Runbook de deploy — VPS Windows

Documento de apoyo de `deploy.ps1`, que lo cita en su cabecera. Describe **lo que el script
hace**, por qué está en ese orden, y qué hacer cuando aborta.

> **Todo lo que sigue está leído de `deploy.ps1` en el commit en que se escribió este archivo
> (2026-08-31).** Si el script cambia, este documento envejece: lo que manda es el script.
> Verificación rápida de que siguen alineados:
> ```powershell
> Select-String -Path deploy.ps1 -Pattern '^\$RepoRoot|^\$Services|^\$Branch'
> ```

---

## Cómo se llega al VPS

El acceso está en `~/.ssh/config` de la máquina de desarrollo, bajo un nombre que engaña:

```
Host educandow-vps          # <- el nombre es de otro proyecto; el VPS es EL MISMO
    HostName 86.48.23.197
    User administrator
    Port 50022
    IdentityFile ~/.ssh/id_ed25519
```

**Soporte y educandow comparten VPS** (hostname `vmi3039999`). El alias quedó con el nombre del
primer proyecto que lo usó. Si buscás "soporte" en la config de SSH no encontrás nada y concluís
que no hay acceso — pasó el 2026-08-31.

**La sesión SSH entra elevada** (verificado: `IsInRole(Administrator)` → `True`), así que
`deploy.ps1` corre por SSH sin más. Comprobación:

```bash
ssh educandow-vps 'powershell -NoProfile -Command "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(\"Administrators\")"'
```

## Lo mínimo

Desde la máquina de desarrollo:

```bash
ssh educandow-vps 'powershell -NoProfile -ExecutionPolicy Bypass -File C:\soporte\deploy.ps1' > /tmp/deploy.log 2>&1
echo "EXIT=$?"
```

O en el VPS directamente, con PowerShell **como administrator**:

```powershell
cd C:\soporte
.\deploy.ps1
```

**Administrator no es opcional**: el script hace `Stop-Service` / `Start-Service` sobre los
servicios NSSM.

> **El `echo $?` va en su propia línea, NO detrás de un pipe.** En `deploy | tail` el status del
> pipeline es el de `tail` — siempre 0 — así que un deploy abortado se lee como exitoso. Es la
> misma familia de defecto que el `Tee-Object` que este script ya tuvo.

El `git pull` lo hace el script **en el VPS**; nada se sube desde la máquina de desarrollo.

## Preflight de `EMAIL_CRYPTO_KEY` y 2FA (antes del deploy)

El 2FA cifra su secreto con `EMAIL_CRYPTO_KEY`. Antes de desplegar, comprobá que `backend\.env` la
tenga (sin imprimirla); `deploy.ps1` la genera solo si falta, pero un valor inválido deja a todos
los usuarios con 2FA sin poder entrar:

```powershell
if ((Get-Content C:\soporte\backend\.env) -match '^EMAIL_CRYPTO_KEY=[0-9a-fA-F]{64}$') { 'EMAIL_CRYPTO_KEY ok' } else { 'EMAIL_CRYPTO_KEY AUSENTE O INVALIDA' }
```

Tras el deploy, **todo ROOT queda obligado a enrolar el 2FA en su primer login**: tené el celular
con la app de autenticación a mano antes de entrar.

## Preflight que conviene correr antes

El deploy aborta solo, pero estos tres chequeos son de lectura y evitan la ida y vuelta:

```bash
# 1. En qué commit está producción, y si la rama es main
ssh educandow-vps 'cd C:\soporte && git rev-parse --abbrev-ref HEAD && git rev-parse --short HEAD'

# 2. Qué archivos sin versionar hay en el VPS
ssh educandow-vps 'cd C:\soporte && git status --short'

# 3. ¿Alguno colisiona con lo que entra? (desde el repo local)
git diff --name-only <commit-del-vps>..origin/main | sort > /tmp/entrantes.txt
#    y comparar contra la lista del paso 2 — una colisión bloquea el pull ff-only
```

El paso 3 importa: al 2026-08-31 el VPS tenía **18 archivos sin versionar** (logs de servicio,
scripts `_vps-*`, `backups/`, `iis/`). Ninguno colisionaba, pero el script documenta que el
2026-08-20 uno de ellos bloqueó el pull y el deploy **reportó éxito igual**.

### Precondición del calendario master — retirada

El deploy del 2026-09-29 (`64555d6`) corrió una vez un chequeo de solo lectura (D18,
`sdd/horario-laboral-por-cliente`) que exigía que `calendario_laboral_dias` en master fuera
lun-vie 9-18: el seed por inquilino es fijo y un master editado a mano habría cambiado en silencio
el horario de todos los clientes. Dio verde, las 8 bases de inquilino quedaron sembradas, y desde
ahí master no tiene lectores: el paso se retiró de `deploy.ps1`, y la tabla se dropeó después
(migración `20260929100000_drop_calendario_laboral_dias`). Cada cliente edita su horario en
la pantalla "Horario laboral".

| Qué | Valor |
|---|---|
| Repo en el VPS | `C:\soporte` |
| Servicios (NSSM) | `soporte-backend`, `soporte-frontend` |
| Puertos internos | backend **3101**, frontend **3100**. Solo accesibles desde la propia máquina: el firewall del VPS los tiene cerrados hacia afuera (verificado el 2026-10-16 desde internet, con el 443 abierto como control). Tiene que seguir así: los guards del backend confían en `x-forwarded-for` desde cualquier origen, y el BFF es quien lo sanea; con el 3101 expuesto, un cliente podría saltear ese saneo |
| Node | `C:\nodejs24\node.exe` (v24) — **hay un segundo Node en el PATH**, ver abajo |
| Rama | `main` (el script aborta si estás en otra) |
| Package manager | `corepack pnpm` — **pnpm 11.18.0**, fijado en `packageManager` de los dos `package.json` |

### Nota histórica: precondición de componentes sin repuesto (retirada)

`sdd/catalogo-unico-componentes` volvió obligatorio el repuesto de cada componente de equipo: su
migración tenant (`20260929120000_componentes_insumo_obligatorio`) deja `componentes_equipo.insumo_id`
en NOT NULL. Para que no abortara, `deploy.ps1` (paso 5a) medía las filas con `insumo_id` NULL con
`backend/scripts/limpiar-componentes-sin-insumo.mjs` antes de los builds. La migración se aplicó en
producción el 2026-09-29 en los 8 tenants (dump previo: `utc-backfill-20260929-183028`), así que la
precondición, el script y sus specs se retiraron el 2026-09-30, igual que el chequeo D18 de arriba.
Si hubiera que revertir esa migración, ver "Rollback del tracker `catalogo-unico-componentes`".

Lección general que se conserva: si una migración tenant aborta en un tenant, Prisma la marca como
fallida y los deploys siguientes fallan con `P3009`. Se corrige la causa en esa base y se marca la
migración como revertida con el `DATABASE_URL_TENANT` de **ese** tenant, siempre con
`--config prisma.tenant.config.ts`; sin él, Prisma 7 toma `DATABASE_URL_MASTER` y marcaría la
migración contra la base master (igual que `migrate:tenant` en `package.json`):

```powershell
$env:DATABASE_URL_TENANT = '<url de la base de ese tenant>'
corepack pnpm prisma migrate resolve --rolled-back <nombre_de_la_migracion> --schema prisma_tenant/schema.prisma --config prisma.tenant.config.ts
```

Luego se re-corre `deploy.ps1`. Los clientes inactivos o borrados quedan fuera del recorrido de
`migrate-tenants`: su base no se migra, y si se reactivan hay que revisarla a mano.

### En el VPS hay DOS Node, y el del PATH es el equivocado

| Ruta | Versión | Quién la usa |
|---|---|---|
| `C:\Program Files\nodejs\node.exe` | **22.23.2** | la que resuelve `node` a secas: es la que está en el PATH |
| `C:\nodejs24\node.exe` | 24.20.0 | la que `deploy.ps1` antepone al PATH del proceso |

Los dos `package.json` declaran `"engines": { "node": ">=24" }`, y `deploy.ps1` **antepone
`C:\nodejs24` a su propio `$env:Path`** antes de cualquier otro paso. Eso cubre `node`,
`corepack`, `pnpm`, `prisma` y cualquier subproceso que resuelva `node` a secas. Un guard
en el pre-flight corta el deploy si lo que resuelve es anterior a la 24.

> **Corrección del 2026-09-09 (issue #137).** Acá decía que `deploy.ps1` "nunca escribe
> `node` a secas: lo invoca por ruta absoluta y no depende del PATH". Era falso: `$NodeExe`
> se usaba en **tres** lugares (la `EMAIL_CRYPTO_KEY` y las dos piezas del backfill de
> correo), mientras `prisma generate`, los dos `build` y **`migrate:master` y
> `migrate:tenants`** iban por `corepack` a secas. Y `corepack` resolvía a
> `C:\Program Files\nodejs\corepack.cmd`, el de la instalación de Node 22: un shim se
> lleva puesto el runtime junto al que fue instalado. **No alcanza con no escribir `node`
> a secas si escribís `corepack` a secas.**

**Cualquier comando que corras a mano en el VPS sí depende del PATH**, y ahí te toca el 22.
Antes de instalar dependencias o correr un script del repo:

```powershell
$env:Path = "C:\nodejs24;" + $env:Path
node -v   # confirmar v24.x
```

Comprobar cuál está resolviendo, en cualquier momento:

```powershell
where.exe node   # -> C:\Program Files\nodejs\node.exe
node -v          # -> v22.23.2
```

No se desinstala el 22 ni se toca el PATH del sistema: **el VPS es compartido con educandow** y
puede haber otra cosa dependiendo de esa versión. Cambiarlo es una decisión aparte, con su
propia verificación.

---

## Qué hace, en orden

1. **Pre-flight** — exige estar en `main`, verifica que el `node` resuelto sea `>=24` y anota
   el punto de rollback: el commit actual, o el que **hereda** de la instancia anterior si
   esta corrida es el re-ejecutado (paso 3b en los comentarios de `deploy.ps1`, punto 4 de esta lista).
2. **Hash de los lockfiles y del propio script**, antes del pull.
3. **`git pull --ff-only origin main`**.
4. **Si el pull cambió `deploy.ps1`**, se re-ejecuta la versión nueva y sale, pasándole
   `-RollbackCommit` con el commit previo al pull. Es lo único del arranque original que la
   instancia nueva no puede recalcular, porque su pre-flight ya corre con el pull hecho.
5. **Si cambió algún lockfile**, aborta y pide instalación manual.
6. **Carga `backend/.env`** al entorno del proceso; exige `DATABASE_URL_MASTER`.
7. **`EMAIL_CRYPTO_KEY`**: la genera **solo si no existe**.
8. **`JWT_SECRET`**: lee la única línea `JWT_SECRET=` de `backend/.env` (fuente única) y la
   empuja a los dos lugares que importan — el entorno de este proceso, para que el build del
   frontend la hornee, y el `AppEnvironmentExtra` del servicio `soporte-backend` (NSSM),
   mezclando sin pisar el resto de sus variables. Si `frontend/.env.local` tiene un valor
   distinto, avisa por consola sin fallar: el build usa el del proceso. Ver más abajo,
   "`rotate-jwt.ps1`", para el porqué completo.
9. **Builds**: `generate:master`, `generate:tenant`, build del backend, build del frontend (este
   último hornea `BACKEND_URL` y `JWT_SECRET`).
10. **Detiene los servicios**, migra master, migra el fan-out a tenants.
11. **Backfill de config de correo** — solo la primera vez, con dos guardas.
12. **Arranca los servicios**, espera 10 s y exige `Running`.
13. **Smoke interno** contra 3101 y 3100.

### Por qué los builds van ANTES de migrar

Está escrito en el script y no se mueve. Migrar primero deja al **código viejo corriendo contra
el schema nuevo** durante los dos builds — varios minutos. Con una migración aditiva no se nota;
con una que renombra una columna que el código viejo consulta, **cada request falla mientras la
app parece estar arriba**, que es peor que una caída franca.

Deteniendo los servicios justo antes de migrar, esa ventana se reduce a una caída controlada de
segundos.

---

## Precondición operativa: `predeploy-dump.ps1` (ADR-6, sdd/sesion-utc-y-backfill-de-fechas)

**`deploy.ps1` no cambia.** El backfill de fechas (issue #173) entra por `migrate:master` y
`migrate:tenants` — ya dentro de la ventana `Stop-Service` → `Start-Service` del paso 9 — y por
eso el script de deploy queda intacto. Lo nuevo es que ese backfill **no se puede deshacer con un
`git revert`**: resta 3 horas a los valores históricos que el discriminador detecta como escritos
por Prisma (~1614, medidos el 2026-09-14 sobre los tenants activos en ese momento — el número
crece con cada tenant nuevo, no es una constante), y un revert de código no vuelve a sumarlas.
El único rollback de datos es restaurar un dump tomado antes de esa corrida.

**Por eso el dump es una precondición operativa, no un paso del pipeline.** `predeploy-dump.ps1`
(raíz del repo, junto a `deploy.ps1`) es un script aparte que el operador corre y **lee antes** de
abrir la ventana — verificarse a sí mismo con los servicios ya detenidos es la falla del
2026-08-20 que `deploy.ps1` ya documenta (ver más abajo, "Un archivo sin versionar…" y el resto de
los cinco modos de falla: acá el equivalente sería un backup cortado a mitad de camino, con la app
abajo y sin dump verificado).

### Uso

```powershell
cd C:\soporte

# 1. DryRun primero, SIEMPRE — no detiene nada, no escribe nada, no toca ninguna base.
.\predeploy-dump.ps1 -DryRun
echo "EXIT=$LASTEXITCODE"   # 0 = precondiciones en verde

# 2. Recién si el DryRun salió en verde, la corrida real:
.\predeploy-dump.ps1
echo "EXIT=$LASTEXITCODE"   # 0 = dump verificado, servicios DETENIDOS a propósito
```

> **Por ssh, el `-DryRun` va solo al final del comando**: nunca `-DryRun; echo ...`. El shell
> por defecto del VPS es `cmd`, que le pasaría a PowerShell el literal `-DryRun;`. Desde el
> 2026-09-29 el script tiene `[CmdletBinding()]` y corta con exit 1 ante un argumento
> desconocido. Antes, lo aceptaba en silencio y corría la versión **real**: detenía los
> servicios. Ver la sección 5, donde esa misma trampa corrió una rotación real.

`-DryRun` enumera las bases desde `clientes.db_name` (activo=true, nunca hardcodeadas — el sufijo
hex de un tenant cambia si se recrea) más `soporte_master`, valida cada identificador contra el
mismo criterio que `assertValidIdentifier` (`backend/src/clientes/infrastructure/postgres-admin.service.ts:27`)
y **aborta ante uno inválido, nunca lo saltea**, verifica `pg_dump`/`pg_restore`/`psql`, espacio
libre contra el tamaño estimado, y permiso de conexión por base. Es corrible **contra producción
sin riesgo**. Lo único que deja sin ejercitar es el `Stop-Service` y el `pg_dump` real — `pg_dump`
no tiene un modo dry-run propio (necesita un archivo seekable para `-Fc`).

La corrida real detiene `soporte-backend` y `soporte-frontend`, los **deja detenidos** (el punto de
restore queda exacto), dumpea cada base en formato `-Fc` a
`C:\soporte\backups\utc-backfill-<timestamp>\<base>.dump`, y verifica antes de devolver el
control: cantidad de archivos = cantidad de bases, cada archivo con tamaño > 0, y `pg_restore
--list` con la MISMA cantidad de tablas que tenía la base origen (medida antes de dumpear). **La
verificación es estructural, no de negocio** — no asume que ningún tenant tenga una tabla
puntual: medido el 2026-09-14, los 4 tenants activos comparten las mismas 39 migraciones pero dos
de los más viejos tienen 28 tablas en vez de 33 (les faltan `tickets`/`compras`/`items_compra`/
`ticket_edilicia`/`ticket_soporte`, borradas a mano por decisión del dueño) — una divergencia
legítima entre tenants, no un defecto. Un conteo de tablas detecta un dump incompleto para
cualquier esquema sin necesitar saber cuál es. **Fail-closed de verdad**: si cualquier
verificación falla, borra la carpeta del intento y rearranca los servicios, saliendo con código
distinto de cero — el sistema queda exactamente como estaba, sin ventana abierta y sin un dump a
medias en `backups/`.

Si el dump queda verificado en verde, los servicios **siguen detenidos**: recién ahí el operador
corre `deploy.ps1`, que tolera un servicio ya detenido (`Stop-Service -Force` sobre uno parado es
no-op) y sigue su curso normal.

### Por qué reemplaza al método anterior

`C:\soporte\backups\` tenía un archivo de **0 bytes** llamado
`                 datname                  _predeploy_20260820.dump` — un loop ad-hoc que leyó la
salida de `psql` **sin `-t -A`** y tomó el encabezado de la columna como nombre de base. El mismo
defecto puede saltearse una base real en silencio sin que nadie lo note. `predeploy-dump.ps1`
enumera siempre con `-t -A` y valida cada nombre antes de componer cualquier comando.

---

## Los cinco modos de falla que el script conoce

Los cinco están documentados adentro con la fecha en que pasaron. No son hipotéticos.

### 1. El exit code de un comando nativo no aborta solo

`$ErrorActionPreference = 'Stop'` **no** detiene ante el exit code de un comando nativo: solo
atrapa errores de PowerShell. Por eso cada `git`, `corepack` y `node` lleva su chequeo de
`$LASTEXITCODE` (la función `AssertOk`).

Sin eso, un paso falla y el deploy **sigue de largo hasta `DEPLOY OK` con el sistema a medias**:
un build fallido deja el `dist` viejo; un migrate fallido arranca código nuevo contra el schema
viejo. Pasó tres veces el 2026-08-20.

> **Si tocás el script, todo comando nativo nuevo lleva su `AssertOk`.** No es estilo: es el
> único mecanismo que hace que el deploy falle cuando falla.

### 2. El script se actualiza a sí mismo y se ignora

PowerShell carga el `.ps1` **entero** en memoria al invocarlo. Si el pull trae una versión nueva
de `deploy.ps1`, la instancia en ejecución **sigue siendo la vieja** y los pasos nuevos no
corren.

Pasó el 2026-08-20: el deploy migró las columnas de correo y arrancó el código nuevo
**salteándose** la provisión de la clave y el backfill, porque esos pasos solo existían en la
versión recién bajada.

Por eso el script hashea su propio archivo antes del pull y, si cambió, se re-ejecuta y sale.

### 3. Un archivo sin versionar en el VPS bloquea el pull

`git pull --ff-only` falla con *"untracked working tree files would be overwritten"* y —antes del
fix— el deploy reportaba éxito igual. Pasó el 2026-08-20 con `rotate-admin-pw.ps1`.

**Qué hacer:** mover o borrar el archivo que nombra el error, y re-correr. No forzar el pull.

### 4. Cambió un lockfile

El deploy **no instala dependencias**. Si detecta que cambió `pnpm-lock.yaml`, aborta y te manda
a instalar a mano.

```powershell
$env:Path = "C:\nodejs24;" + $env:Path   # NO es opcional — ver abajo
node -v                                   # confirmar v24.x antes de seguir

Stop-Service soporte-backend, soporte-frontend -Force

Set-Location C:\soporte\backend  ; corepack pnpm install
if ($LASTEXITCODE -ne 0) { throw "fallo el install del backend" }

Set-Location C:\soporte\frontend ; corepack pnpm install
if ($LASTEXITCODE -ne 0) { throw "fallo el install del frontend" }

Set-Location C:\soporte ; .\deploy.ps1
```

**Con los servicios DETENIDOS**, y el motivo es concreto: `@node-rs/argon2` es un módulo nativo,
y en Windows un binario que un proceso tiene abierto no se puede reemplazar — la instalación
falla con `EPERM`. El script cita este caso en su mensaje de aborto.

**Y con el Node 24 al frente del PATH**, que es lo que agrega la primera línea. El VPS tiene
**dos** Node instalados (ver "Cómo se llega al VPS"): el del PATH es el 22, y los dos
`package.json` declaran `"engines": { "node": ">=24" }`. Sin esa línea, el install del backend
revienta en su `postinstall` — el que corre los dos `prisma generate`:

```
postinstall:  ERROR  packages field missing or empty
[ELIFECYCLE] Command failed with exit code 1.
[WARN] Unsupported engine: wanted: {"node":">=24"} (current: {"node":"v22.23.2"})
```

El frontend no falla, pero eso engaña: no falla porque en ese momento no tiene nada que
instalar, no porque la versión sirva.

**Cada install verifica su PROPIO exit code**, y por eso van en líneas separadas con su `throw`.
Encadenar los tres comandos y leer un solo `$LASTEXITCODE` devuelve el del último: un install de
backend fallido queda tapado por un install de frontend exitoso y se lee como recuperación
completa. Es la misma trampa que el `echo $?` detrás de un pipe, unos párrafos más arriba —
pasó de verdad el 2026-09-09, desplegando `83bdc8a`.

#### Aun con Node 24 al frente, el `postinstall` del backend puede fallar igual

Verificado el 2026-10-10, desplegando `504a3725` (la dependencia `jose` cambió el lockfile).
Con `C:\nodejs24` al frente del PATH, el install del backend falló en su `postinstall` con el
mismo mensaje del bloque de arriba:

```
postinstall:  ERROR  packages field missing or empty
[ELIFECYCLE] Command failed with exit code 1.
```

Esta vez **no era Node**: `node -v` daba `v24.20.0`. Era **pnpm**. El `postinstall` llama a
`pnpm run generate:master` con `pnpm` a secas, y en el VPS `pnpm` a secas no es el de
`corepack`:

| Comando | Resuelve a | Versión |
|---|---|---|
| `corepack pnpm` | el que fija el proyecto | **11.18.0** |
| `pnpm` a secas | `C:\Users\Administrator\AppData\Roaming\npm\pnpm.cmd` (global de npm) | **9.15.4** |

pnpm 9 lee el `pnpm-workspace.yaml` del backend, que no tiene campo `packages` (solo
`allowBuilds` y `publicHoistPattern`, que son de pnpm 11), y lo rechaza. Anteponer
`C:\nodejs24` no ayuda: esa carpeta no tiene un shim de `pnpm` (`where.exe pnpm` no la lista),
así que `pnpm` a secas cae primero en `AppData\Roaming\npm` y después en
`C:\Program Files\nodejs`.

**Qué hacer si pasa.** El install **sí completó** antes del `postinstall`: las dependencias
nuevas quedan en `node_modules` (en este caso, `jose`). Lo único que falla es el
`prisma generate`, y `deploy.ps1` lo vuelve a correr por `corepack` en su paso de builds. Por
eso alcanza con:

1. Confirmar que la dependencia nueva quedó instalada, por ejemplo con
   `Test-Path C:\soporte\backend\node_modules\jose\package.json`.
2. Saltear el install del frontend si su lockfile no cambió. El `throw` del backend corta el
   bloque antes de llegar al frontend.
3. Re-correr `.\deploy.ps1`. El 2026-10-10 terminó con `DEPLOY OK`.

Si cambió el lockfile del **frontend**, su install hay que correrlo igual, aparte.

**El arreglo de fondo (2026-10-11).** El `postinstall` del backend ya no llama a `pnpm`: corre
los dos `prisma generate` directo (`backend/package.json`, con su guarda en
`backend/scripts/postinstall.spec.ts`). Los binarios de `node_modules/.bin` están en el PATH de
los scripts de ciclo de vida, así que da igual qué `pnpm` encuentre el PATH. A partir del primer
deploy que incluya ese cambio, este fallo no debería repetirse; los pasos de arriba quedan para
desplegar un commit anterior.

**El pnpm 9 global NO se desinstala**: es de educandow. `educandow/deploy/deploy.ps1` (paso 2)
usa `pnpm` a secas, exige la versión 9 y, si no la encuentra, la reinstala global con
`npm install -g pnpm@9.15.4`. Borrarlo no arregla nada (el próximo deploy de educandow lo
repone) y rompe el supuesto de ese script. El servicio `educandow-api` no lo usa en runtime
(corre `C:\nodejs24\node.exe dist\main.js`). Verificado el 2026-10-11.

**Un detalle del rollback en este camino.** Cuando el primer `deploy.ps1` aborta por el
lockfile, el pull ya está hecho. La segunda corrida anota como punto de rollback el `HEAD` nuevo
(`Rollback: git reset --hard <commit nuevo>`), y no el commit anterior al deploy. El punto real
de rollback es el commit que tenía producción **antes** del primer `deploy.ps1`, más el dump de
`predeploy-dump.ps1`. Anotalo antes de empezar, con `git rev-parse --short HEAD` en el VPS.

### 5. Rotación de `EMAIL_CRYPTO_KEY` (`rotate-email-crypto-key.ps1`)

Cifra en reposo la contraseña SMTP de cada cliente, **los secretos TOTP del 2FA**
(`usuarios_tfa.secreto_cifrado` y `secreto_pendiente_cifrado`, AAD `tfa:{usuario_id}`) **y el
secreto de firma de los webhooks** (`webhook_destinos.secreto_cifrado`, AAD
`webhook:{cliente_id}`) **y la clave del proveedor de IA del asistente**
(`asistente_ia_config.clave_cifrada`, AAD `ia:{cliente_id}`). La rotación re-cifra los cinco destinos en una sola transacción: si cualquiera no descifra, no se
modifica ninguno, y `--verificar` también los recorre. Se genera **una sola vez** en el deploy
(`deploy.ps1` paso 5b) y, si existe, no se toca — regenerarla a mano convierte toda credencial
guardada en basura indescifrable. Rotarla de verdad exige re-cifrar cada fila, no solo reemplazar
el valor; eso es lo que hace `rotate-email-crypto-key.ps1` (ver `sdd/rotacion-email-crypto-key`).

**Uso** (administrator, `backend/.env` presente, servicios arriba). Invocar siempre con
`-File` — la tabla de exit codes de abajo solo es confiable así; un `throw` dentro de una
sesión interactiva abierta con `.\rotate-email-crypto-key.ps1` puede cerrar esa sesión en vez
de devolver el exit code:

```powershell
cd C:\soporte
powershell -NoProfile -ExecutionPolicy Bypass -File .\rotate-email-crypto-key.ps1 -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File .\rotate-email-crypto-key.ps1
```

> **Por ssh, el `-DryRun` va solo al final del comando.** El shell por defecto del VPS es
> `cmd`, que no corta en `;`: `ssh educandow-vps '... -File rotate-email-crypto-key.ps1
> -DryRun; echo ...'` le pasa a PowerShell el argumento literal `-DryRun;`. El 2026-09-29 eso
> corrió la rotación **real** en vez del dry-run, porque el script todavía no tenía
> `[CmdletBinding()]` y aceptaba argumentos desconocidos sin quejarse. Desde el fix, un
> argumento desconocido corta con exit 1 antes de tocar nada. Aun así: nunca encadenar nada
> detrás del switch en esa línea.

**Qué hace, en orden**: valida `OLD_KEY` de `backend/.env`, genera `NEW_KEY` en el server (nunca
se tipea ni se pega), corre un dry-run con los servicios arriba, invoca `predeploy-dump.ps1` (deja
un dump verificado y los servicios detenidos), escribe un archivo de recuperación `PENDIENTE`
**antes** de la corrida real, re-cifra todas las filas en una sola transacción, reescribe
`backend/.env` completo (archivo temporal + `[System.IO.File]::Replace`, nunca `Add-Content` —
misma trampa que `ROOT_ADMIN_PASSWORD` el 2026-08-20), y recién ahí arranca los servicios.

**Exit codes**:

| Exit | Estado de la base | Qué hacer |
|---|---|---|
| 0 | Rotación confirmada | Nada — servicios arriba, `backend/.env` verificado |
| 1 | Sin cambios (`OLD_KEY`), servicios arriba | Revisar el error de consola y re-correr |
| 3 | Base en `NEW_KEY`, `backend/.env` **sin** actualizar | Recuperación manual, ver abajo |
| 4 | Estado ambiguo, servicios **detenidos** | Verificar OLD/NEW (ver abajo) antes de nada |
| 5 | Rotación confirmada, cierre final incompleto | Base OK — completar a mano lo que quedó a medias: archivo permanente, borrar `PENDIENTE` o arrancar servicios |

**Recuperación manual (exit 3, 4 o 5)**: el mensaje de consola nombra el `PENDIENTE`
(`backups\rotacion-email-crypto-key-<ts>.PENDIENTE.txt`, ASCII, `OLD_KEY`/`NEW_KEY`/`DUMP`). Todo
en PowerShell, como administrator — ninguna clave se tipea ni se pega, se lee del archivo a una
variable de entorno:

```powershell
$pendiente = 'C:\soporte\backups\rotacion-email-crypto-key-<ts>.PENDIENTE.txt'
$env:DATABASE_URL_MASTER = ((Select-String -Path C:\soporte\backend\.env -Pattern '^DATABASE_URL_MASTER=').Line -split '=', 2)[1].Trim('"')
$env:ROTACION_VERIFICAR_KEY = ((Select-String -Path $pendiente -Pattern '^OLD_KEY=').Line -split '=', 2)[1]
C:\nodejs24\node.exe C:\soporte\backend\scripts\rotar-email-crypto-key.mjs --verificar   # exit 0 = no hubo COMMIT
$env:ROTACION_VERIFICAR_KEY = ((Select-String -Path $pendiente -Pattern '^NEW_KEY=').Line -split '=', 2)[1]
C:\nodejs24\node.exe C:\soporte\backend\scripts\rotar-email-crypto-key.mjs --verificar   # exit 0 = SI hubo COMMIT
Remove-Item Env:\ROTACION_VERIFICAR_KEY, Env:\DATABASE_URL_MASTER
```

Si `OLD_KEY` verifica, no hubo `COMMIT`: borrar el `PENDIENTE` y arrancar los servicios. Si
`NEW_KEY` verifica (exit 3, o exit 4 resuelto a `NEW_KEY`), y **solo** si ese `--verificar`
devolvió exit 0: escribir `NEW_KEY` en el `EMAIL_CRYPTO_KEY=` de `backend\.env` con un
archivo temporal + `Replace`. La clave se lee otra vez del `PENDIENTE`, porque el bloque
anterior ya borró las variables de entorno. **Nunca** `Add-Content`, y **nunca** `$null` como
tercer argumento de `Replace`: el binder de PowerShell lo convierte en `""` y `Replace` la
rechaza siempre (C-N1, `verify-report.md`). Si `.env` ya tenía `NEW_KEY` (exit 3 con el
`Replace` hecho y la verificación del paso 8 fallida), el bloque lo deja igual:

```powershell
$newKey = ((Select-String -Path $pendiente -Pattern '^NEW_KEY=').Line -split '=', 2)[1]
if ($newKey -notmatch '^[0-9a-fA-F]{64}$') { throw 'NEW_KEY ilegible en el PENDIENTE: no seguir' }
$tmp = 'C:\soporte\backend\.env.rotacion-tmp'
(Get-Content C:\soporte\backend\.env) -replace '^EMAIL_CRYPTO_KEY=[0-9a-fA-F]{64}$', ('EMAIL_CRYPTO_KEY=' + $newKey) |
  Set-Content -Path $tmp -Encoding ascii
[System.IO.File]::Replace($tmp, 'C:\soporte\backend\.env', [NullString]::Value)
Remove-Variable newKey
```

**Antes de tocar el `PENDIENTE`, verificar el `.env` que quedó en disco** (igual que el paso 8
del script). Si este bloque no termina en exit 0, **no seguir**: el `PENDIENTE` es la única
copia de `NEW_KEY` fuera de la base.

```powershell
$env:DATABASE_URL_MASTER = ((Select-String -Path C:\soporte\backend\.env -Pattern '^DATABASE_URL_MASTER=').Line -split '=', 2)[1].Trim('"')
$env:ROTACION_VERIFICAR_KEY = ((Select-String -Path C:\soporte\backend\.env -Pattern '^EMAIL_CRYPTO_KEY=').Line -split '=', 2)[1]
if ($env:ROTACION_VERIFICAR_KEY -notmatch '^[0-9a-fA-F]{64}$') { throw 'EMAIL_CRYPTO_KEY invalida en .env: no borrar el PENDIENTE' }
C:\nodejs24\node.exe C:\soporte\backend\scripts\rotar-email-crypto-key.mjs --verificar   # tiene que dar exit 0
Remove-Item Env:\ROTACION_VERIFICAR_KEY, Env:\DATABASE_URL_MASTER
```

Con esa verificación en exit 0, cerrar el `PENDIENTE` **sin renombrarlo** — escribir un archivo nuevo solo con
`OLD_KEY`+`DUMP`+fecha (igual que el paso 9 del script, nunca `NEW_KEY`), aplicarle el
`icacls` de abajo, y recién ahí borrar el `PENDIENTE` y arrancar los servicios. Si ninguna
clave verifica, es intervención manual real: revisar `soporte_master.clientes` antes de
arrancar nada. **Exit 5**: la base y `backend/.env` YA están en `NEW_KEY` y verificados — el
paso que quedó a medias puede ser cualquiera del cierre (crear/escribir/validar el archivo
permanente, borrar el `PENDIENTE`, o arrancar un servicio; el mensaje de consola dice cuál).
Confirmar que el archivo permanente quedó bien escrito (sin `NEW_KEY`) antes de borrar el
`PENDIENTE`, y arrancar los servicios que falten. Ninguna clave se imprime en ningún paso — el
script solo reporta longitudes y rutas.

**Retención de los archivos de recuperación**: al cerrar bien, el `PENDIENTE` se reemplaza por uno
permanente (`rotacion-email-crypto-key-<ts>.txt`) con solo `OLD_KEY` + la ruta del dump + la fecha
— **nunca** `NEW_KEY`. Los dos quedan en `backups\` con permisos solo para `Administrators` y
`SYSTEM` (`icacls <archivo> /inheritance:r /grant:r "*S-1-5-32-544:F" "*S-1-5-18:F"`). **No borrar
un archivo de recuperación mientras exista el dump de esa ventana**: `OLD_KEY` es la única forma
de descifrar las credenciales SMTP que ese dump contiene.

---

## `BACKEND_URL` se hornea en el build del frontend

`frontend/next.config.ts` la expone por la clave `env`, y **Next inlinea ese valor en el bundle
en tiempo de build**, reemplazando cada `process.env.BACKEND_URL`. En runtime ya es tarde para
cambiarla.

**Consecuencia operativa: tiene que valer lo correcto ANTES de correr el deploy**, porque el
build sale del paso 7 con ese valor adentro. Si la cambiás después, no pasa nada hasta el
siguiente build.

El `next.config.ts` corta el build si falta, está vacía o es solo espacios — espeja a
`construirEntorno` del backend a propósito, para que las dos mitades fallen juntas.

---

## El backfill de correo tiene dos guardas, y las dos importan

Corre **solo si ningún cliente tiene config de correo todavía**. No es una optimización: si
corriera en cada deploy, **cada cliente nuevo que no configuró su correo quedaría auto-sembrado
con el SMTP global** — el respaldo silencioso que se descartó por decisión de producto.

La segunda guarda: si falta alguna de `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`,
`SMTP_FROM`, `SMTP_SECURE`, el backfill **se omite con un aviso, no falla**. Es un estado
legítimo: nunca hubo envío global configurado, así que no hay notificaciones que preservar.
Tratarlo como error dejaba el deploy cortado **con los servicios detenidos**, que es muchísimo
peor. Pasó el 2026-08-20.

---

## Retiro de las celdas de tickets de la matriz (paso 8c retirado)

El paso 8c de `deploy.ps1` corría `scripts/backfill-permisos-tipo-ticket.mjs`, que tradujo la
matriz master por módulo a la tabla `permisos_tipo_ticket` de cada tenant en el deploy de la
etapa 1 (`odd/tasks/permisos-por-tipo-ticket.md`, T4b, L38). Se retiró junto con el script en
T9c: desde T9b la matriz ya no tiene las celdas que traducía, así que no tiene nada que hacer.

La migración master `20261023120000_retirar_celdas_tickets_matriz` (T9b) **borra** de
`usuario_cliente_permisos` todas las celdas `TICKETS:*` y `EDILICIA:LECTURA|ALTAS|MODIFICACION`,
y deja el CHECK con los 25 pares vigentes. No cambia el acceso de nadie: esas celdas no deciden
nada desde la etapa 1. Pero es **destructiva para esas filas**, así que entra por
`migrate:master` dentro de la ventana de `predeploy-dump.ps1`.

Rollback: el `rollback.sql` de esa migración vuelve a poner el CHECK de 36 pares, pero **no
restaura las celdas borradas**; si hicieran falta, salen de `usuario_cliente_permisos` en el dump.
**Orden obligatorio para volver al código anterior:** primero `rollback.sql`, después el código.
El código anterior a T9 todavía escribe celdas `TICKETS:*` al dar de alta un usuario, cambiar
su rol o aplicar una plantilla; contra el CHECK nuevo esas escrituras fallan con un 500
(`MatrizPermisosNoAplicadaError`). Para leer, el código anterior no necesita las celdas borradas.
`rollback.sql` no borra la fila de `_prisma_migrations`: para volver a desplegar T9 después, hay
que correr `pnpm prisma migrate resolve --rolled-back 20261023120000_retirar_celdas_tickets_matriz`
con el schema master, o Prisma la da por aplicada y el CHECK queda con 36 pares.

**Chequeo previo obligatorio (antes del deploy de T9).** El backfill 8c solo tradujo los clientes
activos. Un cliente inactivo o dado de baja guarda el acceso a tickets de sus usuarios solo en las
celdas que esta migración borra: al reactivarlo, sus usuarios quedarían sin acceso. Antes de
desplegar, esta consulta sobre master tiene que volver vacía:

```sql
SELECT c.nombre, count(*) FROM usuario_cliente_permisos p JOIN clientes c ON c.id = p.cliente_id
WHERE (p.modulo = 'TICKETS' OR (p.modulo = 'EDILICIA' AND p.accion <> 'BORRADO'))
  AND NOT (c.activo AND c.deleted_at IS NULL)
GROUP BY 1;
```

y cada tenant activo tiene que tener filas en `permisos_tipo_ticket`. Verificado el 2026-10-23:
9 clientes, todos activos, todos con filas (72 a 720).

---

## Scripts de operaciones sin pipeline

Dos scripts que vivían **solo en el VPS**, sin versionar, entraron al repo el 2026-09-29. Ninguno
lo invoca `deploy.ps1`: se corren a mano, como administrator.

> **Antes del primer deploy que los traiga, renombrar las copias sin versionar del VPS.** Con
> `C:\soporte\rotate-jwt.ps1` y `C:\soporte\install-cert-soporte.ps1` sin versionar en disco, el
> `git pull --ff-only` de `deploy.ps1` falla con "untracked working tree files would be
> overwritten" — la misma falla del 2026-08-20 con `rotate-admin-pw.ps1`. El deploy corta sin
> tocar nada, pero con los servicios ya detenidos por el dump:
>
> ```powershell
> cd C:\soporte
> Rename-Item rotate-jwt.ps1 rotate-jwt.ps1.viejo-sin-versionar
> Rename-Item install-cert-soporte.ps1 install-cert-soporte.ps1.viejo-sin-versionar
> ```

### `install-cert-soporte.ps1` — certificado TLS con win-acme

Emite o renueva el certificado de `soporte.sesitec.net` (Let's Encrypt) sobre el sitio de IIS.
Baja win-acme a `C:\tools\win-acme` si no está y corre `wacs.exe` con validación por archivo en
`C:\soporte\iis`.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\soporte\install-cert-soporte.ps1
```

Supone que el sitio de IIS de soporte tiene **id 3** y baja la **última** release de win-acme,
sin versión fija ni checksum. Revisar las dos cosas antes de correrlo en otro server.

### `rotate-jwt.ps1` — rotación de `JWT_SECRET`

**`backend/.env` es la única fuente de `JWT_SECRET`.** Hasta el 2026-09-29 la clave vivía en
TRES lugares con el mismo valor — `backend\.env`, `frontend\.env.local`, y una variable de
entorno MACHINE vieja, dejada por una asignación persistente a nivel de sistema hecha en su
momento —, y ni `dotenv/config` (backend `src/main.ts`) ni la carga de entorno de Next pisan una
variable de proceso que YA existe. El build del frontend siempre usó la de `backend\.env`:
`deploy.ps1` carga ese archivo en su proceso pisando lo heredado, y `frontend/next.config.ts` la
hornea **en tiempo de build** (el middleware Edge verifica con esa clave horneada). Pero el
servicio NSSM del backend no recibía `JWT_SECRET` y heredaba la MACHINE, que `dotenv` no pisa.
Además los servicios
de Windows (sshd incluido, por donde corre este script) suelen no ver un cambio de variable
MACHINE hasta un reboot, así que ni depender de ella a mano era confiable.

**El procedimiento manual que este runbook describía antes era incorrecto, y peor que no rotar**:
editar los dos `.env` y correr `deploy.ps1` reconstruía el frontend con la clave **nueva**
mientras el backend seguía firmando con la **vieja**, heredada de la MACHINE. Con claves
distintas en cada lado, nadie puede loguearse.

`rotate-jwt.ps1` resuelve esto: genera la clave nueva en el server, la escribe en los dos `.env`,
la mezcla en el `AppEnvironmentExtra` del servicio `soporte-backend` (NSSM, sin pisar el resto de
sus variables), **borra la variable MACHINE**, reconstruye el frontend con la clave nueva en el
proceso, y reinicia los dos servicios. Rotar `JWT_SECRET` solo invalida sesiones — no hay datos
cifrados con esa clave, a diferencia de `EMAIL_CRYPTO_KEY` — pero la corrida real **cierra la
sesión de todos los usuarios**: no correrlo en horario de uso sin avisar.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\soporte\rotate-jwt.ps1 -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File C:\soporte\rotate-jwt.ps1
```

Por ssh, el shell por defecto suele ser `cmd`: una invocación por línea, nada encadenado después
del switch. `[CmdletBinding()]` corta ante un argumento desconocido antes de ejecutar nada, pero
la lección real es no depender de eso (ver `-DryRun;` en la corrida real de
`rotate-email-crypto-key.ps1` del 2026-09-29, sección 5 de este documento).

**Exit codes:**

- **0**: rotación OK. Los dos `.env`, el NSSM del backend, la variable MACHINE, el build del
  frontend y los dos servicios quedaron consistentes con la clave nueva.
- **1**: nada fue tocado — validación, generación de la clave, o `-DryRun`. Los servicios nunca
  se detuvieron.
- **3**: falló **después** de detener los servicios. El script intenta reiniciarlos igual (con la
  clave vieja si `backend\.env` no llegó a reescribirse, o ya con la nueva si sí).
  **Recuperación: correr `deploy.ps1`.** Desde el paso 8 de arriba, carga `JWT_SECRET` desde
  `backend/.env` al build del frontend y al NSSM del backend, y deja todo consistente con lo que
  haya quedado escrito en el `.env` — sin importar en qué mitad del script cortó
  `rotate-jwt.ps1`.

Ninguna clave se imprime en ningún mensaje, en ningún exit code.

---

## Login con Google o Microsoft (SSO)

El login con proveedor externo es **opcional** y se activa solo con variables en `backend/.env`.
Sin ninguna `SSO_*`, el sistema se comporta como antes. El único archivo que las define es
`backend/.env` (`deploy.ps1` no cambia: `dotenv/config` lo carga). La URI de redirección se deriva
de `APP_BASE_URL`: `${APP_BASE_URL}/api/auth/sso/<google|microsoft>/callback`.

### Google Cloud Console

1. Crear un proyecto dedicado y, dentro, un cliente OAuth de tipo **Aplicación web**.
2. Pantalla de consentimiento. Mientras está en modo **Testing** (prueba), Google solo deja pasar a
   los **usuarios de prueba** cargados en la lista y a la **cuenta dueña del proyecto** (esa entra
   aunque no figure en la lista); cualquier otra cuenta queda frenada en la pantalla de Google.
   **Antes de habilitar Google para todos los clientes hay que publicarla** (completar el branding).
   Si no se va a publicar, la alternativa es quitar las `SSO_GOOGLE_*` de `backend/.env` y
   deshabilitar el proveedor.
3. URIs de redirección autorizadas:
   - `https://soporte.sesitec.net/api/auth/sso/google/callback`
   - `http://localhost:<puerto>/api/auth/sso/google/callback` para desarrollo.
4. Cargar `SSO_GOOGLE_CLIENT_ID` y `SSO_GOOGLE_CLIENT_SECRET` en `backend/.env`.

### Registro de la app en Entra (Microsoft)

1. `signInAudience = AzureADandPersonalMicrosoftAccount`.
2. URI de redirección de tipo **Web**: `https://soporte.sesitec.net/api/auth/sso/microsoft/callback`.
3. Claims opcionales `email` y `xms_edov` en el **ID token**. **Procedimiento del manifiesto por
   confirmar** con la primera prueba real de Microsoft (no hay staging: se prueba en producción, como
   se hizo con Google). Cuando se confirme, registrar el resultado **en este runbook**: `openspec/` es
   historia de solo lectura, y el verify original queda en
   `openspec/changes/archive/2026-10-10-login-sso/verify-report.md`.
4. `PATCH /applications/{id}/authenticationBehaviors` con `{"removeUnverifiedEmailClaim": true}`
   (Microsoft Graph). **Por confirmar**; registrar el resultado en este runbook.
5. Cargar `SSO_MICROSOFT_CLIENT_ID` y `SSO_MICROSOFT_CLIENT_SECRET` en `backend/.env`.

**El secreto de cliente vence como máximo a los 24 meses.** Dejar un recordatorio de calendario
antes del vencimiento. Rotación: crear el secreto nuevo en la consola, editar
`SSO_MICROSOFT_CLIENT_SECRET` en `backend/.env` y reiniciar el servicio (`soporte-backend`). El
mismo procedimiento sirve para Google.

### Smoke posterior al deploy

```bash
curl -s https://soporte.sesitec.net/api/auth/sso/proveedores
# esperado con ambos pares cargados: {"proveedores":["google","microsoft"]}
# esperado hoy (solo Google, 2026-10-11): {"proveedores":["google"]}
# esperado sin variables SSO_*:      {"proveedores":[]}
```

- **IIS/ARR debe conservar el `Host` original y no reescribir la ida al proveedor.** El BFF arma
  las redirecciones con `request.url`: seguir `https://soporte.sesitec.net/api/auth/sso/google/iniciar`
  y comprobar dos cosas. La ida tiene que llevar a `https://accounts.google.com/o/oauth2/v2/auth?...`,
  **no** a `https://soporte.sesitec.net/o/oauth2/v2/auth?...` (si pasa eso, faltan las reglas de
  salida de "IIS/ARR reescribe el `Location`", abajo). La vuelta tiene que caer en
  `https://soporte.sesitec.net/login?...` y no en `localhost`.
- `/api/auth/sso/*` debe llegar a Next sin cambios.
- Registrar el binario de Node en uso: `nssm get soporte-backend Application`. Debe ser Node 22.12
  o superior (dependencia `jose`).
- Confirmar que no hay una variable de entorno de MÁQUINA `SSO_*` obsoleta, que pisaría a la de
  `backend/.env`:

```powershell
[Environment]::GetEnvironmentVariables('Machine').Keys | Where-Object { $_ -like 'SSO_*' }
```

### IIS/ARR reescribe el `Location` hacia el proveedor

**Bloqueante encontrado y corregido en la prueba del 2026-10-11.** El ARR de IIS del VPS tiene a
nivel servidor `reverseRewriteHostInResponseHeaders=True` (con `preserveHostHeader=False`), y esa
configuración la comparten los 6 sitios del VPS. ARR reescribe entonces el host de **todo** header
`Location` de respuesta al host del sitio. La redirección de `iniciar` a
`https://accounts.google.com/o/oauth2/v2/auth?...` salía como
`https://soporte.sesitec.net/o/oauth2/v2/auth?...`, y el usuario rebotaba a `/login`.

El ajuste global **no se puede apagar**: las redirecciones propias de Next en Soporte se arman como
`http://localhost:3100` y dependen de ese reescrito, y los otros sitios lo comparten. La corrección
son dos reglas de salida que devuelven el host del proveedor, en `C:\soporte\iis\web.config`.

**Ese `web.config` no está versionado en el repo.** Un rebuild del VPS o recrear el sitio de IIS
pierde estas reglas: hay que volver a aplicarlas. Respaldo previo al cambio:
`C:\soporte-deploy\web.config.bak-20261011`. Las reglas van **dentro de la sección `<rewrite>`
que ya existe**, como hermana de las reglas de entrada (`<rules>`), no en una sección `<rewrite>`
nueva (IIS rechaza una sección duplicada):

```xml
<rewrite>
  <rules>
    <!-- reglas de entrada existentes: no se tocan -->
  </rules>
  <outboundRules>
    <rule name="sso-google-location">
      <match serverVariable="RESPONSE_Location"
             pattern="^https?://soporte\.sesitec\.net/(o/oauth2/v2/auth(\?.*)?)$" />
      <action type="Rewrite" value="https://accounts.google.com/{R:1}" />
    </rule>
    <rule name="sso-microsoft-location">
      <match serverVariable="RESPONSE_Location"
             pattern="^https?://soporte\.sesitec\.net/(common/oauth2/v2\.0/authorize(\?.*)?)$" />
      <action type="Rewrite" value="https://login.microsoftonline.com/{R:1}" />
    </rule>
  </outboundRules>
</rewrite>
```

La regla de Microsoft queda puesta aunque el proveedor siga sin configurar, para que su primera
prueba no tropiece con lo mismo.

Verificación después de aplicarlas (lo que se comprobó el 2026-10-11):

```bash
# la ida al proveedor: Location tiene que empezar con https://accounts.google.com/
curl -s -o /dev/null -D - https://soporte.sesitec.net/api/auth/sso/google/iniciar | rg -i '^location'
# el resto del sitio sigue igual
curl -s -o /dev/null -w '%{http_code}\n' https://soporte.sesitec.net/login   # 200
curl -s -o /dev/null -D - https://soporte.sesitec.net/ | rg -i '^(HTTP|location)'   # 307 a /login
```

### Resultado de la prueba en producción (2026-10-11)

V.1 del verify, hecha **en producción** (no hay staging), **solo con Google**, con la pantalla de
consentimiento en modo prueba y usuarios de prueba:

| # | Caso | Resultado |
|---|---|---|
| 1 | Primer ingreso: crea el vínculo y entra directo (usuario con un solo cliente) | OK |
| 2 | Segundo ingreso: se reconoce por el vínculo (subject), sin duplicarlo | OK |
| 5 | Usuario de prueba con dos clientes: ve el selector después del SSO y entra al elegido | OK |
| 6 | ROOT rechazado (log `SSO_RECHAZADO \| proveedor=GOOGLE \| motivo=ROOT`) | OK |
| 7 | Email que no existe en Soporte: rechazado (`motivo=SIN_USUARIO`), sin vínculo | OK en el backend; el mensaje genérico en pantalla no se observó limpio (interfirió una sesión vieja con contraseña en el navegador) |
| 8 | "Resetear vínculo SSO": borra el vínculo y revoca los refresh tokens; el siguiente ingreso por SSO revincula por email | OK |

**Sobre el caso 8.** El reseteo revoca los refresh tokens en el acto, pero el navegador que ya
estaba abierto sigue funcionando hasta que vence su access token: **hasta 15 minutos**
(`expiresIn: '15m'` en `backend/src/auth/auth.module.ts`), y recién ahí va a `/login`. Es por
diseño, el mismo mecanismo que "Resetear 2FA" y que la desactivación de un usuario.

**No verificado en producción:** Microsoft (sin variables `SSO_MICROSOFT_*`: sigue deshabilitado y
sin probar), el paso del 2FA propio después del SSO (ningún cliente lo exige hoy; la regla sigue
vigente) y el mensaje genérico en pantalla del caso 7.

### Mitigación rápida sin revert

Quitar las `SSO_*` de `backend/.env` y reiniciar `soporte-backend`: desaparecen los botones y el
login con contraseña queda exactamente como hoy.

### Migración y rollback

La migración master `20261010120000_login_sso` es **aditiva** y entra por `migrate:master` dentro de
la ventana de `predeploy-dump.ps1`. Su `rollback.sql` es **destructivo**: borra los vínculos SSO
(los usuarios se revinculan en el siguiente ingreso por SSO) y los estados de flujo en curso. Se
revierte **primero el código** y después se corre el `rollback.sql` contra master.

## API pública (v1)

La API entra apagada: ningún cliente la tiene habilitada hasta que ROOT la habilita desde Clientes.
Qué cambia en el deploy:

| Qué | Detalle |
|---|---|
| Migración master | `20261011120000_api_publica`, **aditiva**: `clientes.api_habilitada` y `usuarios.es_integracion` con default `false`, y la tabla `api_claves`. Sin backfill ni seed. Entra por `migrate:master` dentro de la ventana de `predeploy-dump.ps1`. |
| Dependencia nueva | `@nestjs/swagger` en el backend. **Cambia `backend/pnpm-lock.yaml`**, así que `deploy.ps1` aborta y hay que instalar a mano: ver "4. Cambió un lockfile". |
| Variable nueva | `API_V1_RATE_LIMIT` en `backend/.env`, **opcional**: pedidos por minuto por clave, default `60`. Un valor que no sea un entero positivo usa el default. |
| Ruta nueva del frontend | `/api/v1/*`, servida por el mismo Next (BFF), que reenvía al backend solo `X-Api-Key` y `X-Forwarded-For`, nunca cookies. **IIS no cambia**: `/api/*` ya llega a Next. |

### Smoke posterior al deploy

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://soporte.sesitec.net/api/v1/openapi.json
# esperado: 200 application/json...
curl -s -o /dev/null -w "%{http_code}\n" https://soporte.sesitec.net/api/v1/tickets
# esperado sin clave: 401
```

### Migración y rollback

Su `rollback.sql` es **destructivo**: borra todas las claves y las dos columnas, y los sistemas
externos dejan de entrar. Se revierte **primero el código** y después se corre el `rollback.sql`
contra master. El rollback no borra las filas de los usuarios de integración
(`integracion+<clienteId>@integraciones.invalid`): los **desactiva**, al usuario y a sus
membresías, antes de quitar la columna `es_integracion`. Así sobreviven los nombres de autor de
los tickets y comentarios que crearon en los tenants, y el código viejo no los deja entrar.

Para cortar la API sin revert, alcanza con que ROOT la deshabilite en cada cliente: las claves
dejan de funcionar en el acto y se conservan.

## Webhooks

Etapa 2 de la API pública. Entra sin efecto visible: ningún cliente tiene un destino configurado,
y sin la API habilitada no se encola ni se envía nada. Qué cambia en el deploy:

| Qué | Detalle |
|---|---|
| Migración master | `20261013120000_webhooks`, **aditiva**: la tabla `webhook_destinos` (un destino por cliente, con el secreto cifrado). Sin backfill ni seed. Entra por `migrate:master` dentro de la ventana de `predeploy-dump.ps1`. |
| Migración tenant | `20261013130000_webhook_entregas`, **aditiva**: la tabla `webhook_entregas` (cola y registro de entregas) en cada base de inquilino. Entra por `migrate:tenants`. |
| Variables nuevas | `WEBHOOK_SWEEP_CRON` en `backend/.env`, **opcional**: cron del barrido que envía y purga, default cada minuto. `WEBHOOK_SWEEP_HABILITADO`, **opcional**: con `false` el barrido no corre y no sale ningún aviso; ausente, queda encendido. |
| Rotación de `EMAIL_CRYPTO_KEY` | `rotar-email-crypto-key.mjs` ahora re-cifra también `webhook_destinos.secreto_cifrado` (AAD `webhook:{cliente_id}`), en la misma transacción que el resto. Ver "5. Rotación de `EMAIL_CRYPTO_KEY`". |
| Red | El VPS necesita **HTTPS saliente** (puerto 443) hacia los endpoints de los clientes. Un firewall que lo corte deja cada entrega en error de conexión o timeout, y a las 24 horas en FALLIDA. |
| Dependencias | Ninguna: el envío usa `node:https`. El lockfile no cambia. |

**Pendiente del dueño:** sumar `WEBHOOK_SWEEP_CRON` y `WEBHOOK_SWEEP_HABILITADO` a
`backend/.env.example`. Los agentes no pueden leer ni editar archivos `.env*`.

### Smoke posterior al deploy

En el log de `soporte-backend` no tiene que aparecer `WEBHOOK_SWEEP_ERROR`. Con un cliente de
prueba que tenga la API habilitada y un destino configurado, cambiar el estado de un ticket y
revisar en "Integraciones" que la entrega pase a ENTREGADA en uno o dos minutos.

### Migración y rollback

Los dos `rollback.sql` son **destructivos** y re-ejecutables (`DROP TABLE IF EXISTS`). Se
revierte **primero el código**:

- el de master borra la configuración de todos los clientes, secretos incluidos: al volver a
  migrar, cada ADMINISTRADOR configura el destino otra vez y entrega el secreto nuevo a su
  integrador;
- el de tenant se corre contra **cada** base de inquilino y borra la cola y el registro, con los
  avisos pendientes.

Para cortar los envíos sin revert, alcanza con `WEBHOOK_SWEEP_HABILITADO=false` en
`backend/.env` y reiniciar `soporte-backend`. Los avisos se siguen encolando y salen al volver a
encenderlo, salvo los de más de 30 días, que el primer barrido purga antes de enviar. Para un solo cliente alcanza con que
su ADMINISTRADOR desactive el destino, o con que ROOT le deshabilite la API.

## Tareas con técnico (punto 12)

Documento de la feature: `odd/tasks/tareas-con-tecnico.md`. Las subtareas de Edilicia pasan a
ser tareas genéricas del ticket (`tareas_ticket`), y la tabla vieja se retira **en el mismo
release**. Es el primer deploy de este documento que **copia datos y después borra el
origen**, así que el precheck no es opcional. Qué cambia en el deploy:

| Qué | Detalle |
|---|---|
| Migraciones tenant | Cuatro, solo en las bases de inquilino, por `migrate:tenants` (ver la tabla siguiente). Master no cambia. |
| Variables | Ninguna. |
| Dependencias | Ninguna. El lockfile no cambia. |

| Orden | Migración | Qué hace |
|---|---|---|
| 1 | `20261013140000_tareas_ticket` | Crea `tareas_ticket` con el CHECK `tareas_ticket_completada_check` y **copia** cada fila de `subtareas_edilicia` vía `ticket_edilicia.ticket_id`, con el mismo id, sin técnico y con las bajas lógicas. |
| 2 | `20261013150000_tipos_operacion_tareas` | Suma los cinco `TAREA_*` al catálogo `tipo_operacion` (idempotente). |
| 3 | `20261013160000_tareas_ticket_indice_tecnico` | Índice (`tecnico_id`, `deleted_at`, `ticket_id`) para la visibilidad por tarea. |
| 4 | `20261014120000_retiro_subtareas_edilicia` | **Destructiva**: borra `subtareas_edilicia`, `ticket_edilicia.personal_asignado_id` y `ticket_edilicia.porcentaje_avance`. |

**Un solo deploy las aplica todas, en orden de timestamp, base por base.** En cada base, Prisma
aplica la 4 solo si la 1 ya quedó aplicada en esa misma base, así que la copia siempre ocurre
antes del borrado. `migrate-tenants.js` recorre los inquilinos activos en orden de `db_name` y
**corta en el primero que falla**: los anteriores ya quedaron con las cuatro migraciones, y los
siguientes con ninguna.

**¿Conviene partirlo en dos deploys, T1 en uno y T8 en otro?** Se puede, pero no aporta. Partirlo
exige mergear a `main` primero la cadena hasta T7 y desplegarla, y recién después T8. La
Estrategia de entrega pedía que el retiro saliera cuando ningún código leyera la tabla vieja, y
eso ya se cumple en un solo deploy: el código de este release no lee ni escribe `subtareas_edilicia`
ni las dos columnas. En un deploy intermedio, además, la tabla vieja tampoco recibiría escrituras:
volver al código anterior desde ahí mostraría las subtareas como estaban antes del deploy, igual
de desactualizadas que después del rollback de la 4. Partirlo solo gana un rollback sin
`rollback.sql` durante el intervalo, a cambio de dos ventanas de servicio. Si igual se parte,
**T8 nunca sale antes que T1**, y el código del deploy intermedio funciona con la tabla vieja
presente.

### Precheck de solo lectura: el CHECK de la copia

Si **una sola** fila de `subtareas_edilicia` viola `tareas_ticket_completada_check`, el `INSERT`
de la migración 1 falla en esa base: no aplica nada en ella, Prisma la deja marcada como fallida
en `_prisma_migrations` y `migrate-tenants.js` corta el fan-out con los servicios detenidos. En
las bases locales dio 0 violaciones (T1); **producción no se verificó**.

Las bases se toman del registro, nunca se hardcodean (es el mismo conjunto que recorre
`migrate-tenants.js`):

```powershell
& 'C:\Program Files\PostgreSQL\16\bin\psql.exe' $env:DATABASE_URL_MASTER -t -A -F '|' -c "SELECT nombre, db_name FROM clientes WHERE activo = true AND deleted_at IS NULL ORDER BY db_name;"
```

En **cada** base de esa lista (con `psql` contra la base del inquilino, nunca contra master),
antes del deploy:

```sql
SELECT
  count(*) FILTER (WHERE NOT (
       (completada AND completada_en IS NOT NULL AND completada_por_id IS NOT NULL)
    OR (NOT completada AND completada_en IS NULL AND completada_por_id IS NULL)
  ))                                              AS violan_check,
  count(*)                                        AS subtareas,
  count(*) FILTER (WHERE completada)              AS completadas,
  count(*) FILTER (WHERE deleted_at IS NOT NULL)  AS dadas_de_baja
FROM subtareas_edilicia;
```

La condición es la del CHECK, negada. `completada` es `NOT NULL`, así que no hay un tercer valor
que se escape.

| Resultado | Qué hacer |
|---|---|
| `violan_check = 0` en **todas** las bases | Seguir. Anotar `subtareas`, `completadas` y `dadas_de_baja` por base: son la foto contra la que se compara después del deploy. |
| `violan_check > 0` en alguna | **No desplegar.** Listar las filas con el `SELECT` siguiente y llevarlas al dueño: corregirlas es una decisión de datos (por ejemplo, una completada sin `completada_por_id` no tiene a quién atribuirse), no algo que el operador resuelva por su cuenta. Con las filas corregidas, se vuelve a correr el precheck. |
| La consulta falla con `relation "subtareas_edilicia" does not exist` | **No desplegar.** La migración 1 también fallaría en esa base. Hay que entender por qué a esa base le falta la tabla antes de seguir. |

```sql
SELECT id, ticket_edilicia_id, completada, completada_en, completada_por_id
FROM subtareas_edilicia
WHERE NOT (
     (completada AND completada_en IS NOT NULL AND completada_por_id IS NOT NULL)
  OR (NOT completada AND completada_en IS NULL AND completada_por_id IS NULL)
);
```

Con los servicios arriba, alguien puede cargar una subtarea entre el precheck y el deploy. Para
que la foto sea exacta, se vuelve a correr la consulta después de `predeploy-dump.ps1`, con los
servicios ya detenidos. Si en ese punto aparece una violación, no se corre `deploy.ps1`: se
arrancan los servicios y se sigue la tabla de arriba.

### Orden del deploy

1. Precheck en todas las bases, en verde.
2. `predeploy-dump.ps1`, en DryRun y en la corrida real (ver "Precondición operativa"). Es el
   único rollback fiel: la migración 4 borra datos.
3. Precheck otra vez, con los servicios detenidos: la foto definitiva.
4. `deploy.ps1`.

### Verificación posterior al deploy

En cada base, antes de que alguien cargue tareas nuevas:

```sql
SELECT
  count(*)                                         AS tareas_edilicia,
  count(*) FILTER (WHERE t.completada)             AS completadas,
  count(*) FILTER (WHERE t.deleted_at IS NOT NULL) AS dadas_de_baja,
  count(*) FILTER (WHERE t.tecnico_id IS NOT NULL) AS con_tecnico
FROM tareas_ticket t
JOIN ticket_edilicia te ON te.ticket_id = t.ticket_id;
```

`tareas_edilicia`, `completadas` y `dadas_de_baja` tienen que coincidir con `subtareas`,
`completadas` y `dadas_de_baja` de la foto del paso 3, y `con_tecnico` tiene que dar 0, porque
las subtareas no tenían técnico. Si alguien ya cargó tareas, sumar
`WHERE t.created_at < '<inicio del deploy>'`: las copiadas conservan su `created_at` original.
Después, confirmar que las tres estructuras viejas ya no existen:

```sql
SELECT
  to_regclass('subtareas_edilicia') IS NULL                       AS tabla_retirada,
  NOT EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'ticket_edilicia'
                AND column_name IN ('personal_asignado_id', 'porcentaje_avance')) AS columnas_retiradas;
```

Smoke manual, con un usuario que tenga una reparación con subtareas:

- el detalle del ticket muestra la sección **Tareas** con el avance (`<porcentaje>% · <completadas>
  de <total> completadas`) y cada tarea con "Sin técnico";
- en Edilicia, **Ver subtareas** muestra las mismas tareas, y la columna Avance del listado da el
  porcentaje de tareas activas completadas;
- el PDF del ticket imprime la sección "Tareas", con el técnico y el estado de cada una;
- el dashboard muestra la tarjeta **Tareas completadas por técnico** (puede estar vacía si nadie
  completó tareas en el ciclo);
- en el log de `soporte-backend` no aparecen errores de Prisma sobre `subtareas_edilicia`,
  `personal_asignado_id` ni `porcentaje_avance`.

### Rollback

**Primero los `rollback.sql`, después el código.** El cliente Prisma del código anterior lee
`subtareas_edilicia` y las dos columnas, así que volver al código sin recrearlas da errores en
Edilicia y en el PDF. El código de este release, en cambio, funciona con las estructuras viejas
recreadas, porque Prisma ignora las tablas y columnas que no conoce. Por eso el orden es:

1. En **cada** base de inquilino, los `rollback.sql` en orden inverso. Todos son re-ejecutables:
   1. `20261014120000_retiro_subtareas_edilicia/rollback.sql`: recrea la tabla y las dos columnas
      y las repuebla desde `tareas_ticket`. **Es el único imprescindible** para volver al código
      anterior.
   2. `20261013160000_tareas_ticket_indice_tecnico/rollback.sql`: borra el índice. Sin pérdida.
   3. `20261013150000_tipos_operacion_tareas/rollback.sql`: borra del historial de cada ticket
      las entradas de tareas, y después los cinco tipos.
   4. `20261013140000_tareas_ticket/rollback.sql`: borra `tareas_ticket`.
2. `git reset --hard <commit-de-rollback>` y `.\deploy.ps1` (ver "Cuando algo falla").

Los pasos 1.2 a 1.4 son opcionales. El código anterior no lee `tareas_ticket` ni los tipos
nuevos, y dejarlos conserva lo que el paso 1.1 no puede devolver. Si se corren, lo que solo vive
en `tareas_ticket` se pierde para siempre, salvo restaurando el dump.

**Qué no vuelve con el rollback:**

- **las tareas de tickets que no son de Edilicia**: la tabla vieja no puede guardarlas, y quedan
  solo en `tareas_ticket`;
- **el técnico de cada tarea** (`tecnico_id`): la tabla vieja no tenía esa columna;
- `personal_asignado_id` vuelve en NULL; nunca se usó, así que no hay dato que recuperar;
- `porcentaje_avance` se recalcula con las tareas activas (misma fórmula que
  `calcularAvanceTareas`), no se restaura el valor guardado;
- con el paso 1.3, el historial de tareas de todos los tickets;
- los `rollback.sql` no borran las filas de `_prisma_migrations`. Para volver a desplegar el
  release después, hay que borrar a mano las filas de las migraciones revertidas, o Prisma las
  da por aplicadas. Y lo que el código anterior haya escrito en `subtareas_edilicia` mientras
  tanto no vuelve a copiarse solo: la migración 1 ya figura como aplicada, y aunque se la
  reaplique, su `ON CONFLICT DO NOTHING` no actualiza las filas que ya existen.

Para volver al estado exacto de antes del deploy, la vía fiel es restaurar el dump de
`predeploy-dump.ps1` (ver "Restore de datos"), y se pierde lo escrito después del deploy.

## Límites de pedidos en Postgres

Los cuatro limitadores de pedidos (API v1, CSAT, recuperación de contraseña y formulario público)
dejan de contar en la memoria del proceso y cuentan en master (`odd/tasks/throttler-postgres.md`).
Los límites, las claves y las rutas no cambian. Qué cambia en el deploy:

| Qué | Detalle |
|---|---|
| Migración master | `20261015120000_throttler_contadores`, **aditiva**: la tabla `throttler_contadores`. Sin backfill ni seed. Entra por `migrate:master` dentro de la ventana de `predeploy-dump.ps1`. El código anterior no la lee, así que convive con ella. |
| Variables y dependencias | Ninguna. El lockfile no cambia. |
| Efecto del deploy | Los cupos arrancan de cero, como en cualquier reinicio anterior. Desde ahí sobreviven a los reinicios. |

### Smoke posterior al deploy

En el log de `soporte-backend` no tiene que aparecer `THROTTLER_ERROR`. Si aparece, la consulta
a la tabla falla y el limitador **deja pasar** los pedidos (fail-open, decisión del dueño): no
corta el servicio, pero tampoco limita.

### Migración y rollback

Su `rollback.sql` **no es destructivo** para datos de negocio: borra solo los contadores, y es
re-ejecutable (`DROP TABLE IF EXISTS`). Se revierte **primero el código** y después se corre el
`rollback.sql` contra master. Al revés, el código nuevo pierde la tabla, cada pedido limitado
loguea `THROTTLER_ERROR` y ningún límite se aplica hasta terminar el revert.

## Tiempos hábiles del dashboard

Los dos tiempos medios del dashboard (resolución y primera respuesta) dejan de recorrer el
historial en cada carga: cada ticket guarda sus segundos hábiles y el dashboard los promedia con
`AVG` (`odd/tasks/promedios-dashboard-habiles.md`). Qué cambia en el deploy:

| Qué | Detalle |
|---|---|
| Migración tenant | `20261015140000_tiempos_habiles_tickets`, **aditiva con backfill**: las columnas `resolucion_habil_s` y `primera_respuesta_habil_s` en `tickets`, y un `UPDATE` que copia el acumulado del reloj de SLA a `resolucion_habil_s` en los tickets HABIL ya resueltos o cerrados. Entra por `migrate:tenants`. |
| Script posterior | `backend/scripts/backfill-tiempos-habiles.mjs`: completa lo que el reloj no sabe (tickets previos al reloj, cohorte CORRIDO) y todas las primeras respuestas, con el calendario actual de cada cliente. Ensayo por defecto; `--apply` escribe. Idempotente. |
| Variables y dependencias | Ninguna. El lockfile no cambia. |
| Efecto visible | El promedio de resolución **baja**: deja de contar noches, fines de semana y esperas del cliente, y saca los preventivos. La tarjeta dice "horas hábiles, sin pausas". |

### Orden del deploy

1. `predeploy-dump.ps1`, en DryRun y en la corrida real (ver "Precondición operativa"): la
   migración escribe filas existentes.
2. `deploy.ps1`.
3. **Antes de que alguien mire el dashboard**, desde `C:\soporte\backend` y con Node 24 en el PATH
   (ver "En el VPS hay DOS Node"), el script en ensayo:

   ```powershell
   $env:Path = "C:\nodejs24;" + $env:Path
   cd C:\soporte\backend
   node scripts\backfill-tiempos-habiles.mjs
   ```

   Imprime una línea por tenant activo: cuántas resoluciones y primeras respuestas actualizaría,
   cuántas de esas resoluciones son aproximadas (`aproximados N`) y cuántos tickets saltea. Un
   ticket sin paso a RESUELTO en el historial pero con `fecha_cierre` (los importados) se aproxima
   con las horas hábiles `created_at → fecha_cierre`: mide hasta el cierre y no descuenta pausas
   (`odd/tasks/backfill-resolucion-importados.md`). Solo se saltea el que no tiene ni paso a
   RESUELTO ni `fecha_cierre`. Lee `dist/`, así que va
   **después** del build de `deploy.ps1`. Nunca imprime URLs ni claves.
4. Si los conteos son razonables, la corrida real: `node scripts\backfill-tiempos-habiles.mjs --apply`.
   Una segunda corrida tiene que informar 0 actualizados. Si un tenant falla, el script sigue con
   los demás y sale con código 1; se puede volver a correr cuando se corrija.

Hasta el paso 4, el dashboard promedia solo los tickets que ya tienen el dato: los que el `UPDATE`
de la migración completó y los que se resuelvan o respondan después del deploy.

### Rollback

Su `rollback.sql` borra las dos columnas (y sus CHECK) y es re-ejecutable (`DROP ... IF EXISTS`).
**Primero el código, después el `rollback.sql`** en cada base de inquilino: el código nuevo lee y
escribe las columnas, y sin ellas falla toda lectura de tickets (el cliente Prisma del código
nuevo las pide), además del dashboard, el pliegue del reloj y el registro de la primera respuesta. El código anterior no las conoce y convive con ellas, así que dejarlas puestas
también es un rollback válido.

Lo que se pierde al correr el `rollback.sql`: los valores guardados, que fijaban el calendario
vigente al momento de cada resolución o respuesta. Volver a desplegar después exige borrar a mano
la fila de la migración en `_prisma_migrations`, y el script recalcula con el calendario de ese
momento. El rollback no borra esa fila.

## Deploy del 2026-10-25: checklist combinado

Este release integra cinco ramas: `sesion-vencida-aviso`, `compra-por-descripcion`,
`cerrado-solo-comentarios` (con `ticket-unificado`), `preventivo-por-tipo` (con
`preventivo-anticipacion` y `responsables-por-tipo`) e `historial-valor-residual`. El detalle de
cada parte con migraciones está en su sección ("Ticket unificado", "Anticipación del plan
preventivo", "Tipo de ticket del plan preventivo" e "Historial del valor de los equipos", más
abajo); esta lista es el orden único para la ventana. Master no cambia, no hay variables de
entorno ni dependencias nuevas y el lockfile no cambia: `sesion-vencida-aviso`,
`compra-por-descripcion`, `cerrado-solo-comentarios` y `responsables-por-tipo` no traen
migraciones.

Migraciones tenant, todas por `migrate:tenants` y en este orden (el de sus timestamps):

| Orden | Migración | Escribe filas existentes | Sección |
|---|---|---|---|
| 1 | `20261024120000_ticket_unificado` | Sí (`tickets.ubicacion`, copias al timeline) | "Ticket unificado" |
| 2 | `20261024130000_comentarios_reparacion_internos` | Sí (`operaciones_ticket.es_interno`) | "Ticket unificado" |
| 3 | `20261025100000_preventivo_anticipacion` | No: columnas con DEFAULT y CHECK que toda fila cumple | "Anticipación del plan preventivo" |
| 4 | `20261025110000_tickets_fecha_objetivo` | No: columna nullable, sin backfill | "Anticipación del plan preventivo" |
| 5 | `20261025120000_tickets_recordatorio_preventivo` | No: columna nullable e índice parcial | "Anticipación del plan preventivo" |
| 6 | `20261025130000_preventivo_plan_tipo` | Sí (backfill de `planes_preventivo.tipo_id`); aborta en un tenant con planes y sin tipo `PREVENTIVO` | "Tipo de ticket del plan preventivo" |
| 7 | `20261025140000_historial_valor_residual` | No: crea la tabla `equipo_valoraciones`, de solo agregado, y su backfill inserta en ella hasta dos filas `MIGRACION` por equipo sin baja (desde `importe`/`fecha_valoracion` y `valor_residual`/`fecha_valor_residual`), sin modificar `equipos_informaticos` | "Historial del valor de los equipos" |

Cada migración es su propia transacción: si la 6 aborta en un tenant, en esa base ya quedaron
aplicadas de la 1 a la 5 y la 7 no se aplica, y `migrate-tenants.js` corta el fan-out con los
servicios detenidos, así que los tenants siguientes quedan sin migrar.

1. **Lista de bases** del registro, con la consulta sobre master de "Precheck de solo lectura: el
   CHECK de la copia". Todos los prechecks van en **cada** base de esa lista.
2. **Precheck de ubicación** ("Ticket unificado"): sin filas en ninguna base. Anotar la foto de
   `vinculos` y `comentarios`.
3. **Precheck del tipo `PREVENTIVO`** ("Tipo de ticket del plan preventivo"): en ninguna base
   `planes > 0` con `tipo_preventivo = 0`. Si la hay, crear el tipo desde la UI con el código
   actual en marcha y volver a correr este paso.
4. **`predeploy-dump.ps1 -DryRun`** y, en verde, **`predeploy-dump.ps1`** ("Precondición
   operativa"). Obligatorio: las migraciones 1, 2 y 6 escriben filas existentes, y el dump es el
   único rollback fiel de las tres. La 7 solo inserta en su tabla nueva, así que el dump no le
   hace falta para volver atrás. Los servicios quedan detenidos.
5. **Prechecks 2 y 3 otra vez**, con los servicios detenidos: la foto definitiva. Si alguno no da
   verde, no se corre `deploy.ps1`: se arrancan los servicios y se resuelve primero.
6. **`deploy.ps1`**. Lleva el backend y el frontend de este release juntos: el frontend anterior no
   es compatible con el backend de "Ticket unificado" (ver "T2, T2b y T3 salen en el mismo
   deploy"). Si la migración 6 falla en un tenant, seguir "Si la migración ya falló en un tenant".
7. **Verificación posterior** de "Ticket unificado" en cada base (conteos contra la foto del paso 5
   y smoke manual), y además, en cada base:

   ```sql
   SELECT
     (SELECT count(*) FROM planes_preventivo WHERE tipo_id IS NULL)   AS planes_sin_tipo,
     (SELECT count(*) FROM planes_preventivo WHERE anticipacion_valor <> 0
        OR anticipacion_unidad <> 'DIAS')                             AS planes_con_anticipacion,
     (SELECT count(*) FROM tickets WHERE fecha_objetivo IS NOT NULL)  AS tickets_con_fecha_objetivo;
   ```

   Recién migrado, los tres dan 0: los planes quedan en `PREVENTIVO` con anticipación de 0 días, y
   la fecha objetivo la fija recién el próximo barrido diario (por defecto a la 1:00,
   `PREVENTIVO_SWEEP_CRON`).

   Y el historial del valor de los equipos, antes de que alguien guarde un equipo:

   ```sql
   SELECT
     (SELECT count(*) FROM equipo_valoraciones WHERE origen = 'MIGRACION') AS valoraciones_migradas,
     (SELECT count(*) FROM equipo_valoraciones WHERE origen = 'MANUAL')    AS valoraciones_manuales,
     (SELECT count(*) FROM equipos_informaticos
        WHERE deleted_at IS NULL
          AND valor_residual IS NOT NULL AND fecha_valor_residual IS NOT NULL) AS con_valor_residual,
     (SELECT count(*) FROM equipos_informaticos
        WHERE deleted_at IS NULL
          AND importe IS NOT NULL AND fecha_valoracion IS NOT NULL)           AS con_importe,
     (SELECT count(*) FROM equipos_informaticos
        WHERE deleted_at IS NULL
          AND valor_residual IS NOT NULL AND fecha_valor_residual IS NOT NULL
          AND importe IS NOT NULL AND fecha_valoracion = fecha_valor_residual) AS misma_fecha;
   ```

   `valoraciones_manuales` da 0, y `valoraciones_migradas` es `con_valor_residual + con_importe -
   misma_fecha`: un equipo con las dos fechas iguales deja una sola fila, la del valor residual.

**Rollback combinado.** Con los servicios detenidos, en **cada** base de inquilino y en orden
inverso al de la tabla:

1. **Dump de `equipo_valoraciones`**, antes de borrarla. Las filas `MANUAL` guardadas después del
   deploy son el único registro de los valores anteriores al vigente de cada equipo, y el dump de
   `predeploy-dump.ps1` es anterior a ellas. `$dumpDir` es la carpeta que reportó
   `predeploy-dump.ps1`, y la URL es la de la base de ese tenant **sin** el `?schema=public`, con
   `-d` explícito (ver `DbUrl()` en `predeploy-dump.ps1`: libpq rechaza ese parámetro):

   ```powershell
   $dumpFile = Join-Path $dumpDir '<db_name>.equipo_valoraciones.dump'
   & 'C:\Program Files\PostgreSQL\16\bin\pg_dump.exe' -Fc --table=equipo_valoraciones `
     -d '<url de la base de ese tenant>' -f $dumpFile
   if ($LASTEXITCODE -ne 0) { throw "pg_dump de equipo_valoraciones fallo" }
   & 'C:\Program Files\PostgreSQL\16\bin\pg_restore.exe' --list $dumpFile | Out-Null
   if ($LASTEXITCODE -ne 0) { throw "el dump de equipo_valoraciones no se puede leer" }
   ```

2. `20261025140000_historial_valor_residual/rollback.sql`: borra la tabla entera.
3. Los `rollback.sql` de la 6, la 5, la 4 y la 3, y después los de la 2 y la 1 como dice
   "Ticket unificado".
4. Recién entonces el código anterior (el paso 2 del rollback de "Ticket unificado").

Los pasos 1 y 2 son opcionales: el código anterior no lee `equipo_valoraciones`, y dejar la tabla
conserva las filas `MANUAL` sin pasar por el dump. Las secciones de preventivo y la del historial
piden "primero el código": con los servicios detenidos no hay código nuevo corriendo contra
columnas o tablas que faltan, así que este orden también lo cumple. Ningún `rollback.sql` borra su fila de `_prisma_migrations`. Lo que cada uno pierde está en
su sección; la vía fiel sigue siendo el dump del paso 4 ("Restore de datos").

## Ticket unificado

Documento de la feature: `odd/tasks/ticket-unificado.md`. Las compras vinculadas, la ubicación y los
comentarios de reparación pasan del satélite `ticket_edilicia` al ticket, para todos los tipos. Qué
cambia en el deploy:

| Qué | Detalle |
|---|---|
| Migraciones tenant | Dos, solo en las bases de inquilino, por `migrate:tenants` (ver la tabla siguiente). Master no cambia. |
| Variables y dependencias | Ninguna. El lockfile no cambia. |
| Permisos | Vincular y desvincular compras exigen **Modificar** sobre el tipo del ticket y `COMPRAS:LECTURA`; `EDILICIA:BORRADO` ya no decide nada. Ver las compras vinculadas de un ticket (`GET /tickets/:id/compras`) exige `COMPRAS:LECTURA`. Comentar desde Edilicia exige **Comentar** y **Comentario interno** sobre el tipo. |
| Efecto visible | Los comentarios de reparación, los existentes y los nuevos, son comentarios **internos** del ticket: el solicitante y quien no tiene Comentario interno dejan de verlos. |

| Orden | Migración | Qué hace |
|---|---|---|
| 1 | `20261024120000_ticket_unificado` | Crea `ticket_compra` y copia `reparacion_compra`; copia la ubicación del satélite al ticket que no tiene una; copia `comentarios_reparacion` al timeline como COMENTARIO, con el mismo id. Las tablas viejas quedan congeladas, sin escrituras. |
| 2 | `20261024130000_comentarios_reparacion_internos` | Marca como internas las copias de la migración 1 (`es_interno = true` en las filas con el id de un comentario de reparación). |

### T2, T2b y T3 salen en el mismo deploy

El backend de este release y el frontend anterior no son compatibles. El frontend anterior ofrece
vincular con **Crear** sobre el tipo, desvincular con `EDILICIA:BORRADO` y comentar en Edilicia con
**Crear** o **Comentar**, y esconde el formulario de comentarios con el ticket cerrado o bloqueado.
Con el backend nuevo, esos botones responden 403 a quien no tiene los permisos de la tabla de
arriba. Por eso **no se despliega un `main` intermedio**: el deploy lleva las tareas T2, T2b y T3
juntas.

### Precheck de solo lectura: conflictos de ubicación

Si un ticket y su satélite tienen ubicaciones distintas, la migración 1 conserva la del ticket y la
del satélite no se copia a ningún lado. El único aviso es un `RAISE NOTICE` con la cantidad, y la
salida de `migrate:tenants` no garantiza mostrarlo. En producción dio 0 casos el 2026-10-24 (L8 del
documento), pero se vuelve a consultar antes del deploy, en **cada** base de inquilino activa (la
lista sale de `clientes`, igual que en "Tareas con técnico"):

```sql
SELECT t.numero, t.ubicacion AS ubicacion_ticket, te.ubicacion AS ubicacion_satelite
FROM tickets t
JOIN ticket_edilicia te ON te.ticket_id = t.id
WHERE btrim(COALESCE(t.ubicacion, '')) <> ''
  AND btrim(COALESCE(te.ubicacion, '')) <> ''
  AND t.ubicacion IS DISTINCT FROM te.ubicacion;
```

Es la misma condición que cuenta la migración. Sin filas en todas las bases, se sigue. Con filas,
se llevan al dueño antes de desplegar: la ubicación del satélite se pierde de la pantalla, y decidir
cuál queda es una decisión de datos.

En la misma pasada se anota la foto contra la que se compara después:

```sql
SELECT
  (SELECT count(*) FROM reparacion_compra)      AS vinculos,
  (SELECT count(*) FROM comentarios_reparacion) AS comentarios;
```

### Orden del deploy

1. Precheck en todas las bases, sin conflictos.
2. `predeploy-dump.ps1`, en DryRun y en la corrida real (ver "Precondición operativa"). Las dos
   migraciones escriben filas existentes (`tickets.ubicacion`, `operaciones_ticket.es_interno`): el
   dump es el único rollback fiel.
3. Precheck otra vez, con los servicios detenidos: la foto definitiva.
4. `deploy.ps1`.

### Verificación posterior al deploy

En cada base:

```sql
SELECT
  (SELECT count(*) FROM ticket_compra)                                  AS vinculos,
  (SELECT count(*) FROM operaciones_ticket o
     JOIN comentarios_reparacion cr ON cr.id = o.id)                    AS comentarios_copiados,
  (SELECT count(*) FROM operaciones_ticket o
     JOIN comentarios_reparacion cr ON cr.id = o.id WHERE o.es_interno) AS comentarios_internos;
```

`vinculos` tiene que coincidir con el de la foto (antes de que alguien vincule o desvincule), y
`comentarios_copiados` y `comentarios_internos` con `comentarios`.

Smoke manual: en Edilicia, un comentario publicado aparece en el historial del ticket marcado como
interno, y un usuario sin Comentario interno no lo ve; un usuario sin `COMPRAS:LECTURA` ve el chip
**Bloqueada** pero no la lista de compras del ticket.

### La migración 1 no se vuelve a correr después del deploy

Su copia es re-ejecutable **antes** del deploy, no después. Una vez en producción, desvincular
borra la fila de `ticket_compra` pero no la de `reparacion_compra`, que quedó congelada: volver a
correr la migración revive como vinculadas, y bloqueantes, compras que alguien desvinculó. Por eso
no se borra su fila de `_prisma_migrations` ni se corre su `migration.sql` a mano, salvo después
de su `rollback.sql`, que primero proyecta el estado vigente sobre las tablas viejas.

Y si se la vuelve a aplicar, se vuelve a aplicar también la 2: la migración 1 copia los
comentarios como públicos.

### Rollback

Con los servicios detenidos, **primero los `rollback.sql`, después el código**. El código de este
release lee `ticket_compra`, y el anterior lee `reparacion_compra`, la ubicación del satélite y
`comentarios_reparacion`: ninguno de los dos funciona entero en el medio.

1. En **cada** base de inquilino, en orden inverso. Los dos son re-ejecutables:
   1. `20261024130000_comentarios_reparacion_internos/rollback.sql`: devuelve a públicas las copias.
      Antes del rollback de la 1 no cambia nada visible, porque ese borra las copias.
   2. `20261024120000_ticket_unificado/rollback.sql`: proyecta `ticket_compra` y la ubicación del
      ticket sobre las tablas viejas, borra `ticket_compra` y quita del timeline las copias de los
      comentarios.
2. `git reset --hard <commit-de-rollback>` y `.\deploy.ps1` (ver "Cuando algo falla").

Correr solo el paso 1.1, con el código de este release arriba, deshace únicamente la decisión L19:
los comentarios de reparación migrados vuelven a ser públicos.

**Qué no vuelve con el rollback:**

- los vínculos de compra de tickets **sin** satélite: `reparacion_compra` no los puede guardar, y con
  ellos se pierde el bloqueo de esos tickets;
- los **adjuntos** que se hayan agregado después del deploy a un comentario migrado: el rollback
  borra la operación y `archivos_operacion` la sigue con `ON DELETE CASCADE`. El archivo queda en
  `archivos`, pero deja de aparecer en el ticket. Antes del paso 1.2 se listan para poder
  re-vincularlos:

  ```sql
  SELECT o.ticket_id, ao.archivo_id, ao.operacion_id
  FROM archivos_operacion ao
  JOIN comentarios_reparacion cr ON cr.id = ao.operacion_id
  JOIN operaciones_ticket o ON o.id = ao.operacion_id;
  ```

- los comentarios publicados desde Edilicia después del deploy no vuelven a
  `comentarios_reparacion`: quedan en el timeline como comentarios internos del ticket;
- un satélite con ubicación distinta de la del ticket (el conflicto del precheck) queda con la del
  ticket;
- los `rollback.sql` no borran las filas de `_prisma_migrations`: para volver a desplegar, se borran
  a mano las dos, y la 2 tiene que volver a correr después de la 1.

Para volver al estado exacto de antes del deploy, la vía fiel es restaurar el dump de
`predeploy-dump.ps1` (ver "Restore de datos"), y se pierde lo escrito después del deploy.

## Anticipación del plan preventivo

Documento de la feature: `odd/tasks/preventivo-anticipacion.md`. El plan preventivo gana una
anticipación (número + Días/Meses), el ticket que genera guarda la fecha del ciclo como **fecha
objetivo** y el responsable del plan recibe un recordatorio el día anterior. Tres migraciones
tenant, aditivas, por `migrate:tenants`:

| Orden | Migración | Qué hace |
|---|---|---|
| 1 | `20261025100000_preventivo_anticipacion` | `planes_preventivo.anticipacion_valor` (DEFAULT 0) y `anticipacion_unidad` (DEFAULT `DIAS`), con sus CHECK. Los planes existentes quedan con 0 días: generan el día del ciclo, como antes. |
| 2 | `20261025110000_tickets_fecha_objetivo` | `tickets.fecha_objetivo DATE NULL`, sin backfill. |
| 3 | `20261025120000_tickets_recordatorio_preventivo` | `tickets.recordatorio_enviado_at` y el índice parcial `tickets_recordatorio_pendiente_idx`. |

No necesitan precheck: el CHECK `planes_preventivo_anticipacion_menor_cadencia_check` compara la
anticipación con la cadencia, y con 0 días toda fila lo cumple (`intervalo_valor > 0`). El
recordatorio lo corre el mismo barrido diario: no hay cron ni variable de entorno nuevos.

### Rollback

Los tres `rollback.sql` se pueden correr dos veces. **Primero el código, después los
`rollback.sql`**, en orden inverso (3, 2, 1): el código nuevo lee las columnas y falla sin ellas; el
anterior convive con ellas, así que dejarlas puestas también es un rollback válido. Se pierden la
anticipación de cada plan, la fecha objetivo de los tickets y la marca de recordatorio enviado. No
borran las filas de `_prisma_migrations`.

## Tipo de ticket del plan preventivo

Cada plan preventivo pasa a tener un tipo de ticket (`odd/tasks/preventivo-por-tipo.md`). La
migración tenant `20261025130000_preventivo_plan_tipo` agrega `planes_preventivo.tipo_id` NOT NULL
y pone **todos** los planes existentes, también los dados de baja, en el tipo de código
`PREVENTIVO`. Entra por `migrate:tenants` dentro de la ventana de `predeploy-dump.ps1`.

Un tenant con planes y **sin** un tipo de código `PREVENTIVO` no se puede migrar: la migración
aborta con `preventivo_plan_tipo: el tenant tiene planes preventivos y no tiene el tipo de ticket
PREVENTIVO`. El script corre en una sola transacción implícita, así que no deja nada a medias en
esa base, pero Prisma la marca como fallida en `_prisma_migrations` y los deploys siguientes fallan
con `P3009`. Un tenant sin planes migra igual, tenga o no el tipo.

### Precheck de solo lectura

Con la lista de bases del registro (la misma consulta sobre master de "Precheck de solo lectura:
el CHECK de la copia"), en **cada** base de inquilino, antes del deploy:

```sql
SELECT
  (SELECT count(*) FROM planes_preventivo)                         AS planes,
  (SELECT count(*) FROM tipos_ticket WHERE codigo = 'PREVENTIVO')  AS tipo_preventivo;
```

La migración busca el tipo solo por `codigo`, sin mirar `activo` ni `deleted_at`: un tipo
`PREVENTIVO` dado de baja la deja pasar, y sus planes quedan en él (el barrido los rechaza a
diario con `PREVENTIVO_PLAN_ERROR` hasta que se los pase a un tipo vigente). Desde la UI no se
puede dar de baja ni cambiarle el código: es un tipo del sistema (`TIPOS_TICKET_DEL_SISTEMA`).

| Resultado | Qué hacer |
|---|---|
| `planes = 0`, o `tipo_preventivo = 1` | Seguir. |
| `planes > 0` y `tipo_preventivo = 0` | **No desplegar todavía.** Con el código actual en marcha, entrar como administrador de ese cliente a Admin → Catálogos → Tipos de ticket y crear el tipo con código `PREVENTIVO`, nombre `Preventivo` y módulo `EDILICIA` (los valores del seed), copiando los permisos del tipo que corresponda para que los técnicos lo vean. Volver a correr el precheck. |

### Si la migración ya falló en un tenant

1. Crear el tipo en **esa** base. Con los servicios detenidos no hay UI, así que va por SQL, con
   los valores del seed (`tenant-seeder.adapter.ts`):

   ```sql
   INSERT INTO tipos_ticket (codigo, nombre, modulo, updated_at)
   VALUES ('PREVENTIVO', 'Preventivo', 'EDILICIA', now());
   ```

   Nadie tiene permisos sobre un tipo creado así: hasta que se le den `LECTURA` en Permisos →
   Tipos de ticket, sus planes los ven solo los administradores. El mensaje del `RAISE` también
   sugiere asignar `tipo_id` a mano a cada plan, pero eso no es posible: la columna se deshace
   junto con el error.
2. Marcar la migración como revertida con el `DATABASE_URL_TENANT` de ese tenant y
   `--config prisma.tenant.config.ts` (ver "Nota histórica: precondición de componentes sin
   repuesto"; sin `--config`, Prisma 7 la marcaría contra master):

   ```powershell
   $env:DATABASE_URL_TENANT = '<url de la base de ese tenant>'
   corepack pnpm prisma migrate resolve --rolled-back 20261025130000_preventivo_plan_tipo --schema prisma_tenant/schema.prisma --config prisma.tenant.config.ts
   ```

3. Volver a correr el precheck en esa base, y después `deploy.ps1`.

### Rollback

Su `rollback.sql` borra el índice, la FK y la columna, y se puede correr dos veces. **Primero el
código, después el `rollback.sql`** en cada base de inquilino: el código nuevo lee `tipo_id` y
sin la columna falla. Pierde el tipo elegido en cada plan; el código anterior genera todos los
planes con `PREVENTIVO`. No borra la fila de `_prisma_migrations`: para volver a desplegar, el
mismo `migrate resolve --rolled-back` de arriba.

## Historial del valor de los equipos

Documento de la feature: `odd/tasks/historial-valor-residual.md`. Cada valor residual que se guarda
en un equipo queda en un historial (fecha + importe), y la ficha lo muestra en tabla y gráfico. Qué
cambia en el deploy:

| Qué | Detalle |
|---|---|
| Migración tenant | `20261025140000_historial_valor_residual`, **aditiva con backfill**: la tabla `equipo_valoraciones`, de solo agregado (ningún flujo borra filas), con una fila por equipo y día. El backfill inserta hasta dos filas `MIGRACION` por equipo sin baja, con `importe`/`fecha_valoracion` y `valor_residual`/`fecha_valor_residual`; no modifica `equipos_informaticos`. Entra por `migrate:tenants`. |
| Variables y dependencias | Ninguna. El lockfile no cambia. |
| Efecto visible | Guardar un equipo con un valor residual o una fecha distintos de los guardados registra una fila `MANUAL`; el último guardado del día reemplaza al anterior. La ficha muestra el importe, el valor residual y el historial a quien puede ver equipos. |

No necesita precheck: la tabla es nueva y no tiene CHECK de rango que una fila histórica pueda
violar. La verificación posterior es la consulta del paso 7 de "Deploy del 2026-10-25: checklist
combinado".

### Rollback

Su `rollback.sql` borra la tabla entera y se puede correr dos veces (`DROP TABLE IF EXISTS`).
**Primero el código, después el `rollback.sql`** en cada base de inquilino: el código nuevo lee y
escribe la tabla al abrir la ficha y al guardar un equipo, y falla sin ella. El código anterior no
la conoce y convive con ella, así que dejarla puesta también es un rollback válido, y es el único
que no pierde datos.

Lo que se pierde al correr el `rollback.sql`: las filas `MANUAL` registradas después del deploy,
que son el único registro de los valores anteriores al vigente de cada equipo. Antes de correrlo en
un tenant con uso real, el dump de la tabla del paso 1 de "Rollback combinado". Las filas
`MIGRACION` se reconstruyen al reaplicar la migración, pero con los valores que los equipos tengan
en ese momento. No borra la fila de `_prisma_migrations`: para volver a desplegar, se borra a mano.

## Retiro del código del satélite de Edilicia (T4a)

La rama `fix/estado-terminal-solo-admin` trae T4a de `odd/tasks/ticket-unificado.md`: el código deja
de leer y escribir `ticket_edilicia`, `comentarios_reparacion` y `reparacion_compra`. **No trae
migraciones**: las tres tablas quedan en cada base de inquilino, y las borra T4b en un deploy
posterior, cuando T4a ya esté en uso.

Qué cambia en el uso: el alta de un ticket Edilicia ya no crea la fila de `ticket_edilicia`, y las
rutas `/reparaciones/:id` aceptan solo el id del ticket (el del satélite da 404).

### Rollback

Es solo de código: se vuelve al commit que estaba en producción antes de este deploy (`6595d838`,
el deploy del 2026-10-25, o el que figure en el registro del deploy). No hay `rollback.sql`.

**Qué no vuelve con el rollback:**

- **la ubicación en el PDF**: `6595d838` la toma del satélite, no del ticket. Como el satélite no
  se escribe desde el deploy del 2026-10-25, los tickets creados después de T4a salen sin
  ubicación en el PDF, y los editados desde el 2026-10-25 salen con la vieja. En la pantalla y en
  el detalle se sigue viendo la del ticket.

Con `6595d838` el listado de Edilicia ya se arma desde los tickets del módulo, así que ningún
ticket desaparece de la pantalla.

**Solo si el rollback va más atrás de `6595d838`** (por ejemplo a `3b13b320`, que además exige los
`rollback.sql` del deploy del 2026-10-25): ese código lista las reparaciones por `ticket_edilicia`,
y los tickets del módulo creados después de T4a no tienen fila ahí. Si T4b ya se aplicó, su
`rollback.sql` recrea las tablas y los satélites de todos los tickets del módulo, y esta consulta
sobra (ver "Borrado de las tablas del satélite de Edilicia (T4b)"). Si no, para que vuelvan a la
pantalla, en cada base de inquilino:

```sql
INSERT INTO ticket_edilicia (ticket_id, created_at, updated_at)
SELECT t.id, now(), now()
FROM tickets t
JOIN tipos_ticket tt ON tt.id = t.tipo_id
LEFT JOIN ticket_edilicia te ON te.ticket_id = t.id
WHERE tt.modulo = 'EDILICIA' AND te.id IS NULL;
```

El filtro es por módulo y no por código: el satélite existía para todos los tipos del módulo
EDILICIA (MANTENIMIENTO incluido). `id` sale del default de la columna, `ubicacion` queda en NULL y
`updated_at` se carga a mano porque no tiene default en la base.

## Borrado de las tablas del satélite de Edilicia (T4b)

La migración `20261025150000_retiro_satelite_edilicia` (`odd/tasks/ticket-unificado.md`, T4b) borra
`comentarios_reparacion`, `reparacion_compra` y `ticket_edilicia` en cada base de inquilino.

**Precondición: T4a ya en producción.** El código anterior a T4a (`6595d838` o antes) lee esas
tablas: con ese código corriendo, la pantalla Edilicia se rompe. T4a entró con `78388820`, el
2026-10-25.

### Antes del deploy

1. `predeploy-dump.ps1`, como en cualquier deploy con migraciones: el dump es lo único que conserva
   el contenido de las tablas borradas.
2. Opcional, para saber de antemano si la migración va a abortar. En cada base de inquilino, el
   resultado esperado es `0`:

   ```sql
   SELECT count(*) FROM comentarios_reparacion cr
   WHERE NOT EXISTS (SELECT 1 FROM operaciones_ticket o WHERE o.id = cr.id);
   ```

   En un tenant que ya no tiene la tabla, la consulta falla porque la relación no existe (el texto
   depende del idioma del servidor), y la migración pasa de largo sin problema.

### Qué hace la migración

- **Aborta** si un comentario de reparación no tiene su copia en el timeline del ticket. No borra
  nada en ese tenant, y `deploy.ps1` se corta con los servicios detenidos (ver "Cuando algo falla").
  Es el único dato de esas tablas que no queda en otro lado. Los tenants que ya migraron quedan sin
  las tablas, lo que con T4a en producción no importa. Prisma marca la migración como fallida en el
  tenant que abortó: se copia el comentario que falta, o se decide descartarlo, y se marca la
  migración como revertida en **ese** tenant (`migrate resolve --rolled-back
  20261025150000_retiro_satelite_edilicia`, ver la lección sobre `P3009` en "Preflight que conviene
  correr antes") antes de volver a desplegar.
- **Avisa** con un `NOTICE`, sin frenar, los vínculos de `reparacion_compra` sin par en
  `ticket_compra` y las ubicaciones del satélite que el ticket no tiene: son desvinculaciones o
  ubicaciones vaciadas desde el ticket después de la copia del 2026-10-25.
- **Aborta** si algo desconocido depende de las tablas (una FK o una vista): los `DROP` van sin
  `CASCADE`.
- Es re-ejecutable, y corre en los tenants que ya no tienen las tablas.

### Rollback

- **Volver a `78388820` (T4a)** no necesita nada más: ese código no usa las tablas.
- **Volver más atrás** (`6595d838` o antes) exige correr antes el `rollback.sql` de la carpeta en
  cada base de inquilino. Recrea las tres tablas, un satélite por cada ticket del módulo EDILICIA
  (MANTENIMIENTO incluido) y los vínculos de compra desde `ticket_compra`.

**Qué no vuelve con el `rollback.sql`:**

- los comentarios de reparación: `comentarios_reparacion` vuelve vacía, porque los comentarios
  están en el timeline del ticket como comentarios internos y no se distinguen de uno hecho desde
  el ticket. Con un rollback a `3b13b320` o antes, el diálogo de comentarios de la reparación sale
  vacío, y los rollbacks de `20261024130000` y `20261024120000` no los recuperan: quedan como
  comentarios internos en el timeline;
- la ubicación de los satélites: vuelven sin ubicación, porque la ubicación vive en el ticket;
- los vínculos desvinculados después de la copia, que avisó el `NOTICE`;
- la fila de la migración en `_prisma_migrations`: para volver a desplegar, se borra a mano.

Para volver al estado exacto de antes del deploy, la vía fiel es restaurar el dump de
`predeploy-dump.ps1` (ver "Restore de datos"), y se pierde lo escrito después del deploy.

## Horario laboral por usuario

Documento de la feature: `odd/tasks/tiempo-tecnico.md` (T1). Cada usuario puede tener un horario
laboral semanal propio; quien no lo tiene sigue usando el del cliente. Se carga desde el botón
"Horarios" de la fila del técnico en Admin > Usuarios (API `/horario-laboral/usuarios/:usuarioId`)
y solo se usa para medir el tiempo del técnico (ver "Tramos del técnico"): no cambia el SLA del
ticket ni la asignación.

| Qué | Detalle |
|---|---|
| Migración tenant | `20261026100000_horario_laboral_usuario`, **aditiva y sin backfill**: crea `horario_laboral_usuario` vacía, con los mismos CHECK que `calendario_laboral_dias_cliente`. Entra por `migrate:tenants`. |
| Variables y dependencias | Ninguna. El lockfile no cambia. |

No necesita precheck: la tabla es nueva y nace vacía.

### Rollback

Su `rollback.sql` borra la tabla y se puede correr dos veces (`DROP TABLE IF EXISTS`). **Primero el
código, después el `rollback.sql`** en cada base de inquilino: el código nuevo lee la tabla y falla
sin ella. El código anterior no la conoce y convive con ella, así que dejarla puesta también es un
rollback válido, y es el único que no pierde datos. Al correr el `rollback.sql` se pierden los
horarios propios cargados después del deploy: antes, un dump de la tabla. No borra la fila de
`_prisma_migrations`: para volver a desplegar, se borra a mano.

## Tramos del técnico

Documento de la feature: `odd/tasks/tiempo-tecnico.md` (T3). Cada vez que un ticket queda con un
responsable se abre un tramo de ese técnico, y se cierra al reasignar, desasignar o pasar a
RESUELTO, CERRADO o CANCELADO, con el tiempo hábil medido en su horario. Se ve en el bloque
"Tiempo del técnico" del detalle del ticket y en el cumplimiento por técnico del dashboard (T4).

| Qué | Detalle |
|---|---|
| Migración tenant | `20261026110000_tramos_tecnico_ticket`, **aditiva y sin backfill**: crea `tramos_tecnico_ticket` vacía, con sus CHECK y el índice único parcial de "un tramo abierto por ticket". Entra por `migrate:tenants`. |
| Variables y dependencias | Ninguna. El lockfile no cambia. |

No necesita precheck: la tabla es nueva y nace vacía. **La migración va antes que el código** en
cada base de inquilino: el código nuevo escribe la tabla en cada guardado de un ticket, así que sin
ella falla cualquier alta, asignación o cambio de estado.

Los tickets que ya tenían responsable antes del deploy no tienen tramo: se les abre uno recién cuando
cambian de manos o se reabren. Es lo esperado (sin backfill), no un error.

### Rollback

Su `rollback.sql` borra la tabla y se puede correr dos veces (`DROP TABLE IF EXISTS`). **Primero el
código, después el `rollback.sql`** en cada base de inquilino: el código nuevo falla sin la tabla.
El código anterior no la conoce y convive con ella, así que dejarla puesta también es un rollback
válido, y es el único que no pierde datos. Al correr el `rollback.sql` se pierden los tramos medidos
desde el deploy, que no se pueden reconstruir: antes, un dump de la tabla. No borra la fila de
`_prisma_migrations`: para volver a desplegar, se borra a mano.

## Cuando algo falla

**El script aborta en el primer error y te deja el rollback impreso al final de la corrida
exitosa anterior.** Si abortó después del paso 9, los servicios pueden haber quedado detenidos:
verificá.

```powershell
Get-Service soporte-backend, soporte-frontend
```

Logs:

```
C:\soporte\backend\service-err.log
C:\soporte\frontend\service-err.log
```

Rollback (el script lo imprime con el sha concreto al terminar):

```powershell
cd C:\soporte
git reset --hard <commit-de-rollback>
.\deploy.ps1
```

> **Corrección del 2026-09-09 (issue #139).** Hasta `f33a334`, cuando `deploy.ps1` cambiaba
> en el pull la instancia re-ejecutada recapturaba `HEAD` **después** del pull, así que la
> línea final imprimía como rollback **el commit recién desplegado**: un `git reset --hard`
> que no revierte nada. Fallaba justo en los deploys donde el script de despliegue había
> cambiado, que son los que más probablemente necesiten revertirse. Ahora el commit se
> hereda por parámetro.

> El rollback **no revierte migraciones**. Si el deploy alcanzó a migrar, volver el código atrás
> deja código viejo contra schema nuevo. Con migraciones aditivas suele andar; con una
> destructiva, no. Mirá qué migró antes de decidir.

### El `git pull` necesita GitHub, aunque el deploy vaya por bundle

`deploy.ps1` siempre corre `git pull --ff-only origin main`. En el flujo por bundle (mientras
GitHub está en pausa) ese pull no trae nada y responde "Already up to date", pero **igual tiene
que llegar a GitHub**. Si el VPS no resuelve `github.com` o no lo alcanza, el script corta ahí.

El 2026-10-14 pasó con un fallo de DNS pasajero: `ssh: Could not resolve hostname github.com`.
Como `predeploy-dump.ps1` ya había detenido los servicios y `deploy.ps1` aborta sin
levantarlos, producción dio 502 hasta que se levantaron a mano.

Para que no se repita:

1. **Antes de `predeploy-dump.ps1`**, confirmar que el VPS llega a GitHub:

   ```powershell
   cd C:\soporte
   git ls-remote -q origin HEAD
   ```

   Si no devuelve un sha, no se arranca: se resuelve primero la red o el DNS
   (`Resolve-DnsName github.com`).
2. **Si el deploy aborta en el pull, o en cualquier paso anterior a los builds** (pasos 1 a 8
   de "Qué hace, en orden"), los servicios corren los builds anteriores, que no se tocaron, y
   el schema no cambió. Se levantan en el momento, sin esperar al diagnóstico:

   ```powershell
   Start-Service soporte-backend, soporte-frontend
   ```

   Con el sitio arriba se diagnostica. Para reintentar, se vuelve a correr
   `predeploy-dump.ps1`, porque hubo escrituras mientras tanto, y después `deploy.ps1`.

   Si abortó **durante o después de los builds**, esto no aplica: `dist/` o `.next/` pueden
   haber quedado a medio escribir. Se sigue el rollback de arriba.

### Rollback del tracker `catalogo-unico-componentes`

Revertir el código de este release **exige restaurar el dump de master y de cada tenant**, siempre
juntos. Las migraciones son destructivas e irreversibles: el tenant hace `DROP COLUMN
tipo_componente_codigo` y `SET NOT NULL` sobre `insumo_id`, y master hace `DROP TABLE
tipos_componente` (con sus 12 filas). El `git reset --hard` no las deshace, y no hay `rollback.sql`.
El procedimiento es el de la sección siguiente ("Restore de datos"), con el dump que tomó
`predeploy-dump.ps1` antes de este deploy: aunque el título de esa sección nombre el backfill de
fechas, los pasos (detener servicios, `pg_restore --clean --if-exists` de master y de cada tenant,
revertir el código, arrancar) son los mismos.

### Rollback del tracker `stock-usado-componentes`

Este release es **aditivo**: agrega `condicion` a `movimientos_insumo` y las columnas `baja_*` a
`componentes_equipo`, con sus CHECK. El binario viejo no lee esas columnas e inserta con el default,
así que el `git reset --hard` funciona sin restaurar datos **salvo en dos puntos** que hay que medir
antes de decidir. El detector es de solo lectura; se corre en cada tenant activo (con `psql` contra
la base de ese tenant, nunca contra master):

```sql
SELECT
  (SELECT count(*) FROM movimientos_insumo WHERE condicion = 'USADO')          AS movimientos_usado,
  (SELECT count(*) FROM componentes_equipo WHERE baja_destino IS NOT NULL)     AS retiros_con_destino;
```

| Resultado | Qué significa |
|---|---|
| Los dos en 0 en **todos** los tenants | `git reset --hard <commit-de-rollback>` y `.\deploy.ps1`. Las migraciones quedan aplicadas y no molestan al binario viejo. |
| `movimientos_usado` > 0 | El binario viejo suma los usados al saldo único y puede consumirlos como nuevos. El alcance del error es ese número. |
| `retiros_con_destino` > 0 | El binario viejo no escribe las columnas de retiro: su reactivar sobre **cualquier** componente con destino (`STOCK_USADO` o `DESCARTE`) deja `deleted_at` en NULL con `baja_destino` presente, y el CHECK `componentes_equipo_baja_coherente_check` lo rechaza (500 en esas filas). Sobre `STOCK_USADO` es deseable (evita el doble conteo); sobre `DESCARTE` es una pérdida de función acotada a esas filas. Los retiros legados siguen reactivándose. |

Con cualquiera de los dos valores > 0, la vía preferida es **corregir hacia adelante**. Si el
revert es inevitable, la vía fiel es restaurar el dump de `predeploy-dump.ps1` siguiendo la sección
siguiente ("Restore de datos"); se pierde lo escrito después del deploy. Revertir sin restaurar
acepta las dos consecuencias de la tabla, con su alcance ya medido por el detector.

### Rollback del tracker `repuestos-numero-de-serie`

Este release es **una sola entrega** (los estados intermedios no son desplegables) y su migración
`20260930140000_unidades_insumo_serie` es **aditiva**: agrega `unidades_medida.entera`,
`insumos.seguimiento` (default `NINGUNO`), la tabla `unidades_insumo`, `movimientos_insumo.unidad_id`,
`componentes_equipo.unidad_id` y la tabla `eventos_unidad_insumo`. El `git reset --hard` no la
deshace, y con los defaults inertes el binario viejo sigue funcionando. Qué se pierde al revertir
depende del estado de cada tenant. El detector es de solo lectura; se corre en cada tenant activo
(con `psql` contra la base de ese tenant, nunca contra master). Las bases de los tenants se toman
del registro, nunca se hardcodean:

```powershell
& 'C:\Program Files\PostgreSQL\16\bin\psql.exe' $env:DATABASE_URL_MASTER -t -A -F '|' -c "SELECT nombre, db_name, activo FROM clientes;"
```

```sql
SELECT
  (SELECT count(*) FROM insumos WHERE seguimiento = 'SERIE')               AS insumos_serie,
  (SELECT count(*) FROM unidades_insumo)                                   AS unidades,
  (SELECT count(*) FROM movimientos_insumo WHERE unidad_id IS NOT NULL)    AS movimientos_con_unidad;
```

| Resultado | Qué significa |
|---|---|
| Los tres en 0 en **todos** los tenants | `git reset --hard <commit-de-rollback>` y `.\deploy.ps1`. La migración queda aplicada y no molesta al binario viejo. Revertir el código es gratis. |
| Cualquiera > 0 | Ya hay insumos con seguimiento por serie o piezas cargadas. El binario viejo suma el libro por cantidad (coincide mientras valga el invariante) pero asienta salidas **sin unidad** en insumos `SERIE`, y eso rompe el invariante. Además, su edición del serial de un componente con unidad choca con el CHECK `componentes_equipo_unidad_sin_serie_texto_check` (500 acotado a esas filas). |

Con cualquiera de los valores > 0, la vía preferida es **corregir hacia adelante**. Si el revert es
inevitable, la vía fiel es restaurar el dump de `predeploy-dump.ps1` siguiendo la sección siguiente
("Restore de datos"); se pierde lo escrito después del deploy. Revertir **sin** restaurar exige,
antes de volver a desplegar el ciclo, conciliar en cada tenant los movimientos que el binario viejo
asentó sin unidad en insumos `SERIE`:

```sql
SELECT m.*
FROM movimientos_insumo m
JOIN insumos i ON i.id = m.insumo_id
WHERE i.seguimiento = 'SERIE'
  AND m.unidad_id IS NULL;
```

Cada fila que aparezca después de la fecha del deploy es una salida o un ajuste que hay que
atribuir a una unidad concreta, o corregir, antes de redesplegar.

### Restore de datos (si el backfill de fechas hay que revertirlo)

Caso puntual: el backfill de `sdd/sesion-utc-y-backfill-de-fechas` (issue #173, ADR-6) resta 3
horas a los valores históricos afectados (~1614, medidos el 2026-09-14 sobre master + los tenants
activos en ese momento — es una foto, no una constante: crece con cada tenant nuevo), y eso **el
`git reset --hard` de arriba no lo deshace** — la migración ya corrió y quedó marcada en
`_prisma_migrations`. El único rollback de datos es restaurar el dump que tomó
`predeploy-dump.ps1` antes del deploy.

**Los dos pasos van SIEMPRE juntos.** Revertir el código sin restaurar los datos deja las filas ya
corregidas mostrándose −3h (la lectura vuelve a restar 3h a un valor que ya está en UTC):

```powershell
# 1. Detener servicios
Stop-Service soporte-backend, soporte-frontend -Force

# 2. Restaurar cada base desde el dump verificado (mismo directorio con timestamp
#    que reportó predeploy-dump.ps1 al terminar en verde)
$dumpDir = 'C:\soporte\backups\utc-backfill-<timestamp>'
& 'C:\Program Files\PostgreSQL\16\bin\pg_restore.exe' --clean --if-exists --no-owner `
  -d soporte_master (Join-Path $dumpDir 'soporte_master.dump')
if ($LASTEXITCODE -ne 0) { throw "restore de soporte_master fallo" }
# repetir --clean --if-exists --no-owner -d <tenant> <tenant>.dump por cada tenant del dump

# 3. Revertir el código y redesplegar
cd C:\soporte
git reset --hard <commit-de-rollback>
.\deploy.ps1

# 4. Recién con el código viejo Y los datos restaurados, arrancar servicios
#    (deploy.ps1 ya los arranca en su paso 11 — este paso es solo si algo
#    quedo manual a mitad de camino)
Start-Service soporte-backend, soporte-frontend
```

`--clean --if-exists` deja el restore idempotente ante un reintento; `--no-owner` evita que
`pg_restore` intente reasignar el dueño de los objetos (el rol del dump y el rol de producción no
siempre coinciden). **Residuo declarado**: el restore vuelve al instante del dump — con los
servicios detenidos por `predeploy-dump.ps1` desde antes de tomarlo, esa ventana de actividad
perdida es cero.

**`EMAIL_CRYPTO_KEY` se respalda junto con la base** (va en `backend/.env`, no en Postgres) — un
restore de datos sin conservar esa clave deja las credenciales SMTP de los clientes
indescifrables.

---

## Después del deploy

**El smoke interno del script es contra `localhost`**: prueba que los servicios responden, no que
el sitio esté publicado. Verificá desde afuera:

```bash
curl -sL -o /dev/null -w "%{http_code} %{url_effective}\n" https://soporte.sesitec.net/
# esperado: 200 https://soporte.sesitec.net/login  (la raíz redirige con 307)
```

### Verificación de IP del limitador de intentos (2FA)

El limitador de intentos guarda la IP del cliente en la clave. Después del deploy, con un login
fallido de prueba hecho desde afuera, las claves de `auth_intentos_fallidos` deben terminar en una
IP pública, **no** en `sin-ip` ni en `127.0.0.1`:

```powershell
docker exec soporte-postgres-master psql -U soporte -d soporte_master -c "SELECT clave FROM auth_intentos_fallidos ORDER BY 1 DESC LIMIT 10;"
```

Si terminan en `sin-ip` o `127.0.0.1`, el proxy no está reenviando la IP real y el límite se
comparte entre todos los usuarios: corregirlo antes de dar el deploy por bueno.

### Recuperación del 2FA de un ROOT (`resetear-2fa-root.ts`)

Un ROOT que perdió su autenticador no puede resetearse por la API (queda bajo `TenantGuard`). El
operador, en el VPS, borra su 2FA y revoca sus sesiones; el siguiente login obliga a enrolar de
nuevo. Solo funciona con un usuario existente que sea ROOT; con otro sale con 1 sin escribir nada:

```powershell
cd C:\soporte\backend
$env:RESET_EMAIL = 'root@ejemplo.com'
corepack pnpm exec ts-node scripts/resetear-2fa-root.ts   # imprime OK
Remove-Item Env:RESET_EMAIL
```

### Verificación de la sesión UTC (sdd/sesion-utc-y-backfill-de-fechas, ADR-1/ADR-6)

**`SHOW timezone` en una sesión NUEVA por cada base** — `soporte_master` y cada tenant activo.
Tiene que dar `UTC`:

```powershell
$env:Path = "C:\nodejs24;" + $env:Path
cd C:\soporte\backend
& 'C:\Program Files\PostgreSQL\16\bin\psql.exe' $env:DATABASE_URL_MASTER -t -A -c "SHOW timezone"
```

y lo mismo contra la URL de cada tenant (reemplazando el path de `DATABASE_URL_MASTER` por su
`db_name`, igual que hace `predeploy-dump.ps1`). **Tiene que ser una conexión nueva**: el
`ALTER DATABASE ... SET timezone` de la migración (ADR-1) sólo afecta sesiones que arrancan
DESPUÉS de aplicarlo — una conexión ya abierta antes del deploy sigue viendo la zona vieja aunque
la migración ya haya corrido.

Si `soporte_master` da otra cosa que `UTC`: el `ALTER DATABASE` puede haber emitido solo un
`RAISE WARNING` por `insufficient_privilege` (42501) — el rol de `DATABASE_URL_MASTER` no es dueño
de la base. Revisá el log de `migrate:master` en la corrida del deploy. No es necesariamente un
fallo: la garantía por conexión (`conUtc()`, ADR-1) sigue cubriendo el 100% del tráfico de la app
aunque el `ALTER DATABASE` no haya podido aplicarse.

**Criterio de aceptación del proposal**: los tickets del barrido preventivo tienen que caer en
**`01:00` hora local**, la hora que declara `CronExpression.EVERY_DAY_AT_1AM` en
`preventivo-sweep.scheduler.ts:44`. Antes del fix caían en `04:00` (la sesión corría en
`America/Sao_Paulo`, +3h respecto de la hora que el cron cree que es). Verificalo al día
siguiente del deploy, contra un ticket generado por el barrido:

```sql
SELECT t.id, t.created_at AT TIME ZONE 'America/Sao_Paulo' AS creado_hora_local
  FROM tickets t
  JOIN tipos_ticket tt ON tt.id = t.tipo_id
 WHERE tt.codigo = 'PREVENTIVO'
 ORDER BY t.created_at DESC
 LIMIT 5;
```

Los dos smokes del repo:

```powershell
cd C:\soporte\backend
& 'C:\nodejs24\node.exe' scripts\post-deploy-smoke-fecha-cierre.mjs
& 'C:\nodejs24\node.exe' scripts\post-deploy-smoke-matriz-permisos.mjs
```

Los dos andan. **`post-deploy-smoke-matriz-permisos.mjs` estuvo roto** entre
`b08066c refactor(auth)!` y su arreglo en el PR #93: consultaba
`usuario_cliente_modulos`, tabla que ese refactor eliminó a propósito, así que fallaba en **todo
deploy** y su rojo se leyó como ruido durante meses. Un chequeo que falla siempre no chequea
nada.

### Verificación de `stock-usado-componentes`

En un tenant activo, con `psql` contra su base:

```sql
\d movimientos_insumo    -- columna condicion NOT NULL default 'NUEVO' y su CHECK
\d componentes_equipo    -- columnas baja_* y el CHECK componentes_equipo_baja_coherente_check
```

Luego, en la ficha de un repuesto con stock previo: el saldo **NUEVO** tiene que ser igual al stock
que tenía antes del deploy y el **USADO** tiene que ser 0.

Si la migración tenant falló en algún tenant, los deploys siguientes fallan con `P3009`: la
recuperación (`prisma migrate resolve --rolled-back` con `--config prisma.tenant.config.ts` y el
`DATABASE_URL_TENANT` de ese tenant, y luego re-correr `deploy.ps1`) es la descrita en "Nota
histórica: precondición de componentes sin repuesto (retirada)".

### Verificación de `repuestos-numero-de-serie`

En un tenant activo, con `psql` contra su base (la base sale de `SELECT nombre, db_name, activo FROM
clientes;` en master, nunca hardcodeada). Todo es de solo lectura:

```sql
\d unidades_insumo      -- existe, con sus CHECK y el índice único parcial por serial normalizado
```

```sql
SELECT
  (SELECT count(*) FROM insumos WHERE seguimiento = 'SERIE')               AS insumos_serie,
  (SELECT count(*) FROM unidades_insumo)                                   AS unidades,
  (SELECT count(*) FROM movimientos_insumo WHERE unidad_id IS NOT NULL)    AS movimientos_con_unidad;
-- esperado tras el deploy: 0, 0, 0
```

```sql
SELECT codigo, entera FROM unidades_medida;
-- UNI y PAR en true
```

Un tenant que renombró `UNI` no recibe `entera = true` de la migración (esta actualiza por código):
se marca a mano. El dueño activa `SERIE` insumo por insumo, con saldo cero, desde el ABM.

### El smoke de la matriz depende del build

Compara el `CHECK` de la base contra el catálogo de **`dist/`**, no de la fuente: lo que importa
es el catálogo que quedó desplegado. **Corrélo después del build**, o va a reportar una deriva
que no existe. Si sale deriva, lo primero es mirar la antigüedad del `dist` antes de sospechar
de la base.

### Verificación manual de la matriz (solo lectura)

Complemento del smoke, útil cuando querés ver el estado y no solo el veredicto:

```sql
SELECT r.codigo AS rol, ucp.modulo, count(*) AS celdas
FROM usuario_cliente_permisos ucp
JOIN membresias m ON m.usuario_id = ucp.usuario_id AND m.cliente_id = ucp.cliente_id
JOIN roles r ON r.id = m.rol_id
WHERE ucp.modulo = 'PREVENTIVO'
GROUP BY 1, 2 ORDER BY 1;
```

Al 2026-08-31 devuelve `COLABORADOR | PREVENTIVO | 4` y **ninguna fila de TECNICO**, que es lo
que manda el ADR-3 de `preventivo-edicion-y-permisos`.

Ver también `docs/post-deploy-matriz-permisos.md`.

---

## Encoding: el script va en ASCII puro

`deploy.ps1` se declara *"100% ASCII"* en su cabecera, y el motivo es real: **PowerShell 5.1 lee
un `.ps1` sin BOM con la codepage del sistema**, así que un acento o un guión largo dentro del
script rompe el parseo.

Si editás `deploy.ps1`, sin acentos — comentarios en español incluidos. Este runbook es `.md` y
no tiene esa restricción.

---

## Huecos declarados de este documento

Escritos a propósito en vez de rellenados con suposiciones. Un runbook que inventa un gotcha es
peor que uno que admite no saberlo.

- **"hoist Prisma"**, citado en la cabecera de `deploy.ps1`. **No hay ningún `.npmrc` en el
  repo** (verificado 2026-08-31 en la raíz, `backend/` y `frontend/`), así que no hay artefacto
  que respalde qué se configuró ni por qué. Quien lo haya resuelto en el VPS: documentarlo acá
  con el síntoma concreto.
- **El error exacto de `EPERM` con `@node-rs/argon2`.** El mecanismo —binario nativo tomado por
  un proceso en Windows— explica por qué la instalación va con los servicios detenidos, pero la
  traza real no está registrada en ningún lado del repo.

Y uno que ya no es hueco: **cómo se accede al VPS** está resuelto arriba, en "Cómo se llega al
VPS". Estuvo sin documentar hasta el 2026-08-31 porque el alias de SSH lleva el nombre de otro
proyecto.
