```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:bc64e2f1b6b41b42b6c924a73089a633653dd436a5f0ed5a397e2f25594d38c9
verdict: fail
blockers: 3
critical_findings: 3
requirements: 23/25
scenarios: 128/131
test_command: cd backend && pnpm lint && pnpm typecheck && pnpm test; cd frontend && pnpm lint && pnpm type-check && pnpm test
test_exit_code: 0
test_output_hash: sha256:618cd0d776af7ecae5fe47b733c962854098551ace254c5b33651f5dab522b1b
build_command: cd backend && pnpm lint && pnpm typecheck; cd frontend && pnpm lint && pnpm type-check
build_exit_code: 0
build_output_hash: sha256:c776cc7fac2b7fd7af858bd4dca4dae91cf21e283c5dee22c437c49ba125a4ef
```

## Verification Report

**Change**: repuestos-numero-de-serie
**Version**: specs `unidades-insumo-serie` (new), deltas `stock-insumo-condicion` and `componentes-catalogo-unico`
**Mode**: Standard for the feature work units; Strict TDD for the fix01 bugfix (TDD evidence required by
`~/proyectos/CLAUDE.md` §6.3 and `openspec/config.yaml` for defect corrections)
**Candidate**: branch `feat/repuestos-numero-de-serie-fix01`, HEAD `efa4b8cc`, base `main`, 78 commits.
`evidence_revision` = sha256 of `git diff main...efa4b8cc`.

### Historial

- **First pass: FAILED** — 1 CRITICAL at evidence
  `sha256:412f88ecb381cfbe806220b25e72a248a6677508bc4a8ce97f74fb9909583049` (HEAD `c7173058`, report commit
  `183f5934`). `corregirSerial` rejected an `INSTALADA` unit, against the scenario "Corregir una unidad
  instalada", and with the component path closed by design no path could correct an installed unit's serial.
- **Remediation**: commit `efa4b8cc` (`fix(insumos): corregir el serial de una unidad instalada`, 153 changed
  lines). This report is the re-verification of that remediation, with a full re-check of the cycle.

### Verdict

**FAILED** — 3 blockers, none of them caused by fix01. The first-pass CRITICAL is **closed** and proven at
runtime, including by mutation, and every gate is green.

What still fails is three scenarios that the first pass marked ⚠️ PARTIAL. Its verdict was FAIL for another
reason, so their classification never decided anything. Now it does, and it does not hold.

- The skill rule is that "a spec scenario is compliant only when a covering test passed at runtime".
  `gentle-ai sdd-verify-validate` enforces the same rule: it **refuses a passing verdict while any scenario is
  incomplete** ("passing verdict contradicts failing or incomplete evidence"). This re-verification tried
  `pass_with_warnings` with 128/131 first, and the validator denied it.
- Counting the three as complete would be false. No test retires a component created without a discount
  (re-searched for this pass), and the alta UI has no condition step.

So they are reclassified as CRITICAL. Each one has a small, bounded way out (see Issues).

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 137 |
| Tasks complete | 137 |
| Tasks incomplete | 0 |

`gentle-ai sdd-status`: `apply: all_done`, `verify: ready`, tasks 137/137. Task 4b.2 is amended: "vale en
cualquier estado, también `INSTALADA`". Its unchecked-to-checked state does not change.

### Build and tests execution (WSL)

| Command | Observed result |
|---|---|
| `cd backend && pnpm lint && pnpm typecheck` | exit 0. `eslint .` and `tsc --noEmit -p tsconfig.typecheck.json` print nothing. The build output hash matches the first pass byte for byte. |
| `cd backend && pnpm test` | exit 0. Vitest **518 files / 6530 tests passed** (770.68 s). That is 2 more than the first pass, from the new e2e case and the split service case. The noise is the known kind: `orden-de-arranque.spec.ts` child-process "FAIL" lines and "Falta configurar", `CorreoDeClienteAdapter` errors, and a mapped P2002 log from the rollback e2e. |
| `cd frontend && pnpm lint && pnpm type-check` | exit 0. "No ESLint warnings or errors"; `tsc --noEmit` clean |
| `cd frontend && pnpm test` | exit 0. Vitest **220 files / 1706 tests passed** (213.70 s), 1 more than the first pass |
| `git diff --stat main...HEAD \| tail -1` | `218 files changed, 28461 insertions(+), 463 deletions(-)` |

