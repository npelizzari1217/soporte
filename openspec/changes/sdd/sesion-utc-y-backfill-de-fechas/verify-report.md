```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:9b1580fa4c0e165bd3b8f6dca9148d2cfd1aff343149baed24a23174da3c6518
verdict: fail
blockers: 2
critical_findings: 2
requirements: 6/7
scenarios: 6/8
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:3aca5e7d49280c6d078834efe92378c431ae930941940b15ec1eff99fcfdeefb
build_command: pnpm typecheck
build_exit_code: 0
build_output_hash: sha256:1e7364545b505adc6ef70012ce70f69a90a7eb05ebb0a0886a63cceb701bcb27
```

## Verification Report

**Change**: sesion-utc-y-backfill-de-fechas (issue #173, BUGFIX)
**Version**: spec `fechas-sesion-utc` — 7 requisitos, 8 escenarios
**Mode**: Strict TDD (inyectado por el orquestador, autoritativo sobre `strict_tdd: false` del config)

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 32 |
| Tasks complete | 28 |
| Tasks incomplete | 4 (6.1–6.4, Fase 6 post-chain: deploy y merge, posteriores a verify por construcción) |

Las cinco unidades de código (WU1–WU5) están implementadas en la cadena de ramas
declarada. `deploy.ps1` es byte-idéntico a `23142b8` y a `origin/main`
(`git diff origin/main -- deploy.ps1` → 0 líneas), como exige ADR-5. El tracker
`fix/sesion-utc-y-backfill-de-fechas` sigue en `3f6e63d` = `origin/main`: nada
mergeado a `main`.

### Build & Tests Execution

**Lint**: ✅ Pasó — `pnpm lint` (`eslint .`), exit 0, cero errores y cero advertencias.

**Build / tipos**: ✅ Pasó — `pnpm typecheck` (`tsc --noEmit -p tsconfig.typecheck.json`), exit 0.

**Tests**: ✅ 5132 pasan / 0 fallan

```text
pnpm test  (backend/, vitest run)
 Test Files  431 passed (431)
      Tests  5132 passed (5132)
   Duration  476.70s
 exit 0
```

`src/config/regla-env-vacio.lint.spec.ts` NO dio timeout en esta corrida: pasó
dentro de la suite completa. No hubo re-corrida aislada porque no hizo falta.

**RED re-derivado de forma independiente** (no se tomó de la fase de apply):
revirtiendo ÚNICAMENTE `backend/src/shared/infrastructure/persistence/prisma.service.ts`
a su estado en `3f6e63d` y dejando el test igual:

```text
AssertionError: expected 10800 to be +0      ([R1] escritura)
AssertionError: expected -10800 to be +0     ([R1/R7] lectura clock_timestamp())
 Test Files  1 failed (1) · Tests  2 failed (2)
```

Restaurado el archivo: 2/2 GREEN, árbol de trabajo limpio. El test DISCRIMINA —
no pasa por casualidad.

**Coverage**: ➖ No se midió (no se solicitó; informativo, no bloqueante).

### Spec Compliance Matrix

| Requisito | Escenario | Test | Resultado |
|-----------|-----------|------|-----------|
| R1 round-trip | Escritura y lectura sin desvío bajo America/Sao_Paulo | `prisma_tenant/utc-sesion-round-trip.integration.spec.ts` > `[R1]` + `[R1/R7]` | ✅ COMPLIANT |
| R1 round-trip | Tickets del barrido preventivo en la hora del cron | `[R1/R7]` prueba el mecanismo (lectura de `clock_timestamp()` con desvío 0); la aserción sobre tickets reales es manual (tarea 6.3) | ⚠️ PARTIAL |
| R2 coherencia created/updated | Los tres insumos conocidos quedan con created ≈ updated | round-trip spec + `prisma_tenant/utc-backfill-fechas.integration.spec.ts` | ✅ COMPLIANT |
| R3 backfill histórico | El backfill corrige solo lo escrito por Prisma | `prisma_master/...` `[3.1/3.4]` · `prisma_tenant/...` `[4.1/4.2/4.3]` | ✅ COMPLIANT |
| R4 exactamente-una-vez | Una segunda corrida no re-corrompe | `prisma_master/...` `[3.2/R4]` · `prisma_tenant/...` `[R4]` (ambos spawnean `prisma migrate deploy` dos veces) | ✅ COMPLIANT |
| R5 tenant nuevo | Aprovisionamiento posterior al cambio | `postgres-admin.service.spec.ts` (4 casos) + `postgres-admin.service.integration.spec.ts` `[CRITICAL]` (`SHOW timezone` = UTC real) | ✅ COMPLIANT |
| R6 regresión no-UTC | La prueba fuerza la sesión y detecta el desvío | round-trip spec sobre base efímera con `ALTER DATABASE ... SET timezone` (RED re-derivado arriba) | ✅ COMPLIANT |
| R7 invariantes temporales | Se auditan las tres invariantes tras el fix y el backfill | `prisma_tenant/...` `[4.4/R7]` pasa, pero ninguna fixture reproduce la forma real; reproducido el incumplimiento (CRITICAL-1) | ❌ FAILING |

**Compliance summary**: 6/8 escenarios compliant · 1 partial · 1 failing.

### Correctness (Static Evidence)

| Requisito | Estado | Notas |
|-----------|--------|-------|
| R1 / R6 | ✅ Implementado | `conUtc()` construye el único `pg.Pool` autorizado y agrega `options=-c TimeZone=UTC`; idempotente, preserva query previa. Los 4 pools de producción pasan por él. |
| R3 | ✅ Implementado | Loop catalogado sobre `information_schema`, `udt_name='timestamptz'`, `table_type='BASE TABLE'`, `public`, excluye `_prisma_migrations`. Discriminador `EXTRACT(MICROSECONDS ...) %% 1000 = 0`. |
| R4 | ✅ Implementado | Garantía externa al SQL vía `_prisma_migrations`; probada spawneando el CLI real, no re-ejecutando el SQL. |
| R5 | ✅ Implementado | `createDatabase`: `assertValidIdentifier` → `CREATE DATABASE` → `ALTER DATABASE %I SET timezone TO 'UTC'` con `quoteIdentifier`, antes de migrate y seed. `insufficient_privilege` (42501) degrada a `console.warn`; cualquier otro error propaga. |
| R7 | ❌ Incumplido | Ver CRITICAL-1. |
| `@db.Date` intacta | ✅ Verificado | El filtro `udt_name='timestamptz'` excluye `date` por construcción. Aserción explícita solo en el spec de master (`feriados.fecha`); ver WARNING-2. |
| `_prisma_migrations` intacta | ✅ Verificado | `started_at`/`finished_at` sin cambio tras el segundo `migrate deploy`, aserción presente en AMBOS specs. |

### Coherence (Design)

| Decisión | ¿Seguida? | Notas |
|----------|-----------|-------|
| ADR-1 — tres garantías (conexión + ALTER DATABASE + alta de tenant) | ✅ Sí | Las tres presentes. La guarda ESLint tiene UNA sola clave `no-restricted-syntax` por bloque, construida por spread desde `reglaEnvStringVacio['no-restricted-syntax']` (`eslint.config.js:208-213`), nunca una segunda clave. `postgres-admin.service.ts` y `tenant-seeder.adapter.ts` ya NO están en `ignores`. `regla-env-vacio.lint.spec.ts` guarda el CUPO DE UNO con casos dedicados. |
| ADR-2 — migración numerada, un archivo por schema | ✅ Sí | `ALTER DATABASE` y backfill en el mismo archivo, una transacción. |
| ADR-3 — discriminador + segunda guarda | ⚠️ Parcial | La detección en runtime de `updated_at` es correcta y NO puede saltear una tabla que SÍ la tenga (verificado por lectura y por ejecución). Pero la asimetría "ante la duda sub-corregir" no está garantizada: ver CRITICAL-2. |
| ADR-4 — el backfill no pasa por Prisma | ✅ Sí | SQL puro; test de caracterización presente en master. |
| ADR-5 — `deploy.ps1` sin cambios | ✅ Sí | `git diff origin/main -- deploy.ps1` → 0 líneas. |
| ADR-6 — dump como precondición operativa | ✅ Sí | `predeploy-dump.ps1`: 100% ASCII, sin BOM, enumera desde el registro con `psql -t -A`, valida `^[a-z_][a-z0-9_]*$` y ABORTA, fail-closed borrando la carpeta parcial. Verificación estructural (tablas origen vs. TOC), sin asumir esquema de negocio. |
| ADR-7 — el test fuerza la sesión no-UTC | ✅ Sí | Base efímera con `ALTER DATABASE ... SET timezone TO 'America/Sao_Paulo'` ANTES de abrir los pools medidos. |
| `design.md:123` lista `movimientos_insumo` entre las 6 con guarda de delta | ✅ Corregido en WU4 | La tabla es append-only y no tiene `updated_at` (`schema.prisma:835`). Verificado por catálogo que las 6 columnas `clock_timestamp()` del schema tenant son exactamente las listadas, y que master no tiene ninguna. |

### TDD Compliance

| Check | Resultado | Detalle |
|-------|-----------|---------|
| Evidencia TDD reportada | ⚠️ | El artefacto `apply-progress` (locator nativo, engram #4417) NO contiene la tabla TDD Cycle Evidence de WU1–WU4: delega en "prior revisions / git history". La evidencia existe y fue validada, pero en observaciones adyacentes (#4418, #4421, #4422). Ver WARNING-3. |
| Todas las tareas de código tienen tests | ✅ | WU1–WU4 tienen spec propio; WU5 es el gap declarado y aceptado. |
| RED confirmado | ✅ | WU1 re-derivado en esta verificación (10800 / −10800). WU3/WU4 documentan RED por `ENOENT`/`P3015` sobre el `migration.sql` inexistente. WU2: 4/4 fallando antes del código. |
| GREEN confirmado | ✅ | 5132/5132 en la corrida completa de esta verificación. |
| Triangulación | ✅ | R5: 4 casos unit + 1 integración real. Backfill: µs=0 / µs≠0 / ambiguo / doble corrida / exactamente-una-vez. |
| Safety net en archivos modificados | ✅ | Baseline verde previo documentado (5124/5124 en WU2, 5132/5132 en WU4). |

**TDD Compliance**: 5/6 checks.

### Test Layer Distribution

| Capa | Tests | Archivos | Herramienta |
|------|-------|----------|-------------|
| Unit | 7 (`utc-connection-string.spec.ts`) + 4 (`postgres-admin.service.spec.ts`, ALTER DATABASE) | 2 | Vitest |
| Fitness (lint) | 12 (`regla-env-vacio.lint.spec.ts`, bloques de Pool) | 1 | Vitest + ESLint API |
| Integración | 2 (round-trip) + 5 (backfill master) + 3 (backfill tenant) + 1 (alta de tenant real) | 4 | Vitest + Postgres real / base efímera |
| E2E | 0 propios del cambio | 0 | — |
| PowerShell | 0 | 0 | ➖ No existe harness en el repo (gap declarado en el threat matrix) |

### Assertion Quality

| Archivo | Línea | Aserción | Problema | Severidad |
|---------|-------|----------|----------|-----------|
| `prisma_tenant/utc-backfill-fechas.integration.spec.ts` | 312 | `expect(insumoAmbiguo.rows[0].updated_at...).toBe('2026-09-12T23:12:59.998Z')` | El `updated_at` de la fixture ambigua tiene microsegundos 998391 (`%1000 = 391 ≠ 0`), así que el backfill NUNCA lo toca: la aserción no puede fallar por ninguna vía. Un `updated_at` escrito por Prisma tiene SIEMPRE `%1000 = 0`. | WARNING |
| `prisma_tenant/utc-backfill-fechas.integration.spec.ts` | 348-388 | `[4.4/R7]` invariantes | Ninguna fixture reproduce la forma real (created_at de la base con µs≠0 + updated_at de Prisma con µs=0 y delta ≈3h); el bloque pasa sin ejercitar el caso que el propio spec nombra. | CRITICAL (ver CRITICAL-1) |

Sin tautologías, sin ghost loops, sin aserciones que no ejecuten código de producción,
sin tests mock-heavy. El resto de las aserciones verifican comportamiento real.

### Quality Metrics

**Linter**: ✅ Sin errores · **Type Checker**: ✅ Sin errores

### Issues Found

**CRITICAL**:

1. **R7 se incumple por construcción sobre las filas que el propio spec nombra en R2 — y el test `[4.4/R7]` pasa sin poder detectarlo.**

   R7 exige que "ninguna fila tenga `updated_at` anterior a `created_at`". Reproducido
   ejecutando el `migration.sql` real de tenant contra una base efímera, con la forma
   exacta de "los tres insumos conocidos" (delta medido en producción `02:59:59.998391`):

   ```text
   ANTES    created_at=2026-09-12 20:13:00.001609+00  (base, clock_timestamp, us%1000=609)
            updated_at=2026-09-12 23:13:00.000000+00  (Prisma, us%1000=0, +3h del defecto)
            delta=02:59:59.998391   updated_at < created_at = f

   DESPUES  created_at=2026-09-12 20:13:00.001609+00  (intacta, correcto por R3)
            updated_at=2026-09-12 20:13:00.000000+00  (-3h, correcto por R3)
            delta=-00:00:00.001609  updated_at < created_at = t   <-- R7 INCUMPLIDO
   ```

   Las dos correcciones son individualmente correctas: el defecto no está en el backfill.
   Está en que R7 es inalcanzable para las 5 tablas con `created_at DEFAULT clock_timestamp()`
   y `updated_at` escrito por Prisma. Prisma calcula el `Date` en JS ANTES de enviar el
   INSERT; la base evalúa `clock_timestamp()` al ejecutarlo, un par de milisegundos DESPUÉS.
   Por eso, **tras el fix, toda fila NUEVA de esas tablas también nace con
   `updated_at` ~1,6 ms anterior a `created_at`**: hoy no ocurre solo porque el defecto
   de +3h lo enmascara. El cambio no introduce un error de datos, pero sí hace verdadero
   justo lo que R7 declara imposible, en cada base de inquilino y de forma permanente.

   El test `[4.4/R7]` pasa porque ninguna de sus fixtures tiene esa forma: las corregibles
   llevan `created_at` y `updated_at` ambos con µs=0 (se trasladan juntos, el delta se
   preserva), las de base tienen ambas columnas iguales, y la ambigua tiene un `updated_at`
   que el backfill nunca toca.

   No es una corrección que `sdd-verify` pueda hacer: R7 está mal escrito, o falta acotarlo
   (por ejemplo, tolerancia de milisegundos, o excluir las tablas `clock_timestamp()`).
   Decisión del dueño del spec.

2. **La segunda guarda de ADR-3 depende del orden en que `information_schema` devuelve las columnas, que la query no fija.**

   El loop de `migration.sql` (tenant, líneas 84-93) no lleva `ORDER BY`. La guarda de
   delta calcula `updated_at - created_at` **leyendo `updated_at` de la tabla en ese
   momento**. Si el catálogo devuelve `updated_at` antes que `created_at`, la columna ya
   fue trasladada −3h cuando se evalúa la guarda, el delta cae fuera de la banda y la fila
   ambigua se corrige igual. Reproducido con la misma tabla lógica y el mismo dato, cambiando
   únicamente el orden de declaración de las columnas:

   ```text
   orden created_at, updated_at  ->  NOTICE "fila ambigua sin tocar"; created_at INTACTA (20:13:00.002)
   orden updated_at, created_at  ->  sin NOTICE;                      created_at = 17:13:00.002  (-3h de mas)
   ```

   El resultado es exactamente el que ADR-3 declara no negociable: un valor −3h que
   "ningún discriminador podrá volver a encontrar", y sin `RAISE NOTICE` que lo delate.

   Severidad medida, no supuesta: contra el schema tenant real
   (`soporte_tenant_test`, 6 tablas guarda) el catálogo devuelve hoy `created_at` antes
   que `updated_at` en las 6, así que **el defecto NO se manifiesta con el esquema actual**.
   Es latente: `information_schema` no garantiza orden alguno, y un `ALTER TABLE ... ADD
   COLUMN` futuro o un plan distinto lo cambian sin aviso. Se corrige con un `ORDER BY`
   que fuerce `created_at` antes que el resto. La fixture ambigua actual no puede detectar
   la regresión (ver WARNING-1).

**WARNING**:

1. **La fixture ambigua no tiene la forma que ADR-3 describe.** Su `updated_at`
   (`23:12:59.998391`, µs `%1000 = 391`) no es un valor que Prisma pueda haber escrito —
   Prisma siempre deja µs `%1000 = 0`. El backfill por lo tanto nunca lo toca, la aserción
   de la línea 312 no puede fallar, y la fixture es inmune al orden del catálogo. La guarda
   de banda sí queda probada; el caso real de ADR-3, no.

2. **El spec de tenant no afirma que las columnas `@db.Date` queden intactas.** El schema
   tenant tiene 13 columnas `@db.Date` (contra 3 en master) y la migración de tenant es la
   que lleva SQL dinámico adicional. La aserción que pide el threat matrix del design existe
   solo en el spec de master (`feriados.fecha`). La exclusión es estructural y fue verificada
   (`udt_name='timestamptz'`), pero la guarda de regresión falta donde el riesgo es mayor.

3. **El artefacto `apply-progress` no contiene la tabla TDD Cycle Evidence de WU1–WU4.**
   El locator que devuelve el status nativo (engram #4417) delega en "prior revisions / git
   history". La evidencia existe y fue validada en esta verificación, pero vive en
   observaciones adyacentes (#4418, #4421, #4422). Quien siga solo el locator no encuentra
   tabla TDD alguna — con Strict TDD activo eso es un hueco de higiene del artefacto.

4. **R7 no tiene evidencia de ningún tipo para `soporte_master` ni contra ninguna base real.**
   El spec exige la auditoría "en `soporte_master` y en cada base de inquilino". Solo existe
   como aserciones sobre fixtures sintéticas de una base efímera de tenant. La verificación
   post-deploy del runbook cubre `SHOW timezone` y los tickets del preventivo, no las tres
   invariantes; las tareas 6.1–6.4 tampoco las mencionan. Tras un backfill irreversible,
   es la única propiedad que nadie va a comprobar.

**SUGGESTION**:

1. `tablas_guarda_delta` es la única lista hardcodeada de una migración por lo demás
   catalogada. Verificado por catálogo que hoy coincide exactamente con las 6 columnas
   `clock_timestamp()` del schema tenant (y que master no tiene ninguna), pero una séptima
   tabla futura quedaría sin guarda en silencio. Es derivable de `pg_attrdef`, igual que el
   resto.

2. Los artefactos SDD de este ciclo están sin versionar
   (`?? openspec/changes/sdd/sesion-utc-y-backfill-de-fechas/`). Por §3.1 de
   `proyectos/CLAUDE.md` el Nivel 1 es Git; hoy solo existen en engram y en el working tree.

3. `SET LOCAL TimeZone = 'UTC'` emite `WARNING: SET LOCAL can only be used in transaction
   blocks` si el archivo se ejecuta fuera de una transacción. Bajo `prisma migrate deploy`
   corre dentro de una y es efectivo; la cabecera ya prohíbe correrlo a mano. Se deja
   anotado porque el warning aparece en cualquier ejecución diagnóstica del archivo.

### Verdict

**FAIL** — la implementación de R1–R6 es sólida y está probada en ejecución (lint, typecheck
y 5132/5132 en verde, RED re-derivado de forma independiente), pero R7 se incumple de forma
reproducible sobre las filas que el propio spec nombra, y la asimetría que ADR-3 declara no
negociable no está garantizada por la migración de tenant.
