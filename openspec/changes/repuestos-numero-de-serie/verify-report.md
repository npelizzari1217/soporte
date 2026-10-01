```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:412f88ecb381cfbe806220b25e72a248a6677508bc4a8ce97f74fb9909583049
verdict: fail
blockers: 1
critical_findings: 1
requirements: 24/25
scenarios: 127/131
test_command: cd backend && pnpm lint && pnpm typecheck && pnpm test; cd frontend && pnpm lint && pnpm type-check && pnpm test
test_exit_code: 0
test_output_hash: sha256:b097c8c06665b1a4b463037acb1e0e4dd1d1cf96cf2dc8df5748b7fda585d3d4
build_command: cd backend && pnpm lint && pnpm typecheck; cd frontend && pnpm lint && pnpm type-check
build_exit_code: 0
build_output_hash: sha256:c776cc7fac2b7fd7af858bd4dca4dae91cf21e283c5dee22c437c49ba125a4ef
```

## Verification Report

**Change**: repuestos-numero-de-serie
**Version**: specs `unidades-insumo-serie` (new), deltas `stock-insumo-condicion` and `componentes-catalogo-unico`
**Mode**: Standard (feature; `strict_tdd: false`, no strict-TDD injection)
**Candidate**: branch `feat/repuestos-numero-de-serie-wu20`, HEAD `c7173058`, base `main`, 76 commits.
`evidence_revision` = sha256 of `git diff main...c7173058`.

### Verdict

**FAILED** — 1 blocker. The quality gates are green (backend 6528/6528, frontend 1705/1705, lint and
typecheck clean). But the spec requirement "La corrección de un serial exige motivo y queda auditada"
is violated: the implementation rejects correcting the serial of an `INSTALADA` unit, and a test
asserts that rejection. Combined with the component edit rule (a component with a unit rejects
serial edits), an installed unit's serial cannot be corrected by any path.

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 137 |
| Tasks complete | 137 |
| Tasks incomplete | 0 |

`gentle-ai sdd-status`: `apply: all_done`, `verify: ready`, tasks 137/137.

### Build and tests execution (foreground, WSL)

| Command | Observed result |
|---|---|
| `cd backend && pnpm lint && pnpm typecheck && pnpm test` | exit 0. `eslint .` with no output, `tsc --noEmit -p tsconfig.typecheck.json` with no output; Vitest **518 files / 6528 tests passed** (705.85 s). The noise is expected: `orden-de-arranque.spec.ts` "Falta configurar: JWT_SECRET" from child processes, `CorreoDeClienteAdapter` errors, and a mapped P2002 log from the rollback e2e. |
| `cd frontend && pnpm lint && pnpm type-check && pnpm test` | exit 0. "No ESLint warnings or errors"; `tsc --noEmit` clean; Vitest **220 files / 1705 tests passed** (182.26 s) |
| `git diff --stat main...HEAD \| tail -1` | `217 files changed, 28176 insertions(+), 463 deletions(-)` |

**Coverage**: not available (no coverage threshold declared by the project).

