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

| Qué | Valor |
|---|---|
| Repo en el VPS | `C:\soporte` |
| Servicios (NSSM) | `soporte-backend`, `soporte-frontend` |
| Puertos internos | backend **3101**, frontend **3100** |
| Node | `C:\nodejs22\node.exe` |
| Rama | `main` (el script aborta si estás en otra) |
| Package manager | `corepack pnpm` — **pnpm 11.18.0**, fijado en `packageManager` de los dos `package.json` |

---

## Qué hace, en orden

1. **Pre-flight** — exige estar en `main` y anota el commit actual como punto de rollback.
2. **Hash de los lockfiles y del propio script**, antes del pull.
3. **`git pull --ff-only origin main`**.
4. **Si el pull cambió `deploy.ps1`**, se re-ejecuta la versión nueva y sale.
5. **Si cambió algún lockfile**, aborta y pide instalación manual.
6. **Carga `backend/.env`** al entorno del proceso; exige `DATABASE_URL_MASTER`.
7. **`EMAIL_CRYPTO_KEY`**: la genera **solo si no existe**.
8. **Builds**: `generate:master`, `generate:tenant`, build del backend, build del frontend.
9. **Detiene los servicios**, migra master, migra el fan-out a tenants.
10. **Backfill de config de correo** — solo la primera vez, con dos guardas.
11. **Arranca los servicios**, espera 10 s y exige `Running`.
12. **Smoke interno** contra 3101 y 3100.

### Por qué los builds van ANTES de migrar

Está escrito en el script y no se mueve. Migrar primero deja al **código viejo corriendo contra
el schema nuevo** durante los dos builds — varios minutos. Con una migración aditiva no se nota;
con una que renombra una columna que el código viejo consulta, **cada request falla mientras la
app parece estar arriba**, que es peor que una caída franca.

Deteniendo los servicios justo antes de migrar, esa ventana se reduce a una caída controlada de
segundos.

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
Stop-Service soporte-backend, soporte-frontend -Force
cd C:\soporte\backend  ; corepack pnpm install
cd C:\soporte\frontend ; corepack pnpm install
cd C:\soporte          ; .\deploy.ps1
```

**Con los servicios DETENIDOS**, y el motivo es concreto: `@node-rs/argon2` es un módulo nativo,
y en Windows un binario que un proceso tiene abierto no se puede reemplazar — la instalación
falla con `EPERM`. El script cita este caso en su mensaje de aborto.

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

> El rollback **no revierte migraciones**. Si el deploy alcanzó a migrar, volver el código atrás
> deja código viejo contra schema nuevo. Con migraciones aditivas suele andar; con una
> destructiva, no. Mirá qué migró antes de decidir.

---

## Después del deploy

**El smoke interno del script es contra `localhost`**: prueba que los servicios responden, no que
el sitio esté publicado. Verificá desde afuera:

```bash
curl -sL -o /dev/null -w "%{http_code} %{url_effective}\n" https://soporte.sesitec.net/
# esperado: 200 https://soporte.sesitec.net/login  (la raíz redirige con 307)
```

Los dos smokes del repo:

```powershell
cd C:\soporte\backend
& 'C:\nodejs22\node.exe' scripts\post-deploy-smoke-fecha-cierre.mjs
& 'C:\nodejs22\node.exe' scripts\post-deploy-smoke-matriz-permisos.mjs
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
