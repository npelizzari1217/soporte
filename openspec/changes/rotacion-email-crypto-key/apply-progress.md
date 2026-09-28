# Apply Progress: Rotación de `EMAIL_CRYPTO_KEY`

## Mode

Standard (TDD disabled — feature, not bugfix).

## Completed Work Units

### WU1a + WU1b: Cifrado puro (PR 1 → `main`) y validación/clasificación (PR 2 → rama de PR 1)

- [x] 1.1 `backend/scripts/lib/cifrado-secreto-v1.mjs` creado: `leerClaveHex(hex)`,
      `cifrarV1(claveBuffer, textoPlano, aad)`, `descifrarV1(claveBuffer, payload, aad)`.
      Formato `v1:{iv_b64}:{tag_b64}:{ct_b64}`, AES-256-GCM, espejo de
      `AesGcmSecretCipher` pero recibiendo la clave ya decodificada como `Buffer` (la
      validación de formato ocurre una sola vez, en `validarClaves`).
- [x] 1.2 `backend/scripts/lib/cifrado-secreto-v1.spec.ts` creado: descifrado cruzado en
      las dos direcciones contra `AesGcmSecretCipher`, payload rechazado con AAD ajeno,
      payload rechazado con clave ajena, más `leerClaveHex()` con entradas inválidas.
- [x] 1.3 `validarClaves(oldKey, newKey)` agregado a `rotar-email-crypto-key.mjs`: exige
      64 caracteres hexadecimales para cada clave y compara `OLD !== NEW` **como bytes**
      (vía `Buffer.equals`), así que `'AB…'` y `'ab…'` cuentan como la misma clave. Lanza
      `Error` antes de tocar cualquier conexión a la base — todavía no existe ninguna en
      este archivo.
- [x] 1.4 `clasificarFila(fila, oldKeyBuf, newKeyBuf)` agregado: implementa la tabla
      ADR-1 probando primero `OLD_KEY`; si falla, prueba `NEW_KEY`; si ambas fallan,
      `indescifrable`. Un payload malformado (≠4 segmentos o prefijo ≠ `v1`) cae en
      `indescifrable` porque `descifrarV1` lanza en los dos intentos — no hizo falta un
      chequeo de formato separado.
- [x] 1.5 `backend/scripts/rotar-email-crypto-key.spec.ts` creado: `validarClaves()`
      (longitud, hex, igualdad por bytes incluida mayúsc./minúsc.) y `clasificarFila()`
      (las tres clases de ADR-1, AAD equivocado, y cuatro variantes de payload
      malformado). Usa `AesGcmSecretCipher` con `process.env.EMAIL_CRYPTO_KEY` para
      generar los payloads de fixture, igual que el molde
      `backfill-correo-clientes.spec.ts`.
- [x] 1.6 Verificación de la unidad — ver tabla de evidencia abajo.

## Files Changed

| File | Action | What Was Done |
|------|--------|----------------|
| `backend/scripts/lib/cifrado-secreto-v1.mjs` | Created | Cifrado v1 puro (`leerClaveHex`, `cifrarV1`, `descifrarV1`) |
| `backend/scripts/lib/cifrado-secreto-v1.spec.ts` | Created | Descifrado cruzado con `AesGcmSecretCipher`, rechazo por AAD/clave ajena |
| `backend/scripts/rotar-email-crypto-key.mjs` | Created | `validarClaves`, `clasificarFila` (sin transacción ni CLI — llegan en WU2a) |
| `backend/scripts/rotar-email-crypto-key.spec.ts` | Created | Validación de claves y tabla completa de clasificación ADR-1 |
| `openspec/changes/rotacion-email-crypto-key/tasks.md` | Modified | 1.1-1.6 marcadas `[x]` |

## Deviations from Design

None — implementación matches design (ADR-1, ADR-5). `rotar-email-crypto-key.mjs` en
esta unidad solo contiene `validarClaves` y `clasificarFila`, tal como delimita WU1 en
`tasks.md`; `ejecutarRotacion`, `--dry-run`, `--verificar` y `main()` quedan para WU2a/2b
sobre el mismo archivo.

