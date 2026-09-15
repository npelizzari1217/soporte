# Archive Report: sesion-utc-y-backfill-de-fechas (Issue #173)

**Date**: 2026-09-15  
**Change**: Sesión UTC en Postgres y backfill de las fechas corridas 3h  
**Cycle**: SDD bugfix — strict TDD enforced  
**Status**: ARCHIVED — all work complete, verified in production

---

## Final State Authority

This archive report records the state of the change at close. Work continued after intermediate artifacts (`apply-progress.md`, `verify-report.md`) were persisted: evidence was gathered in ronda 3 (verify), and the fix was deployed to production and validated the same day. The facts below rank by authority (highest first):

1. **Persisted tasks artifact**: All 38/38 tasks marked `[x]` complete in `tasks.md`
2. **Production evidence (2026-09-15)**: Fix deployed, all 5 databases confirmed UTC, backfill marker shows 1610 rows corrected
3. **Verify report ronda 3** (same day, post-production): All 7 requirements and 8 scenarios pass, 5137 tests green, build clean

When a higher-ranked source says done/fixed/resolved and a lower-ranked snapshot says pending/blocked/open, the final state is reported and the fix is cited (commit/evidence path), not the stale claim.

---

## Cycle Summary

**Type**: Bugfix (Prisma Date serialization + 3-hour time zone corruption)  
**Scope**: Session UTC fix + atomic backfill of Prisma-written `timestamptz` across all bases  
**Work Units**: 6 (WU1–WU6, containing 38 implementation tasks)

| Metric | Value |
|--------|-------|
| Tasks Total | 38 |
| Tasks Complete | 38 |
| Requirements (R1–R7) | 7/7 verified |
| Scenarios | 8/8 verified |
| Test Files | 7 (51 tests total: 31 unit, 20 integration, 0 e2e) |
| Coverage | 100% line / 90% branch on modified production files |
| Build | ✅ Exit 0 (typecheck + lint) |
| Test Suite | ✅ Exit 0 (5137 passed, 431 files) |
| Verify | ✅ PASS (ronda 3 — see below for ronda 1–2 progression) |

---

## Verification Progression

### Ronda 1
- R7 initially without evidence → identified coverage gap
- Corrective action: added two integration tests (`[R7]` master, `[4.4/R7]` tenant) with full audit logic

### Ronda 2
- Two CRITICAL findings:
  - `R7-sin-evidencia` — closed by R7 integration tests
  - `R3-r4-retry-path-unproved` — closed by reproducing the retry path in both schemas
- Result: `requirements 5/7`, `scenarios 5/8`
- Corrective action: regenerated the retry scenario tests with real SQL migration

### Ronda 3 (Production Validated)
- **Result**: ✅ `requirements 7/7`, `scenarios 8/8`, blockers: 0, critical_findings: 0
- **Evidence**: `verify-report.md` (ronda 3), commit `8ed6942`
- **Production Validation** (2026-09-15):
  - Fix deployed 06:39 UTC
  - Backfill marker `_utc_backfill_aplicado` recorded in all 5 databases:
    - `soporte_master`: 1030 rows corrected
    - `tenant_1`: 268 rows corrected
    - `tenant_2`: 240 rows corrected
    - `tenant_3`: 36 rows corrected
    - `tenant_4`: 36 rows corrected
  - **Total**: 1610 rows corrected (aligns with spec scenario R3)
  - **No privilege errors, no deployment incidents**
  - **Session validation**: `SHOW timezone` returns `UTC` on new connections to all 5 bases
  - **Round-trip validation**: Timestamp written at 11:12:32 local (UTC), read back correctly without +3h offset

---

## Artifacts Archived

All artifacts moved as a unit to `openspec/changes/archive/2026-09-15-sesion-utc-y-backfill-de-fechas/`:

- ✅ `proposal.md` — change intent, scope, capabilities (8.1 KB, 162 lines)
- ✅ `exploration.md` — codebase investigation, root-cause analysis (12.1 KB, 376 lines)
- ✅ `design.md` — 7 ADRs (architectural decisions), technical approach (32.1 KB, 880 lines)
- ✅ `tasks.md` — 6 work units × 6–7 tasks = 38 total, all `[x]` complete (33.2 KB, 876 lines)
- ✅ `apply-progress.md` — implementation narrative, TDD evidence table (9.6 KB, 282 lines)
- ✅ `verify-report.md` — ronda 3 findings, spec compliance matrix, production validation (22.9 KB, 335 lines)
- ✅ `specs/fechas-sesion-utc/spec.md` — 7 requirements, 8 scenarios, out-of-scope, technical notes (8.1 KB, 147 lines)
- ✅ `state.yaml` — SDD state DAG (0.6 KB, 8 lines)

