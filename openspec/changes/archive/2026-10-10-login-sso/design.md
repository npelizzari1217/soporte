# Design: login with Google or Microsoft (SSO)

## Technical Approach

Product decision: `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa", bullet
"Segunda etapa, punto 7 — login con Google o Microsoft (SSO)", including "Precisiones del
2026-10-09, al explorar". Proposal: `proposal.md` (D1-D10, P1-P2). Exploration:
`exploration.md`. Every file, line and symbol cited below was re-read on 2026-10-09 at `df1f4110`.

Approach A from the exploration, unchanged. The backend owns the whole OIDC flow. The BFF only
carries data, and the callback ends where the password login already ends: a 2FA challenge or a
`SELECCIONAR` ticket. It never ends in tokens.

1. **`sso_estados`** (master): one-time flow state, bound to the browser.
2. **`usuarios_identidades_sso`** (master): the immutable link (user, provider, subject).
3. **`JoseProveedorOidc`**: `jose` + `fetch`, endpoints pinned per provider, per-provider claim
   validators.
4. **`EvaluarSegundoPasoService`**: extracted from `LoginUseCase`. Both logins share it.
5. **BFF**: three literal routes plus two cookies. The user lands on `/login?sso=1`, where the
   existing `use-login` machine continues.

Two exploration claims were corrected by re-reading the code:

- `jose@6.2.8` (the frontend copy) **does** declare a top-level `"types"` and `"main"`, so node10
  resolution should type it without a shim. ADR-2 keeps the shim only as a fallback.
- Prisma `mode: 'insensitive'` is not used. ADR-5 explains why.

---

## Layer of each piece (`rules.design`)

| Piece | Layer | Why |
|---|---|---|
| `PROVEEDORES_SSO`, slug mapping, `IdentidadSsoVerificada`, `SsoRechazadoError` (+ `motivo`), `SsoNoDisponibleError` | domain (`auth/domain/sso/`, `auth/domain/errors/sso.errors.ts`) | Pure types and errors |
| `ISsoEstadoRepository`, `IIdentidadSsoRepository`, `IProveedorOidc` + tokens | domain (`auth/domain/ports/`) | Contracts without Prisma or jose |
| `IUsuarioRepository.findManyByEmailInsensitive` | domain port, implemented in infrastructure | Lookup contract |
| `EvaluarSegundoPasoService` | application (`auth/application/evaluar-segundo-paso.service.ts`) | Shared by two use cases, like `EmitirSesionService` |
| `puedeResetearAUsuario` | application (`auth/application/politica-reseteo-usuario.ts`) | Orchestrates two ports; shared by two resets |
| `IniciarSsoUseCase`, `CompletarSsoUseCase`, `ResetearVinculoSsoUseCase`, `ListarProveedoresSsoUseCase`, `pkce.ts` | application (`auth/application/sso/`) | One use case per action; `node:crypto` is already used in application (`login.use-case.ts:1`) |
| `ConfiguracionSsoDesdeEntorno` + `CONFIGURACION_SSO` token | infrastructure (`auth/infrastructure/sso/`) | The only place that reads `SSO_*` from `process.env` |
| `JoseProveedorOidc`, `validarClaimsGoogle`, `validarClaimsMicrosoft` | infrastructure (`auth/infrastructure/sso/`) | The only importers of `jose` in production |
| `PrismaSsoEstadoRepository`, `PrismaIdentidadSsoRepository` | infrastructure (`auth/infrastructure/sso/`) | The only places with `@prisma/client` |
| `SsoController`, `sso.dto.ts`, `DELETE /usuarios/:id/sso` | interface | Translate HTTP; no logic |
| Fake IdP | `src/testing/idp-falso.ts` | Excluded from build (`tsconfig.build.json`: `src/testing/**`) |

### Authorization: the two places it lives

| Route | Edge | Inline |
|---|---|---|
| `GET /auth/sso/proveedores` | Public | Returns only the configured providers |
| `POST /auth/sso/:proveedor/iniciar` | Public; the slug is checked against `PROVEEDORES_SSO` (404 otherwise) | Provider not configured → `SsoNoDisponibleError` (404) |
| `POST /auth/sso/:proveedor/callback` | Public. It is reachable through the catch-all proxy only by path tricks, so it is treated as directly reachable | State CAS (hash + provider + browser hash + not used + not expired) → token → limiter → user (link, then email) → inactive / ROOT / no memberships → link → second step. Nothing from the body is trusted except what these checks validate |
| `DELETE /usuarios/:id/sso` | `JwtAuthGuard, TenantGuard` (class) + `AdminClienteGuard` (method), like `resetearTfa` (`usuarios.controller.ts:329-345`) | `puedeResetearAUsuario`; `clienteId = actor.cliente_id`, never from the request |

---

## Architecture Decisions

### ADR-1: backend-owned OIDC with the `sso_estados` table and a BFF binding cookie

| Option | Tradeoff | Decision |
|---|---|---|
| BFF-owned (Next does the exchange) | The backend would need a "mint a session for X" endpoint, reachable through the catch-all proxy (`app/api/[...path]/route.ts`). The client secrets would move to the frontend env | Rejected |
| Sealed cookie (JWE/HMAC holding verifier and nonce) | No table, but no server-side one-time CAS. It needs a new key, and reusing `JWT_SECRET` would be key reuse | Rejected |
| Passport strategies | Session-oriented; two libraries with different validation | Rejected |
| **Backend-owned, state in master** | One table plus a purge. Mirrors `auth_desafios` (opaque token, hash stored) | **Chosen** |

`sso_estados`:

| Column | Type | Note |
|---|---|---|
| `state_hash` | `TEXT` PK | sha256 hex of a 32-byte random `state`; the raw value only travels in the URL |
| `proveedor` | `VARCHAR(12) NOT NULL` | CHECK `IN ('GOOGLE','MICROSOFT')` |
| `nonce` | `TEXT NOT NULL` | 32 random bytes, base64url |
| `code_verifier` | `TEXT NOT NULL` | PKCE S256; stored raw because the token endpoint needs it. One-time use, 10 minutes |
| `navegador_hash` | `TEXT NOT NULL` | sha256 of `bindingToken` (`sso_st` cookie) |
| `siguiente` | `VARCHAR(300)` NULL | Already sanitized by the BFF, which sanitizes it again on landing |
| `expira_at` | `TIMESTAMPTZ NOT NULL` | `now() + 10 min`; indexed |
| `usado_at` | `TIMESTAMPTZ` NULL | Set by the CAS |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | |

The consume is one statement, run **before any outbound call**:

```sql
UPDATE sso_estados SET usado_at = now()
WHERE state_hash = $1 AND proveedor = $2 AND navegador_hash = $3
  AND usado_at IS NULL AND expira_at > now()
RETURNING nonce, code_verifier, siguiente;
```

- Zero rows covers replay, expiry, an invented state, a crossed provider, or a missing or foreign
  binding. All of them return `SsoRechazadoError`. On a binding or provider mismatch the row stays
  unconsumed, so an attacker who holds a stolen `state` cannot burn the victim's flow.
- Purge: `purgarSiCorresponde()` copied from `PrismaLimitadorIntentos` (`prisma-limitador-intentos.ts:54-65`).
  It runs at most hourly, inside `crear()`: `DELETE FROM sso_estados WHERE expira_at < now() - interval '1 hour'`.
  A purge failure never fails a login.
- Binding cookie `sso_st`: httpOnly, `sameSite: lax`, `__Host-` in production through
  `cookieName()`, `Path=/`, 600 s. Lax is sent on the top-level GET coming back from the IdP, which
  is why `response_mode=query` is used and never `form_post`.

### ADR-2: `jose` 6 + `fetch`, endpoints pinned, ESM spike gate in WU-1

| Option | Tradeoff | Decision |
|---|---|---|
| `openid-client` | ESM-only as well. Discovery rejects the `common` issuer template; we would bypass it for the Microsoft checks anyway | Rejected |
| `google-auth-library` + `@azure/msal-node` | Two libraries, neither gives `xms_edov`/`tid` checks | Rejected |
| **`jose` (`createRemoteJWKSet`, `jwtVerify`) + `fetch`** | One dependency with no dependencies of its own. We own about 150 lines of protocol code | **Chosen** |

Pinned endpoints (no runtime discovery):

| Provider | authorize | token | JWKS | issuer |
|---|---|---|---|---|
| Google | `https://accounts.google.com/o/oauth2/v2/auth` | `https://oauth2.googleapis.com/token` | `https://www.googleapis.com/oauth2/v3/certs` | `['https://accounts.google.com','accounts.google.com']` |
| Microsoft | `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` | `…/common/oauth2/v2.0/token` | `…/common/discovery/v2.0/keys` | template `https://login.microsoftonline.com/{tid}/v2.0` |

- Authorize parameters: `response_type=code`, `scope=openid email profile` (Microsoft only returns
  `oid` with `profile`), `state`, `nonce`, `code_challenge` (S256), `response_mode=query`,
  `prompt=select_account`.
- Token request: `client_secret_post`, `AbortSignal.timeout(10_000)`.
- Verification: `algorithms: ['RS256']`, `clockTolerance: 30` s. One memoized `createRemoteJWKSet`
  per JWKS URL.

**ESM spike (first task of WU-1, gate for everything else).** Facts: backend `module: commonjs`
with no `moduleResolution`, so node10 (`backend/tsconfig.json:3`). jose 6 is `"type":"module"` but
also ships top-level `"types": "./dist/types/index.d.ts"` and `"main"`. Under node10, TypeScript
reads `types` and does not detect the package format. Node `require(esm)` has been unflagged since
22.12, and jose has no top-level await.

- Runtime coverage: Node 24 covers `require(esm)`. The VPS Node 22.23.2 also clears 22.12, so the
  runtime is covered whichever binary the NSSM service uses.
- Imports: use only named imports (`import { jwtVerify } from 'jose'`). A default import goes
  through `__importDefault` and is not proven.

Spike file: `src/auth/infrastructure/sso/jose-humo.ts`. It signs and verifies a token with a
generated key pair. Pass criteria, every one required:

1. `pnpm typecheck`: 0 errors **without** a shim.
2. `pnpm build` succeeds, and `node -e "require('./dist/auth/infrastructure/sso/jose-humo.js').humo().then(console.log)"`
   prints `ok`, with no `ERR_REQUIRE_ESM` and no `ERR_REQUIRE_ASYNC_MODULE`. Any `ExperimentalWarning`
   is recorded in `apply-progress.md`. A warning alone does not fail the spike.
3. `pnpm vitest run` on the humo spec is green.
4. `pnpm lint` reports 0 errors.
5. `pnpm start` boots. It is repeated in WU-5a, once `AuthModule` imports the adapter, with
   `GET /api/auth/sso/proveedores` answering 200.

Fallbacks, in order:

- **If criterion 1 fails with TS7016**, add the ambient shim `src/types/jose.d.ts`:
  `declare module 'jose' { export * from 'jose/dist/types/index'; }`. Node10 resolves the deep path
  physically.
- **Never** add `tsconfig paths` for jose. `tsc-alias` would rewrite the runtime `require`.
- **If criterion 2 fails**, stop and report. The next option is `module/moduleResolution: node16`
  for the whole backend, and that is a separate decision.

`jose-humo.ts` is deleted in WU-2b, when the real adapter replaces it.

### ADR-3: provider validators and the DI configuration token

Both validators are pure functions over the payload that `jwtVerify` already accepted. Each returns
`IdentidadSsoVerificada | motivo`.

| Check | Google (`validarClaimsGoogle`) | Microsoft (`validarClaimsMicrosoft`) |
|---|---|---|
| Signature, `aud`, `exp`/`nbf`, alg | `jwtVerify` with `audience`, `issuer` array | `jwtVerify` with `audience`, **no `issuer` option** |
| Issuer | Covered by `jwtVerify` | After the signature: `typeof tid === 'string'` and `iss === plantilla.replace('{tid}', tid)` |
| Version | — | `ver === '2.0'` |
| Nonce | `nonce ===` stored | Same |
| Subject | `sub` (non-empty string) | `` `${tid}:${oid}` `` (both non-empty strings) |
| Verified email | `typeof email === 'string'` and `email_verified === true` (strict boolean) | `typeof email === 'string'` and `xms_edov === true` (strict boolean; the string `"true"` is rejected) |
| Never used | `hd` (no filter) | `preferred_username`, `upn`, `unique_name` |

- Verified email is required **at validation time**, linked or not. That matches spec SL3/SL4, and
  it is the simplest rule that keeps an unverified email from identifying anyone.
- `CONFIGURACION_SSO` token:
  `obtener(proveedor): ConfigProveedorSso | null`, with `ConfigProveedorSso =
  { clientId, clientSecret, urlAutorizacion, urlToken, urlJwks, redirectUri, emisores?: string[], plantillaEmisor?: string }`.
- E2E specs replace the token with `.overrideProvider(CONFIGURACION_SSO).useValue(...)`, pointing
  at the fake IdP. A fake issuer works through the same `emisores`/`plantillaEmisor` fields, so no
  production rule is bypassed.

### ADR-4: link model `usuarios_identidades_sso`

| Option | Tradeoff | Decision |
|---|---|---|
| Columns on `usuarios` (`google_sub`, `ms_subject`) | The `UsuarioEntity` upsert (`prisma-usuario.repository.ts:46-55`) could overwrite them; one column per provider | Rejected |
| **Own table**, symmetric with `usuarios_tfa` | One table, one repository | **Chosen** |

| Column | Type | Constraint |
|---|---|---|
| `id` | `UUID` | PK `DEFAULT gen_random_uuid()` |
| `usuario_id` | `UUID NOT NULL` | FK → `usuarios(id) ON DELETE CASCADE` |
| `proveedor` | `VARCHAR(12) NOT NULL` | CHECK `IN ('GOOGLE','MICROSOFT')` |
| `subject` | `VARCHAR(200) NOT NULL` | Google `sub`; Microsoft `<tid>:<oid>` (73 chars) |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | |

- Unique constraints: `UNIQUE (usuario_id, proveedor)` and `UNIQUE (proveedor, subject)`.
- `email_al_vincular` (from the exploration) is **dropped**: no screen reads it in this delivery
  (D9), and an unread personal-data column is dead data.

Port (`auth/domain/ports/identidad-sso-repository.port.ts`):

```ts
export type ResultadoVinculo = 'VINCULADO' | 'OTRA_CUENTA';
export interface IIdentidadSsoRepository {
  buscarUsuarioPorSujeto(proveedor: ProveedorSso, subject: string): Promise<string | null>;
  /** First writer wins: INSERT ... ON CONFLICT DO NOTHING, then re-read (usuario_id, proveedor). */
  vincular(usuarioId: string, proveedor: ProveedorSso, subject: string): Promise<ResultadoVinculo>;
  eliminarTodasDeUsuario(usuarioId: string): Promise<number>;
}
```

`vincular` runs `INSERT ... ON CONFLICT DO NOTHING` (no target, so it covers both unique
constraints), then `SELECT subject ... WHERE usuario_id=$1 AND proveedor=$2`:

- Same subject → `VINCULADO` (also idempotent for a concurrent duplicate).
- Another subject → `OTRA_CUENTA`. The user already linked a different account (D7).
- No row → `OTRA_CUENTA`. The insert lost on `(proveedor, subject)`: that provider account belongs
  to another user.

### ADR-5: case-insensitive email lookup with ambiguity rejection

| Option | Tradeoff | Decision |
|---|---|---|
| Change `findByEmail` to insensitive | Changes the password login, password reset (`solicitar-reset-password.use-case.ts:55`), `crear-usuario-tenant.use-case.ts:102`, `crear-cliente.use-case.ts:129` and `demo-seed.ts:228` | Rejected; `findByEmail` stays byte-identical |
| Prisma `equals` + `mode: 'insensitive'` | Translated to `ILIKE`, where `_` and `%` act as wildcards: `juan_perez@x.com` would match `juanXperez@x.com`. That breaks identification | Rejected |
| **New `findManyByEmailInsensitive(email)`**: `$queryRaw` `WHERE lower(email) = lower($1) LIMIT 2` | Exact equality. Additive expression index `usuarios_email_lower_idx ON usuarios (lower(email))`, non-unique because case-variant rows may exist | **Chosen** |

- The use case maps 0 rows → `SIN_USUARIO` and 2 rows → `AMBIGUO`, with a log line. Both are the
  generic failure.
- Adding the method breaks every full mock of `IUsuarioRepository`. Each gets one
  `findManyByEmailInsensitive: vi.fn()` line in WU-1b, with no casts (`check-casts-en-specs.mjs`
  must not grow). The affected files:
  - `login`, `solicitar-reset-password`, `resetear-password-usuario-tenant`, `refresh-token`,
    `confirmar-reset-password` and `cambiar-password` `.use-case.spec.ts`
  - `desafio-login.use-cases.spec.ts`, `continuar-login.use-cases.spec.ts` and
    `desactivar-tfa.use-case.spec.ts` (`satisfies`)
  - `crear-cliente.use-case.spec.ts`

### ADR-6: `EvaluarSegundoPasoService` extracted from `LoginUseCase`

| Option | Tradeoff | Decision |
|---|---|---|
| Copy step 3b into the SSO use case | The 2FA obligation rule would live in two places and could drift | Rejected |
| Call `LoginUseCase` from SSO | It needs a password | Rejected |
| **Extract `login.use-case.ts:176-203` into a service** | One refactor commit with zero test edits | **Chosen** |

```ts
export type DecisionSegundoPaso =
  | { kind: 'needs2fa'; desafio: string }
  | { kind: 'needsEnrolamiento2fa'; desafio: string }
  | { kind: 'continuar'; dispositivoRenovado?: string };
