# Tasks: Sesión UTC en Postgres y backfill de las fechas corridas 3h

> Issue #173 — BUGFIX. TDD estricto ACTIVO (inyectado por el orquestador pese a
> `strict_tdd` del config): cada WU de código lleva RED → GREEN → REFACTOR y
> `sdd-apply` debe producir la tabla TDD Cycle Evidence.

## Remediación (sdd-verify FAIL round 1, 2026-09-14)

`sdd-verify` devolvió `FAIL` (2 CRITICAL, 4 WARNING) sobre la implementación de
WU1–WU5, ya con todas sus tareas marcadas `[x]`. La remediación no reabre
ninguna tarea (el trabajo declarado seguía hecho); corrige la evidencia y dos
defectos reales encontrados por la verificación, distribuidos en las ramas que
poseen cada archivo y mergeados hacia adelante por la cadena
(`backfill-master` → `backfill-tenant` → `dump-runbook`):

- **CRITICAL-1** (R7 inalcanzable por construcción): tolerancia de 1s
  agregada a R7 (`specs/fechas-sesion-utc/spec.md`, decisión del dueño del
  spec) + fixture con la firma real de producción (`created_at` de la base,
  `updated_at` de Prisma, delta ~3h) en el spec de tenant.
- **CRITICAL-2** (guarda de ADR-3 dependiente del orden de catálogo):
  `ORDER BY` agregado a ambas migraciones (`migration.sql` master y tenant) +
  test de regresión dedicado `[CRITICAL-2]` en el spec de tenant.
- **WARNING-1** (fixture ambigua con microsegundos no escribibles por Prisma),
  **WARNING-2** (falta assert de `@db.Date` intacto en tenant): corregidos en
  el spec de tenant.
- **WARNING-3** (evidencia TDD dispersa en observaciones adyacentes):
  consolidada en `apply-progress` (engram), ver tabla TDD Cycle Evidence.
- **WARNING-4** (R7 sin evidencia en `soporte_master`): test `[R7]` agregado
  al spec de master.

Detalle completo, con RED observado para la fixture de R7 y el test de
regresión de orden: `apply-progress` (engram
`sdd/sesion-utc-y-backfill-de-fechas/apply-progress`).

## Remediación (review lineage `review-f4098720ccc4b038`, lens reliability, 2026-09-14)

CRITICAL `R3-r4-retry-path-unproved`: R4 se había certificado corriendo
`prisma migrate deploy` dos veces sobre un primer apply que SALIÓ BIEN,
camino que no prueba nada sobre fallo-y-reintento — el camino que sí puede
duplicar un backfill irreversible. El `DO $$` del backfill es la última
sentencia del archivo y es atómico por sí mismo (commitea o rueda para
atrás como un todo), pero si COMMITEA y el proceso muere antes de que
Prisma deje registrado el éxito en `_prisma_migrations` (escritura de
bookkeeping separada de la transacción de datos), un reintento
(`prisma migrate resolve` + `migrate deploy`) vuelve a correr el archivo
completo: el discriminador de microsegundos no cambia al restar horas, así
que una fila ya corregida vuelve a calificar y se le restan otras 3h.

No reabre ninguna tarea de WU3/WU4 (ya `[x]`); agrega una guarda nueva,
distribuida por la rama dueña de cada archivo y mergeada hacia adelante
(`backfill-master` → `backfill-tenant` → `dump-runbook`):

- **Guarda nueva**: tabla `_utc_backfill_aplicado`, con check+INSERT DENTRO
  del mismo `DO $$` que hace el backfill (misma sentencia = misma
  transacción implícita que el `UPDATE`) — defensa en profundidad sobre
  `_prisma_migrations`, no reemplazo. Aplicada a ambas migraciones
  (`migration.sql` master y tenant), sin tocar el `ORDER BY` ni la segunda
  guarda de ADR-3 (CRITICAL-2, intactos).
- **Test nuevo `[R3/R4-retry]`** en ambos specs de integración: aplica el
  primer deploy real, borra la fila de `_prisma_migrations` de la migración
  bajo test (simula el crash post-commit), corre `migrate deploy` de nuevo,
  y afirma que ninguna fila se desplaza una segunda vez. RED observado por
  ejecución real antes de la guarda (07:00:00 → 04:00:00, doble resta de 3h
  confirmada en ambos schemas); GREEN tras agregar la guarda.
