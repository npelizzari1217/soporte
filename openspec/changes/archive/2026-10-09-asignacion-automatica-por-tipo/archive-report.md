# Archive Report: asignacion-automatica-por-tipo

**Change**: asignacion-automatica-por-tipo (roadmap stage 2, point 9: automatic assignment by ticket type)
**Archived**: 2026-10-09
**Archived to**: `openspec/changes/archive/2026-10-09-asignacion-automatica-por-tipo/`
**Artifact store**: openspec
**Verdict at close**: archived as PASS WITH WARNINGS (0 CRITICAL, 8 WARNING, 4 SUGGESTION). Warnings remain open as follow-ups; none is a behavioral defect.

## Final State at Close

Ranked per the Final-State Authority: (1) the persisted `tasks.md`, (2) the orchestrator's final-state facts, (3) `verify-report.md` and `apply-progress.md`, which are intermediate snapshots.

| Item | Final state | Source (rank) |
|---|---|---|
| Tasks | 56/56 complete, 0 unchecked | `tasks.md` (1) |
| Work units | All 8 WUs applied | launch facts (2); `apply-progress.md` (3) |
| Verification | PASS WITH WARNINGS, 0 CRITICAL, 8 WARNING, 4 SUGGESTION | `verify-report.md` at verification time (3); not re-run at archive |
| Delivery | Tracker #490 merged to `main` at `776c6d69` on 2026-10-09. #489 auto-merged by tracker fast-forward. #491-#504 closed with a comment because their content entered through #490. Issue #485 closed by the merge | launch facts (2); `git log` shows `776c6d69` on `main` (1) |
| Production deploy | 2026-10-09 at `776c6d69`. Pre-deploy dump verified at `C:\soporte\backups\utc-backfill-20261009-162817`. Tenant migration `20261009120000_reglas_asignacion` applied on all 8 tenants. Services running, HTTP 200 externally. Owner's functional smoke passed: a rule made the ticket born ASIGNADO and the mail arrived | launch facts (2); not independently verifiable from the repository |
| Roadmap point 9 | Row marked Entregado and decision bullet Cumplida, with 2 agreed deviations. Delivered in PR #505, merged at `2494efed`. `check-roadmap-fresco` green | launch facts (2); `git log` shows PR #505 merge (1) |
| Deploy notes | In the comment on #490. There is no `notas-deploy.md` file in this change | launch facts (2) |

### Superseded verify-report claim

`verify-report.md`, section "Issues Found" S4, says task 8.7 is still pending after the deploy. That was true at verification time (3). The final state is that task 8.7 is done: `tasks.md` shows it checked (1), and the roadmap change landed in PR #505 (2). This is not an unranked contradiction, so it is recorded here as superseded and not echoed as pending.

The same verify-report section, "Completeness", notes that task 8.7 is outside the task list and does not block archive. That note is consistent with the final state.

## Specs Synced

All four delta specs were new: no main spec existed for these domains. Each delta spec is a full spec, so it was copied mechanically (`cp` to a temp file, `diff -r`, `mv`), with no model Read/Write of content. No existing main spec was modified, so no requirement was dropped or altered.

| Domain | Action | Requirements | Scenarios |
|---|---|---|---|
| `asignacion-automatica-alta` | Created | 9 (A1-A9) | 26 |
| `notificacion-asignacion` | Created | 7 (N1-N7) | 19 |
| `reglas-asignacion` | Created | 7 (R1-R7) | 30 |
| `ticket-asignacion-manual` | Created | 6 (M1-M6) | 20 |

Totals: 29 requirements and 95 scenarios, matching the `verify-report` counts (29/29, 95/95).

## Archive Contents

- `proposal.md`: present
- `exploration.md`: present
- `specs/`: 4 delta specs present (`asignacion-automatica-alta`, `notificacion-asignacion`, `reglas-asignacion`, `ticket-asignacion-manual`)
- `design.md`: present
- `tasks.md`: present, 56/56 complete, 0 unchecked
- `apply-progress.md`: present
- `verify-report.md`: present
- `archive-report.md`: this file

## Open Follow-ups (verify WARNINGS, still open)

These come from `verify-report.md` at verification time. None is a behavioral defect.

- **W1**: A5 "Tickets previos intactos" is partial. The integration test re-reads the ticket after the rule is removed but asserts only SLA fields, not `estadoId` or `asignadoId`.
- **W2**: M3 "Reloj del SLA" is partial. No test covers the `/asignar` NUEVO→ASIGNADO path. It is covered only by the sibling `asignar-en-proceso` path.
- **W3**: User-level deactivation ("dado de baja") is tested only with a mocked checker. The `activo: true` filter in `usuario-master.checker.ts` has no integration case.
- **W4**: N6 "Formulario público" and "Barrido de preventivos" are partial. The listener runs only in the HTTP e2e.
- **W5**: N4 "Alta con regla sin SMTP" is partially covered.
- **W6**: R5 "ROOT" covers GET only, not PUT.
- **W7**: The `rules.verify` adversarial mutation was not re-run at verify time. Apply recorded three mutation checks.
- **W8**: Declared deviation from task 3.3. Per-channel HTTP e2e was replaced by use-case integration on real Postgres.

## Suggestions (open)

- **S1**: `reparaciones/.../crear-ticket-edilicio.use-case.ts`: the "Sección crítica" comment sits above the resolver call instead of above `txRunner.run`.
- **S2**: `frontend/.../ticket-reasignar-control.tsx`: `seleccionado` is not reset after a successful reassignment.
- **S3**: Commit `562b846d` says "(sin verificar)". The verification was done later. Published history cannot be reworded, so the note belongs in the tracker PR body.
- **S4**: Superseded. Task 8.7 is done (see above).

## Known Follow-up (not in verify report)

- The frontend `ESTADOS_TERMINALES` is a local mirror of the backend constant. Keep them in sync or consolidate.

## Documentation Debt (Ayuda, suspended)

Per `soporte/CLAUDE.md`, writing Ayuda articles is suspended since 2026-09-07. The debt is recorded here so the final Ayuda batch can cover it:

- The "Asignación automática" screen
- Auto-assignment at ticket creation
- The assignment mail
- Manual NUEVO→ASIGNADO
- The reassign control

## Contradictions Recorded

No unranked contradictions. The one verify-report snapshot claim that differs from final state (S4, task 8.7) is resolved above by rank.

## Mechanical Copy Evidence

- Four spec copies: `diff -r` of each delta against its main spec was empty, before and after the `mv`.
- Folder move: `git mv` to this archive folder. `diff -r` of the pre-move snapshot against the archived folder was empty.
- This report was authored new and is additive. It is not part of the source snapshot.