Execution note: the backend command ran in one shell call. That call outlived the tool's 600 s foreground
ceiling, so the harness detached it. No other process was started, and the result above is that run's
completed output.

**Coverage**: not available (the project declares no coverage threshold).

### fix01 — closure of the CRITICAL

| Check | Result | Evidence |
|---|---|---|
| Guard removed | ✅ | `OperacionesUnidadInsumo.corregirSerial` no longer branches on `INSTALADA`. Only the entity rule remains: a pendiente is rejected because its serial is loaded, not corrected. Motivo checks (required, ≤ 500) and P2002 → `SerialDuplicadoError` are unchanged. |
| Scenario "Corregir una unidad instalada" | ✅ | The e2e returns 201 with `numeroSerie: 'SN-1B', estado: 'INSTALADA', equipoId`. The DB row keeps `estado` and `equipo_id`, and the history holds `CORRECCION_SERIAL` with the old serial, the new serial and the motivo. The integration test checks the same against a real Postgres. |
| No stock movement | ✅ | The service spec asserts that the only write is `W:cas:INSTALADA` plus the event. The method has no movimiento path. |
| Lock order (no L4 write) | ✅ | The path is `leerUnidadBajoLock`: unlocked snapshot, then L1+L2 of the insumo (`bloquearInsumo`), then L3 of the unit (`bloquearPorIds`). `corregirSerial` has no componente dependency. The persisted component keeps `numero_serie = NULL` when it has a unit (`componente-equipo.mapper.ts` `toPersistence`), so nothing at L4 needs rewriting. The use case wraps the call in one tenant transaction. |
| Component response resolves the new serial | ✅ static / ⚠️ not tested end-to-end | `prisma-componente-equipo.repository.ts` reads with `INCLUIR_UNIDAD = { unidad: { select: { numeroSerie } } }`, and `componente-equipo.mapper.ts:36` takes `row.unidad?.numeroSerie` when `unidadId` is set. So the corrected serial is the one returned live. No test corrects a unit and then reads the component (see WARNING 5). The spec scenario does not require that read. |
| UI | ✅ | `unidades-insumo-section.tsx`: `corregible = fila.numeroSerie !== null`. It is still gated by `INSUMOS:AJUSTAR`. |
| Tasks / Ayuda | ✅ | 4b.2 amended. Ayuda: `permisos-y-roles.md` is still true and no article became false. |

**Adversarial mutation (verify-run, transient, reverted; working tree clean afterwards):**
- Backend: restoring `operaciones-unidad-insumo.service.ts` from `efa4b8cc^` turns the 3 new cases red: service
  spec, integration and e2e (`3 failed | 4 passed`). Reverting brings back `7 passed`.
- Frontend: restoring `unidades-insumo-section.tsx` from `efa4b8cc^` turns red "una unidad instalada también
  se corrige, con su motivo" (`1 failed | 7 passed`). Reverting brings back `8 passed`.

### TDD Compliance (fix01, Strict TDD)

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | `apply-progress.md` › "fix01" has a RED / GREEN / REFACTOR table with 4 rows |
| All tasks have tests | ✅ | 4/4 rows name a test that exists in the codebase |
| RED confirmed | ✅ | 4/4. Independently reproduced by the mutation above: each test fails against the pre-fix code, and for the right reason (the old guard, or the missing button) |
| GREEN confirmed (tests pass) | ✅ | 4/4 pass in the targeted run and in the full suites |
| Triangulation adequate | ✅ | The INSTALADA case is covered at four layers (entity `it.each` over 4 states, service, integration, e2e) plus the UI. The rejection paths (pendiente, empty serial, no motivo, duplicate) keep their own cases. |
| Safety net for modified files | ✅ | The pre-existing cases in the four modified spec files still pass |

