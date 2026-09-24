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