- **Test `[3.2]` de master actualizado**: antes documentaba que correr el
  SQL dos veces "corrompe" (justificación externa de la guarda); ahora
  documenta que el archivo completo ya es seguro ante una segunda corrida
  gracias al marcador — el discriminador por sí solo sigue sin ser
  idempotente por construcción, eso no cambió.
- **Documentación corregida**: ADR-2 de `design.md` justificaba el archivo
  único con "Prisma corre cada archivo en su propia transacción" —
  verificado FALSO con Prisma 7.10.0 (una sentencia que falla puede dejar
  sentencias previas del mismo archivo ya commiteadas). Corregido: la razón
  real es que el `DO $$` del backfill es atómico por sí mismo, más el
  marcador como guarda de una-sola-vez. ADR-4 corregido para explicar por
  qué se quitó `SET LOCAL TimeZone = 'UTC'` de ambas migraciones (inerte
  fuera de una transacción explícita — `psql -f` emite
  `WARNING: SET LOCAL can only be used in transaction blocks`, verificado
  empíricamente — y no aportaba corrección: la aritmética del backfill no
  depende del `TimeZone` de sesión). Cabeceras de ambos `migration.sql`
  corregidas con la misma aclaración.

Detalle completo, con RED observado y los comandos de verificación:
`apply-progress` (engram `sdd/sesion-utc-y-backfill-de-fechas/apply-progress`).

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1175 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Tracker → PR1 → PR2 → PR3 → PR4 → PR5 |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Cadena (feature-branch-chain)

```
main (origin/main = 3f6e63d)
 └─ fix/sesion-utc-y-backfill-de-fechas (tracker, draft, NO merge directo)
     └─ PR1 fix/...-conexion-utc            📍 WU1
         └─ PR2 fix/...-alta-tenant         📍 WU2
             └─ PR3 fix/...-backfill-master 📍 WU3
                 └─ PR4 fix/...-backfill-tenant 📍 WU4
                     └─ PR5 fix/...-dump-runbook 📍 WU5
```

Solo el tracker mergea a `main`, y solo tras integrar PR1→PR5 en orden. WU3/WU4
(migraciones) no pueden desplegarse sin WU1/WU2 (ADR-5): como ningún PR
intermedio toca `main`, ningún merge intermedio deja producción peor.

### Suggested Work Units

| WU | Goal | PR (base) | Focused test | Runtime harness | Rollback boundary |
|----|------|-----------|---------------|------------------|--------------------|
| 1 | Helper `conUtc` + guarda ESLint + `PrismaService` | PR1 (tracker) | `pnpm vitest run backend/src/shared/infrastructure/persistence/utc-connection-string.spec.ts backend/prisma_tenant/utc-sesion-round-trip.integration.spec.ts` | Vitest + base efímera `America/Sao_Paulo` (ADR-7) | `git revert` limpio, sin datos tocados |
| 2 | `createDatabase` con `ALTER DATABASE` (R5) + resto de pools | PR2 (PR1) | `pnpm vitest run backend/src/clientes/infrastructure/postgres-admin.service.spec.ts backend/src/clientes/infrastructure/postgres-admin.service.integration.spec.ts` | Vitest + mock Pool / base efímera | `git revert` limpio, no afecta tenants ya creados |
| 3 | Migración `prisma_master` (ALTER + backfill catalogado) | PR3 (PR2) | `pnpm vitest run backend/prisma_master/utc-backfill-fechas.integration.spec.ts` | Vitest, ejecuta el `migration.sql` real | Revert de código NO deshace backfill — requiere restore del dump (ADR-6) |
| 4 | Migración `prisma_tenant` + guarda `clock_timestamp()` | PR4 (PR3) | `pnpm vitest run backend/prisma_tenant/utc-backfill-fechas.integration.spec.ts` | Vitest, ejecuta el `migration.sql` real | Igual a WU3: revert + restore del dump |
| 5 | `predeploy-dump.ps1` + runbook | PR5 (PR4) | Verificación manual (sin harness PowerShell) | N/A — gap declarado, threat matrix | `git revert` limpio, script standalone |

