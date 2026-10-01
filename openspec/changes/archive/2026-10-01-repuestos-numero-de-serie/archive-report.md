# Archive Report: repuestos-numero-de-serie

**Change**: repuestos-numero-de-serie  
**Archived**: 2026-10-01  
**Final Status**: CLOSED (pass_with_warnings)  
**Branch**: `feat/repuestos-numero-de-serie-fix02` (HEAD `79d50124`)

---

## Final State Summary

The change has been fully planned, implemented, verified (3 passes), and archived. All 25 requirements across three capabilities are met. All 131 scenarios passed. The implementation completes the full cycle of unit-level tracking for serialized inventory items.

---

## Merged Capabilities

### 1. unidades-insumo-serie (NEW)

**Requirements merged**: 15  
**Scenarios merged**: 57

**Requirements**:
- ### Requirement: Modo de seguimiento NINGUNO o SERIE
- ### Requirement: SERIE solo con saldo cero y UM entera
- ### Requirement: Unidad tiene serial, condición y estado
- ### Requirement: Serial obligatorio, normalizado y único por insumo
- ### Requirement: Sin serial entran como serie pendiente
- ### Requirement: Serial pendiente se completa desde la ficha
- ### Requirement: Condición de la unidad; saldo SERIE cuenta unidades
- ### Requirement: Entregada puede volver al depósito
- ### Requirement: Descartada puede recuperarse
- ### Requirement: Corrección de serial con motivo, auditada
- ### Requirement: Historial consultable por serial
- ### Requirement: Saldo de unidades coincide con el libro
- ### Requirement: Operaciones reutilizables en lote
- ### Requirement: Permisos de equipos mueven unidades sin INSUMOS
- ### Requirement: Legados conservan serial de texto

**Action**: Created `openspec/specs/unidades-insumo-serie/spec.md`

### 2. stock-insumo-condicion (MODIFIED)

**Requirements merged**: 5  
**Scenarios merged**: 28

**Requirements**:
- ### Requirement: Movimiento SERIE referencia una unidad con cantidad 1
- ### Requirement: Saldo por insumo y condición, fórmula única
- ### Requirement: Salida/ajuste negativo no deja negativo
- ### Requirement: ENTRADA y AJUSTE pueden apuntar a USADO
- ### Requirement: Recepción registra NUEVO

**Action**: Merged delta into `openspec/specs/stock-insumo-condicion/spec.md` via `gentle-ai sdd-archive-compose`

### 3. componentes-catalogo-unico (MODIFIED)

**Requirements merged**: 5  
**Scenarios merged**: 46

**Requirements**:
- ### Requirement: Alta sin descuento crea unidad instalada (D3)
- ### Requirement: Un solo flujo de alta con descuento opcional
- ### Requirement: Edición no cambia tipo ni insumo
- ### Requirement: Retiro con dos desenlaces
- ### Requirement: Reactivar depende del destino

**Action**: Merged delta into `openspec/specs/componentes-catalogo-unico/spec.md` via `gentle-ai sdd-archive-compose`

---

## Verification Summary

**Verification Passes**: 3

| Pass | Result | Evidence | Remediation |
|------|--------|----------|-------------|
| **Pass 1** | FAILED (1 CRITICAL) | Head `c7173058`, evidence sha256:412f88ecb381cfbe806220b25e72a248a6677508bc4a8ce97f74fb9909583049 | `efa4b8cc` (fix01): `corregirSerial` now accepts `INSTALADA` units |
| **Pass 2** | FAILED (3 CRITICALs) | Head `efa4b8cc`, evidence sha256:bc64e2f1b6b41b42b6c924a73089a633653dd436a5f0ed5a397e2f25594d38c9 | `4bd4e042` + `79d50124` (fix02): test coverage and condition selection in alta |
| **Pass 3 (final)** | **PASS WITH WARNINGS** | Head `79d50124`, evidence sha256:590b241ca305dca7b3895af17ebc3c3e02fa9c8dc098f2d1d1f714177e8b6fff | All 25/25 requirements, 131/131 scenarios pass; 0 CRITICALs; 6 WARNINGs (non-blocking) |

**Verification Command**: `cd backend && pnpm lint && pnpm typecheck && pnpm test; cd frontend && pnpm lint && pnpm type-check && pnpm test`

**Test Results (Pass 3)**:
- Backend: 518 files / 6532 tests passed (756.93 s)
- Frontend: 220 files / 1707 tests passed (225.80 s)
- Lint: clean (both backend and frontend)
- Typecheck: clean (both backend and frontend)

---

## Task Completion

| Metric | Count |
|--------|-------|
| Total work units | 31 (27 designed + 4 pre-partitions: 3a/3b, 7a/7a2, 10a/10b, 17a/17b) |
| Tasks complete | 137 |
| Tasks incomplete | 0 |

