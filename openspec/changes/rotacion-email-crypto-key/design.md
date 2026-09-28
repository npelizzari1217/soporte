# Design: Rotación de `EMAIL_CRYPTO_KEY`

## Technical Approach

Enfoque (a) del proposal: re-cifrado offline de `clientes.smtp_password_cifrada` con
`OLD_KEY`/`NEW_KEY` explícitas, en una sola transacción, con los servicios detenidos. El
formato `v1:{iv}:{tag}:{ct}` y `AesGcmSecretCipher`
(`backend/src/shared/infrastructure/crypto/aes-gcm-secret-cipher.ts`) no cambian.

Tres piezas, de adentro hacia afuera:

1. `backend/scripts/lib/cifrado-secreto-v1.mjs`: cifrado v1 puro (sin I/O), espejo del adaptador.
2. `backend/scripts/rotar-email-crypto-key.mjs`: clasificación, transacción, round-trip, CLI.
3. `rotate-email-crypto-key.ps1` (raíz): orquesta la ventana en el VPS con el molde de
   `rotate-admin-pw.ps1`, `predeploy-dump.ps1` y `deploy.ps1:147-174`.

---

## Capa donde cae cada pieza (`rules.design`)

| Pieza | Capa | Por qué |
|---|---|---|
| `AesGcmSecretCipher`, `ISecretCipher` | infrastructure / domain (puerto) | **Sin cambios.** Siguen siendo la **fuente única** del formato (`rules.specs`) |
| `scripts/lib/cifrado-secreto-v1.mjs` | infrastructure (espejo) | Fuera de `src/` porque los scripts corren sin build (`backfill-correo-clientes.mjs:23-28`). Es **derivado**: el test de descifrado cruzado lo ata a la fuente |
| `scripts/rotar-email-crypto-key.mjs` | infrastructure, herramienta de operaciones | SQL crudo con `pg`, igual que `backfill-correo-clientes.mjs`. No hay regla de negocio nueva, así que no hay pieza de domain/application |
| `rotate-email-crypto-key.ps1` | operaciones sobre el VPS (§2.2 de `~/proyectos/CLAUDE.md`) | Excepción PowerShell documentada |

**Autorización**: no aplica. No hay borde HTTP (proposal, Out of Scope). La autoridad es ser
administrador del VPS y leer `backend/.env`.

---

## Architecture Decisions

### ADR-1: clasificación por fila, probando primero `OLD_KEY`, todo antes del primer `UPDATE`

| Descifra con `OLD_KEY` | Descifra con `NEW_KEY` | Clase | Acción |
|---|---|---|---|
| sí | — (no se prueba) | `pendiente` | re-cifrar |
| no | sí | `ya_migrada` | no-op explícito, se cuenta |
| no | no | `indescifrable` | aborta la corrida entera |

Un payload malformado (≠ 4 segmentos o prefijo ≠ `v1`) también es `indescifrable`.