## Issues Found

None.

## Work Unit Evidence (WU1)

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm vitest run scripts/lib/cifrado-secreto-v1.spec.ts scripts/rotar-email-crypto-key.spec.ts` → 2 files, 25 tests passed |
| Runtime harness command/scenario and exact result | N/A — funciones puras, sin I/O ni base de datos (tal como declara la tabla de work units de `tasks.md` para esta unidad) |
| Rollback boundary | `backend/scripts/lib/cifrado-secreto-v1.mjs`, `backend/scripts/lib/cifrado-secreto-v1.spec.ts`, `backend/scripts/rotar-email-crypto-key.mjs`, `backend/scripts/rotar-email-crypto-key.spec.ts` son archivos NUEVOS sin wiring hacia código existente; revertir este commit los borra sin tocar nada más |

## Verification (backend/)

| Command | Result |
|---|---|
| `pnpm lint` | Clean — 0 errors, 0 warnings |
| `pnpm typecheck` | Clean — 0 errors (`scripts/**/*.ts` fuera del include de `tsconfig.typecheck.json`, igual que `backfill-correo-clientes.spec.ts` ya existente) |
| `pnpm vitest run scripts/lib/cifrado-secreto-v1.spec.ts scripts/rotar-email-crypto-key.spec.ts` | 2 test files passed, 25/25 tests passed |
| `pnpm vitest run scripts/backfill-correo-clientes.spec.ts` | 1 test file passed, 12/12 tests passed (sin regresión) |
| `pnpm test` (suite completa) | 368/466 test files passed, 98 failed; 4326/5442 tests passed, 52 failed, 1064 skipped. **Los 98 archivos fallidos son exclusivamente `*.integration.spec.ts`/`*.e2e.spec.ts` que dependen de Postgres** (`ECONNREFUSED 127.0.0.1:5432`, `PrismaClientKnownRequestError: Can't reach database server`, `Connection terminated unexpectedly` en `lock-master-test`) — ambiente sin Postgres levantado, no causado por WU1. Ningún archivo de WU1 aparece en la lista de fallos |

## Workload / PR Boundary

- Mode: chained PR slice (stacked-to-main)
- La unidad WU1 original sumó 421 líneas de código y tests (524 contando `openspec/`), por
  encima del presupuesto de 400. Por decisión del dueño del repo (2026-09-28) se partió en
  dos commits y dos PRs:
  - **WU1a** (PR 1 → `main`, rama `feat/rotacion-email-crypto-key-wu1`):
    `lib/cifrado-secreto-v1.mjs` + su spec de descifrado cruzado (212 líneas).
  - **WU1b** (PR 2 → rama de PR 1, rama `feat/rotacion-email-crypto-key-wu1b`):
    `validarClaves`/`clasificarFila` en `rotar-email-crypto-key.mjs` + su spec (209 líneas).
- Cadena resultante: WU1a → WU1b → WU2a → WU2b → WU3.

## WU2a: Transacción real + `--dry-run` (PR 3 → rama de PR 2) — `size:exception`

- `ejecutarRotacion(pool, opciones, deps = {})` agregado a `rotar-email-crypto-key.mjs`: un
  solo `client = await pool.connect()`, `BEGIN` (`BEGIN READ ONLY` en dry-run),
  `SELECT ... FOR UPDATE` (omitido en dry-run — Postgres rechaza `FOR UPDATE` en una
  transacción de solo lectura), clasifica con `clasificarFila` (WU1b), `UPDATE ... WHERE
  id=$1 AND smtp_password_cifrada=$2` exigiendo `rowCount===1`, releída de TODAS las filas
  no nulas verificando `NEW_KEY` + texto plano, `COMMIT`/`ROLLBACK`. Alcance: todas las filas
  con `smtp_password_cifrada IS NOT NULL` sin filtrar `deleted_at` (ADR-1).
- `--dry-run`: mismo recorrido de clasificación, pero el round-trip de las `pendiente` ocurre
  SOLO en memoria (cifra con `deps.cifrar`/`cifrarV1`, descifra en el momento, compara) — nunca
  emite `UPDATE`; la transacción siempre cierra con `ROLLBACK`.
