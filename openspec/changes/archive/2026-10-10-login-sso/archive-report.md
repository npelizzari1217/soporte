# Archive Report: login-sso

**Change**: login-sso (roadmap segunda etapa, punto 7: login con Google o Microsoft, SSO)
**Archived**: 2026-10-10
**Archived to**: `openspec/changes/archive/2026-10-10-login-sso/`
**Artifact store**: openspec
**Verdict at close**: archived as PASS WITH WARNINGS (0 CRITICAL, 2 WARNING, 4 SUGGESTION). W1 is resolved; W2 remains pending and blocks enabling providers in production, not the archive.

## Final State at Close

Ranked per the Final-State Authority: (1) the persisted `tasks.md`, (2) the orchestrator's final-state facts, (3) `verify-report.md` and `apply-progress.md`, which are intermediate snapshots.

| Item | Final state | Source (rank) |
|---|---|---|
| Tasks | 97/97 checkboxes marked, 0 unchecked. V.1 and V.2 are blockquote items outside the checkbox list, by design | `tasks.md` (1) |
| Verification | PASS WITH WARNINGS, 0 CRITICAL, 2 WARNING, 4 SUGGESTION. Not re-run at archive | `verify-report.md` (3) |
| W1 | Resolved: SV1 amended to drop the stored link email, in `7c46dcbd` (addendum in the verify report). No code or test change | `verify-report.md` addendum (3); `git log` (1) |
| W2 | Pending: V.1 manual staging check not done | `verify-report.md` (3); launch facts (2) |
| Delivery | Tracker PR #510 merged to `main` as merge commit `c5e1ec0a`. Slice PRs #511 to #533 entered through the tracker | launch facts (2); `git log` shows `c5e1ec0a` (1) |
| Production deploy | Pending. Deploy notes are in the body of #510. There is no `notas-deploy.md` in this change | launch facts (2) |
| Roadmap point 7 | Not yet declared Cumplida or Desviación (task V.2, only after deploy) | `tasks.md` (1) |

## Specs Synced

Three capabilities were new and three already existed. New specs were copied mechanically (`cp`, then `diff`, empty). Existing specs were merged with a script that replaced or appended requirement blocks taken from the delta text; no unrelated requirement was touched.

| Domain | Action | Requirements | Scenarios (delta) |
|---|---|---|---|
| `auth-sso-login` | Created | 15 (SL1-SL15) | 50 |
| `auth-sso-vinculo` | Created | 8 (SV1-SV8) | 26 |
| `auth-sso-configuracion` | Created | 5 (SC1-SC5) | 18 |
| `auth-2fa-login` | Merged | L1 and L7 modified | 12 in delta (6 each) |
| `auth-2fa-dispositivo-confiable` | Merged | D3 renamed and modified | 7 in delta |
| `auth-limite-intentos` | Merged | I9 added | 7 in delta |

Merge notes:

- `auth-2fa-login`: L1 now reads "primer factor (contraseña o ingreso por SSO)" and SSO never counts as a second step. L7 states the selection ticket is the same for both first factors. The "Ticket de selección" definition was updated. 5 scenarios were added (3 in L1, 2 in L7).
- `auth-2fa-dispositivo-confiable`: D3 renamed to "omite el desafío, no el primer factor". A valid device skips the second step but not the password or the SSO login. 4 SSO scenarios were added.
- `auth-limite-intentos`: I9 added, rate limit per provider, derived subject and IP, key `sso:<proveedor>:<derivado>:<ip>`. It does not limit flow start by IP and does not affect the I6 code counter.

### Declared deviations kept in the main specs

- **SV1** (`auth-sso-vinculo`): the link does NOT store the email it was linked with. Decision of 2026-10-10 by the owner: the field was informative only, no screen read it, and storing it added personal data with no use (ADR-4).
- **SL15** (`auth-sso-login`): out of scope are (a) any automatic creation of users, memberships or clients from an SSO login, (b) any "solo SSO" policy or column, global or per client, (c) any login audit table. Rejections go to server logs only.

## Archive Contents

- `proposal.md`: present
- `exploration.md`: present
- `specs/`: 6 delta specs present
- `design.md`: present
- `tasks.md`: present, 97 checked, 0 unchecked
- `apply-progress.md`: present
- `verify-report.md`: present (with the W1 addendum)
- `archive-report.md`: this file

## Open Follow-ups

- **V.1**: the owner's manual staging check with real Google, Microsoft work and Microsoft personal accounts (`email`, `xms_edov`, `oid` claims, link creation, second login by subject, own 2FA, selector with two memberships), plus confirming the Entra manifest procedure (task 16.3). **Blocks enabling providers in production.** If personal Microsoft accounts do not issue the claims, they are rejected by design and declared as a Desviación.
- **V.2**: the roadmap point 7 Cumplida or Desviación declaration in `docs/roadmap-comercial.md`, only after deploy, provider activation and smoke. Not done here; `docs/roadmap-comercial.md` was not edited.
- **Deploy**: pending. The notes are in the body of #510.
- **Ayuda debt** (writing suspended since 2026-09-07): the SSO buttons on the login screen, the generic failure message, the SSO login continuing to 2FA or the client selector, and the admin "Resetear vínculo SSO" button.
- **S1**: decide whether `findManyByEmailInsensitive` should exclude deleted users (`AND deleted_at IS NULL`) and pin it with an integration test. Today a deleted user and an active one with case variants of the same email leave the active one AMBIGUO (fails closed).
- **S2**: the text of task 15.1 is stale (it says "invalida la query" and "el mismo mensaje del 2FA"); the deviation is documented in `apply-progress.md`.
- **MENSAJE_SSO_ERROR**: the wording of the generic message is open to change by the owner.
- Other verify SUGGESTIONS (two more) remain at the owner's discretion, as listed in `verify-report.md`.

## Contradictions Recorded

No unranked contradictions. The verify-report header counts W1 as open at verification time; the addendum and `7c46dcbd` resolve it, and the main spec SV1 carries the amended text.

## Mechanical Copy Evidence

- Three new specs: `diff` of each delta against its main spec was empty.
- Three merged specs: edits were applied by script from delta text, with the `(Previously: ...)` annotation lines dropped; reviewed with `git diff`.
- Folder move: `git mv` to this archive folder, history preserved.
- This report was authored new and is additive.
