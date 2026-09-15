# Exploration: sesión UTC en Postgres/Prisma + backfill de fechas corrompidas por el desvío de 3h

> Ciclo SDD `sesion-utc-y-backfill-de-fechas` — issue #173.
> Artefacto espejo de engram `sdd/sesion-utc-y-backfill-de-fechas/explore` (id 4410).

## Current State

**El defecto (issue #173).**

`@prisma/client` 7.10.0 + `@prisma/adapter-pg` 7.9.1 serializan un `Date` de JS como string NAIVE
(sin offset). La sesión Postgres de producción tiene `TimeZone = America/Sao_Paulo` (UTC-3), así
que interpreta ese string como hora LOCAL y le suma 3h al guardar. Al leer hace el camino inverso
mal — swap de la etiqueta de offset sin convertir el componente de hora, en
`adapter-pg/src/conversion.ts`, función `normalize_timestamptz` — y resta 3h de más.

**El defecto es SIMÉTRICO**: un round-trip escritura-Prisma → lectura-Prisma se autocancela. Por eso
quedó oculto. Solo se manifiesta donde los dos mundos se tocan: una fecha generada por la base y
leída por Prisma (las columnas `clock_timestamp()`), o una fecha escrita por Prisma y leída por SQL
crudo.

Reproducción en vivo en producción (solo lectura, cero escrituras):

```
NODE   toISOString()    = 2026-09-14T09:31:01.231Z
PG     clock_timestamp()= 2026-09-14 09:31:01.768 UTC   <- los relojes COINCIDEN
PRISMA entendio el Date = 2026-09-14 12:31:01.231 UTC
DESVIO = 10800 segundos (3.0000 horas)
```

```
SIN tocar TimeZone:            ESCRITURA +3h  /  LECTURA -3h
CON options=-c TimeZone=UTC:   ESCRITURA  0h  /  LECTURA  0h
```

Confirmado en este repo de forma independiente: `backend/prisma_tenant/ticket-fecha-cierre-timestamptz.integration.spec.ts:84-101`
ya deja escrito "UTC en Docker local, America/Sao_Paulo en prod". La suite de integración ya sabía
que el entorno local es CIEGO a este bug por construcción.

**Antigüedad probada.** El defecto existe desde el primer deploy, no desde el upgrade a Prisma 7.
`preventivo-sweep.scheduler.ts:44` declara `@Cron(... ?? CronExpression.EVERY_DAY_AT_1AM)` — dispara
a la 01:00 local, y `PREVENTIVO_SWEEP_CRON` no está definida ni en el `.env` de producción ni en el
entorno NSSM. Los tickets que creó ese cron están guardados con hora local aparente `08-31 04:00:02`
y `09-02 04:00:03`. `04:00 − 3h = 01:00`, exactamente el cron. Ambas fechas son ANTERIORES al
upgrade a Prisma 7 (`42b3f99`, 2026-09-09), y coherentes con que `@prisma/adapter-pg` entró en
`e071f2e` (2026-08-07, el rewrite inicial).

**Consecuencia**: todo valor de fecha escrito por Prisma está +3h, uniformemente, desde el día uno.
El backfill NO necesita fecha de corte.

**Estado upstream.** No hay ruta de "actualizar y listo":

| Issue | Lado | Estado |
|---|---|---|
| `prisma/orm#26786` | lectura | ABIERTA desde 2025-03-30 |
| `prisma/orm#28629` | escritura | ABIERTA desde 2025-11-21 |
| `prisma/orm#29662` | ambos | ABIERTA desde 2026-06-26 |

Los PRs de arreglo `#29481` y `#29666` están ABIERTOS y SIN MERGEAR. El changelog de 7.10.0
(2026-08-25) no menciona timezone. Prisma no documenta en ningún lado que la sesión deba ser UTC.

**Por qué el fix y el backfill deben ir ATÓMICOS.** Si se backfillean las ~1614 filas restando 3h
SIN desplegar el fix de sesión, la lectura de Prisma (que sigue restando 3h de más) las mostraría
con −6h. Si se despliega el fix SIN backfillear, esas filas se mostrarían +3h. `deploy.ps1` ya tiene
la ventana correcta: `Stop-Service` (:206) → `migrate:master` (:210) → `migrate:tenants` (:213) →
hueco de backfill (:216-255, precedente `backfill-correo-clientes.mjs`) → `Start-Service` (:258).

## Affected Areas

### 1. Puntos de construcción de conexión — lista COMPLETA (7, no 2)

Producción:

| Archivo | Línea | Qué abre |
|---|---|---|
| `shared/infrastructure/persistence/prisma.service.ts` | 37, 39 | Pool + PrismaPg del `MasterPrismaClient` |
| `shared/infrastructure/persistence/prisma.service.ts` | 60, 62 | Pool + PrismaPg por tenant (lazy, cacheado) |
| `clientes/infrastructure/postgres-admin.service.ts` | 70 | Pool admin contra `postgres` (DDL; sin I/O de fechas) |
| `clientes/infrastructure/tenant-seeder.adapter.ts` | 219-221 | Pool + PrismaPg para sembrar catálogos de tenant nuevo |
| `backend/scripts/migrate-tenants.js` | 41 | Pool crudo para el fan-out de `migrate:tenants` |
| `backend/prisma.config.ts` / `prisma.tenant.config.ts` | 23 / 24 | NO instancian Pool: alimentan el CLI para DDL |
| `clientes/infrastructure/tenant-migration-runner.adapter.ts` | 48-54 | Spawnea `prisma migrate deploy` |

`prisma.service.ts:60,62` es el único punto que sirve el 100% del tráfico de fechas de la app hacia
los tenants. Los seed scripts (`demo-seed.ts`, `root-bootstrap.seed.ts`) NO abren pool propio: usan
el `PrismaService` inyectado, así que quedan cubiertos indirectamente.

### 2. Columnas `@db.Timestamptz`

`prisma_tenant/schema.prisma` — 32 modelos. `prisma_master/schema.prisma` — 12 modelos.
Lista completa por tabla en el artefacto de engram (id 4410).

**Nota de alcance**: las columnas `@db.Date` (`fecha_inicio`, `fecha_solicitud`, `fecha_adquisicion`,
`proxima_ejecucion_en`, `Feriado.fecha`, etc.) NO están afectadas por este bug — `DATE` no tiene
componente de hora ni zona. `Feriado.fecha` tiene un problema DISTINTO ya documentado
(`schema.prisma:478-484`, ADR-4, hallazgo #2542). **No mezclar los dos en la spec.**

### 3. `clock_timestamp()` vs `now()`

Exactamente **6 columnas en 5 migraciones**:

| Migración | Columna |
|---|---|
| `20260911210000_movimientos_created_at_clock_timestamp` | `MovimientoInsumo.createdAt` (#159) |
| `20260912120000_modelos_equipo_created_at_clock_timestamp` | `ModeloEquipo.createdAt` |
| `20260912120100_familias_insumo_created_at_clock_timestamp` | `FamiliaInsumo.createdAt` |
| `20260912120200_unidades_medida_created_at_clock_timestamp` | `UnidadMedida.createdAt` |
| `20260912120300_insumos_created_at_clock_timestamp` | `Insumo.createdAt` + `InsumoCodigoAlternativo.createdAt` |

Las ~30 tablas restantes siguen en `@default(now())`, resuelto del lado del cliente.

### 4. Mappers — 17 confirmados, y NO hay que tocarlos

17 `*.mapper.ts` emiten `createdAt:` explícito. Confirmación cruzada: los 5 mappers de las tablas ya
corregidas a `clock_timestamp()` NO aparecen en esa lista.

**Punto de diseño clave**: los 17 mappers **NO necesitan tocarse**. El fix de sesión corrige el
driver para TODAS las columnas por igual. Solo el backfill de datos ya corrompidos necesita
tratamiento especial.

### 5. Aprovisionamiento de tenant nuevo

`PostgresAdminService.createDatabase` (`postgres-admin.service.ts:33-41`) hace `CREATE DATABASE` sin
ninguna opción de zona horaria. Un tenant nuevo hereda el `TimeZone` del cluster. Si el fix es solo
por conexión, queda cubierto automáticamente; si es a nivel de base, este archivo SÍ necesita un
`ALTER DATABASE ... SET timezone TO 'UTC'` o el tenant nuevo nace con el defecto otra vez.

### 6. Comparaciones de fecha en SQL — NO hay ninguna rota hoy

- `MarcarVencidosUseCase` → `findVencibles(new Date())` → `where: { slaVenceAt: { lt: now } }`.
  `slaVenceAt` se escribe también como `Date` de JS. **Los dos operandos cargan el MISMO sesgo en la
  MISMA dirección: la comparación relativa es correcta hoy.**
- `PreventivoSweepScheduler` dispara por reloj de Node, sin comparación SQL.
- Búsqueda de `$queryRaw`/`$executeRaw`/`Prisma.sql` con `now()`/`clock_timestamp()` embebido en
  código de producción: **ninguna encontrada**.

**Conclusión**: el riesgo real no es una comparación rota actual, sino (a) los datos que ya se
muestran mal donde tocan el límite base↔Prisma, y (b) cualquier query cruda o reporte futuro que
compare contra `now()` de Postgres.

## Hallazgo no cubierto por la investigación original — idempotencia del backfill

El discriminador de microsegundos (`% 1000 = 0` ⇒ Prisma; `<> 0` ⇒ Postgres) sirve para IDENTIFICAR
qué filas corregir, pero **NO sirve como guarda de idempotencia**: restar 3h no cambia los
microsegundos. Una segunda corrida volvería a identificar las mismas filas y les restaría otras 3h.

Contrasta con `backfill-correo-clientes.mjs`, idempotente POR CONSTRUCCIÓN porque su guarda
(`smtp_password_cifrada IS NULL`) deja de cumplirse tras la primera corrida.

**Implicación para el diseño**: el backfill necesita garantía de ejecución exactamente-una-vez. Dos
rutas a evaluar: (a) empaquetarlo como migración Prisma numerada, aprovechando que
`_prisma_migrations` garantiza ejecución única y trackeada; o (b) script standalone con una fila
marcadora explícita chequeada ANTES de tocar nada.

## Approaches

| # | Approach | Pros | Contras | Esfuerzo |
|---|---|---|---|---|
| 1 | `options=-c TimeZone=UTC` por conexión | Acotado y versionado en git; es el workaround validado en el hilo oficial de `prisma/orm#28629`, sin downside documentado; reversible con un revert | Hay que aplicarlo en CADA sitio que abra un Pool — sin guardia estructural, un adapter futuro lo olvida y reintroduce el bug en silencio; no cubre una sesión `psql` manual | Bajo-Medio |
| 2 | `ALTER DATABASE <db> SET timezone TO 'UTC'` | Un comando por base; cubre TODAS las conexiones futuras sin importar cómo se abran; estructural | Cambia el default de sesión para conexiones manuales; para tenants NUEVOS requiere tocar `PostgresAdminService.createDatabase` o nacen con el defecto | Bajo |
| 3 | Combinar 1+2 (defensa en profundidad) | Cierra el gap de `psql` manual (por 2) y el de un adapter futuro con otra URL (por 1) | Más trabajo de implementación | Medio |

## Recommendation

Approach **3 (combinado)**. El workaround de conexión ya está validado en producción y el
`ALTER DATABASE` es el único que protege contra reintroducción silenciosa en el flujo de
aprovisionamiento de tenant nuevo — justo el punto que esta exploración identificó como no cubierto.

El backfill debe diseñarse con garantía de ejecución única y escribirse en `pg` crudo (NO vía
Prisma), para no re-disparar el mismo bug de escritura mientras corrige. Mismo criterio que ya usan
`backfill-correo-clientes.mjs` y `migrate-tenants.js`.

## Risks

- Ejecutar el backfill dos veces sin guarda de una-sola-vez corrompe los datos otra vez, en la
  dirección opuesta.
- El fix y el backfill deben desplegarse ATÓMICAMENTE en la misma ventana de `Stop-Service`.
  Separados dejan el sistema peor (+3h o −6h según el orden).
- Con solo el approach 1, un punto de conexión nuevo que olvide el flag reintroduce el defecto en
  silencio — el mismo patrón que lo mantuvo invisible semanas.
- El ambiente local (Docker, `TimeZone=UTC`) es ciego a este bug. Todo test de regresión debe forzar
  `SET TIME ZONE 'America/Sao_Paulo'` explícitamente (precedente en
  `ticket-fecha-cierre-timestamptz.integration.spec.ts:91,94,97`), o el RED del ciclo TDD nunca
  fallará por la razón correcta.
- No confundir este bug con el de `Feriado.fecha`/`@db.Date` (ADR-4, hallazgo #2542).
- Los fixes upstream siguen abiertos: no hay ruta de "esperar la próxima versión".

## Inventario de producción (medido)

| Base | Valores `timestamptz` | Escritos por Prisma (+3h) | Escritos por la base (OK) |
|---|---|---|---|
| `soporte_master` | 1119 | 990 | 129 |
| Cic Lanus | 365 | 323 | 42 |
| Santa Cruz | 325 | 301 | 24 |
| **TOTAL** | **1809** | **1614** | **195** |

Fiabilidad del discriminador: `% 1000 <> 0` ⇒ Postgres, con **certeza absoluta** (un `Date` de JS
nunca produce microsegundos no-cero). `% 1000 = 0` ⇒ Prisma, con probabilidad 999/1000. Sobre 195
valores de base, ~0,2 clasificaciones erróneas esperadas.

Segunda guarda independiente para las 6 columnas `clock_timestamp()`: el delta
`updated_at − created_at`, medido en `02:59:59.998391`, `02:59:59.997748`, `02:59:59.998854`.

## Ready for Proposal

Sí. La causa raíz está probada con evidencia de producción y esta exploración confirmó contra el
código real todos los puntos verificables, agregando 2 puntos de conexión no mencionados
originalmente, la lista completa de columnas `timestamptz` de ambos schemas, y el riesgo de
idempotencia del backfill.
