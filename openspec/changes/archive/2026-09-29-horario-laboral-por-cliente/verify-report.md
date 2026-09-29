```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:ec46a70952e24cdab5f40ebed3b3f698b8e186601b6fa98c07db6a9c10131cb7
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 12/12
scenarios: 20/20
test_command: (cd backend && vitest run src/calendario-laboral src/sla scripts/check-calendario-master-default.spec.ts) && (cd frontend && vitest run src/features/horario-laboral src/shared/nav)
test_exit_code: 0
test_output_hash: sha256:8a2d90415a7df53e10519df1727ace60e7a131698c7a24b16d09acba5fd79be7
build_command: (cd backend && pnpm lint && pnpm typecheck) && (cd frontend && pnpm lint && pnpm type-check)
build_exit_code: 0
build_output_hash: sha256:6c9ae7a1f0f0e1cd583f8236d0bb4db78fc977d9538b38b375e741c1174eefca
```

## Verification Report (re-verify after WU-9)

**Change**: horario-laboral-por-cliente
**Version**: N/A (spec `specs/horario-laboral-cliente/spec.md`)
**Mode**: Standard (feature; `strict_tdd: false`, no TDD injection)
**Candidate**: branch `feat/horario-laboral-por-cliente-wu09`, tip `39af4f1` (bounded correction on top of `7bc037b`). `git diff main...39af4f1` = 61 files, +5388/-209. `evidence_revision` is the sha256 of that diff.
**Supersedes**: the report on `7bc037b` (PASS WITH WARNINGS: 0 CRITICAL, 7 WARNING, 4 SUGGESTION).

### Verdict

**PASS WITH WARNINGS.** 0 CRITICAL, 1 WARNING, 5 SUGGESTION.

WU-9 fixes W1-W7, S2 and S3, and each fix is backed by runtime evidence here:
- The W1 regression test fails on the pre-WU-9 code and passes on the fix.
- The three mutations that survived before (M4a, M7, M8) are now killed.
- A new XOR mutation of the holiday union (M9) is killed only by the new W4 data.

The one remaining warning is a false sentence in the WU-9 artifacts. It is not a code defect.

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 59 (50 original + 9 WU-9) |
| Tasks complete | 59 |
| Tasks incomplete | 0 |
| Archive-owned notes (A.1, A.2) | 2, planned for `sdd-archive` |

`gentle-ai sdd-status horario-laboral-por-cliente`: `apply: all_done`, `tasks: 59/59 complete`.

### Build & Tests Execution

| Gate | Command | Exit | Result |
|---|---|---|---|
| Backend lint | `cd backend && pnpm lint` | 0 | 0 errors |
| Backend typecheck | `cd backend && pnpm typecheck` | 0 | 0 errors |
| Frontend lint | `cd frontend && pnpm lint` | 0 | "No ESLint warnings or errors" |
| Frontend type-check | `cd frontend && pnpm type-check` | 0 | 0 errors |
| Backend touched specs | `vitest run --reporter=verbose src/calendario-laboral src/sla scripts/check-calendario-master-default.spec.ts` (scratch copy of `39af4f1`, real Postgres) | 0 | **37/37 files, 254/254 tests**; every new WU-9 case listed as passing |
| Frontend touched specs | `vitest run src/features/horario-laboral src/shared/nav` (scratch copy of `39af4f1`) | 0 | **9/9 files, 69/69 tests** |

Lint and type-check ran on the real tree. The spec runs used a `git archive 39af4f1` scratch copy with symlinked `node_modules` and `node_modules/.bin/vitest` directly.

The full suites were not re-run, on purpose:
- WU-9 changes only two frontend source files (the save hook and the view), backend and frontend test files, and comments.
- Both runs above cover every touched file and its dependents.
- On `7bc037b` the full suites were green: backend 5471/5471 and frontend 1561/1561, with `pnpm build` passing too.

