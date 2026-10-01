```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:590b241ca305dca7b3895af17ebc3c3e02fa9c8dc098f2d1d1f714177e8b6fff
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 25/25
scenarios: 131/131
test_command: cd backend && pnpm lint && pnpm typecheck && pnpm test; cd frontend && pnpm lint && pnpm type-check && pnpm test
test_exit_code: 0
test_output_hash: sha256:bd83e3e7cc7dbaa4973e646a6e17ef389b1c60044d6882f942f331fd9ca4aa7f
build_command: cd backend && pnpm lint && pnpm typecheck; cd frontend && pnpm lint && pnpm type-check
build_exit_code: 0
build_output_hash: sha256:206cb044b1ac9bed6b4a9a3b0af6416784804c3c7b461df21d1c5ea5fff76d2c
```

## Verification Report

**Change**: repuestos-numero-de-serie
**Version**: specs `unidades-insumo-serie` (new), deltas `stock-insumo-condicion` and `componentes-catalogo-unico`
**Mode**: Standard for the feature work units; Strict TDD for the fix01 and fix02 corrections (TDD evidence
required by `~/proyectos/CLAUDE.md` §6.3 for defect corrections)
**Candidate**: branch `feat/repuestos-numero-de-serie-fix02`, HEAD `79d50124`, base `main`, 81 commits.
`evidence_revision` = sha256 of `git diff main...79d50124`
(`218 files changed, 28608 insertions(+), 461 deletions(-)`).

### Historial

- **Pass 1: FAILED**. 1 CRITICAL at evidence
  `sha256:412f88ecb381cfbe806220b25e72a248a6677508bc4a8ce97f74fb9909583049` (HEAD `c7173058`, report commit
  `183f5934`). `corregirSerial` rejected an `INSTALADA` unit. Remediated by `efa4b8cc`
  (`fix(insumos): corregir el serial de una unidad instalada`).
- **Pass 2: FAILED**. 3 CRITICALs at evidence
  `sha256:bc64e2f1b6b41b42b6c924a73089a633653dd436a5f0ed5a397e2f25594d38c9` (HEAD `efa4b8cc`, report commit
  `0e5104de`). The fix01 CRITICAL was closed. Three scenarios that pass 1 had marked PARTIAL were reclassified:
  "Retiro al stock de una unidad de origen sin salida" (UNTESTED), "Retiro al stock sin motivo" (UNTESTED) and
  "Selector de unidad en el alta" (DEVIATION / UNTESTED).
- **Remediation**: `4bd4e042` (`test(equipos): retiro al stock de una unidad sin salida (D3)`, tests only, 67
  lines) and `79d50124` (`fix(equipos): elegir la condicion antes de la pieza en el alta`, 73 lines). Exit (a)
  was taken for the selector: the condition step was implemented and the spec was not amended.
- **Pass 3 (this report)**: full compliance re-check of all 25 requirements and 131 scenarios.

### Verdict

**PASS WITH WARNINGS**. 0 blockers. The 3 pass-2 CRITICALs are closed, each one by a covering test that
passed at runtime and that this verification proved can fail (mutation, below). All gates are green. Six
warnings remain. None of them breaks a spec scenario. One of them (WARNING 6) is new in fix02.

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 137 |
| Tasks complete | 137 |
| Tasks incomplete | 0 |

`gentle-ai sdd-status`: `apply: all_done`, `verify: ready`, tasks 137/137. Task 19.1 is amended in
`79d50124`: the alta now shows the condition choice first, then the piece selector filtered by that
condition. The old text said "sin selector de saldo". The task stays checked.

### Build and tests execution (WSL)

| Command | Observed result |
|---|---|
| `cd backend && pnpm lint && pnpm typecheck` | exit 0. `eslint .` and `tsc --noEmit -p tsconfig.typecheck.json` print nothing. |
| `cd backend && pnpm test` | exit 0. Vitest **518 files / 6532 tests passed** (756.93 s). That is 2 more than pass 2, from the two new D3 e2e cases. The noise is the known kind: `orden-de-arranque.spec.ts` child-process lines, `CorreoDeClienteAdapter` errors, and the mapped P2002 log. |
| `cd frontend && pnpm lint && pnpm type-check` | exit 0. "No ESLint warnings or errors" (plus the `next lint` deprecation notice); `tsc --noEmit` is clean. |
| `cd frontend && pnpm test` | exit 0. Vitest **220 files / 1707 tests passed** (225.80 s). That is 1 more than pass 2, from the new condition-filter case. |