export class EvaluarSegundoPasoService {
  constructor(tfaRepo: ITfaRepository, desafios: IDesafioLoginRepository, dispositivos: IDispositivoConfiableRepository);
  evaluar(usuario: UsuarioEntity, membresiasActivas: MembresiaResuelta[], dispositivoConfiable?: string): Promise<DecisionSegundoPaso>;
}
```

- The body moves verbatim: `tfaRepo.obtener`, the ROOT exclusion of the device, `renovar` with
  `DISPOSITIVO_CONFIABLE_DURACION_MS`, and `esObligado2fa`.
- `LoginUseCase` keeps its **11-parameter constructor** (`:115-127`). It builds the service
  internally, the same way it already builds `EmitirSesionService` (`:128-134`), so `auth.module.ts`
  and every existing mock stay untouched. Lines 176-203 become one `evaluar` call plus the two early
  returns; `dispositivoRenovado` still feeds `selection` (`:230`) and `tokens` (`:242`).
- `AuthModule` also registers the service as a provider, for `CompletarSsoUseCase`.
- **Proof that behavior is unchanged**: these specs pass in WU-3 with no edit (`git diff --stat` on
  them is empty):
  - `login.use-case.spec.ts`, `continuar-login.use-cases.spec.ts`, `auth.controller.spec.ts`,
    `auth.module.spec.ts`
  - e2e: `login-2fa`, `dispositivo-confiable`, `limite-intentos`, `auth`, `tfa-login`,
    `tfa-secreto-indescifrable`
  - A new `evaluar-segundo-paso.service.spec.ts` covers the four branches directly.

### ADR-7: `CompletarSsoUseCase`: rejection order, limiter, handoff

| # | Step | Failure → `motivo` (log only; the response is always the same 401) |
|---|---|---|
| 1 | State CAS (ADR-1) | `ESTADO_INVALIDO`, with no IdP call |
| 2 | Token exchange + `jwtVerify` + provider validator | `TOKEN_INVALIDO`, `EMAIL_NO_VERIFICADO`. Network or IdP 5xx → thrown → 500 |
| 3 | `limitador.reservar('sso:<PROVEEDOR>:<sha256(subject)>:<ip>')` (about 125 chars, fits `varchar(200)`) | `BLOQUEADO` |
| 4 | `buscarUsuarioPorSujeto`, else `findManyByEmailInsensitive` | `SIN_USUARIO`, `AMBIGUO` |
| 5 | `findById`; `!usuario \|\| !activo \|\| isDeleted()` | `INACTIVO` |
| 6 | `usuario.isGlobalAdmin` | `ROOT` (checked on **every** login, so a user promoted after linking is caught) |
| 7 | `findActivasByUsuario` is empty | `SIN_MEMBRESIA` |
| 8 | Resolved by email only: `vincular` | `OTRA_CUENTA` |
| 9 | `limitador.liberar(clave)` | — |
| 10 | `EvaluarSegundoPasoService.evaluar` → challenge, or `desafios.crear(id,'SELECCIONAR')` | — |

- Steps 5-7 run **before** step 8. ROOT, inactive and no-membership users never get a link, a
  challenge or a ticket. Steps 4-8 keep the reservation as a failure, the same as `pwd:`
  (`login.use-case.ts:142,165`).
- Steps 1-2 do not reserve: no subject exists yet, a state is 256-bit random, and a valid token
  cannot be forged.
- No IP-only limiter on `iniciar`: users behind one NAT would block each other.
- Output: `{ kind: 'needs2fa' | 'needsEnrolamiento2fa', desafio } | { kind: 'ticket', ticket, dispositivoConfiable? }`,
  plus `siguiente`. `ContinuarLoginUseCase` (`continuar-login.use-cases.ts:30-56`) and
  `SeleccionarClienteLoginUseCase` stay unchanged and remain the only emitters (D8).
- Log line: `SSO_RECHAZADO | proveedor=… | motivo=… | usuarioId=…` (when known). It never carries
  the email, the raw subject or a token.

### ADR-8: reset `DELETE /usuarios/:id/sso` and the shared `puedeResetear` policy

`resetear-tfa-usuario.use-case.ts:62-74` moves verbatim to
`puedeResetearAUsuario(input, { usuarios, membresias })`. Its exact current semantics:

1. Target not found (`findById` includes soft-deleted users) → `false`.
2. Actor ROOT → `true`, even for a ROOT, inactive or deleted target.
3. Target ROOT → `false`.
4. No active membership of the target in the actor's client → `false`.
5. Otherwise `findClientesDeTodasByUsuario(target).every(id => id === clienteId)`. That includes
   inactive and soft-deleted memberships and suspended clients.

`ResetearTfaUsuarioUseCase` calls the function, and its spec and `usuarios-reseteo-tfa.e2e.spec.ts`
pass unedited.

`ResetearVinculoSsoUseCase`:

- Mirrors the 2FA reset: denied → `MembresiaNoEncontradaError` (the same 404 for every denial).
- Otherwise `eliminarTodasDeUsuario`, then `revokeAllByUsuarioId` (log-and-swallow,
  `resetear-tfa-usuario.use-case.ts:51-58`). Trusted devices stay, as in the 2FA reset.
- Idempotent: no links → 204.

### ADR-9: BFF and frontend

| Piece | Contract |
|---|---|
| `GET /api/auth/sso/[proveedor]/iniciar` | Slug allowlist `google\|microsoft`; `siguiente = destinoPosLogin(?siguiente)`; backend `POST /auth/sso/:p/iniciar {siguiente?}` → set `sso_st` → 302 `authorizeUrl`. Any failure → 302 `/login?motivo=sso-error` |
| `GET /api/auth/sso/[proveedor]/callback` | Always clears `sso_st`. `error=access_denied` → 302 `/login` (no message, SL13); any other `error` or a missing `code`/`state`/binding → `sso-error`. Backend `POST callback {code, state, binding, dispositivoConfiable?}` with `td` **from the cookie only** and `x-soporte-ip-navegador`. Non-2xx or network error → `sso-error`. OK → re-set `td` when `dispositivoConfiable` comes back → set `sso_paso` = JSON `{k:'2fa'\|'enrol'\|'ticket', t}` (httpOnly, 120 s) → 302 `/login?sso=1[&siguiente=destinoPosLogin(...)]`, with `Cache-Control: no-store` and `Referrer-Policy: no-referrer` |
| `POST /api/auth/sso/paso` | Reads, clears and shape-validates `sso_paso` → `{needs2fa:true,desafio} \| {needsEnrolamiento2fa:true,desafio} \| {ticket}`; absent or invalid → 404. **POST**, so a cross-site navigation cannot consume the Lax cookie |
| `shared/auth/cookies.ts` | `COOKIE_SSO_ESTADO="sso_st"`, `COOKIE_SSO_PASO="sso_paso"`, `SSO_ESTADO_MAX_AGE=600`, `SSO_PASO_MAX_AGE=120`, using the existing `cookieAttrs`/`clearCookieAttrs` |
| `shared/api/client.ts:70-76` | `RUTAS_SIN_REFRESH` gains `"auth/sso/paso"` |
| `use-login.ts` | A mount effect for `?sso=1`, guarded by a `useRef` because StrictMode runs effects twice and the second call would hit a consumed cookie. It calls `paso`, then `history.replaceState` drops `sso` and keeps `siguiente`. `ticket` → `continuarMutation.mutate`; otherwise → `alResponder`; 404 → toast with the generic SSO message |
| `useProveedoresSso` + `BotonesSso` (presentational) | `GET auth/sso/proveedores` through the catch-all proxy → `<a href="/api/auth/sso/<slug>/iniciar?siguiente=…">` (full navigation), shown only when `paso === 'credenciales'` |
| `AvisoMotivo.tsx` | `motivo=sso-error` → `role="alert"` with the single generic text (copy from the spec) |
| `editar-usuario-dialog.tsx:226-243` | "Resetear vínculo SSO" button with `ConfirmDialog`, next to "Resetear 2FA". `useResetearVinculoSsoUsuarioTenant` lives next to `use-usuarios-tenant-mutations.ts:111`. A 404 gets the same neutral message as the 2FA reset |

Why the user lands on `/login` and not on `/` with session cookies set: `alResponder`
(`use-login.ts:150-159`) resets `soporte:idle:last-activity`. Without that reset, a stale timestamp
cuts the new session on arrival. The middleware also redirects `/login` away when a session is live
(`middleware.ts:75-97`).

### ADR-10: configuration read at use time

`ConfiguracionSsoDesdeEntorno.obtener(p)` reads `SSO_<P>_CLIENT_ID` and `SSO_<P>_CLIENT_SECRET` on
every call. A provider is enabled only when both values are non-empty after trim; otherwise the
method returns `null`.

- The code is written as `const v = process.env.X; if (v === undefined || v.trim() === '') return null;`.
  It never uses `?? ''`, which `regla-env-vacio.lint.spec.ts` rejects.
- The variables are not in `VARIABLES_REQUERIDAS`, so the app boots without them.
- `redirectUri = `${entorno.APP_BASE_URL}/api/auth/sso/${slug}/callback`` follows the repo
  convention of `APP_BASE_URL` with no trailing slash. It is never built from `Host`.
- `GET /auth/sso/proveedores` → `{ proveedores: ('google'|'microsoft')[] }`. The frontend Zod
  schema mirrors it, and the SQL CHECK is the persistence source.

---

## Data Flow

```
Browser ─GET /api/auth/sso/google/iniciar─▶ BFF ─POST /auth/sso/google/iniciar─▶ IniciarSso
   ◀─302 authorizeUrl + Set-Cookie sso_st─────────────── INSERT sso_estados(hash(state), hash(binding))
