# Archive Report: reporte-stock-insumos

**Archived**: 2026-10-01  
**Change**: reporte-stock-insumos  
**Branch**: feat/reporte-stock-insumos-fix01  
**Status**: Complete — ready for merge to main  

---

## Final State

### Verification

**Two passes completed.**

- **Pass 1**: FAILED with 1 CRITICAL blocker at evidence `sha256:f645f122f7bd4951d47766ced56264dad04430e881feec7973460e428ec41ee4` (commit `327543df`). Two `as never` casts in `reporte-stock-insumos.controller.spec.ts` raised the specs casts ratchet from 666 → 668 (beyond base).
- **Pass 2**: PASS WITH WARNINGS at evidence `sha256:f03bd00801012f5acb1d60419fa1bb680d6e0b578e6361d3df10e77134a4b236` (commit `47a8558a`, report commit `c38dc42f`). Zero CRITICAL blockers. All 11 requirements verified. All 35 scenarios compliant. Fix applied in commit `47a8558a`: controller spec now builds real use cases with `unstubbed(...)` collaborators and spies `execute` instead of casting.

**Completeness**:
- Requirements: 11/11
- Scenarios: 35/35
- Tasks: 44/44 complete (per `sdd-apply` and `sdd-status`)

### Build and Test Gates at Close

| Gate | Command | Exit | Result |
|---|---|---|---|
| Backend lint | `cd backend && pnpm lint` | 0 | zero errors |
| Backend typecheck | `cd backend && pnpm typecheck` | 0 | clean |
| Backend build | `cd backend && pnpm build` | 0 | clean |
| Backend tests | `cd backend && pnpm test` | 0 | 526 files / 6609 tests passed |
| Frontend lint | `cd frontend && pnpm lint` | 0 | clean |
| Frontend typecheck | `cd frontend && pnpm type-check` | 0 | clean |
| Frontend build | `cd frontend && pnpm build` | 0 | route `/insumos/reporte-stock` built |
| Frontend tests | `cd frontend && pnpm test` | 0 | 225 files / 1734 tests passed |
| Roadmap freshness | `node scripts/check-roadmap-fresco.mjs` | 0 | "El roadmap esta fresco" (3 decisions declared) |
| Casts ratchet | `node scripts/check-casts-en-specs.mjs` | 0 | 666 in 121 files (base 666 in 121): "El ratchet se sostiene" |
| Gate coverage | `node scripts/check-gate-coverage.mjs` | 0 | 2/2 projects covered |

All gates green. No migration. No schema changes.

### Implementation Chain

**Branches**: 6 work units (wu01 through wu06-2) plus fix01 on `feat/reporte-stock-insumos` (tracker).

**Size tracking**: Feature Branch Chain delivery. Three commits exceeded 400 lines (declared with `size:exception`):
- Commit `7b3bd4f6`: 455 lines (backend repositories + integration specs)
- Commit `520e9b66`: 470 lines (backend e2e spec with integration + HTTP layer)
- WU-6 view commit: 469 lines (frontend view + tests in one atomic pair)

All others fit the 400-line budget. Code and tests committed together per policy (split on clean seams where necessary for line count; no separation of code from tests).

### Roadmap Closure

**Requirement**: `docs/roadmap-comercial.md`, "Decisiones de producto ya cerradas" > "Reporte de stock"

The point is declared **Cumplida** (completed). All sub-bullets met:
- ✓ Current stock snapshot only (no movements by period, no serial detail)
- ✓ One row per item with standardized columns (code, name, family, type, unit, NUEVO, USADO, total, reorder point, reorder state)
- ✓ Filters: family, type, below minimum; disabled items with state column; zero-stock filter; no valuation
- ✓ Seen and exported by `INSUMOS:LECTURA` holders
- ✓ CSV export with shared `armarExportCsv` and "Exportar a Excel" button
- ✓ Screen at `/insumos/reporte-stock` linked from Insumos section
- ✓ Decimal comma, no decimals for integer units; negative values as numbers and highlighted on screen

Verification checks (WU-6 tasks 6.6 and 6.7) confirmed the point meets every requirement without deviations.

### Known Issues and Carry-Forwards

**Blockers**: None.

**Warnings** (non-blocking):

- **W1 (residual)**: `state.yaml` `tasks_progress` was empty (`completed: []`, `pending: []`) after pass 1; reconciled in this archive to `completed: 44`, `pending: 0`. Field not read by native status, routing unaffected.
- **W2 (design deviation)**: R9 comparison integration (`reporte-stock-coincide-con-ficha.integration.spec.ts`) runs on shared `soporte_tenant_test` with prefixed fixtures instead of ephemeral tenant with `dropDatabase` hygiene. Matches repo pattern of 20+ integration specs; breaks no scenario; declared in `verify-report` and accepted.

**Suggestions** (open, non-blocking):

1. **S1**: `cantidadCsv` uses `String(n)` / `toFixed(2)`, which yield exponent notation for |n| >= 1e21. Unreachable with Prisma `Decimal` quantities; a guard or test would make the invariant airtight.
2. **S2**: Drop either the SQL `orderBy codigo` or the JS re-sort, or document that the JS code-unit order is authoritative.
3. **S3**: Use a shared UI checkbox component (if one exists) for the two boolean filters instead of native inputs.
4. **S4**: `CEROS_LIBRO = {...} as SumasPorCondicionYTipo` is an unnecessary cast in production code.
5. **S5**: Pin the 422 message text ("exportación demasiado grande") through HTTP in the e2e spec.

**Ayuda (KB) Debt** (paused per project policy): Two articles needed (not written in this cycle per suspension decision):
- Screen "Reporte de stock" (filters, columns, reorder state, negative values highlighted)
- Export button "Exportar a Excel"

Debt annotated in commits and PRs (WU-5/6).

---

## Specs Synced to Main

- **Created**: `openspec/specs/reporte-stock-insumos/spec.md`
  - 11 requirements (R1–R11)
  - 35 scenarios (all mapped to implementation tasks)
  - Source: delta spec converted to clean format (removed "ADDED Requirements" heading, organized under "Requirements")

No existing main spec was modified (new capability, new domain).

---

## Archive Closure

**Change folder moved**:  
`openspec/changes/reporte-stock-insumos/` → `openspec/changes/archive/2026-10-01-reporte-stock-insumos/`

**Artifacts retained in archive**:
- `proposal.md` — product intent and scope
- `specs/reporte-stock-insumos/spec.md` — delta (also synced to main)
- `design.md` — ADR-1 through ADR-6, testing strategy, deviations matrix
- `tasks.md` — 44 implementation tasks with scenario map
- `apply-progress.md` — 6 WUs, all complete
- `verify-report.md` — pass 1 FAILED, pass 2 PASS WITH WARNINGS
- `state.yaml` — phase: archived, 44/44 tasks complete

---

## Key Learnings

1. The `node scripts/check-casts-en-specs.mjs` gate runs separately from ESLint during verification; include it explicitly in WU verification commands for backend (it is not part of `pnpm lint`).
2. Pass-1 blocker (casts ratchet) required only a spec file change and `state.yaml` reconciliation; production code was correct but test stubs masked the real behavior.
3. Feature-branch-chain delivery with 400-line budget enforced three `size:exception` declarations; all three justified by atomic code-test pairs.

---

## SDD Cycle Status

✓ Exploration  
✓ Proposal  
✓ Specification  
✓ Design  
✓ Tasks  
✓ Apply (6 WUs + fix01)  
✓ Verify (pass 2 PASS WITH WARNINGS)  
✓ Archive (this report)  

**Result**: Cycle complete. Change ready for merge to `main`.