**Runtime probe for open item 1.** A transient copy of `unidades-insumo.e2e.spec.ts` recorded
`res.data.numeroSerie` for the two happy-path tests. The copy was untracked, then deleted, and the
working tree is clean. Result: devolución-entrega → `"SN-1"`, recuperación → `"SN-1"` (`pnpm vitest run
… -t "NUEVO: la"`: 2 passed).

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
| **Corrección de serial con motivo, auditada** | Corrección válida; Sin motivo; A un serial existente; **Corregir una unidad instalada** | `unidades-insumo.e2e.spec.ts` › "422 sin motivo; 409 a un serial existente; **422 sobre una instalada**", `operaciones-unidad-insumo.integration.spec.ts` › "corregirSerial sobre una unidad INSTALADA se devuelve como Result.fail" | ✅ 3/4 — ❌ **FAILING**: "Corregir una unidad instalada" (the spec requires the serial to change while the unit stays installed; the code rejects with 422 and the tests assert the rejection) |
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
| Alta sin descuento crea unidad instalada (D3) | Con serial; Sin serial; Serial repetido; **Retiro al stock de unidad de origen sin salida**; **Retiro al stock sin motivo** | `equipos-instalar-desde-deposito.e2e.spec.ts` › D3 (serial, USADO, 422, 409 + rollback), `agregar-componente-sin-descuento.use-case.spec.ts`; `retirar-componente.use-case.spec.ts` ("STOCK_USADO sin SALIDA vinculada y con/sin motivo") | ✅ 3/5; ⚠️ PARTIAL (2): no test retires a component whose unit was created by D3. The scenario is covered only by combining the generic motivo/`bajaSinSalidaPrevia` rule with the unit-return tests. |
| Un solo flujo de alta con descuento opcional | 11 scenarios (defecto, USADO, insuficiente, falla SALIDA, sin descuento, selector de saldo, un solo saldo, instalar SERIE por serial, sin unidad o pendiente, unidad tomada, **selector de unidad en el alta**) | `equipos-instalar-desde-deposito.e2e.spec.ts` (including two concurrent installs, one wins, and rollback), `instalar-componente-desde-deposito.*.spec.ts`, `componente-create-dialog.test.tsx` | ✅ 10/11; ⚠️ PARTIAL (1): "Selector de unidad en el alta". The UI lists every available unit with its condition in the label (`SelectorUnidad`, `disponibles=true`) and has no condition selector, so the "elige la condición → solo esa condición" step does not exist. Tasks 19.1 chose "sin selector de saldo". |
| Edición no cambia tipo ni insumo | Datos propios; Cambiar insumo; Reemplazo; Serial de componente con unidad; Serial legado | `editar-componente.use-case.spec.ts`, `equipos-instalar-desde-deposito.e2e.spec.ts` (422 for a unit, 200 for a legacy component), `componente-edit-dialog.test.tsx` | ✅ COMPLIANT (5/5) |
| Retiro con dos desenlaces | 17 scenarios (prior cycle + unidad/legado) | `equipos-retirar-componente-unidad.e2e.spec.ts`, `retirar-componente.*.spec.ts`, `retirar-reactivar-unidad.concurrencia.integration.spec.ts`, `componente-retiro-dialog.test.tsx` (legacy serial prefilled / empty) | ✅ COMPLIANT (17/17) |
| Reactivar depende del destino | 8 scenarios (STOCK_USADO, DESCARTE, legado, interfaz, unidad descartada, insumo NINGUNO, unidad recuperada, legado sin unidad) | `equipos-retirar-componente-unidad.e2e.spec.ts` › reactivar, `reactivar-componente.use-case.spec.ts`, `retirar-reactivar-unidad.concurrencia.integration.spec.ts`, `equipo-componentes-section.test.tsx` | ✅ COMPLIANT (8/8) |

**Compliance summary**: 127/131 scenarios compliant, 3 PARTIAL, 1 FAILING. Requirements: 24/25.

### Owner-decision checklist