**Test layer distribution (fix01)**: unit 1 (service spec, fakes) · integration 1 (Prisma, real Postgres) ·
e2e 1 (HTTP) · frontend integration 1 (RTL + MSW).

**Assertion quality**: ✅ All assertions verify real behavior: response body, DB row, audit event, and the request
body sent. One count assertion (`llamadas` toHaveLength(1)) is paired with a body assertion. The
`W:cas` filter asserts the write set, which is the contract.

**Changed file coverage**: skipped (no coverage threshold; not required).

### Spec compliance matrix

Scenario counts come from the `#### Scenario:` headings. `unidades-insumo-serie` has 15 requirements
and 57 scenarios, `stock-insumo-condicion` has 5 and 28, and `componentes-catalogo-unico` has 5 and 46.
The total is 25 requirements and 131 scenarios. Rows group the scenarios of one requirement. Every
scenario in a row is COMPLIANT unless the row names it.

#### unidades-insumo-serie

| Requirement | Scenarios | Covering tests (all passed) | Result |
|---|---|---|---|
| Modo de seguimiento NINGUNO o SERIE | Insumo existente tras la migración; Valor inválido; NINGUNO sin cambios | `unidades-insumo-constraints.integration.spec.ts` (legacy rows + CHECK), `insumos.dto.spec.ts`, `insumos-seguimiento.e2e.spec.ts` (400), `movimientos-insumo.e2e.spec.ts` + `registrar-*-insumo.use-case.spec.ts` (NINGUNO branch, no units) | ✅ COMPLIANT (3/3) |
| SERIE solo con saldo cero y UM entera | Activar con saldo cero; con saldo; UM no entera; Marcar entera; Desmarcar entera en uso; Concurrente con movimiento; Activación mientras cambia UM; Volver a NINGUNO con vivas; con entregadas/descartadas | `insumos-seguimiento.e2e.spec.ts` (activate 200/422, E3 422/200, entera mark/unmark), `cambiar-seguimiento-insumo.use-case.spec.ts`, `orden-de-locks.concurrencia.integration.spec.ts` cases 1–5 and 7, `editar-unidad-medida.use-case.spec.ts` | ✅ COMPLIANT (9/9) |
| Unidad tiene serial, condición y estado | Instalada refiere equipo; Estado inválido; Entregada sin equipo ni saldo | `unidades-insumo.e2e.spec.ts` (listar con `equipoId`), `unidades-insumo-constraints.integration.spec.ts` (CHECK estado/equipo), `invariante-serie.integration.spec.ts`, `registrar-salida-insumo.use-case.spec.ts` | ✅ COMPLIANT (3/3) |
| Serial obligatorio, normalizado y único por insumo | Duplicado otra capitalización; Duplicado de descartada; Mismo serial en otro insumo; Serial vacío; Concurrencia mismo serial | `prisma-unidad-insumo.repository.integration.spec.ts` (six concurrent inserts → one), `unidades-insumo-constraints.integration.spec.ts` ("el mismo serial en OTRO insumo: permitido", DESCARTADA in unique index), `unidad-insumo.entity.spec.ts`, `es-serial-de-unidad.spec.ts` | ✅ COMPLIANT (5/5) |
| Sin serial entran como serie pendiente | Recepción sin seriales; Instalar pendiente; Selector sin pendientes; Baja pendiente por ajuste negativo; Baja sin motivo | `compras.e2e.spec.ts` (sin seriales / parciales), `equipos-instalar-desde-deposito.e2e.spec.ts` (pendiente 422), `movimientos-insumo-serie.e2e.spec.ts`, `listar-unidades-insumo.use-case.spec.ts` (`disponibles`), `movimiento-unidad.test.tsx`, `operaciones-unidad-insumo.service.spec.ts` | ✅ COMPLIANT (5/5) |
| Serial pendiente se completa desde la ficha | Completar; Completar repetido | `unidades-insumo.e2e.spec.ts` (carga válida / 409), `operaciones-unidad-insumo.integration.spec.ts` ("cargarSerial completa…"), `unidad-serial-dialog.test.tsx` | ✅ COMPLIANT (2/2) |
| Condición de la unidad; saldo SERIE cuenta unidades | Saldo por condición; Reposición sobre NUEVO | `consultar-stock-insumo.use-case.spec.ts`, `invariante-serie.integration.spec.ts`, `tipo-movimiento-insumo.spec.ts` (`saldosDesdeUnidades`) | ✅ COMPLIANT (2/2) |
| Entregada puede volver al depósito | Sin uso; Usada; No entregada; Insumo en NINGUNO; Insumo deshabilitado | `unidades-insumo.e2e.spec.ts` › devolucion-entrega (NUEVO, USADO, G2, 422 guards, 404 de baja), `devolver-entrega.use-case.spec.ts`, `operaciones-unidad-insumo.integration.spec.ts` | ✅ COMPLIANT (5/5) |
| Descartada puede recuperarse | Pieza dada de baja por error; Usada desde equipo; Pendiente descartada; Sin motivo; No descartada; Insumo deshabilitado | `unidades-insumo.e2e.spec.ts` › recuperacion (NUEVO, USADO, pendiente, G2, 422s), `recuperar-unidad-descartada.use-case.spec.ts`, `invariante-serie.integration.spec.ts` | ✅ COMPLIANT (6/6) |
| Corrección de serial con motivo, auditada | Corrección válida; Sin motivo; A un serial existente; Corregir una unidad instalada | `unidades-insumo.e2e.spec.ts` › "422 sin motivo; 409 a un serial existente" and **"corrige una unidad INSTALADA: 201, sigue instalada en su equipo y deja el evento"**; `operaciones-unidad-insumo.integration.spec.ts` › **"corregirSerial sobre una unidad INSTALADA cambia el serial, conserva estado y equipo y audita"**; `operaciones-unidad-insumo.service.spec.ts` › **"corrige una unidad INSTALADA…"**; `unidad-insumo.entity.spec.ts` (all four states); `unidad-serial-dialog.test.tsx` › **"una unidad instalada también se corrige, con su motivo"** | ✅ COMPLIANT (4/4) — fixed in `efa4b8cc` |
| Historial consultable por serial | Vida completa; Descartada; Entregada; Sin historia anterior | `unidades-insumo.e2e.spec.ts` (historial), `consultar-historial-unidad.use-case.spec.ts`, `insumos-seguimiento.e2e.spec.ts` (full HTTP flow), `unidad-historial-dialog.test.tsx` | ✅ COMPLIANT (4/4) |
| Saldo de unidades coincide con el libro | Invariante tras secuencia; Concurrencia misma unidad; Falla parcial | `invariante-serie.integration.spec.ts` (invariant checked after each step), `operaciones-unidad-insumo.integration.spec.ts` (six concurrent `sacarDelDeposito` → one; P2002 reverts the batch) | ✅ COMPLIANT (3/3) |
| Operaciones reutilizables en lote | Varias en una tx; Falla en una del lote | `operaciones-unidad-insumo.integration.spec.ts` ("devolverAlDeposito de un lote…", "si una unidad del lote de devolución ya no está instalada, el lote entero no escribe") | ✅ COMPLIANT (2/2) |
| Permisos de equipos mueven unidades sin INSUMOS | Instalar sin permisos de insumos; Devolver al retirar sin permisos de insumos | `equipos-instalar-desde-deposito.e2e.spec.ts` (`EQUIPOS:ALTAS` only), `equipos-retirar-componente-unidad.e2e.spec.ts` ("STOCK_USADO con EQUIPOS:BORRADO y sin permisos de insumos", reactivar with `EQUIPOS:MODIFICACION` only) | ✅ COMPLIANT (2/2) |
| Legados conservan serial de texto | Migración con componentes previos; Editar serial legado | `unidades-insumo-constraints.integration.spec.ts`, `equipos-instalar-desde-deposito.e2e.spec.ts` (editar serial de un legado 200) | ✅ COMPLIANT (2/2) |

