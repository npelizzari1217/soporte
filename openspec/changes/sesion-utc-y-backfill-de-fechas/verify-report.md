```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:721c8c7012877e6aeadcf8d571b7272c835c494c9c68aa326b26a1d2d97f8c64
verdict: pass
blockers: 0
critical_findings: 0
requirements: 7/7
scenarios: 8/8
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:69d43d41c139aec30dc794fd243fd9eb4ecbde3122f3fb73af4efe2434d27433
build_command: pnpm typecheck && pnpm lint
build_exit_code: 0
build_output_hash: sha256:88249a5ad1fb258c1a5bee87d73fa205d9a29c2d0b23e5983a95663d7abbc4a3
```

## Verification Report

**Change**: sesion-utc-y-backfill-de-fechas (issue #173)
**Version**: spec `fechas-sesion-utc` (7 requisitos / 8 escenarios)
**Mode**: Strict TDD (inyectado por el orquestador; `strict_tdd: false` del `config.yaml` aplica solo a features)
**Ronda**: 3 — remedia la evidencia fallida `sha256:446462c63ac2947fea0d82a93bf81b033b2aa238411d190c760fc4d7aeeac012` (ronda 2: `requirements 5/7`, `scenarios 5/8`, 2 CRITICAL)
**Candidato**: `HEAD` = `origin/main` = `8af820a`, árbol limpio, tree `564f70cbb5870fdd22cb0ebe1a2a41889c10b7e6`

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 38 |
| Tasks complete | 38 |
| Tasks incomplete | 0 |

Verificado por conteo directo sobre `tasks.md` (`- [x]` = 38, `- [ ]` = 0) y corroborado por
`gentle-ai sdd-status sesion-utc-y-backfill-de-fechas` → `tasks: 38/38 complete`, `verify: ready`.

### Build & Tests Execution

**Build**: ✅ Passed

```text
$ cd backend && pnpm typecheck && pnpm lint
$ tsc --noEmit -p tsconfig.typecheck.json
$ eslint .
EXIT=0
```

**Tests**: ✅ 5137 passed

```text
$ cd backend && pnpm test
 Test Files  431 passed (431)
      Tests  5137 passed (5137)
   Duration  463.75s
EXIT=0
```

Ruido esperado y declarado: la salida contiene 3 bloques `Failed Suites 1 — FAIL
orden-de-arranque.spec.ts`. Es un proyecto Vitest hijo lanzado a propósito; el proceso sale con
exit 0. No es un hallazgo.

Discrepancia de conteo respecto de `apply-progress.md` y de la tarea 6.1, que registran
**5136/5136**: la diferencia de +1 es del commit posterior `aab164f`
(`test(equipos): cubrir la disyuncion !familia del guard de alta vinculada`, +47 líneas en
`agregar-componente.use-case.spec.ts`), ajeno a este ciclo. No hay tests perdidos.

**Coverage**: threshold configurado = 0 → informativo. Medido sobre los archivos de producción
creados/modificados por el cambio que la corrida focalizada ejercita:

| File | Line % | Branch % | Funcs % | Rating |
|------|--------|----------|---------|--------|
| `backend/src/shared/infrastructure/persistence/utc-connection-string.ts` | 100% | 100% | 100% | ✅ Excellent |
| `backend/src/clientes/infrastructure/postgres-admin.service.ts` | 100% | 90% | 100% | ✅ Excellent |
| `backend/src/shared/infrastructure/persistence/prisma.service.ts` | n/m | n/m | n/m | ➖ No medido en el subset |
| `backend/src/clientes/infrastructure/tenant-seeder.adapter.ts` | n/m | n/m | n/m | ➖ No medido en el subset |

`prisma.service.ts` y `tenant-seeder.adapter.ts` quedan en 0% en esta medición porque los specs
que los cubren (`utc-sesion-round-trip.integration.spec.ts`,
`tenant-seeder.adapter.integration.spec.ts`) no entraron en la corrida de cobertura focalizada.
No es una laguna de cobertura: ambos están cubiertos en la corrida completa.

### Adversarial (exigido por `rules.verify` del `config.yaml`)

Guard central mutado: `agregarTimezoneUtc()` en
`backend/src/shared/infrastructure/persistence/utc-connection-string.ts:49` convertida en no-op
(`return connectionString;`).

| Fase | Comando | Resultado observado |
|---|---|---|
| RED | `pnpm vitest run prisma_tenant/utc-sesion-round-trip.integration.spec.ts src/shared/infrastructure/persistence/utc-connection-string.spec.ts src/clientes/infrastructure/postgres-admin.service.integration.spec.ts` | exit 1 — `Test Files 2 failed \| 1 passed (3)`, `Tests 8 failed \| 7 passed (15)`. Firma exacta del defecto: `AssertionError: expected 10800 to be +0` (escritura +3h) y `AssertionError: expected -10800 to be +0` (lectura −3h) |
| Revert | `git checkout -- backend/src/shared/infrastructure/persistence/utc-connection-string.ts` | `git status --short` vacío |
| GREEN | mismo comando | exit 0 — `Test Files 3 passed (3)`, `Tests 15 passed (15)` |

Dos resultados que el ciclo adversarial prueba y que ningún artefacto afirmaba con evidencia
propia:

1. **R6 detecta efectivamente el defecto.** El `THEN` de R6 ("cuando el defecto reaparece, la
   prueba falla") queda verificado por ejecución, no por construcción: los números medidos
   (`10800` / `-10800`) son exactamente los que `design.md` ADR-7 predijo como RED.
2. **Las dos garantías de ADR-1 son realmente independientes.** Con `conUtc()` anulado,
   `postgres-admin.service.integration.spec.ts` siguió en verde (1 archivo pasado), porque el
   `ALTER DATABASE ... SET timezone TO 'UTC'` sostiene R5 por sí solo. La defensa en profundidad
   que ADR-1 declara no es retórica.

Árbol limpio al cerrar: `git status --short` sin salida.

### Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| R1 Round-trip en sesión no-UTC | Escritura y lectura sin desvío bajo America/Sao_Paulo | `prisma_tenant/utc-sesion-round-trip.integration.spec.ts:109` `[R1]` + `:126` `[R1/R7]` | ✅ COMPLIANT |
| R1 Round-trip en sesión no-UTC | Tickets del barrido preventivo se leen en la hora del cron | `prisma_tenant/utc-sesion-round-trip.integration.spec.ts:126` `[R1/R7]` | ✅ COMPLIANT (ver WARNING-1) |
| R2 Coherencia base ↔ aplicación | Los tres insumos conocidos quedan con created ≈ updated | `prisma_tenant/utc-backfill-fechas.integration.spec.ts:287` `[4.1/4.2/4.3]` (aserciones :367-368) + `:414` `[4.4/R7]` | ✅ COMPLIANT |
| R3 Corrección del dato histórico | El backfill corrige solo lo escrito por Prisma | `prisma_master/...:143` `[3.1/3.4]` + `prisma_tenant/...:287` `[4.1/4.2/4.3]` | ✅ COMPLIANT |
| R4 Ejecución exactamente-una-vez | Una segunda corrida no re-corrompe los datos | `prisma_master/...:187` `[3.2]`, `:268` `[3.2/R4]`, `:339` `[R3/R4-retry]`; `prisma_tenant/...:511` `[R4]`, `:647` `[R3/R4-retry]` | ✅ COMPLIANT |
| R5 Tenant nuevo nace sin el defecto | Aprovisionamiento posterior al cambio | `src/clientes/infrastructure/postgres-admin.service.integration.spec.ts:118` + unit `postgres-admin.service.spec.ts:150,164,175,199` | ✅ COMPLIANT |
| R6 Regresión bajo sesión no-UTC forzada | La prueba fuerza la sesión y detecta el desvío | `prisma_tenant/utc-sesion-round-trip.integration.spec.ts` (archivo completo) + ciclo adversarial de esta ronda | ✅ COMPLIANT (ver WARNING-2) |
| R7 Invariantes de integridad temporal | Se auditan las tres invariantes tras el fix y el backfill | `prisma_master/utc-backfill-fechas.integration.spec.ts:156` `[R7]` + `prisma_tenant/utc-backfill-fechas.integration.spec.ts:414` `[4.4/R7]` | ✅ COMPLIANT (ver WARNING-3) |

**Compliance summary**: 8/8 escenarios compliant · 7/7 requisitos cubiertos.

Los 12 tests de los dos specs de backfill fueron reconfirmados con reporter verbose en esta
ronda: `Test Files 2 passed (2)`, `Tests 12 passed (12)`, exit 0.

### R7 — juicio explícito sobre la evidencia de producción de la tarea 6.8

La ronda 2 cerró en `fail` señalando R7 sin evidencia. **R7 queda satisfecho en esta ronda, pero
NO por la evidencia que la tarea 6.8 presenta.** Corresponde dejarlo escrito con precisión:

**Lo que la tarea 6.8 mide** (`refresh_tokens.created_at` = `2026-09-15 11:12:32` local contra
reloj de pared `11:15:51`, `µs % 1000 = 0`, `SHOW timezone` = `UTC` en sesión nueva) es una
escritura de Prisma que aterriza en el instante correcto bajo una base ya en UTC. Eso es
**exactamente la propiedad de R1**, y es buena evidencia de R1 en producción — de hecho es la
única evidencia de producción de R1 que existe, porque el testigo que la spec eligió para R1
(los tickets del barrido preventivo) resultó inmedible por las razones que 6.8 documenta.

**Lo que R7 pide es otra cosa**: tres invariantes de integridad relacional sobre el estado de
datos posterior al backfill — `updated_at` no anterior a `created_at` en más de 1 segundo,
`movimientos_insumo.created_at` no anterior al `created_at` de su insumo padre, y ninguna fecha
posterior a `now()`. Una sola fila de `refresh_tokens` medida contra el reloj no prueba ninguna
de las tres. El marcador `_utc_backfill_aplicado` (1610 filas: master 1030, tenants 268/240/36/36)
prueba que el backfill corrió y cuántas filas tocó; no prueba que las invariantes se cumplan.

**Por qué R7 pasa igual.** El escenario de R7 tiene test cubriente que pasó en runtime:

- `prisma_master/utc-backfill-fechas.integration.spec.ts:156` `[R7]` audita, sobre el schema
  master, las dos invariantes aplicables (`updated_at < created_at - INTERVAL '1 second'` → 0
  filas; `created_at > now() OR updated_at > now()` → 0 filas) y además comprueba que la
  traslación uniforme de −3h preserva el delta de una fila con update real. La tercera
  invariante no aplica: `soporte_master` no tiene `movimientos_insumo`.
- `prisma_tenant/utc-backfill-fechas.integration.spec.ts:414` `[4.4/R7]` audita **las tres**
  sobre el schema tenant, sobre las 5 tablas con `updated_at` más `movimientos_insumo`, con la
  fixture de firma real de producción (`created_at` `20:13:00.001609+00` escrito por la base,
  `updated_at` `23:13:00.000000+00` escrito por Prisma) que tras el backfill queda en
  `20:13:00.001Z` / `20:13:00.000Z` — delta de 1,6 ms, dentro de la tolerancia de 1 s.

Ambos corren el `migration.sql` real leído del disco contra Postgres real, no una copia. El
alcance que R7 enuncia ("en `soporte_master` y en cada base de inquilino") se lee, en este repo,
como los dos schemas — que es la lectura que el propio equipo aplicó al agregar el test `[R7]`
de master en la remediación de la ronda 1. Con esa lectura, R7 está probado.

Queda como **WARNING-3**, no como bloqueo: nadie corrió las tres consultas de auditoría contra
las 5 bases de producción, y ahora que el backfill ya se aplicó ese estado existe y la consulta
es trivial. No bloquea el archivado porque la propiedad está probada a nivel de código sobre el
mismo SQL que producción ejecutó, pero conviene cerrarlo como acción operativa.

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| R1 Round-trip | ✅ Implemented | `utc-connection-string.ts:49-64` (`agregarTimezoneUtc`), `:75-80` (`conUtc`); consumido en `prisma.service.ts:42` (pool master) y `:66` (pool tenant) |
| R2 Coherencia | ✅ Implemented | Consecuencia de R1 + de la exclusión de la segunda guarda: `prisma_tenant/migrations/20260914150000_.../migration.sql:194-208` |
| R3 Backfill histórico | ✅ Implemented | Loop catalogado `migration.sql:149-223` (master y tenant); discriminador `EXTRACT(MICROSECONDS ...) % 1000 = 0` :205, :219 |
| R4 Una-sola-vez | ✅ Implemented | Marcador `_utc_backfill_aplicado` `migration.sql:101-105`; check+`RETURN` :139-147; `INSERT` final :225-226, todo dentro del mismo `DO $$` |
| R5 Tenant nuevo | ✅ Implemented | `postgres-admin.service.ts:68` (`ALTER DATABASE`), `:72-74` (degradación a WARNING en 42501), `:115` (pool admin vía `conUtc`) |
| R6 Regresión no-UTC | ✅ Implemented | `utc-sesion-round-trip.integration.spec.ts:68-79` (`forzarTimezoneNoUtc`), `:92` aplicado antes de abrir pools |
| R7 Invariantes | ✅ Implemented | Tolerancia de 1 s en `spec.md:110-125` y ADR-3 addendum `design.md:207-215`; `ORDER BY` de la guarda `migration.sql:176` |

Alcance del helper verificado además por regla de fitness: `eslint.config.js` prohíbe `new Pool(`
fuera de `utc-connection-string.ts`, con 13 casos en `src/config/regla-env-vacio.lint.spec.ts`
(incluidos los tres archivos migrados en WU2 y el `CUPO DE UNO` de `no-restricted-syntax`).

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| ADR-1 — tres garantías (flag por conexión + `ALTER DATABASE` en migración + en alta de tenant) | ✅ Sí | Las tres presentes. Independencia **probada** por el ciclo adversarial de esta ronda |
| ADR-2 — migración numerada, un archivo por schema, + marcador como defensa en profundidad | ✅ Sí | `_utc_backfill_aplicado` dentro del mismo `DO $$`; `_prisma_migrations` no se quitó |
| ADR-3 — discriminador de microsegundos + segunda guarda de delta + `ORDER BY` | ✅ Sí | `migration.sql:176-215`; regresión dedicada `[CRITICAL-2]` en el spec de tenant |
| ADR-4 — el backfill no pasa por Prisma; `SET LOCAL TimeZone` retirado | ✅ Sí | SQL puro; sin `SET LOCAL` en ninguno de los dos archivos |
| ADR-5 — `deploy.ps1` sin cambios, ventana atómica | ✅ Sí | `git diff 3f6e63d..origin/main -- deploy.ps1` → 0 líneas (tarea 6.2) |
| ADR-6 — dump como precondición operativa | ✅ Sí | `predeploy-dump.ps1` versionado; punto de restore `C:\soporte\backups\utc-backfill-20260915-063946` |
| ADR-7 — base efímera con `ALTER DATABASE`, no `SET TIME ZONE` de sesión | ✅ Sí | `utc-sesion-round-trip.integration.spec.ts:86-101`. Desvía del texto literal de R6 (ver WARNING-2) |
| ADR-3 hallazgo — `movimientos_insumo` sin `updated_at` | ✅ Sí | Detección por catálogo (`tiene_updated_at`, `migration.sql:179-186`), nunca hardcodeada |

### TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | Tabla `## TDD Cycle Evidence` presente en `apply-progress.md:74-79`, con columnas RED (observado) → GREEN → REFACTOR |
| All tasks have tests | ⚠️ | La tabla cubre 2 archivos (la remediación de la ronda 2). El RED de WU1–WU5 vive como anotación inline en `tasks.md` (1.1, 2.1, 3.1, 4.1), no en la tabla |
| RED confirmed (tests exist) | ✅ | 2/2 archivos existen: `prisma_master/utc-backfill-fechas.integration.spec.ts:339`, `prisma_tenant/utc-backfill-fechas.integration.spec.ts:647` |
| GREEN confirmed (tests pass) | ✅ | 12/12 verificados con reporter verbose en esta ronda; ambos `[R3/R4-retry]` ✓ (master 1416 ms, tenant 1457 ms) |
| Triangulation adequate | ⚠️ | La tabla no trae columna TRIANGULATE. Triangulación real medida: master 7 casos, tenant 5 casos, round-trip 2, helper 7, admin unit 11 / integración 6, fitness 13 |
| Safety Net for modified files | ⚠️ | La tabla no trae columna SAFETY NET. Suplido por la corrida completa de `pnpm test` que `apply-progress.md:88` registra dos veces |

**TDD Compliance**: 3/6 checks completos, 3 con WARNING de forma (ninguno de fondo).

RED reportado en `apply-progress.md` y su verificación independiente en esta ronda:

| Claim de la tabla | Verificación de esta ronda |
|---|---|
| master `[R3/R4-retry]`: `expected '2026-09-01T04:00:00.000Z' to be '2026-09-01T07:00:00.000Z'` | Test existe (`:339`) y pasa. La aserción vigente (`:671`) es `expect(valor.toISOString()).toBe('2026-09-01T07:00:00.000Z')` — coherente con el RED reportado |
| tenant `[R3/R4-retry]`: mismos números vía `zz_retry_probe` | Test existe (`:647`) y pasa; tabla ad-hoc creada tras el primer deploy (`:637-639`), aísla el caso de la segunda guarda |
| WU1 RED predicho: desvío 10800 s / −10800 s | **Verificado por ejecución en esta ronda** vía la mutación adversarial: `expected 10800 to be +0` y `expected -10800 to be +0` |

### Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 31 | 3 | Vitest (`utc-connection-string.spec.ts` 7, `postgres-admin.service.spec.ts` 11, `regla-env-vacio.lint.spec.ts` 13) |
| Integration | 20 | 4 | Vitest + Postgres real, bases efímeras, `prisma migrate deploy` como subproceso |
| E2E | 0 | 0 | No aplica: el cambio es de driver y de datos, sin superficie HTTP |
| **Total** | **51** | **7** | |

Los 4 archivos de integración ejecutan el `migration.sql` real leído del disco y `prisma migrate
deploy` como subproceso real: sin mocks, sin copias del SQL.

### Assertion Quality

Auditados los 6 archivos de test del cambio (118 `expect` en total, 1 solo `vi.mock`).

| Patrón buscado | Resultado |
|---|---|
| Tautologías (`expect(true).toBe(true)`) | Ninguna |
| Aserciones sin llamar código de producción | Ninguna |
| Ghost loops sobre colecciones posiblemente vacías | Ninguno — los loops de `[4.4/R7]` iteran arrays literales de nombres de tabla, siempre ejecutan |
| Colecciones vacías sin compañera no-vacía | Ninguna |
| Aserciones type-only aisladas | Ninguna — las 4 (`toBeDefined`/`not.toBeNull`) conviven con aserciones de valor en el mismo test |
| Smoke-test-only | Ninguno |
| Acoplamiento a detalle de implementación | Ninguno |
| Tests mock-heavy (mocks > 2× asserts) | Ninguno — `postgres-admin.service.spec.ts` es 1 mock / 19 asserts |

**Assertion quality**: ✅ Todas las aserciones verifican comportamiento real. 0 CRITICAL, 0 WARNING.

### Quality Metrics

**Linter**: ✅ `eslint .` sin errores (exit 0)
**Type Checker**: ✅ `tsc --noEmit -p tsconfig.typecheck.json` sin errores (exit 0)

### Issues Found

**CRITICAL**: Ninguno.

Los dos CRITICAL de la ronda 2 quedan cerrados con evidencia verificada de forma independiente
en esta ronda:

- `R7-sin-evidencia` → cerrado. R7 probado por `[R7]` (master) y `[4.4/R7]` (tenant), ambos
  verdes con reporter verbose. Ver la sección de juicio explícito: la evidencia de producción de
  la tarea 6.8 **no** es lo que lo cierra.
- `R3-r4-retry-path-unproved` → cerrado. Reproducción real del camino fallo-y-reintento (borrar
  la fila de `_prisma_migrations` y redesplegar) en ambos schemas, verde con la guarda del
  marcador.

**WARNING**:

1. **El testigo que R1 nombra no existe en el schema.** El escenario "Tickets del barrido
   preventivo se leen en la hora del cron" abre con `GIVEN un ticket con clock_timestamp()`.
   Medido contra el repositorio: `tickets.created_at` es `TIMESTAMPTZ NOT NULL DEFAULT
   CURRENT_TIMESTAMP` (`backend/prisma_tenant/migrations/20260805194710_init_tenant/migration.sql:88`),
   y el modelo Prisma es `@default(now())` (`prisma_tenant/schema.prisma:255`) — nunca
   `clock_timestamp()`. Las 6 columnas que sí usan `clock_timestamp()` están enumeradas en ADR-3
   y `tickets` no es una de ellas. El escenario queda COMPLIANT porque el test `[R1/R7]` prueba
   el mecanismo exacto que el escenario describe (lectura vía Prisma de una columna `DEFAULT
   clock_timestamp()` bajo sesión `America/Sao_Paulo`, desvío 0) sobre `unidades_medida`, y
   porque `design.md` establece que el fix corrige el driver para las 44 tablas por igual, sin
   tocar ningún mapper. **Recomendación**: corregir el texto del escenario en el archive, o
   sustituir el testigo por uno que exista. La tarea 6.8 ya documenta por qué el original es
   inmedible en producción; el spec todavía no lo refleja.
2. **R6 describe un mecanismo más débil que el implementado.** El `GIVEN` de R6 pide
   `SET TIME ZONE 'America/Sao_Paulo'` + `RESET TIME ZONE`. La implementación usa `ALTER DATABASE
   <efímera> SET timezone` y abre pools nuevos después — estrictamente más fuerte, porque prueba
   la cadena de conexión y no solo la expresión SQL, tal como ADR-7 argumenta. No rompe el
   requisito (el `THEN` quedó verificado por el ciclo adversarial). **Recomendación**: alinear el
   texto de R6 con ADR-7 en el archive.
3. **R7 sin auditoría del lado de producción.** Las tres invariantes nunca se consultaron contra
   las 5 bases reales, pese a que la tarea 6.8 se titula "Evidencia de R7 en producción" y a que
   el estado post-backfill ya existe desde el 2026-09-15. **Recomendación** (operativa, no
   bloqueante), por base: `SELECT count(*) FROM <tabla> WHERE updated_at < created_at - INTERVAL
   '1 second'`; `SELECT count(*) FROM movimientos_insumo m JOIN insumos i ON i.id = m.insumo_id
   WHERE m.created_at < i.created_at`; `SELECT count(*) FROM <tabla> WHERE created_at > now()`.
4. **`apply-progress.md` materializa solo la ronda 2.** El archivo se creó el 2026-09-15 desde
   la observación de engram de 9 revisiones, pero su contenido cubre únicamente la remediación
   del CRITICAL `R3-r4-retry-path-unproved`. La evidencia TDD de WU1–WU5 quedó solo como
   anotación inline en `tasks.md`, y varias remisiones del propio artefacto apuntan a engram
   (`tasks.md:32-33`, `:84`) — que `config.yaml` declara explícitamente que NO es el artifact
   store. Consecuencia práctica: la tarea 2.1 dice "confirmados RED ... (ver apply-progress)" y
   `apply-progress.md` no contiene ese RED. **Recomendación**: consolidar la evidencia TDD de
   WU1–WU5 en el archivo antes del archive, o reescribir esas remisiones para que apunten a
   `tasks.md`.
5. **La tabla de TDD Cycle Evidence no trae las columnas TRIANGULATE ni SAFETY NET.** Trae las
   tres que la regla del repo exige (RED → GREEN → REFACTOR, §6.3 de `~/proyectos/CLAUDE.md`),
   así que no es rechazo; queda como desvío de forma respecto de la plantilla de
   `strict-tdd-verify.md`. La triangulación real es holgada (51 tests sobre 7 archivos) y la red
   de seguridad está suplida por las dos corridas completas que `apply-progress.md:88` registra.

**SUGGESTION**:

1. La cabecera de ambos `migration.sql` conserva la línea `EJECUTAR ESTE ARCHIVO DOS VECES
   CORROMPE LOS DATOS POR SÍ SOLO (ADR-4)` (`migration.sql:58-60`) y, 4 líneas más abajo,
   explica que el marcador `_utc_backfill_aplicado` hace que el archivo sea seguro ante una
   segunda corrida. Las dos cosas son ciertas en sentidos distintos (el discriminador por sí solo
   no es idempotente; el archivo completo sí lo es), pero leídas seguidas se contradicen.
   Conviene reformular la primera a "el discriminador por sí solo no es idempotente".
2. Los `Success Criteria` de `proposal.md:116-125` siguen todos en `[ ]` pese a que las 38 tareas
   están cerradas y el fix está en producción. No cuentan como tareas para el status nativo, pero
   dejan una lectura confusa en el archive.
3. `[4.4/R7]` afirma las invariantes como `count(*) = 0`, que pasaría trivialmente sobre tablas
   vacías. En la práctica no es vacuo porque el `[4.1/4.2/4.3]` del mismo `describe` asserta
   valores concretos de esas mismas fixtures sobre el mismo pool. Una aserción de no-vacuidad
   haría el test auto-protegido.
4. `expect(mensajeAmbiguo).toBeDefined()`
   (`prisma_tenant/utc-backfill-fechas.integration.spec.ts:411`) podría afirmar el texto exacto
   del `RAISE NOTICE` en lugar de la mera existencia del match.

### Verdict

**PASS WITH WARNINGS** — los 7 requisitos y los 8 escenarios tienen test cubriente verde en
runtime, `pnpm test` y `pnpm typecheck && pnpm lint` salen en 0, el ciclo adversarial reprodujo
el defecto y lo revirtió con el árbol limpio, y los 2 CRITICAL de la ronda 2 quedan cerrados. Las
5 WARNING son de texto de spec y de consolidación de artefactos; ninguna toca el comportamiento
desplegado.