**Spec Sync Result**: New domain `fechas-sesion-utc` added to `openspec/specs/` (main specs). No existing specs were merged, modified, or removed — this is additive capacity.

---

## Mechanical Verification

### Spec Copy (Delta → Main)
```bash
source: openspec/changes/sesion-utc-y-backfill-de-fechas/specs/fechas-sesion-utc/spec.md
target: openspec/specs/fechas-sesion-utc/spec.md
diff:   (empty — byte-identical)
status: ✅ PASS
```

### Archive Move (Tracked Folder → Archive)
```bash
source:      openspec/changes/sesion-utc-y-backfill-de-fechas
destination: openspec/changes/archive/2026-09-15-sesion-utc-y-backfill-de-fechas
method:      git mv (tracked folder)
diff:        (empty — byte-identical, archive-report additive-only)
status:      ✅ PASS
```

All archival copy/move operations verified with mandatory `diff -r` readbacks. No truncation, no alteration. Zero differences between pre-move snapshot and archived folder (excluding additive archive-report file).

---

## Open Warnings Carried Forward

The verify report (ronda 3) identified three WARNING findings that do NOT block archive but warrant operational closure:

### WARNING-1: Spec Witness Mismatch (Informational)
**Claim**: R1 scenario "Tickets del barrido preventivo se leen en la hora del cron" assumes `tickets.created_at DEFAULT clock_timestamp()`.  
**Fact**: `tickets.created_at` is `DEFAULT CURRENT_TIMESTAMP` in schema (`migration.sql:88`).  
**Mitigation**: Test `[R1/R7]` validates the exact mechanism on a real `clock_timestamp()` column (`unidades_medida`), and design declares the fix applies uniformly to all 44 tables. No functional gap.  
**Recommendation**: Update scenario witness in archive or file a follow-up spec correction.

### WARNING-2: ADR-7 Implementation Divergence (Design Strength)
**Claim**: R6 scenario prescribes `SET TIME ZONE 'America/Sao_Paulo'` + `RESET TIME ZONE`.  
**Fact**: Implemented as `ALTER DATABASE <ephemeral-tenant> SET timezone TO 'UTC'` (ADR-7), which tests the full connection string chain, not just SQL expression.  
**Impact**: Stronger than spec; no requirement violation (adversarial RED/GREEN cycle confirms).  
**Recommendation**: Align R6 text with ADR-7 in archive or note as "strengthened implementation".

### WARNING-3: R7 Production Audit Pending (Operational)
**Claim**: Three temporal integrity invariants must hold post-fix and post-backfill.  
**Status**: Verified at code level (integration tests on real Postgres + real SQL migration) across both schemas (master and tenant). NOT audited against 5 production databases post-deployment.  
**State**: Backfill marker and timestamp validation confirm the fix landed; invariant audit is residual operational closure.  
**Recommendation** (three queries, one per invariant, run against production):
```sql
-- Invariant 1: updated_at not more than 1 second before created_at
SELECT count(*) FROM <table> WHERE updated_at < created_at - INTERVAL '1 second';

-- Invariant 2: movimientos_insumo.created_at not before parent insumo.created_at
SELECT count(*) FROM movimientos_insumo m 
  JOIN insumos i ON i.id = m.insumo_id 
  WHERE m.created_at < i.created_at;

-- Invariant 3: no future dates
SELECT count(*) FROM <table> WHERE created_at > now();
```
Run per schema (master once, tenant once per active database). Expected: zero rows for all queries.

---

## Other Residual Notes

### Help Article Debt (Paused Since 2026-09-07)
This cycle is **internal** (database migrations, admin script, driver-level change). No user-facing UI/UX/flow changes.  
Help article updates are in pause by decision. Debt annotation: "Ayuda: sin deuda" in commit messages.  
Impact: None; Help remains current.

### TDD Cycle Evidence
Per strict TDD mode (enforced for bugfixes), the apply phase delivered:
- RED validated (observed failure messages for 2 integration tests)
- GREEN verified (both tests pass post-fix)
- REFACTOR applied (code review, cyclomatic complexity OK)
- Triangulation measured (51 total tests; 31 unit, 20 integration)
- Safety net confirmed (full `pnpm test` run twice, 5137 green)