The writer reports backend 5475/5475 and frontend 1562/1562 on `39af4f1`. That fits +4 backend tests (the -1 CHECK, S2, and two W3 cases) and +1 frontend test (the W1 regression). I did not re-run those totals.

**Coverage**: not measured (`coverage_threshold: 0`).

### Resolution of the previous findings

| Item | Status | Evidence (file:line) |
|---|---|---|
| **W1** A failed save after a successful one wiped edits | **Resolved** | `frontend/.../hooks/use-guardar-horario-laboral.ts:36` calls `setQueryData` before `invalidateQueries`; `frontend/.../components/horario-laboral-view.tsx:92` passes `valoresIniciales={horarioQuery.data}` (no longer `mutation.data`). Regression test `horario-laboral-view.test.tsx:124`. **Checked against the old code**: with the `7bc037b` view and hook it **fails**, and with only the old view it also fails, so the test pins the view change. My original probe (which also waits for the background refetch to return the saved data) **passes** on the fix |
| **W2** The no-recalculation e2e never went through a real save | **Resolved** | `backend/src/sla/infrastructure/listeners/aplicar-sla-horario-cliente.e2e.spec.ts:263-277` saves through the real `GuardarHorarioLaboralUseCase`, real repository and real `PrismaTenantTransactionRunner` under `TenantContext`, then asserts `venceInicialA` is unchanged. **M4a is now killed** |
| **W3** The deploy check's test changed both ends at once | **Resolved** | `backend/scripts/check-calendario-master-default.spec.ts:46` (opening only), `:59` (closing only). **M8 is now killed** (`un dia con SOLO la apertura cambiada falla`) |
| **W4** Same date as both a global and a client holiday had no real-DB coverage | **Resolved** | `backend/src/sla/infrastructure/listeners/aplicar-sla-habil-feriados.e2e.spec.ts:135-140` raw-inserts `FECHA_GLOBAL` as A's own holiday, and the expectation at `:225` is unchanged. **M9** (the union as XOR: a date in both sources gets removed) is **killed** by this e2e and **survives** the pre-WU-9 version of it, so the new row is what adds the coverage |
| **W5** The docs gave the wrong reason for the deploy check | **Resolved** | `DEPLOY-VPS-runbook.md:109-113`, `deploy.ps1:149-157` and `backend/scripts/check-calendario-master-default.mjs:5-11` now say the seed is fixed, never reads master, and that the risk is an edited master making the deploy silently move every client's schedule and `sla_vence_at`. That matches `migration.sql:43-48` |
| **W6** False `-1` claim, and the CHECK lower bound was untested | **Resolved** | New test `calendario-laboral-dias-cliente-check.integration.spec.ts:118`; `apply-progress.md:10` is corrected. **M7 is now killed.** Note: `apply-progress.md:487` records the W6 RED proof as reasoning only, so M7 here is its first runtime proof |
| **W7** Stale "global calendar" comments | **Resolved** | `backend/prisma_master/schema.prisma:483-486`; `backend/src/sla/application/use-cases/aplicar-sla.use-case.spec.ts:440-441` |
| **S1** Runbook subsection sits above the VPS facts table | Open (declared out of scope, `apply-progress.md:451`) | The `### Precondición` heading at `DEPLOY-VPS-runbook.md:83` is still above the table at `:115` |
| **S2** No HTTP e2e for opening >= closing | **Resolved** | `backend/src/calendario-laboral/interface/controllers/horario-laboral.e2e.spec.ts:306` (422, then the GET is unchanged) |
| **S3** The 422/500 view tests never edited before saving | **Resolved** | `horario-laboral-view.test.tsx:92-120` unchecks Martes before saving and asserts the edit survives |
| **S4** PR bodies must carry the Ayuda debt note | Open (declared out of scope) | No horario-laboral PRs exist yet |

### deploy.ps1 re-check

