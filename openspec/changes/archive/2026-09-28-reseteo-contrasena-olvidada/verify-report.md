```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:be00089a397a21db50b8767d72f21a701161b82951c8a3f3fa064620979e86cc
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 15/15
scenarios: 22/22
test_command: (cd backend && pnpm vitest run src/auth/interface/controllers/recuperacion-password.e2e.spec.ts src/auth/application/use-cases/solicitar-reset-password.use-case.spec.ts src/auth/application/use-cases/confirmar-reset-password.use-case.spec.ts src/auth/domain/templates/reset-password-email.template.spec.ts src/shared/infrastructure/segundo-plano/tareas-segundo-plano.spec.ts src/auth/infrastructure/email/correo-de-cliente.adapter.spec.ts) && (cd frontend && pnpm vitest run "src/app/(auth)/olvide-password" "src/app/(auth)/restablecer-password" src/features/auth/hooks src/middleware.test.ts src/features/auth/components)
test_exit_code: 0
test_output_hash: sha256:d50b36bf4a597f60863cdaed4134088f1e8fbfe62c083eb8108129990d6431ce
build_command: (cd backend && pnpm typecheck && pnpm lint) && (cd frontend && pnpm lint && pnpm type-check)
build_exit_code: 0
build_output_hash: sha256:4d6322e19b1bfa8e91c52fbc167216feb722fec76c7238cf7209a130f8b3a453
```

## Verification Report (re-verification after WU-12)

**Change**: reseteo-contrasena-olvidada
**Version**: N/A (spec `specs/auth-reseteo-por-olvido/spec.md`)
**Mode**: Standard (feature; Strict TDD off)

**Revision verified**: `feat/reseteo-contrasena-olvidada-wu12` @ `7782c85`, which is `git log -1`. The launch prompt named `a2ff8d1`, but that is not the tip. The tip is one commit (WU-12, 370 changed lines) on top of `6c351ad`.
- The evidence digest is the sha256 of `git rev-parse HEAD` plus `git diff main...HEAD`.
- The previous report verified `6c351ad`: PASS WITH WARNINGS, 5 warnings, 5 suggestions. This report replaces it.

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 63 |
| Tasks complete | 63 |
| Tasks incomplete | 0 |

`gentle-ai sdd-status reseteo-contrasena-olvidada` reported `tasks: 63/63 complete`, which covers WU-12 tasks 12.1 to 12.10.

### Build & Tests Execution

**Build**: Passed

```text
backend/  pnpm lint        exit 0
backend/  pnpm typecheck   exit 0
frontend/ pnpm lint        exit 0  (No ESLint warnings or errors)
frontend/ pnpm type-check  exit 0
```

**Tests**: Passed. These are the specs touched by WU-12, plus every consumer of the pieces it changed.

```text
backend  6 files, 50 tests passed, exit 0
  (recuperacion-password e2e against the real soporte_master_test, solicitar and confirmar
   use-case specs, template spec, tareas-segundo-plano spec, correo-de-cliente adapter spec)
frontend 12 files, 68 tests passed, exit 0
  (olvide-password and restablecer-password pages, features/auth/hooks,
   features/auth/components, middleware)
```

I did not re-run the full suites, and there was no reason to:
- WU-12 changes no HTTP contract, DI wiring or schema.
- `rg` shows that every consumer of the changed pieces is inside the specs above: `TareasSegundoPlano` log format, `CORREO_CLIENTE_ERROR`, the `useSolicitarReset` return shape and the template copy.
- The previous run on `6c351ad` passed the full suites (backend 5501/5501, frontend 1557/1557).
- The WU-12 test delta is +4 backend and +3 frontend tests. That matches the writer's reported 5505 and 1560 exactly.

**Coverage**: not collected (`coverage_threshold: 0`).

### Resolution of the previous findings

