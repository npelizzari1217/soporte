# Tasks: frontend-fundacion

> Implementation checklist. Each task maps to its spec requirement.
> TDD RED-first: every behavioral task is a TEST→IMPL pair.
> Greenfield: `frontend/` does not exist. T01 (scaffolding) blocks everything.

---

## Resolved Pending Items

### Pending 1 — Página `/unauthorized` (resolved as T19)

**Decision**: Create `app/(dashboard)/unauthorized/page.tsx`. The middleware enforces
authentication only (valid session present?). Role-based authorization is enforced at the UI
layer via `SessionProvider.can(permiso)`. When a feature page detects insufficient roles, it
calls `redirect('/unauthorized')`. The page shows a generic "No tenés permiso" message with a
back-to-dashboard button. The middleware does NOT check roles.

### Pending 2 — RSC con access expirado (resolved in T10)

**Decision**: `serverFetch` throws `ApiError(401)` when the backend returns 401. RSC callers
must catch and call `redirect('/login')`. This is acceptable for the foundation because:
(a) middleware passes through when `rt` exists but `at` is expired (ADR-4 tolerant), so RSC
pages are reached; (b) foundation RSC pages are placeholders with no actual backend data calls.
Documented via comment in `server.ts`. Full RSC refresh handling is deferred to the first
data-fetching feature change.

---

## Spec Delta (Design supersedes Spec)

**ADR-4 · Middleware tolerante a access expirado**

Spec scenario `frontend-route-protection/refresh-silencioso` requires the middleware to call
`/api/auth/refresh` server-side when `accessToken` is expired. The design explicitly rejects
this (§6, ADR-4): doing so would break with multi-instance Node deployments (shared module
state) and cause rotation conflicts. Instead, middleware tolerates expired `at` if `rt` exists
(passes through) and the client single-flight handles the refresh transparently.

- T16 tests follow the **design** (tolerant behavior), not the spec's server-side refresh.
- The spec scenario "accessToken expirado + refreshToken válido → usuario no experimenta
  redirect" is still satisfied end-to-end — the client refresh (T09) makes it transparent.
- Deviation documented via comment in `middleware.ts`.

---

## Task List

### PR 1 — `infra` (~300 lines)
No dependencies. Blocks all other PRs.
Tasks T01, T02, T03, T07, T12 can run in parallel after T01 creates `frontend/`.

---

#### T01 · Scaffolding — Next.js App Router
- Type: configuration (no TEST/IMPL pair)
- [x] Create `frontend/` at repo root
- [x] Bootstrap via `npx create-next-app@15 frontend --typescript --app --src-dir --no-tailwind --eslint --no-git` (deviation: --src-dir used because design requires src/; --eslint kept for next lint; NODE_ENV removed from env config — reserved by Next.js)
- [x] Install Tailwind v4: `tailwindcss@4 @tailwindcss/postcss` (no tailwind.config.js — CSS-first)
- [x] Configure `postcss.config.mjs` with `@tailwindcss/postcss` plugin
- [x] Create `components.json` manually (shadcn init is interactive even with --yes; components.json created with Tailwind v4 config: no tailwind.config path, css→src/styles/globals.css, cssVariables: true)
- [x] Configure `tsconfig.json` path alias: `"@/*": ["./src/*"]` (was already set by create-next-app)
- [x] Configure `next.config.ts`: expose `BACKEND_URL`, `JWT_SECRET` env vars (NODE_ENV omitted — Next.js reserved key)
- [x] Create directory skeleton per design §1 (all dirs, `.gitkeep` in empty leaves):
  `src/app/(auth)/login`, `src/app/(dashboard)/{tickets,compras,reparaciones,equipos}`, `src/app/api/[...path]`, `src/app/api/auth/{login,refresh,logout,logout-all}`, `src/features/{auth,tickets,compras,reparaciones,equipos}/{components,hooks}`, `src/components/{ui,shell}`, `src/shared/api`, `src/shared/auth`, `src/shared/hooks`, `src/shared/providers`, `src/styles`, `test/msw`, `test/helpers`, `e2e`
- Spec: infrastructure prerequisite (no scenario)
- Parallel: none — serial prerequisite

---

#### T02 · Test Infrastructure
- Type: configuration (no TEST/IMPL pair)
- [x] Install Vitest stack: `vitest@4.1.9 @vitejs/plugin-react @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom`
- [x] Install MSW: `msw@2.14.6`
- [x] Install Playwright: `@playwright/test@1.61.1`
- [x] Install jose for helpers: `jose@6.2.3` (devDependency; shared as prod dep via T15)
- [x] Create `vitest.config.ts`: environment jsdom, path alias `@/ → src/`, setupFiles `vitest.setup.ts`
- [x] Create `vitest.setup.ts`: import `@testing-library/jest-dom`; MSW server lifecycle (explicit imports from vitest to satisfy tsc)
- [x] Create `test/msw/handlers.ts`: empty handlers array (extended per PR)
- [x] Create `test/msw/server.ts`: `setupServer(...handlers)`
- [x] Create `test/helpers/jwt.ts`: `mintToken(payload, opts?)`, `mintExpired(payload)`, `mintInvalid()` using jose + `TEST_JWT_SECRET` env
- [x] Create `playwright.config.ts`: baseURL `http://localhost:3000`, webServer `next dev`, browser chromium
- Spec: test infrastructure prerequisite (no scenario)
- Parallel: after T01