Execution note: the backend command outlived the tool's 600 s foreground ceiling, so it ran detached as one
process and was awaited to completion. No other process touched the shared test database during that run. The
mutations below ran after the run had finished.

**Coverage**: not available (the project declares no coverage threshold).

### fix02: closure of the three CRITICALs

| Pass-2 CRITICAL | Closed by | Evidence |
|---|---|---|
| 1. UNTESTED "Retiro al stock de una unidad de origen sin salida" | `4bd4e042` | `equipos-retirar-componente-unidad.e2e.spec.ts` › "Retiro de un componente con unidad de origen sin salida (D3)" › **"STOCK_USADO con motivo -> la unidad queda EN_DEPOSITO USADO con su serial, existe la ENTRADA y se marca sin salida previa"**. The alta goes through HTTP with `descontarStock: false` and serial "K9", and the unit is born `INSTALADA` with no SALIDA. The retiro with motivo "pieza del equipo comprado" returns 200 with `bajaSinSalidaPrevia: true`. The DB unit is `EN_DEPOSITO`, `USADO`, `equipoId: null`, `numeroSerie: 'K9'`. Exactly one ENTRADA USADO of quantity 1 exists for that unit, it is the `bajaMovimientoId`, and there are 0 SALIDAs. The marker "sin salida registrada del depósito" is drawn from that flag by `equipo-componentes-section.tsx:185` and pinned by `equipo-componentes-section.test.tsx` › "marca 'sin salida registrada del depósito' solo cuando la devolución no tenía salida previa". |
| 2. UNTESTED "Retiro al stock sin motivo" | `4bd4e042` | Same describe › **"STOCK_USADO sin motivo -> 422 y la unidad sigue INSTALADA"**. The result is 422, the unit stays `INSTALADA` on its equipo, no movement exists, and the component row is not soft-deleted. |
| 3. DEVIATION "Selector de unidad en el alta" | `79d50124` | `componente-create-dialog.tsx` now renders `CondicionStockSelector` for any alta with discount, including `SERIE`. `useSeleccionUnidad` takes an optional `condicion` and filters the available units on the client. The list still comes from `?disponibles=true`, so it has no pendientes. The payload carries `unidadId` and no `condicion`. Test: `componente-create-dialog.test.tsx` › **"con descuento se elige la condición y solo se listan las piezas de esa condición, por serial"**. With units of both conditions, NUEVO lists only SN-AAA. After choosing USADO, only SN-BBB is listed, and the POST sends `unidadId: 'u2'` without `condicion`. The existing case pins `disponibles=true`. |

**Adversarial mutation (verify-run, transient, reverted; working tree clean afterwards):**
- Frontend: replacing the filter in `use-seleccion-unidad.ts` with `const unidades = query.data;` turns the new
  case red (`1 failed | 21 passed`). After the revert it is `22 passed`.
- Backend: in `componente-equipo.entity.ts`, forcing the getter `bajaSinSalidaPrevia` to `false` and replacing the
  `SIN_SALIDA_REGISTRADA` rejection with `Result.ok(normalizado)` turns both D3 cases red (`2 failed`). After the
  revert they are `2 passed`. Each mutation fails its test for the intended reason: the flag assertion, and the
  422 assertion.

### TDD Compliance (fix02, Strict TDD)

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | `apply-progress.md` › "fix02" has a RED / GREEN / REFACTOR table with 3 rows |
| All tasks have tests | ✅ | 3/3 rows name a test that exists in the codebase |
| RED confirmed | ✅ | Frontend row: a real RED ("Unable to find a label with the text of: Condición"), reproduced by the mutation above. The 2 backend rows are coverage-only (the behavior already existed). They were GREEN on the first run, and each one documents a mutation that makes it fail. This verification reproduced both mutations independently. Accepted as stated by the launch contract. |
| GREEN confirmed (tests pass) | ✅ | 3/3 pass in the targeted runs and in the full suites |
| Triangulation adequate | ✅ | D3 retiro: one success case and one rejection case, at the HTTP layer. These sit on top of the existing `retirar-componente.use-case.spec.ts` cases ("STOCK_USADO sin SALIDA vinculada y con/sin motivo"). Selector: both conditions are exercised in one case, including the switch. |
| Safety net for modified files | ✅ | The pre-existing cases of `componente-create-dialog.test.tsx` still pass (22/22). One obsolete assertion ("sin Condición") was removed, and that is the intended behavior change. |

