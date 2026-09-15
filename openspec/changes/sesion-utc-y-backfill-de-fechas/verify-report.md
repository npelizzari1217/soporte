```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:446462c63ac2947fea0d82a93bf81b033b2aa238411d190c760fc4d7aeeac012
verdict: fail
blockers: 2
critical_findings: 2
requirements: 5/7
scenarios: 5/8
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:2c9fdc1fd2bb8064488ad92412a892ce9d5e1e95f082ff29026fd3308d8578a3
build_command: pnpm typecheck
build_exit_code: 0
build_output_hash: sha256:1e7364545b505adc6ef70012ce70f69a90a7eb05ebb0a0886a63cceb701bcb27
```

## Verification Report — ROUND 2

**Change**: sesion-utc-y-backfill-de-fechas (issue #173, BUGFIX)
**Version**: spec `fechas-sesion-utc` — 7 requisitos, 8 escenarios
**Mode**: Strict TDD (inyectado por el orquestador, autoritativo sobre `strict_tdd: false` del config)
**Revisión verificada**: `1d907e6` (rama `fix/sesion-utc-y-backfill-de-fechas-dump-runbook`), árbol de trabajo limpio antes y después de esta verificación.

Esta ronda verifica la remediación de los hallazgos de la ronda 1
(`verdict: fail`, 2 CRITICAL / 4 WARNING / 3 SUGGESTION, engram #4427) y busca
regresiones y defectos nuevos introducidos por esa remediación.

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 32 |
| Tasks complete | 28 |
| Tasks incomplete | 4 (6.1–6.4, fase post-chain: dump, deploy, verificación manual y merge — posteriores a `verify` por construcción) |

La remediación no reabrió ninguna tarea. Su alcance es acotado y se verificó por
diff: `git diff --stat e728ad6 HEAD` toca exactamente los dos `migration.sql`,
los dos specs de backfill y los artefactos SDD. **No tocó una sola línea de
WU1, WU2 ni WU5**: `git diff 2220df2 HEAD -- src/shared/infrastructure/persistence/
src/clientes/infrastructure/ eslint.config.js scripts/migrate-tenants.js
src/config/regla-env-vacio.lint.spec.ts` devuelve vacío, y
`git diff origin/main -- deploy.ps1` devuelve 0 líneas (ADR-5 intacto).

### Build & Tests Execution

**Lint**: ✅ Pasó — `pnpm lint` (`eslint .`), exit 0, cero errores y cero advertencias.

**Build / tipos**: ✅ Pasó — `pnpm typecheck` (`tsc --noEmit -p tsconfig.typecheck.json`), exit 0.

**Tests**: ✅ 5134 pasan / 0 fallan — coincide exactamente con la línea base declarada (+2 sobre los 5132 de la ronda 1).

```text
pnpm test  (backend/, vitest run)
 Test Files  431 passed (431)
      Tests  5134 passed (5134)
   Duration  486.91s
 exit 0
```

**Corrida focalizada de cierre**: `pnpm vitest run prisma_tenant/utc-backfill-fechas.integration.spec.ts
prisma_master/utc-backfill-fechas.integration.spec.ts prisma_tenant/utc-sesion-round-trip.integration.spec.ts`
→ 3 archivos, 12/12 GREEN.

**Coverage**: ➖ No se midió (no se solicitó; informativo, no bloqueante).

### RED re-derivado de forma independiente (no tomado de la fase de apply)

**CRITICAL-1 — la fixture nueva SÍ puede fallar.** `idInsumoFirmaReal` tiene la
forma real de producción: `created_at = 2026-09-12 20:13:00.001609+00`
(microsegundos 1609, `% 1000 = 609 ≠ 0` — la escribe la base, el discriminador
nunca la toca) y `updated_at = 2026-09-12 23:13:00.000000+00` (microsegundos 0 —
la escribe Prisma). Reemplazando la tolerancia por la invariante estricta
(`INTERVAL '1 second'` → `INTERVAL '0 seconds'`) en las dos aserciones de
`[4.4/R7]`, sin tocar nada más:

```text
× [4.4/R7] invariantes de integridad temporal tras el backfill
AssertionError: expected 2 to be +0
 Test Files  1 failed (1) · Tests  1 failed | 3 passed (4)
```

Dos filas de `insumos` violan la invariante estricta: la de firma real
(−1,609 ms) y la ambigua (−2 ms). La tolerancia de 1 s es **load-bearing**, no
decorativa, y la aserción discrimina. Archivo restaurado byte a byte.

**CRITICAL-2 — el `ORDER BY` es el que sostiene la guarda.** Reemplazando
únicamente la cláusula `ORDER BY col.table_name, (col.column_name <>
'created_at'), col.column_name` del `migration.sql` de tenant por un comentario:

```text
× [CRITICAL-2] created_at ambiguo permanece intacto aunque updated_at esté declarada antes en la tabla
AssertionError: expected '2026-09-12T17:13:00.000Z' to be '2026-09-12T20:13:00.000Z'
 Test Files  1 failed (1) · Tests  1 failed | 3 passed (4)
```

Es la sobre-corrección de −3 h irreversible que ADR-3 declara no negociable.
Archivo restaurado (`git checkout --`, `diff` contra la copia previa al
experimento: idéntico), `git status` limpio, 12/12 GREEN tras restaurar.

**El razonamiento del `ORDER BY` se verificó, no se asumió.** `(col.column_name
<> 'created_at')` es booleana y en Postgres `false` ordena antes que `true`,
comprobado contra el motor real:

```text
SELECT x FROM (VALUES ('updated_at'),('created_at'),('deleted_at'),('fecha_cierre')) v(x)
 ORDER BY (x <> 'created_at'), x;
 -> created_at, deleted_at, fecha_cierre, updated_at
```

Y contra el schema tenant real (`soporte_tenant_test`), la query completa del
`migration.sql` devuelve `created_at` primero en **las 6 tablas con guarda**,
sin importar su `ordinal_position` (5, 8, 9 según la tabla). La guarda ya no
depende del orden físico de declaración de columnas para ninguna de las 6.

### Spec Compliance Matrix

| Requisito | Escenario | Test | Resultado |
|-----------|-----------|------|-----------|
| R1 round-trip | Escritura y lectura sin desvío bajo America/Sao_Paulo | `prisma_tenant/utc-sesion-round-trip.integration.spec.ts` > `[R1]` + `[R1/R7]` | ✅ COMPLIANT |
| R1 round-trip | Tickets del barrido preventivo en la hora del cron | El mecanismo está probado; la aserción sobre tickets reales sigue siendo manual (tarea 6.3) | ⚠️ PARTIAL |
| R2 coherencia created/updated | Los tres insumos conocidos quedan con created ≈ updated | `prisma_tenant/utc-backfill-fechas.integration.spec.ts` — la fixture `WU-R7-FIRMA-REAL` deja las dos columnas a 1,6 ms tras el backfill, con los números medidos en producción | ✅ COMPLIANT |
| R3 backfill histórico | El backfill corrige solo lo escrito por Prisma | `prisma_master/...` `[3.1/3.4]` · `prisma_tenant/...` `[4.1/4.2/4.3]` | ✅ COMPLIANT |
| R4 exactamente-una-vez | Una segunda corrida no re-corrompe | `prisma_master/...` `[3.2]` + `[R4]` · `prisma_tenant/...` `[R4]` (ambos spawnean `prisma migrate deploy` dos veces) — **pero ambos parten de un primer apply EXITOSO** | ⚠️ PARCIAL — ver CRITICAL-R4 |
| R5 tenant nuevo | Aprovisionamiento posterior al cambio | `postgres-admin.service.spec.ts` (4 casos) + `postgres-admin.service.integration.spec.ts` (`SHOW timezone` = UTC real) | ✅ COMPLIANT |
| R6 regresión no-UTC | La prueba fuerza la sesión y detecta el desvío | round-trip spec sobre base efímera con `ALTER DATABASE ... SET timezone TO 'America/Sao_Paulo'` | ✅ COMPLIANT |
| R7 invariantes temporales | Se auditan las tres invariantes tras el fix y el backfill | Contra `spec.md` versionado (tolerancia 1 s): `[4.4/R7]` tenant + `[R7]` master, RED re-derivado. Contra el locator `spec` de engram (invariante estricta, sin tolerancia): **violado por 2 filas, reproducido en esta corrida** | ❌ FAILING (ver CRITICAL-1 de ronda 2) |

**Compliance summary**: 5/8 escenarios compliant · 2 partial · 1 failing.

### Correctness (Static Evidence)

| Requisito | Estado | Notas |
|-----------|--------|-------|
| R1 / R6 | ✅ Implementado | Sin cambios respecto de la ronda 1; la remediación no tocó WU1. |
| R3 | ✅ Implementado | Loop catalogado + discriminador `% 1000 = 0`, ahora con orden determinístico del catálogo. |
| R4 | ⚠️ Implementado, probado solo para el camino feliz | Garantía externa al SQL vía `_prisma_migrations`, probada spawneando el CLI real **sobre un primer apply exitoso**. El camino fallo-y-reintento queda sin probar. Ver CRITICAL-R4. |
| R5 | ✅ Implementado | Sin cambios respecto de la ronda 1; la remediación no tocó WU2. |
| R7 | ⚠️ Implementado contra una de las dos copias del spec | El código cumple la versión con tolerancia de 1 s. La copia en engram todavía exige la invariante estricta. Ver CRITICAL-1. |
| `@db.Date` intacta | ✅ Verificado | Ahora con aserción de regresión en AMBOS specs: `feriados.fecha` (master) y `ciclos_cliente.fecha_inicio` (tenant, vía `::text`). WARNING-2 cerrado. |
| `_prisma_migrations` intacta | ✅ Verificado | Sin cambio tras el segundo `migrate deploy`, en ambos specs. |

### Coherence (Design)

| Decisión | ¿Seguida? | Notas |
|----------|-----------|-------|
| ADR-1 — tres garantías | ✅ Sí | Sin cambios; WU1/WU2 intactos. |
| ADR-2 — migración numerada, un archivo por schema, **en una sola transacción** | ❌ La premisa es falsa | `prisma migrate deploy` NO envuelve el archivo en una transacción. Medido: ver WARNING-1. El backfill en sí SÍ es atómico (es un único `DO $$`), así que no hay riesgo de backfill a medias. |
| ADR-3 — discriminador + segunda guarda | ✅ Sí | La dependencia del orden de catálogo quedó cerrada con el `ORDER BY`, con test de regresión propio y RED re-derivado. Addendum versionado en `design.md`. |
| ADR-3 — addendum de tolerancia R7 | ✅ Sí en `design.md` / ❌ No en engram | Decisión del dueño registrada en el archivo; la copia del spec en engram no se actualizó. Ver CRITICAL-1. |
| ADR-4 — el backfill no pasa por Prisma | ✅ Sí | SQL puro. La cláusula `SET LOCAL TimeZone='UTC'` que esta ADR menciona resulta inerte, sin impacto en el resultado (medido). Ver WARNING-1. |
| ADR-5 — `deploy.ps1` sin cambios | ✅ Sí | `git diff origin/main -- deploy.ps1` → 0 líneas. |
| ADR-6 — dump como precondición operativa | ✅ Sí | WU5 intacto. |
| ADR-7 — el test fuerza la sesión no-UTC | ✅ Sí | Vigente para el round-trip. No se extiende a los specs de backfill; ver WARNING-2. |

### TDD Compliance

| Check | Resultado | Detalle |
|-------|-----------|---------|
| Evidencia TDD reportada | ✅ | La tabla **TDD Cycle Evidence** ahora vive en el propio locator `apply-progress` (engram #4417), con 7 filas: WU1–WU4 más las tres unidades de remediación. WARNING-3 de la ronda 1 cerrado. |
| Todas las tareas de código tienen tests | ✅ | WU1–WU4 con spec propio; WU5 es el gap declarado y aceptado (no hay harness PowerShell). |
| RED confirmado | ✅ | Los dos RED de la remediación re-derivados de forma independiente en esta ronda (`expected 2 to be +0`; `expected '...T17:13:00.000Z' to be '...T20:13:00.000Z'`). |
| GREEN confirmado | ✅ | 5134/5134 en la corrida completa de esta verificación. |
| Triangulación | ✅ | Backfill tenant: corregible / base / ambiguo / firma real / orden de catálogo invertido / doble corrida. Master: µs=0 / µs≠0 / delta preservado / corrupción deliberada / exactamente-una-vez. |
| Safety net en archivos modificados | ✅ | Baseline verde previo documentado y reproducido (5132 → 5134). |

**TDD Compliance**: 6/6 checks.

### Test Layer Distribution

| Capa | Tests | Archivos | Herramienta |
|------|-------|----------|-------------|
| Unit | 7 (`utc-connection-string.spec.ts`) + 4 (`postgres-admin.service.spec.ts`) | 2 | Vitest |
| Fitness (lint) | 33 (`regla-env-vacio.lint.spec.ts`) | 1 | Vitest + ESLint API |
| Integración | 2 (round-trip) + 6 (backfill master) + 4 (backfill tenant) + 1 (alta de tenant real) | 4 | Vitest + Postgres real / bases efímeras |
| E2E | 0 propios del cambio | 0 | — |
| PowerShell | 0 | 0 | ➖ No existe harness en el repo (gap declarado en el threat matrix) |

### Assertion Quality

Las dos aserciones que la ronda 1 marcó quedaron corregidas y se verificó que
ahora discriminan:

| Archivo | Aserción | Estado |
|---------|----------|--------|
| `prisma_tenant/utc-backfill-fechas.integration.spec.ts:358` | `updated_at` de la fila ambigua | ✅ Corregida — la fixture pasó a microsegundos 998000 (`% 1000 = 0`, escribible por Prisma), así que la columna participa del paso genérico y la aserción `'2026-09-12T20:12:59.998Z'` puede fallar. WARNING-1 cerrado. |
| `prisma_tenant/utc-backfill-fechas.integration.spec.ts:414-448` | `[4.4/R7]` invariantes | ✅ Corregida — la fixture `WU-R7-FIRMA-REAL` reproduce la forma real y hace fallar la invariante estricta (verificado en esta ronda). |

Sin tautologías, sin ghost loops, sin aserciones que no ejecuten código de
producción, sin tests mock-heavy. Observación menor: la aserción dedicada de
firma real dentro de `[4.4/R7]` es redundante con el loop por tabla del mismo
test (ambos cubren la fila); el valor exacto de esa fila sí se verifica, con
poder de discriminación, en `[4.1/4.2/4.3]` líneas 367-368.

**Assertion quality**: 0 CRITICAL, 0 WARNING.

### Quality Metrics

**Linter**: ✅ Sin errores · **Type Checker**: ✅ Sin errores

### Issues Found

**CRITICAL**:

1. **La copia del spec en engram —el locator que declara el status nativo— sigue
   teniendo el R7 estricto previo a la remediación, y contra ese texto la
   implementación lo incumple de forma reproducible.**

   `gentle-ai sdd-status sesion-utc-y-backfill-de-fechas --json` reporta
   `artifactStore: engram` y `artifactPaths.specs =
   ["sdd/sesion-utc-y-backfill-de-fechas/spec"]`. Esa observación (engram #4412,
   `Revisions: 1`, creada el 2026-09-14 12:13 y **nunca actualizada**) no es un
   resumen: es el texto completo del spec, y su R7 dice todavía:

   ```text
   ... que ninguna fila tenga `updated_at` anterior a `created_at`, que ningún
   `movimientos_insumo.created_at` ...
   - THEN ninguna fila tiene `updated_at < created_at`
   ```

   Sin tolerancia. El archivo versionado
   (`openspec/changes/sdd/.../specs/fechas-sesion-utc/spec.md`, commit `e56f5d7`)
   dice "en más de 1 segundo" y trae el párrafo de decisión del dueño. **Las dos
   copias vivas del spec se contradicen exactamente en el requisito que hizo
   fallar la ronda 1.**

   No es una discrepancia teórica: contra el texto de engram, R7 se incumple, y
   está medido en esta misma verificación — con la invariante estricta,
   `[4.4/R7]` falla con `expected 2 to be +0` (la fila de firma real por 1,6 ms
   y la ambigua por 2 ms).

   Matiz que corresponde registrar: por §3.1 de `proyectos/CLAUDE.md`, Git es
   Nivel 1 y engram es caché, así que el dueño puede resolver que el archivo
   manda y degradar este hallazgo. Se reporta como bloqueante igual porque (a) el
   orquestador declaró persistencia `hybrid`, que obliga a escribir las dos
   copias, y la remediación escribió una sola; (b) `sdd-archive` lee el locator
   de engram, de modo que archivar hoy congela un spec que el código viola; y
   (c) cualquier `mem_search` futuro sobre este ciclo devuelve el R7 viejo.

   El arreglo no toca código: un `mem_save` de upsert sobre
   `topic_key: sdd/sesion-utc-y-backfill-de-fechas/spec` con el texto del archivo.
   No corresponde a `sdd-verify` hacerlo.

2. **R4 queda sin probar para el camino fallo-y-reintento.** Hallazgo aportado
   por la revisión RDD posterior a esta verificación (linaje
   `review-f4098720ccc4b038`, lente `reliability`), no por `sdd-verify`. Se
   desarrolla en la sección `## CRITICAL-R4` al final de este informe, y es la
   razón por la que R4 figura como `⚠️ PARCIAL` en la matriz y en la tabla de
   requisitos.

**WARNING**:

1. **`SET LOCAL TimeZone = 'UTC'` es INERTE bajo `prisma migrate deploy`, y el
   archivo de migración NO se aplica en una sola transacción.** La ronda de
   remediación afirma lo contrario ("`prisma migrate deploy` DOES wrap the whole
   migration.sql content in one implicit transaction — `SET LOCAL` takes effect
   as designed", verificado con una probe descartable), y lo mismo afirman ADR-2
   y la cabecera de **los dos** `migration.sql`. Medido tres veces en esta
   verificación, contra el binario real de Prisma 7.10.0:

   - Probe con una base cuya zona por defecto es `America/Sao_Paulo` (una base ya
     en UTC no discrimina): migración `SET LOCAL TimeZone='UTC'; CREATE TABLE
     tz_probe...; INSERT ... current_setting('TimeZone')` aplicada con
     `prisma migrate deploy` → el valor insertado es **`America/Sao_Paulo`**, no
     `Etc/UTC`.
   - El log del servidor emite `WARNING: SET LOCAL can only be used in
     transaction blocks` en esa misma corrida.
   - Control positivo: el MISMO SQL enviado como una sola `client.query()`
     multi-sentencia de `pg` (que sí abre una transacción implícita) inserta
     `UTC`. La probe discrimina.
   - Atomicidad, prueba directa: migración `CREATE TABLE paso_uno; INSERT...;
     SELECT 1/0; CREATE TABLE paso_dos`. Tras el fallo, **`paso_uno` sobrevive**.
     El archivo no es atómico.

   Probable causa de la conclusión equivocada de la remediación: la probe corrió
   contra una base efímera creada con `PostgresAdminService.createDatabase`, que
   desde WU2 hace `ALTER DATABASE ... SET timezone TO 'UTC'`. Ahí
   `current_setting('TimeZone')` devuelve UTC funcione o no el `SET LOCAL`.

   **Impacto en la corrección: ninguno, y está medido** (ver WARNING-2). El
   impacto real es otro: el backfill quedará corriendo bajo la zona de la sesión
   (en producción, `America/Sao_Paulo` — el `ALTER DATABASE` de la propia
   migración solo afecta a sesiones nuevas), y un fallo entre la sentencia del
   `ALTER DATABASE` y el `DO $$` del backfill deja el estado parcial que ADR-2
   dice que no puede existir (zona ya cambiada, datos sin corregir; recuperable
   por el dump de ADR-6). El backfill en sí es un único `DO $$`, o sea una sola
   sentencia y una sola transacción implícita: no hay riesgo de backfill a
   medias. Corresponde corregir el texto de ADR-2 y de las dos cabeceras, que
   hoy afirman algo falso sobre el motor.

2. **Ningún test ejercita el backfill bajo una sesión no-UTC.** Todas las bases
   efímeras de los specs de backfill las crea
   `PostgresAdminService.createDatabase`, que las deja en UTC. Dado WARNING-1, en
   producción la migración correrá bajo `America/Sao_Paulo`. Verificado a mano en
   esta ronda: se ejecutó el `migration.sql` real de tenant contra una base con
   `ALTER DATABASE ... SET timezone TO 'America/Sao_Paulo'`, con las cuatro
   fixtures del spec, y el resultado es idéntico al de la corrida en UTC
   (`corregible 07:00:00.000` · `base 10:00:00.123` · `ambiguo 20:13:00.000 /
   20:12:59.998` · `firma real 20:13:00.001 / 20:13:00.000`, 1 `RAISE NOTICE`).
   La aritmética es efectivamente independiente de la zona. Pero esa propiedad no
   tiene guarda en el repo, y R6 es justamente el requisito que declara que una
   prueba que solo corre en UTC no cuenta. Un `ALTER DATABASE ... SET timezone TO
   'America/Sao_Paulo'` en el `beforeAll` de los specs de backfill lo cerraría.

3. **WARNING-4 de la ronda 1 quedó cerrado a medias.** La parte de
   `soporte_master` sí se cerró: el test `[R7]` nuevo existe, corre después de la
   única corrida correcta y antes de la corrupción deliberada de `[3.2]`, y su
   fixture no es trivial (`created_at != updated_at`, delta preservado tras la
   traslación uniforme). La otra mitad del hallazgo —"ni contra ninguna base
   real"— sigue abierta: `DEPLOY-VPS-runbook.md` no menciona R7 ni las
   invariantes en su verificación post-deploy (cubre `SHOW timezone` y los
   tickets del preventivo), y las tareas 6.1–6.4 tampoco. Tras un backfill
   irreversible, las tres invariantes siguen siendo la propiedad que nadie va a
   comprobar contra los datos reales.

**SUGGESTION**:

1. `tablas_guarda_delta` sigue hardcodeada. La remediación lo investigó, confirmó
   por catálogo que hoy coincide exactamente con las 6 columnas
   `clock_timestamp()`, y decidió NO generalizarlo con una justificación
   razonable (no introducir un camino de código nuevo sin probar en la parte más
   riesgosa de una migración irreversible). Se acepta la decisión; queda como
   deuda para la eventual séptima tabla.

2. La asimetría entre artefactos de engram es lo que hizo posible CRITICAL-1:
   `design` (#4413) y `tasks` (#4416) son observaciones-puntero que declaran
   "artefacto completo en `openspec/...`", mientras que `spec` (#4412) es una
   copia verbatim completa. Una copia verbatim se desactualiza en silencio; un
   puntero no puede. Conviene unificar el criterio.

3. La aserción dedicada de firma real dentro de `[4.4/R7]` es redundante con el
   loop por tabla del mismo test. No es un defecto; se anota para que no se la
   lea como una segunda verificación independiente.

### Verdict

**FAIL** — la remediación de código es correcta y está probada: los dos CRITICAL
de la ronda 1 quedaron cerrados con REDs re-derivados de forma independiente en
esta verificación, WARNING-1/2/3 cerrados, WARNING-4 cerrado a medias, y lint,
typecheck y 5134/5134 en verde sin tocar WU1, WU2 ni WU5. **Bloquean dos
hallazgos, y ninguno es de código.**

**CRITICAL-1**: el locator `spec` que declara el status nativo sigue
exigiendo el R7 estricto que la implementación incumple de forma reproducible,
mientras el archivo versionado exige el R7 con tolerancia que sí cumple. Mientras
las dos copias se contradigan en ese requisito, archivar congela un spec que el
código viola.

**CRITICAL-R4** (agregado por la revisión RDD `review-f4098720ccc4b038`): R4
quedaba certificado sobre un primer apply exitoso sin re-evaluarse contra la
no-atomicidad que este mismo informe prueba. La ventana fallo → `migrate resolve`
→ reintento puede aplicar el backfill dos veces, no tiene test que la cubra, y
solo la cierra el marcador propio que el dueño decidió agregar. Hasta entonces,
R4 vale únicamente para el camino feliz.

Se suma, sin bloquear, que la premisa de transacción única de ADR-2
y la conclusión de la remediación sobre `SET LOCAL` son falsas contra el motor
real, sin impacto en la corrección del backfill (medido).

## CRITICAL-R4 — R4 queda sin probar para el único modo de falla que este mismo informe demostró alcanzable

**Corrección de este informe, exigida por la revisión RDD (linaje
`review-f4098720ccc4b038`, lente `reliability`, hallazgo
`R3-r4-retry-path-unproved`).**

Este informe certificaba R4 como `COMPLIANT` apoyándose en spawnear
`prisma migrate deploy` dos veces. Esa prueba **parte de un primer apply
exitoso**, y en otra sección el mismo informe establece por medición directa
que el archivo de migración **no es atómico**. Las dos conclusiones nunca se
cruzaron.

**La ventana que queda abierta.** El backfill es la última sentencia del
archivo y su `DO $$` es atómico, así que un fallo *dentro* del backfill lo
revierte entero y un reintento es seguro. Pero si el `DO $$` **commitea** y el
proceso muere antes de que Prisma registre el éxito en `_prisma_migrations`,
quedan los datos ya corridos y la migración marcada como fallida. Un
`prisma migrate resolve` seguido de reintento **vuelve a aplicar el backfill**:
una fila ya corregida conserva microsegundos `% 1000 = 0`, así que el
discriminador la matchea de nuevo y le resta otras 3 horas.

Es angosta, pero es real, y es exactamente el resultado irreversible que ADR-2
existe para evitar. Alcanzable, además, **por la no-atomicidad que este informe
acaba de probar** — de ahí que la certificación anterior no se sostenga.

**No hay test que cubra ese camino.** Ningún spec ejercita
fallo → `migrate resolve` → reintento.

**Decisión del dueño (2026-09-14)**: agregar al backfill un **marcador propio**
que lo vuelva no-op en una re-corrida, independiente de `_prisma_migrations`.
Es la opción que la exploración propuso y ADR-2 descartó con un argumento de
conveniencia ("el marcador necesitaría su propia tabla"), no de corrección.
Queda como trabajo siguiente, fuera del candidato congelado de esta revisión;
hasta que exista, **R4 vale solo para el camino feliz**.