- **Encoding:** 100% ASCII (`rg '[^\x00-\x7F]' deploy.ps1` finds nothing) and no BOM (first bytes `23 20 64`). CRLF comes from `.gitattributes`.
- **Syntax:** a portable `pwsh` `Parser::ParseFile` run gives `errors=0`.
- **Placement:** the precondition step (`:162`) still runs before `Detener servicios` (`:225`), `migrate master` (`:229`) and `migrate:tenants` (`:232`), and it is still under `AssertOk`.

### Mutation results (scratch copy of `39af4f1`; restoration confirmed with `diff -rq`)

| # | Mutation | Before WU-9 | Now |
|---|---|---|---|
| M4a | Saving rewrites open tickets' `sla_vence_at` (`ticket.updateMany` inside `reemplazar`) | Survived | **Killed**: `aplicar-sla-horario-cliente.e2e.spec.ts:230` |
| M7 | Tenant CHECK `BETWEEN 0 AND 6` → `<= 6` | Survived | **Killed**: `calendario-laboral-dias-cliente-check.integration.spec.ts:118` |
| M8 | Deploy check ignores Monday's opening time | Survived | **Killed**: `check-calendario-master-default.spec.ts:46` |
| M9 (new) | Holiday union implemented as XOR (a date in both sources is dropped) | n/a (survives the pre-WU-9 e2e) | **Killed**: `aplicar-sla-habil-feriados.e2e.spec.ts:225` |
| W1 repro | The `7bc037b` view and hook under the WU-9 tests | Bug present | New regression test **fails** on the old code and **passes** on the fix |

M1, M2, M3, M4b, M5 and M6 were killed in the previous verify. WU-9 does not touch their production targets.

### Spec Compliance Matrix

The matrix from the previous report still holds. WU-9 strengthens these rows:

| # | Requirement | Scenario | Covering test (passed) | Result |
|---|---|---|---|---|
| 1 | Aislamiento por cliente | A never affects B's SLA | `aplicar-sla-horario-cliente.e2e.spec.ts:230`; `horario-laboral.e2e.spec.ts:356` | COMPLIANT |
| 2 | Default sembrado | Deploy changes no due date | `aplicar-sla-habil-feriados.e2e.spec.ts:225`; `aplicar-sla-horario-cliente.e2e.spec.ts:253` | COMPLIANT |
| 2 | Default sembrado | New tenant is born with the default | `calendario-laboral-dias-cliente-check.integration.spec.ts:89`; `horario-laboral.e2e.spec.ts:253` | COMPLIANT |
| 3 | Lectura falla cerrada | Read fails with no TenantContext | `calendario-laboral.repositorios.integration.spec.ts:103` | COMPLIANT |
| 4 | Un intervalo por día | A valid interval is accepted | `horario-laboral-semanal.spec.ts:27,157`; `horario-laboral.e2e.spec.ts` (ADMINISTRADOR PUT 200) | COMPLIANT |
| 4 | Un intervalo por día | Opening >= closing is rejected, nothing written | `horario-laboral.e2e.spec.ts:306` (**now end-to-end**); `horario-laboral-semanal.spec.ts:94,103`; `guardar-horario-laboral.use-case.spec.ts:66,78` | COMPLIANT |
| 5 | Al menos un día abierto | All 7 closed is rejected | `horario-laboral.e2e.spec.ts:273`; VO and use-case specs | COMPLIANT |
| 6 | Reemplazo atómico | Repeated + missing day is rejected whole | `horario-laboral.e2e.spec.ts:288`; `horario-laboral-semanal.spec.ts:56` | COMPLIANT |
| 6 | Reemplazo atómico | A valid save replaces all 7 rows atomically | `calendario-laboral.repositorios.integration.spec.ts:109` | COMPLIANT |
| 7 | Permisos | A non-admin cannot edit | `horario-laboral.e2e.spec.ts:262`; controller spec | COMPLIANT |
| 7 | Permisos | Any authenticated tenant user can read | `horario-laboral.e2e.spec.ts:253` | COMPLIANT |
| 7 | Permisos | Unauthenticated → 401 | `horario-laboral.e2e.spec.ts:244` | COMPLIANT |
| 8 | No recálculo | An open ticket keeps its due date | `aplicar-sla-horario-cliente.e2e.spec.ts:263-277` (**now through the real save path**; M4a killed) | COMPLIANT (W2 caveat closed) |
| 8 | No recálculo | A reprioritized ticket uses the new schedule | `aplicar-sla-horario-cliente.e2e.spec.ts:230` | COMPLIANT |
| 8 | No recálculo | A new ticket uses the new schedule | `aplicar-sla-horario-cliente.e2e.spec.ts:230` | COMPLIANT |
| 9 | Zona horaria AR | Interpreted in Argentina time | `aplicar-sla-horario-cliente.e2e.spec.ts:253` (09:00 ART = 12:00Z) | COMPLIANT |
| 10 | Master deprecada | No production path reads master | `aplicar-sla-horario-cliente.e2e.spec.ts:230`; static `rg` returns 0 production readers | COMPLIANT |
| 11 | Contrato frontend | A non-admin sees a read-only grid | `horario-laboral-view.test.tsx:208`; `horario-laboral-form.test.tsx:45` | COMPLIANT |
| 11 | Contrato frontend | All 7 closed shows a message and sends nothing | `horario-laboral-form.test.tsx:61`; `schemas.test.ts:34` | COMPLIANT |
| 12 | Roadmap | The freshness check passes | Deferred to `sdd-archive` (A.1/A.2); `check-roadmap-fresco.mjs` passed on `7bc037b`, and WU-9 does not touch `docs/` | COMPLIANT-DEFERRED |

