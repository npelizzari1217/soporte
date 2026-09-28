# Archive Report: horario-laboral-por-cliente

**Date**: 2026-09-29  
**Change**: `horario-laboral-por-cliente`  
**Artifact Store**: openspec  
**Cycle Status**: COMPLETE — PASS WITH WARNINGS

---

## Executive Summary

Horario laboral por cliente has been successfully archived. The cycle implements per-tenant weekly scheduling with a fixed Argentina timezone, completely replacing the deprecated global `CalendarioLaboralDia`. All 12 requirements verified across 20 scenarios. Backend: 5475/5475 tests passed. Frontend: 1562/1562 tests passed. Nine mutations killed, including M4a, M7, and M8. Seven warnings fixed in WU-9 correction commit; two suggestions remain non-blocking (documentation/PR scope, not code).

---

## Artifacts Archived

| Artifact | Location | Exists | Status |
|----------|----------|--------|--------|
| proposal.md | openspec/changes/archive/2026-09-29-horario-laboral-por-cliente/proposal.md | ✅ | Synced |
| spec.md (delta) | openspec/changes/archive/2026-09-29-horario-laboral-por-cliente/specs/horario-laboral-cliente/spec.md | ✅ | Copied to openspec/specs/horario-laboral-cliente/spec.md |
| design.md | openspec/changes/archive/2026-09-29-horario-laboral-por-cliente/design.md | ✅ | Synced |
| tasks.md | openspec/changes/archive/2026-09-29-horario-laboral-por-cliente/tasks.md | ✅ | Synced (W8 fix applied) |
| apply-progress.md | openspec/changes/archive/2026-09-29-horario-laboral-por-cliente/apply-progress.md | ✅ | Synced (W8, S5, S6 fixes applied) |
| verify-report.md | openspec/changes/archive/2026-09-29-horario-laboral-por-cliente/verify-report.md | ✅ | Final report (PASS WITH WARNINGS) |
| state.yaml | openspec/changes/archive/2026-09-29-horario-laboral-por-cliente/state.yaml | ✅ | Synced |

---

## Spec Merge Outcome

**Delta Spec** (new capability): `horario-laboral-cliente`  
**Main Spec**: `openspec/specs/horario-laboral-cliente/spec.md` — Created (zero prior exists)  
**Action**: Mechanical copy (source vs. destination diff: empty)  
**Result**: ✅ PASSED

---

## Work Unit Chain Summary

**17 commits** over `main` (all local):

| Commit | Branch | Purpose | Status |
|--------|--------|---------|--------|
| `10981ed` | planning | Explore + propose | ✅ Complete |
| `8fac082` | wu01 | Table tenant, migration, seed | ✅ Complete |
| `690e547` | wu01b | Deploy precondition + runbook | ✅ Complete |
| `1cd89ae` | wu02 | Domain: VO, errors, constants (size:exception) | ✅ Complete |
| `a9ac266` | wu03 | Swap repository, fail-closed, deprecate master | ✅ Complete |
| `f77fa30` | wu04 | E2E SLA: no-recalc, reprioritization, isolation | ✅ Complete |
| `b28290d` | wu05 | Port write + reemplazar (part a) | ✅ Complete |
| `41902a5` | wu05b | Use cases + specs (part b) | ✅ Complete |
| `2e71fb6` | wu06a | Controller, DTOs, wiring, guards | ✅ Complete |
| `a44b5ce` | wu06b | E2E HTTP: guards + isolation | ✅ Complete |
| `fcd00f6` | wu07a | Frontend: types, api, limits (part a) | ✅ Complete |
| `7249f96` | wu07b | Frontend: schemas (part b) | ✅ Complete |
| `5020b82` | wu07c | Frontend: hooks, nav (part c) | ✅ Complete |
| `2d3ad20` | wu08a-i | Frontend: presentational row | ✅ Complete |
| `f63cb05` | wu08a-ii | Frontend: presentational form (7 rows) | ✅ Complete |
| `7bc037b` | wu08b | Frontend: view, page, nav | ✅ Complete |
| `39af4f1` | wu09 | Correction post-verify (W1-W7, S2, S3) | ✅ Complete |

All splits (WU-5, WU-7, WU-8a) and exceptions (WU-2) follow ownership criterion per `design.md`.

---

## Verification Summary

### Final Requirements & Scenarios (per `verify-report.md`)

| Category | Count | Status |
|----------|-------|--------|
| Requirements | 12/12 | ✅ PASS |
| Scenarios | 20/20 | ✅ PASS |
| Backend tests | 5475/5475 | ✅ PASS |
| Frontend tests | 1562/1562 | ✅ PASS |
| Critical issues | 0 | ✅ PASS |
| Warnings | 7 → 0 | ✅ FIXED (WU-9) |
| Suggestions | 4 | ⚠ NON-BLOCKING |

### Mutations

| Mutation | Status | Evidence |
|----------|--------|----------|
| M1-M9 (including M4a, M7, M8) | ✅ Killed | Final verify-report |
| M7 (dia_semana boundary) | ✅ Killed at runtime | New test case `-1` in `calendario-laboral-dias-cliente-check.integration.spec.ts` (WU-9, W6 fix) |

