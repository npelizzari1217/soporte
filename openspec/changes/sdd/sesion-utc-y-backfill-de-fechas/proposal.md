# Proposal: Sesión UTC en Postgres y backfill de las fechas corridas 3h

> Ciclo SDD `sesion-utc-y-backfill-de-fechas` — issue #173. Tipo de trabajo: **corrección de defecto**.
> Insumo: `openspec/changes/sdd/sesion-utc-y-backfill-de-fechas/exploration.md` (espejo engram id 4410).

## Intent

`@prisma/client` 7.10.0 + `@prisma/adapter-pg` 7.9.1 serializan un `Date` de JS como string naive. La
sesión Postgres de producción corre en `America/Sao_Paulo` (UTC−3), así que **suma 3h al escribir** y
**resta 3h de más al leer** (`adapter-pg/src/conversion.ts`, `normalize_timestamptz`). El defecto es
simétrico y por eso silencioso: un round-trip enteramente vía Prisma se autocancela.

**Por qué ahora.** Es silencioso, no inofensivo: cada día que corre escribe más filas corrompidas
(+3h respecto del instante real), y no hay ruta de "esperar la próxima versión" — `prisma/orm#26786`,
`#28629` y `#29662` siguen ABIERTAS, y los PRs de arreglo `#29481` y `#29666` siguen SIN MERGEAR.
Además, los fixes #159 y #172 ya crearon el borde donde el defecto se ve: las 6 columnas que ahora
usa `clock_timestamp()` son generadas por la base y leídas por Prisma, así que la resta de 3h ya no
se cancela y **hoy se muestran 3h en el pasado**.

**Qué cambia para el usuario.** Esas fechas pasan a mostrarse correctas, y las ~1614 fechas
históricas escritas por Prisma (almacenadas +3h) quedan corregidas. La Ayuda (`backend/ayuda/*.md`)
está en pausa desde 2026-09-07: no se escriben artículos, pero **la deuda se anota obligatoriamente
en el mensaje del commit y en el cuerpo del PR**.

## Scope

### In Scope

- Fijar la sesión Postgres en UTC para todo el tráfico de fechas de la aplicación.
- **Backfill único** de los ~1614 valores `timestamptz` escritos por Prisma en `soporte_master` y en
  cada base de inquilino activa, con garantía de ejecución exactamente-una-vez.
- Fix y backfill **atómicos en la misma ventana de deploy** (`deploy.ps1`, hueco entre
  `migrate:tenants` y `Start-Service`). Separados dejan el sistema peor: +3h o −6h según el orden.
- Test de regresión que **fuerce una sesión no-UTC** (`SET TIME ZONE 'America/Sao_Paulo'`; precedente
  en `ticket-fecha-cierre-timestamptz.integration.spec.ts:91-97`).
- Nota operativa en `DEPLOY-VPS-runbook.md`.
- Anotación de deuda de Ayuda en commit y PR.

### Out of Scope