### Requisitos cubiertos (spec `fechas-sesion-utc`)

R1 round-trip · R2 coherencia created/updated · R3 backfill histórico ·
R4 una-sola-vez · R5 tenant nuevo · R6 regresión no-UTC · R7 invariantes.
WU1→R1,R6 · WU2→R5 · WU3→R3,R4 · WU4→R2,R3,R4 · WU5/Post→R7 (auditoría manual).

## Phase 1 — WU1 (PR1, base tracker)

- [x] 1.1 RED: crear `backend/prisma_tenant/utc-sesion-round-trip.integration.spec.ts` — base efímera, `ALTER DATABASE <efimera> SET timezone TO 'America/Sao_Paulo'` (ADR-7), round-trip vía `PrismaService` y lectura `clock_timestamp()` vs `pg` crudo. Debe fallar hoy con desvío 10800s / −10800s. **Confirmado por ejecución real en WU2 (Postgres arriba): `pnpm vitest run prisma_tenant/utc-sesion-round-trip.integration.spec.ts` → 2/2 GREEN.**
- [x] 1.2 Crear `backend/src/shared/infrastructure/persistence/utc-connection-string.ts` — `conUtc(url)` agrega `options=-c TimeZone%3DUTC` una sola vez, preserva user/clave/query previa.
- [x] 1.3 Crear `backend/src/shared/infrastructure/persistence/utc-connection-string.spec.ts` (unit, sin base).
- [x] 1.4 GREEN: modificar `backend/src/shared/infrastructure/persistence/prisma.service.ts` (pools master :37/:39 y tenant :60/:62) — vía `conUtc()`.
- [x] 1.5 GREEN: correr 1.1, confirmar desvío 0 en ambos sentidos. **Confirmado en WU2: 2/2 GREEN con Postgres arriba.**
- [x] 1.6 Extender el ARRAY existente `reglaEnvStringVacio['no-restricted-syntax']` (`backend/eslint.config.js:155-180`) con selector `new Pool(` fuera de `utc-connection-string.ts`. CUPO DE UNO (comentario :89-97): NUNCA declarar una segunda clave `no-restricted-syntax` — reemplaza, no fusiona, y borra la regla de env vacío. **Implementado como un array combinado separado (`reglaPoolYEnvVacio`, construido por spread desde `reglaEnvStringVacio['no-restricted-syntax']`) en vez de mutar el array compartido in-place — mutarlo in-place lo hubiera propagado a TODOS los bloques que hacen `...reglaEnvStringVacio` (incluidos `scripts/**` y specs), rompiendo `pnpm lint` en archivos fuera del alcance de este WU. Ver Deviations en apply-progress.**
- [x] 1.7 Aplicar el selector nuevo solo a archivos de producción (bloque `ignores: ['**/*.spec.ts']`), porque los specs de round-trip abren `pg` crudo intencionalmente (ADR-7) para leer sin pasar por el driver de Prisma. **Alcance ampliado además a `ignores` temporales de `postgres-admin.service.ts`/`tenant-seeder.adapter.ts` (pendientes de migrar en WU2) — ver Deviations.**
- [x] 1.8 REFACTOR: `pnpm lint` + `pnpm typecheck`; confirmar `src/config/regla-env-vacio.lint.spec.ts` (read-only) sigue en verde. **`regla-env-vacio.lint.spec.ts` dejó de ser read-only: se le sumó un describe block nuevo cubriendo el selector de Pool (instrucción explícita del orquestador). `pnpm lint` y `pnpm typecheck` en verde.**
- [x] 1.9 PR body: anotar deuda de Ayuda (pausa desde 2026-09-07) — N/A funcional en este WU, dejarlo explícito igual. **Anotado en el cuerpo del commit: "Ayuda: sin deuda."**

## Phase 2 — WU2 (PR2, base PR1)

