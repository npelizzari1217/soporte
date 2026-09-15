```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:dbbb1378157f88c5dda7048eb1515fa436263bf638d1183cbb600cd08dd8cf7e
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 8/8
scenarios: 8/8
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:78b24c279f16e680621b81080c7d526547646a0ff34a48e58e3f93c55bb67225
build_command: pnpm typecheck && pnpm lint
build_exit_code: 0
build_output_hash: sha256:959b79c47fcf4b084d9bd5be6d8659a2e812d405e333d9ace74e638220775388
```

## Verification Report

**Change**: repuestos-autoridad-catalogo
**Mode**: Standard. `strict_tdd: false` en `openspec/config.yaml` y el tipo de trabajo de este
ciclo es `feature`. La excepción de TDD obligatorio de `~/proyectos/CLAUDE.md` 6.3 aplica solo a
corrección de defecto, y el orquestador NO inyectó `STRICT TDD MODE IS ACTIVE`. No se exige tabla
de TDD Cycle Evidence, y su ausencia no es hallazgo.
**Ronda**: 3 — reemplaza íntegramente el informe de la ronda 2.
**Naturaleza**: verificación RETROSPECTIVA. El código ya está en `main` (PR #161, merge `0ab05d7`,
commits `24821c6` WU-1 y `84bd6d1` WU-2), más dos commits de remediación posteriores (`abea8f3`,
`aab164f`). Se verifica contra el árbol entregado en `HEAD = aab164f`.
**RDD**: OFF. `gentle-ai review status --next-transition` devuelve
`next_transition: {kind: stop, reason_code: rdd_disabled}`. No hay receipt, y no se fabrica ninguno.

### Lo primero, para que no se lea al revés

Las dos rondas anteriores cerraron en `fail` por razones distintas, y **las dos causas están
cerradas y reconfirmadas en esta ronda con evidencia propia**:

- **C-1 de la ronda 1 (entorno)**: `pnpm test` salía exit 1 por un `testTimeout` en
  `backend/src/config/regla-env-vacio.lint.spec.ts`. Cerrado en `abea8f3`. Reconfirmado acá:
  `pnpm test` sale **exit 0**, 431/431 archivos, 5137/5137 tests.
- **C-1 de la ronda 2 (cobertura, propio del ciclo)**: la disyunción `!familia` del guard de
  `agregar-componente.use-case.ts:147` no tenía una sola aserción; borrarla dejaba la suite entera
  del módulo en verde. Cerrado en `aab164f`. **Reconfirmado por mutación, no por lectura**: ver
  M-3 abajo — la misma mutación que sobrevivió en la ronda 2 ahora mata el test nuevo.

La remediación **tiene dientes**. No es cosmética.

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 15 |
| Tasks complete | 15 |
| Tasks incomplete | 0 |

`tasks.md` marca 15/15 `[x]` (1.1–1.7 y 2.1–2.8). `gentle-ai sdd-status repuestos-autoridad-catalogo
--json` reporta `taskProgress: {total: 15, completed: 15, pending: 0, allComplete: true}`,
`applyState: all_done` y `dependencies.verify: ready`. Cada tarea fue contrastada contra el código,
no solo contra su casilla — ver Correctness.

### Build & Tests Execution

Los dos comandos se corrieron **parados en `backend/`**, como exige el `CLAUDE.md` del repo (la raíz
del monorepo no tiene `package.json`).

**Tests**: PASÓ

| Campo | Valor observado |
|---|---|
| Comando | `pnpm test` |
| Exit code | **0** |
| Test Files | **431 passed (431)** |
| Tests | **5137 passed (5137)** |
| Duración | 459.76 s |
| `test_output_hash` | `sha256:78b24c279f16e680621b81080c7d526547646a0ff34a48e58e3f93c55bb67225` |

**Build**: PASÓ

| Campo | Valor observado |
|---|---|
| Comando | `pnpm typecheck && pnpm lint` |
| Exit code | **0** |
| Salida | `$ tsc --noEmit -p tsconfig.typecheck.json` · `$ eslint .` — sin diagnósticos |
| `build_output_hash` | `sha256:959b79c47fcf4b084d9bd5be6d8659a2e812d405e333d9ace74e638220775388` |