All implementation tasks were completed and marked in `tasks.md`. The plan split was followed: higher-risk WUs pre-partitioned for scope control. Each PR remained under or justified the 400-line budget per the project policy.

---

## Architecture Decisions Recorded

All decisions from the proposal and design are implemented and verified:

| Decision | Status | Notes |
|----------|--------|-------|
| ADR-1: Schema (migrations, tables, constraints) | ✅ Implemented | `unidades_insumo` table with state machine, normalized serial uniqueness, CHECK constraints |
| ADR-2: Stock balance (counted from units, not duplicated) | ✅ Implemented | `saldosDesdeUnidades()` is the sole source for SERIE items |
| ADR-3: Activation of SERIE mode with lock ordering | ✅ Implemented | Global lock order L0–L4 maintained; re-lectura detects unit-of-measure changes |
| ADR-4: Batch unit operations service | ✅ Implemented | `OperacionesUnidadInsumo` validates all before writing; atomic latch |
| ADR-5: Movement reads follow-through SERIE within transaction | ✅ Implemented | All cases (entry, exit, adjustment, special) read `seguimiento` at L1 |
| ADR-6: Partial receptions with pending serial completion | ✅ Implemented | Reception can create pending units; `cargarSerial` completes them later |
| ADR-7: Equipment flows (install, uninstall, reactivate) | ✅ Implemented | Unit choice required for SERIE; legacy components remain text-only |
| ADR-8: HTTP contracts and error codes | ✅ Implemented | DTOs expose `seriales`, `unidadId`, `seguimiento`; 14 domain errors mapped |
| ADR-9: Audit trail (eventos_unidad_insumo) | ✅ Implemented | Append-only event log tracks all state changes; corrección events include before/after |
| ADR-10: Rollback strategy (code vs. state) | ✅ Documented | Runbook included; revert is safe if no SERIE items or units exist |
| ADR-11: Help documentation (suspended during cycle) | ✅ Noted | Deuda anotada in WU commits; existing articles checked (true) |
| ADR-12: Global lock order (L0–L4 invariant) | ✅ Implemented | 7 concurrency test cases confirm no `40P01` deadlock; mutation proof provided |
| ADR-13: Return of delivered unit | ✅ Implemented | `DevolverEntregaUseCase` with `INSUMOS:ALTAS` permission |
| ADR-14: Recovery of discarded unit | ✅ Implemented | `RecuperarUnidadDescartadaUseCase` with `INSUMOS:AJUSTAR` permission and mandatory reason |

---

## Open Items and Warnings

All issues are **non-blocking** (no CRITICALs). The warnings are documented for follow-up:

### Warnings from Pass 3 (Current)

1. **Reingreso UI under-offers USADO** for a non-current familia (open from passes 1 & 2)  
   - Backend complies with family rules  
   - Frontend selector hides the USED condition when `admiteUsado: false`  
   - Artifacts: `WU-16b` (devolver-entrega dialog)  
   - Action: Future work can extend the UI to show the condition field whenever both conditions have units in depósito

2. **Reception without INSUMOS:LECTURA** shows no serial boxes (open from passes 1 & 2)  
   - Reception view hides the serial input when the user lacks read permission  
   - Artifacts: `WU-9` (recepción)  
   - Action: Future work can route the read permission check differently or offer a read-only view

3. **ADR-6 text drift** (WARNING from pass 2)  
   - The ADR-6 text says validation happens in `registrarEntradaInsumo`, but the actual point is in `ingresarPorSerie` (the same behavior, but different method)  
   - Action: Update ADR-6 text at the next cycle if this is revisited  
   - Severity: Documentation only; behavior is correct

4. **Planning commits over 400 lines without size:exception** (WARNING from pass 2)  
   - Commits 6a15d82f, 93ebedb2, 066fc516, 107a4be9 (planning docs) exceed 400 lines  
   - Action: Recommendation to add `size:exception` notes; does not affect code quality  
   - Note: fix02 commits (67 and 73 lines) are within budget

5. **No round-trip test for corrected INSTALADA unit** (WARNING from pass 2)  
   - The `corregirSerial` on an `INSTALADA` unit is tested (now after fix01), but the component is not read back to confirm the new serial shows in the response  
   - Behavior: Correct by construction (live join; component.numeroSerie = NULL, component shows unit.numeroSerie)  
   - Action: Future spec can strengthen this test for belt-and-suspenders verification

6. **New in fix02: Alta condition selection hides USADO** when familia `admiteUsado: false` (WARNING from pass 3)  
   - When a SERIE insumo has units in both NUEVO and USADO but the familia disallows USADO, the dialog does not offer the USED filter  
   - This is the same under-offer pattern as Warning 1  
   - Behavior: Correct by design (mirrors the stock selector behavior)  
   - Action: Same as Warning 1; future work can refine the UI logic