---

#### T03 · `globals.css` — Tailwind v4 @theme
- Type: configuration (no TEST/IMPL pair — validated by visual review and atom tests T04–T06)
- [x] Create `src/styles/globals.css`
- [x] `@import "tailwindcss"` at top
- [x] `@theme {}` block with ALL required color tokens (oklch dark values, Stripe/Linear aesthetic):
  `--color-background`, `--color-foreground`, `--color-card`, `--color-card-foreground`,
  `--color-primary`, `--color-primary-foreground`, `--color-muted`, `--color-muted-foreground`,
  `--color-border`, `--color-destructive`, `--color-destructive-foreground` + extended set (input, ring, accent, popover, secondary)
  (background L≈16, foreground L≈97, card L≈19, primary oklch(0.62 0.19 256))
- [x] `--radius-md: 0.375rem` (6px — botones, inputs, dropdowns, badges)
- [x] `--radius-lg: 0.5rem` (8px — cards, paneles, modales, drawers)
- [x] No color-scheme override (dark is the only theme; no `prefers-color-scheme`)
- Spec: [SPEC:frontend-design-system/dark-mode], [SPEC:frontend-design-system/radius-tokens]
- Parallel: after T01 (parallel to T07, T12)

---

#### T07 · `shared/api/types.ts`
- Type: type definitions (no TEST/IMPL pair — validated by TypeScript compiler + downstream tests)
- [x] `class ApiError extends Error { constructor(statusCode, message, messages[], raw?) }`
- [x] `class SessionExpiredError extends ApiError {}` (statusCode=401, distinct type for callers)
- [x] `interface JwtPayload { sub: string; cliente_id: string; email: string; roles: string[]; permisos: string[] }`
- [x] `type ApiFetchInit = Omit<RequestInit, 'body'> & { json?: unknown; body?: BodyInit }`
- Spec: [SPEC:frontend-api-client/normalizacion-errores] (ApiError discriminable by instanceof)
- Parallel: after T01 (parallel to T03, T12)

---

#### T12 · `shared/auth/cookies.ts`
- Type: constants/factory (no TEST/IMPL pair — validated by route handler tests T13)
- [x] `COOKIE_AT = 'at'`, `COOKIE_RT = 'rt'`
- [x] `ACCESS_MAX_AGE = 900` (15 min), `REFRESH_MAX_AGE = 604800` (7 days)
- [x] `cookieAttrs(name, maxAge): ResponseCookie` — `httpOnly: true`, `sameSite: 'lax'`, `secure: NODE_ENV==='production'`, `path: '/'`, `maxAge`; prefixes name with `__Host-` when secure
- [x] `clearCookieAttrs(name): ResponseCookie` — same but `maxAge: 0`
- Spec: [SPEC:frontend-auth/login-exitoso] (cookie attribute contract)
- Parallel: after T01 (parallel to T03, T07)

---

### PR 2 — `atoms` (~220 lines)
Dependencies: PR 1 (T02, T03). Parallel to PR 3, PR 4, PR 5.
T04, T05, T06 run in parallel with each other.

---

#### T04 · `<Skeleton>` atom — TEST→IMPL pair
- [ ] **RED** `src/components/ui/skeleton.test.tsx`:
  - renders without props (no required props)
  - has `animate-pulse` class
  - `className` prop applied to root element (e.g. `h-4 w-24` visible in DOM)
  - renders no text content
- [ ] **GREEN** `src/components/ui/skeleton.tsx`:
  `<div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />`
- Spec: [SPEC:frontend-design-system/atomos Skeleton], [SPEC:frontend-ui-states/skeleton isLoading]
- Parallel: T02+T03 → T04 (parallel to T05, T06)

---

#### T05 · `<EmptyState>` atom — TEST→IMPL pair
- [ ] **RED** `src/components/ui/empty-state.test.tsx`:
  - `title` renders (required)
  - `description` renders when provided; absent when not provided
  - `icon` (ReactNode) renders when provided
  - `action` (ReactNode) renders when provided, below description
  - layout is vertical centered (flexbox column + items-center)
  - no `className` or layout prop required to look correct
- [ ] **GREEN** `src/components/ui/empty-state.tsx`:
  ```tsx
  // <div className="flex flex-col items-center gap-3 py-12 text-center">
  //   {icon && <div className="text-muted-foreground">{icon}</div>}
  //   <h3 className="text-sm font-semibold">{title}</h3>
  //   {description && <p className="text-sm text-muted-foreground">{description}</p>}
  //   {action && <div className="mt-2">{action}</div>}
  // </div>
  ```
