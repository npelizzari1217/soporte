# Archive Report: baja-equipo-completo

**Change**: baja-equipo-completo  
**Archive Date**: 2026-10-01  
**Branch**: feat/baja-equipo-completo-wu17  
**HEAD Commit**: 061409e3  
**Artifact Store**: openspec  

---

## Executive Summary

The `baja-equipo-completo` (full equipment deactivation) feature has been fully planned, implemented, verified, and archived. All 115 tasks completed with zero implementation gaps. Verification: **pass_with_warnings** (70/70 scenarios, 19/19 requirements, zero CRITICAL issues). Production preconditions checked: 8 tenants, 0 orphaned data. Roadmap decision "Baja de equipo completo" declared **Cumplida** (verified true).

---

## Final State Authority

### Verification Status (per verify-report, 2026-10-01)

| Field | Value |
|---|---|
| Verdict | pass_with_warnings |
| Evidence revision | sha256:367e8d95c2ab770d8f9fe6c43bd611cbb5ed6cf7ac22eb942bee58c7530c6537 |
| Requirements passed | 19/19 |
| Scenarios passed | 70/70 |
| CRITICAL findings | 0 |
| Blockers | 0 |
| Tests | 8674 passed (551 backend files, 227 frontend files) |
| Build | clean (lint, typecheck, all gates) |

### Task Completion (Task Completion Gate)

All 115 implementation tasks marked complete and verified:
- WU-1 through WU-17 all checked: `[x]`
- No unchecked implementation tasks
- apply-progress.md records all completions per WU

### Roadmap Decision Closure

Roadmap entry: `docs/roadmap-comercial.md`, "Decisiones de producto ya cerradas", viñeta "Baja de equipo completo"

| Sub-bullet | Mapped to | Status |
|---|---|---|
| Two options, all or nothing; same legend | R1-R4 | Verified true |
| Motive = category + free text; "otra" requires text | R5 | Verified true |
| Definitive, not undoable | R8 | Verified true |
| Open tickets: allowed with count warning | R10 | Verified true |
| Listed with "Baja", hidden by default, ficha/history visible, no add/edit | R8, R11 | Verified true |
| Permission `EQUIPOS:BORRADO`, same as single-piece retire | R12 | Verified true |
| Discard-all leaves no negative stock entry | R3 | Verified true |
| Current delete only for mistaken equipos; blocked with active pieces; button renamed | R13 | Verified true |
| Return-to-stock asks serial of legacy SERIE pieces; deleted insumo stops and is reported | R6, R7 | Verified true |
| Confirmation: summary; type the name to discard | R14 | Verified true |

**Declaration**: Cumplida — all sub-bullets verified against test implementations; no deviations.

---

## Specification Merge

### New Capability: equipos-baja-completa

**Action**: Created `openspec/specs/equipos-baja-completa/spec.md`

**Requirements**: 17 (R1–R17)
- R1: Validation and multi-destination coordination
- R2: Return-to-stock piece handling (NINGUNO, SERIE, disabled insumos)
- R3: Discard options and stock integrity
- R4: Legend composition and length
- R5: Motive category and free text validation
- R6: Atomicity and piece-level error handling
- R7: Legacy SERIE handling and serial management
- R8: Equipment record and finality
- R9: Edge cases (no pieces, already deactivated)
- R10: Open ticket warnings
- R11: List visibility, filter, ficha, operation guards
- R12: Permission requirements
- R13: DELETE endpoint (bugfix) and single-piece retire distinction
- R14: Confirmation dialog UI
- R15–R17: Concurrency, per-piece destinations

**Scenarios**: 57 (comprehensive coverage of all branches and error paths)

**Mechanical copy verified**: Source and destination byte-identical.

### Modified Capability: unidades-insumo-serie

**Action**: Merged delta into `openspec/specs/unidades-insumo-serie/spec.md`

**Requirement Modified**: "Las operaciones de unidad son reutilizables en lote"

**Change**: Operations (return-to-depot, discard) now MUST be callable in batch within a single transaction, with total rollback on any failure and ordering consistent with installs. Baja de equipo completo (equipos-baja-completa spec) consumes these; baja moves only INSTALADA units to EN_DEPOSITO USADO or DESCARTADA, requires each unit to be installed in the equipment being deactivated. (Previously: SHOULD be reutilizable for a future cycle, included install operations, and prohibited implementing full equipment deactivation.)

**Scenarios affected**: 4 (batch transaction handling, failure recovery, concurrent install compatibility)

**Merge tool**: gentle-ai sdd-archive-compose (zero exit, composition completed)

### Modified Capability: componentes-catalogo-unico

**Action**: Merged delta into `openspec/specs/componentes-catalogo-unico/spec.md`

**Requirement Modified**: "Reactivar un componente depende del destino de su retiro"

**Change**: Reactivation now blocked for components retired with STOCK_USADO destination (to prevent double-counting). DESCARTE and legacy retires (no destination) remain reactivatable. When reactivating a discarded component with a unit, the unit DESCARTADA MUST return to INSTALADA in the same transaction without movement or stock change. If insumo is no longer SERIE, reactivation is rejected. Component reactivation must verify the unit remains DESCARTADA by that specific component; if the unit recovered, went to another equipment, or was deactivated by other means, rejection without change. Legacy retires without units do not create units. Equipment deactivation (baja de equipo) blocks reactivation entirely regardless of retire destination — the deactivation is definitive. (Previously: no exception for deactivated equipment; components retired with DESCARTE from an inactive equipment could be reactivated.)

**Scenarios affected**: 9 (stock return, discard tracking, unit consistency, deactivated equipment guard)

**Merge tool**: gentle-ai sdd-archive-compose (zero exit, composition completed)

---

## Verification Highlights

### Test Coverage