**Ruido esperado, NO hallazgo**: la salida de `pnpm test` imprime tres bloques
`Failed Suites 1 — FAIL orden-de-arranque.spec.ts` con `ErrorEntornoInvalido` y aun así el proceso
sale exit 0 y el resumen es 431/431. Es un proyecto Vitest hijo lanzado a propósito por
`test/entorno-corte-arranque.spec.ts` para probar el corte de arranque ante entorno inválido: su
fallo ES la aserción. Vitest cuenta 431 archivos y 5137 tests como pasados.

**Entorno**: `soporte-postgres-master` `Up 4 hours`; `pnpm prisma migrate status` lista las
migraciones sin `P1001`. Los specs de integración y e2e corrieron contra Postgres real.

### Adversarial — mutación de guards centrales

Exigido por `openspec/config.yaml` → `rules.verify.guidelines`: *"mutar al menos un guard central y
confirmar rojo, revertir y reconfirmar verde"*. Se mutaron **tres**, uno por cada guard que este
ciclo toca o motiva. Cada mutación se revirtió y se reconfirmó verde.

| ID | Guard mutado | Mutación | Resultado observado |
|---|---|---|---|
| **M-3** | `agregar-componente.use-case.ts:147` — `if (!familia \|\| familia.isDeleted())` | se borra la disyunción `!familia` → `if (familia!.isDeleted())` | **ROJO. 1 failed \| 14 passed (15)**. El único test que cae es el nuevo: `vincular un repuesto cuya familia NO EXISTE falla como inexistente`, con `TypeError: Cannot read properties of null (reading 'isDeleted')` en `:147:20` |
| **M-4** | `agregar-componente.use-case.ts:178` — `if (!vinculado)` (el gate MASTER de ADR-1) | `if (true)`, es decir, MASTER vuelve a correr en la rama vinculada | **ROJO. 2 failed \| 13 passed (15)**: `...SIN código en MASTER se acepta: la familia del tenant es la autoridad (ADR-1)` y `vincular un repuesto deriva tipoComponenteCodigo de la familia del insumo` |
| **M-5** | `obtener-equipo.use-case.ts:116` — `if (componente.insumoId != null)` (la partición de ADR-2) | `if (false)`, es decir, todo el display vuelve a resolverse por MASTER | **ROJO. 4 failed \| 6 passed (10)**: los dos casos de ADR-2, el anti-N+1 de los dos caminos y los dos flags de familia deshabilitada/soft-deleted |

**Reversión y reconfirmación**: `git status --porcelain` queda sin ninguna entrada de `backend/`
(único untracked: este informe). Con el árbol restaurado,
`pnpm vitest run obtener-equipo.use-case.spec.ts agregar-componente.use-case.spec.ts
equipos.controller.spec.ts` → **3 passed (3) · 78 passed (78)**.

**Lectura de M-3, que es lo que motivó esta ronda**: en la ronda 2 esta mutación exacta **sobrevivió
— 28 archivos / 319 tests en verde**. Hoy mata un test, y mata exactamente **uno**: el que `aab164f`
agregó para ella. Un mutante que antes sobrevivía y ahora muere por el test nuevo es la definición
de una remediación con dientes; si el test fuera decorativo, M-3 habría seguido verde.

### Spec Compliance Matrix

Los ocho requisitos de
`openspec/changes/repuestos-autoridad-catalogo/specs/repuestos-autoridad-catalogo/spec.md`
(8 `### Requirement:`, 8 `#### Scenario:`), contra evidencia de ejecución, no de lectura.

