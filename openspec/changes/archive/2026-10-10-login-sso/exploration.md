## Exploration: login-sso (roadmap stage 2, point 7 — login with Google or Microsoft)

### 1. Current state (verified in worktree `.claude/worktrees/login-sso`, main fd2aae32)

**Backend**
- `LoginUseCase.execute` (`backend/src/auth/application/use-cases/login.use-case.ts:137-244`):
  - limiter key `pwd:<sha256(email)>:<ip>`, reserved up front and released on password success;
  - DUMMY_HASH timing defense, then `findByEmail`;
  - step 3 loads active memberships;
  - step 3b is the 2FA decision: with a confirmed secret, a valid `td` device skips the challenge (never for ROOT) and renews the device 30 days; otherwise `needs2fa`. Without a secret, `esObligado2fa(isGlobalAdmin, membresiasActivas)` gives `needsEnrolamiento2fa`;
  - step 4 picks the client: explicit, ROOT = master, 0 memberships = `SinMembresiaActivaError`, 1 = auto, >1 = `selection` with a `SELECCIONAR` ticket (`desafios.crear(usuarioId,'SELECCIONAR')`);
  - step 5-6 is `EmitirSesionService.emitir`.
- `auth_desafios` (`schema.prisma:590`) has `usuario_id` NOT NULL with an FK and a CHECK on `proposito IN ('VERIFICAR','ENROLAR','SELECCIONAR')`. `SELECCIONAR` is born verified (a ticket, 5 min).
- `ContinuarLoginUseCase` (`/auth/login/continuar`): takes a verified ticket. With ROOT or 1 membership it consumes the ticket and emits; with >1 it returns `selection` and does NOT consume. `SeleccionarClienteLoginUseCase` consumes and emits.
- `usuarios.email` is `@unique` and stored exactly as typed. There is no lowercasing anywhere: `PrismaUsuarioRepository.findByEmail` is `findUnique({where:{email}})`, and `normalizarEmail` is used only for limiter keys. The email is immutable (the PATCH only edits name and surname). `Juan@x.com` and `juan@x.com` are two possible rows.
- `ResetearTfaUsuarioUseCase` (`DELETE /usuarios/:id/2fa`, `AdminClienteGuard`):
  - ROOT can reset anyone;
  - ADMINISTRADOR only a non-ROOT with an active membership in his client, where ALL of the target's memberships (including inactive, soft-deleted and suspended clients) belong to that client;
  - any failure returns the same `MembresiaNoEncontradaError` (404);
  - effects: `eliminarTodo` in a transaction, then revoke refresh tokens (log-and-swallow).
- `PrismaLimitadorIntentos`: 5 failures per 15 min per key, `varchar(200)` key. `reservar` counts every attempt, `liberar` clears it on success. The `cod:<usuarioId>` key is shared by all second-step codes.
- Config: `entorno.ts` freezes only `DATABASE_URL_MASTER`, `APP_BASE_URL`, `JWT_SECRET`. Optional vars such as `EMAIL_CRYPTO_KEY` are read from `process.env` at use time and degrade explicitly. A lint rule forbids `process.env.X ?? ''` and similar.
- `APP_BASE_URL` is the required public base URL (README:160, used for email links). `main.ts` uses `setGlobalPrefix('api')`.
- No `jose`, `openid-client`, `google-auth-library` or `@azure/msal-node` in backend `package.json`. `@nestjs/passport` and `passport-jwt` exist (JWT only).
- `backend/tsconfig.json`: `module: commonjs`, no `moduleResolution`, so node10. Node >= 24.

**Frontend / BFF**
- Cookies `at`/`rt`/`td` (`shared/auth/cookies.ts`): httpOnly, `sameSite: lax`, `__Host-` prefix in production, Path `/`.
- `shared/auth/sesion-bff.ts`: `ipDelNavegador` (rightmost X-Forwarded-For) and `responderConSesion` (sets `at`/`rt`, re-sets `td` on `dispositivoConfiable`, strips it from the body).
- `api/auth/login/route.ts` deletes any client-sent `dispositivoConfiable` and uses only the `td` cookie.
- `api/[...path]/route.ts` is a generic proxy forwarding any `/api/*` to `${BACKEND_URL}/*`. Literal route files win over it.
- `middleware.ts` excludes `api`. For `/login` with a live session it redirects to `/`.
- `use-login.ts` is a step machine in React state (`credenciales | codigo | enrolamiento | codigos | seleccion`) that holds `desafio`/`ticket` only in memory. `alResponder` writes `soporte:idle:last-activity` and does `window.location.assign(destinoPosLogin(siguiente))`.
- `AvisoMotivo` reads `?motivo=` and is an existing precedent for a message banner. `destinoPosLogin` is a strict allowlist (`/` or `/pedido-qr...`).
- `jose@^6.2.3` is already a frontend dependency (Edge middleware).
- The "Resetear 2FA" button lives in `features/usuarios/components/editar-usuario-dialog.tsx`, with the mutation in `hooks/use-usuarios-tenant-mutations.ts:107`.
- There is no CSP and no `web.config` in the repo (IIS/ARR config lives on the VPS).
- There is no `.env.example` in the repo. Env vars are documented in `README.md:148-212` and `DEPLOY-VPS-runbook.md`.

