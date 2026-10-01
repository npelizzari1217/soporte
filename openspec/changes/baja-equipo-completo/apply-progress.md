# Apply progress: baja-equipo-completo

## WU-1 — Migración, schema, entidad, mapper y errores

Partido en tres ramas por la política de 400 líneas (el total pasaba de 800):

| Parte | Rama | Contenido | Tareas |
|---|---|---|---|
| 1 | `feat/baja-equipo-completo-wu01` | Entidad, su spec y los tres specs que usaban `deactivate()` | 1.4, 1.5, 1.8 |
| 2 | `feat/baja-equipo-completo-wu01-2` | Migración, schema, mapper y constraints | 1.1 a 1.3, 1.7, 1.9 |
| 3 | `feat/baja-equipo-completo-wu01-3` | Los cinco errores y la tabla de `toHttpException` | 1.6, 1.10 |

Parte 1: `deactivate()` y `activate()` se eliminan; el spec de integración de `prisma-equipos` pasa a
`darDeBaja()` (WU-2 lo reescribe por completo).

Parte 2: migración `20261001120000_equipos_informaticos_baja` aplicada en `soporte_tenant_test` y en
los tenants de desarrollo (`pnpm migrate:tenants`, 2 migradas); `prisma migrate status` en "up to
date". Los cinco errores salen con la forma `{ componenteId, insumoId, causa }` del diseño.