| # | Requisito | Implementación (`archivo:línea`) | Test que lo cubre (pasó en runtime) | Estado |
|---|---|---|---|---|
| **R1** | La familia del tenant es la autoridad del tipo en el alta vinculada | `agregar-componente.use-case.ts:161` (`tipoComponenteCodigo = familia.codigo`), `:163` (`vinculado = true`), `:178-183` (el gate MASTER corre solo si `!vinculado`) | `agregar-componente.use-case.spec.ts:502` — familia `TORNILLO` sin fila en MASTER ⇒ `isOk()`, `save` con `tipoComponenteCodigo:'TORNILLO'` y `expect(estaActivo).not.toHaveBeenCalled()`. E2E real: `equipos-instalar-desde-deposito.e2e.spec.ts:392` ⇒ 201 y `GET /equipos/:id` con `tipoActivo:true` (`:426`) | **COVERED** (mutante M-4 muerto) |
| **R2** | Los guards de insumo y familia siguen vigentes | `:136` (insumo inexistente/inactivo/soft-deleted), `:147` (familia inexistente o soft-deleted), `:150` (`esRepuesto`), `:153` (`activo`) | Siete casos, uno por rama: `spec.ts:247` · `:274` · `:305` · `:336` · **`:381` (el nuevo, cubre `!familia`)** · `:224` · `:440`. Todos afirman el error de dominio y `save` no llamado | **COVERED** (mutante M-3 muerto) |
| **R3** | El display vinculado resuelve por el catálogo del tenant | `obtener-equipo.use-case.ts:109` (lectura por lote), `:116` (partición), `:120-121` (`tipoNombre`/`tipoActivo`); puerto `i-insumo.repository.ts:35,162`; impl `prisma-insumo.repository.ts:191`; wiring `equipos.module.ts:206-212` | `obtener-equipo.use-case.spec.ts:172` (solo-tenant activo, `resolver` no llamado) y `:264` (flags deshabilitada/soft-deleted). Contra Postgres real: `prisma-insumo.repository.integration.spec.ts:978` — varios ids en una llamada, id inexistente omitido, lista vacía sin consulta, flags crudos | **COVERED** (mutante M-5 muerto) |
| **R4** | El display de texto libre sigue resolviendo por MASTER | `obtener-equipo.use-case.ts:110-111` (`resolver`), `:127-128` | `obtener-equipo.use-case.spec.ts:65` (enriquecido desde MASTER), `:94` (sin match ⇒ `null`/`false`), `:213` (los dos caminos en la misma lista) | **COVERED** |
| **R5** | Sin fallback cruzado bajo colisión de código | `obtener-equipo.use-case.ts:116` — regla única por camino, sin rama de fallback | `obtener-equipo.use-case.spec.ts:213` afirma los **argumentos exactos**: `resolver` recibe `['RAM']` y NUNCA el código del vinculado; `findFamiliasDeInsumos` recibe `['insumo-1']`, una vez cada una. `:172` afirma `resolver` no llamado. Esa es la aserción que hace la colisión imposible: el código del vinculado no llega a MASTER | **COVERED** (mutante M-5 muerto) |
| **R6** | La baja global en MASTER no bloquea el alta vinculada | `agregar-componente.use-case.ts:178` — el gate no corre en la rama vinculada | `agregar-componente.use-case.spec.ts:502` monta `estaActivo` con `mockResolvedValue(false)` — el valor que MASTER devuelve tanto para un código ausente como para uno **desactivado** — y el alta igual sale `isOk()`. La aserción `not.toHaveBeenCalled()` prueba además que el estado de MASTER es inalcanzable desde este camino | **COVERED** |
| **R7** | El texto libre sigue exigiendo un código activo en MASTER | `agregar-componente.use-case.ts:179-182` (`TipoComponenteInactivoError`) | `agregar-componente.use-case.spec.ts:129` — `estaActivo` en `false` ⇒ `TipoComponenteInactivoError`, `expect(estaActivo).toHaveBeenCalledWith('RAM')` y `save` no llamado. Espejo exacto del de R1 | **COVERED** (mutante M-4 muerto) |
| **R8** | `RepuestoSinTipoEnCatalogoError` deja de existir | La clase no está en `equipos/domain/errors/equipos.errors.ts`; no hay import ni rama 422 en `equipos.controller.ts` (`rg` sobre `backend/` y `frontend/` no encuentra ni la clase ni el código `REPUESTO_SIN_TIPO_EN_CATALOGO` fuera de dos menciones históricas que explican su retiro) | `equipos.controller.spec.ts:613-615` — centinela `expect(CLASES_DE_ERROR).toHaveLength(16)`, con el título reescrito; la fila salió de la `TABLA` | **COVERED** |

**Totales**: requisitos 8/8, escenarios 8/8. Ningún escenario queda PARCIAL ni UNTESTED.

Las dos menciones históricas residuales de R8 no son incumplimiento: son
`agregar-componente.use-case.ts:74`, que documenta que la clase fue ELIMINADA, y el título del
centinela en `equipos.controller.spec.ts:613`, que nombra el retiro. Ninguna afirma que la
restricción siga vigente — es exactamente lo contrario de lo que el criterio de éxito prohíbe.

### Correctness — tareas contra código