- [x] 2.1 RED: extender `backend/src/clientes/infrastructure/postgres-admin.service.spec.ts` — `createDatabase` debe emitir `ALTER DATABASE %I SET timezone TO 'UTC'` (mismo criterio de quoting que `quoteIdentifier`) tras `CREATE DATABASE`, antes de retornar. **4 tests nuevos, confirmados RED antes de tocar el código de producción (ver apply-progress).**
- [x] 2.2 GREEN: modificar `backend/src/clientes/infrastructure/postgres-admin.service.ts` (`createDatabase`, ~L33-41) — agregar el `ALTER DATABASE` sobre el pool admin; pool admin vía `conUtc()`. **Además: `insufficient_privilege` (42501) degrada a `console.warn`, no propaga; cualquier otro error del ALTER DATABASE sí propaga.**
- [x] 2.3 GREEN: modificar `backend/src/clientes/infrastructure/tenant-seeder.adapter.ts` (:219-221) — pool vía `conUtc()`.
- [x] 2.4 GREEN: modificar `backend/scripts/migrate-tenants.js` (:41) — pool vía `conUtc()`. **`conUtc()` se requiere desde `dist/` (el script es CommonJS y corre DESPUÉS del build en `deploy.ps1`) — mismo patrón que `post-deploy-smoke-matriz-permisos.mjs` con `dist/shared/domain/acciones.js`.**
- [x] 2.5 REFACTOR: extender `backend/src/clientes/infrastructure/postgres-admin.service.integration.spec.ts` para cubrir el `ALTER DATABASE` real (satisface R5); `pnpm lint` + `pnpm typecheck` + `pnpm test` backend en verde. **`pnpm test` backend completo: 429/429 archivos, 5124/5124 tests, 0 fallas.**
- [x] 2.6 (no listada en tasks.md, deuda dejada por WU1 — ver su apply-progress) Sacar `postgres-admin.service.ts`/`tenant-seeder.adapter.ts` de `ignores` en `eslint.config.js` (ya migrados a `conUtc()`) y agregar el bloque CommonJS para `backend/scripts/migrate-tenants.js`, preservando el CUPO DE UNO de `no-restricted-syntax` (extendiendo `reglaPoolYEnvVacio`, nunca una segunda clave). `backend/src/config/regla-env-vacio.lint.spec.ts` extendido con 7 casos nuevos cubriendo los tres archivos.

## Phase 3 — WU3 (PR3, base PR2)

- [x] 3.1 RED: crear `backend/prisma_master/utc-backfill-fechas.integration.spec.ts` — lee el `migration.sql` real del disco (precedente `backfill-correo-clientes.spec.ts`, read-only); fixtures µs=0 y µs≠0. **Confirmado RED por la razón correcta: 4/5 tests fallaban con `ENOENT` sobre el `migration.sql` inexistente (el 5º, de setup, no dependía del archivo).**
- [x] 3.2 RED (mismo spec): doble corrida del SQL vía `psql` directo corrompe (caracterización, ADR-4); dos `prisma migrate deploy` seguidos = no-op, una sola fila en `_prisma_migrations`. **Mismo spec, mismo RED que 3.1 (ambos casos fallan hasta que el archivo existe).**
- [x] 3.3 GREEN: crear `backend/prisma_master/migrations/20260914150000_sesion_utc_y_backfill_fechas/migration.sql` — `SET LOCAL TimeZone='UTC'`; `DO` con `ALTER DATABASE` vía `format('...%I...', current_database())` capturando `insufficient_privilege` con `RAISE WARNING`; loop catalogado sobre `information_schema` (`udt_name='timestamptz'`, `table_type='BASE TABLE'`, schema `public`, excluye `_prisma_migrations`); discriminador `EXTRACT(MICROSECONDS FROM col)::bigint % 1000`.
- [x] 3.4 GREEN: correr 3.1/3.2, confirmar verde. **`pnpm vitest run prisma_master/utc-backfill-fechas.integration.spec.ts` → 5/5 GREEN.**
- [x] 3.5 REFACTOR (threat matrix, SQL dinámico con `%I`): assert tras la migración `_prisma_migrations.started_at/finished_at` sin cambio y ninguna columna `date` (`@db.Date`) tocada; `pnpm typecheck`. **Ambos asserts viven en el mismo spec (test `[3.5]` dedicado a `feriados.fecha` vía `fecha::text`, y el assert de `started_at`/`finished_at` dentro del test del segundo `migrate deploy`). `pnpm typecheck` limpio.**

## Phase 4 — WU4 (PR4, base PR3)