**Test layer distribution (fix02)**: e2e 2 (HTTP + real Postgres) · frontend integration 1 (RTL + MSW).

**Assertion quality**: ✅ The assertions check the response body, DB rows, movement identity and count, the
rendered options, and the request body sent. There are no tautologies. The `toHaveLength(1)` is paired with
content assertions.

The fix01 TDD table (4 rows) was verified in pass 2 and is unchanged.

### Spec compliance matrix

Scenario counts come from the `#### Scenario:` headings. `unidades-insumo-serie` has 15 requirements and 57
scenarios, `stock-insumo-condicion` has 5 and 28, and `componentes-catalogo-unico` has 5 and 46. The total is
25 requirements and 131 scenarios. Rows group the scenarios of one requirement. All covering tests passed in
this run.

#### unidades-insumo-serie

| Requirement | Scenarios | Covering tests (all passed) | Result |
|---|---|---|---|
| Modo de seguimiento NINGUNO o SERIE | Insumo existente tras la migración; Valor inválido; NINGUNO sin cambios | `unidades-insumo-constraints.integration.spec.ts` (legacy rows + CHECK), `insumos.dto.spec.ts`, `insumos-seguimiento.e2e.spec.ts` (400), `movimientos-insumo.e2e.spec.ts` + `registrar-*-insumo.use-case.spec.ts` (NINGUNO branch, no units) | ✅ COMPLIANT (3/3) |
| SERIE solo con saldo cero y UM entera | Activar con saldo cero; con saldo; UM no entera; Marcar entera; Desmarcar entera en uso; Concurrente con movimiento; Activación mientras cambia UM; Volver a NINGUNO con vivas; con entregadas/descartadas | `insumos-seguimiento.e2e.spec.ts`, `cambiar-seguimiento-insumo.use-case.spec.ts`, `orden-de-locks.concurrencia.integration.spec.ts` cases 1–5 and 7, `editar-unidad-medida.use-case.spec.ts` | ✅ COMPLIANT (9/9) |
| Unidad tiene serial, condición y estado | Instalada refiere equipo; Estado inválido; Entregada sin equipo ni saldo | `unidades-insumo.e2e.spec.ts`, `unidades-insumo-constraints.integration.spec.ts`, `invariante-serie.integration.spec.ts`, `registrar-salida-insumo.use-case.spec.ts` | ✅ COMPLIANT (3/3) |
| Serial obligatorio, normalizado y único por insumo | Duplicado otra capitalización; Duplicado de descartada; Mismo serial en otro insumo; Serial vacío; Concurrencia mismo serial | `prisma-unidad-insumo.repository.integration.spec.ts`, `unidades-insumo-constraints.integration.spec.ts`, `unidad-insumo.entity.spec.ts`, `es-serial-de-unidad.spec.ts` | ✅ COMPLIANT (5/5) |
| Sin serial entran como serie pendiente | Recepción sin seriales; Instalar pendiente; Selector sin pendientes; Baja pendiente por ajuste negativo; Baja sin motivo | `compras.e2e.spec.ts`, `equipos-instalar-desde-deposito.e2e.spec.ts` (pendiente 422), `movimientos-insumo-serie.e2e.spec.ts`, `listar-unidades-insumo.use-case.spec.ts` (`disponibles`), `movimiento-unidad.test.tsx`, `operaciones-unidad-insumo.service.spec.ts` | ✅ COMPLIANT (5/5) |
| Serial pendiente se completa desde la ficha | Completar; Completar repetido | `unidades-insumo.e2e.spec.ts`, `operaciones-unidad-insumo.integration.spec.ts`, `unidad-serial-dialog.test.tsx` | ✅ COMPLIANT (2/2) |
| Condición de la unidad; saldo SERIE cuenta unidades | Saldo por condición; Reposición sobre NUEVO | `consultar-stock-insumo.use-case.spec.ts`, `invariante-serie.integration.spec.ts`, `tipo-movimiento-insumo.spec.ts` | ✅ COMPLIANT (2/2) |
| Entregada puede volver al depósito | Sin uso; Usada; No entregada; Insumo en NINGUNO; Insumo deshabilitado | `unidades-insumo.e2e.spec.ts` › devolucion-entrega, `devolver-entrega.use-case.spec.ts`, `operaciones-unidad-insumo.integration.spec.ts` | ✅ COMPLIANT (5/5) |
| Descartada puede recuperarse | Pieza dada de baja por error; Usada desde equipo; Pendiente descartada; Sin motivo; No descartada; Insumo deshabilitado | `unidades-insumo.e2e.spec.ts` › recuperacion, `recuperar-unidad-descartada.use-case.spec.ts`, `invariante-serie.integration.spec.ts` | ✅ COMPLIANT (6/6) |
| Corrección de serial con motivo, auditada | Corrección válida; Sin motivo; A un serial existente; Corregir una unidad instalada | `unidades-insumo.e2e.spec.ts` (including "corrige una unidad INSTALADA…"), `operaciones-unidad-insumo.integration.spec.ts`, `operaciones-unidad-insumo.service.spec.ts`, `unidad-insumo.entity.spec.ts`, `unidad-serial-dialog.test.tsx` | ✅ COMPLIANT (4/4), fixed in `efa4b8cc` |
| Historial consultable por serial | Vida completa; Descartada; Entregada; Sin historia anterior | `unidades-insumo.e2e.spec.ts`, `consultar-historial-unidad.use-case.spec.ts`, `insumos-seguimiento.e2e.spec.ts`, `unidad-historial-dialog.test.tsx` | ✅ COMPLIANT (4/4) |
| Saldo de unidades coincide con el libro | Invariante tras secuencia; Concurrencia misma unidad; Falla parcial | `invariante-serie.integration.spec.ts`, `operaciones-unidad-insumo.integration.spec.ts` | ✅ COMPLIANT (3/3) |
| Operaciones reutilizables en lote | Varias en una tx; Falla en una del lote | `operaciones-unidad-insumo.integration.spec.ts` | ✅ COMPLIANT (2/2) |
| Permisos de equipos mueven unidades sin INSUMOS | Instalar sin permisos de insumos; Devolver al retirar sin permisos de insumos | `equipos-instalar-desde-deposito.e2e.spec.ts`, `equipos-retirar-componente-unidad.e2e.spec.ts` | ✅ COMPLIANT (2/2) |
| Legados conservan serial de texto | Migración con componentes previos; Editar serial legado | `unidades-insumo-constraints.integration.spec.ts`, `equipos-instalar-desde-deposito.e2e.spec.ts` | ✅ COMPLIANT (2/2) |

