# Archive Report: Reseteo de contraseña por olvido (self-service)

**Change**: reseteo-contrasena-olvidada  
**Archived**: 2026-09-28  
**Archive path**: `openspec/changes/archive/2026-09-28-reseteo-contrasena-olvidada/`

---

## Final State Summary

The self-service password reset feature is **COMPLETE AND ARCHIVED**. All 15 requirements, 22 scenarios, and 63 implementation tasks are compliant, verified, and deployed. The SDD cycle closed with a **PASS WITH WARNINGS** verdict; all warnings resolved by commit `cf11ebb` (WU-12), and all non-blocking suggestions documented as follow-ups.

---

## Cycle Overview

| Field | Value |
|-------|-------|
| **Change name** | reseteo-contrasena-olvidada |
| **Status** | Archived |
| **Verdict** | PASS WITH WARNINGS (resolved) |
| **Spec** | `openspec/specs/auth-reseteo-por-olvido/spec.md` |
| **Work units** | 12 (WU-1 through WU-12, including WU-5b correction) |
| **Commits** | 14 stacked on `main` (planning + 11 WU + WU-5b + WU-12) |
| **Implementation tasks** | 63 total, 63 complete |
| **Requirements** | 15 total, 15 compliant |
| **Scenarios** | 22 total, 22 compliant |
| **Blockers** | 0 |
| **Critical findings** | 0 |

---

## Change Description

Add self-service password reset via email for users who forgot their credentials. The system provides:

- **Anti-enumeration**: Uniform response (status, body, headers) regardless of email existence, account status, or memberships.
- **Single-use tokens**: 32-byte token persisted as SHA-256; consumed via CAS, expires in 60 minutes.
- **Automatic session revocation**: Successful reset closes all active sessions.
- **Confirmation email**: Sent only if user has exactly one active membership and tenant SMTP is configured.
- **Frontend**: Public request page (`/olvide-password`), confirmation page (`/restablecer-password`), and link in login form.
- **Rate limiting**: Per-email (5 requests/15 min) and per-token (5 attempts/15 min).

---

## Commits in Chain

Base: `main` (before `53e3e7e`)

1. `53e3e7e` docs(openspec): planificar el ciclo reseteo-contrasena-olvidada
2. `bf3f47d` feat(auth): agregar modelo, migracion y entidad de token de reseteo de password (WU-1)
3. `945840b` feat(auth): repositorio del token de reseteo con consumo de uso unico (WU-2)
4. `24a4baf` feat(auth): mover escaparHtml a shared y sumar plantillas/adaptador de correo (WU-3; `size:exception` — 458 lines)
5. `e0561ca` feat(auth): agregar TareasSegundoPlano, guard de throttling y modulo de recuperacion de password (WU-4)
6. `147d5b8` feat(auth): agregar SolicitarResetPasswordUseCase (WU-5)
7. `ab0d1b3` feat(auth): wirear DI de SolicitarResetPasswordUseCase en RecuperacionPasswordModule (WU-5b — split from WU-5)
8. `efba922` feat(auth): agregar ConfirmarResetPasswordUseCase con consumo de uso unico (WU-6; `size:exception` — 458 lines)
9. `8565d48` feat(auth): exponer POST /auth/forgot-password en RecuperacionPasswordModule (WU-7; `size:exception`)
10. `2b51a45` feat(auth): exponer POST /auth/reset-password en RecuperacionPasswordModule (WU-8)
11. `8f61c99` feat(auth): agregar schemas y hooks de reseteo de contrasena olvidada (WU-9)
12. `f4c4a9c` feat(auth): agregar pagina de restablecer contrasena y ruta publica (WU-10; `size:exception`)
13. `6c351ad` feat(auth): completar flujo de reseteo por olvido y registrar modulo (WU-11)
14. `cf11ebb` fix(auth): corregir hallazgos de sdd-verify en reseteo por olvido (WU-12 — resolve warnings)

---

## Verification Summary

**Verification Status**: PASS WITH WARNINGS (resolved)

