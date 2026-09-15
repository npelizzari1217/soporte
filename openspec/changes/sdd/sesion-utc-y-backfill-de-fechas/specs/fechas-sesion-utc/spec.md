# Fechas Sesion Utc Specification

## Purpose

Toda fecha `timestamptz` escrita o leída por la aplicación representa el mismo
instante que declara la base, sea cual sea el `TimeZone` de la sesión
Postgres; el dato histórico ya corrompido queda corregido. No prescribe el
mecanismo — por-conexión, `ALTER DATABASE`, o ambos — eso lo decide
`sdd-design`.

## Requirements

### Requirement: Round-trip de fecha correcto en sesión no-UTC

El sistema DEBE representar el mismo instante al escribir y al leer un `Date`
de JavaScript vía Prisma, sea cual sea el `TimeZone` de la sesión Postgres.

#### Scenario: Escritura y lectura sin desvío bajo America/Sao_Paulo

- GIVEN una sesión Postgres con `TimeZone = 'America/Sao_Paulo'`
- WHEN la aplicación escribe `2026-09-14T09:31:01.231Z` y lee un valor
  almacenado `09:00:00Z`, ambos vía Prisma
- THEN el valor escrito queda como `09:31:01.231Z` y el leído se devuelve como
  `09:00:00Z` (desvío 0h en ambos sentidos)
- AND hoy, sin el fix, la escritura almacena `12:31:01.231 UTC` (+3h) y la
  lectura devuelve `06:00:00Z` (−3h)

#### Scenario: Tickets del barrido preventivo se leen en la hora del cron

- GIVEN un ticket con `clock_timestamp()` a las 01:00 local
  (`CronExpression.EVERY_DAY_AT_1AM`)
- WHEN se lee su fecha vía Prisma bajo sesión `America/Sao_Paulo`
- THEN se muestra `01:00` local, no `04:00` (valor actual sin el fix)

### Requirement: Coherencia entre fecha generada por la base y por la aplicación

Para una fila cuyo `created_at` proviene de `DEFAULT clock_timestamp()` y cuyo
`updated_at` proviene de Prisma en el mismo INSERT, el sistema DEBE producir
una diferencia del orden de milisegundos entre ambos valores.

#### Scenario: Los tres insumos conocidos quedan con created ≈ updated

- GIVEN los tres insumos creados el `09-12 20:13` UTC, hoy separados
  `02:59:59.998391` entre `created_at` (clock_timestamp()) y `updated_at`
  (Prisma) del mismo INSERT
- WHEN se aplica el fix de sesión (sin backfill: `created_at` la pone la base)
- THEN ambas columnas quedan separadas por milisegundos

### Requirement: Corrección del dato histórico escrito por Prisma

El sistema DEBE corregir, mediante un backfill, cada valor `timestamptz`
escrito por Prisma antes del fix, restándole 3 horas, y DEBE dejar sin
modificar cada valor escrito por la base. Alcance: `soporte_master` y cada
base de inquilino activa.

#### Scenario: El backfill corrige solo lo escrito por Prisma

- GIVEN `soporte_master` y las bases de los inquilinos activos, con 1809
  valores `timestamptz` totales (1614 de Prisma, 195 de la base)
- WHEN corre el backfill
- THEN los 1614 valores de Prisma quedan desplazados −3h
- AND los 195 valores de la base permanecen sin cambios

### Requirement: Ejecución exactamente-una-vez del backfill

El sistema DEBE garantizar que el backfill se aplique como máximo una vez por
base; una segunda invocación NO DEBE modificar ninguna fila.

#### Scenario: Una segunda corrida no re-corrompe los datos

- GIVEN el backfill ya corrió una vez sobre una base
- WHEN se invoca nuevamente sobre la misma base
- THEN ningún valor `timestamptz` cambia respecto del estado post-primera
  corrida

### Requirement: Tenant nuevo nace sin el defecto