| Tarea | Verificación | Estado |
|---|---|---|
| 1.1 | `i-insumo.repository.ts:35` define `FamiliaDeInsumo`; `:162` declara `findFamiliasDeInsumos`; `:53-54` documenta la excepción a "siempre agregado completo" (ADR-3) | OK |
| 1.2 | `prisma-insumo.repository.ts:191` implementa con `findMany` + `select` de la relación `familia`; lista vacía no consulta | OK |
| 1.3 | `prisma-insumo.repository.integration.spec.ts:978-1058` cubre los cuatro casos pedidos contra la base real | OK |
| 1.4 | `obtener-equipo.use-case.ts:82` cuarto parámetro `Pick<IInsumoRepository,'findFamiliasDeInsumos'>`; `:95` partición; `:120-121` degradado best-effort | OK |
| 1.5 | `obtener-equipo.use-case.spec.ts` — 10 tests, incluidos los casos ADR-2, el anti-N+1 con argumentos exactos, los dos flags de familia y las dos ramas "no consulta" | OK |
| 1.6 | `equipos.module.ts:206-212` suma `INSUMO_REPOSITORY` al `inject`; comentario de wiring reescrito en `:188-192` | OK |
| 1.7 | Cierre WU-1, commit `24821c6` | OK |
| 2.1 | `agregar-componente.use-case.ts:178` mueve `estaActivo` a la rama de texto libre; el import y el throw del error eliminado ya no existen | OK |
| 2.2 | El bloque "LIMITACIÓN DELIBERADA" fue reescrito (`:66-80`) y el paso 3 del "Flujo" (`:88-93`) dice explícitamente que el camino vinculado NO pasa por ahí | OK |
| 2.3 | Test fijado invertido en `:502`; el test previo `:188` corregido para no afirmar una llamada a `estaActivo` que ya no ocurre; gemelos de rechazo intactos | OK |
| 2.4 | `RepuestoSinTipoEnCatalogoError` no está en `equipos.errors.ts` | OK |
| 2.5 | Sin import ni rama 422 en `equipos.controller.ts` | OK |
| 2.6 | Centinela 17 → 16 con título reescrito; fila fuera de la `TABLA` | OK |
| 2.7 | `crearFamiliaRepuesto` (`:257`) ya no siembra la fila gemela en MASTER; el caso `:392` instala y el `GET` posterior afirma `tipoActivo:true` en `:426` | OK |
| 2.8 | Cierre WU-2, commit `84bd6d1` | OK |

### Design coherence

| Decisión | Contraste contra el código | Estado |
|---|---|---|
| ADR-1 — el gate se retira, no se sustituye | `:178` es el único condicional agregado, y su cuerpo es el gate MASTER original. No hay chequeo sustituto en la rama vinculada. Los cuatro guards del ADR siguen en `:136`, `:147`, `:150`, `:153` | Coherente |
| ADR-2 — regla única por camino, sin fallback cruzado | `:116` decide por `insumoId`; `:121` calcula `familia.activo && familia.deletedAt === null`, literal al diseño; el degradado a `null`/`false` es best-effort y no lanza | Coherente |
| ADR-3 — método de puerto, no caso de uso, y por lote | Método en `IInsumoRepository`, inyectado con el idiom `Pick<>` desde `INSUMO_REPOSITORY`. Dirección `equipos → insumos`, sin arista nueva. Peor caso 2 lecturas fijas, cada una salteada con lista vacía (`:109-111`) | Coherente |
| ADR-4 — comentarios y error dentro del work unit | Clase, import, rama 422, fila de la `TABLA` y centinela eliminados en el mismo commit; los cuatro JSDoc reescritos | Coherente |
| Frontend: cero archivos | El diff de los dos commits toca 13 archivos, 12 bajo `backend/` y `openspec/`; ninguno bajo `frontend/` | Coherente |

Capas hexagonales respetadas: el tipo nuevo vive en `insumos/domain/ports/`, su implementación en
`insumos/infrastructure/persistence/prisma/`, el consumo en `equipos/application/use-cases/` y el
cableado en el `@Module`. `@prisma/client` no sale de `infrastructure/`.

### Issues

**CRITICAL: ninguno.**

**WARNING**

- **W-1 — `apply-progress` no existe para este ciclo.** `gentle-ai sdd-status` devuelve
  `artifactPaths.applyProgress: []` y `artifacts.applyProgress: "missing"`. No hay archivo ni
  observación. **Reevaluado, no copiado**: sigue abierto y sigue sin acción. No se reconstruye —
  un artefacto de progreso inventado a posteriori mentiría sobre cuándo se hizo el trabajo.
  `applyState: all_done` se deriva de `tasks.md`, que sí está completo, así que el estado del ciclo
  no depende de él. **No bloquea el archivado.**
