# Apply Progress: Feriados configurables (globales + por cliente)

## Mode

Estándar (strict_tdd: false). Trabajo de feature; los tests se entregan en el mismo commit que el
código que verifican.

## WU1: Base de dominio + repositorio global — COMPLETA

- [x] 1.1 `FERIADO_DESCRIPCION_MAX_LENGTH` / `FECHA_CALENDARIO_REGEX` en `backend/src/calendario-laboral/domain/feriados.constants.ts`.
- [x] 1.2 VO `FechaCalendario` (`crear`, `aClave`, `aDateUtc`, `equals`) + `fecha-calendario.spec.ts`.
- [x] 1.3 `FeriadoEntity` (`domain/entities/feriado.entity.ts`) + `feriados.errors.ts` (`FechaCalendarioInvalidaError`, `FeriadoFechaDuplicadaError`, `FeriadoFechaEsGlobalError`, `FeriadoNoEncontradoError`) en `domain/errors/`.
- [x] 1.4 Port `IFeriadoGlobalRepository` en `domain/ports/i-feriado-global.repository.ts`.
- [x] 1.5 `claveDiaUtcDe` promovido de `private` a `static` público en `PrismaCalendarioLaboralMapper`; se agregó un test de ida y vuelta al `prisma-calendario-laboral.mapper.spec.ts` existente.
- [x] 1.6 `PrismaFeriadoGlobalRepository` + `PrismaFeriadoGlobalMapper` (tabla `feriado` de master), reutilizando el static promovido; los tests unitarios con un `PrismaService.getMasterClient()` mockeado cubren `listar` (ordenado asc + vacío), `buscarPorId` (encontrado/no encontrado), `crear`, `editar`, `eliminar`.
- [x] 1.7 `pnpm typecheck` y la corrida focalizada de vitest — ambas en verde.

### Files Changed

| Archivo | Acción | Qué |
|---|---|---|
| `backend/src/calendario-laboral/domain/feriados.constants.ts` | Creado | `FERIADO_DESCRIPCION_MAX_LENGTH`, `FECHA_CALENDARIO_REGEX` |
| `backend/src/calendario-laboral/domain/errors/feriados.errors.ts` | Creado | 4 errores de dominio (base de WU1; `FeriadoFechaEsGlobalError` se lanza por primera vez en WU4) |
| `backend/src/calendario-laboral/domain/value-objects/fecha-calendario.ts` | Creado | VO `FechaCalendario` |
| `backend/src/calendario-laboral/domain/value-objects/fecha-calendario.spec.ts` | Creado | Tests unitarios del VO |
| `backend/src/calendario-laboral/domain/entities/feriado.entity.ts` | Creado | `FeriadoEntity` (feriado global, borrado físico según D1) |
| `backend/src/calendario-laboral/domain/entities/feriado.entity.spec.ts` | Creado | Tests unitarios de la entidad |
| `backend/src/calendario-laboral/domain/ports/i-feriado-global.repository.ts` | Creado | Port `IFeriadoGlobalRepository` + token de DI |
| `backend/src/calendario-laboral/infrastructure/persistence/prisma/prisma-calendario-laboral.mapper.ts` | Modificado | `claveDiaUtcDe` promovido de `private` → `static` público |
| `backend/src/calendario-laboral/infrastructure/persistence/prisma/prisma-calendario-laboral.mapper.spec.ts` | Modificado | Se agregó un test de ida y vuelta para el static promovido |
| `backend/src/calendario-laboral/infrastructure/persistence/prisma/prisma-feriado-global.mapper.ts` | Creado | `PrismaFeriadoGlobalMapper` (toDomain/toPersistence) |
| `backend/src/calendario-laboral/infrastructure/persistence/prisma/prisma-feriado-global.repository.ts` | Creado | `PrismaFeriadoGlobalRepository` (CRUD sobre `feriado` de master) |
| `backend/src/calendario-laboral/infrastructure/persistence/prisma/prisma-feriado-global.repository.spec.ts` | Creado | Tests unitarios del repositorio (cliente Prisma mockeado) |

### Deviations from Design

Ninguna — la implementación coincide exactamente con design.md (D1, D2, D9) y con la lista de tareas de WU1.
`FeriadoEntity` extiende `BaseEntity` como cualquier otra entidad del repo (id/createdAt/updatedAt)
pero no expone `softDelete()`, coincidiendo con el "sin soft-delete" de D1 para el feriado global; el
`eliminar()` del repositorio hace un `delete` físico.

### Hallazgos

Ninguna.

### Work Unit Evidence

| Evidencia | Valor |
|---|---|
| Comando de test focalizado y resultado | `pnpm vitest run src/calendario-laboral` (corrido desde `backend/`) → 7 archivos de test, 51 tests, todos aprobados (re-corrido por el orquestador) |
| Harness de runtime | N/A — todavía no hay controller cableado (según el diseño, WU2 cablea `FeriadosController`); solo tests unitarios + Prisma mockeado, no se necesita ida y vuelta real contra Postgres para esta WU |
| Límite de rollback | Todos los archivos nuevos son aditivos (VO, entidad, errores, port, nuevo mapper/repositorio + sus specs); los únicos archivos modificados son la promoción del mapper (`private` → `static` público) y su spec — ambas ediciones puramente aditivas. Ningún controller o module registró todavía `feriados`/`feriado-global`, así que `git revert` de este commit solo elimina código nuevo/aditivo sin dependientes downstream |

### Workload / PR Boundary

- Modo: porción de PR encadenada (Feature Branch Chain sobre `feat/feriados-configurables`)
- Unidad de trabajo actual: WU1 — Base de dominio + repositorio global
- Límite: arranca desde el module `calendario-laboral` preexistente (el port de lectura de feriados de SLA queda intacto); termina con el modelo de dominio de feriado global + repositorio listos para que WU2 construya los casos de uso/controller encima
- Impacto medido sobre el presupuesto de revisión: 592 líneas cambiadas de backend contra una estimación de ~330 y un
  presupuesto de 400 líneas. Decisión del dueño (2026-09-24): cualquier WU que supere las 400 líneas se divide en
  subunidades de ≤400, cada una con sus propios tests y revertible de forma independiente. WU1 se dividió:
  - **WU1a — domain** (tareas 1.1–1.4): constants, `FechaCalendario`, `FeriadoEntity`,
    errors, port + sus specs. Rama `feat/feriados-configurables-wu1a`.
  - **WU1b — infrastructure** (tareas 1.5–1.7): promoción del mapper + test, mapper global,
    `PrismaFeriadoGlobalRepository` + spec. Rama `feat/feriados-configurables-wu1b`,
    apilada sobre WU1a.
- Desvío de la estimación: WU1 terminó en ~1,8x su estimación (JSDoc obligatorio en los miembros exportados
  más tests por comportamiento). Se espera que las WU siguientes necesiten la misma división.

### Status

7/7 tareas de WU1 completas, entregadas como WU1a + WU1b. Lista para WU2 (ABM global + controller).

## WU2a: Casos de uso globales (tarea 2.1) — PARCIAL

Decisión del dueño (2026-09-24): WU2 viene pre-dividida en WU2a (tarea 2.1: casos de uso + tests
unitarios), WU2b (2.2/2.3/2.5: DTOs, controller, wiring), WU2c (2.4: e2e). Esta corrida cubre
solo WU2a, en la rama `feat/feriados-configurables-wu2a` (apilada sobre WU1b).

La tarea 2.1 en sí **no está completamente hecha**: implementar los cuatro casos de uso (Listar, Crear,
Editar, Eliminar) más sus tests unitarios midió 434 líneas cambiadas, por encima del presupuesto de
400 líneas. Según la regla del dueño, solo se comiteó un subconjunto coherente y revertible:

- [x] Casos de uso Listar/Crear/Eliminar + tests unitarios (este commit)
- [ ] Caso de uso Editar + tests unitarios — **diferido**, no implementado en esta corrida

El checkbox de la tarea 2.1 en `tasks.md` sigue en `[ ]` — cubre los cuatro casos de uso, y Editar
falta. La próxima pasada de apply (o una porción WU2a-2) implementa
`EditarFeriadoGlobalUseCase` (`application/use-cases/editar-feriado-global.use-case.ts` +
spec) siguiendo la misma forma que `CrearFeriadoGlobalUseCase`: cargar por id →
`FeriadoNoEncontradoError` si no se encuentra, validar la nueva `fecha` con
`FechaCalendario.crear()`, llamar a `FeriadoEntity.editar()`, persistir, capturar P2002 →
`FeriadoFechaDuplicadaError`. Esa porción sola es chica (~184 líneas incl. spec) y entra
bien dentro del presupuesto por sí sola.

### Files Changed

| Archivo | Acción | Qué |
|---|---|---|
| `backend/src/calendario-laboral/application/use-cases/listar-feriados-globales.use-case.ts` | Creado | `ListarFeriadosGlobalesUseCase` — delega en `IFeriadoGlobalRepository.listar()`, envuelve en `Result` por consistencia (sin fallo esperado) |
| `backend/src/calendario-laboral/application/use-cases/listar-feriados-globales.use-case.spec.ts` | Creado | Tests unitarios: devuelve la lista del repo, la lista vacía no falla |
| `backend/src/calendario-laboral/application/use-cases/crear-feriado-global.use-case.ts` | Creado | `CrearFeriadoGlobalUseCase` — valida `fecha` vía `FechaCalendario.crear()`, crea `FeriadoEntity`, persiste; captura P2002 → `FeriadoFechaDuplicadaError` (precedente `crear-equipo.use-case.ts:11-19`) |
| `backend/src/calendario-laboral/application/use-cases/crear-feriado-global.use-case.spec.ts` | Creado | Tests unitarios: camino feliz, la fecha inválida (`2026-02-30`) corta antes de llamar al repo, mapeo de P2002, otros errores de infra se vuelven a lanzar sin mapear |
| `backend/src/calendario-laboral/application/use-cases/eliminar-feriado-global.use-case.ts` | Creado | `EliminarFeriadoGlobalUseCase` — carga por id → `FeriadoNoEncontradoError` si no se encuentra, luego borrado físico (D1: el feriado global no tiene soft delete, a diferencia de `EliminarEquipoUseCase`) |
| `backend/src/calendario-laboral/application/use-cases/eliminar-feriado-global.use-case.spec.ts` | Creado | Tests unitarios: elimina cuando se encuentra, falla con `FeriadoNoEncontradoError` y nunca llama a `eliminar()` cuando no se encuentra |

