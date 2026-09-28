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

## Status

Tareas 1.1-1.7 completas (WU1a y WU1b). Quedan pendientes WU2a, WU2b y WU3 (ver `tasks.md`).
