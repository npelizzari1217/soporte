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

### Precondición: calendario master = default (D18, `sdd/horario-laboral-por-cliente`)

**`deploy.ps1` ya la verifica sola** (paso 7 de "Qué hace, en orden"), con
`scripts/check-calendario-master-default.mjs` — solo lectura, aborta el deploy si difiere. La
consulta manual de abajo sirve de diagnóstico si ese paso aborta, o para chequear antes sin
esperar a la corrida:

```sql
SELECT dia_semana, apertura_minuto, cierre_minuto
FROM calendario_laboral_dias ORDER BY dia_semana;
```

Salida esperada, exacta (7 filas — lun-vie 9-18hs, sáb/dom sin horario):

```text
 dia_semana | apertura_minuto | cierre_minuto
------------+-----------------+---------------
          0 |                 |
          1 |             540 |          1080
          2 |             540 |          1080
          3 |             540 |          1080
          4 |             540 |          1080
          5 |             540 |          1080
          6 |                 |
```

Cualquier diferencia bloquea el seed de `calendario_laboral_dias_cliente` (WU-1): ese seed copia
el default de master a cada tenant, y una master editada a mano copiaría un horario que ningún
cliente eligió.

| Qué | Valor |
|---|---|
| Repo en el VPS | `C:\soporte` |
| Servicios (NSSM) | `soporte-backend`, `soporte-frontend` |
| Puertos internos | backend **3101**, frontend **3100** |
| Node | `C:\nodejs24\node.exe` (v24) — **hay un segundo Node en el PATH**, ver abajo |
| Rama | `main` (el script aborta si estás en otra) |
| Package manager | `corepack pnpm` — **pnpm 11.18.0**, fijado en `packageManager` de los dos `package.json` |

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
   esta corrida es el re-ejecutado del paso 4.
2. **Hash de los lockfiles y del propio script**, antes del pull.
3. **`git pull --ff-only origin main`**.
4. **Si el pull cambió `deploy.ps1`**, se re-ejecuta la versión nueva y sale, pasándole
   `-RollbackCommit` con el commit previo al pull. Es lo único del arranque original que la
   instancia nueva no puede recalcular, porque su pre-flight ya corre con el pull hecho.
5. **Si cambió algún lockfile**, aborta y pide instalación manual.
6. **Carga `backend/.env`** al entorno del proceso; exige `DATABASE_URL_MASTER`.
7. **Precondición: calendario master = default** (D18, `sdd/horario-laboral-por-cliente`) —
   corre `node scripts/check-calendario-master-default.mjs` (solo lectura) y aborta si las 7
   filas de `calendario_laboral_dias` en master no son exactamente el default. Ver el detalle
   más abajo, "Precondición: calendario master = default".
8. **`EMAIL_CRYPTO_KEY`**: la genera **solo si no existe**.
9. **Builds**: `generate:master`, `generate:tenant`, build del backend, build del frontend.
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

### 5. `EMAIL_CRYPTO_KEY` no se rota

Cifra en reposo la contraseña SMTP de cada cliente. Se genera **una sola vez** y, si existe, no
se toca.

**No es como `JWT_SECRET`**: rotar el JWT solo invalida sesiones; **regenerar esta clave
convierte toda credencial guardada en basura indescifrable.** Una rotación real exige una
migración de re-cifrado — por eso el payload lleva el prefijo de versión `v1:`.

Se genera en el server y nunca se imprime: solo se reporta la longitud.

> **Respaldala junto con la base.** Un backup de la base sin esta clave no restaura las
> credenciales SMTP.

También hay una trampa de escritura resuelta: la clave se agrega **reescribiendo el `.env`
entero**, no con `Add-Content`. Si el archivo no termina en salto de línea, `Add-Content` pega el
valor al final de la última variable y corrompe dos cosas de una. Pasó el 2026-08-20 contra
`ROOT_ADMIN_PASSWORD`.

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