| ID | Previous finding | Status | Evidence |
|---|---|---|---|
| W1 | No backend test for the minimum length | **Resolved** | `recuperacion-password.e2e.spec.ts:524`: a valid token with `passwordNueva: 'corta'` gets 400, the hash is unchanged and `used_at IS NULL`. Mutation V2-M7 (drop `@MinLength(8)`) is **killed** |
| W2 | Ayuda overstated when the mail is sent | **Resolved** | `backend/ayuda/mi-cuenta-contrasena.md:38-42`: the mail is sent only when the account is active, belongs to a single client and that client has mail configured; the multi-client, no-active-account and no-SMTP cases say "pedile a tu administrador que te la restablezca". `:46-49`: the confirmation mail is conditional on the client still having mail configured. The TTL of 60 minutes, session closure and the same-message rule are unchanged and correct. There is no false claim left |
| W3 | Confirmation wording deviated from owner decision 3 | **Resolved** | `reset-password-email.template.ts:57,60` now says "contactá a tu administrador". A test fixes the wording (`template.spec.ts`), and mutation V2-W3 is killed |
| W4 | No-mail branches did not assert that no revocation happens | **Resolved** | All six no-mail tests plus the new soft-deleted test now assert that `revocarVigentesDeUsuario` and `save` are not called (`solicitar-reset-password.use-case.spec.ts`). Mutants V2-M4a/c/d/e/f (the MEMBRESIAS_N, inactive, MEMBRESIAS_0, nonexistent and CLIENTE_NO_DISPONIBLE branches) are **all killed** |
| W5 | Stale claims in `apply-progress.md` | **Mostly resolved; see W6** | WU-4, WU-6, WU-8, WU-10 and WU-11 are corrected with inline `[W5: corregido]` notes. `state.yaml` now says `phase: apply` and `last_wu_completed: WU-12` |
| S1 | `isDeleted()` guards untested | **Resolved** | "activo pero soft-deleted" cases (via `reconstitute`): `confirmar...spec.ts:163` and `solicitar...spec.ts:147`. V2-M16 and V2-M16b are **killed** |
| S2 | Adapter and background tasks logged `error.message` | **Resolved in code**; the adapter log is untested (S6) | `correo-de-cliente.adapter.ts:70-74` and `tareas-segundo-plano.ts:38-39` log `error.name`. The tareas mutation is killed; the adapter mutation survives |
| S3 | `/olvide-password` hid the form on 429/5xx | **Resolved** | `olvide-password/page.tsx:36,54`, with `esErrorTransitorioSolicitud` in `use-solicitar-reset.ts`. `page.test.tsx` it.each([429, 500]) retries. The success path still hides the form, so anti-enumeration is unchanged. S3-sin-reintento and S3-form-siempre are killed |
| S4 | `decodeURIComponent` could throw | **Resolved** | `restablecer-password/page.tsx:52-58` wraps it in try/catch; tested with `#token=%E0`. Mutation S4 is killed |
| S5 | Stale doc comments | **Resolved** | `use-restablecer-password.ts:5` now gives `/api/auth/reset-password`; `middleware.ts:25` says exact match unless the entry ends in `/` |

### Spec Compliance Matrix

Changes from the previous report are marked in bold. Everything else is re-confirmed by the touched specs passing at this revision.

