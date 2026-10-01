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

## WU-2 — Repositorio de equipos: LE, `registrarBaja` y `save()` sin `activo`

Una sola rama, `feat/baja-equipo-completo-wu02` (base wu01-3). Tareas 2.1 a 2.8 completas.

- Puerto: `bloquearParaModificar`, `bloquearParaOperarPiezas`, `registrarBaja` con contrato en JSDoc.
- Repo: ambos locks con `exigirTransaccionActiva` + `SELECT id ... FOR NO KEY UPDATE | FOR SHARE` y
  `findById` por el mapper (devuelve la entidad aun con `deletedAt`); `save()` ya no escribe `activo`
  ni `baja_*` en el UPDATE; `registrarBaja` es un CAS `updateMany`.
- Specs: `prisma-equipos.integration.spec.ts` (4 casos nuevos: ediciones viejas, escritura de los
  cinco campos, segunda baja, borrado lógico) y `prisma-equipo-informatico.locks.integration.spec.ts`
  (contrato y 5 sondas de compatibilidad con `lock_timeout` y `55P03`).
- 2.7: ningún fake implementa el puerto completo (solo `Pick<..., 'findById'>`), no hubo que tocar fakes.


## WU-3 — BUGFIX: el borrado respeta las piezas activas (STRICT TDD)

Una sola rama, `feat/baja-equipo-completo-wu03` (base wu02).

### RED (tareas 3.1 a 3.4) — corrido contra `eliminar-equipo.use-case.ts` SIN tocar

El use case actual lee con `findById` y llama `delete` sin mirar piezas ni baja. Los specs se
armaron para que el código viejo **corra** (el fake del unit lleva un `findById` temporal, que el
REFACTOR retira), de modo que el fallo sea de comportamiento y no de símbolo o de fixture.

| Comando | Resultado RED observado |
|---|---|
| `pnpm vitest run src/equipos/application/use-cases/eliminar-equipo.use-case.spec.ts` | 3 failed / 3 passed. Fallan: "con un componente activo falla con EquipoConComponentesActivosError" (`expected false to be true` en `isFail()`: devolvió ok), "con un equipo dado de baja falla con EquipoDadoDeBajaError" (idem), "el chequeo corre dentro de txRunner.run()" (`txRunner.run` llamado 0 veces). Pasan los 3 de regresión (borra sin piezas, inexistente, con `deletedAt`) |
| `pnpm vitest run src/equipos/application/use-cases/eliminar-equipo.integration.spec.ts` | 2 failed / 1 passed. Fallan: equipo con componente + unidad `INSTALADA` (`isFail()` false: se borró) y equipo dado de baja (`isFail()` false). Pasa el borrado sin piezas activas |
| `pnpm vitest run src/equipos/interface/controllers/eliminar-equipo.e2e.spec.ts` | 2 failed / 2 passed. Fallan: pieza activa y equipo dado de baja (`expected 204 to be 422`). Pasan: sin piezas 204 + ficha 404 y sin `EQUIPOS:BORRADO` 403 |

3.4 confirmado: los siete fallos son por el comportamiento (hoy borra y devuelve éxito), no por
compilación ni fixture.

### TDD Cycle Evidence

| Tarea | Test | Comando | RED observado | GREEN observado | REFACTOR |
|---|---|---|---|---|---|
| 3.1 | `eliminar-equipo.use-case.spec.ts` (6 casos) | `pnpm vitest run src/equipos/application/use-cases/eliminar-equipo.use-case.spec.ts` | 3 failed / 3 passed: pieza activa y equipo dado de baja devolvían ok; `txRunner.run` 0 llamadas | 6 passed | Se retiró el `findById` temporal del fake; `txRunner` tipado como `ITenantTransactionRunner` sin casts (el ratchet baja de 666/121 a 664/120) |
| 3.2 | `eliminar-equipo.integration.spec.ts` (3 casos) | `pnpm vitest run src/equipos/application/use-cases/eliminar-equipo.integration.spec.ts` | 2 failed / 1 passed: con componente + unidad `INSTALADA` y con equipo dado de baja el equipo se borraba | 3 passed | — |
| 3.3 | `eliminar-equipo.e2e.spec.ts` (4 casos) | `pnpm vitest run src/equipos/interface/controllers/eliminar-equipo.e2e.spec.ts` | 2 failed / 2 passed: `expected 204 to be 422` (pieza activa y dado de baja) | 4 passed | — |
| 3.5 | los tres anteriores | idem | — | use case dentro de `txRunner.run()`: `bloquearParaModificar` → `!activo` → `findActiveByEquipoId` → `delete`; cableado en `equipos.module.ts` con `COMPONENTE_EQUIPO_REPOSITORY` y `TENANT_TX_RUNNER` | firma `(equipoRepo, componenteRepo, txRunner)` |
| 3.6 | `equipos.controller.spec.ts` (2 casos nuevos) | `pnpm vitest run src/equipos/interface/controllers/equipos.controller.spec.ts` | n/a: el default ya daba 422 (no era RED) | 79 passed | mapeo 422 explícito de los dos errores; el mensaje informa la cantidad |
| 3.7 | `eliminar-equipo.orden-de-locks.integration.spec.ts` (T5) | `pnpm vitest run src/equipos/infrastructure/persistence/prisma/eliminar-equipo.orden-de-locks.integration.spec.ts` | n/a: testigo del orden de locks, escrito sobre el código ya corregido | 1 passed | — |
| 3.8 | `equipo-detail-view.test.tsx` (3 casos nuevos) | `cd frontend && pnpm vitest run src/features/equipos/components/equipo-detail-view.test.tsx` | n/a (UI) | 7 passed | botón «Eliminar equipo (cargado por error)», toast «Equipo eliminado.» |

3.9 Ayuda: `rg -n -i "dar de baja|borrar|eliminar" backend/ayuda` no encontró ningún artículo que
describa el botón del equipo como baja ni que diga que se puede borrar un equipo con piezas; no
hay nada que quede falso. Deuda: artículo del botón renombrado «Eliminar equipo (cargado por
error)» y del flujo de baja.