### Deviations from Design

Ninguna en el código entregado — coincide con D2 de design.md (validación de `FechaCalendario.crear()`),
las formas de error de D4/D7 (`FeriadoFechaDuplicadaError`, `FeriadoNoEncontradoError`), y el
precedente de captura de P2002 que cita el diseño (`crear-equipo.use-case.ts:11-19`). La desviación es
solo de cronograma: la tarea 2.1 se divide en dos corridas de apply para respetar el presupuesto de 400 líneas,
declarado arriba y en el Review Workload Forecast de `tasks.md` (WU2 ya estaba marcada en
el límite del presupuesto, ~400 est.).

### Hallazgos

Ninguna.

### Work Unit Evidence

| Evidencia | Valor |
|---|---|
| Comando de test focalizado y resultado | `pnpm vitest run src/calendario-laboral` (desde `backend/`) → 10 archivos de test, 59 tests, todos aprobados |
| Harness de runtime | N/A — todavía no hay controller cableado (WU2b cablea `FeriadosController`); solo tests unitarios, sin ida y vuelta real de Postgres/HTTP para esta porción |
| Límite de rollback | Los tres archivos nuevos (+ sus specs) son aditivos, nada más los referencia todavía (sin controller, sin wiring de module). `git revert` de este commit solo elimina los casos de uso Listar/Crear/Eliminar sin dependientes downstream |

### Workload / PR Boundary

- Modo: porción de PR encadenada (Feature Branch Chain), apilada sobre `feat/feriados-configurables-wu1b`
- Unidad de trabajo actual: WU2a (solo tarea 2.1) — parcial
- Límite: arranca desde el repositorio/mapper global de WU1b; termina con los casos de uso
  Listar/Crear/Eliminar listos para que WU2b los cablee una vez que Editar aterrice
- Impacto medido sobre el presupuesto de revisión: 250 líneas cambiadas de backend (código) para este commit,
  contra un presupuesto de 400 líneas — la tarea 2.1 completa (incl. Editar) midió 434 líneas y se
  dividió según la regla del dueño

### Status

3/4 casos de uso de la tarea 2.1 completos (Listar, Crear, Eliminar). Falta Editar. El checkbox
de la tarea 2.1 en `tasks.md` sigue sin marcar hasta que Editar se entregue. No está listo para `sdd-verify` sobre WU2
como un todo; listo para otra pasada de `sdd-apply` que termine la tarea 2.1 (Editar) antes de WU2b.

## WU2a2: Caso de uso global Editar (finalización de la tarea 2.1) — COMPLETA

Esta corrida implementa la pieza que faltaba de la tarea 2.1: `EditarFeriadoGlobalUseCase` +
tests unitarios, en la rama `feat/feriados-configurables-wu2a2` (apilada sobre
`feat/feriados-configurables-wu2a`, commit `f1f508b`). Espeja
`CrearFeriadoGlobalUseCase` según el plan que quedó en la sección de WU2a de arriba:

- [x] `EditarFeriadoGlobalUseCase`: carga por id vía `buscarPorId` →
  `FeriadoNoEncontradoError` si no se encuentra; valida la nueva `fecha` con
  `FechaCalendario.crear()` → propaga `FechaCalendarioInvalidaError`; aplica
  `FeriadoEntity.editar()` (reemplazo completo de `fecha` + `descripcion`); persiste vía
  `repo.editar()`; captura P2002 → `FeriadoFechaDuplicadaError` (mismo precedente que
  `CrearFeriadoGlobalUseCase`, `crear-equipo.use-case.ts:11-19`).
- [x] Tests unitarios: camino feliz (la edición tiene éxito, se llama al repo con la entidad mutada),
  no-encontrado corta antes de `editar()`, fecha inválida corta antes de
  `editar()`, mapeo de P2002, otros errores de infra se vuelven a lanzar sin mapear.

La tarea 2.1 en `tasks.md` ahora está en `[x]` — los cuatro casos de uso globales (Listar, Crear, Editar,
Eliminar) existen con tests unitarios.

### Files Changed

| Archivo | Acción | Qué |
|---|---|---|
| `backend/src/calendario-laboral/application/use-cases/editar-feriado-global.use-case.ts` | Creado | `EditarFeriadoGlobalUseCase` — carga por id, valida la nueva `fecha`, reemplaza completo vía `FeriadoEntity.editar()`, persiste; captura P2002 → `FeriadoFechaDuplicadaError` |
| `backend/src/calendario-laboral/application/use-cases/editar-feriado-global.use-case.spec.ts` | Creado | Tests unitarios: camino feliz, no-encontrado, fecha inválida, mapeo de P2002, otros errores se vuelven a lanzar |
| `openspec/changes/feriados-configurables/tasks.md` | Modificado | Checkbox de la tarea 2.1 `[ ]` → `[x]` |

### Deviations from Design

Ninguna — coincide con D2 de design.md (`FechaCalendario.crear()` validation) y con las
formas de error `FeriadoFechaDuplicadaError`/`FeriadoNoEncontradoError` (catálogo de errores de
D4/D7), y con el precedente de captura de P2002 (`crear-equipo.use-case.ts:11-19`). El
orden `buscarPorId`-antes-de-validar (chequeo de existencia antes de la validación de fecha) coincide con
el precedente de `EliminarFeriadoGlobalUseCase` de chequear la existencia primero.

### Hallazgos

Ninguna.

### Work Unit Evidence

| Evidencia | Valor |
|---|---|
| Comando de test focalizado y resultado | `pnpm vitest run src/calendario-laboral` (desde `backend/`) → 11 archivos de test, 64 tests, todos aprobados |
| Harness de runtime | N/A — todavía no hay controller cableado (WU2b cablea `FeriadosController`); solo tests unitarios, sin ida y vuelta real de Postgres/HTTP para esta porción |
| Límite de rollback | Ambos archivos nuevos son aditivos, nada más los referencia todavía (sin controller, sin wiring de module). `git revert` de este commit solo elimina el caso de uso Editar sin dependientes downstream |

### Workload / PR Boundary

- Modo: porción de PR encadenada (Feature Branch Chain), apilada sobre `feat/feriados-configurables-wu2a`
- Unidad de trabajo actual: WU2a2 (finalización de la tarea 2.1) — completa
- Límite: arranca desde los casos de uso Listar/Crear/Eliminar de WU2a; termina con los cuatro
  casos de uso globales (tarea 2.1) listos para que WU2b cablee los DTOs/controller
- Impacto medido sobre el presupuesto de revisión: porción chica, bien por debajo del presupuesto de 400 líneas (según la
  estimación de ~184 líneas que quedó en la sección de WU2a)

### Status

4/4 casos de uso de la tarea 2.1 completos (Listar, Crear, Editar, Eliminar). El checkbox de la
tarea 2.1 en `tasks.md` ahora está en `[x]`. Lista para WU2b (DTOs, controller, wiring — tareas 2.2/2.3/2.5).

## WU2b: DTOs, controller, wiring (tareas 2.2/2.3/2.5) — COMPLETA

Superficie HTTP de feriados globales, rama `feat/feriados-configurables-wu2b` (apilada sobre
`wu2a2`, commit `be3c355`). La tarea 2.4 (e2e) se difiere a WU2c.

- [x] `interface/dtos/feriado.dto.ts` (Creado): `Create/UpdateFeriadoDto`, `fecha` vía
  `@Matches(FECHA_CALENDARIO_REGEX)` (D2, no `@IsDateString`), `descripcion` vía
  `@MaxLength(FERIADO_DESCRIPCION_MAX_LENGTH)` (D9, ambas de las constantes de WU1).
  `UpdateFeriadoDto` exige ambos campos (reemplazo completo).
- [x] `interface/controllers/feriados.controller.ts` (Creado): `JwtAuthGuard`
  a nivel de clase; `GET` abierto a cualquier actor autenticado; `POST`/`PATCH :id`/
  `DELETE :id` agregan `GlobalAdminGuard` por método (D5,
  precedente `ciclos-vigentes.controller.ts:103-121`). `toHttpException` (D7):
  `FeriadoNoEncontradoError` → 404, resto del catálogo → 422; `DELETE` → 204.
- [x] `calendario-laboral.module.ts` (Modificado, solo aditivo): `imports:
  [AuthModule]`, `controllers: [FeriadosController]`, `FERIADO_GLOBAL_REPOSITORY`
  (`PrismaFeriadoGlobalRepository`, construido en WU1, cableado recién ahora) + 4 casos de uso vía
  `useFactory`, patrón `ClientesModule`. El comentario desactualizado H3 se deja intacto (tarea 5.5).
- [x] `interface/controllers/feriados.controller.spec.ts` (Creado), acotado exactamente al
  alcance asignado: metadata de guard por método + tabla error→HTTP, catálogo completo de 4 clases
  (filtro `instanceof DomainError`, patrón `equipos.controller.spec.ts`).
- [x] `tasks.md`: 2.2/2.3/2.5 → `[x]`; 2.4 sigue en `[ ]`.

### Deviations / Issues / Evidence

Ninguna vs. D2/D5/D7/D9. Nota de presupuesto: un primer borrador agregó tests funcionales por endpoint
más allá del alcance asignado de "metadata de guard + tabla error→HTTP", midiendo 486 líneas contra
el presupuesto de 400; se sacaron (el propio ejemplo de la regla de "dejar parte de los tests afuera"), quedando en
359; la cobertura funcional se difiere al e2e de WU2c. Test focalizado: `pnpm vitest run
src/calendario-laboral` → 12 archivos, 74 tests, todos aprobados. Harness de runtime: N/A —
controller cableado/alcanzable, todavía sin ida y vuelta HTTP (tarea 2.4). Rollback: 3 archivos nuevos +
una edición de module solo aditiva; `git revert` elimina toda la superficie, sin dependientes.