- Props: `{ title: string; description?: string; icon?: ReactNode; action?: ReactNode }`
- Spec: [SPEC:frontend-design-system/atomos EmptyState API], [SPEC:frontend-ui-states/empty-state]
- Parallel: T02+T03 → T05 (parallel to T04, T06)

---

#### T06 · `<Button>` loading variant — TEST→IMPL pair
- [ ] **RED** `src/components/ui/button.test.tsx`:
  - `isLoading={false}`: renders `children`, no spinner, `disabled` absent
  - `isLoading={true}`: `disabled={true}`, spinner element present, children still in DOM (not removed)
  - `isLoading={true}` + explicit `disabled={false}` → still disabled (isLoading wins)
  - root element has `rounded-md` class in default, hover, disabled, and loading states
- [ ] **GREEN** Extend Shadcn `src/components/ui/button.tsx`:
  - Add `isLoading?: boolean` to ButtonProps
  - When `isLoading=true`: force `disabled={true}`, prepend `<Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />`
  - Ensure `rounded-md` is in the base `cva` variants (Shadcn default uses `--radius` — override to always be `rounded-md`)
- Spec: [SPEC:frontend-design-system/atomos Button isLoading], [SPEC:frontend-ui-states/interactive-state submit], [SPEC:frontend-design-system/radios rounded-md botones]
- Parallel: T02+T03 → T06 (parallel to T04, T05)

---

### PR 3 — `api-client` (~400 lines — borderline; sdd-apply may split T08+T09 / T10+T11)
Dependencies: PR 1 (T02, T07). T08→T09 sequential. T10 parallel to T08. T11 after T09.

---

#### T08 · `normalize.ts` — TEST→IMPL pair
- [ ] **RED** `src/shared/api/normalize.test.ts`:
  - 200 + JSON body → returns parsed body as T (type assertion)
  - 204 No Content → returns `undefined` (no JSON parse attempted)
  - 400 + `{ statusCode: 400, message: "bad input" }` → throws `ApiError(400, "bad input", ["bad input"])`
  - 422 + `{ statusCode: 422, message: ["campo req", "email inválido"] }` → throws `ApiError(422, "campo req", ["campo req", "email inválido"])`
  - catch block for `TypeError` (network) → throws `ApiError(0, "Error de red")`
- [ ] **GREEN** `src/shared/api/normalize.ts` per design §5 contract
- Spec: [SPEC:frontend-api-client/normalizacion-respuestas], [SPEC:frontend-api-client/normalizacion-errores]
- Sequential: T07 → T08

---

#### T09 · `apiFetch` + single-flight refresh — TEST→IMPL pair — **RISK #1**
- [ ] **RED** `src/shared/api/client.test.ts` (Vitest + MSW):
  - Setup MSW handlers: GET /api/tickets → 200 `[{id:'1'}]`; POST /api/auth/refresh → 200
  - `apiFetch('tickets')` → resolves `[{id:'1'}]`
  - MSW: GET /api/tickets → 401, then (after refresh) → 200; assert exactly **1** POST to /api/auth/refresh; assert final result is the success response
  - MSW: GET /api/tickets → 401, POST /api/auth/refresh → 401; assert throws `ApiError(401)`; assert no retry of /api/tickets
  - Direct call to `/api/auth/refresh` with 401 → throws `ApiError(401)` immediately (no loop); assert 0 additional refresh calls
  - **Single-flight**: fire 3 concurrent `apiFetch` calls each getting 401; MSW request counter asserts exactly **1** POST to /api/auth/refresh; all 3 resolve successfully
  - Request during in-flight refresh (Promise not yet resolved): joins the existing Promise; does NOT create a second fetch to /api/auth/refresh
- [ ] **GREEN** `src/shared/api/client.ts`:
  - Module-level `let refreshPromise: Promise<void> | null = null`
  - `refreshSession()`: `refreshPromise ??= fetch('/api/auth/refresh', ...).then(...).finally(() => { refreshPromise = null })`
  - `apiFetch<T>(path, init?)`: `rawFetch` → if 401 and path !== 'auth/refresh' → `await refreshSession()` → retry once → if 2nd 401 throw `ApiError(401)`
- Spec: [SPEC:frontend-api-client/retry-401], [SPEC:frontend-api-client/single-flight]
- Sequential: T08 → T09 (uses normalize)

---

#### T10 · `serverFetch` — TEST→IMPL pair
- [ ] **RED** `src/shared/api/server.test.ts` (Vitest, fetch mocked):
  - `serverFetch('tickets', cookieHeader)` calls `${BACKEND_URL}/api/tickets` with `Authorization: Bearer <at>` (extracted from Cookie header string)
  - 200 + JSON → returns parsed DTO
  - 204 → returns undefined
  - 401 → throws `ApiError(401)`