- CLI/`main()` con guarda `import.meta.url` (molde `backfill-correo-clientes.mjs:250`):
  `parsearArgs` solo acepta `--dry-run`; lee `ROTACION_OLD_KEY`/`ROTACION_NEW_KEY` (nunca
  `EMAIL_CRYPTO_KEY`, ADR-3); exit codes 0 (éxito) / 2 (entrada inválida — flag desconocido,
  falta `DATABASE_URL_MASTER`, clave inválida) / 3 (dato — fila indescifrable, `UPDATE`
  inesperado, round-trip fallido) / 1 (inesperado — conexión/SQL, `COMMIT` ambiguo).
- `rotar-email-crypto-key.integration.spec.ts` creado: DB efímera (molde
  `backfill-correo-clientes.integration.spec.ts`, `PostgresAdminService`, replay hasta
  `20260820160000_add_cliente_smtp_config`, `pool.end()` antes de `dropDatabase()`). 8
  escenarios, uno por bullet de la task 2a.4: rotación completa, `ROLLBACK` ante fila
  indescifrable (incluida una fila `pendiente` en la misma corrida, para probar que el
  `ROLLBACK` también la deshace), `--dry-run` sin cambios (byte a byte), re-corrida no-op,
  filas mixtas OLD/NEW, fila `NULL` intacta, AAD ligado (ciphertext de A no descifra con el
  `id` de B), round-trip fallido inyectado vía `deps.cifrar` → `ROLLBACK` total. `afterEach`
  hace `DELETE FROM clientes` entre tests — la tabla `membresias` tiene FK hacia `clientes`, así
  que un `TRUNCATE` sin `CASCADE` la rechaza, y cada corrida de `ejecutarRotacion()` mira TODA
  la tabla (una fila indescifrable que sobreviviera de un test anterior forzaría `ROLLBACK` en
  el siguiente).

### Tamaño: `size:exception` aceptada por el dueño del repo (2026-09-28)

La unidad suma **488 líneas** de código y tests: 231 en `rotar-email-crypto-key.mjs` (diff
sobre WU1b) y 257 en `rotar-email-crypto-key.integration.spec.ts`. La estimación era ~230.
La diferencia viene de los 8 escenarios de integración que exige la task 2a.4 contra una
única función transaccional (ADR-2), que no se puede partir sin separar el código de su
cobertura. Se descartó partir el suite de tests: `main` habría recibido la transacción con
3 de los 8 escenarios hasta que llegara la unidad siguiente.