Detail in `apply-progress.md:74-79` and inline evidence in `tasks.md` (WU1–WU5 RED notes).

### Rollback Preparation (Pre-Deployment)
**Code Rollback Point**: Commit `3f6e63d` (pre-fix state)  
**Data Backup**: `C:\soporte\backups\utc-backfill-20260915-063946` (full dump, pre-deploy)  
Both documented in production runbook and deploy script `predeploy-dump.ps1` (new script, recorded in `~/proyectos/CLAUDE.md` table).

---

## Source of Truth Update

Main specs now include:

| Domain | Path | Change |
|--------|------|--------|
| `fechas-sesion-utc` | `openspec/specs/fechas-sesion-utc/spec.md` | New (7 requirements, 8 scenarios) |

No existing specs were modified, removed, or renamed.

---

## Task Completion Gate (Final Check)

✅ **All implementation tasks marked complete**  
- Tasks file: `openspec/changes/archive/2026-09-15-sesion-utc-y-backfill-de-fechas/tasks.md`
- Checked count: 38/38
- Unchecked count: 0/0
- Gate status: PASS

---

## SDD Cycle Closed

✅ **Proposal** — accepted intent and scope  
✅ **Exploration** — root cause isolated (Prisma adapter bug)  
✅ **Specs** — 7 requirements, 8 scenarios written and verified  
✅ **Design** — 7 architectural decisions documented, reviewed  
✅ **Tasks** — 38 tasks defined, estimated, grouped into 6 work units  
✅ **Apply** — all tasks implemented with strict TDD evidence  
✅ **Verify** — ronda 3 PASS, 7/7 requirements, 8/8 scenarios, 0 blockers, 0 critical  
✅ **Production** — deployed 2026-09-15, 1610 rows corrected, 5 bases validated  
✅ **Archive** — all artifacts moved, specs synced, mechanical verification complete  

The change has been fully planned, implemented, verified, and archived. No further work on this change is required. The SDD cycle is **complete and closed**.

---

## Next Steps

No follow-up changes required from this cycle. The fix is stable in production with rollback preparation documented.

If a follow-up is needed (e.g., spec witness correction as per WARNING-1, or operational invariant audit as per WARNING-3), those would be separate SDD cycles and should reference this archive report by change name and archive date.

---

## Addendum post-archivo: R7 auditado contra producción (2026-09-15)

El informe de arriba deja la auditoría de R7 como acción operativa pendiente. **Se corrió el
mismo día, después de archivar, y cerró en verde.** Este addendum existe para que el artefacto
no siga declarando pendiente algo que ya se hizo.

Las tres invariantes se evaluaron **catalogadas desde `information_schema`** — sin hardcodear
tablas, el mismo criterio que usa el `migration.sql` del backfill — sobre las **5 bases de
producción**:

| Base | A: `updated_at` anterior a `created_at` en más de 1 s | B: `movimientos_insumo.created_at` anterior al del insumo padre | C: fecha `> now()` | tablas con `created_at` |
|---|:--:|:--:|:--:|:--:|
| `soporte_master` | **0** | n/a — no tiene `movimientos_insumo` | **0** | 12 |
| `soporte_019fdc6444ab7f…` | **0** | **0** | **0** | 27 |
| `soporte_019fdc673ebb72…` | **0** | **0** | **0** | 27 |
| `soporte_01a09fb06f967d…` | **0** | **0** | **0** | 32 |
| `soporte_01a09fb2c81672…` | **0** | **0** | **0** | 32 |

**130 tablas auditadas, cero violaciones.** El estado de datos posterior al fix y al backfill
cumple las tres invariantes que R7 declara.

Consultas usadas, para reproducir: invariante A
`extract(epoch from (created_at - updated_at)) > 1` por tabla; invariante B
`SELECT count(*) FROM movimientos_insumo m JOIN insumos i ON i.id = m.insumo_id WHERE m.created_at < i.created_at`;
invariante C `created_at > now()` por tabla. Las A y C se aplican por catálogo vía
`query_to_xml(format(...))` sobre toda tabla `BASE TABLE` de `public` con la columna
`timestamptz` correspondiente.

**Con esto queda cerrada la WARNING-3 del verify de ronda 3.** Las otras dos advertencias de
texto de spec (el testigo de R1 que no existe en el schema, y R6 describiendo un mecanismo más
débil que el implementado) siguen abiertas como trabajo de spec, no de código.