- [ ] **GREEN** `src/shared/api/server.ts`:
  - Accepts `path: string` + `cookieHeader: string`
  - Extracts `at` value from the Cookie header string
  - Calls `fetch(${BACKEND_URL}/api/${path}, { cache: 'no-store', headers: { Authorization: 'Bearer <at>' } })`
  - Uses `normalize()` for response
  - **Comment**: "RSC callers MUST catch ApiError(401) and call redirect('/login') from next/navigation. Known limitation of the tolerant middleware (ADR-4): the middleware passes through when rt is present but at is expired; the first RSC backend call will receive 401. Full RSC refresh handling deferred to the first data-fetching feature change."
- Resolves pending: RSC con access expirado (documented behavior — throw + redirect pattern)
- Spec: [SPEC:frontend-api-client/server-components]
- Parallel: T07+T02 → T10 (parallel to T08)

---

#### T11 · `QueryProvider` + `query-keys.ts`
- Type: configuration/factory (no TEST/IMPL pair — validated indirectly via hook tests T20)
- [ ] `src/shared/api/query-keys.ts`:
  factory object `{ tickets: { all: ['tickets'], detail: (id: string) => ['tickets', id] }, compras: {...}, reparaciones: {...}, equipos: {...} }`
- [ ] `src/shared/providers/query-provider.tsx`:
  QueryClientProvider with QueryClient defaults:
  `retry: (n, e) => e instanceof ApiError && e.statusCode >= 500 && n < 2` (NO retry on 401/4xx)
  `refetchOnWindowFocus: false`
  `staleTime: 30_000`
- [ ] `src/shared/providers/providers.tsx`:
  Composes `<QueryProvider>`. Placeholder for `<SessionProvider>` (wired in T17).
- Spec: infrastructure for [SPEC:frontend-api-client/normalizacion-respuestas] TanStack integration
- Sequential: T09 → T11

---

### PR 4 — `bff` (~430 lines — consider splitting T13/T14 if over budget)
Dependencies: PR 1 (T02, T12). T13 and T14 run in parallel.

---

#### T13 · Auth Route Handlers — TEST→IMPL pair
- [ ] **RED** `src/app/api/auth/login/route.test.ts` (MSW mocks backend NestJS):
  - POST valid creds → backend 200 `{accessToken, refreshToken}` → response has `Set-Cookie` for `at` (httpOnly, sameSite=lax, path=/, maxAge=900) AND `rt` (maxAge=604800); body = `{ user: JwtPayload }`
  - POST → backend 401 → propagate 401, no `Set-Cookie` headers
  - POST → backend 403 → propagate 403, no `Set-Cookie` headers
- [ ] **RED** `src/app/api/auth/refresh/route.test.ts`:
  - POST with valid `rt` cookie → backend 200 new tokens → rotates both cookies (new maxAge)
  - POST with revoked/expired `rt` → backend 401 → Set-Cookie `at` maxAge=0 + `rt` maxAge=0 + return 401
- [ ] **RED** `src/app/api/auth/logout/route.test.ts`:
  - POST → calls backend with `Authorization: Bearer <at>` AND `{ refreshToken: <rt value> }` in body
  - Response: Set-Cookie `at` maxAge=0, `rt` maxAge=0; return 200
  - POST with expired `at` cookie → still clears cookies (logout works even with expired access)
- [ ] **RED** `src/app/api/auth/logout-all/route.test.ts`:
  - POST → calls backend with Bearer; response clears both cookies; returns 200
- [ ] **GREEN** `app/api/auth/login/route.ts`, `refresh/route.ts`, `logout/route.ts`, `logout-all/route.ts`
  All use `cookieAttrs`/`clearCookieAttrs` from `shared/auth/cookies.ts`
- Spec: [SPEC:frontend-auth/login-exitoso], [SPEC:frontend-auth/creds-invalidas], [SPEC:frontend-auth/usuario-inactivo], [SPEC:frontend-auth/tenant-inactivo], [SPEC:frontend-auth/logout], [SPEC:frontend-auth/logout-all]
- Parallel: T02+T12 → T13 (parallel to T14)

---

#### T14 · BFF Catch-all — TEST→IMPL pair
- [ ] **RED** `src/app/api/[...path]/route.test.ts` (NextRequest mock + MSW backend):
  - GET with `at` cookie → backend receives `Authorization: Bearer <at value>`
  - GET with query `?status=open` → backend receives `?status=open` (query string propagated)
  - POST with JSON body → body forwarded to backend; `content-type: application/json` propagated
  - POST without matching `Origin` header → responds 403 (CSRF check on mutating methods)
  - Browser `Cookie` header NOT forwarded to backend (only Bearer added)
  - Backend 401 → propagated as-is to client (no intervention, no refresh attempt)
  - Backend 200 → status + body + content-type copied verbatim
  - Path `/api/auth/login` → NOT handled by catch-all (static route wins — test confirms route.ts is only invoked for non-auth paths)