| Requirement | Scenario | Covering test(s) | Result |
|---|---|---|---|
| R1 Uniform response | No no-mail case is distinguishable | `e2e:379` (7 branches, identical status/body/headers); `solicitar...spec.ts` branch table | COMPLIANT |
| R1 | The mail case responds identically | `e2e:379` | COMPLIANT |
| R2 No timing leak | Response does not wait on branch work | `e2e:428` (blocked sender) | COMPLIANT |
| R2 | Handler does not await | `recuperacion-password.controller.spec.ts:48`; `tareas-segundo-plano.spec.ts` | COMPLIANT |
| R2 | Identical code, body and headers | `e2e:379` | COMPLIANT |
| R3 Hash only | DB keeps only the hash | `solicitar...spec.ts` LISTO case; `integration.spec.ts:112` | COMPLIANT |
| R4 New token revokes earlier ones | Second request invalidates the previous link | LISTO case (revoke before save); `integration.spec.ts:134,162,213`; `confirmar...spec.ts` 4 causes; **no-mail branches now assert no revocation** | COMPLIANT |
| R5 CAS under concurrency | Two concurrent confirmations | `integration.spec.ts:240`; `e2e:562` | COMPLIANT |
| R6 Same rejection | Four causes indistinguishable | `confirmar...spec.ts` it.each; `e2e:541`; `e2e:488` | COMPLIANT |
| R7 Min 8 and `hashPassword()` | Short password rejected without touching `passwordHash` | **`e2e:524`** (backend 400, hash unchanged, token not consumed); FE `RestablecerPasswordForm.test.tsx:11`, `schemas.test.ts:53` | COMPLIANT (**backend path now covered**) |
| R7 | Login uses the new password | `e2e:488`; `confirmar...spec.ts` success case | COMPLIANT |
| R8 Sessions | Successful reset revokes sessions | `e2e:488` | COMPLIANT |
| R8 | Revocation failure does not undo the reset | `confirmar...spec.ts` revocation-failure case | COMPLIANT |
| R9 Unavailable account | Inactive account rejected | `confirmar...spec.ts` it.each (nonexistent, inactive, **active but soft-deleted**) | COMPLIANT |
| R10 Confirmation mail | Sent through the token's tenant | `confirmar...spec.ts` success case; `e2e:488`; **wording test** | COMPLIANT |
| R11 APP_BASE_URL only | Link ignores `Host` | `e2e:428`; `template.spec.ts:17,28` | COMPLIANT |
| R12 No secrets in logs | Logs do not expose secrets | `solicitar...spec.ts` LISTO and error cases; `confirmar...spec.ts` log cases; **`tareas-segundo-plano.spec.ts` asserts `error=Error`** | COMPLIANT |
| R13 Rate limiting | Exceeding either limit is rejected | `e2e:461`; `e2e:587`; `guard.spec.ts:18` | COMPLIANT |
| R14 Frontend | Login links to the request page | `LoginForm.test.tsx:13` | COMPLIANT |
| R14 | Request page shows the same message | `olvide-password/page.test.tsx` (204 existing and nonexistent); `use-solicitar-reset.test.tsx` | COMPLIANT |
| R14 | Confirmation validates before sending | `RestablecerPasswordForm.test.tsx:11,24`; `schemas.test.ts` | COMPLIANT |
| R15 Ayuda | Article reflects the new flow | Inspection of `mi-cuenta-contrasena.md:31-53` | COMPLIANT (**no false claims left**) |

**Compliance summary**: 22/22 scenarios compliant. The R7 caveat from the previous report is gone.

The owner decisions (0/2+ memberships get the generic response and no mail; ROOT included; confirmation mail; no platform SMTP; no client selector) and the seven non-negotiables are unchanged from the previous report and still hold. Decision 3's wording now matches.

### Adversarial mutation results (WU-12)

All mutations ran in a fresh scratch copy of `7782c85`, created with `git archive` and `node_modules` symlinked, and invoked through `node_modules/.bin/vitest` directly, never through `pnpm`. Each mutation was reverted afterwards.