### Workload / Status

Porción de PR encadenada, apilada sobre `wu2a2`. 359 líneas cambiadas contra 400. 3/4 tareas de esta
porción completas; la tarea 2.4 (e2e) queda para WU2c. WU2 todavía no está lista para `sdd-verify`.

## WU2c: e2e de feriados globales (tarea 2.4) — COMPLETA

`feriados.e2e.spec.ts` (Creado), rama `feat/feriados-configurables-wu2c` (apilada sobre
`wu2b`, commit `b38060a`): matriz de guards (401 sin token, 403 escritura no-ROOT, 200 lectura abierta)
+ la cobertura funcional que WU2b había diferido (201 crear + ida y vuelta de fecha según D2, editar, eliminar,
fecha de calendario inválida → **422** según D7/`toHttpException` — no 400 como sugería la
paráfrasis del prompt de lanzamiento; forma inválida → 400 a nivel transporte, duplicado → 422, id desconocido →
404, lista ordenada) + regresión de filas sembradas. No hace falta base de inquilino: `GlobalAdminGuard` solo lee
el JWT. Los fixtures usan el año 2031 (fuera del rango sembrado 2026-2028), se limpian por id en
`afterAll`; `feriados` nunca se trunca. `tasks.md` 2.4 → `[x]`.

Desviaciones: el código HTTP para una fecha de calendario sintácticamente válida pero inexistente (por ej.
`2031-02-30`) es 422, coincidiendo con el mapeo de `FechaCalendarioInvalidaError` de D7 y con la
propia tabla de `feriados.controller.spec.ts` — no el 400 que nombraba el resumen del prompt de lanzamiento.

Evidencia: `pnpm vitest run src/calendario-laboral` → 13 archivos, 92 tests, todos aprobados (+18).
Postgres real, `soporte_master_test`, `usarLockMasterTest()`; se confirmó que las 46 filas sembradas
quedan sin cambios antes/después. Rollback: un archivo nuevo + un checkbox de `tasks.md`. 373 líneas cambiadas
contra un presupuesto de 400.

### Status

WU2 completa (2.1-2.5 todas en `[x]`). Lista para `sdd-verify`.

## WU3a: Tabla del inquilino + repositorio de cliente — COMPLETA

Rama `feat/feriados-configurables-wu3a`, apilada sobre `wu2c` (`895845c`). Pre-dividida:
WU3a = tarea 3.1 más la mitad de 3.2/3.3/3.4 correspondiente al repositorio de cliente; WU3b =
`IFeriadosGlobalesChecker` + `FeriadosGlobalesMasterChecker` + tests de `esGlobal`.

- [x] 3.1 `model FeriadoCliente` (`feriados_cliente`, forma de D1, sin `clienteId`, sin soft
  delete, advertencia `@db.Date` copiada de master). La migración
  `prisma_tenant/migrations/20260924130000_feriados_cliente/` se escribió a mano, y después
  el orquestador verificó que coincidiera exactamente con el SQL de
  `prisma migrate diff --from-schema <previous tenant schema> --to-schema prisma_tenant/schema.prisma --script`,
  y se aplicó sin problemas con `prisma migrate deploy` sobre una base descartable (borrada después).
  No se tocó ninguna base de inquilino real.
- [x] 3.2 (mitad) Port `IFeriadoClienteRepository`, reutilizando `FeriadoEntity`.
- [x] 3.3 (mitad) `PrismaFeriadoClienteRepository` + mapper, cliente del inquilino vía
  `TenantContext`, reutilizando `claveDiaUtcDe` para la trampa de `@db.Date`.
- [x] 3.4 (mitad) Tests de integración sobre una base de inquilino efímera (crear → migrar → CRUD,
  `UNIQUE(fecha)`, ida y vuelta de fecha → desconectar → dropear).

Desviación: timestamp de migración `20260924130000` en lugar de `20260925120000`; ambos ordenan
después de la última migración del inquilino.

Detalles a tener en cuenta: `TenantContext.bind()` (el fallback `enterWith`) no se propagaba desde un
`beforeAll` async que espera (await) un subproceso; los tests envuelven cada body en
`TenantContext.run(ctx, fn)`. Los ids de fixture deben ser UUIDs reales (`feriados_cliente.id` es
`uuid`), a diferencia de los specs con Prisma mockeado de WU1.

Evidencia: `pnpm vitest run src/calendario-laboral` → 14 archivos, 99 tests en verde. Rollback:
puramente aditivo (sin wiring de módulo, sin consumidores todavía); la migración es un `CREATE TABLE`.

## WU3b: Verificador master + tests de esGlobal — COMPLETA

Branch `feat/feriados-configurables-wu3b`, apilado sobre `wu3a` (`cf3cdb6`). Cierra WU3:
puerto `IFeriadosGlobalesChecker` + `FeriadosGlobalesMasterChecker` (`esGlobal`, solo
lectura de master, precedente de `UsuarioMasterChecker`/`i-usuario-master.checker.ts`) +
sus tests de integración. Todavía no está conectado en `calendario-laboral.module.ts` — lo
consumen los casos de uso de cliente de WU4 (D4), el mismo patrón de conexión diferida
que el repositorio de WU1.

Desviación: la mitad restante de la tarea 3.4 corre contra `soporte_master_test`
(`usarLockMasterTest()`), no contra una "base de inquilino efímera" como decía su
redacción original — el checker solo lee master, así que no hay base de inquilino en su
camino. Nunca trunca `feriados`; verifica que `esGlobal('2026-12-25')` sea true (Navidad
sembrada) y que `esGlobal('2026-01-15')` sea false, más un fixture de 2031 creado y
eliminado por el propio test (`afterAll`).

Evidencia: `pnpm vitest run src/calendario-laboral` → 15 archivos, 102 tests en verde (+3).
Rollback: 2 archivos nuevos (port + checker) + 1 spec de integración nuevo, todo aditivo; sin
consumidores todavía, así que `git revert` elimina solo este tramo.

### Status

WU3 completo (3.1-3.5 todos `[x]`). Listo para `sdd-verify` en WU3, o WU4 (ABM de cliente).

## WU4a: Casos de uso de cliente (tarea 4.1, parcial) — COMPLETA para este tramo

Branch `feat/feriados-configurables-wu4a`, apilado sobre `wu3b` (`46d3e56`). La tarea 4.1 está
pre-dividida como WU2: WU4a = casos de uso Listar/Crear/Eliminar + tests unitarios (esta ejecución);
WU4a2 = `EditarFeriadoCliente`; WU4b = DTOs + controller + conexión; WU4c = e2e de aislamiento.

- [x] `ListarFeriadosClienteUseCase` — refleja `ListarFeriadosGlobalesUseCase`, delega
  a `IFeriadoClienteRepository.listar()`.
- [x] `CrearFeriadoClienteUseCase` — valida `fecha` mediante `FechaCalendario.crear()`,
  verifica de antemano `IFeriadosGlobalesChecker.esGlobal()` (D4) → `FeriadoFechaEsGlobalError`,
  y luego persiste; captura P2002 → `FeriadoFechaDuplicadaError` para el duplicado
  dentro de la misma lista (sin verificación previa separada contra la propia lista del
  cliente, según el precedente de `CrearFeriadoGlobalUseCase` y la condición de carrera
  entre bases aceptada por D4).
- [x] `EliminarFeriadoClienteUseCase` — refleja `EliminarFeriadoGlobalUseCase`,
  borrado físico, `FeriadoNoEncontradoError` cuando `buscarPorId` no encuentra nada.

El checkbox de la tarea 4.1 en `tasks.md` sigue en `[ ]` — cubre los cuatro casos de uso y
`EditarFeriadoCliente` queda diferido para WU4a2.

### Files Changed

| Archivo | Acción | Qué |
|---|---|---|
| `backend/src/calendario-laboral/application/use-cases/listar-feriados-cliente.use-case.ts` | Creado | `ListarFeriadosClienteUseCase` |
| `backend/src/calendario-laboral/application/use-cases/listar-feriados-cliente.use-case.spec.ts` | Creado | Tests unitarios: devuelve la lista del repo, una lista vacía no falla |
| `backend/src/calendario-laboral/application/use-cases/crear-feriado-cliente.use-case.ts` | Creado | `CrearFeriadoClienteUseCase` |
| `backend/src/calendario-laboral/application/use-cases/crear-feriado-cliente.use-case.spec.ts` | Creado | Tests unitarios: camino feliz, fecha inválida, rechazo por deduplicación global, mapeo de P2002, otros errores se relanzan |
| `backend/src/calendario-laboral/application/use-cases/eliminar-feriado-cliente.use-case.ts` | Creado | `EliminarFeriadoClienteUseCase` |
| `backend/src/calendario-laboral/application/use-cases/eliminar-feriado-cliente.use-case.spec.ts` | Creado | Tests unitarios: elimina cuando se encuentra, si no se encuentra corta el flujo |

### Deviations from Design

Ninguna — coincide con D4 (verificación previa de deduplicación global, duplicado dentro
de la misma lista vía P2002, condición de carrera entre bases aceptada) y refleja exactamente
la forma del caso de uso global de WU2.

### Work Unit Evidence

| Evidencia | Valor |
|---|---|
| Comando de test focalizado y resultado | `pnpm vitest run src/calendario-laboral` (desde `backend/`) → 18 archivos de test, 112 tests, todos aprobados |
| Runtime harness | N/A — todavía no hay controller conectado (WU4b conecta `FeriadosClienteController`); solo tests unitarios |
| Límite de rollback | 6 archivos nuevos, todo aditivo; nada los referencia todavía. `git revert` elimina solo este tramo |

### Workload / PR Boundary

- Modo: tramo de PR encadenada (Feature Branch Chain), apilado sobre `feat/feriados-configurables-wu3b`
- Unidad de trabajo actual: WU4a (tarea 4.1 parcial) — Listar/Crear/Eliminar completos
- Impacto medido en el presupuesto de revisión: 324 líneas cambiadas (código) para este commit, bien por debajo de 400