- [x] 4.1 RED: crear `backend/prisma_tenant/utc-backfill-fechas.integration.spec.ts` — fixtures de las 6 columnas `clock_timestamp()` (`movimientos_insumo`, `modelos_equipo`, `familias_insumo`, `unidades_medida`, `insumos`, `insumos_codigos_alternativos`) más un caso ambiguo (µs=0 y delta `updated_at-created_at` en banda `2:59:55`–`3:00:05`): la fila ambigua NO debe cambiar y debe emitir `RAISE NOTICE`. **Confirmado RED por la razón correcta: `migration.sql` inexistente (ENOENT), luego `P3015` de Prisma tras crear la carpeta vacía.**
- [x] 4.2 GREEN: crear `backend/prisma_tenant/migrations/20260914150000_sesion_utc_y_backfill_fechas/migration.sql` — idéntico a 3.3 salvo cabecera, agrega la segunda guarda de exclusión sobre esas 6 columnas. **Hallazgo respecto del diseño: `movimientos_insumo` está en la lista de las 6 de ADR-3 pero es append-only y NO TIENE columna `updated_at` — no hay delta que calcular ahí. La guarda se salta en runtime para esa tabla puntual, detectado por catálogo (`tiene_updated_at`, no hardcodeado); su `created_at` queda cubierto solo por el discriminador primario, que ahí nunca puede confundirse (el mapper omite `createdAt` a propósito). Documentado en la cabecera del `migration.sql` y en el spec.**
- [x] 4.3 GREEN: correr 4.1, confirmar verde (fila ambigua intacta). **`pnpm vitest run prisma_tenant/utc-backfill-fechas.integration.spec.ts` → 3/3 GREEN.**
- [x] 4.4 REFACTOR: `pnpm test` backend completo en verde; auditar invariantes R7 sobre las fixtures (`updated_at >= created_at`, `movimientos_insumo.created_at >= insumo.created_at`, ninguna fecha `> now()`). **`pnpm test` → 431/431 archivos, 5132/5132 tests, 0 fallas. Invariantes R7 auditadas como assertions dentro del propio spec (test `[4.4/R7]`), verdes.**

## Phase 5 — WU5 (PR5, base PR4) — sin TDD automatizado (gap declarado)

- [x] 5.1 Crear `predeploy-dump.ps1` (raíz del repo, ASCII sin BOM): detiene los dos servicios y los deja detenidos; enumera bases desde `clientes.db_name` (activo=true) + `soporte_master` con `psql -t -A`; valida cada nombre contra `^[a-z_][a-z0-9_]*$` (mismo criterio que `assertValidIdentifier`, `postgres-admin.service.ts:27`, read-only) — un nombre inválido ABORTA, no se saltea; dump `-Fc` a `C:\soporte\backups\utc-backfill-<ts>\<db>.dump`; verifica cantidad de archivos, tamaño > 0 y `pg_restore --list` con la misma cantidad de tablas que la base origen (verificación **estructural**, corregida en el commit `e728ad6` — ver 5.2, ningún tenant comparte necesariamente el mismo catálogo de negocio); fail-closed: borra el dump parcial, rearranca servicios, y sale con código ≠0 si algo falla.
- [x] 5.1b Agregar al script el switch **`-DryRun`** (decisión del dueño, 2026-09-14). Con `-DryRun` el script NO detiene servicios, NO escribe archivos de dump y NO toca ninguna base: enumera desde `clientes.db_name` con `psql -t -A`, valida cada identificador y ABORTA ante uno inválido, verifica presencia y versión de `pg_dump`, espacio libre contra el tamaño estimado, y permiso del rol para dumpear cada base; reporta qué dumpearía y a qué rutas; sale con código ≠0 si falla cualquier precondición. La corrida real (sin el switch) mantiene el comportamiento de 5.1.
      **Por qué existe**: sin esto WU5 entrega un script de respaldo NUNCA ejecutado, que es exactamente el artefacto que ya falló en este repo — el dump de 0 bytes llamado `                 datname                  _predeploy_20260820.dump`, producto de leer `psql` sin `-t -A`. `-DryRun` es corrible contra producción sin riesgo, así que deja sin ejercitar solo el `Stop-Service` y el `pg_dump` en sí.