**Tests**
- Backend e2e pattern: `Test.createTestingModule({imports:[SharedModule, AuthModule]})`, a real HTTP listener, `usarLockMasterTest()`, users and clients with a random suffix, cleanup in `afterAll`. Examples: `login-2fa.e2e.spec.ts`, `usuarios-reseteo-tfa.e2e.spec.ts`.
- `tfa-de-test.ts` provides TOTP helpers.

### 2. Where the flow lives — approaches

| # | Approach | Pros | Cons | Effort |
|---|---|---|---|---|
| A | **Backend-owned OIDC.** Backend builds the authorize URL, exchanges the code, validates the id_token, resolves and links the user, then runs the same 2FA/ticket pipeline. The BFF is a thin transport: `iniciar` → redirect, `callback` → backend → cookie handoff, `paso` → pickup. State, nonce and verifier live in a new master table. A BFF cookie binds the flow to the browser. | The backend already owns identity and sessions. Client secrets stay in `backend/.env` (the `JWT_SECRET` / `EMAIL_CRYPTO_KEY` precedent). It reuses 2FA and the limiter. It is testable with a fake IdP over HTTP. | One new table plus a purge. | Medium |
| B | **BFF-owned OIDC.** Next does the exchange with `jose` and tells the backend "user X authenticated". | Cookies are at hand. | The backend would need a privileged "mint a session for X" endpoint, and the browser can reach any backend route through the catch-all proxy. Client secrets move to the frontend env. It breaks the "backend owns sessions" boundary. | Medium and risky |
| C | **Variant of A with no state table**: a sealed cookie (JWE/HMAC) carries verifier and nonce. | No table, no purge. | The backend must trust verifier and nonce from the BFF. No server-side one-time CAS. Needs a new sealing key (reusing `JWT_SECRET` is key reuse). | Medium |
| D | Passport strategies (`passport-google-oauth20`, `passport-azure-ad`) | Familiar. | `passport-azure-ad` is deprecated (from my knowledge, not re-verified). Session-oriented. Two libraries with different validation behavior. | Medium |

**Recommendation: A.**

**Where state, nonce and PKCE live.** A new master table `sso_estados`: `state_hash` PK (sha256), `proveedor`, `nonce`, `code_verifier`, `navegador_hash`, `siguiente`, `expira_at` (10 min), `usado_at`. It follows the project style of opaque hashed tokens in master (`auth_desafios`, `password_reset_tokens`).
- `auth_desafios` is NOT reusable as is: `usuario_id` is NOT NULL (no user exists yet at initiation) and the CHECK limits `proposito`.
- The state row is consumed with a CAS: `UPDATE ... SET usado_at WHERE state_hash=? AND usado_at IS NULL AND expira_at>now()`.
- Purge expired rows hourly, copying `PrismaLimitadorIntentos.purgarSiCorresponde`.

**Login-CSRF defense.** The row alone does not bind the flow to the victim's browser. At `iniciar` the backend returns `{authorizeUrl, bindingToken}`. The BFF sets httpOnly cookie `sso_st` (value = `bindingToken`, Lax, 10 min, `__Host-` in prod via `cookieName()`, Path `/`). The row stores `sha256(bindingToken)`. At the callback the BFF forwards `{proveedor, code, state, binding(cookie), ip, td}` and the backend requires both the `state` row and the matching `navegador_hash`.