### Work Unit Evidence (WU2a)

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm vitest run scripts/rotar-email-crypto-key.integration.spec.ts scripts/rotar-email-crypto-key.spec.ts scripts/lib/cifrado-secreto-v1.spec.ts` → 3 files, 33/33 tests passed |
| Runtime harness command/scenario and exact result | Base efímera de Postgres real (`PostgresAdminService`, `soporte-postgres-master`); los 8 escenarios de `rotar-email-crypto-key.integration.spec.ts` corrieron contra ella — 8/8 passed |
| Rollback boundary | Un solo commit en `feat/rotacion-email-crypto-key-wu2a`; `git revert` lo deshace sin tocar WU1a/WU1b |

### Verification (backend/)

| Command | Result |
|---|---|
| `pnpm lint` | Clean — 0 errors, 0 warnings |
| `pnpm typecheck` | Clean — 0 errors |
| `pnpm vitest run backend/scripts/rotar-email-crypto-key.integration.spec.ts` (+ specs de WU1a/WU1b) | 3 test files passed, 33/33 tests passed |
| `pnpm test` (suite completa, Postgres arriba) | 467/467 test files passed, 5450/5450 tests passed, exit code 0 |

## WU2b: Modo `--verificar` + test de proceso (PR 4 → rama de PR 3)

- `validarClaveVerificar` (formato de `ROTACION_VERIFICAR_KEY`) y `ejecutarVerificacion(pool,
  { verificarKeyBuf })` agregados a `rotar-email-crypto-key.mjs`: `BEGIN READ ONLY` …
  `ROLLBACK` (nunca escribe por construcción), relee filas no nulas y confirma que descifran
  con la clave dada (AAD = `id`); exit 0 si todas descifran, exit 3 (mismo código que una
  fila `indescifrable`) si al menos una falla, exit 1 ante error de conexión/SQL. El mensaje
  de fallo solo lleva el `id`, nunca clave ni texto descifrado.
- `parsearArgs`/`main()` extendidos: `--verificar` (mutuamente excluyente con `--dry-run`)
  bifurca antes de tocar `ROTACION_OLD_KEY`/`ROTACION_NEW_KEY` y lee
  `ROTACION_VERIFICAR_KEY` en su lugar (ADR-3).
- `rotar-email-crypto-key.integration.spec.ts`: +2 escenarios `--verificar` (éxito sin
  escritura, fallo sin escritura). `rotar-email-crypto-key.spec.ts`: +3 casos unitarios de
  `validarClaveVerificar`.
- `rotar-email-crypto-key.proceso.spec.ts` creado: spawnea el script real contra una DB
  efímera propia. 5 tests: rotación éxito + re-corrida no-op (0), fila indescifrable (3),
  `--verificar` éxito (0) y fallo (3), entrada inválida (2). Cada corrida afirma que ninguna
  clave ni texto plano aparece en stdout+stderr (ADR-3).

**Corrección tras la verificación independiente (riesgo alto):** faltaba cubrir el exit 2
que promete 2b.3 (se agregó el caso de entrada inválida), y `main()` llamaba a
`process.loadEnvFile('.env')` contra lo que dice ADR-3 (se quitó del commit de WU2a).

Verificación: `pnpm lint` y `pnpm typecheck` limpios; los 4 specs del script en verde;
`pnpm test` completo en verde con Postgres arriba.

## WU3: `.ps1` operativo + runbook + README (PR 5 → rama de PR 4)

- `rotate-email-crypto-key.ps1` creado (ADR-3/ADR-4): pasos 0-9, `-DryRun`, env vars
  `ROTACION_*`/`DATABASE_URL_MASTER` seteadas justo antes de cada invocación de Node y
  borradas en `finally`, archivo `PENDIENTE` con ACL (`icacls` SIDs
  `S-1-5-32-544`/`S-1-5-18`) ANTES de la corrida real, árbol de recuperación
  `--verificar OLD/NEW` ante fallo, reescritura de `.env` vía temporal +
  `[System.IO.File]::Replace`, archivo permanente con solo `OLD_KEY`+`DUMP`+fecha.
- `backend/scripts/ps1-ascii.spec.ts` creado: los 4 `*.ps1` de la raíz, ASCII puro y sin BOM.
- `DEPLOY-VPS-runbook.md` §5 reescrita (uso, exit codes, recuperación manual, retención) y
  `README.md:155` actualizado.

### Work Unit Evidence (WU3)

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm vitest run scripts/ps1-ascii.spec.ts` → 1 file, 5/5 tests passed |
| Runtime harness command/scenario y exact result | N/A — el runtime real es el VPS (`-DryRun` manual); hueco declarado en `tasks.md`, no ejecutable desde WSL |
| Rollback boundary | `rotate-email-crypto-key.ps1` y `ps1-ascii.spec.ts` son archivos nuevos; el runbook y el README son ediciones aditivas de una sección/fila — revertir el commit no toca WU1/WU2 |

### Verification (backend/)

| Command | Result |
|---|---|
| `pnpm lint` | Clean — 0 errors |
| `pnpm typecheck` | Clean — 0 errors |
| `pnpm vitest run scripts/ps1-ascii.spec.ts` | 1 file, 5/5 passed |
| `pnpm test` | 469/469 files, 5465/5465 tests passed, exit 0 |
| `file rotate-email-crypto-key.ps1` / byte scan | ASCII text, sin BOM, sin bytes > 0x7F |
| `pwsh` parse de sintaxis | No disponible en WSL — hueco declarado, no se instaló |

## Status

Ciclo completo: WU1a-WU3 completas y commiteadas. Ver `tasks.md` — todas las tareas `[x]`.