#### stock-insumo-condicion

| Requirement | Scenarios | Covering tests (all passed) | Result |
|---|---|---|---|
| Movimiento SERIE referencia una unidad con cantidad 1 | Entrada de varias piezas; Movimiento sin unidad; NINGUNO con unidad | `movimientos-insumo-serie.e2e.spec.ts`, `movimiento-insumo.entity.spec.ts` (`unidadId ⇒ cantidad 1`), CHECK in `unidades-insumo-constraints.integration.spec.ts`, `registrar-salida-insumo.use-case.spec.ts` (`UnidadRequeridaError`, `UnidadNoAdmitidaError`) | ✅ COMPLIANT (3/3) |
| Saldo por insumo y condición, fórmula única | Independientes; Sin USADO; Saldo SERIE | `tipo-movimiento-insumo.spec.ts`, `consultar-stock-insumo.use-case.spec.ts`, `invariante-serie.integration.spec.ts` | ✅ COMPLIANT (3/3) |
| Salida/ajuste negativo no deja negativo | Mayor que saldo (2); Dentro del saldo; Concurrentes; Salida por serial; Sin unidad o no disponible; Ajuste negativo con unidad; Pendiente; Sin motivo | `movimientos-insumo.e2e.spec.ts` (NINGUNO, prior cycle), `prisma-movimiento-insumo.repository.concurrencia.integration.spec.ts`, `movimientos-insumo-serie.e2e.spec.ts`, `registrar-salida-insumo.use-case.spec.ts`, `registrar-ajuste-insumo.use-case.spec.ts`, `movimiento-unidad.test.tsx` | ✅ COMPLIANT (9/9) |
| ENTRADA y AJUSTE pueden apuntar a USADO | Deshabilitado rechazado; Entrada usados; Ajuste positivo usados; Entrada SERIE con seriales; Sin serial o repetido; Ajuste positivo SERIE; Sin motivo | `registrar-entrada-insumo.use-case.spec.ts` (including SERIE on a disabled insumo still rejected), `registrar-ajuste-insumo.use-case.spec.ts`, `movimientos-insumo-serie.e2e.spec.ts`, `devolver-entrega.use-case.spec.ts` (exemption does not leak), `movimiento-seriales.test.tsx` | ✅ COMPLIANT (7/7) |
| Recepción registra NUEVO | Recepción de compra; No acepta condición; SERIE todos; Parciales; Repetido; Fraccional | `compras.e2e.spec.ts` (all seriales, partial, sin seriales, repetido 409 with rollback, fraccional 422), `registrar-recepcion-de-item.use-case.spec.ts`, `registrar-recepcion-seriales.test.tsx` | ✅ COMPLIANT (6/6) |