### Warnings Fixed in WU-9

| ID | Type | Issue | Fix Commit |
|----|------|-------|------------|
| W1 | Real bug | Save OK then fail → edit lost | `use-guardar-horario-laboral.ts`: `setQueryData` before `invalidateQueries` |
| W2 | Gap | E2E used direct update, not use case | `aplicar-sla-horario-cliente.e2e.spec.ts`: use real `GuardarHorarioLaboralUseCase` |
| W3 | Gap | Precondition script missing edge cases | `check-calendario-master-default.spec.ts`: cases for apertura-only, cierre-only |
| W4 | Gap | Dedup logic uncovered | `aplicar-sla-habil-feriados.e2e.spec.ts`: raw insert of date in both sources |
| W5 | Docs | Precondition rationale unclear | `DEPLOY-VPS-runbook.md`, `deploy.ps1`, `check-calendario-master-default.mjs`: clarify seed is fixed, risk is inverse |
| W6 | Gap | Boundary `-1` uncovered | `calendario-laboral-dias-cliente-check.integration.spec.ts`: added `dia_semana = -1` case |
| W7 | Docs | Global calendar comments stale | `prisma_master/schema.prisma:483`, `aplicar-sla.use-case.spec.ts:440`: updated docstrings |

### Suggestions

| ID | Type | Status |
|----|------|--------|
| S1 | Docs | Runbook subsection above VPS table | Non-blocking (documentation scope) |
| S2 | Gap | HTTP edge case `apertura >= cierre` | ✅ FIXED (WU-9) |
| S3 | Gap | Form test mutation for 422/500 | ✅ FIXED (WU-9) |
| S4 | Docs | Ayuda debt note in PR body | Non-blocking (PR scope, paused ayuda writing) |

---

## Wording Fixes Applied (Archive Time)

**W8** (apply-progress.md line 484, tasks.md line 266):  
Rewarded "ningún archivo de WU-1 a WU-8b se toca" to: "ningún commit de WU-1 a WU-8b se reescribe, y los archivos afectados vuelven a su contenido en `7bc037b`"

**S5** (apply-progress.md line 451):  
Updated coverage from "Cubre W1-W7 y S2" to "Cubre W1-W7, S2 y S3"

**S6** (apply-progress.md line 487):  
Replaced stale proof with: "Mutación M7 matada en runtime por el nuevo caso `dia_semana = -1`. Prueba en `verify-report.md`"

**S7** (backend/src/sla/infrastructure/listeners/aplicar-sla-habil-feriados.e2e.spec.ts:230):  
Fixed comment from "El martes está DOS VECES en el union crudo" (logical error: Set cannot count twice) to: "El martes aparece en ambas fuentes... se resuelve a exactamente un día saltado"

---

## Closing Tasks (A.1 / A.2 in tasks.md)

**A.1** — `docs/roadmap-comercial.md` Punto 5:
- ✅ Flipped "horario semanal por cliente" from **Desviación** to **Cumplida** (2026-09-29, branch `feat/horario-laboral-por-cliente-wu09`)
- ✅ Updated deuda técnica row 482 to mark resolved with date and scope
- ✅ Updated deuda técnica row 481 to reflect configurable hourly and holiday management
- ✅ Ran `scripts/check-roadmap-fresco.mjs` → "El roadmap esta fresco" ✅

**A.2** — `openspec/specs/feriados-cliente/spec.md` line 28:
- ✅ Updated citation from "Desviación declarada, no implementada" to "Cumplida. Ciclo `horario-laboral-por-cliente` (2026-09-29)..."

---

## Deploy Readiness

### New Production Precondition

`backend/scripts/check-calendario-master-default.mjs` (read-only) now runs before builds and migrations in `deploy.ps1`. On first production deploy, retire after verification; this check ensures master default is intact before migrating tenants.

### Tenant Migrations

`20260928150000_calendario_laboral_dias_cliente` reaches all existing tenants via `pnpm migrate:tenants` during deploy.

### Master Deprecation

`calendario_laboral_dias` (master) is deprecated, not dropped. Dropping is a follow-up (non-blocking).

---

## Known Non-Blocking Follow-ups

1. **Update `openspec/config.yaml`** `rules.apply.tdd` (stale against 2026-09-10 policy)
2. **Retire precondition step** from `deploy.ps1` after first successful production deploy
3. **Drop deprecated `calendario_laboral_dias` table** from master (follow-up)
4. **Ayuda article** for new `/horario-laboral` screen (writing paused since 2026-09-07)
5. **Ps1-ascii guard** (`ps1-ascii.spec.ts`) lives only on unmerged rotation chain

---

## Archive Integrity

✅ **Mechanical copy verified**: All artifacts moved via `git mv` and `cp` with `diff -r` readback  
✅ **No manual edits of artifact content** during copy (shell only)  
✅ **Spec merge** succeeded with empty diff (new spec, not delta composition)  
✅ **Source folder removed** after move (no orphans)  
✅ **All required artifacts present** in archive folder  
✅ **state.yaml** preserved  
✅ **Commit complete**: Single commit `docs(openspec): archivar el ciclo horario-laboral-por-cliente`  

---

**Archive complete. Change is closed.**