- **W-4 — el PR excedió su propio forecast por más del doble.** `tasks.md` declaró
  `Estimated changed lines: ~280–350`, `400-line budget risk: Medium` y
  `Chained PRs recommended: No`. Medición real de `git diff --stat 24821c6~1 84bd6d1`: **837 líneas
  cambiadas en 13 archivos**, de las cuales 35 son de `tasks.md` ⇒ **802 líneas en `backend/`**,
  contra un presupuesto de revisión de 400. El desvío se concentra en los specs
  (`obtener-equipo.use-case.spec.ts` +241, `prisma-insumo.repository.integration.spec.ts` +122,
  `equipos-instalar-desde-deposito.e2e.spec.ts` 86). **Retrospectivo y sin acción posible** sobre un
  merge ya hecho; queda anotado como calibración para el próximo `sdd-tasks`: el forecast contó el
  código y subestimó los tests que ese mismo código exige. **No bloquea el archivado.**

**W-3 — CERRADO.** En la ronda 2, `state.yaml` decía `phase: tasks` con `tasks_progress` vacío
mientras `tasks.md` tenía 15/15 `[x]`. Hoy declara `phase: verify`, `artifact_store: openspec`, los
cuatro artefactos en `true`, las 15 tareas enumeradas en `completed` y `pending: []`. Coherente con
`tasks.md` y con lo que reporta `gentle-ai sdd-status`. Sin acción pendiente.

**SUGGESTION**

- **S-1 — R5 se prueba por argumento exacto, no por colisión literal.** Ningún test monta
  simultáneamente una familia de tenant y una fila de MASTER con el mismo `codigo: 'X'`. La
  invariante está probada de forma más fuerte que eso (`resolver` nunca recibe el código del
  vinculado, `obtener-equipo.use-case.spec.ts:213`), y M-5 confirma que esa aserción tiene dientes.
  Un test con la colisión literal no agregaría poder de detección, pero haría el escenario de la
  spec legible de un vistazo. Opcional.
- **S-2 — el e2e prueba ausencia en MASTER, no desactivación.** `crearFamiliaRepuesto` dejó de
  sembrar la fila gemela, así que el camino e2e cubre "código que nunca existió en MASTER". El caso
  "código desactivado en MASTER" (R6) queda cubierto en unit (`:502`, `estaActivo → false`). Sembrar
  una fila MASTER con `activo: false` en el e2e cerraría el escenario de punta a punta. Opcional.

### Estado final de los hallazgos arrastrados

| Hallazgo | Origen | Estado en la ronda 3 |
|---|---|---|
| C-1 entorno (`regla-env-vacio.lint.spec.ts` timeout) | Ronda 1 | **CERRADO** por `abea8f3`; reconfirmado: `pnpm test` exit 0 |
| C-1 cobertura (`!familia` sin aserción) | Ronda 2 | **CERRADO** por `aab164f`; reconfirmado por mutación M-3, que ahora mata el test nuevo |
| W-1 `apply-progress` ausente | Ronda 2 | **ABIERTO**, sin acción. No se reconstruye. No bloquea |
| W-3 `state.yaml` incoherente | Ronda 2 | **CERRADO** por `aab164f` |
| W-4 presupuesto de revisión excedido | Ronda 2 | **ABIERTO**, retrospectivo. 802 líneas en `backend/` vs ~280–350. No bloquea |

### Verdict

**PASS WITH WARNINGS**

Los ocho requisitos tienen cobertura de ejecución, no de lectura: 8/8 requisitos y 8/8 escenarios
con un test que pasó en runtime, y los tres guards centrales del ciclo mueren bajo mutación. Los
comandos del `config.yaml` salen los dos en exit 0 sobre la suite completa. Las dos causas que
hicieron fallar las rondas anteriores están cerradas y reconfirmadas con evidencia propia de esta
ronda, no heredada.

Quedan dos WARNING, los dos sin acción posible dentro del ciclo: un artefacto de progreso que no
existe y que no se debe inventar, y un desvío de presupuesto de revisión sobre un PR ya fusionado.
Ninguno bloquea el archivado.

**Siguiente fase recomendada**: `sdd-archive`.