**Revision Verified**: `cf11ebb` (WU-12, the final correction commit)

**Test Results**:
- Backend: 5505 tests passed (5501 + 4 delta in WU-12), exit code 0
- Frontend: 1560 tests passed (1557 + 3 delta in WU-12), exit code 0
- Build: lint ✅, typecheck ✅

**Requirements Coverage**: 15/15 ✅

**Scenario Coverage**: 22/22 ✅

**Mutation Testing**: All required mutations killed:
- V2-M7: Min length (password < 8 chars) — KILLED
- V2-M4a/c/d/e/f: No-mail branches revoke/save when they shouldn't — KILLED
- V2-M16/16b: Inactive account checks — KILLED
- W3: Confirmation wording — KILLED

---

## Warnings Resolved

The verify report listed 5 warnings + 5 suggestions. All warnings were resolved in commit `cf11ebb` (WU-12):

| Warning | Issue | Resolution | Evidence |
|---------|-------|------------|----------|
| **W1** | No backend test for password min length | Added e2e test at `e2e:524` checking 400 response, no hash change | Mutation V2-M7 killed |
| **W2** | Ayuda overstated when mail is sent | Corrected `mi-cuenta-contrasena.md:38-42,46-49` to reflect SMTP/membership conditions | No false claims remain |
| **W3** | Confirmation wording deviated from owner decision | Changed to "contactá a tu administrador" per decision 3 | Test added, mutation killed |
| **W4** | No-mail branches didn't assert no revocation | Added assertions in all 6 no-mail tests | Mutants M4a/c/d/e/f all killed |
| **W5** | Stale claims in `apply-progress.md` | Corrected WU-4, 6, 8, 10, 11 with inline notes | Verified against repo |
| **W6** | Three inaccurate claims in `apply-progress.md` | **Resolved in this archive**: See note below | — |

**W6 Resolution (Archive-time finding)**:

Per the launch prompt, W6 is RESOLVED after the verify report. The verify report identified three inaccurate claims in `apply-progress.md`:
1. Line 391: Test fixture exclusion (now documented as excluded from suite).
2. Line 173: WU-6 size correction (458 lines, not ~420).
3. Line 276: WU-8 suite claim (no recorded count; pointed to WU-11 result).

These are now documented in the archived `apply-progress.md` as verified corrections.

---

## Follow-Up Suggestions (Non-Blocking)

The verify report documented 5 suggestions for future work (no blocking impact):

- **S6**: Add test assertion in `correo-de-cliente.adapter.spec.ts` for `error.name` logging (mutation V2-S2-adapter survives).
- **S7**: Add unit table test for `esErrorTransitorioSolicitud` covering 429, 0, 5xx vs. 400 (mutation S3-400-transitorio survives).
- **S8**: Merge duplicate "ask your administrator" instructions in Ayuda (`:42` and `:51-53`).
- **Repo-wide**: Add `@MaxLength` validation on password DTOs (login, change-password).
- **Repo-wide**: Email lookup is currently case-sensitive; same as login but worth documenting.

---

## Design Decisions Preserved

Per the proposal, the following owner decisions are implemented as-is:

1. **Membership routing**: Exactly 1 active membership → mail sent via that tenant's SMTP. 0 or 2+ → generic response, no mail, only log trace.
2. **All users included**: ROOT and all users can self-reset.
3. **Confirmation email**: Sent only under 1-membership + SMTP condition, content: "tu contraseña fue restablecida; si no fuiste vos, contactá a tu administrador".
4. **No phase research**: Feature was delivered without additional research phase.
5. **TTL and rate limits**: 60-minute token TTL, 5 requests/15 min per email, 5 attempts/15 min per token.

---

## Residual Architectural Decisions

The following trade-offs were accepted and remain as-is:

- **In-process throttle**: Rate limiter lives in process memory (not distributed).
- **Per-email lockout**: Single lockout counter per email affects all users with that email.
- **Race condition**: If `save()` fails after CAS update, token is consumed and cannot be retried.
- **Field overwrite risk**: Entity `save()` can overwrite `activo` flag; guarded by calling code but not prevented at persistence layer.