### Status

3/4 casos de uso de la tarea 4.1 completos. El checkbox de la tarea 4.1 en `tasks.md` sigue
sin marcar hasta que Editar se entregue en WU4a2.

## WU4a2: Caso de uso Editar de cliente (finalización de la tarea 4.1) — COMPLETA

Branch `feat/feriados-configurables-wu4a2`, apilado sobre `wu4a` (`55ffcdc`). Implementa la
parte diferida de la tarea 4.1: `EditarFeriadoClienteUseCase` + tests unitarios. Refleja
la forma de `EditarFeriadoGlobalUseCase` (buscarPorId → `FeriadoNoEncontradoError`,
`FechaCalendario.crear()`, `FeriadoEntity.editar()` reemplazo completo, P2002 →
`FeriadoFechaDuplicadaError`), más la verificación previa de deduplicación global de
`CrearFeriadoClienteUseCase` (`IFeriadosGlobalesChecker.esGlobal` → `FeriadoFechaEsGlobalError`)
según D4, que exige la verificación tanto en editar como en crear. Orden: buscarPorId →
validación de fecha → verificación de esGlobal → persistir.

### Files Changed

| Archivo | Acción | Qué |
|---|---|---|
| `backend/src/calendario-laboral/application/use-cases/editar-feriado-cliente.use-case.ts` | Creado | `EditarFeriadoClienteUseCase` |
| `backend/src/calendario-laboral/application/use-cases/editar-feriado-cliente.use-case.spec.ts` | Creado | Tests unitarios: camino feliz, no encontrado, fecha inválida, edición hacia una fecha global rechazada, mapeo de P2002, otros errores se relanzan |
| `openspec/changes/feriados-configurables/tasks.md` | Modificado | Checkbox de la tarea 4.1 `[ ]` → `[x]` |

### Deviations from Design

Ninguna — coincide con D4 (verificación previa de deduplicación global en la edición) y
refleja exactamente la forma del caso de uso Editar global de WU2a2.

### Work Unit Evidence

| Evidencia | Valor |
|---|---|
| Comando de test focalizado y resultado | `pnpm vitest run src/calendario-laboral` (desde `backend/`) → 19 archivos de test, 118 tests, todos aprobados |
| Runtime harness | N/A — todavía no hay controller conectado (WU4b conecta `FeriadosClienteController`); solo tests unitarios |
| Límite de rollback | Ambos archivos nuevos son aditivos, nada más los referencia todavía. `git revert` elimina solo este tramo |

### Status

4/4 casos de uso de la tarea 4.1 completos (Listar, Crear, Editar, Eliminar). El checkbox
de la tarea 4.1 en `tasks.md` ahora está en `[x]`. Listo para WU4b (DTOs, controller, conexión).

## WU4b: DTOs, controller y conexión de cliente (tareas 4.2/4.4) — COMPLETA

Branch `feat/feriados-configurables-wu4b`, apilado sobre `wu4a2` (`6ff53a5`).
Solo las tareas 4.2 (`feriado-cliente.dto.ts` + `FeriadosClienteController`) y 4.4
(conexión de módulo) — la tarea 4.3 (e2e de aislamiento) es WU4c.

`Create/UpdateFeriadoClienteDto` reflejan `feriado.dto.ts` (D9) como clases
separadas, sin reutilizar — dueño de escritura/recurso distinto, precedente
de `catalogo.dto.ts`. `FeriadosClienteController`: `@UseGuards(JwtAuthGuard,
TenantGuard)` a nivel de clase (D5, `catalogos.controller.ts:94`);
`AdminClienteGuard` solo por método de escritura, nunca a nivel de clase
(ADR-P5 — no hay metadata para sobrescribir desde el handler, rompería el
`GET` abierto). Sin verificación inline de `clienteId` (D6): el aislamiento
es estructural vía `TenantContext`, un `:id` de otro inquilino no se
encuentra → 404. `toHttpException` (D7): `FeriadoNoEncontradoError` → 404,
el resto del catálogo de 4 clases → 422, `DELETE` → 204.
`calendario-laboral.module.ts` (solo aditivo): conecta
`FERIADO_CLIENTE_REPOSITORY`/`FERIADOS_GLOBALES_CHECKER` (construidos en
WU3a/WU3b) + los 4 casos de uso vía `useFactory`; comentario desactualizado
de H3 sin tocar (WU5). `.spec.ts` acotado según lo asignado: metadata de
guard + tabla error→HTTP.

Ninguna vs. D2/D4/D5/D6/D7/D9. `pnpm typecheck`/`pnpm lint`: limpio. `pnpm
vitest run src/calendario-laboral`: 20 archivos, 128 tests, todos aprobados.
Runtime harness: N/A — todavía no hay ida y vuelta de HTTP/Postgres (WU4c).
Rollback: 3 archivos nuevos + una edición aditiva de módulo. Bien por
debajo del presupuesto de 400 líneas.

### Status

Tareas 4.2/4.4 completas (`tasks.md` actualizado). La tarea 4.3 queda pendiente para WU4c.

## WU4c: e2e de aislamiento de cliente (tarea 4.3) — COMPLETA

`feriados-cliente.e2e.spec.ts` (Creado), branch `feat/feriados-configurables-wu4c`
(apilado sobre `wu4b`, commit `204fd8e`). No existía precedente de e2e con dos inquilinos
en este repo; se construyó sobre el patrón de un solo inquilino (`csat.e2e.spec.ts`,
`sectores.e2e.spec.ts`) duplicado para los inquilinos A y B
(`PostgresAdminService.createDatabase` + `TenantMigrationRunnerAdapter` ×2), más JWTs
firmados directamente vía `payloadDeTest`/`tokenService.signJwt` — ni `TenantGuard` (solo
lee `master.clientes`) ni `AdminClienteGuard` (solo claims del JWT) tocan
`usuarios`/`membresias`, así que no hicieron falta fixtures de login/membresía.

Cubre los 7 casos del prompt de lanzamiento: (1) aislamiento A/B en ambas direcciones, (2)
un `:id` de B → 404 en el PATCH/DELETE de A, verificado luego directamente contra la base
del inquilino B, (3) rol no administrador de A — 200 en lectura / 403 en escritura ×3, (4)
ROOT con `cliente_id=A` → 201, (5) sin token → 401, (6) fecha ya global (`2026-12-25`,
Navidad sembrada) → 422, misma fecha dos veces en A → 422 la segunda vez, (7) ida y vuelta
de fecha, sin corrimiento de UTC.

Desviaciones: ninguna respecto del diseño (D5/D6/D7). Higiene: las filas de `clientes` en
master se borran por id en `afterAll` (nunca se truncan); ambas bases de inquilino
efímeras se dropean completas, sin necesidad de limpieza previa a nivel de fila ya que
nada fuera del archivo las toca.

Evidencia: `pnpm typecheck` limpio; `pnpm lint` limpio (2 hallazgos de prettier
corregidos automáticamente); `pnpm vitest run src/calendario-laboral` → 21 archivos, 139
tests, todos aprobados (+11). Verificado después de la corrida: sin base efímera
`soporte_*_test` huérfana, sin fila de `clientes` remanente. Total de `git show --numstat
HEAD`: 371 líneas (359 del spec nuevo + 11 de apply-progress + 1 del checkbox de
tasks.md), por debajo del presupuesto de 400. Rollback: un archivo nuevo + un checkbox de
`tasks.md` + esta nota; nada depende de esto.

### Status

WU4 completo (4.1-4.4 todos `[x]`). Listo para `sdd-verify` en WU4.

## WU5a: Observabilidad del listener (tareas 5.3/5.4, D10) — COMPLETA

Branch `feat/feriados-configurables-wu5a`, apilado sobre `wu4c` (`bc4cc2e`). El
orquestador pre-dividió WU5 para que el logging llegue antes del throw fail-closed de
WU5b: WU5a = 5.3/5.4 (esta ejecución); WU5b = 5.1/5.2/5.5 (unión + fail-closed + H4 +
comentarios desactualizados); WU5c = 5.6 (e2e de SLA).

- [x] 5.3 `AplicarSlaListener` ahora recibe `ILogger` (token `LOGGER`) como segundo
  parámetro del constructor, el mismo puerto que ya usa el sweep scheduler. Ambos bloques
  `catch` (`onTicketCreado`, `onTicketReprioritizado`) llaman a `logger.error('SLA_APLICAR_ERROR |
  evento=<...> | ticket=<id> | error=<mensaje>')`, con `mensaje` derivado exactamente
  igual que en `sla-sweep.scheduler.ts:55-56` (`error instanceof Error ? error.message :
  'error desconocido'`). Sin relanzamiento (ADR-6 sigue vigente — el ticket ya está
  commiteado). Los comentarios "log-and-swallow" se mantuvieron y se actualizaron para
  que describan lo que el código hace ahora (loguear y luego silenciar) en vez de
  silencio puro. La factory de `AplicarSlaListener` en `sla.module.ts` ahora inyecta
  `LOGGER` junto con `AplicarSlaUseCase`.
- [x] 5.4 `aplicar-sla.listener.spec.ts`: se agregó un `ILogger` mockeado (spies de
  `log`/`error`) a `makeListener()`. Casos nuevos por handler: rechazo → `logger.error`
  llamado exactamente una vez con un mensaje que contiene el nombre del evento,
  `ticket=<id>`, y el mensaje de error original, verificando que NO contenga
  `[object Object]` ni un marcador de stack trace (`at `); el handler igual resuelve sin
  relanzar. También cubre un valor de rechazo que no es `Error` (loguea `error
  desconocido`) y el camino feliz (sin llamada a error). Los 4 tests preexistentes se
  mantuvieron en verde sin cambios.

### Files Changed