#### componentes-catalogo-unico

| Requirement | Scenarios | Covering tests (all passed) | Result |
|---|---|---|---|
| Alta sin descuento crea unidad instalada (D3) | Con serial; Sin serial; Serial repetido; **Retiro al stock de unidad de origen sin salida**; **Retiro al stock sin motivo** | `equipos-instalar-desde-deposito.e2e.spec.ts` › D3 (serial, USADO, 422, 409 + rollback), `agregar-componente-sin-descuento.use-case.spec.ts`; `retirar-componente.use-case.spec.ts` ("STOCK_USADO sin SALIDA vinculada y con/sin motivo") | ✅ 3/5; ❌ **UNTESTED** (2): no test retires a component whose unit was created by D3. The scenario is covered only by combining the generic motivo/`bajaSinSalidaPrevia` rule with the unit-return tests. |
| Un solo flujo de alta con descuento opcional | 11 scenarios (defecto, USADO, insuficiente, falla SALIDA, sin descuento, selector de saldo, un solo saldo, instalar SERIE por serial, sin unidad o pendiente, unidad tomada, **selector de unidad en el alta**) | `equipos-instalar-desde-deposito.e2e.spec.ts` (including two concurrent installs, one wins, and rollback), `instalar-componente-desde-deposito.*.spec.ts`, `componente-create-dialog.test.tsx` | ✅ 10/11; ❌ **DEVIATION / UNTESTED** (1): "Selector de unidad en el alta". The UI lists every available unit with its condition in the label (`SelectorUnidad`, `disponibles=true`) and has no condition selector, so the "elige la condición → solo esa condición" step does not exist. Tasks 19.1 chose "sin selector de saldo". |
| Edición no cambia tipo ni insumo | Datos propios; Cambiar insumo; Reemplazo; Serial de componente con unidad; Serial legado | `editar-componente.use-case.spec.ts`, `equipos-instalar-desde-deposito.e2e.spec.ts` (422 for a unit, 200 for a legacy component), `componente-edit-dialog.test.tsx` | ✅ COMPLIANT (5/5) |
| Retiro con dos desenlaces | 17 scenarios (prior cycle + unidad/legado) | `equipos-retirar-componente-unidad.e2e.spec.ts`, `retirar-componente.*.spec.ts`, `retirar-reactivar-unidad.concurrencia.integration.spec.ts`, `componente-retiro-dialog.test.tsx` (legacy serial prefilled / empty) | ✅ COMPLIANT (17/17) |
| Reactivar depende del destino | 8 scenarios (STOCK_USADO, DESCARTE, legado, interfaz, unidad descartada, insumo NINGUNO, unidad recuperada, legado sin unidad) | `equipos-retirar-componente-unidad.e2e.spec.ts` › reactivar, `reactivar-componente.use-case.spec.ts`, `retirar-reactivar-unidad.concurrencia.integration.spec.ts`, `equipo-componentes-section.test.tsx` | ✅ COMPLIANT (8/8) |