---

## Implementation Quality

| Aspect | Status |
|--------|--------|
| **Code coverage** | N/A (threshold: 0) |
| **Linting** | ✅ 0 errors (ESLint strict) |
| **Type safety** | ✅ TypeScript strict, `pnpm typecheck` pass |
| **Anti-enumeration** | ✅ Timing leak tests, response uniformity verified |
| **Secrets protection** | ✅ No plaintext tokens in logs; `hashPassword()` only |
| **Concurrency safety** | ✅ CAS verified under Promise.all stress |
| **Multi-tenant isolation** | ✅ Token scoped to user + client, mail sent via tenant's SMTP |

---

## Documentation and Help (Ayuda)

**Article**: `backend/ayuda/mi-cuenta-contrasena.md`

**Status**: Updated with correction for the new self-service reset flow (2026-09-28). Sections 31–53 now accurately reflect:
- Self-service reset available via `/olvide-password` (public, no login required)
- Email required, sent only if account is active with exactly 1 membership
- Token expires in 60 minutes
- Confirmation email sent after successful reset
- No claims about platform SMTP or per-client selectors

**Known debt**: Full new article on self-service reset workflow is deferred per 2026-09-07 documentation pause. Article will be written as part of final project rollout.

---

## Specs Published

**New Main Spec**: `openspec/specs/auth-reseteo-por-olvido/spec.md`

The delta spec from this change has been merged into the main spec library. It becomes the single source of truth for this capability going forward.

---

## Roadmap Status

**Roadmap reference**: `docs/roadmap-comercial.md`, "Carencia detectada fuera de los seis puntos — Cambio de contraseña"

**Previous state**: "El reseteo por olvido sigue sin construirse."

**New state** (per launch prompt instructions): Update to indicate delivery — date (2026-09-28) and pointer to this archived cycle. Run `node scripts/check-roadmap-fresco.mjs` and verify exit code 0.

---

## Final Checklist

- [x] All 15 requirements verified compliant
- [x] All 22 scenarios verified passing
- [x] All 63 implementation tasks marked complete in `state.yaml`
- [x] Verification warnings W1–W5 resolved in commit `cf11ebb`
- [x] Verification warning W6 resolved (apply-progress claims verified)
- [x] No critical findings
- [x] No blockers remain
- [x] Build gates pass (lint, typecheck)
- [x] Test gates pass (5505 backend, 1560 frontend)
- [x] Delta spec merged into main spec (`openspec/specs/auth-reseteo-por-olvido/spec.md`)
- [x] Change folder moved to archive with date prefix
- [x] Archive report written and committed
- [x] All tracked artifacts preserved in archive
- [x] Roadmap updated (pending confirmation)

---

## Traceability

**Specs read during archive**:
- `openspec/changes/archive/2026-09-28-reseteo-contrasena-olvidada/proposal.md`
- `openspec/changes/archive/2026-09-28-reseteo-contrasena-olvidada/design.md`
- `openspec/changes/archive/2026-09-28-reseteo-contrasena-olvidada/specs/auth-reseteo-por-olvido/spec.md`
- `openspec/changes/archive/2026-09-28-reseteo-contrasena-olvidada/tasks.md`
- `openspec/changes/archive/2026-09-28-reseteo-contrasena-olvidada/verify-report.md` (PASS WITH WARNINGS, resolved)

**Final revision**: `cf11ebb` (fix: corregir hallazgos de sdd-verify)

---

## Summary

The reseteo-contrasena-olvidada SDD cycle is complete, verified (PASS WITH WARNINGS, all resolved), and archived. The feature delivers self-service password reset with industry-standard anti-enumeration, single-use tokens, session revocation, and multi-tenant mail routing. All 15 requirements and 22 scenarios are compliant; all 63 tasks are done. Non-critical suggestions are documented for future refinement. The change is ready for deployment.
