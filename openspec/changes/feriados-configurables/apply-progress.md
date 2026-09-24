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