**Compliance summary**: 20/20 scenarios with passing runtime coverage. One is deferred to archive by design.

### Coherence (Design)

WU-9 changes no design decision. D16 is now fully followed ("se conservan los valores", proven by `horario-laboral-view.test.tsx:124`). The D18 adversarial row is now satisfied (M8 killed).

### Issues Found

**CRITICAL**: None.

**WARNING**:

- **W8: WU-9 artifacts contain a literally false rollback claim.** `apply-progress.md:484` ("ningún archivo de WU-1 a WU-8b se toca") and `tasks.md:266` (same sentence) are both false. WU-9 edits files created in WU-1 to WU-8b: `horario-laboral-view.tsx`, `use-guardar-horario-laboral.ts`, `deploy.ps1`, `DEPLOY-VPS-runbook.md`, `check-calendario-master-default.mjs`, several specs, and `apply-progress.md` itself. Reverting WU-9 does touch those files. **Minimal fix:** reword both to "no WU-1..WU-8b commit is rewritten; reverting WU-9 restores the affected files to their `7bc037b` content".

**SUGGESTION**:

- **S1 (carried).** Move `### Precondición` below the VPS facts table in `DEPLOY-VPS-runbook.md:83-115`, or add a heading before the table.
- **S4 (carried).** Each horario-laboral PR body, at least WU-8b's, must note the Ayuda debt (new `/horario-laboral` screen with no `backend/ayuda/*.md` article; writing paused since 2026-09-07).
- **S5.** `apply-progress.md:451` says WU-9 "Cubre W1-W7 y S2", but task 9.2 also closes S3. Add S3 to that line.
- **S6.** The Work Unit Evidence in `apply-progress.md:482-483` points to "el reporte de retorno de `sdd-apply`", which is not persisted anywhere, and the W6 RED proof (`:487`) is reasoning only. Record the focused test counts and cite M7 from this report as the runtime proof.
- **S7.** The comment at `aplicar-sla-habil-feriados.e2e.spec.ts:230-233` says a dedup failure would count Tuesday "como 2 días saltados". A `Set` can't double-count. What the row really protects against is a date present in both sources not resolving to exactly one skipped day (M9). Reword the comment to match.

### Skipped / not applicable

- Strict TDD checks were skipped (this is a feature).
- Coverage percentage was not measured.
- Full suites and `pnpm build` were not re-run (see Build & Tests for why).
- The roadmap flip is archive-owned.