Browser ─▶ Google ─302─▶ GET /api/auth/sso/google/callback?code&state (Lax: sso_st, td sent)
BFF ─POST /auth/sso/google/callback {code,state,binding,td} + ip─▶ CompletarSso
   CAS state ─▶ token+JWKS ─▶ validator ─▶ reserve sso: ─▶ link | email(lower, LIMIT 2)
   ─▶ inactive/ROOT/no membership ─▶ vincular ─▶ release ─▶ EvaluarSegundoPaso ─▶ desafio | ticket
BFF ◀─ {needs2fa|enrol|ticket, siguiente, dispositivoConfiable?} ─ sets td?, sso_paso, clears sso_st
Browser ◀─302 /login?sso=1 ─ use-login effect ─POST /api/auth/sso/paso─▶ existing machine
   desafio ─▶ /auth/2fa/verificar ─▶ /auth/login/continuar ─▶ tokens | selector (unchanged)
Any rejection ─▶ 401 ─▶ BFF 302 /login?motivo=sso-error (one message)
```

---

## File Changes

| File | Action | Description |
|---|---|---|
| `backend/prisma_master/migrations/20261010120000_login_sso/{migration,rollback}.sql` | Create | Two tables, CHECKs, indexes, `usuarios_email_lower_idx` |
| `backend/prisma_master/schema.prisma` | Modify | `SsoEstado`, `UsuarioIdentidadSso`, back-relation `identidadesSso` on `Usuario` |
| `backend/package.json`, `pnpm-lock.yaml` | Modify | `jose@^6.2.8` |
| `backend/src/auth/domain/sso/*.ts`, `domain/errors/sso.errors.ts` | Create | Provider codes, identity, errors |
| `backend/src/auth/domain/ports/{sso-estado-repository,identidad-sso-repository,proveedor-oidc}.port.ts` | Create | Ports + tokens |
| `backend/src/auth/domain/ports/i-usuario.repository.ts`, `infrastructure/persistence/prisma/prisma-usuario.repository.ts` | Modify | `findManyByEmailInsensitive` |
| `backend/src/auth/infrastructure/sso/{prisma-sso-estado,prisma-identidad-sso}.repository.ts` | Create | ADR-1, ADR-4 |
| `backend/src/auth/infrastructure/sso/{configuracion-sso,jose-proveedor-oidc,validar-claims-google,validar-claims-microsoft}.ts` | Create | ADR-2, ADR-3, ADR-10 |
| `backend/src/auth/application/evaluar-segundo-paso.service.ts` | Create | ADR-6 |
| `backend/src/auth/application/use-cases/login.use-case.ts` | Modify | Delegates step 3b |
| `backend/src/auth/application/politica-reseteo-usuario.ts` | Create | ADR-8 |
| `backend/src/auth/application/tfa/resetear-tfa-usuario.use-case.ts` | Modify | Uses the shared policy |
| `backend/src/auth/application/sso/{pkce,iniciar-sso.use-case,completar-sso.use-case,resetear-vinculo-sso.use-case,listar-proveedores-sso.use-case}.ts` | Create | ADR-7, ADR-8 |
| `backend/src/auth/interface/controllers/sso.controller.ts`, `interface/dtos/sso.dto.ts` | Create | Three routes |
| `backend/src/auth/interface/controllers/usuarios.controller.ts` | Modify | `DELETE :id/sso` + JSDoc route list |
| `backend/src/auth/auth.module.ts` | Modify | Providers, `SsoController` |
| `backend/src/testing/idp-falso.ts` | Create | Fake IdP |
| 10 spec files from ADR-5 | Modify | One mock line each |
| `frontend/src/app/api/auth/sso/[proveedor]/{iniciar,callback}/route.ts`, `app/api/auth/sso/paso/route.ts` | Create | ADR-9 |
| `frontend/src/shared/auth/cookies.ts`, `shared/api/client.ts` | Modify | Cookies, `RUTAS_SIN_REFRESH` |
| `frontend/src/features/auth/{hooks/use-proveedores-sso.ts,components/botones-sso.tsx,schemas.ts}` | Create/Modify | Buttons |
| `frontend/src/features/auth/hooks/use-login.ts`, `components/AvisoMotivo.tsx`, `app/(auth)/login/page.tsx` | Modify | Landing and message |
| `frontend/src/features/usuarios/{components/editar-usuario-dialog.tsx,hooks/use-usuarios-tenant-mutations.ts}` | Modify | Reset button |
| `README.md` (env table, about lines 148-161), `DEPLOY-VPS-runbook.md` | Modify | Deploy notes |
| `docs/roadmap-comercial.md` | Modify | At close: point-7 bullet "Cumplida" or "Desviación" |

---

## Invariants that MUST have a test (mutation checks)

| Mutation | Must turn red |
|---|---|
| Drop the `isGlobalAdmin` check (step 6) | E2E: ROOT with a verified email → 401 and no row in `usuarios_identidades_sso`, `auth_desafios` |
| Drop `xms_edov === true` | Validator unit: `xms_edov` absent, `false`, `"true"` → reject; e2e: Microsoft token without `xms_edov` → 401 |
| Drop `navegador_hash` from the CAS | E2E: callback with another flow's `sso_st` → 401; integration: the row stays consumable |
| Drop `usado_at IS NULL` (CAS) | E2E: replay of the same `state` → 401, and the fake IdP token endpoint was hit once; integration: `Promise.all` of two consumes → exactly one row |
| Drop `liberar` / move `reservar` after rejection | Unit: exact key `sso:GOOGLE:<sha>:<ip>`; `liberar` only after step 8 |
| Swap steps 5-7 after `vincular` | Unit: inactive / ROOT / no-membership → `vincular` not called |

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit | Validator matrix: bad signature, wrong `aud`, wrong `iss`, expired, wrong `nonce`, alg `none`/HS256, `email_verified` false/absent/`"true"`, `xms_edov` absent/false/`"true"`, `iss`≠`tid`, `ver`≠2.0, missing `oid`/`email`, `preferred_username` only, Google `hd` present OK. Also `EvaluarSegundoPasoService` (4 branches), `CompletarSso` (every row of ADR-7), `IniciarSso` (URL parameters, only hashes persisted), `puedeResetearAUsuario` (5 rules), `ResetearVinculoSso` | Vitest; tokens signed by `idp-falso` keys; full mocks, no casts |
| Integration | `PrismaSsoEstadoRepository` (CAS, expiry, binding, provider, concurrent consume, purge), `PrismaIdentidadSsoRepository` (both uniques, concurrent `vincular` → one winner, cascade), `findManyByEmailInsensitive` (case variant, `_` is not a wildcard, `LIMIT 2`) | `soporte_master_test` + **`usarLockMasterTest()`** |
| E2E | `sso.e2e.spec.ts`: first login links; second login by subject with a changed email; another subject with the same email → 401; case variant; ambiguous; inactive; deleted; no memberships; ROOT; `needs2fa`; `needsEnrolamiento2fa`; trusted device skips and renews; one membership → `continuar` → tokens; two memberships → selector; replay; wrong binding; expired; crossed provider; concurrent first logins; disabled provider → 404; `proveedores` lists configured only. `usuarios-reseteo-sso.e2e.spec.ts`: ROOT; ADMINISTRADOR single-client; ADMINISTRADOR multi-client → 404; ROOT target → 404 for ADMINISTRADOR; refresh tokens revoked | `Test.createTestingModule({imports:[SharedModule, AuthModule]})`, real listener, fake IdP on `node:http` `127.0.0.1:0` serving `/token` and `/jwks` (jose `generateKeyPair`, `exportJWK`, `SignJWT`), injected via `CONFIGURACION_SSO` |
| BFF | `iniciar`: allowlist, `siguiente`, cookie attributes, `__Host-` in prod. `callback`: `access_denied`, missing binding, non-2xx → `sso-error`, `td` from cookie only, `sso_paso` set, `sso_st` cleared, `no-store`. `paso`: one-time, shape validation, 404 | Vitest, `route.test.ts` pattern with mocked `fetch` |
| Frontend | Buttons by provider list, the `?sso=1` effect (each kind, a single call under StrictMode, 404), `AvisoMotivo`, reset button + 404 copy, `RUTAS_SIN_REFRESH` | Vitest + Testing Library + msw |
| Manual (verify) | Staging with a real Google account, a work Microsoft account and a **personal** Microsoft account: `email`/`xms_edov`/`oid` present, link created, second login by subject, 2FA, selector | Checklist in `verify-report.md` |

## Threat Matrix

N/A: no shell, subprocess, VCS/PR automation or executable classification. The HTTP and OIDC
threats (login CSRF, replay, mix-up, nOAuth, open redirect, catch-all exposure) are covered by
ADR-1, ADR-3, ADR-7 and ADR-9 and by the mutation table.

## Migration / Rollout

| # | Content | Rollback |
|---|---|---|
| M1 `prisma_master/migrations/20261010120000_login_sso` | `sso_estados`, `usuarios_identidades_sso`, CHECKs and uniques in SQL (Prisma cannot express the CHECKs), `usuarios_email_lower_idx`. Master only, additive, no backfill, no tenant migration | `rollback.sql`: `DROP INDEX IF EXISTS usuarios_email_lower_idx; DROP TABLE IF EXISTS usuarios_identidades_sso; DROP TABLE IF EXISTS sso_estados;`. Destructive: links are lost and users re-link on the next SSO. Revert the code first |

Header and naming follow `20261008120000_verificacion_dos_pasos`. Deploy uses the normal
`migrate:master` inside the `predeploy-dump.ps1` window.

Deploy notes (WU-9):

- **`README.md` env table**: the four optional `SSO_*` variables.
- **No `deploy.ps1` change**: `dotenv/config` loads `backend/.env`. Confirm there is no stale
  MACHINE variable with the same name.
- **Runbook, Google Cloud Console**:
  - OAuth client of type Web; consent screen published.
  - Redirect URIs `https://soporte.sesitec.net/api/auth/sso/google/callback`, plus
    `http://localhost:<port>/…` for development.
- **Runbook, Entra app registration**:
  - `signInAudience = AzureADandPersonalMicrosoftAccount`.
  - Web redirect URI `…/api/auth/sso/microsoft/callback`.
  - Optional ID-token claims `email` and `xms_edov`. The manifest procedure is to be confirmed
    hands-on, and the result recorded.
  - Graph `PATCH /applications/{id}/authenticationBehaviors {"removeUnverifiedEmailClaim": true}`,
    recorded.
  - Client secret expires in at most 24 months: add a calendar reminder and a rotation procedure.
    Rotation = edit `backend/.env` and restart the service.
- **Smoke after deploy**:
  - `GET /api/auth/sso/proveedores`.
  - Follow `iniciar` and check that IIS/ARR keeps the original `Host`, so that `request.url` builds
    `https://soporte.sesitec.net/login?...`.
  - `/api/auth/sso/*` reaches Next unchanged.
  - Record `nssm get soporte-backend Application`, which shows the Node binary in use.
- **Quick mitigation without a revert**: remove the `SSO_*` variables and restart. The buttons
  disappear and the password login is exactly today's.
- **Ayuda debt** (writing is suspended; record it in commits and PRs): the SSO buttons, the generic
  SSO error, and "Resetear vínculo SSO".

## Delivery slices (`auto-chain`, feature-branch-chain on `feat/login-sso`, 400-line budget)

Sizes are prod + tests and are realistic. Frontend units carry the ×1.5 observed in the last cycle.

| WU | PR seam | Depends on | Lines |
|---|---|---|---|
| 1a | jose spike (gate) + M1 + schema + `sso_estados` port/repo + integration | — | ~360 |
| 1b | Link port/repo + `findManyByEmailInsensitive` + 10 mock lines + integration | 1a | ~300 |
| 2a | Domain SSO types, `CONFIGURACION_SSO` provider, both validators + unit matrix | 1b | ~390 |
| 2b | `JoseProveedorOidc` + `idp-falso` + adapter spec; delete `jose-humo` | 2a | ~360 |
| 3 | `EvaluarSegundoPasoService` extraction (zero edits to existing specs) | 2b | ~200 |
| 4a | `pkce`, errors, `IniciarSsoUseCase` + spec | 3 | ~240 |
| 4b | `CompletarSsoUseCase` + spec (ADR-7 matrix) | 4a | ~420 (at risk; if over, move the limiter cases to 5b) |
| 5a | `SsoController`, DTOs, wiring, `proveedores`, e2e basics (state/binding/replay/expired/disabled) + `pnpm start` check | 4b | ~400 |
| 5b | `sso.e2e.spec.ts` login matrix (tests only; clean seam, code already covered by units) | 5a | ~380 |
| 6 | `puedeResetearAUsuario` extraction, `ResetearVinculoSso`, route, unit + e2e | 5b | ~390 |
| 7a | Cookies + `iniciar` route + tests | 6 | ~250 |
| 7b | `callback` + `paso` routes + tests | 7a | ~360 |
| 8a | Buttons, providers hook, `use-login` effect, `AvisoMotivo`, `RUTAS_SIN_REFRESH` + tests | 7b | ~390 |
| 8b | Admin reset button + mutation + test | 8a | ~180 |
| 9 | README, runbook, roadmap bullet | 8b | ~140 |

Order is linear. Each WU is green on its own; between WU-5a and WU-8a the backend routes exist
without buttons, which is inert.

## Open Questions

None that block. These are to confirm during apply and verify, not decisions:

- [ ] Hands-on Entra manifest steps for `xms_edov` (WU-9, staging).
- [ ] Whether personal Microsoft accounts emit `email` + `xms_edov` + `oid` (staging). If they do
  not, they are rejected by design; that becomes a declared "Desviación" for "personal accounts" at
  close, not a code change.

## Reconciliation notes with the specs

- SL3/SL4 require the verified email in every token, linked or not. The design does the same
  (ADR-3).
- The exploration's `email_al_vincular` column is dropped (ADR-4). No spec requirement reads it.
- `paso` is POST, not GET (ADR-9). Spec SL14 does not fix the method.