**Compliance summary**: 128/131 scenarios compliant, 3 not compliant (2 UNTESTED, 1 deviation), 0 FAILING.
Requirements: 23/25. The two incomplete requirements are "Alta sin descuento crea unidad instalada (D3)" and
"Un solo flujo de alta con descuento opcional". The first pass counted 24/25 because it counted only the
FAILING scenario.

### Owner-decision checklist

Unchanged from the first pass. Every decision holds: D1, D3, E1, E2, E3, F1, F2 (UI caveat, WARNING 1), F3,
F4, G1 and G2. fix01 touches none of them. Roadmap: `docs/roadmap-comercial.md` has no serial-number point,
which matches the spec.

### Correctness (static evidence)

| Requirement | Status | Notes |
|---|---|---|
| Corrección de serial | ✅ Implemented | Any state with a serial, motivo required, audited event, no movement, no stock change. Fixed in `efa4b8cc`. |
| All others | ✅ Implemented | Consistent with ADR-1..ADR-14 (re-checked; fix01 touches only the correction path) |

### Coherence (design)

| Decision | Followed? | Notes |
|---|---|---|
| ADR-1..ADR-5, ADR-8..ADR-14 | ✅ | As in the first pass |
| ADR-6 recepción | ⚠️ | Validation is delegated to the entrada (open item 2). Amend the ADR text at archive. |
| ADR-7 equipos | ✅ | "Editar componente con unidad: se corrige desde la unidad (ADR-9)" is now reachable for `INSTALADA` units. `EditarComponenteUseCase` still rejects a serial on a component with a unit, which is the intended single path. |
| ADR-12 lock order | ✅ | The correction keeps L1 → L2 → L3 and writes nothing at L4 |

### Open items from apply: verdicts (carried forward)