| Excluido | Por qué |
|---|---|
| `Feriado.fecha` / `@db.Date` leída como medianoche UTC (ADR-4, hallazgo #2542) | Mecanismo y causa distintos: `DATE` no tiene zona. Mezclarlo es scope creep. |
| Migrar las ~30 tablas restantes de `@default(now())` a `clock_timestamp()` | El fix de sesión corrige el driver **para todas las columnas por igual**. Los 17 mappers que emiten `createdAt` explícito **NO se tocan**. |
| El proyecto `educandow` | Comparte VPS y servidor Postgres, pero no es este repo ni este ciclo. |

## Capabilities

### New Capabilities

- `fechas-sesion-utc`: toda fecha `timestamptz` escrita o leída por la aplicación representa el mismo
  instante que declara la base, sea cual sea el `TimeZone` del cluster; y el dato histórico refleja
  ese mismo contrato.

### Modified Capabilities

- Ninguna. `openspec/specs/` solo contiene capabilities `preventivo-*`, ajenas a este cambio.

## Approach

Dos piezas, un solo despliegue:

1. **Corrección de sesión.** La exploración evalúa tres rutas: (1) `options=-c TimeZone=UTC` por
   conexión, (2) `ALTER DATABASE <db> SET timezone TO 'UTC'`, (3) ambas. **Recomienda la 3** (la 1 ya
   está validada en producción; la 2 es la única que blinda el aprovisionamiento de tenant nuevo en
   `PostgresAdminService.createDatabase`). El resultado de producto es idéntico en las tres: **la
   decisión se deja explícitamente a `sdd-design`**, esto es insumo, no cierre.
2. **Backfill.** Discriminador: microsegundos `% 1000 <> 0` ⇒ escrita por Postgres (certeza
   absoluta); `= 0` ⇒ escrita por Prisma (999/1000). Restar 3h a las de Prisma. Debe escribirse en
   `pg` crudo (no vía Prisma, para no re-disparar el bug) y con **guarda de una-sola-vez**: el
   discriminador NO es idempotente (restar 3h no cambia los microsegundos). `sdd-design` elige entre
   migración Prisma numerada o script con fila marcadora.

Entrega: **PRs encadenados automáticos**, presupuesto de 400 líneas por PR. El corte lo confirma
`sdd-tasks`.

## Affected Areas

| Área | Impacto | Descripción |
|---|---|---|
| `backend/src/shared/infrastructure/persistence/prisma.service.ts` | Modified | Pool master (:37-39) y por tenant (:60-62) — sirve el 100% del tráfico de fechas |
| `backend/src/clientes/infrastructure/postgres-admin.service.ts` | Modified | `createDatabase` (:33-41) hoy no fija zona: un tenant nuevo nace con el defecto |
| `backend/src/clientes/infrastructure/tenant-seeder.adapter.ts` | Modified | Pool propio (:219-221) para catálogos de tenant nuevo |
| `backend/scripts/` (backfill nuevo) | New | Corrección de datos, `pg` crudo, ejecución única |
| `deploy.ps1` | Modified | Invocación del backfill en el hueco :216-255 |
| Spec de regresión con sesión no-UTC forzada | New | El entorno local es ciego al bug sin esto |
| `DEPLOY-VPS-runbook.md` | Modified | Nota de la ventana atómica |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| **El backfill es irreversible** sobre datos reales de 2 inquilinos activos | Alta (es su naturaleza) | Dump de `soporte_master` y de cada base de inquilino ANTES del `Start-Service`, dentro de la misma ventana. El rollback de datos es el restore, no un revert |
| Falso positivo del discriminador: una fila escrita por Postgres con microsegundos múltiplo de 1000 | Baja (~0,2 filas esperadas sobre 195) | Segunda guarda independiente para las 6 columnas `clock_timestamp()`: el delta `updated_at − created_at` ≈ `02:59:59.99…`. Riesgo residual aceptado y declarado |
| **El entorno local es ciego al bug** (Docker corre `TimeZone=UTC`): un test que no fuerce sesión no-UTC pasa sin probar nada | Alta | El RED del ciclo TDD debe fallar por la razón correcta con `SET TIME ZONE` explícito. `sdd-verify` lo exige |
| Doble corrida del backfill re-corrompe en sentido opuesto | Media | Guarda de exactamente-una-vez chequeada ANTES de tocar cualquier fila |
| Desplegar fix y backfill por separado | Media | Una sola ventana `Stop-Service` → migraciones → backfill → `Start-Service` |
| Reintroducción silenciosa por un punto de conexión futuro sin el flag | Media | Es el argumento a favor del approach combinado; lo resuelve `sdd-design` |

## Rollback Plan

- **Código**: `git revert` de los PRs de la cadena. Restituye el comportamiento previo del driver.
- **Datos**: NO se revierten con `git`. El único rollback es el restore del dump tomado en la misma
  ventana. Por eso el dump es precondición de arranque, no una recomendación.
- Revertir el código **sin** restaurar los datos deja las fechas ya corregidas mostrándose −3h: si se
  revierte, se revierten las dos piezas juntas.

## Dependencies

- Ventana de mantenimiento en el VPS Windows (`deploy.ps1`, `Stop-Service`).
- Dump verificado de `soporte_master` y de cada base de inquilino activa.
- Ninguna dependencia upstream: los fixes de Prisma siguen abiertos y no se los espera.

## Success Criteria

- [ ] Con la sesión Postgres en `America/Sao_Paulo`, un round-trip escritura→lectura vía Prisma
      devuelve el mismo instante que `clock_timestamp()` de la base (desvío = 0).
- [ ] El test de regresión **falla** contra el código actual forzando sesión no-UTC (RED verificado).
- [ ] **Los tickets del barrido preventivo quedan en `01:00` local** — la hora que el propio cron
      declara (`CronExpression.EVERY_DAY_AT_1AM`), no `04:00`.
- [ ] Las 6 columnas `clock_timestamp()` dejan de mostrarse 3h en el pasado.
- [ ] Un inquilino creado después del cambio nace ya sin el defecto.
- [ ] El backfill corre una sola vez; una segunda invocación no modifica ninguna fila.
- [ ] La deuda de Ayuda queda anotada en el mensaje del commit y en el cuerpo del PR.
- [ ] `pnpm lint`, `pnpm typecheck` y `pnpm test` en verde en `backend/`.