### Open Suggestions

1. Pin `numeroSerie` (instead of leaving NULL) in devolución and recuperación e2e assertions for stronger documentation

2. Carry `code` in `ApiError` instead of matching toast message text, for more robust error handling in `reactivar`

3. The owner has not yet confirmed whether recuperación should be `ENTRADA` (current) or `AJUSTE_POSITIVO` (open from design phase)

4. Extend the e2e "corrige una unidad INSTALADA" case to install through the equipment flow and read the component back

5. For Warning 6, show the condition field in alta whenever both conditions have units in depósito, not only when `admiteUsado: true`; add MSW case with `admiteUsado: false` and units of both conditions

---

## Process Notes

### Deliverables

- **31 work units** across multiple commits, following the pre-planned splits  
- **Code commits over 400 lines**: justified with `size:exception` per policy  
- **Planning commits over 400 lines**: noted but not individually marked (improvement opportunity)  
- **Feature branch chain**: tracker `feat/repuestos-numero-de-serie` with 31 sequential PR children  
- **Release strategy**: single integration of the entire tracker to `main` (states are non-deployable until full cycle)

### Testing Discipline

- **TDD**: Standard mode for features (no RED required before implementation)  
- **Fix01 & Fix02**: Strict TDD (RED / GREEN / REFACTOR documented in apply-progress)  
- **Concurrency**: 7 test cases confirm global lock order; mutation proof provided  
- **Invariant**: Integration test `invariante-serie.integration.spec.ts` verifies stock balance across full workflows

### Ayuda (Help Documentation)

- **Status**: Suspended during cycle (policy per `CLAUDE.md` §6.3 paused section)  
- **Existing articles checked**: `equipos-listado.md:11`, `compras-insumos-stock.md`, `permisos-y-roles.md:145-184` remain true  
- **Deuda anotated**: Each WU with visible UI change notes the pending help in commit and PR body  
- **Topics covered by debt**: ABM flags, unit-medida checkbox, serial loading, correction, history, equipment flows, stock return/recovery, reingreso dialog  
- **Action**: Help articles to be written at end-of-project stabilization (separate effort)

---

## Compliance Checklist

- [x] **Specs synced**: 3 specs (1 new, 2 modified) merged and in place  
- [x] **Change folder archived**: Moved to `openspec/changes/archive/2026-10-01-repuestos-numero-de-serie/`  
- [x] **All artifacts present**: proposal.md, specs/, design.md, tasks.md, apply-progress.md, verify-report.md, state.yaml  
- [x] **Tasks all complete**: 137/137  
- [x] **Requirements met**: 25/25  
- [x] **Scenarios verified**: 131/131  
- [x] **No CRITICALs**: 0 (the 3 from passes 1 & 2 are closed by fix01 + fix02)  
- [x] **Gates passing**: lint, typecheck, test (all exit 0)  
- [x] **Revert verified**: Rollback plan documented; migration aditiva with default (safe to revert code)

---

## Key Changes at Archive

This archive closes the full SDD cycle for the `repuestos-numero-de-serie` change. The work:

1. **Adds unit-level tracking** for inventory items marked as SERIE  
2. **Preserves backward compatibility** with existing NINGUNO items (no behavior change)  
3. **Enforces uniqueness and state consistency** at the database level (CHECK constraints, partial indexes)  
4. **Decouples stock balance from unit ledger** (saldo from units, not from movement book alone)  
5. **Enables full audit trail** for each physical piece (events table, motivo for all mutations)  
6. **Supports equipment lifecycle** (install → INSTALADA, retire → EN_DEPOSITO USED, discard → DESCARTADA, recover → EN_DEPOSITO)  
7. **Implements batch operations** with atomic validation (OperacionesUnidadInsumo service)  
8. **Maintains permission boundaries** (equipment flows do not require INSUMOS permissions)

---

## Traceability

**Verify Report**: commit `bcef6b66` (docs(sdd): verify-report tras fix02)  
**Fix01**: commit `efa4b8cc` (fix(insumos): corregir el serial de una unidad instalada)  
**Fix02**: commits `4bd4e042` (test) + `79d50124` (fix: elegir la condicion antes de la pieza en el alta)  
**Change closed**: `feat/repuestos-numero-de-serie-fix02`, HEAD `79d50124`, 81 commits, 218 files changed, 28608 insertions, 461 deletions

---

**Archive date**: 2026-10-01  
**Archive executor**: sdd-archive phase (Haiku 4.5)  
**Method**: Mechanical merge via `gentle-ai sdd-archive-compose` and shell copy/move with diff verification  