1. **WU-8c/8d `numeroSerie = null` in the responses.** Not a defect. The runtime probe in the first pass
   returned `"SN-1"` for both endpoints. SUGGESTION 1 stands.
2. **WU-9 recepción validation lives in `ingresarPorSerie`.** Acceptable. The ADR-6 text drifted from the code
   (WARNING 3).
3. **WU-16b USADO offered only via `stock.admiteUsado`.** WARNING 1 stands. The reingreso UI does not offer USADO
   when the repuesto familia is not current, although G2 allows it. The backend complies.
4. **WU-18 reception without `INSUMOS:LECTURA` → no serial boxes.** WARNING 2 stands. A compras-only user
   creates pendientes they cannot complete.
5. **WU-19 reactivar toast matched by message text.** SUGGESTION 2 stands.
6. **Process: commits over 400 lines.** Reported only. The 21 code commits over 400 lines carry `size:exception`.
   Four planning-doc commits over 400 lines have none: 6a15d82f, 93ebedb2, 066fc516 and 107a4be9. `bc938dd`
   belongs to the previous cycle (`stock-usado-componentes`) and is already in `main`, so it is not part of this
   cycle. fix01 (`efa4b8cc`, 153 lines) is within the budget.

### Issues found

The first-pass CRITICAL (an `INSTALADA` serial could not be corrected) is **closed** by `efa4b8cc`.

**CRITICAL** (first-pass WARNINGS 1 and 2, reclassified; none caused by fix01)
1. **UNTESTED — "Retiro al stock de una unidad de origen sin salida"** (`componentes-catalogo-unico`). No test
   retires to `STOCK_USADO` a component whose unit was created by the D3 alta without discount, and checks that
   the unit becomes `EN_DEPOSITO USADO`, the ENTRADA USADO exists, and the "sin salida registrada del depósito"
   flag shows. The behavior is plausible by composition, but it is not proven. Fix (`sdd-apply`, tests only):
   add one e2e in `equipos-retirar-componente-unidad.e2e.spec.ts` that does the D3 alta through HTTP, then the
   retiro.
2. **UNTESTED — "Retiro al stock sin motivo"** for that same D3 unit. Fix: same spec, a 422 case asserting the
   unit is still `INSTALADA`.
3. **DEVIATION / UNTESTED — "Selector de unidad en el alta"** (`componentes-catalogo-unico`). The scenario
   requires that "el usuario elige la condición → se listan solo las unidades de esa condición". The UI lists
   every available unit with its condition in the label and has no condition step. Task 19.1 ("sin selector de
   saldo") encoded the deviation, which is the same pattern as the first-pass CRITICAL. There are two exits,
   and choosing between them is the owner's call:
   (a) add the condition filter to `componente-create-dialog.tsx` plus an MSW test; or
   (b) amend the spec scenario to the delivered behavior, as an explicit, declared deviation.

**WARNING**
1. The reingreso UI under-offers USADO for a non-current familia (open item 3).
2. Compras-only users cannot load serials at reception without `INSUMOS:LECTURA` (open item 4).
3. The ADR-6 text no longer matches where the recepción checks live. Update it at archive.
4. Four planning-doc commits exceed 400 lines without a `size:exception` note.
5. **New (fix01)**: no test corrects the serial of an `INSTALADA` unit and then reads the component
   (`GET` of the equipo's componentes) to pin that the component shows the new serial. The behavior is
   correct by construction: a live join, with `numero_serie` NULL in the component row. The spec scenario does
   not require this read.

**SUGGESTION**
1. Pin `numeroSerie` in the devolución and recuperación e2e assertions.
2. Carry the backend error `code` in `ApiError` instead of matching message text (open item 5).
3. The owner has not yet confirmed the ADR-14 open assumption (recuperación as ENTRADA rather than
   AJUSTE_POSITIVO).
4. For WARNING 5, extend the new e2e "corrige una unidad INSTALADA" so that it installs through the equipos
   flow, not with a direct `UPDATE`, and reads the component back.