- [ ] **GREEN** `app/api/[...path]/route.ts` exporting `GET, POST, PUT, PATCH, DELETE`
  - `path = params.path.join('/')` → target `${BACKEND_URL}/api/${path}${req.nextUrl.search}`
  - CSRF: check `Origin`/`Referer` same-origin for POST/PUT/PATCH/DELETE → 403 if mismatch
  - Read `at` from `cookies()` (next/headers); add `Authorization: Bearer` if present
  - Filter headers: pass `content-type`, `accept`; drop `host`, `cookie`, `content-length`, `connection`
  - Body: `req.body` with `duplex: 'half'` for streaming methods
  - Fetch backend `{ method, headers, body, redirect: 'manual', cache: 'no-store' }`
  - Return `new NextResponse(backendRes.body, { status: backendRes.status, headers: { 'content-type': ... } })`
- Spec: [SPEC:frontend-auth/login-exitoso Bearer injection via proxy], [SPEC:frontend-api-client/normalizacion-respuestas proxy pass-through]
- Parallel: T02+T12 → T14 (parallel to T13)

---

### PR 5 — `middleware` (~220 lines)
Dependencies: PR 1 (T02, T07). Parallel to PR 2, PR 3, PR 4. T15→T16 sequential.

---

#### T15 · `shared/auth/verify.ts` — TEST→IMPL pair
- [ ] **RED** `src/shared/auth/verify.test.ts` (uses `test/helpers/jwt.ts`):
  - `mintToken(payload)` → `verifyAccessToken(token)` → returns `JwtPayload` (sub, email, roles, etc.)
  - `mintExpired(payload)` → returns `'expired'`
  - `mintInvalid()` (signed with wrong secret) → returns `'invalid'`
  - malformed string (not a JWT) → returns `'invalid'`
- [ ] **GREEN** `src/shared/auth/verify.ts`:
  `jose.jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET!), { algorithms: ['HS256'] })`
  catch `JWTExpired` → return `'expired'`; all other errors → return `'invalid'`
  Abstraction note: comment "swap `TextEncoder` secret for `importSPKI`/`createRemoteJWKSet` if backend switches to RS256"
- Spec: [SPEC:frontend-route-protection/jose-verificacion], [SPEC:frontend-route-protection/jose-verificacion no jsonwebtoken]
- Sequential: T02+T07 → T15

---

#### T16 · `middleware.ts` — TEST→IMPL pair
- [ ] **RED** `middleware.test.ts` (mocks `verifyAccessToken`):
  - No `at` cookie, no `rt` cookie → `NextResponse.redirect('/login')` with status 307
  - No `at`, has `rt` → `next()` (ADR-4: tolerant — client will refresh)
  - `at` valid → `next()`
  - `at` expired, has `rt` → `next()` (ADR-4: tolerant)
  - `at` expired, no `rt` → redirect `/login`
  - `at` invalid signature → redirect `/login` + `Set-Cookie at maxAge=0` in response
  - Path `/login` with valid `at` → redirect `/` (dashboard)
  - Path `/login`, no session → `next()` (renders login page)
  - Path `/api/auth/login` → not intercepted (matcher excludes `/api`)
  - Path `/_next/static/x.js` → not intercepted (matcher excludes `_next`)
- [ ] **GREEN** `middleware.ts`:
  - Imports `verifyAccessToken` from `shared/auth/verify`
  - Logic per design §6 (tolerant to expired at)
  - Matcher: `['/((?!_next/static|_next/image|favicon.ico|api|.*\\.\\w+$).*)']`
  - **Comment**: "SPEC DELTA — ADR-4: spec scenario `frontend-route-protection/refresh-silencioso` requires server-side refresh here. Rejected: breaks with multi-instance Node. Middleware is tolerant (passes through if rt exists); client single-flight (shared/api/client.ts) handles refresh transparently."
- Spec: [SPEC:frontend-route-protection/sin-sesion], [SPEC:frontend-route-protection/jose-verificacion], [SPEC:frontend-route-protection/rutas-excluidas] (ADR-4 documented deviation on refresh-silencioso)
- Sequential: T15 → T16

---

### PR 6 — `shell` (~380 lines)
Dependencies: PR 2 (T04, T05, T06) AND PR 3 (T09, T11). Both PRs must be merged first.
T17→T18→T19 sequential.

---

#### T17 · `SessionProvider` + `use-session` — TEST→IMPL pair
- [ ] **RED** `src/shared/providers/session-provider.test.tsx`:
  - Without `initialUser`: `isLoading=true`, `user=null` initially
  - With `initialUser={sub:'1', email:'x@y.com', roles:['ADMIN'], permisos:['ticket:crear'], cliente_id:'c1'}`: `isLoading=false` immediately, `user` matches
  - `useSession().can('ticket:crear')` → `true`; `useSession().can('compra:aprobar')` → `false`
  - Gated element NOT in DOM when `can()` is false (assert `queryByRole` returns null)
  - `isLoading=true` → gated element not rendered (no FOUC of authz)