#### stock-insumo-condicion

| Requirement | Scenarios | Covering tests (all passed) | Result |
|---|---|---|---|
| Movimiento SERIE referencia una unidad con cantidad 1 | Entrada de varias piezas; Movimiento sin unidad; NINGUNO con unidad | `movimientos-insumo-serie.e2e.spec.ts`, `movimiento-insumo.entity.spec.ts`, `unidades-insumo-constraints.integration.spec.ts`, `registrar-salida-insumo.use-case.spec.ts` | ✅ COMPLIANT (3/3) |
| Saldo por insumo y condición, fórmula única | Independientes; Sin USADO; Saldo SERIE | `tipo-movimiento-insumo.spec.ts`, `consultar-stock-insumo.use-case.spec.ts`, `invariante-serie.integration.spec.ts` | ✅ COMPLIANT (3/3) |
| Salida/ajuste negativo no deja negativo | Mayor que saldo (2); Dentro del saldo; Concurrentes; Salida por serial; Sin unidad o no disponible; Ajuste negativo con unidad; Pendiente; Sin motivo | `movimientos-insumo.e2e.spec.ts`, `prisma-movimiento-insumo.repository.concurrencia.integration.spec.ts`, `movimientos-insumo-serie.e2e.spec.ts`, `registrar-salida-insumo.use-case.spec.ts`, `registrar-ajuste-insumo.use-case.spec.ts`, `movimiento-unidad.test.tsx` | ✅ COMPLIANT (9/9) |
| ENTRADA y AJUSTE pueden apuntar a USADO | Deshabilitado rechazado; Entrada usados; Ajuste positivo usados; Entrada SERIE con seriales; Sin serial o repetido; Ajuste positivo SERIE; Sin motivo | `registrar-entrada-insumo.use-case.spec.ts`, `registrar-ajuste-insumo.use-case.spec.ts`, `movimientos-insumo-serie.e2e.spec.ts`, `devolver-entrega.use-case.spec.ts`, `movimiento-seriales.test.tsx` | ✅ COMPLIANT (7/7) |
| Recepción registra NUEVO | Recepción de compra; No acepta condición; SERIE todos; Parciales; Repetido; Fraccional | `compras.e2e.spec.ts`, `registrar-recepcion-de-item.use-case.spec.ts`, `registrar-recepcion-seriales.test.tsx` | ✅ COMPLIANT (6/6) |

