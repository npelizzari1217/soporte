# Apply Progress: Sesión UTC en Postgres y backfill de las fechas corridas 3h

> Issue #173 — BUGFIX. Registro acumulativo de implementación del ciclo
> `sesion-utc-y-backfill-de-fechas`.
>
> **Materializado como archivo el 2026-09-15** desde la observación de engram
> `sdd/sesion-utc-y-backfill-de-fechas/apply-progress` (#4417, 9 revisiones), que hasta
> entonces era el único lugar donde este artefacto existía. En modo `openspec` el
> dispatcher nunca consulta engram, así que un artefacto engram-only deja de existir
> para él.

## Segunda ronda de remediación — CRITICAL `R3-r4-retry-path-unproved`

Corrige el hallazgo CRITICAL de la revisión Gentle AI (linaje `review-f4098720ccc4b038`,
lente reliability). Todo lo de abajo es **aditivo** sobre la ronda 1: nada de aquella
ronda se reabrió ni se revirtió.

**Por qué hizo falta.** La evidencia de R4 de la ronda 1 corría `prisma migrate deploy`
dos veces sobre un primer apply que **salió bien** — eso no prueba nada sobre el camino
fallo-y-reintento, que es justamente el que puede aplicar dos veces un backfill
irreversible. El bloque `DO $$` del backfill es la ÚLTIMA sentencia del archivo y es
atómico por sí mismo (commitea o rueda para atrás como un todo), pero si COMMITEA y el
proceso muere antes de que Prisma registre el éxito en `_prisma_migrations` (esa
escritura de bookkeeping es SEPARADA de la transacción de datos), un reintento
(`prisma migrate resolve` + `migrate deploy`) vuelve a correr el archivo entero. El
discriminador de microsegundos (ADR-3) no cambia al restar horas, así que una fila ya
desplazada vuelve a calificar y se le restan otras 3h.

## Qué se construyó

Guarda propia del backfill, independiente de `_prisma_migrations`, en LOS DOS
`migration.sql`:

- `backend/prisma_master/migrations/20260914150000_sesion_utc_y_backfill_fechas/migration.sql`
- `backend/prisma_tenant/migrations/20260914150000_sesion_utc_y_backfill_fechas/migration.sql`

Tabla nueva `_utc_backfill_aplicado (migration text PK, aplicado_en timestamptz,
filas_corregidas bigint)`, creada por su propia sentencia idempotente
`CREATE TABLE IF NOT EXISTS`. El check-and-insert vive DENTRO del mismo bloque `DO $$`
que hace el backfill (misma sentencia = misma transacción implícita que los `UPDATE`):
se chequea ANTES de tocar una sola fila; si ya está, `RAISE NOTICE` + `RETURN` — no-op
limpio. El conteo de filas sale de `GET DIAGNOSTICS ... = ROW_COUNT` y se guarda en el
marcador. La tabla del marcador está excluida del loop catalogado
(`col.table_name <> '_utc_backfill_aplicado'`) para que su propio barrido no la levante.
La garantía de `_prisma_migrations` NO se quita: el marcador es defensa en profundidad
para el camino de fallo-y-reintento, `_prisma_migrations` sigue cubriendo el ordinario.
El `ORDER BY` y la segunda guarda de ADR-3 (delta de fila ambigua) NO se tocaron.

**Se quitó `SET LOCAL TimeZone = 'UTC'` de los dos archivos.** Investigado
empíricamente antes de removerlo, no por la afirmación del prompt: confirmado vía
`psql -f` que las sentencias de nivel superior corren en autocommit fuera de una
transacción explícita, así que ahí `SET LOCAL` SÍ emite
`WARNING: SET LOCAL can only be used in transaction blocks` (reproducido). Pero vía
`pg.Pool.query()` con el archivo completo como una sola llamada (lo que hacen los specs
de integración) Y vía `prisma migrate deploy` real (se armó una carpeta de migración
sonda y se corrió contra una base efímera) — ninguno emite el warning; `SET LOCAL`
estaba funcionando en silencio en los dos caminos reales. Se quitó igual porque la
corrección del backfill nunca dependió del TimeZone de sesión (`timestamptz - INTERVAL`
y `EXTRACT(MICROSECONDS FROM ...)` son ambos independientes de la zona) — era intención
documental, no un requisito funcional, y dejar una sentencia cuyo efecto varía según
CÓMO se ejecute el archivo es exactamente el tipo de trampa que esta ronda vino a
corregir.

**Corregida la afirmación falsa** "Prisma corre cada archivo de migración dentro de su
propia transacción" en las cabeceras de ambos `migration.sql` y en ADR-2 de `design.md`
— verificada falsa de forma independiente (sonda del orquestador con Prisma 7.10.0:
`paso_uno` sobrevive a un fallo a mitad de archivo). ADR-2 reescrita con la
justificación real (el `DO $$` del backfill es atómico como sentencia única, el marcador
es la guarda de una-sola-vez) más un addendum completo explicando la ventana alcanzable
y el arreglo. ADR-4 corregida: explica por qué se quitó `SET LOCAL`, y aclara que el
discriminador de microsegundos por sí solo SIGUE sin ser idempotente por construcción
(eso no cambió) — lo que cambió es que el ARCHIVO ahora se auto-protege.

## TDD Cycle Evidence

| Test file | RED (observado) | GREEN | REFACTOR |
|---|---|---|---|
| `prisma_master/utc-backfill-fechas.integration.spec.ts`, nuevo `[R3/R4-retry]` | Corrido contra el `migration.sql` pre-guarda: primer `prisma migrate deploy` real (base vacía), fixture de `clientes` insertada en `2026-09-01T07:00:00.000Z` (µs=0, simula una fila ya desplazada), borrada la fila de `_prisma_migrations` de la migración bajo test (simula crash post-commit), segundo `migrate deploy` → `AssertionError: expected '2026-09-01T04:00:00.000Z' to be '2026-09-01T07:00:00.000Z'` — doble desplazamiento exacto (07:00→04:00, −6h acumuladas contra el instante real), confirmado por ejecución directa. | Agregada la guarda del marcador al `migration.sql`, re-corrido: 7/7 GREEN (`pnpm vitest run prisma_master/utc-backfill-fechas.integration.spec.ts`). | Actualizado `[3.2]` (antes caracterizaba "correr dos veces CORROMPE") — ahora documenta que el archivo también es seguro ante una segunda corrida cruda; el discriminador solo sigue sin ser idempotente por construcción, eso no cambió. |
| `prisma_tenant/utc-backfill-fechas.integration.spec.ts`, nuevo `[R3/R4-retry]` | Mismo patrón, usando una tabla ad-hoc `zz_retry_probe` (aísla el caso de la segunda guarda de ADR-3 — ninguna de las 6 tablas protegidas participa) creada DESPUÉS del primer deploy: `AssertionError: expected '2026-09-01T04:00:00.000Z' to be '2026-09-01T07:00:00.000Z'` — números idénticos a master. | 5/5 GREEN (`pnpm vitest run prisma_tenant/utc-backfill-fechas.integration.spec.ts`). | Fila de `_prisma_migrations` confirmada restaurada tras el reintento (chequeo de defensa en profundidad) en ambos specs. |

## Verificación (backend/, punta dump-runbook, post-merge de backfill-master → backfill-tenant → dump-runbook)

| Comando | Resultado |
|---|---|
| `pnpm vitest run prisma_master/utc-backfill-fechas.integration.spec.ts prisma_tenant/utc-backfill-fechas.integration.spec.ts prisma_tenant/utc-sesion-round-trip.integration.spec.ts` | 14/14 GREEN |
| `pnpm lint` | 0 errores |
| `pnpm typecheck` | 0 errores |
| `pnpm test` (completo, corrido DOS veces — pre-merge sobre el contenido de backfill-tenant y post-merge sobre la punta dump-runbook, archivos byte-idénticos verificados por diff) | 431/431 archivos, **5136/5136** tests (baseline era 5134; +2 por los dos `[R3/R4-retry]` nuevos), exit 0 las dos veces |
| `git diff origin/main -- deploy.ps1` | 0 líneas (ADR-5 sigue en pie) |

## Work Unit Evidence

| Evidencia | Valor |
|---|---|
| Comando de test focalizado y resultado | `pnpm vitest run prisma_master/utc-backfill-fechas.integration.spec.ts prisma_tenant/utc-backfill-fechas.integration.spec.ts prisma_tenant/utc-sesion-round-trip.integration.spec.ts` → 14/14 GREEN |
| Runtime harness | Postgres real vía bases efímeras, `migration.sql` real leído del disco, subproceso `prisma migrate deploy` real manejando la reproducción de fallo-y-reintento (borrar la fila de `_prisma_migrations`, redesplegar) — sin mocks |
| Frontera de rollback | Los archivos de migración ganaron una tabla marcadora aditiva + lógica de guarda (sin remover DDL existente); limpio para `git revert` a nivel de código. El rollback de datos sigue requiriendo el dump por ADR-6, sin cambios en esta ronda |

## Higiene de ramas (nunca rebaseadas, nunca force-pusheadas, todas pusheadas)

- `fix/sesion-utc-y-backfill-de-fechas-backfill-master` → `816f045`: `migration.sql` de master + `utc-backfill-fechas.integration.spec.ts`.
- `fix/sesion-utc-y-backfill-de-fechas-backfill-tenant` → mergeó master hacia adelante, luego `54dc0cb`: `migration.sql` de tenant + `utc-backfill-fechas.integration.spec.ts` + `design.md` (correcciones de ADR-2/ADR-4, primer dueño acá por la convención de la ronda previa).
- `fix/sesion-utc-y-backfill-de-fechas-dump-runbook` (punta) → mergeó tenant hacia adelante (`6306a62`), luego `65a2d85`: nota de remediación en `tasks.md`. El tracker `fix/sesion-utc-y-backfill-de-fechas` y `main` quedaron intactos.
- Se usó `git worktree add` para las dos ramas dueñas en vez de `git checkout` en el worktree principal, específicamente para no perturbar el `verify-report.md` trackeado-pero-sin-commitear (llevaba un receipt de review quemado, con instrucción explícita de no tocarlo) — confirmado intacto (diff de 288 inserciones/155 borrados sin cambios) en todo momento.

## Deuda de Ayuda/KB

Sin cambios: **Ayuda: sin deuda.** No cambió ningún comportamiento visible para el usuario — es un arreglo interno de seguridad de migración.

## Estado al cierre de esta ronda

32/32 tareas de WU1–WU5 siguen `[x]` (sin cambios — esta ronda agrega una guarda defensiva, no alcance nuevo). CRITICAL `R3-r4-retry-path-unproved`: corregido y verificado por reproducción real del fallo-y-reintento, no afirmado. **Siguiente: sdd-verify.**