- [ ] **GREEN** `src/shared/providers/session-provider.tsx`:
  - `SessionContext` with `{ user: JwtPayload | null; isLoading: boolean }`
  - Accepts `initialUser?: JwtPayload | null`; initializes with `user=initialUser`, `isLoading=!initialUser`
  - If no `initialUser`: `isLoading=true` briefly (for future /api/auth/me fetch if needed — foundation leaves user=null until provided)
- [ ] **GREEN** `src/shared/hooks/use-session.ts`:
  - `useContext(SessionContext)` + `can(permiso: string): boolean` checking `user.permisos.includes(permiso)`
- [ ] Update `providers.tsx` to compose `<QueryProvider><SessionProvider initialUser={initialUser}>{children}</SessionProvider></QueryProvider>`
  (initialUser passed from layout server component)
- Spec: [SPEC:frontend-ui-states/authz-ui SessionProvider], [SPEC:frontend-ui-states/authz-ui no FOUC]
- Sequential: T09+T11 → T17

---

#### T18 · App Shell — `RootLayout` + `DashboardLayout` + shell molecules
- Type: structural/presentational (no TEST/IMPL pair — validated by e2e T21 and visual review)
- [ ] `src/app/layout.tsx` (RootLayout):
  `<html lang="es" className="dark">`, import `../styles/globals.css`, wrap children in `<Providers>`
- [ ] `src/app/(dashboard)/layout.tsx` (DashboardLayout — Server Component):
  - Read `at` cookie via `cookies()` from `next/headers`
  - Decode payload: `JSON.parse(atob(at.split('.')[1]))` as `JwtPayload` (no sig verify — only for UI, backend validates)
  - Pass as `initialUser` to `<SessionProvider>` via `<Providers initialUser={user}>`
  - Renders `<AppNav />` + `{children}`
- [ ] `src/components/shell/app-nav.tsx`: nav links (Tickets, Compras, Reparaciones, Equipos) + `<UserMenu />`; uses `rounded-md` for interactive elements
- [ ] `src/components/shell/page-header.tsx`: `{ title: string; actions?: ReactNode }` — `<h1>` + optional actions slot
- [ ] `src/components/shell/user-menu.tsx`: dropdown showing `user.email`; "Cerrar sesión" → POST `/api/auth/logout` then `router.push('/login')`; uses `rounded-md` for dropdown panel
- [ ] `src/app/not-found.tsx`: minimal 404 page with back-to-dashboard link
- Spec: [SPEC:frontend-design-system/dark-mode], [SPEC:frontend-design-system/radios rounded-md/-lg in shell]
- Sequential: T04+T05+T06+T17 → T18

---

#### T19 · `/unauthorized` page — pending resolved
- Type: presentational (no TEST/IMPL pair)
- [ ] `src/app/(dashboard)/unauthorized/page.tsx`:
  - `<div className="rounded-lg ...">` container (8px, card style)
  - `<ShieldX />` icon (lucide-react)
  - Title: "Sin permiso de acceso"
  - Description: "No tenés permiso para acceder a esta sección. Contactá al administrador si creés que esto es un error."
  - `<Button className="rounded-md" onClick={() => router.push('/dashboard')}>Volver al inicio</Button>`
- Resolves pending: página /unauthorized (rol insuficiente con sesión válida)
- Spec: [SPEC:frontend-ui-states/authz-ui ruta protegida por rol → /unauthorized]
- Sequential: T18 → T19

---

### PR 7 — `login+e2e` (~400 lines — borderline)
Dependencies: PR 4 (T13) AND PR 6 (T18). T20→T21 sequential. T22 parallel to T20.

---

#### T20 · `LoginForm` + `use-login` — TEST→IMPL pair
- [ ] **RED** `src/features/auth/components/LoginForm.test.tsx` (RTL + MSW):
  - Renders email field, password field, submit button "Iniciar sesión"
  - Submit with valid creds (MSW `/api/auth/login` → 200 `{user:{...}}`):
    - Button shows spinner + `disabled=true` during pending (check `mutation.isPending` path)
    - Email + password fields are `disabled` during pending
    - On success: no error message visible
  - Submit with invalid creds (MSW → 401 `{statusCode:401, message:"Credenciales inválidas"}`):
    - `isPending` returns to false; error message visible below password
    - Form stays rendered (no redirect)
    - Error text does NOT contain "email" or "existe" (generic)
  - Submit → MSW → 403: shows "El acceso de tu organización está suspendido" (tenant message)
  - Double-submit prevention: rapid second click while `isPending=true` does NOT fire second request