**Por qué `OLD_KEY` primero**: es la lectura literal de la spec (*"ya descifra con `NEW_KEY`
(y no con `OLD_KEY`)"*). Que una fila descifre con las dos claves exige una colisión del tag
GCM de 128 bits, así que el orden no cambia el resultado. Lo que sí importa es que la
**clasificación completa ocurre antes del primer `UPDATE`**: una fila indescifrable produce
`ROLLBACK` sin ninguna escritura. No se depende del rollback para deshacer escrituras.

**Alcance**: todas las filas con `smtp_password_cifrada IS NOT NULL`, **incluidas las
soft-deleted**. Si se dejaran afuera, un cliente restaurado quedaría con una credencial
indescifrable. Las filas `NULL` no se leen y solo se cuentan. `smtp_config_updated_at`
**no se toca**: la configuración no cambió, solo la clave que la cifra.

**Códigos de salida del script Node:**

| Exit | Significado | Estado de la base |
|---|---|---|
| 0 | Éxito: rotación confirmada, no-op total, `--dry-run` en verde o `--verificar` en verde | Consistente |
| 2 | Entrada inválida: clave con formato inválido, `OLD == NEW` comparadas **como bytes** (`'AB…'` y `'ab…'` son la misma clave), falta `DATABASE_URL_MASTER` o flag desconocido | Sin conexión |
| 3 | Datos: fila `indescifrable`, round-trip fallido o `UPDATE` con `rowCount ≠ 1` | `ROLLBACK` hecho |
| 1 | Inesperado: conexión o SQL. Si falla el `COMMIT` mismo, el resultado es **ambiguo** (ver ADR-4) | Se intenta `ROLLBACK` |

### ADR-2: el round-trip relee con `SELECT` dentro de la misma transacción

**Choice**: después de los `UPDATE`, `SELECT id, smtp_password_cifrada … WHERE … IS NOT NULL`
en la misma conexión. **Toda** fila no nula tiene que descifrar con `NEW_KEY` y AAD = su `id`.
Además, cada `pendiente` tiene que reproducir el texto plano que se guardó en memoria.

| Opción | Costo | Decisión |
|---|---|---|
| Verificar en memoria | No detecta un valor mal ligado al parámetro, un `UPDATE` sobre otra fila ni una transformación del lado de Postgres | Rechazada |
| Releer con `SELECT` en la transacción | Una consulta más sobre un puñado de filas | **Elegida**: la spec lo exige (*"releer cada fila"*) y verifica lo que Postgres guardó de verdad |

Reglas de implementación que no son opcionales:

- Toda la transacción corre sobre **un solo** `client = await pool.connect()`. Con
  `pool.query` cada sentencia puede ir por una conexión distinta y el `BEGIN` no protege nada.
- El `SELECT` inicial lleva `FOR UPDATE`.
- Cada `UPDATE` lleva `WHERE id = $1 AND smtp_password_cifrada = $2`, con el payload viejo
  en `$2`, y exige `rowCount === 1`.
- `--dry-run` y `--verificar` corren en `BEGIN READ ONLY` y cierran con `ROLLBACK`, así que
  no pueden escribir por construcción.

### ADR-3: la clave viaja al proceso Node por variables de entorno del proceso, nunca por argv

| Opción | Tradeoff | Decisión |
|---|---|---|
| argv | Visible en listados de procesos (`Win32_Process.CommandLine`) | Rechazada |
| stdin | No queda en el bloque de entorno, pero PS 5.1 cambia la codificación al hacer pipe hacia un nativo, y sin precedente en el repo | Rechazada |
| Variables de entorno con alcance acotado | Legibles solo por un administrador del mismo host, que ya puede leer `.env` | **Elegida**: precedente `rotate-admin-pw.ps1:66-71` |

Nombres: `ROTACION_OLD_KEY`, `ROTACION_NEW_KEY` y, para `--verificar`,
`ROTACION_VERIFICAR_KEY`. Son **distintos** de `EMAIL_CRYPTO_KEY` a propósito: el script
**nunca** lee `EMAIL_CRYPTO_KEY` ni llama a `process.loadEnvFile`. Solo lee
`DATABASE_URL_MASTER` del entorno que hereda. Así no puede tomar como `OLD` la clave del
`.env` en el momento en que el `.ps1` lo está reescribiendo. El `.ps1` setea cada variable
justo antes de invocar a Node y la borra en un `finally`.

**Origen de cada clave en el `.ps1`:**

- **OLD**: se lee de `backend/.env`, que tiene que tener **exactamente una** línea
  `EMAIL_CRYPTO_KEY=` con 64 caracteres hexadecimales. Si no, aborta antes de tocar nada.
- **NEW**: se genera en el server con
  `& $NodeExe -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"`,
  que es el precedente de `deploy.ps1:160`. **No existe un parámetro para proveerla**: nunca
  se tipea ni se pega.

Ninguna de las dos claves se imprime. Solo se reporta su longitud.

### ADR-4: orden del `.ps1`, archivo de recuperación y fallos después del `COMMIT`

```
 0. PATH con C:\nodejs24 antes que el resto + guarda de versión (molde deploy.ps1:38-73)
 1. Cargar .env; validar OLD. Abortar si existe backups\rotacion-email-crypto-key-*.PENDIENTE.txt
 2. Generar NEW
 3. Node --dry-run (servicios ARRIBA: solo lectura)       ── falla → exit 1, nada tocado
    [-DryRun del .ps1 termina acá, exit 0]
 4. powershell -File predeploy-dump.ps1 (proceso hijo)    ── falla → el hijo ya rearrancó
                                                            los servicios; exit 1
    ok → servicios DETENIDOS, dump verificado
 5. Escribir backups\rotacion-email-crypto-key-<ts>.PENDIENTE.txt (ASCII):
    OLD, NEW, ruta del dump. Se escribe ANTES del paso que puede hacer COMMIT
 6. Node (corrida real)
      exit 0  → paso 7
      exit ≠0 → Node --verificar con OLD:
                  verde → no hubo COMMIT: borrar PENDIENTE, Start-Service, exit 1
                  rojo  → Node --verificar con NEW:
                            verde → sí hubo COMMIT: seguir al paso 7
                            rojo  → exit 4, servicios DETENIDOS, estado manual
 7. Reescribir .env: todas las líneas a .env.rotacion-tmp, con la línea de la clave
    reemplazada; verificar la cantidad de líneas y que haya una sola línea con NEW;
    [System.IO.File]::Replace(tmp, .env, $null)
                                                          ── falla → exit 3 (ver abajo)
 8. Releer .env del DISCO → Node --verificar con esa clave ── falla → exit 3
 9. Cerrar el archivo de recuperación (ver "Retención de secretos"): escribir
    rotacion-email-crypto-key-<ts>.txt SOLO con OLD + ruta del dump, verificarlo,
    y recién ahí borrar PENDIENTE; Start-Service; los dos servicios en Running
```

**Por qué el dry-run va antes del dump**: si falla, no hubo caída ni un dump inútil. La
corrida real revalida todo adentro de la transacción (ADR-2), así que el dry-run es un
adelanto del resultado, no la garantía. Por eso no hay riesgo en que los datos cambien
entre el dry-run y la corrida real.

**`predeploy-dump.ps1` se reutiliza sin cambios**. Se verificó su interfaz: un solo switch,
`-DryRun`; exit 0/1; en la corrida real deja los servicios detenidos; si falla, borra el dump
y los rearranca (`predeploy-dump.ps1:43-45,198-310`). Se lo invoca como proceso hijo, igual
que el re-exec de `deploy.ps1:124`. Así su `exit` y su carga de `.env` no contaminan el
proceso padre.

**El archivo `PENDIENTE` es lo que hace que `NEW_KEY` no se pierda nunca.** Existe en disco
desde antes del primer instante en que la base puede quedar en `NEW_KEY`. Si el `.ps1` muere
entre el `COMMIT` y la reescritura del `.env` (corte de luz, `Ctrl+C`), la clave sigue ahí.
El paso 1 bloquea una nueva corrida mientras exista, porque re-correr generaría otra `NEW`
y la corrida chocaría contra la primera. El choque sería seguro, porque la fila quedaría
`indescifrable` y habría `ROLLBACK`, pero no sirve de nada. Se guarda en `backups\`, junto
al dump, que es la regla de `DEPLOY-VPS-runbook.md:440-442`.

**Retención de secretos: cuando la rotación termina bien, `NEW` sale del archivo.** Durante la
ventana, el archivo `PENDIENTE` guarda OLD y NEW; ese comportamiento no cambia. En el paso 9,
NEW ya vive en `backend/.env` y está verificada contra la base en el paso 8, así que una
segunda copia en disco no sirve para nada y solo agrega exposición. El archivo permanente
guarda únicamente lo que hace falta para restaurar el dump de esta ventana, que está cifrado
con OLD:

- Se escribe **completo, como un archivo nuevo** (`Set-Content -Encoding ascii`), con tres
  líneas: `OLD_KEY=<old>`, `DUMP=<ruta>` y `ROTADA_EL=<ts>`. No se edita el `PENDIENTE` en
  el lugar, así que NEW nunca llega al archivo permanente.
- Se verifica **antes** de borrar el `PENDIENTE`: tiene que haber exactamente una línea
  `^OLD_KEY=[0-9a-fA-F]{64}$` y ninguna línea `NEW_KEY`, y el valor de `OLD_KEY` tiene que
  coincidir con el OLD en memoria. Si la verificación falla, el `PENDIENTE` se conserva y el
  `.ps1` sale con exit 3. La base y el `.env` ya están bien, así que el operador solo tiene
  que cerrar este paso a mano.
- Después se borra el `PENDIENTE` con `Remove-Item`.
- Nada de esto imprime una clave: la consola solo muestra las rutas de los archivos.

**Quién puede leer los archivos de recuperación.** Los dos, el `PENDIENTE` y el permanente,
se crean en `C:\soporte\backups\`, junto a los dumps. Apenas se crea cada uno, se le cortan
los permisos heredados y quedan legibles solo para `Administrators` y `SYSTEM`:
`icacls <archivo> /inheritance:r /grant:r "*S-1-5-32-544:F" "*S-1-5-18:F"`. Se usan los SID
en vez de los nombres para que funcione aunque Windows esté en otro idioma. Se chequea
`$LASTEXITCODE`. Si `icacls` falla, el `.ps1` aborta **antes** de escribir la clave en el
archivo: primero crea el archivo vacío, después le aplica el ACL y recién ahí escribe el
contenido.

**Cuánto tiempo se guardan.** La §5 del runbook (WU3) documenta que el operador puede borrar
`rotacion-email-crypto-key-<ts>.txt` recién cuando ya no se conserve el dump de esa ventana.
Mientras ese dump exista, OLD es la única forma de descifrar las credenciales SMTP que trae.
Nunca se borra un archivo de recuperación antes que su dump.

**Si falla el `.env` después del `COMMIT` (exit 3)**: los servicios **quedan detenidos**.
Arrancarlos con `OLD` en el `.env` degradaría el envío de correo sin avisar. Mensaje en
consola, sin claves:

> `BASE YA ROTADA A LA CLAVE NUEVA. backend/.env NO se actualizo. Clave en <ruta PENDIENTE>. NO re-corras este script. Ver runbook §5, "Recuperacion".`

La recuperación manual del runbook consiste en copiar la línea `NEW` del archivo `PENDIENTE`
al `.env`, correr el comando `--verificar` que documenta el runbook, renombrar `PENDIENTE` y
arrancar los servicios.

**Exit codes del `.ps1`**: 0 = OK; 1 = no se hizo nada (base en `OLD`, servicios arriba);
3 = base en `NEW` y `.env` sin actualizar; 4 = estado ambiguo que requiere intervención. Cada
llamada a un nativo chequea `$LASTEXITCODE`, con el molde `AssertOk` de `deploy.ps1:51-55`.

### ADR-5: módulo compartido nuevo en `scripts/lib/`; `backfill-correo-clientes.mjs` no se toca

| Opción | Tradeoff | Decisión |
|---|---|---|
| Importar desde `backfill-correo-clientes.mjs` | Ata una herramienta viva a un script one-off con nombres propios del backfill | Rechazada |
| Una tercera copia dentro del script de rotación | Deja tres implementaciones del mismo cifrado | Rechazada |
| Extraer a `lib/` y migrar también el backfill | Toca un archivo que el proposal no lista en Affected Areas | Queda como seguimiento |
| **`scripts/lib/cifrado-secreto-v1.mjs` nuevo y puro** | El backfill conserva su copia | **Elegida** |

`lib/` ya aloja módulos puros con spec propio (`entorno-claves.mjs`, `guardarrail-host.mjs`).
El glob `scripts/**/*.mjs` de `backend/eslint.config.js:306-320` lo lintea sin darlo de alta
en ningún lado. Las funciones reciben la clave como `Buffer` ya validado, así que la
validación ocurre **una sola vez**, en el borde del CLI.

---

## Data Flow

```
rotate-email-crypto-key.ps1
  .env ──OLD──┐   node -e randomBytes ──NEW──┐
              ▼                               ▼
   env ROTACION_OLD_KEY / ROTACION_NEW_KEY (alcance: la invocación)
              ▼
rotar-email-crypto-key.mjs ──pool.connect()──► soporte_master.clientes
  BEGIN → SELECT … FOR UPDATE → clasificar (lib descifrar OLD / NEW)
        → UPDATE … WHERE id AND payload_viejo (lib cifrar NEW, AAD=id)
        → SELECT de relectura → descifrar NEW == texto plano → COMMIT | ROLLBACK
  stdout: contadores + ids de clientes (UUID). NUNCA claves ni texto plano
```

---

## File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `backend/scripts/lib/cifrado-secreto-v1.mjs` | Create | `leerClaveHex`, `cifrarV1`, `descifrarV1` (puro) |
| `backend/scripts/lib/cifrado-secreto-v1.spec.ts` | Create | Descifrado cruzado en las dos direcciones contra `AesGcmSecretCipher`, AAD ajeno y clave ajena |
| `backend/scripts/rotar-email-crypto-key.mjs` | Create | `validarClaves`, `clasificarFila`, `ejecutarRotacion(pool, opciones, deps)`, `main()` con guarda `import.meta.url` (molde `backfill-correo-clientes.mjs:250`) |
| `backend/scripts/rotar-email-crypto-key.spec.ts` | Create | Validación (longitud, hex, igualdad por bytes) y tabla de ADR-1 |
| `backend/scripts/rotar-email-crypto-key.integration.spec.ts` | Create | Base efímera; todos los escenarios de la spec |
| `backend/scripts/ps1-ascii.spec.ts` | Create | Todo `*.ps1` de la raíz: bytes ≤ 0x7F y sin BOM (hoy los tres existentes pasan, verificado) |
| `rotate-email-crypto-key.ps1` | Create | ADR-3 y ADR-4, `-DryRun` |
| `DEPLOY-VPS-runbook.md` | Modify | §5 reescrita: uso, exit codes, recuperación, respaldo de las claves |
| `README.md` | Modify | Fila de `EMAIL_CRYPTO_KEY` (`:155`): remite a `rotate-email-crypto-key.ps1` |
| `AesGcmSecretCipher`, `deploy.ps1`, `predeploy-dump.ps1`, `backfill-correo-clientes.mjs` | Sin cambios | Proposal, Out of Scope y ADR-5 |

---

## Interfaces / Contracts

```
node scripts/rotar-email-crypto-key.mjs [--dry-run | --verificar]
  env: DATABASE_URL_MASTER (siempre)
       ROTACION_OLD_KEY + ROTACION_NEW_KEY   (rotación y --dry-run)
       ROTACION_VERIFICAR_KEY                (--verificar: toda fila no nula descifra con ella)
  stdout: migradas=N ya_migradas=N sin_config=N | ids de clientes que fallaron
  exit:   0 | 1 | 2 | 3   (ADR-1)
```

```js
// ejecutarRotacion(pool, { oldKey, newKey, modo: 'rotar' | 'dry-run' }, deps = { cifrar: cifrarV1 })
// deps.cifrar existe SOLO para que el test inyecte un ciphertext corrupto en la
// segunda fila y fuerce el fallo del round-trip después de un UPDATE real.
```

---

## Testing Strategy

| Capa | Qué | Cómo |
|---|---|---|
| Unit | Interoperabilidad byte a byte | `cifrado-secreto-v1.spec.ts`, molde `backfill-correo-clientes.spec.ts:21-64` (setea `process.env.EMAIL_CRYPTO_KEY` para `AesGcmSecretCipher`) |
| Unit | Validación de claves y clasificación | `rotar-email-crypto-key.spec.ts`, sin base |
| Integración | Rotación completa; `--dry-run` sin cambios (payloads idénticos byte a byte); fila indescifrable → nada cambia; re-corrida → no-op; filas mixtas; `NULL` intacto; AAD ligado (el ciphertext de A no descifra con el `id` de B); round-trip fallido vía `deps.cifrar` → `ROLLBACK` total; `--verificar` | Base efímera, molde `backfill-correo-clientes.integration.spec.ts`: `PostgresAdminService`, replay hasta `20260820160000_add_cliente_smtp_config`, `pool.end()` antes de `dropDatabase()`. No toca `soporte_master_test`, así que no necesita `usarLockMasterTest()` |
| Integración (proceso) | Exit codes 0/2/3 y **ausencia** de claves y texto plano en stdout+stderr, en éxito, no-op y fallo | `spawn(process.execPath, [script])` contra la misma base efímera |
| Estático | `.ps1` ASCII y sin BOM | `ps1-ascii.spec.ts` |
| Manual (VPS) | El `.ps1` completo | `-DryRun` contra producción. No hay forma de ejecutar el `.ps1` desde WSL: es un hueco declarado |

---

## Threat Matrix

| Boundary | Applicability |
|---|---|
| Documentation-like paths | N/A: no se clasifican archivos como ejecutables |
| Git repository selection | N/A: no se invoca git |
| Commit state | N/A |
| Push state | N/A |
| PR commands | N/A |

El borde real de proceso es el paso de secretos al hijo Node. Lo cubren ADR-3 y el test de
proceso de la Testing Strategy, que funciona como RED obligatorio para `sdd-tasks`.

---

## Migration / Rollout

Sin migración de schema. La rotación es una operación manual, en una ventana, con el
`.ps1`. Rollback de código: `git revert`. Rollback de datos: restaurar el dump del paso 4 con
la `OLD` del archivo de recuperación, o re-correr el script con las claves invertidas.

## Work Units (el forecast formal es de `sdd-tasks`)

| # | Unidad | Líneas aprox. |
|---|---|---|
| 1 | `lib/cifrado-secreto-v1` + parte pura de la rotación (validación, clasificación) + sus dos specs | ~330 |
| 2 | Transacción, `--dry-run`, `--verificar`, `main()` + integración y test de proceso | ~400 |
| 3 | `.ps1` (incluye el ACL y el cierre del archivo de recuperación) + `ps1-ascii.spec.ts` + runbook §5 (con la retención) + `README.md:155` | ~345 |

Total estimado: unas 1075 líneas. Hace falta encadenar los PRs.

## Open Questions

- [x] **Resuelta**: el modo `--verificar` (ADR-4, pasos 6 y 8) se está agregando a la spec en
  paralelo.
- [ ] **No bloqueante**: `predeploy-dump.ps1` nombra su carpeta `utc-backfill-<ts>`. El dump
  de la rotación hereda ese nombre engañoso. El archivo de recuperación registra la ruta
  real; renombrar la carpeta queda como seguimiento.
- [ ] **A validar en el VPS**: `[System.IO.File]::Replace` sobre `backend/.env` en NTFS.
  Si falla, el paso 7 falla antes de tocar el `.env`, que es el camino exit 3 ya diseñado.