**Callback → pipeline handoff, no bypass.**
1. Extract steps 3-3b of `LoginUseCase` into a shared application service (for example `EvaluarSegundoPasoService.evaluar(usuario, membresiasActivas, dispositivoConfiable)`). It returns `needs2fa | needsEnrolamiento2fa | continuar{dispositivoRenovado?}`. `LoginUseCase` and the new SSO use case both call it, so the 2FA obligation rule exists in one place. Duplicating those ~25 lines would let the security rule diverge.
2. On `continuar`, the SSO use case creates a `SELECCIONAR` ticket (`desafios.crear(usuarioId,'SELECCIONAR')`, born verified). This is the same ticket `LoginUseCase` already issues at line 224. It never emits tokens itself.
3. Backend `POST /auth/sso/:proveedor/callback` returns `{needs2fa,desafio} | {needsEnrolamiento2fa,desafio} | {ticket}` (+ `dispositivoConfiable` when a trusted device was renewed).
4. The BFF `GET /api/auth/sso/:proveedor/callback` re-sets `td` if returned. It writes a small httpOnly cookie `sso_paso` = `{k:'2fa'|'enrol'|'ticket', t:<opaque token>}` (only ~70 bytes, never the JWT because the access token's `membresias[]` can be large). Then it redirects 302 to `/login?sso=1[&siguiente=...]` with `Cache-Control: no-store`.
5. The login page, on mount with `?sso=1`, calls BFF `GET /api/auth/sso/paso`. The route reads and clears the cookie and returns the payload. The hook then calls the existing `alResponder` for 2FA or enrol, or the existing `continuar(ticket)` (`auth/login/continuar`) for the ticket. The result is tokens or the existing selector.
6. Why not set `at`/`rt` in the callback and redirect to `/`: `soporte:idle:last-activity` in localStorage would be stale and the idle-timeout would cut the session on landing (see `use-login.ts:150-155`). The middleware would also redirect `/login` away before the page effect runs. Going through the page effect keeps `alResponder`'s `writeLastActivity` intact.

**Properties kept as a bonus**: the selector is unchanged (decision 8) and ROOT never reaches this path (decision 6).

### 3. Library options (backend)

| Option | Assessment |
|---|---|
| **`jose` + `fetch`, thin hand-rolled OIDC (recommended)** | One dependency (jose 6.2.12, no deps). `createRemoteJWKSet` gives JWKS caching, cooldown and `kid` rotation; `jwtVerify` checks signature, `iss`, `aud`, `exp`, `nbf`. The code is ~150 lines for both providers: build authorize URL (S256 PKCE), POST the token endpoint with `client_secret_post`, validate. Endpoints are pinned constants per provider (no runtime discovery, no mix-up surface). A fake IdP in tests is trivial. |
| `openid-client` 6.8.8 | Depends on `oauth4webapi` + `jose`, ESM-only. Discovery validates `issuer` equal to the requested URL; Microsoft `/common` returns `https://login.microsoftonline.com/{tenantid}/v2.0`, so it needs workarounds (my understanding; I did not test it). Adds an abstraction we would bypass for the Microsoft-specific checks anyway. |
| `google-auth-library` 11.2.0 | Google only. Pulls gaxios, gcp-metadata, jws. Nothing for Microsoft. |
| `@azure/msal-node` 7.0.1 | Microsoft only, large, token-cache machinery we do not need, and it does not give the `xms_edov`/`tid` checks we need. |

**Typing and ESM gotcha (must be a spike in the first work unit)**: jose 6 is `"type":"module"` and its `exports` have only `types` and `default` conditions. Runtime on Node 24: `require()` of ESM (no top-level await) works, but this is NOT tested here. TypeScript with `module: commonjs` and node10 resolution ignores `exports`, and `package.json` has no top-level `types`, so `import ... from 'jose'` would likely give TS7016 under `strict`. Candidate one-line fix: an ambient `declare module 'jose' { export * from 'jose/dist/types/index'; }`, since node10 resolves the deep path physically. Do NOT use `tsconfig paths` for it: `tsc-alias` would rewrite the runtime `require('jose')`. Fallback: `moduleResolution: node16` with `module: node16` (wider blast radius). The spike must prove `pnpm typecheck`, `pnpm build`, the `start` output and vitest.

### 4. Microsoft specifics (decision 5, nOAuth)

Sources: Microsoft Learn [optional claims reference](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference), [ID token claims reference](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference), [validating claims](https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation), [Graph authenticationBehaviors](https://learn.microsoft.com/en-us/graph/applications-authenticationbehaviors), [OIDC](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc), and the live `common` discovery document.

- **Authority: `common`.** The docs say `common` = personal accounts and work or school accounts, `organizations` = work or school only, `consumers` = personal only. Decision 5 needs both, so use `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` and `/token`, and `https://login.microsoftonline.com/common/discovery/v2.0/keys` for JWKS. The app registration must be "multitenant + personal Microsoft accounts" (signInAudience).
- **Issuer validation for multi-tenant.** The `common` discovery document returns `issuer: https://login.microsoftonline.com/{tenantid}/v2.0` (verified live). Validate `iss === 'https://login.microsoftonline.com/' + payload.tid + '/v2.0'` using the token's own `tid`. This is safe only after the signature is verified. Also require `aud === clientId`, `nonce`, `exp`, and `ver === '2.0'`. In jose, pass a custom check after `jwtVerify` (omit the `issuer` option and compare manually) because the issuer depends on a claim.
- **Immutable identifier.** Microsoft says never to use `email`, `preferred_username` or `upn` to identify or authorize a user, and to use `sub` or `oid`, with `tid` for routing; `oid`+`tid` is best when sharing across apps. `sub` is pairwise per app ID, so changing the app registration would break the link. Recommend the link subject = `<tid>:<oid>`.
- **Personal accounts.** `tid` for personal accounts is `9188040d-6c67-4c5b-b112-36a304b66dad`. A personal account's `oid` is a GUID in the sample v2 token.
- **nOAuth mitigation.**
  - Microsoft's default: new multitenant apps have unverified-domain email claims removed (June 2023). The exceptions are single-tenant apps and multitenant apps with earlier unverified sign-in activity.
  - `removeUnverifiedEmailClaim` is in the Graph docs (v1.0 and beta pages) and is set with a PATCH on the application's `authenticationBehaviors` (204). Since this is a new app registration, the default should already apply. The runbook should still make the operator set `removeUnverifiedEmailClaim: true` explicitly and record it.
  - `xms_edov` is an optional claim ("whether the user's email domain owner has been verified"). It is returned only if `email` is present. Per the docs, an email is domain-verified if it belongs to the tenant of the user's account and the tenant admin verified the domain; "also, the email must be from a Microsoft account (MSA), a Google account, or OTP". Facebook and SAML/WS-Fed accounts do not have verified domains. Note that the `common` discovery `claims_supported` did not list `xms_edov`, so do not rely on discovery for it; enable it in the app manifest (third-party guides describe adding `email` and `xms_pdl` and renaming to `xms_edov` in the manifest; this needs hands-on confirmation in the portal).
  - **Recommended rule (defense in depth, both)**: require `email` present AND `xms_edov === true` (boolean strictly true) AND signature, `aud`, `nonce`, `iss`/`tid` valid. Operator also sets `removeUnverifiedEmailClaim: true`. Never fall back to `preferred_username` or `upn`.
- **MSA "verified email".** The docs say MSA emails count toward `xms_edov`. Open item: whether personal-account v2 ID tokens always include `email` with the `email` scope and `xms_edov`. If `email` is absent the login is simply rejected. Needs a staging check with a real MSA account. Also, Microsoft treats the email claim as non-authoritative in general; our decision (identify by verified email on FIRST login, then by immutable id) is exactly the pattern Microsoft tolerates as long as the claim is verified. The first-login risk window is the real exposure, hence the strict `xms_edov`.

### 5. Google specifics (decision 5)

Sources: [Google OpenID Connect guide](https://developers.google.com/identity/openid-connect/openid-connect) and the live discovery document.
- Endpoints: authorize `https://accounts.google.com/o/oauth2/v2/auth`, token `https://oauth2.googleapis.com/token`, JWKS `https://www.googleapis.com/oauth2/v3/certs`. Discovery lists `code_challenge_methods_supported: [plain, S256]`, `id_token_signing_alg_values_supported: [RS256]`, and token auth `client_secret_post | client_secret_basic`.
- `iss` must be `https://accounts.google.com` or `accounts.google.com` (both accepted; jose `issuer` accepts an array). `aud` must be our client id. `exp` checked. `nonce` must match.
- `sub` is the stable identifier ("use `sub` as the unique-identifier key"); the email "may not be unique and can change".
- Require `email_verified === true` for the first-login email match. `hd` is the Workspace domain (absence = consumer account). Decision 5 accepts any account, so do NOT filter on `hd`. Optionally log it.

### 6. Data model for the provider link (decision 7)

**Recommendation: a new master table, not columns on `usuarios`.** It cascades on delete, is extensible and symmetric with `usuarios_tfa`; the reset is a DELETE.

`usuarios_identidades_sso` (model `UsuarioIdentidadSso`):
- `id uuid PK`
- `usuario_id uuid NOT NULL` FK to `usuarios` ON DELETE CASCADE
- `proveedor varchar(12) NOT NULL`, CHECK in `('GOOGLE','MICROSOFT')`
- `subject varchar(200) NOT NULL` (Google `sub`; Microsoft `<tid>:<oid>`)
- `email_al_vincular varchar(255) NOT NULL` (informational: what the admin sees as "linked to ...")
- `created_at timestamptz NOT NULL DEFAULT now()`
- `UNIQUE (usuario_id, proveedor)` — one link per provider per user
- `UNIQUE (proveedor, subject)` — one user per provider account

A single composite `subject` string avoids Postgres NULL-distinct behavior in a nullable `tenant_id` column.

`sso_estados` (model `SsoEstado`), as in section 2.

Migration: additive on master only, with `rollback.sql`, following `20261008120000_verificacion_dos_pasos` (which has a `rollback.sql` and CHECK constraints in SQL). No data backfill. No tenant migration. No impact on existing rows.

**Lookup algorithm on callback (after the id_token is validated):**
1. Look up the link by `(proveedor, subject)`. If found → user = that link's user (identification by immutable id; email is not rechecked, since the email is immutable on our side and the provider's can legitimately change).
2. If not found → require the verified email (Google `email_verified===true`; Microsoft `xms_edov===true`). Find the user by case-insensitive email.
   - Zero rows → reject. Two or more rows (case variants) → reject as ambiguous and log. NEW port method needed, because `findByEmail` is exact; for example `findAllByEmailInsensitive` using Prisma `mode:'insensitive'`.
   - If the found user already has a link for this provider with a different subject → reject (the "same email, another account" case, decision 7).
   - Else `INSERT ... ON CONFLICT DO NOTHING` on `(usuario_id, proveedor)`, then re-read and compare the subject. First writer wins; a concurrent second one loses and is rejected. A unique violation on `(proveedor, subject)` (the same provider account matching a second user) → reject and log.
3. After resolving the user: reject if `isGlobalAdmin` (decision 6; checked at every login, BEFORE creating any link or ticket, so a user promoted to ROOT after linking is also rejected); reject if `!activo` or `isDeleted()`; load active memberships and reject with `SinMembresiaActivaError` if none (same as the password/continuar path). Deactivating a membership stays the offboarding mechanism (decision 2).
4. Then the shared second-step evaluation (section 2).

**Reset endpoint (decision 7)**: `DELETE /usuarios/:id/sso`, `AdminClienteGuard`, mirrors `resetearTfa`: `ResetearVinculoSsoUseCase`. Deletes ALL links of the user (one action, one button), then revokes refresh tokens with log-and-swallow (the typical reason is an address that passed to another person, so old sessions should die). Authorization: extract `puedeResetear` (`resetear-tfa-usuario.use-case.ts:62-74`) into a shared policy function (for example `puedeResetearAUsuario({actorEsRoot, clienteId, destinoId})`) used by both use cases, so the "ROOT any; ADMINISTRADOR only a non-ROOT whose memberships are ALL in his client" rule has one implementation. All denials return the same 404 (`MembresiaNoEncontradaError`). ROOT target is a no-op 204 for a ROOT actor.

### 7. Rate limiter and attempt keys (item 6)

- No guessable secret exists in SSO, so the limiter is a cost/hammering guard, not the primary defense. Order of operations avoids cheap abuse: the `state` row lookup and CAS happen BEFORE any outbound call to the IdP; a bad state is a cheap rejection and cannot be brute-forced (256-bit random).
- After the id_token validates, reserve `sso:<proveedor>:<sha256(subject)>:<ip>` (about 90 chars, fits `varchar(200)`). Release on success, same as `pwd:`. Blocked returns the same generic failure.
- The 2FA code limiter `cod:<usuarioId>` is unchanged and shared (I6).
- Do NOT put an IP-only limiter on `iniciar`: schools behind one NAT would block each other (the existing `pwd:` key includes the email hash for this reason). Bound table growth by purge and short TTL instead.
- ROOT rejection, unknown email, link mismatch and inactive user all count as failures for the key above and all return the same BFF message.

### 8. Config and deploy (item 7)

Backend `backend/.env` (optional, per provider; SSO for a provider is disabled when its pair is absent; NOT in `VARIABLES_REQUERIDAS`, so the app still boots without them):
- `SSO_GOOGLE_CLIENT_ID`, `SSO_GOOGLE_CLIENT_SECRET`
- `SSO_MICROSOFT_CLIENT_ID`, `SSO_MICROSOFT_CLIENT_SECRET`
- Redirect URI is derived, not configured: `${APP_BASE_URL}/api/auth/sso/<google|microsoft>/callback`.

Read the vars at use time with a small configuration provider that returns `null` when absent. Never write `process.env.X ?? ''` (the lint rule in `regla-env-vacio.lint.spec.ts` rejects it). Provide the endpoints and config through a DI token so tests can inject a fake IdP.

Frontend: no new env. The login page needs to know which buttons to show: public `GET /auth/sso/proveedores` (returns configured providers only; the catch-all proxy forwards it). The BFF redirects use `new URL(path, request.url)` like the middleware.

Deploy impact:
- `README.md` env table (`148-161`) and `DEPLOY-VPS-runbook.md`: new vars and the provider consoles' steps.
- Register redirect URIs in both consoles: `https://soporte.sesitec.net/api/auth/sso/google/callback` and `/microsoft/callback`. Dev: `http://localhost:<port>/...` (Google and Microsoft allow http localhost; verify when configuring).
- Microsoft client secrets expire (up to 24 months): add an expiry reminder to the runbook.
- Microsoft app manifest: signInAudience multitenant + personal, enable `email` and `xms_edov` optional claims, set `removeUnverifiedEmailClaim: true`.
- `deploy.ps1` loads `backend/.env` into the process and pushes only `JWT_SECRET` to the NSSM `AppEnvironmentExtra`. Because `dotenv/config` is loaded by `main.ts` and does not override the NSSM/machine env, the new vars live only in `backend/.env`, with no deploy script change. Confirm no stale MACHINE var of the same name exists.
- Unknown (VPS-side, outside the repo): whether IIS/ARR preserves the Host header and whether `/api/auth/sso/*` is routed to Next unchanged. The middleware already redirects with `request.url` successfully, which is indirect evidence. Confirm with a deploy smoke test.
- Use `response_mode=query` for both providers (the default for the code flow). Do NOT use `form_post`: a cross-site POST would not carry the `sameSite=lax` `sso_st` cookie, and the binding would always fail.

### 9. Frontend (item 8)

New BFF routes (literal files so the catch-all never serves them):
- `GET /api/auth/sso/[proveedor]/iniciar` — validates the provider against an allowlist, reads `?siguiente=` and sanitizes it with `destinoPosLogin`, calls backend `POST /auth/sso/:proveedor/iniciar`, sets `sso_st`, 302 to `authorizeUrl`.
- `GET /api/auth/sso/[proveedor]/callback` — handles `error=access_denied` (back to `/login`, no message), reads `sso_st` and `td`, passes the browser IP via `x-soporte-ip-navegador`, calls backend, re-sets `td`, writes `sso_paso`, clears `sso_st`, redirects to `/login?sso=1`. Any failure redirects to `/login?motivo=sso-error` (one generic message for no-user / mismatch / ROOT / inactive / unverified, with the real reason only in server logs).
- `GET /api/auth/sso/paso` — reads and clears `sso_paso`, returns the payload.
- Add `COOKIE_SSO_ESTADO` and `COOKIE_SSO_PASO` to `shared/auth/cookies.ts`, with the same `cookieAttrs` helpers.

Login page: "Continuar con Google" / "Continuar con Microsoft" buttons in `LoginForm` or beside it (`<a href="/api/auth/sso/google/iniciar">`, full navigation, not fetch), shown only for providers returned by `GET /auth/sso/proveedores`. Extend `use-login.ts` with a mount effect for `?sso=1` that calls `paso` and feeds `alResponder`; add `auth/sso/paso` to `RUTAS_SIN_REFRESH` in `shared/api/client.ts` (a 401 there must not trigger refresh). Extend `AvisoMotivo` with `sso-error`. Add a "Resetear vinculo SSO" action next to "Resetear 2FA" in `editar-usuario-dialog.tsx` with its mutation hook.

Gotcha: the catch-all proxy forwards any `/api/...` browser request to the backend. Do not rely on a backend-only route being unreachable. The new backend routes must be safe if called directly: nothing security-relevant may be trusted from request bodies except what is validated server-side (state, binding hash, PKCE).

### 10. Testing strategy (item 9)

- **Fake IdP in-process**: a `node:http` server per spec, plus `jose` (`generateKeyPair`, `exportJWK`, `SignJWT`) serving `/token` (returns a signed id_token with controllable claims) and `/jwks`. Injected through the DI configuration token (authorize/token/JWKS URLs, client id, issuer rule). The real Google and Microsoft are never contacted. Unit-test claim validators with signed tokens: bad signature, wrong `aud`, wrong `iss`, expired, wrong `nonce`, `email_verified:false`, `xms_edov` missing/false, Microsoft `iss`/`tid` mismatch, ROOT, missing `email`.
- **Backend e2e** following `login-2fa.e2e.spec.ts` (`usarLockMasterTest()`, random suffix, ephemeral tenants not needed because login is master-only): first login links; second login by subject; another subject with the same email rejected; case-variant email; two case-variant rows (ambiguous); inactive user; zero memberships; membership deactivated; ROOT rejected with no link row created; 2FA-required client gives `needs2fa`; trusted device skips and renews; multi-membership returns the existing selector via `continuar`; replay of the same `state`; wrong binding; expired state; concurrent first logins; reset by ROOT, by an ADMINISTRADOR of a single-client user, by an ADMINISTRADOR of a multi-client user (404).
- **Mutation checks** like earlier cycles: drop the ROOT check, drop `xms_edov`, drop the binding check, drop the state CAS, each must make a test fail.
- **BFF**: Vitest route tests (pattern of `api/auth/login/route.test.ts`) with mocked `fetch`, for cookie attributes, redirect targets, `siguiente` sanitization, and error mapping. Login page tests for button visibility and the `?sso=1` effect.
- The real-provider hand check (one Google account, one work Microsoft account, one personal Microsoft account) belongs to a manual staging step in the verify phase.

### 11. Decision bullet → where it lands

| Decision (roadmap, point 7) | Where it lands in code |
|---|---|
| 1. Only existing users, recognized by the provider-verified email; no auto-registration | New `CompletarSsoUseCase` (+ new port `findAllByEmailInsensitive` on `IUsuarioRepository`/`PrismaUsuarioRepository`). Unknown email = generic reject; no create path exists. `email_verified===true` (Google), `xms_edov===true` (Microsoft) enforced in the per-provider validators. |
| 2. SSO coexists with the password; forgot-password unchanged; deactivation by membership | `LoginUseCase` and the reset-password flow stay behavior-identical; `usuarios.password_hash` stays NOT NULL. SSO rejects `!activo`/`isDeleted()` and uses `findActivasByUsuario` (zero = `SinMembresiaActivaError`). No new per-client policy table. |
| 3. Own 2FA after SSO with today's rules; `td` 30-day device; SSO is not a second factor | New shared `EvaluarSegundoPasoService` extracted from `login.use-case.ts:171-203` and used by both flows; `esObligado2fa` and `DISPOSITIVO_CONFIABLE_DURACION_MS` untouched; BFF passes the `td` cookie to the SSO callback; `td` re-set from `dispositivoConfiable`. |
| 4. One app per provider for the whole platform, server-configured, no per-client config | Backend `SSO_*` env vars read at use time through a configuration provider (no new table, no client-level encryption). |
| 5. Any Google/Microsoft account, personal or organizational, only with provider-guaranteed verified email; closes nOAuth | Per-provider validators in the new OIDC adapter: Google `email_verified`; Microsoft `common` authority, `iss` built from `tid`, `xms_edov===true`, never `preferred_username`; Entra app manifest and `removeUnverifiedEmailClaim` in the runbook. |
| 6. ROOT does not enter by SSO | `CompletarSsoUseCase` rejects `usuario.isGlobalAdmin` on every login before any link or ticket is created; ROOT keeps password + authenticator only. |
| 7. First login links to the provider's immutable id; other account with the same email is rejected; admin reset with the 2FA-reset criterion | New table `usuarios_identidades_sso` + migration + `UsuarioIdentidadSso` repository; subject = `sub` / `<tid>:<oid>`; atomic first-writer-wins insert. New `DELETE /usuarios/:id/sso` use case with the shared `puedeResetear` policy extracted from `resetear-tfa-usuario.use-case.ts`. |
| 8. Client selector unchanged; chosen after SSO and 2FA | The SSO use case ends with a `SELECCIONAR` ticket consumed by the unchanged `ContinuarLoginUseCase` / `SeleccionarClienteLoginUseCase`. No selector change. |
| 9. Buttons only on the login screen; user cannot see or unlink their own account in this delivery | `LoginForm`/login page buttons only. No profile screen, no self-service endpoint. The only unlink path is the admin reset button in `editar-usuario-dialog.tsx`. |
| 10. Out of scope: login audit, auto-registration, "SSO only" policy | Nothing built. Only server logs of reject reasons (no audit table). Do not add a per-client policy column. |

### 12. Risks

- **Open redirect**: the authorize URL and redirect URI are built entirely server-side from config; `siguiente` is the only user-influenced redirect and passes through `destinoPosLogin` (strict allowlist) at `iniciar`, then again at the final navigation.
- **CSRF / login CSRF on the callback**: needs `state` + the browser-binding cookie. Do not use `form_post` (cookie not sent cross-site under Lax).
- **Mix-up / replay**: provider is stored in the state row and checked against the route; PKCE S256 and `nonce` per flow; the state row is one-time (CAS).
- **Email case**: stored case-sensitive and exact-matched today. A case-insensitive lookup is needed; two rows differing only by case must reject as ambiguous. Not retroactively normalizing existing data is out of scope but worth noting as a follow-up.
- **Account-linking race**: two simultaneous first logins; solved by unique indexes plus insert-or-compare.
- **Inactive user / deactivated membership / zero memberships**: reject in the SSO path with the same generic BFF message; the shared path returns `SinMembresiaActivaError` (403) for zero memberships, mapped to the generic message.
- **User promoted to ROOT after linking**: ROOT checked at every SSO login, not only at link time.
- **Microsoft personal accounts may omit `email` or `xms_edov`**: reject; verify in staging.
- **`jose` typing under CJS/node10**: spike first (section 3).
- **Catch-all proxy exposure**: keep sensitive inputs server-validated; add literal BFF routes.
- **Stale `last-activity`**: land through the login-page effect (section 2, step 6).
- **`sso_paso` cookie** holds an opaque 5-15 min token (challenge or ticket), not a JWT; clear it on read, httpOnly, `__Host-` in prod.
- **Client secret expiry** (Microsoft) and **secret in `backend/.env`**: runbook reminder; same handling class as `JWT_SECRET`.
- **IIS/ARR host/scheme handling** unverified from the repo.
- **Review process**: no unit tests can prove real-provider behavior; a manual staging check with real accounts is needed at verify.

### 13. Size estimate (changed lines, production + tests) and suggested PR split (400-line cap)

| Area | Prod | Tests |
|---|---|---|
| WU-1 Migration + 2 models + repositories (link, state) + `jose` spike/typing shim | ~220 | ~180 |
| WU-2 OIDC adapter: PKCE/URL builder, token exchange, Google and Microsoft validators, config provider | ~300 | ~350 |
| WU-3 Shared `EvaluarSegundoPasoService` extraction (refactor of `LoginUseCase`) | ~80 (net small) | ~100 adjusted |
| WU-4 `IniciarSso` / `CompletarSso` use cases + errors + email-insensitive lookup + limiter use | ~300 | ~400 |
| WU-5 Controller + module wiring + providers endpoint + e2e with fake IdP | ~200 | ~450 |
| WU-6 Reset endpoint + shared `puedeResetear` policy + e2e | ~120 | ~220 |
| WU-7 BFF routes (3) + cookies + tests | ~200 | ~300 |
| WU-8 Login page buttons + `use-login` effect + `AvisoMotivo` + admin reset button + tests | ~200 | ~250 |
| WU-9 Docs: README env table, runbook (provider consoles, secret expiry), smoke checklist | ~100 | — |
| **Total** | **~1,700** | **~2,250** |

Suggested PR seams: WU-1; WU-2; WU-3+WU-4 (if over 400 lines split 3 / 4); WU-5; WU-6; WU-7+WU-8 (split if over); WU-9 with the last PR. Roadmap bookkeeping: the spec must cite the roadmap section and turn each decision above into a requirement with a scenario; at close the point-7 bullet must declare "Cumplida" or "Desviación" (`scripts/check-roadmap-fresco.mjs`).

### 14. Recommendation

Approach A: backend-owned OIDC with `jose` + `fetch`, state/nonce/PKCE in `sso_estados` bound to the browser by a BFF cookie, a new `usuarios_identidades_sso` link table, and the SSO callback ending in the existing `SELECCIONAR` ticket (or a 2FA challenge) via a shared second-step service extracted from `LoginUseCase`. The BFF lands the user through the login page effect so idle-timeout and the existing screens work unchanged.

### 15. Open questions for propose (product/ops, none reopen the closed decisions)

1. Reset scope: one action that deletes all provider links of the user (recommended) versus per-provider. And should the reset also revoke the user's refresh tokens (recommended, mirroring the 2FA reset)?
2. Failure UX: one generic message for every reject (recommended) versus a specific "your account has no access" for a verified email with no user.
3. Are the Google and Microsoft app registrations created and who owns them (consent screen, publishing status, secret rotation)? This is an external dependency for staging.

### Ready for Proposal
Yes. Run the `jose`/CJS typing spike and the Microsoft personal-account `email`/`xms_edov` check early in the apply phase, and confirm open question 1 before the spec.