| Layer | Files | Tests | Result |
|---|---|---|---|
| Backend | 551 | 6903 | Pass |
| Frontend | 227 | 1771 | Pass |
| **Total** | **778** | **8674** | **Pass** |

### Code Gating

- **Lint** (backend ESLint, frontend ESLint): 0 errors, 0 warnings
- **Typecheck** (backend tsc, frontend tsc): 0 errors
- **Casts** (check-casts-en-specs.mjs): 627 casts in 116 files (ratchet preserved; no new casts introduced)
- **Roadmap** (check-roadmap-fresco.mjs): "El roadmap esta fresco" — decision closure validated

### Concurrency & Safety

| Aspect | Evidence |
|---|---|
| Lock ordering | ADR-2 locks (LE, L0–L4) verified by witnesses T1–T8 and mutation tests |
| 409 guard mutation | Central `mismoConjunto` check in `DarDeBajaEquipoUseCase` mutated in verify: 5 concurrency cases turned red, confirming protection |
| Atomicity | Deterministic transactional re-run; on-disk state mutation tested |
| TDD for bugfix (WU-3) | RED reproduced: `eliminar-equipo.use-case.ts` restored to `main` version → 7 tests failed (410 guard, 422 body structure); fix applied → all pass |

### Production Readiness

**Precondition Measurement** (2026-10-01): 8 production tenants checked for orphaned data (units INSTALADA with deleted or deactivated equipment, components with invalid insumo references):
- Result: 0 orphaned records across all tenants
- Migration `20261001120000_equipos_informaticos_baja` applied cleanly

---

## Open Items & Follow-ups

### Warnings (flagged in verify-report)

1. **W1 (Process)**: Three test-only commits took `size:exception` where splitting by describe block was possible (commits 6f6c76f5 634L, ab373eba 628L, 6043f9b5 451L). Each carries documented justification in commit body. Owner to review for future guidance.

2. **W2 (Pre-existing, follow-up)**: `ReactivarComponenteUseCase` reads component outside transaction with upsert `save()` (no CAS). Pre-existing gap not introduced by this change. Follow-up: add CAS on reactivation (`WHERE deleted_at = <read value>`).

### Suggestions (from verify-report)

- **S1**: Ayuda debt remains (new article: full baja flow, renamed delete button, read-only ficha). Correctly annotated under the 2026-09-07 suspension per `CLAUDE.md` of repo.
- **S2**: Consider lightweight HTTP check of 409 body shape in future e2e if controller mapping changes.

### Acceptable Deviations

1. **DELETE /equipos/:id 422 body structure changed**: Now returns `{statusCode, message, code, cantidad}` instead of HTTP-standard message string. Frontend normalizer (`frontend/src/shared/api/normalize.ts`) handles both shapes; covered by e2e test and component test.

2. **409 `EQUIPO_MODIFICADO_DURANTE_LA_BAJA` not tested over HTTP**: Layered coverage sufficient (deterministic integration, controller mapping, frontend handling). HTTP race race would add flakiness without new coverage gain.

3. **Reactivar/Retirar read component outside LE before lock**: Acceptable with residual risk (pre-existing upsert gap noted above). Stale "active" reads are caught by CAS in component retiro or unit operation failing; reactivation path is serialized by LE read.

---

## WU Chain Summary

17 work units (WU-1 through WU-17) delivered in feature-branch-chain topology:

| WU | Goal | Commits | LOC | Status |
|---|---|---|---|---|
| 1 | Migration, schema, entity, mapper, errors | 5 | ~420 | Complete |
| 2 | Equipment repo locks, registrarBaja, save() | 4 | ~380 | Complete |
| 3 | Bugfix: DELETE respects active pieces (STRICT TDD) | 8 | ~420 | Complete + TDD RED verified |
| 4–17 | Insumos service, use-case, HTTP, e2e, frontend | 25 | remainder | Complete |
| **Total** | Full feature + bugfix + 8 integration layers | 47 commits | ~6600 | **Complete** |

**Size:exception commits** (declared in commit bodies per policy):
- 56e8962d (930 lines): WU-1 + schema prep
- 6f6c76f5 (634 lines): WU-12 test suite (split by describe possible)
- ab373eba (628 lines): WU-13 concurrency cases (split by describe possible)
- 8503310e (532 lines): WU-11 HTTP layer
- 1bae20cf (493 lines): WU-16 frontend dialog
- 6043f9b5 (451 lines): Test-only fixture expansion (split by describe possible)
- 97e6e2ed (438 lines): Integration test suite

**Witnesses** (deterministic lock probes): T1–T8 passed; mutations in T4/T6/T7/T8 confirmed lock ordering.

---

## Deliverable Files

### Archived in `openspec/changes/archive/2026-10-01-baja-equipo-completo/`

- proposal.md
- design.md
- specs/equipos-baja-completa/spec.md
- specs/unidades-insumo-serie/spec.md (delta merged into main)
- specs/componentes-catalogo-unico/spec.md (delta merged into main)
- tasks.md (115/115 complete)
- apply-progress.md (all WUs logged)
- verify-report.md (pass_with_warnings, zero CRITICAL)
- state.yaml (phase: archive, tasks: 115/115)
- **archive-report.md** (this file)

### Updated in Main Specs (`openspec/specs/`)

- equipos-baja-completa/spec.md (new, 17 requirements)
- unidades-insumo-serie/spec.md (merged delta)
- componentes-catalogo-unico/spec.md (merged delta)

---

## Closure

The SDD cycle for `baja-equipo-completo` is complete. All phases (proposal, spec, design, tasks, apply, verify) have been executed successfully. No unresolved implementation gaps remain. The change is ready for integration to `main` and deployment.

**Next phase**: ordinary repository policy governs delivery (PR review, merge strategy).
