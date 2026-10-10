# Proposal: Login with Google or Microsoft (roadmap stage 2, point 7)

## Intent

Today the only way in is email + password. Point 7 lets existing users sign in with a Google or Microsoft account, without weakening 2FA, tenant isolation or ROOT access, and without auto-registration. Cycle issue: #507.

Product decision (cite by path): `docs/roadmap-comercial.md` → "Decisiones de producto de la segunda etapa" → "Segunda etapa, punto 7 — login con Google o Microsoft (SSO)", including "Precisiones del 2026-10-09, al explorar". Exploration: `openspec/changes/login-sso/exploration.md`.

## Scope

### In Scope: every decision bullet becomes a requirement

| # | Bullet | Capability |
|---|---|---|
| D1 | Only existing users, matched by provider-verified email; no auto-registration | `auth-sso-login` |
| D2 | Coexists with the password; forgot-password unchanged; offboarding = deactivate membership | `auth-sso-login` |
| D3 | Own 2FA after SSO with today's rules and the 30-day device; SSO is not a second factor | `auth-sso-login`, `auth-2fa-login`, `auth-2fa-dispositivo-confiable` |
| D4 | One app per provider for the platform, server-configured; nothing per client | `auth-sso-configuracion` |
| D5 | Any Google/Microsoft account, personal or org, only with provider-verified email; closes nOAuth | `auth-sso-login` |
| D6 | ROOT never enters by SSO | `auth-sso-login` |
| D7 | First login links to the immutable provider id; another account with the same email is rejected; admin reset with the 2FA-reset criterion | `auth-sso-vinculo` |
| D8 | Client selector unchanged, after SSO and 2FA | `auth-sso-login` |
| D9 | Buttons only on the login screen; no self-service view/unlink | `auth-sso-configuracion` |
| D10 | Out: login audit, auto-registration, "SSO only" policy (asserted as absent) | `auth-sso-login` |
| P1 | Reset = one button deleting links with ALL providers and closing open sessions | `auth-sso-vinculo` |
| P2 | One generic failure message for every reason; real reason only in server logs | `auth-sso-login` |

**Not implemented: none.** Every bullet above is implemented.

### Out of Scope
- D10 items; self-service link view; per-client SSO policy
- Retroactive lowercasing of existing `usuarios.email` (follow-up)
- Ayuda articles (writing suspended). Debt recorded in commits/PRs: SSO buttons, generic SSO error, "Resetear vínculo SSO" button

## Capabilities

### New Capabilities
- `auth-sso-login`: OIDC flow, per-provider token validation, user resolution, rejections, handoff to 2FA/selector, generic failure
- `auth-sso-vinculo`: link storage, first-login linking, mismatch rejection, admin reset
- `auth-sso-configuracion`: env-based per-provider enablement, providers endpoint, login-screen buttons

### Modified Capabilities
- `auth-2fa-login`: L1 (and the L7 ticket definition) — the first factor is password OR SSO
- `auth-2fa-dispositivo-confiable`: D3 — a valid device skips the challenge, never the first factor (password or SSO)
- `auth-limite-intentos`: new `sso:<proveedor>:<sha256(subject)>:<ip>` key, same 5/15 min and generic response

## Approach

Exploration recommendation, adopted unchanged (no flaw found):
- Backend-owned OIDC with `jose` + `fetch`, pinned endpoints, PKCE S256, `response_mode=query`.
- Master table `sso_estados` (hashed state, nonce, verifier, one-time CAS, 10 min, hourly purge), bound to the browser by a BFF `sso_st` cookie.
- Master table `usuarios_identidades_sso`; subject = Google `sub` or Microsoft `<tid>:<oid>`; unique per (user, provider) and (provider, subject).
- Microsoft `common` authority, `iss` from `tid`, `xms_edov === true`; Google `email_verified === true`.
- Case-insensitive email lookup; more than one match is rejected as ambiguous.
- `EvaluarSegundoPasoService` extracted from `LoginUseCase`; the callback ends in a `SELECCIONAR` ticket or a 2FA challenge.
- BFF lands through the login page effect (`/login?sso=1` + `sso_paso` cookie).
- Reset `DELETE /usuarios/:id/sso` uses a shared `puedeResetear` policy extracted from the 2FA reset.