- [ ] **GREEN** `src/features/auth/components/LoginForm.tsx` (presentational — receives `onSubmit`, `error?`, `isLoading` props)
- [ ] **GREEN** `src/features/auth/hooks/use-login.ts`:
  - `useMutation({ mutationFn: (dto) => apiFetch('auth/login', { method: 'POST', json: dto }) })`
  - On 403: set error with specific tenant message; on other errors: generic message
  - On success: `router.push('/dashboard')`
- [ ] **GREEN** `src/app/(auth)/login/page.tsx`: wires `<LoginForm>` + `use-login`
- Spec: [SPEC:frontend-auth/login-exitoso], [SPEC:frontend-auth/creds-invalidas], [SPEC:frontend-auth/usuario-inactivo], [SPEC:frontend-auth/tenant-inactivo], [SPEC:frontend-ui-states/interactive-state LoginForm]
- Sequential: T09+T13+T18 → T20

---

#### T21 · Playwright e2e — login flow
- Type: pure e2e test (no paired impl — validates Slices 1–7 end-to-end)
- [ ] `e2e/login.spec.ts`:
  - Navigate to `/tickets` → assert redirect to `/login` (middleware unauthenticated guard)
  - Navigate to `/login` → form renders (email, password, submit button)
  - Fill valid creds + submit → assert `context.cookies()` contains:
    - `at`: `httpOnly=true`, `sameSite='Lax'`, `path='/'`, `maxAge` ≈ 900 (±5s)
    - `rt`: `httpOnly=true`, `sameSite='Lax'`, `path='/'`, `maxAge` ≈ 604800
  - After login: page URL is `/` or `/dashboard` (NOT `/login`)
  - Navigate to `/tickets` → renders tickets placeholder (no redirect to login)
  - Click "Cerrar sesión" in user menu → assert redirect to `/login`
  - Assert `at` and `rt` cookies absent after logout
  - Navigate to `/tickets` again → redirect to `/login`
- Spec: [SPEC:frontend-auth/login-exitoso e2e cookie validation], [SPEC:frontend-auth/login-exitoso httpOnly via context.cookies()], [SPEC:frontend-route-protection/sin-sesion redirect guard], [SPEC:frontend-auth/logout e2e]
- Sequential: T20 → T21

---

#### T22 · Feature Placeholders
- Type: structural stubs (no TEST/IMPL pair — demonstrates atoms + validates routing)
- [ ] `src/app/(dashboard)/page.tsx`: "Bienvenido, {user.email}" using `useSession()`; `<Skeleton>` placeholder while `isLoading`
- [ ] `src/app/(dashboard)/tickets/page.tsx`: "Tickets" + 5× `<Skeleton className="h-16 w-full" />` placeholder (demonstrates isLoading pattern)
- [ ] `src/app/(dashboard)/tickets/[id]/page.tsx`, `nueva/page.tsx`: stubs with `<PageHeader title="..." />`
- [ ] `src/app/(dashboard)/compras/page.tsx`: `<EmptyState title="No hay compras todavía" description="..." icon={<ShoppingCart />} />` (demonstrates empty state)
- [ ] `src/app/(dashboard)/compras/[id]/page.tsx`: stub
- [ ] `src/app/(dashboard)/reparaciones/page.tsx`, `[id]/page.tsx`: stub with Skeleton demo
- [ ] `src/app/(dashboard)/equipos/page.tsx`, `[id]/page.tsx`: stub with EmptyState demo
- [ ] `src/features/{tickets,compras,reparaciones,equipos}/{components,hooks}/.gitkeep`
- Spec: no direct scenario — validates [SPEC:frontend-design-system/atomos] in real routing context
- Parallel: T18+T04+T05 → T22 (can run parallel to T20 within same PR)

---

## Dependency Graph

```
T01 (scaffolding)
└── T02 (test infra)
    ├── T03 (globals.css)    ──────────────────────────────┐
    ├── T07 (types)          ─────────────────────┐        │
    └── T12 (cookies)        ────────────┐        │        │
                                         │        │        │
         T03+T02 ──► T04 (Skeleton)      │        │        │
                 ──► T05 (EmptyState)    │        │        │
                 ──► T06 (Button)        │        │        │
                                         │        │        │
         T07+T02 ──► T08 (normalize)     │        │        │
                 ──► T09 (apiFetch) ◄────│──── T08│        │
                 ──► T10 (serverFetch)   │        │        │
         T09 ──────► T11 (QueryProvider) │        │        │
                                         │        │        │
         T02+T12 ──► T13 (auth handlers) │        │        │
                 ──► T14 (catch-all)     │        │        │
                                         │        │        │
         T02+T07 ──► T15 (verify.ts)     │        │        │
         T15 ──────► T16 (middleware)    │        │        │
                                         │        │        │
         T11+T09 ──► T17 (SessionProv) ◄─────── T06 ──────┘
         T17+T04+T05+T06 ──► T18 (shell)
         T18 ──────► T19 (unauthorized)

         T09+T13+T18 ──► T20 (LoginForm)
         T20 ──────────► T21 (e2e)
         T18+T04+T05 ──► T22 (placeholders)
```