| Decision | Verdict | Evidence |
|---|---|---|
| D1 pendiente counts in balance, cannot be installed or taken out | ✅ | `consultar-stock-insumo` (`pendientesDeSerie`), CHECK `numero_serie IS NOT NULL OR estado IN (EN_DEPOSITO, DESCARTADA)`, install/salida 422 e2e |
| D3 alta sin descuento → INSTALADA with serial and chosen condition | ✅ | D3 e2e (USADO honored, default NUEVO, `ALTA_INSTALADA`, no movement) |
| E1 SALIDA → ENTREGADA; AJUSTE_NEGATIVO → DESCARTADA | ✅ | `invariante-serie.integration.spec.ts`; adversarial mutation (b) in apply-progress |
| E2 legacy retiro requires serial, prefilled | ✅ | retiro e2e (422 without serial, 409 duplicate), `componente-retiro-dialog.test.tsx` |
| E3 SERIE→NINGUNO only without EN_DEPOSITO/INSTALADA | ✅ | `insumos-seguimiento.e2e.spec.ts` |
| F1 pendiente written off via ajuste negativo with motivo | ✅ | service spec + e2e + `movimiento-unidad.test.tsx` |
| F2 ENTREGADA returns with NUEVO/USADO, `INSUMOS:ALTAS` | ✅ (UI caveat, open item 3) | devolución e2e incl. 403 |
| F3 `entera` editable from the ABM | ✅ | e2e + `unidad-medida-form-dialog.test.tsx` + case 7 |
| F4 EQUIPOS permissions move units without INSUMOS | ✅ | install, retire and reactivate e2e with EQUIPOS-only actors |
| G1 DESCARTADA recoverable (`AJUSTAR`, chosen condition, pendiente stays pendiente, reactivation blocked) | ✅ | recuperación e2e incl. 403 without `AJUSTAR`; reactivar-after-recover 422 |
| G2 devolución of a disabled insumo accepted | ✅ | e2e "G2: admite un insumo deshabilitado y una familia deshabilitada con USADO" |

Roadmap: `docs/roadmap-comercial.md` has no serial-number point, which matches the spec's statement
that this cycle implements no roadmap point.

### Open items from apply: verdicts

1. **WU-8c/8d `numeroSerie = null` in the responses.** **Not a defect.** Both use cases return the
   movement from `movimientoRepo.insert`, which uses `include: INCLUIR_SERIAL_DE_LA_UNIDAD` after
   the CAS in the same transaction. The runtime probe returned `"SN-1"` for both endpoints. The flag
   probably came from the in-memory fakes. Suggestion: add `numeroSerie` to the e2e `toMatchObject`
   so this contract is pinned.
2. **WU-9 recepción validation lives in `ingresarPorSerie`.** **Acceptable, with a design-doc
   drift.** The checks run in the same transaction under L1, before any unit write. A fail throws
   `FalloEntradaDeStock` and rolls back the accumulated quantity. `compras.e2e.spec.ts` proves the
   fractional-quantity 422, the more-serials-than-delta 422 and the duplicate-serial 409 with
   rollback. Keeping one source avoids a second copy of the rule. ADR-6 should be amended at archive.
3. **WU-16b USADO offered only via `stock.admiteUsado`.** **Follow-up (WARNING).** The backend
   complies with the spec, but the UI cannot return or recover a piece as USADO when the repuesto
   familia is disabled or deleted, although G2 allows it. No wrong data is written; the UI
   under-offers. Fix: expose an "admits USADO for return" flag computed with
   `admitirFamiliaNoVigente: true`, or offer USADO and let the backend decide.
4. **WU-18 without `INSUMOS:LECTURA` → no serial boxes.** **Follow-up (WARNING).** The spec is met
   because the pieces become pendientes. The cost: a compras-only user creates pendientes they
   cannot complete (`cargarSerial` needs `INSUMOS:ALTAS`). Fix: return `seguimiento` with the compra
   item, so the reception dialog does not depend on the insumo stock read.
5. **WU-19 reactivar toast matched by message text.** **Follow-up (SUGGESTION).** This is fragile
   coupling to backend copy. Changing the message silently degrades to the generic toast and has no
   functional impact. Fix: carry `code` in the HTTP error body and in `ApiError`.
6. **Process: commits over 400 lines.** Reported only, not fixed. All 21 code commits over 400
   lines in `main..HEAD` carry a `size:exception` note; the largest is 290fa38d at 1156 lines. The
   four planning-doc commits over 400 lines have none: 6a15d82f (977), 93ebedb2 (470),
   066fc516 (533) and 107a4be9 (744). **Correction to the flag**: `bc938dd` (444 lines) belongs
   to the previous cycle (`stock-usado-componentes`) and is already in `main`. This cycle's WU-5
   part 1 is `900a39e1` at 334 lines, inside the budget.