- [x] 5.2 Verificación manual del script (no hay harness PowerShell en el repo — gap aceptado en el threat matrix del design), corrida por el orquestador contra el VPS de producción el 2026-09-14. **Resultado: VERDE tras tres rondas de corrección, cada una por un defecto que solo la corrida real podía encontrar.**
      - **Ronda 1** — `psql` rechazó la URL: `invalid URI query parameter: "schema"`. `DATABASE_URL_MASTER` termina en `?schema=public`, parámetro exclusivo de Prisma que `pg` tolera y libpq rechaza. Además la URL iba como posicional principal, lo que hacía que `psql` ignorara `-t -A -c` como posicionales extra. Forma correcta medida en producción: `psql -t -A -d <url-sin-query> -c "..."`. Corregido en `e1755b6`, centralizado en `DbUrl()`.
      - **Ronda 2** — `pg_dump` sufre lo mismo, y **crea el archivo de salida ANTES de fallar**: con la URL sin despojar sale con código 1 y deja un dump de **0 bytes**. Es la forma exacta del artefacto histórico `C:\soporte\backups\                 datname                  _predeploy_20260820.dump`. Por eso la verificación de tamaño > 0 y `pg_restore --list` es carga estructural, no adorno, y el `catch` ahora borra la carpeta parcial entera.
      - **Ronda 3** — el predicado de verificación asumía esquema uniforme entre inquilinos (exigía `tickets` en cada tenant). **Falso**: medido en producción, Cic Lanus y Santa Cruz tienen 28 tablas y 0/5 de las críticas; Guadalupe e Inmaculada tienen 33 y 5/5 — con las mismas 39 migraciones. Reemplazado por un predicado **estructural** (cantidad de tablas del TOC = cantidad en la base origen) en `e728ad6`.
      - **Validación del predicado nuevo**, dumpeando a temporal contra producción (lectura, temporales borrados): Cic Lanus origen=28 TOC=28 **PASA** · Guadalupe origen=33 TOC=33 **PASA** · master origen=13 TOC=13 **PASA**. Confirmado además que el patrón `TABLE\s+public\s+\S+` NO matchea las entradas `TABLE DATA` (conteos separados 28/28, 33/33, 13/13).
      - **`-DryRun` final contra producción**: enumera las 5 bases desde el registro, valida identificadores, verifica espacio y conexión, y corta — `DRYRUN OK - ninguna base ni servicio fue tocado`, exit 0.
      - Pendiente para la ventana real (no ejercitable sin detener servicios): el `Stop-Service` y el `pg_dump` del camino completo.
      **Ronda 1 (2026-09-14)**: `-DryRun` encontró 2 defectos reales en la URL de conexión (`?schema=` rechazado por libpq + URL posicional ignorando flags) y un tercero más grave (`pg_dump` deja un dump de 0 bytes al fallar) — corregidos en `e1755b6`.
      **Ronda 2 (2026-09-14)**: probando `pg_dump`/`pg_restore` reales contra producción se detectó que el predicado de verificación asumía la tabla `tickets` en todo tenant — falso: 2 de los 4 tenants activos tienen 28 tablas en vez de 33 (tablas de ticketing borradas a mano por decisión del dueño, divergencia legítima). Reemplazado por una verificación estructural (conteo de tablas origen vs. TOC) en `e728ad6`.
      Sigue pendiente una corrida en verde (dumpeando un tenant de 28 tablas y uno de 33) para tildar esta tarea.
- [x] 5.3 Modificar `DEPLOY-VPS-runbook.md` — ventana atómica (ADR-5), dump como precondición operativa (ADR-6), verificación post-deploy `SHOW timezone` en sesión nueva por base, procedimiento de restore (`Stop-Service` → `pg_restore --clean --if-exists --no-owner` por base → revert+redeploy → `Start-Service`).
- [x] 5.4 Confirmar explícitamente en el PR body: `deploy.ps1` NO se modifica (ADR-5) — el backfill entra por `migrate:master`/`migrate:tenants`, ya dentro de la ventana `Stop-Service`→`Start-Service` existente. **Confirmado: `git diff 23142b8 -- deploy.ps1` → 0 líneas.**
- [x] 5.5 Anotar en PR body: alta de `predeploy-dump.ps1` en la tabla de scripts PowerShell de `~/proyectos/CLAUDE.md` (read-only) queda como commit separado en el repo padre, fuera de esta cadena. **Anotado en el cuerpo del commit `0923448`.**