El sistema DEBE aprovisionar cada tenant nuevo, sin ningún paso manual
adicional, con toda fecha `timestamptz` ya correcta.

#### Scenario: Aprovisionamiento posterior al cambio

- GIVEN un tenant creado después de desplegar el fix
- WHEN la aplicación escribe y lee fechas para ese tenant vía Prisma
- THEN el round-trip no presenta desvío, sin ningún paso manual adicional

### Requirement: Protección de regresión bajo sesión no-UTC forzada

El sistema DEBE contar con al menos una prueba automatizada que fuerce
explícitamente una sesión Postgres no-UTC y falle si el defecto reaparece. Una
prueba que corre solo contra `TimeZone=UTC` (el Docker local) NO satisface
este requisito, porque ahí el defecto es un no-op.

#### Scenario: La prueba fuerza la sesión y detecta el desvío

- GIVEN una prueba que ejecuta `SET TIME ZONE 'America/Sao_Paulo'` antes de
  escribir y leer una fecha, y `RESET TIME ZONE` después (precedente:
  `ticket-fecha-cierre-timestamptz.integration.spec.ts:91,94,97`)
- WHEN el defecto de sesión reaparece
- THEN la prueba falla

### Requirement: Invariantes de integridad temporal tras la corrección

Tras aplicar el fix y el backfill, el sistema DEBE cumplir, en
`soporte_master` y en cada base de inquilino, que ninguna fila tenga
`updated_at` anterior a `created_at` en más de 1 segundo, que ningún
`movimientos_insumo.created_at` sea anterior al `created_at` de su insumo
padre, y que ninguna fecha sea posterior a `now()`.

**Tolerancia de 1 segundo (decisión del dueño del spec, 2026-09-14).** Para
las 5 tablas con `created_at DEFAULT clock_timestamp()` (ADR-3 del design),
Prisma calcula el `Date` de `updated_at` en JavaScript **antes** de enviar el
INSERT; la base evalúa `clock_timestamp()` para `created_at` al ejecutarlo,
uno o dos milisegundos **después**. Eso significa que, tras el fix, toda fila
nueva de esas tablas nace con `updated_at` unos milisegundos anterior a
`created_at` — hoy enmascarado por el propio defecto de +3h que este cambio
corrige, y confirmado por medición en producción sobre los tres insumos
conocidos (deltas `02:59:59.998391`, `02:59:59.997748`, `02:59:59.998854` —
los tres apenas por debajo de 3h, exactamente ese margen). R7 existe para
detectar un desvío de **tres horas**, no de milisegundos: una tolerancia
estricta (0 segundos) no aumenta el poder de detección del requisito y hace
que la invariante sea inalcanzable para esas 5 tablas. Un segundo de
tolerancia sigue detectando cualquier reaparición del defecto de +3h (o de
cualquier desvío de minutos u horas) sin marcar como violación el margen de
milisegundos que el propio mecanismo de escritura introduce.

#### Scenario: Se auditan las tres invariantes tras el fix y el backfill

- GIVEN el estado de datos posterior al fix y al backfill
- WHEN se audita cualquier tabla con `created_at`/`updated_at`, los
  `movimientos_insumo` y toda fecha frente a `now()`
- THEN ninguna fila tiene `updated_at` anterior a `created_at` en más de 1
  segundo
- AND ningún `movimientos_insumo.created_at` es anterior al `created_at` de su
  insumo padre
- AND ninguna fecha es posterior al instante actual

## Out of Scope

- `Feriado.fecha` / `@db.Date` leída como medianoche UTC (ADR-4, hallazgo
  #2542): mecanismo distinto — `DATE` no tiene componente de zona horaria.
- Migrar las ~30 tablas restantes de `@default(now())` a `clock_timestamp()`,
  y tocar los 17 mappers que emiten `createdAt` explícito: el fix de sesión
  corrige el driver para todas las columnas por igual.
- El proyecto `educandow`: comparte VPS y servidor Postgres, pero es otro
  repositorio y otro ciclo.