Rules gate:
- Mirrors another layer? Yes: frontend reads the providers endpoint; `proveedor` CHECK is the single source.
- Behavioral alternatives? Rejected: BFF-owned OIDC, stateless sealed cookie, Passport.
- User-visible? Yes: Ayuda debt recorded.

## Affected Areas

| Area | Impact |
|---|---|
| `backend/prisma_master/` (migration + `rollback.sql`) | New |
| `backend/src/auth/` (OIDC adapter, use cases, controller, shared 2FA service, insensitive lookup in `prisma-usuario.repository.ts`, reset + shared policy beside `application/tfa/resetear-tfa-usuario.use-case.ts`) | New/Modified |
| `frontend/src/app/api/auth/sso/`, `frontend/src/shared/auth/cookies.ts` | New/Modified |
| `frontend/src/features/auth/`, `frontend/src/features/usuarios/` | Modified |
| `README.md`, `DEPLOY-VPS-runbook.md` | Modified |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `jose` ESM under `module: commonjs`/node10 (TS7016, runtime `require`) | Med | Spike first in WU-1: typecheck, build, `start`, vitest |
| MSA tokens may omit `email`/`xms_edov` | Med | Reject when absent; staging check with a real personal account |
| Google/Microsoft app registrations do not exist yet | High | Owner creates both before staging; fake IdP covers CI |
| Catch-all BFF proxy exposes backend routes | Med | Literal BFF routes; backend trusts only server-validated state/binding/PKCE |
| Email case variants | Med | Insensitive lookup, ambiguity rejects and logs |
| Proposal exceeds the 450-word budget | Low | Mandated content (mapping, deploy, WUs) |

## Rollback Plan

Additive master migration with `rollback.sql`; standard predeploy dump. Quick mitigation without a revert: remove the `SSO_*` vars, SSO disappears and login is today's. Otherwise revert the chained PRs in reverse order.

## Deploy Impact

- `backend/.env`: `SSO_GOOGLE_CLIENT_ID/SECRET`, `SSO_MICROSOFT_CLIENT_ID/SECRET` (optional; a missing pair disables that provider). No deploy script change.
- Redirect URIs: `https://soporte.sesitec.net/api/auth/sso/{google,microsoft}/callback` (+ localhost for dev).
- Microsoft: multitenant + personal, `email` and `xms_edov` optional claims, `removeUnverifiedEmailClaim: true`, secret-expiry reminder.
- Smoke: IIS/ARR routes `/api/auth/sso/*` with the original Host.

## Dependencies and Work Units

Delivery: auto-chain, feature-branch-chain on `feat/login-sso`, 400-line budget. Rough outline (prod + tests):

| WU | Content | Size |
|---|---|---|
| 1 | Migration, models, repositories, `jose` spike | ~400 |
| 2 | OIDC adapter, validators, config provider | ~650 (split) |
| 3 | `EvaluarSegundoPasoService` extraction | ~180 |
| 4 | Iniciar/Completar use cases, insensitive lookup, limiter | ~700 (split) |
| 5 | Controller, wiring, providers endpoint, e2e with fake IdP | ~650 (split) |
| 6 | Reset endpoint + shared policy | ~340 |
| 7 | BFF routes + cookies | ~500 (split) |
| 8 | Login buttons, `?sso=1` effect, admin reset button | ~450 (split) |
| 9 | README, runbook | ~100 |

## Success Criteria

- [ ] Each D1–D10 and P1–P2 maps to a spec scenario that passes in verify
- [ ] Manual staging check: Google, Microsoft work, Microsoft personal accounts
- [ ] At close, the roadmap bullet declares "Cumplida" or "Desviación" (`check-roadmap-fresco.mjs` passes)
- [ ] Backend and frontend pass lint, typecheck, and tests