### Correctness (static evidence)

| Requirement | Status | Notes |
|---|---|---|
| Corrección de serial | ❌ Deviates | `OperacionesUnidadInsumo.corregirSerial` rejects `INSTALADA` ("su serial se corrige desde el componente"), but `EditarComponenteUseCase` rejects any `numeroSerie` on a component with a unit (`SerialDeUnidadNoEditableError`). Circular dead end. The frontend hides "Corregir serial" for INSTALADA. Tasks 4b.2/8b.3 encoded the rejection and contradict the spec. |
| All others | ✅ Implemented | Consistent with ADR-1..ADR-14; adversarial mutations recorded in apply-progress went red as designed |

### Coherence (design)

| Decision | Followed? | Notes |
|---|---|---|
| ADR-1 schema/CHECKs | ✅ | Constraints spec, 58 cases |
| ADR-2 count to show, state to decide | ✅ | Invariant spec |
| ADR-3 activation, entera, W3 | ✅ | Minor: L0 always taken towards SERIE (harmless, documented) |
| ADR-4 single gateway, validate-then-write | ✅ | |
| ADR-5 L1 first in every stock use case | ✅ | Witnesses in `orden-de-locks` |
| ADR-6 recepción | ⚠️ | Validation delegated to the entrada (open item 2) |
| ADR-7 equipos | ⚠️ | "Editar componente con unidad: se corrige desde la unidad (ADR-9)" is not possible for INSTALADA (see CRITICAL) |
| ADR-8 errors and contracts | ✅ | Explicit mapping; `MovimientosRegistradosResponseDto` extension documented; new `UnidadConAltaSinDescuentoError` (documented decision) |
| ADR-9 event log | ✅ | |
| ADR-10 rollback runbook | ✅ | `DEPLOY-VPS-runbook.md` (WU-20) |
| ADR-11 Ayuda | ✅ | `permisos-y-roles.md` corrected (WU-8d); every frontend commit notes the debt; no other article became false |
| ADR-12 lock order (invariante L) | ✅ | Cases 1–7 plus witnesses; mutations red |
| ADR-13 devolución | ✅ | |
| ADR-14 recuperación | ✅ | |

### Issues found

**CRITICAL**
1. The serial of an `INSTALADA` unit cannot be corrected. This breaks the spec's "corregir el serial
   de una unidad con serial, en cualquier estado" and the scenario "Corregir una unidad instalada".
   It is also a functional dead end, because the component path is closed by design. Fix (`sdd-apply`):
   - Drop the `INSTALADA` guard in `OperacionesUnidadInsumo.corregirSerial`
     (`backend/src/insumos/application/services/operaciones-unidad-insumo.service.ts` around line 612).
   - Invert the e2e (`unidades-insumo.e2e.spec.ts` › "422 sobre una instalada") and the integration
     case ("corregirSerial sobre una unidad INSTALADA…").
   - Show "Corregir serial" for INSTALADA in `unidades-insumo-section.tsx`.
   - Amend tasks 4b.2.
   - The component reads `unidad.numeroSerie`, so the corrected serial propagates.

**WARNING**
1. "Selector de unidad en el alta": no condition step; the units show their condition in the label (PARTIAL).
2. D3 → retiro `STOCK_USADO` scenarios have no direct test; they are covered only by composition (PARTIAL ×2).
3. Open item 3: the reingreso UI under-offers USADO for a non-current familia.
4. Open item 4: compras-only users cannot load serials at reception.
5. ADR-6 text no longer matches where the recepción checks live (update at archive).
6. Four planning-doc commits exceed 400 lines without a `size:exception` note.

**SUGGESTION**
1. Pin `numeroSerie` in the devolución and recuperación e2e assertions.
2. Carry the backend error `code` in `ApiError` instead of matching message text (open item 5).
3. ADR-14 open assumption (recuperación as ENTRADA rather than AJUSTE_POSITIVO) is still unconfirmed by the owner.