| Archivo | Acción | Qué |
|---|---|---|
| `backend/src/sla/infrastructure/listeners/aplicar-sla.listener.ts` | Modificado | Se inyectó `ILogger`; ambos bloques `catch` ahora registran mediante `logger.error` antes de silenciar el error |
| `backend/src/sla/sla.module.ts` | Modificado | La factory de `AplicarSlaListener` ahora inyecta `LOGGER` |
| `backend/src/sla/infrastructure/listeners/aplicar-sla.listener.spec.ts` | Modificado | Se agregó el mock de `ILogger`; 5 casos de prueba nuevos para el comportamiento de logging de D10 |
| `openspec/changes/feriados-configurables/tasks.md` | Modificado | Tareas 5.3/5.4 `[ ]` → `[x]` |

### Deviations from Design

Ninguna — coincide exactamente con D10 (puerto, token, formato del mensaje, derivación del mensaje de error, sin relanzamiento). Los comentarios preexistentes de "log-and-swallow" se reformularon (no se eliminaron) para que sigan siendo precisos ahora que existe una llamada de log; esto estaba implícito en la instrucción del prompt de lanzamiento "Keep/refresh the existing... comment so it is now TRUE", no es una desviación.

### Hallazgos

Ninguna.

### Work Unit Evidence

| Evidencia | Valor |
|---|---|
| `pnpm typecheck` | sin errores |
| `pnpm lint` | sin errores, sin hallazgos |
| `pnpm vitest run src/sla src/calendario-laboral` (desde `backend/`) | 27 archivos de prueba, 187 pruebas, todas pasaron |
| Total de `git show --numstat HEAD` (commit completo incl. openspec) | 3 archivos de código modificados, 96 inserciones / 13 eliminaciones antes de los archivos de openspec; ver el commit para el total final, muy por debajo del presupuesto de 400 líneas |
| Límite de rollback | Cambio de comportamiento puramente aditivo sobre un listener existente ya conectado; `git revert` restaura el silenciamiento silencioso sin afectar dependientes posteriores |

### Workload / PR Boundary

- Modo: porción de PR encadenado (Feature Branch Chain), apilada sobre `feat/feriados-configurables-wu4c`
- Unidad de trabajo actual: WU5a (solo tareas 5.3/5.4) — completa
- Límite: comienza desde el `AplicarSlaListener` existente (catch silencioso); termina con
  ambos manejadores registrando mediante `ILogger.error` antes de silenciar el error, listo para que el throw fail-closed de WU5b deje de ser silencioso
- Impacto medido en el presupuesto de revisión: muy por debajo de 400 líneas cambiadas

### Status

Tareas 5.3/5.4 completas (`tasks.md` actualizado). WU5 continúa con WU5b (5.1/5.2/5.5) y WU5c (5.6).

## WU5b: unión de SLA, falla cerrado, corrección de H4, corrección parcial de comentario desactualizado (tareas 5.1/5.2, 5.5 parcial) — COMPLETA para esta porción

Rama `feat/feriados-configurables-wu5b`, apilada sobre `wu5a` (`46044e9`).

- [x] 5.1 `PrismaFeriadosLaboralesRepository.obtener()` toma `TenantContext` como segundo
  parámetro del constructor (Nest lo autoinyecta vía `useClass`, no hace falta cambiar la
  factory de `module.ts`). `tenantContext.get()` sin bind → lanza `FeriadosSinTenantContextError extends
  Error` (D3, error de infraestructura simple, precedente `ErrorEntornoInvalido`). Con bind →
  `Promise.all([master.feriado.findMany(), tenantClient.feriadoCliente.findMany()])`, ambos
  pasados por `PrismaCalendarioLaboralMapper.claveDiaUtcDe` hacia un único `Set<string>`.
- [x] 5.2 H4 corregido: el spec de integración ahora crea una base de inquilino efímera
  (`PostgresAdminService`/`TenantMigrationRunnerAdapter`, patrón
  `prisma-feriado-cliente...`), la vincula mediante `tenantContext.run(ctx, fn)` y la
  elimina en `afterAll`. Agregado: unión entre fuentes, deduplicación en una fecha
  compartida, ejecución del throw sin bind fuera de `conContexto()`. Nuevo spec unitario
  `prisma-feriados-laborales.repository.spec.ts` (Prisma + TenantContext mockeados):
  unión, deduplicación, tabla de inquilino vacía, throw sin bind, mapeo `@db.Date` para
  ambas fuentes.
- [x] 5.5 (**parcial**) Solo se reescribió el comentario de encabezado propio del
  repositorio (unión/sin caché/falla cerrado) — inevitable, este archivo se reescribió en
  este commit.

### Diferido a una subunidad de seguimiento (presupuesto)

Un primer borrador también corrigió los otros 3 comentarios de H3 (docstring del puerto,
docstring de `AplicarSlaUseCase`, encabezado de `module.ts`) — solo comentarios, en
archivos que esta WU de otro modo nunca toca. Con eso, el commit midió 443 líneas contra
el presupuesto de 400; según la regla del dueño se revirtieron al texto previo a WU5b.
`tasks.md` 5.5 queda en `[ ]`. Objetivo del rehacer: expresar
unión/sin caché/falla cerrado/registro del listener en los 3, además de corregir el falso
"no se importa desde ningún otro" de `module.ts` (`sla.module.ts:101` ya lo importa).

### Deviations from Design

Ninguna en el código entregado — coincide con D3 (throw de falla cerrado, no
`Result`/degradar/`getClient()`), reutiliza `claveDiaUtcDe` según D2; la firma del puerto
no cambia, no hace falta editar `AplicarSlaUseCase`/`CalcularSlaHabilVenceService`. La
única desviación es de cronograma: 5.5 se dividió entre esta corrida y un seguimiento,
mismo patrón que WU2a/WU2a2 y WU4a/WU4a2.

### Work Unit Evidence

| Evidencia | Valor |
|---|---|
| `pnpm typecheck` / `pnpm lint` (desde `backend/`) | ambos sin errores |
| `pnpm vitest run src/sla src/calendario-laboral src/tickets` | 82 archivos, 722 pruebas, todas pasaron |
| Arnés de ejecución | Postgres real: `soporte_master_test` (nunca truncada) + una base de inquilino efímera creada/migrada/eliminada por corrida; se confirmó que no queda ninguna base `soporte_*_test` huérfana |
| Límite de rollback | `git revert` restaura la lectura solo-global previa a la unión (una regresión de spec, no un crash); sin dependientes posteriores más allá de este commit |

### Workload / PR Boundary

- Modo: porción de PR encadenado (Feature Branch Chain), apilada sobre `feat/feriados-configurables-wu5a`
- Unidad de trabajo actual: WU5b (5.1/5.2 completas, 5.5 parcial) — WU5c (5.6) y el resto
  de 5.5 son corridas de seguimiento separadas
- Nota de deploy (arrastrada): `migrate:tenants` debe correr antes de que esto se
  despliegue a cualquier inquilino, o el camino de SLA lanza `P2021` ahí (registrado
  mediante D10 de WU5a, no en silencio)
- Impacto medido en el presupuesto de revisión: por debajo del presupuesto de 400 tras
  diferir 3/4 de 5.5 (ver arriba); la porción completa con los 4 comentarios midió 443

### Status

5.1/5.2 completas; 5.5 parcial (el checkbox queda en `[ ]`). WU5 continúa con un
pequeño seguimiento para el resto de 5.5, y luego WU5c.

## WU5b2: correcciones restantes de comentarios desactualizados (tarea 5.5) — COMPLETA

Rama `feat/feriados-configurables-wu5b2`, apilada sobre `wu5b` (`1cc0a15`). Hecho en
línea por el orquestador: el docstring del puerto, el encabezado de
`CalendarioLaboralModule` y el docstring de `AplicarSlaUseCase` ahora describen la unión
global ∪ del propio cliente, el throw de falla cerrado y el registro del listener. Solo
comentarios; sin cambio de comportamiento.

## WU5c: prueba end-to-end de SLA (tarea 5.6) — COMPLETA, WU5 cerrada por completo

Rama `feat/feriados-configurables-wu5c`, apilada sobre `wu5b2` (`4bc213b`).

- [x] 5.6 El nuevo spec `aplicar-sla-habil-feriados.e2e.spec.ts` prueba la unión global ∪
  del propio cliente de punta a punta contra Postgres real, con dos inquilinos efímeros
  (A, B). Conexión manual de las clases exactas de producción
  (`AplicarSlaListener`/`AplicarSlaUseCase`/
  `CalcularSlaHabilVenceService`/`PrismaFeriadosLaboralesRepository`/etc., el mismo
  conjunto que `sla.module.ts:100-159` conecta vía DI) en lugar de compilar todo el árbol
  `SlaModule` + `TicketsModule` + `AuthModule` + `CalendarioLaboralModule` — no hace falta
  HTTP/JWT porque el camino bajo prueba es el listener, no un controlador; se mantiene muy
  por debajo del presupuesto sin perder realismo (mismas clases, mismo Postgres, mismo
  cálculo de dominio). El calendario semanal (lun-vie 09:00-18:00 ART) es una semilla de
  migración permanente, no un fixture. Un `it()`, 4 aserciones secuenciales sobre el mismo
  ticket (un ticket HABIL, SLA de 27h y luego 36h, anclado el lunes 2031-04-07 09:00 ART):
  - Creación: salta el feriado global (mar 04-08) y el feriado propio de A (mié 04-09),
    cuenta el feriado de B (jue 04-10) con normalidad → `sla_vence_at =
    2031-04-11T21:00:00.000Z` (vie 18:00 ART). Cubre tanto "salta global+propio" como
    "nunca salta el de otro cliente" en un solo cálculo, ya que la misma ventana contiene
    los tres tipos de feriado.
  - Repriorización (mismo ancla `createdAt`, nueva prioridad de 36h): recalcula con la
    misma unión, cruzando un fin de semana → `2031-04-14T21:00:00.000Z` (el lunes
    siguiente 18:00 ART).
  - Agregar un nuevo feriado de A (04-16) después de que el ticket ya tiene `sla_vence_at`
    fijado: el valor no cambia — nada dispara un recálculo al crear un feriado.
  - Las 4 aserciones exactas de vencimiento/salto pasaron en la primera corrida
    (coincidencia manual de aritmética de calendario, sin necesidad de reintentos).