**Parallel opportunities**:
- After T02: T03, T07, T12 run in parallel
- T04, T05, T06 run in parallel (same deps)
- T08 and T10 run in parallel (same deps: T02+T07)
- T13 and T14 run in parallel (same deps: T02+T12)
- T15 runs in parallel to T13/T14
- T22 runs in parallel to T20 (same PR, different files)

---

## Spec Traceability Matrix

| Task | Spec Capability | Requirement |
|------|----------------|-------------|
| T03 | frontend-design-system | dark-mode (R1), radius-tokens (R3) |
| T04 | frontend-design-system, frontend-ui-states | atomos Skeleton (R4), skeleton isLoading (R1) |
| T05 | frontend-design-system, frontend-ui-states | atomos EmptyState (R4), empty-state (R2) |
| T06 | frontend-design-system, frontend-ui-states | atomos Button (R4), interactive-state (R3), radios (R2) |
| T07 | frontend-api-client | normalizacion-errores (R2) — types |
| T08 | frontend-api-client | normalizacion-respuestas (R1), normalizacion-errores (R2) |
| T09 | frontend-api-client | retry-401 (R3), single-flight (R5) — **RISK #1** |
| T10 | frontend-api-client | server-components (R6) |
| T12 | frontend-auth | login-exitoso (R1) — cookie attributes |
| T13 | frontend-auth | login-exitoso (R1), creds-invalidas (R2), usuario-inactivo (R3), tenant-inactivo (R4), logout (R5), logout-all (R6) |
| T14 | frontend-auth, frontend-api-client | Bearer injection (R1), proxy pass-through (R3) |
| T15 | frontend-route-protection | jose-verificacion (R2) — no jsonwebtoken |
| T16 | frontend-route-protection | sin-sesion (R1), jose-verificacion (R2), rutas-excluidas (R4) [ADR-4 on R3] |
| T17 | frontend-ui-states | authz-ui SessionProvider (R4), no FOUC (R4) |
| T18 | frontend-design-system | dark-mode (R1), radios en shell (R2, R3) |
| T19 | frontend-ui-states | authz-ui ruta protegida (R4) |
| T20 | frontend-auth, frontend-ui-states | login-exitoso (R1), creds-invalidas (R2), usuario-inactivo (R3), tenant-inactivo (R4), interactive LoginForm (R3) |
| T21 | frontend-auth, frontend-route-protection | login-exitoso e2e (R1), sin-sesion redirect (R1), logout e2e (R5) |
| T22 | frontend-design-system | atomos in routing context (R4) |

---

## Review Workload Forecast

| Slice | PR | Tasks | Est. Lines | Status |
|-------|----|-------|-----------|--------|
| infra | PR 1 | T01, T02, T03, T07, T12 | ~300 | OK |
| atoms | PR 2 | T04, T05, T06 | ~220 | OK |
| api-client | PR 3 | T08, T09, T10, T11 | ~400 | BORDERLINE |
| bff | PR 4 | T13, T14 | ~430 | OVER — split T13/T14 |
| middleware | PR 5 | T15, T16 | ~220 | OK |
| shell | PR 6 | T17, T18, T19 | ~380 | OK |
| login+e2e | PR 7 | T20, T21, T22 | ~400 | BORDERLINE |
| **TOTAL** | **7 PRs** | **22 tasks** | **~2,350** | CRITICAL |

**Chained PRs recommended: YES**
**400-line budget risk: CRITICAL** (total ~2,350 lines across the change)
**Individual PR risk**: PR 4 (bff) is over budget (~430 lines) → sdd-apply MUST split into PR 4a (T13 auth handlers, ~270 lines) and PR 4b (T14 catch-all, ~160 lines). PRs 3 and 7 are borderline — apply may keep as-is or split.
**Number of slices: 7 (nominally) → 8 if PR 4 splits**

**Merge order (auto-chain)**:

```
PR 1 (infra)
  ↓
PR 2 (atoms)   ←── can run parallel to PR 3, 4, 5
PR 3 (api-client) ←── can run parallel to PR 2, 4, 5
PR 4 (bff)        ←── can run parallel to PR 2, 3, 5
PR 5 (middleware)  ←── can run parallel to PR 2, 3, 4
  ↓ (wait for PR 2 + PR 3 to merge)
PR 6 (shell)
  ↓ (wait for PR 4 + PR 6 to merge)
PR 7 (login+e2e)
```

Single-developer sequential recommendation: `1 → 2 → 3 → 4 → 5 → 6 → 7`.
Each PR is a standalone unit: tests pass, feature is verifiable in isolation before the next PR builds on it.