## Phase 6 — Post-chain (operación, tras integrar PR1→PR5 en el tracker)

> **ORDEN CORREGIDO 2026-09-15.** La versión anterior listaba el merge a `main` como último
> paso (6.4), después del deploy. Es **inejecutable**: `deploy.ps1` solo despliega `main`
> (`:22` `$Branch = 'main'`; `:75-76` aborta si HEAD no es `main`; `:112`
> `git pull --ff-only origin $Branch`). Con el merge al final, el deploy corre `pull --ff-only`
> sobre el mismo commit que ya está en producción y termina **en verde sin desplegar nada** —
> sin migración, sin backfill, sin `ALTER DATABASE` — con los servicios ya detenidos por el
> dump y la ventana abierta al pedo. La verificación siguiente daría `SHOW timezone` ≠ `UTC` y
> se leería como un fallo del fix, cuando el fix nunca llegó al VPS.
> Verificado el 2026-09-15 con `git merge-base --is-ancestor`: `origin/main` = `3f6e63d` =
> idéntico al tracker, y `c3bcf54` (el fix de WU1) NO es ancestro de `origin/main`.

- [ ] 6.1 Integrar la cadena en orden: `gh pr merge 178 --merge`, luego `179`, `180`, `181`, `182`.
      Los cinco `MERGEABLE` y sin draft al 2026-09-15; cada uno con base en el anterior, y #178
      sobre el tracker. La punta `4606f07` ya contiene los 4 WUs de código (`c3bcf54`, `2220df2`,
      `816f045`, `54dc0cb`, confirmados como ancestros), porque la cadena se mergeó hacia adelante.
- [ ] 6.2 Mergear el tracker `fix/sesion-utc-y-backfill-de-fechas` → `main` y pushear.
      **COMPUERTA**: no abrir la ventana hasta que `git merge-base --is-ancestor c3bcf54 origin/main`
      salga con éxito. Anotar `git rev-parse --short origin/main` como punto de rollback de código.
- [ ] 6.3 Preflight de lectura en el VPS (no detiene nada): rama y commit actuales, y
      `git status --short` — un archivo sin versionar que colisione bloquea el `pull --ff-only`,
      y el 2026-08-20 ese fallo se reportó como éxito.
- [ ] 6.4 `predeploy-dump.ps1 -DryRun` en el VPS, como administrator. No detiene servicios, no
      escribe archivos, no toca ninguna base. `echo "EXIT=$LASTEXITCODE"` en su propia línea,
      nunca detrás de un pipe.
- [ ] 6.5 `predeploy-dump.ps1` (corrida real). **Acá arranca la ventana**: deja los dos servicios
      DETENIDOS a propósito, para que el punto de restore quede exacto. Anotar el directorio
      `C:\soporte\backups\utc-backfill-<ts>\` que reporta — es el único rollback de datos, porque
      el backfill resta ~3h a los valores históricos y `git revert` no las devuelve.
- [ ] 6.6 Deploy vía `deploy.ps1` (sin cambios de código, ADR-5). Tolera los servicios ya
      detenidos y los arranca en su paso 11.
- [ ] 6.7 Verificación manual post-deploy: `SHOW timezone` = `UTC` en sesión **nueva** por base
      (`soporte_master` + cada tenant activo, enumerados desde `clientes`, nunca hardcodeados —
      el sufijo hex cambia si el tenant se recrea). Más el `curl` externo a
      `https://soporte.sesitec.net/` y los dos smokes del repo, con `C:\nodejs24` antepuesto al
      PATH (el `node` del PATH es el 22, el equivocado).
- [ ] 6.8 Al día siguiente: los tickets del barrido preventivo caen en `01:00` hora local
      (`preventivo-sweep.scheduler.ts:44`, read-only) — criterio de aceptación del proposal y
      **evidencia de R7**, que es justo lo que le faltaba a verify ronda 2 (`requirements: 5/7`).
      Recién con esto en mano corre `sdd-verify` ronda 3.