### Deviations from Design

Ninguna en las aserciones/requisitos del spec. Una decisión de alcance: la fila de
Testing Strategy de design.md dice "`insumos-catalogos.e2e.spec.ts` / `tickets.e2e.spec.ts`
templates" como el precedente de E2E; este spec en cambio sigue el patrón más liviano de
conexión manual de `prisma-sla-ticket.integration.spec.ts` (repositorios reales
respaldados por Prisma, sin contenedor de DI de Nest, sin HTTP). Justificado arriba — el
prompt de lanzamiento permitió explícitamente "the use case + listener wiring" como
alternativa al camino HTTP y pidió "prefer the most real path that stays within budget".

### Hallazgos

Ninguna.

### Work Unit Evidence

| Evidencia | Valor |
|---|---|
| `pnpm typecheck` (desde `backend/`) | sin errores |
| `pnpm lint` (desde `backend/`) | sin errores, sin hallazgos (5 hallazgos de prettier corregidos automáticamente con `eslint --fix`, luego reverificado sin errores) |
| `pnpm vitest run src/sla src/calendario-laboral src/tickets` (desde `backend/`) | 83 archivos, 723 pruebas, todas pasaron |
| Arnés de ejecución | Postgres real: `soporte_master_test` (nunca truncada, su propia fila se elimina en `afterAll`, `usarLockMasterTest()`) + dos bases de inquilino efímeras (A, B) creadas/migradas/eliminadas por corrida; se confirmó que no queda ninguna base `soporte_*_test` huérfana (solo quedan `soporte_master_test`/`soporte_tenant_test`) |
| Límite de rollback | Solo un archivo de prueba nuevo, puramente aditivo; `git revert` lo elimina sin dependientes posteriores |

### Workload / PR Boundary

- Modo: porción de PR encadenado (Feature Branch Chain), apilada sobre `feat/feriados-configurables-wu5b2`
- Unidad de trabajo actual: WU5c (5.6) — completa; **WU5 ahora está cerrada por completo**
  (5.1-5.6 todas en `[x]`)
- Límite: un archivo de spec e2e nuevo, solo pruebas, no se tocó código de producción
- Impacto medido en el presupuesto de revisión: muy por debajo de 400 líneas cambiadas
  (un solo archivo de prueba)

### Status

Tarea 5.6 completa (`tasks.md` actualizado). WU5 (5.1-5.6) cerrada por completo.
Siguiente: WU6 (tokens/badge/scaffolding de frontend).

## WU6a: token info + variantes de badge + OrigenFeriadoBadge (tareas 6.1/6.2) — COMPLETA

Rama `feat/feriados-configurables-wu6a`, apilada sobre `wu5c` (`156c764`). Solo
frontend; `backend/` sin tocar.

- [x] 6.1 `globals.css`: `--info`/`--info-foreground`/`--info-light` en `:root` y
  `.dark` (valores exactos de tasks.md) + `@theme inline --color-info*`, junto al bloque
  `--color-success-light`/`--color-warning-light`. `badge.tsx`: variantes `success-light`
  (`bg-success-light text-success`) e `info` (`bg-info-light text-info`).
- [x] 6.2 `OrigenFeriadoBadge` en
  `frontend/src/features/feriados/components/origen-feriado-badge.tsx`, con la misma
  forma de configuración estática que `status-badge.tsx`/`estado-compra-badge.tsx`:
  `GLOBAL` → "Nacional" + `success-light`, `CLIENTE` → "Del cliente" + `info`. El tipo
  `OrigenFeriado` se declara localmente (el backend nunca devuelve un campo origen —
  `combinarFeriados()`, tarea 8.1, lo asignará); WU6b/types.ts podrá reexportarlo más
  adelante sin cambiar su forma.

**Decisión de contraste (ambas variantes usan `text-{color}`, nunca
`text-{color}-foreground`, sobre el fondo `-light`):** `--success-foreground`/
`--warning-foreground` están emparejados con el SÓLIDO `bg-success`/`bg-warning`, no con
`-light`. En modo oscuro, `--warning-foreground` (`#451a03`) ya es igual a
`--warning-light` (`#451a03`) — usar `-foreground` sobre un fondo `-light` renderizaría
texto invisible. Se le dio a `--info` la misma forma a propósito y se eligió
`text-info`/`text-success` para ambas variantes nuevas:
- Claro: `#0369a1` sobre `#e0f2fe` (~5.2:1), `#15803d` sobre `#dcfce7` (`--success`
  preexistente, ~4.6:1) — ambos pasan WCAG AA.
- Oscuro: `#38bdf8` sobre `#082f49` (~6.5:1), `#4ade80` sobre `#052e16` (`--success`
  preexistente, ~8.6:1) — ambos pasan. `text-info-foreground` sobre `bg-info-light` en
  modo oscuro habría sido `#082f49` sobre `#082f49` — invisible. Se evitó la misma trampa
  que `warning` ya tenía latente (nunca se disparó porque no existía ninguna variante de
  badge `warning-light` antes de esta WU).

### Files Changed

| Archivo | Acción | Qué |
|---|---|---|
| `frontend/src/styles/globals.css` | Modificado | `--info`/`--info-foreground`/`--info-light` (claro + oscuro) + `@theme inline --color-info*` |
| `frontend/src/components/ui/badge.tsx` | Modificado | Se agregaron las variantes `success-light` e `info` a `badgeVariants` |
| `frontend/src/features/feriados/components/origen-feriado-badge.tsx` | Creado | `OrigenFeriadoBadge` + tipo `OrigenFeriado` |
| `frontend/src/features/feriados/components/origen-feriado-badge.test.tsx` | Creado | Etiqueta + clase de variante por origen, GLOBAL/CLIENTE visualmente distintos |
| `openspec/changes/feriados-configurables/tasks.md` | Modificado | 6.1/6.2 → `[x]`; 6.4 anotada como movida a WU7; se agregó nota de división de WU6 |

### Deviations from Design

Ninguna en los tokens/variantes entregados (los valores hex exactos de D8, la forma
`bg-*-light text-*`). La ubicación del tipo `OrigenFeriado` (colocado en el archivo del
badge, no en `types.ts`) es una decisión de alcance, no una desviación: la tarea 6.3
(scaffolding incl. `types.ts`) es WU6b, fuera del alcance de esta corrida; el tipo es
autocontenido e importable tal cual.

### Work Unit Evidence

| Evidencia | Valor |
|---|---|
| `pnpm type-check` (desde `frontend/`) | sin errores |
| `pnpm lint` (desde `frontend/`) | sin errores, sin hallazgos |
| `pnpm vitest run src/features/feriados src/components/ui` (desde `frontend/`) | 7 archivos de prueba, 20 pruebas, todas pasaron |
| Arnés de ejecución | Manual (ambos temas) no se corrió en esta sesión — se verificó en cambio mediante la aritmética de contraste de arriba; ninguna pantalla consume el badge todavía (WU7) |
| Límite de rollback | 2 archivos nuevos, 2 ediciones puramente aditivas (variables CSS nuevas + variantes cva nuevas, nada existente se eliminó/renombró); nada más referencia `OrigenFeriadoBadge` todavía — `git revert` elimina solo esta porción |

### Workload / PR Boundary

- Modo: porción de PR encadenado (Feature Branch Chain), apilada sobre `feat/feriados-configurables-wu5c`
- Unidad de trabajo actual: WU6a (solo tareas 6.1/6.2) — completa
- Impacto medido en el presupuesto de revisión: el commit completo incl. openspec está
  muy por debajo del presupuesto de 400 líneas

### Status

Tareas 6.1/6.2 completas (`tasks.md` actualizado). WU6 continúa con WU6b (tarea 6.3:
types/cliente de API/Zod/`limites.ts`). La tarea 6.4 (entrada de navegación) se movió a
WU7.

## WU6b: scaffolding de frontend — types, cliente de API, Zod, limites (tarea 6.3) —
COMPLETA, WU6 cerrada por completo

Rama `feat/feriados-configurables-wu6b`, apilada sobre `wu6a` (`8a8588c`). Solo
frontend; `backend/` sin tocar.

- [x] 6.3 `types.ts` (respuestas `Feriado`/`FeriadoCliente`, 4 DTOs de escritura que
  reflejan `feriado.dto.ts`/`feriado-cliente.dto.ts`, `OrigenFeriado` movido aquí desde el
  archivo del badge de WU6a y reexportado desde ahí sin cambios). `limites.ts` copia
  `FERIADO_DESCRIPCION_MAX_LENGTH`/`FECHA_CALENDARIO_REGEX` desde `feriados.constants.ts`
  del backend (D9), precedente `ciclos-master/limites.ts`. `schemas.ts`: un único
  `feriadoSchema` (regex de fecha + mínimo/máximo de descripción) reutilizado en los 4
  DTOs, ya que los cuatro comparten la misma forma — solo validación a nivel de DTO
  (regex, no la verificación de fecha de calendario real del dominio), en línea con el
  mismo nivel de simplicidad de `ciclos-master/schemas.ts`. `api.ts`: 8 funciones async
  simples (listar/crear/editar/eliminar × global/cliente) que envuelven `apiFetch`.
- [x] Prueba centinela en `schemas.test.ts` (patrón de `ciclos-master/schemas.test.ts`):
  verifica los valores literales copiados (`200`, la cadena de origen del regex) — detecta
  una edición accidental aquí, no un cambio del lado del backend (mismo límite de alcance
  documentado que el precedente).

### Desviación: `api.ts` como funciones simples, no incorporadas en hooks