#### componentes-catalogo-unico

| Requirement | Scenarios | Covering tests (all passed) | Result |
|---|---|---|---|
| Alta sin descuento crea unidad instalada (D3) | Con serial; Sin serial; Serial repetido; Retiro al stock de unidad de origen sin salida; Retiro al stock sin motivo | `equipos-instalar-desde-deposito.e2e.spec.ts` › D3 (serial, USADO, 422, 409 + rollback), `agregar-componente-sin-descuento.use-case.spec.ts`; **`equipos-retirar-componente-unidad.e2e.spec.ts` › "Retiro de un componente con unidad de origen sin salida (D3)"** (both cases, `4bd4e042`); `equipo-componentes-section.test.tsx` (marker) | ✅ COMPLIANT (5/5), closed in fix02 |
| Un solo flujo de alta con descuento opcional | 11 scenarios (defecto, USADO, insuficiente, falla SALIDA, sin descuento, selector de saldo, un solo saldo, instalar SERIE por serial, sin unidad o pendiente, unidad tomada, selector de unidad en el alta) | `equipos-instalar-desde-deposito.e2e.spec.ts` (including two concurrent installs, one wins, and rollback), `instalar-componente-desde-deposito.*.spec.ts`, `componente-create-dialog.test.tsx` (including **"con descuento se elige la condición y solo se listan las piezas de esa condición, por serial"**, `79d50124`) | ✅ COMPLIANT (11/11), closed in fix02 |
| Edición no cambia tipo ni insumo | Datos propios; Cambiar insumo; Reemplazo; Serial de componente con unidad; Serial legado | `editar-componente.use-case.spec.ts`, `equipos-instalar-desde-deposito.e2e.spec.ts`, `componente-edit-dialog.test.tsx` | ✅ COMPLIANT (5/5) |
| Retiro con dos desenlaces | 17 scenarios (prior cycle + unidad/legado) | `equipos-retirar-componente-unidad.e2e.spec.ts`, `retirar-componente.*.spec.ts`, `retirar-reactivar-unidad.concurrencia.integration.spec.ts`, `componente-retiro-dialog.test.tsx` | ✅ COMPLIANT (17/17) |
| Reactivar depende del destino | 8 scenarios (STOCK_USADO, DESCARTE, legado, interfaz, unidad descartada, insumo NINGUNO, unidad recuperada, legado sin unidad) | `equipos-retirar-componente-unidad.e2e.spec.ts` › reactivar, `reactivar-componente.use-case.spec.ts`, `retirar-reactivar-unidad.concurrencia.integration.spec.ts`, `equipo-componentes-section.test.tsx` | ✅ COMPLIANT (8/8) |

**Compliance summary**: 131/131 scenarios compliant, 0 FAILING, 0 UNTESTED, 0 PARTIAL. Requirements: 25/25.

### Owner-decision checklist

Unchanged from the earlier passes. Every decision holds: D1, D3, E1, E2, E3, F1, F2 (UI caveat, WARNING 1), F3,
F4, G1 and G2. fix02 adds tests for D3 and does not change its behavior. Roadmap: `docs/roadmap-comercial.md`
has no serial-number point, which matches the spec.

### Correctness (static evidence)

