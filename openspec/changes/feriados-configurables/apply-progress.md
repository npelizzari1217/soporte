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