El único precedente de `ciclos-master` para "dónde viven las llamadas a la API" es
`apiFetch` llamado en línea dentro de `useQuery`/`useMutation`
(`hooks/use-ciclos-vigentes-admin*.ts`) — no existe ningún precedente de módulo de
cliente de API independiente en ningún lugar de `frontend/src/features/` (se revisó
`ciclos-master`, `catalogos`, y se buscó con grep en el comentario de encabezado de cada
`features/*/types.ts` un archivo de cliente hermano; no existe ninguno). La tarea 6.3
pide explícitamente "API client functions for both endpoints" como entregable de WU6b,
mientras que los hooks se difieren a WU7/WU8. Resuelto extrayendo 8 funciones async
simples (sin `useQuery`/`useMutation`) en `api.ts`: esto satisface la letra de 6.3 sin
introducir un hook, y le da a `combinarFeriados()` de WU8 (D8) dos funciones de listado
que puede llamar directamente fuera del ciclo de vida de cualquier hook único — una
necesidad real que `ciclos-master` nunca tuvo (nunca combina dos endpoints de listado del
lado del cliente). Los hooks de WU7/WU8 llaman a estas funciones en lugar de incorporar
`apiFetch` una segunda vez. Declarado aquí, no en silencio.

### Files Changed

| Archivo | Acción | Qué |
|---|---|---|
| `frontend/src/features/feriados/types.ts` | Creado | `Feriado`, `FeriadoCliente`, 4 DTOs de escritura, `OrigenFeriado` (movido desde el archivo del badge) |
| `frontend/src/features/feriados/limites.ts` | Creado | `FERIADO_DESCRIPCION_MAX_LENGTH = 200`, `FECHA_CALENDARIO_REGEX`, copiados desde el backend |
| `frontend/src/features/feriados/schemas.ts` | Creado | `feriadoSchema` (regex de fecha + mínimo/máximo de descripción), `FeriadoFormValues` |
| `frontend/src/features/feriados/schemas.test.ts` | Creado | Pruebas de tope de descripción, pruebas de formato de fecha, 2 centinelas de valor |
| `frontend/src/features/feriados/api.ts` | Creado | 8 funciones simples que envuelven `apiFetch` para `/feriados` y `/feriados-cliente` |
| `frontend/src/features/feriados/components/origen-feriado-badge.tsx` | Modificado | `OrigenFeriado` ahora se importa desde `../types` y se reexporta (antes se declaraba localmente en WU6a) |
| `openspec/changes/feriados-configurables/tasks.md` | Modificado | 6.3/6.5 → `[x]` |

### Work Unit Evidence

| Evidencia | Valor |
|---|---|
| `pnpm type-check` (desde `frontend/`) | limpio |
| `pnpm lint` (desde `frontend/`) | limpio, sin hallazgos |
| `pnpm vitest run src/features/feriados src/components/ui` (desde `frontend/`) | 8 archivos de prueba, 28 pruebas, todas exitosas |
| Arnés de runtime | N/A — ninguna pantalla/hook consume `api.ts` todavía (WU7/WU8); funciones puras + esquemas Zod, no se necesita una ida y vuelta en runtime para este segmento |
| Límite de reversión | 5 archivos nuevos + 1 edición solo aditiva (el badge ahora importa un tipo que antes declaraba, misma forma pública); nada más importa `api.ts`/`schemas.ts` fuera de las pruebas propias de esta funcionalidad, por lo que `git revert` elimina solo este segmento |

### Workload / PR Boundary

- Modo: segmento de PR encadenado (Feature Branch Chain), apilado sobre `feat/feriados-configurables-wu6a`
- Unidad de trabajo actual: WU6b (tarea 6.3 + 6.5) — completa; **WU6 ahora está completamente cerrada** (6.1-6.3/6.5
  todas `[x]`; 6.4 se mantiene movida a WU7 según la nota de WU6a)
- Impacto medido en el presupuesto de revisión: total de `git show --numstat HEAD` (commit completo incl.
  openspec) — ver el commit para la cifra exacta; bien por debajo del presupuesto de 400 líneas (5 archivos nuevos
  pequeños + 1 edición solo de comentario de documentación + 2 casillas)

### Status

Tarea 6.3 completa, tarea 6.5 (verificación) ejecutada y en verde. `tasks.md` actualizado. WU6 (6.1-6.3,
6.5) completamente cerrada; 6.4 permanece incorporada en la tarea 7.1 de WU7. Siguiente: WU7 (pantalla de feriados
globales de ROOT).

## WU7a: pantalla de feriados globales de ROOT — lado de LECTURA (tareas 6.4, 7.1 parcial, 7.3) — COMPLETA

Rama `feat/feriados-configurables-wu7a`, apilada sobre `wu6b` (`a1073b4`). Solo frontend.

- Decisión de ruta: `/admin/feriados-globales`, coincide con el nombre literal del diseño D8 — no la
  forma de nivel superior `/ciclos`. `admin/clientes` y `admin/tipos-componente` son el precedente
  más cercano: ambas son pantallas master solo de ROOT anidadas bajo `/admin/`, cada una con su propio
  `layout.tsx` que llama a `rootLayoutGate()`. Se siguió esa estructura al pie de la letra.
- El hook `useFeriadosGlobales` llama a `listarFeriados()` desde `api.ts` (WU6b), sin
  `apiFetch` inline. `FeriadosGlobalesAdminView` sigue a `ciclos-vigentes-admin-view.tsx`:
  compuerta de cliente `isGlobalAdmin`, `DataTable` + `OrigenFeriadoBadge` ("Nacional"), todavía sin columna de
  acciones (solo de vista; WU7b agrega crear/editar/eliminar). El backend ya ordena por `fecha`
  ascendente (D8); la pantalla renderiza tal como se recibe, sin reordenar del lado del cliente.
- Entrada de navegación (6.4) registrada en `ROOT_SECTION_ITEMS`, protegida por la compuerta `isGlobalAdmin`, nuevo
  ícono `PartyPopper` (verificado presente en las declaraciones de tipos de `lucide-react`).
- 7.3: `nav-config.test.ts` demuestra que no hay entrada `/admin/feriados-globales` para no-ROOT;
  el bloqueo de navegación directa reutiliza `rootLayoutGate` sin modificar (sin lógica nueva → sin
  prueba nueva de layout, igual que `/admin/clientes`/`/admin/tipos-componente`, ninguna de las cuales tiene
  una) más una prueba de compuerta del lado del cliente en el propio archivo de pruebas de la vista.

### Files Changed

| Archivo | Acción |
|---|---|
| `frontend/src/app/(dashboard)/admin/feriados-globales/page.tsx` | Creado |
| `frontend/src/app/(dashboard)/admin/feriados-globales/layout.tsx` | Creado |
| `frontend/src/features/feriados/hooks/use-feriados-globales.ts` | Creado |
| `frontend/src/features/feriados/components/feriados-globales-admin-view.tsx` | Creado |
| `frontend/src/features/feriados/components/feriados-globales-admin-view.test.tsx` | Creado |
| `frontend/src/shared/nav/nav-config.ts` | Modificado — nueva entrada de navegación |
| `frontend/src/shared/nav/nav-config.test.ts` | Modificado — pruebas de acceso |

### Work Unit Evidence

| Evidencia | Valor |
|---|---|
| `pnpm type-check` | limpio |
| `pnpm lint` | limpio, sin hallazgos |
| `pnpm vitest run src/features/feriados src/shared/nav src/app` | 14 archivos de prueba, 78 pruebas, todas exitosas |
| Límite de reversión | 5 archivos nuevos + 2 ediciones solo aditivas (nuevo import de ícono, nuevo ítem de navegación, nuevos casos de prueba); nada más hace referencia a la nueva ruta/vista; `git revert` elimina solo este segmento |

### Status

Tareas 6.4 y 7.3 completas (`tasks.md` actualizado). Tarea 7.1 parcialmente hecha (pantalla
solo de lista + entrada de navegación; diálogos/mutaciones diferidos). Tarea 7.2 parcialmente hecha (renderizado
ordenado + badge cubiertos; validación de diálogo/toasts diferidos). Siguiente: WU7b (diálogos de crear/editar/
eliminar, mutaciones, sus pruebas — resto de tareas 7.1/7.2, 7.4, 7.5).

## WU7b: pantalla de feriados globales de ROOT — lado de ESCRITURA (resto de tareas 7.1/7.2, 7.4, 7.5) — COMPLETA

Rama `feat/feriados-configurables-wu7b`, apilada sobre `wu7a` (`eef0287`). Solo frontend.
**Dividido en dos commits** — el segmento completo medía más del presupuesto de 400 líneas en un solo
commit, así que crear/editar se integró primero y eliminar le siguió en la misma rama, según la
regla del dueño para unidades de más de 400 líneas cambiadas.

- `FeriadoGlobalFormDialog` (crear+editar, un solo componente) sigue a `CicloVigenteFormDialog`
  al pie de la letra: RHF + `zodResolver(feriadoSchema)`, `valoresVigentes` se recalcula en cada render
  para que al reabrir el diálogo sobre una fila cambiada se muestre el valor vigente. `use-feriados-globales-
  admin-mutations.ts` sigue a `use-ciclos-vigentes-admin-mutations.ts` pero llama a las funciones planas de
  `api.ts` (desviación declarada de WU6b) en vez de poner `apiFetch` inline. Solo invalida
  `["feriados-globales"]` (todavía no hay un segundo consumidor de esa query key).
- **Desviación, declarada acá**: `Column.key` de `DataTable` es `keyof T & string`, la key de React
  para cada header/celda. `Feriado` solo tiene 3 campos reales pero esta tabla necesita 4 columnas
  — Origen (WU7a) y Acciones (este commit) son AMBAS puramente sintéticas (overrides de `render`,
  ninguna lee `row[key]`). Toda otra pantalla que combina un badge + columna de Acciones tiene
  un booleano real de sobra (`activo`/`eliminado`) para el badge; `Feriado` no lo tiene. Resuelto con
  una extensión local solo de tipado de columna, `type FeriadoColumnRow = Feriado & { origen?: never;
  acciones?: never }`, acotada a `feriados-globales-admin-view.tsx` — `types.ts` y
  `data-table.tsx` quedan sin tocar.
- Eliminar reutiliza `ConfirmDialog`, la misma forma que `EliminarCicloVigenteAction` (sin condición
  `disabled` — los feriados globales no tienen flag de soft-delete sobre la cual condicionar).