| Requirement | Status | Notes |
|---|---|---|
| Alta con descuento, SERIE | ✅ Implemented | Condition first (`useSelectorCondicion`, the same rules as the saldo selector), then pieces of that condition. The payload is `unidadId` only. The backend install path takes the condition from the unit. |
| Alta sin descuento (D3) / retiro | ✅ Implemented | `validarRetiro` requires a motivo when `instalacionMovimientoId === null`. The `bajaSinSalidaPrevia` getter feeds the response and the UI marker. |
| All others | ✅ Implemented | Consistent with ADR-1..ADR-14 (re-checked; fix02 touches only the alta dialog, the selection hook and tests) |

### Coherence (design)

| Decision | Followed? | Notes |
|---|---|---|
| ADR-1..ADR-5, ADR-8..ADR-14 | ✅ | As in the earlier passes |
| ADR-6 recepción | ⚠️ | Validation is delegated to the entrada (WARNING 3). Amend the ADR text at archive. |
| ADR-7 equipos | ✅ | The alta now matches the spec: a condition step, then a piece selector by serial. Task 19.1 was amended to match. |
| ADR-12 lock order | ✅ | fix02 adds no backend write path |

### Open items from apply: verdicts (carried forward)

1. **WU-8c/8d `numeroSerie = null` in the responses.** Not a defect (runtime probe in pass 1). SUGGESTION 1 stands.
2. **WU-9 recepción validation lives in `ingresarPorSerie`.** Acceptable. The ADR-6 text drifted (WARNING 3).
3. **WU-16b USADO offered only via `stock.admiteUsado`.** WARNING 1 stands. fix02 extends the same pattern to the
   alta (WARNING 6).
4. **WU-18 reception without `INSUMOS:LECTURA` → no serial boxes.** WARNING 2 stands.
5. **WU-19 reactivar toast matched by message text.** SUGGESTION 2 stands.
6. **Process: commits over 400 lines.** Reported only (WARNING 4). fix02's commits (67 and 73 lines) are within
   the budget.

### Issues found

The 3 pass-2 CRITICALs are **closed** by `4bd4e042` and `79d50124`, and proven at runtime and by mutation.

**CRITICAL**: None.

**WARNING**
1. The reingreso UI under-offers USADO for a non-current familia (open item 3). The backend complies.
2. Compras-only users cannot load serials at reception without `INSUMOS:LECTURA` (open item 4).
3. The ADR-6 text no longer matches where the recepción checks live. Update it at archive.
4. Four planning-doc commits exceed 400 lines without a `size:exception` note: 6a15d82f, 93ebedb2, 066fc516
   and 107a4be9.
5. No test corrects the serial of an `INSTALADA` unit and then reads the component back, to pin that the
   component shows the new serial. The behavior is correct by construction: a live join, with `numero_serie`
   NULL in the component row. The spec scenario does not require that read.
6. **New (fix02)**: in the alta with discount of a `SERIE` insumo, the piece list is filtered by
   `selector.valor`. `useSelectorCondicion` hides the condition field when the familia does not admit USADO
   (`admiteUsado: false`), and `valor` falls back to NUEVO unless exactly one saldo is positive. So when such an
   insumo has `EN_DEPOSITO` units in both conditions, the USADO units cannot be picked in the alta. That state can
   arise from G2 returns or a familia change. Before fix02 they were listed. The backend install path does not
   validate condition admission and would accept them. This is the same under-offer pattern as WARNING 1. The spec
   scenario (the user chooses the condition) holds whenever the field is shown. Also, while the stock query is in
   flight, the list is transiently filtered to NUEVO.

**SUGGESTION**
1. Pin `numeroSerie` in the devolución and recuperación e2e assertions.
2. Carry the backend error `code` in `ApiError` instead of matching message text (open item 5).
3. The owner has not yet confirmed the ADR-14 open assumption (recuperación as ENTRADA rather than
   AJUSTE_POSITIVO).
4. For WARNING 5, extend the e2e "corrige una unidad INSTALADA" so that it installs through the equipos flow
   and reads the component back.
5. For WARNING 6, for `SERIE` with discount, show the condition field whenever both conditions have units in
   depósito, not only when `admiteUsado`. Add one MSW case with `admiteUsado: false` and units of both conditions.