| ID | Mutation | Result | Killing test |
|---|---|---|---|
| V2-M7 (W1) | Drop `@MinLength(8)` from `ConfirmarResetDto` | KILLED | `e2e:524` |
| V2-M4a (W4) | Revoke in `MEMBRESIAS_N` | KILLED | "2+ membresías" |
| V2-M4c (W4) | Revoke in `CUENTA_NO_DISPONIBLE` | KILLED | "cuenta inactiva", soft-deleted case |
| V2-M4d (W4) | Revoke in `MEMBRESIAS_0` | KILLED | "0 membresías" |
| V2-M4e (W4) | `save` in `CUENTA_INEXISTENTE` | KILLED | "cuenta inexistente" |
| V2-M4f (W4) | Revoke in `CLIENTE_NO_DISPONIBLE` | KILLED | "cliente no disponible" |
| V2-M16 (S1) | Drop `isDeleted()` in the confirm use case | KILLED | `confirmar...spec.ts:163` |
| V2-M16b (S1) | Drop `isDeleted()` in the request use case | KILLED | `solicitar...spec.ts:147` |
| V2-W3 | Confirmation copy back to "contactá a soporte" | KILLED | template wording test |
| V2-S2-tareas | `TareasSegundoPlano` logs `.message` | KILLED | `tareas-segundo-plano.spec.ts` |
| V2-S2-adapter | `CorreoDeClienteAdapter.logError` logs `.message` | **SURVIVED** | none (S6) |
| S3-sin-reintento | Olvide page hides the form on 429/500 | KILLED | olvide page it.each([429, 500]) |
| S3-form-siempre | Olvide page always shows the form (breaks the same-message UX) | KILLED | olvide page 204 cases |
| S3-400-transitorio | `esErrorTransitorioSolicitud` returns `true` for every error, 400 included | **SURVIVED** | none (S7) |
| S4 | Remove the try/catch around `decodeURIComponent` | KILLED | restablecer page `%E0` case |

The three mutations the coordinator required, for W1, W4 and S1, are all killed.

### `apply-progress.md` audit

Checked against the repo:
- The WU-12 counts are consistent with the test delta: 5501 + 4 = 5505 backend, and 1557 + 3 = 1560 frontend.
- The WU-12 mutation table matches my independent results.
- The WU-10 correction matches the code.
- The WU-11 frontend count of 1557 matches.

Three claims are still inaccurate (W6).

### Issues Found

**CRITICAL**: None.

**WARNING**:

- **W6: `apply-progress.md` still carries three inaccurate claims.**
  - `apply-progress.md:391-393` says the suite is "la suite entera, incluida `orden-de-arranque.spec.ts` — fixture de proceso hijo que ya fallaba antes de este WU". That is false twice over:
    - `test/fixtures/**` is excluded from the suite (`backend/vitest.config.ts:36`), so the fixture is not part of the 475 files.
    - It is not a pre-existing failure. It is a fixture a parent spec launches as a child process, and it is designed to fail.
  - `apply-progress.md:173`, WU-6 `size:exception`, says "~420 líneas". The WU-6 commit `efba922` changed 458 lines (`git show --numstat`).
  - `apply-progress.md:276`, WU-8, now asserts "`pnpm test` → suite completa OK" retroactively, with no count or run evidence. The original text said the run was still in progress. The claim is plausible, because the full suite passed at `6c351ad`, which contains WU-8. But it is not backed by a recorded result.

  Minimal fix:
  - Line 391: replace the parenthetical with "orden-de-arranque.spec.ts is a child-process fixture excluded from the suite; its FAIL output is the expected behavior checked by its parent spec".
  - Line 173: change "~420" to "458".
  - Line 276: say no count was recorded for WU-8, and point to the WU-11 full-suite result.

**SUGGESTION**:
- **S6**: `CorreoDeClienteAdapter.logError` now logs `error.name` (`correo-de-cliente.adapter.ts:70-74`), but no test pins it; V2-S2-adapter survives. Add an assertion in `correo-de-cliente.adapter.spec.ts` "no lanza si el repositorio o el envío fallan" that the logged line contains `error=Error` and not the thrown message.
- **S7**: `esErrorTransitorioSolicitud` (`use-solicitar-reset.ts`) has no unit test; S3-400-transitorio survives. The impact is low: the only 400 comes from a malformed email, the client already validates it, and it does not depend on whether the account exists. Add a small table test covering 429, 0 and 5xx (transient) versus 400 (not transient).
- **S8**: The Ayuda section ends with two consecutive "ask your administrator" instructions (`:42` and `:51-53`). Optionally merge them.

### Verdict

PASS WITH WARNINGS

WU-12 resolves W1 to W5 and S1 to S5, with passing tests and killed mutations. 15/15 requirements and 22/22 scenarios are compliant, and all gates pass. One documentation warning remains (W6: three inaccurate claims in `apply-progress.md`), plus two small test-gap suggestions. Nothing blocks archive.