- **División de pruebas de toast+validación, y por qué**: `<input type="date">` implementa el algoritmo de
  saneamiento de valor de HTML5 — una cadena que no coincide con su formato, INCLUYENDO una fecha bien
  formada pero inexistente como `2026-02-30`, nunca llega a `.value`. Verificado directamente contra
  jsdom: `input.value = "2026-02-30"` en un nodo `type="date"` produce `""`, y mutar primero el
  atributo `type` a `"text"` NO evita esto — jsdom mantiene las reglas de saneamiento del tipo original
  sin importar el atributo `type` vigente. Entonces el 422 de `FechaCalendarioInvalidaError` (D7) es
  inalcanzable desde el DOM de este diálogo, tanto en un navegador real como en una prueba — el
  único camino alcanzable es directamente el hook de mutación. División: `feriados-globales-admin-view.
  test.tsx` cubre lo que el input de fecha SÍ puede producir (vacío → "La fecha es requerida", el
  422 de fecha duplicada con una fecha real) más la validación de descripción, los tres toasts de
  éxito, y el flujo de confirmación de eliminación; `use-feriados-globales-admin-mutations.test.tsx`
  (nuevo, `renderHook`+`QueryClientProvider`, sigue a `use-insumo-mutations.test.tsx`) cubre
  solo lo que la prueba de DOM no puede: la invalidación de query y el 422 de fecha de calendario inválida.
- Ayuda (tarea 7.4): nueva superficie de pantalla de ROOT (crear/editar/eliminar), Ayuda en pausa desde
  el 2026-09-07 — deuda anotada en el cuerpo del commit de eliminación, sin artículo nuevo en `backend/ayuda/*.md`.

### Files Changed

| Archivo | Acción |
|---|---|
| `frontend/src/features/feriados/hooks/use-feriados-globales-admin-mutations.ts` | Creado (commit 1: crear/editar; commit 2: +eliminar) |
| `frontend/src/features/feriados/hooks/use-feriados-globales-admin-mutations.test.tsx` | Creado (commit 1) |
| `frontend/src/features/feriados/components/feriado-global-form-dialog.tsx` | Creado (commit 1) |
| `frontend/src/features/feriados/components/feriados-globales-admin-view.tsx` | Modificado (commit 1: Acciones/Editar; commit 2: +Eliminar) |
| `frontend/src/features/feriados/components/feriados-globales-admin-view.test.tsx` | Modificado (commit 1: crear/editar/validación/toasts; commit 2: +eliminar) |
| `openspec/changes/feriados-configurables/tasks.md` | Modificado (commit 2) — 7.1/7.2/7.3/7.4/7.5 → `[x]` |

### Work Unit Evidence

| Evidencia | Valor |
|---|---|
| `pnpm type-check` (desde `frontend/`) | limpio, ambos commits |
| `pnpm lint` (desde `frontend/`) | limpio, sin hallazgos, ambos commits |
| `pnpm vitest run src/features/feriados src/shared/nav src/app` | 15 archivos de prueba, 86 pruebas, todas exitosas (estado final) |
| `git show --numstat HEAD` (commit 1, crear/editar) | exactamente 400 líneas cambiadas |
| `git show --numstat HEAD` (commit 2, eliminar) | ver el commit — bien por debajo de 400 |
| Límite de reversión | cada commit acotado a `features/feriados/` y sus propias pruebas; `git revert` sobre cualquiera de los dos elimina solo ese segmento (eliminar es aditivo sobre crear/editar, así que revertir el commit 1 sin el commit 2 rompería el build — revertir ambos juntos si se hace rollback de toda la WU) |

### Workload / PR Boundary

- Modo: segmento de PR encadenado (Feature Branch Chain), apilado sobre `feat/feriados-configurables-wu7a`
- Unidad de trabajo actual: WU7b (resto de tarea 7.1, resto de tarea 7.2, 7.4, 7.5) — completa en
  sus dos commits; **WU7 ahora está completamente cerrada** (7.1-7.5 todas `[x]`)
- Impacto medido en el presupuesto de revisión: commit 1 = exactamente 400 líneas cambiadas (al límite del presupuesto); commit 2
  (eliminar + docs) bien por debajo — ver el `git show --numstat` de cada commit

### Status

WU7 completamente cerrada. Siguiente: WU8 (pantalla del cliente, lista combinada, cierre de roadmap).

## WU8a: pantalla de feriados del cliente — lado de LECTURA (tareas 8.1/8.2 parcial, 8.3) — COMPLETA para este segmento

Rama `feat/feriados-configurables-wu8a`, apilada sobre `wu7b` (`469613f`). Solo frontend.

**Decisión de ruta, se desvía de D8**: `/feriados` (nivel superior, fuera de `/admin/`), no
`/admin/feriados` en `AdminNav`. `spec.md` líneas 35-40: cualquier rol autenticado del
cliente lee; solo ADMINISTRADOR/ROOT escribe. `admin/layout.tsx` protege todo el
subárbol `/admin/*` mediante `puedeEntrarAdmin` — ubicarla ahí devolvería 403 a los lectores no admin.
La entrada de navegación vive en `DEFAULT_SECTION_ITEMS` de `nav-config.ts`, `visible: () => true`, la misma
forma que `/tickets`/`/kb`. Razonamiento completo en `tasks.md` 8.3.

`combinarFeriados()` (pura, ordenada por string, nunca `new Date()`) + `useFeriadosCliente`
(refleja a `useFeriadosGlobales`) + `FeriadosListView` (solo lectura, sin columna Acciones —
WU8b agrega crear/editar/eliminar solo para filas CLIENTE, protegido por `esAdminCliente` dentro de la
vista). Sin compuerta del lado del cliente en la lectura, según la spec.

Evidencia: `pnpm type-check`/`pnpm lint` limpios; `pnpm vitest run src/features/feriados
src/shared/nav src/components src/app` → 42 archivos, 215 pruebas, todas exitosas. Total de `git show
--numstat HEAD` por debajo del presupuesto de 400. Rollback: todos archivos nuevos + 2 ediciones solo aditivas
(`nav-config.ts`, `tasks.md`); nada hace referencia a `/feriados` todavía fuera de las pruebas propias
de este segmento.

### Status

Tareas 8.1/8.2 parciales (lado de lectura hecho, pruebas del lado de escritura diferidas a WU8b), 8.3 hecha
(ruta desviada, declarada). Siguiente: WU8b (diálogos/mutaciones de escritura), WU8c (cierre de roadmap).

## WU8b: pantalla de feriados del cliente — lado de ESCRITURA (finalización de tareas 8.1/8.2) — COMPLETA

Rama `feat/feriados-configurables-wu8b`, apilada sobre `wu8a` (`d55eb68`). Solo frontend.

Se generalizó `FeriadoGlobalFormDialog` (WU7b) en vez de duplicarlo:
`useCrearMutation`/`useEditarMutation` ahora son funciones hook inyectadas, llamadas DENTRO
del diálogo (no preinstanciadas por quien llama — cada fila monta su propia instancia
de diálogo, así que los hooks deben vivir en esa instancia según las reglas de los hooks).
`FeriadosGlobalesAdminView` pasa sus propios hooks explícitamente en ambos puntos de llamada; sus
pruebas a nivel de DOM quedan sin cambios y siguen en verde. El nuevo
`use-feriados-cliente-admin-mutations.ts` refleja el archivo de mutaciones globales de WU7b
(`crearFeriadoCliente`/`editarFeriadoCliente`/`eliminarFeriadoCliente`, `api.ts` WU6b),
invalidando `["feriados-cliente"]` — la misma key que lee `useFeriadosCliente`, así que una escritura
también refresca la lista combinada. `FeriadosListView`: la compuerta `esAdminCliente` agrega una
columna Acciones sintética (`& { acciones?: never }`, el mismo truco que WU7b) solo cuando
es verdadera; dentro de ella, `render` devuelve `null` para las filas GLOBAL — nadie, ROOT incluido, obtiene
una acción sobre una fila GLOBAL desde esta pantalla. Los no admin no tienen columna Acciones ni el
botón "Nuevo feriado". El 422 `FeriadoFechaEsGlobalError` no necesita código de caso especial:
`notifyError`/`onError` ya muestra el mensaje de cualquier `ApiError` tal cual.

Archivos: `feriado-global-form-dialog.tsx` (generalizado), `feriados-globales-admin-view.tsx`
(pasa los hooks explícitamente), `use-feriados-cliente-admin-mutations.ts` (nuevo),
`feriados-list-view.tsx` (acciones de escritura), `feriados-list-view.test.tsx` (nuevas pruebas
del lado de escritura), `tasks.md` (8.1/8.2 → `[x]`).

Desviaciones: ninguna — coincide con D8 (combinación del lado del cliente, escrituras protegidas por
`esAdminCliente`) y con las formas de dedup/DTO de D9; la generalización del diálogo es una decisión de
implementación dentro del alcance, no una desviación. Problemas: ninguno.

Evidencia: `pnpm type-check`/`pnpm lint` (desde `frontend/`) ambos limpios. `pnpm vitest run
src/features/feriados src/shared/nav src/components src/app` → 42 archivos, 221 pruebas, todas
exitosas (+6 respecto de las 215 de WU8a). Rollback: 1 archivo nuevo + 4 ediciones de alcance acotado (las
pruebas de DOM propias de la pantalla global siguen en verde); `git revert` elimina solo la posibilidad
de escritura de este segmento, la pantalla de solo lectura de WU8a queda intacta.

### Workload / PR Boundary

- Modo: segmento de PR encadenado (Feature Branch Chain), apilado sobre `feat/feriados-configurables-wu8a`
- Unidad de trabajo actual: WU8b (finalización de tareas 8.1/8.2, incl. eliminar) — completa
- Impacto medido en el presupuesto de revisión: ver el `git show --numstat` del commit — apuntado a/por debajo
  del presupuesto de 400 líneas

### Status

Tareas 8.1/8.2 completamente terminadas (`tasks.md` actualizado). Siguiente: WU8c (cierre de roadmap, tarea 8.4,
más verificación final 8.5/8.6).
