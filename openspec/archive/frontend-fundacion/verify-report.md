# Verify Report: frontend-fundacion

**Date:** 2026-06-26
**Branch:** feat/fe-pr7-login (integrates PR1–PR7)
**Verdict:** FAIL — 1 CRITICAL (production cookie read mismatch), 3 WARNING, 1 SUGGESTION

---

## Quality Gates

| Gate | Result | Detail |
|------|--------|--------|
| `vitest run` | PASS | 86/86 tests, 16 files, 11.5s |
| `tsc --noEmit` | PASS | 0 errors (run after `next build` — fresh `.next/types`) |
| `next lint` | PASS | 0 ESLint warnings or errors |
| `next build` | PASS | 18 routes, 0 errors, no route conflicts |

> `app/page.tsx` route conflict (bug from PR7) was correctly fixed before this verification — absent from filesystem.

---

## Task Coverage — 22/22

All 22 tasks verified as implemented. `[x]` marks in tasks.md are accurate.

| Task | File(s) verified | Status |
|------|-----------------|--------|
| T01 Scaffolding | `frontend/` directory, `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs` | ✓ |
| T02 Test infra | `vitest.config.ts`, `vitest.setup.ts`, `test/msw/`, `test/helpers/jwt.ts`, `playwright.config.ts` | ✓ |
| T03 globals.css | `src/styles/globals.css` — all 11 required tokens + `--radius-lg`/`--radius-md` | ✓ |
| T04 Skeleton | `src/components/ui/skeleton.tsx` + `skeleton.test.tsx` (4 tests) | ✓ |
| T05 EmptyState | `src/components/ui/empty-state.tsx` + `empty-state.test.tsx` | ✓ |
| T06 Button isLoading | `src/components/ui/button.tsx` + `button.test.tsx` (8 tests, rounded-md always present) | ✓ |
| T07 shared/api/types.ts | `src/shared/api/types.ts` — ApiError, SessionExpiredError, JwtPayload, ApiFetchInit + bonus `types.test.ts` | ✓ |
| T08 normalize.ts | `src/shared/api/normalize.ts` + `normalize.test.ts` (5 tests) | ✓ |
| T09 apiFetch + single-flight | `src/shared/api/client.ts` + `client.test.ts` (6 tests, incl. 3-concurrent single-flight) | ✓ |
| T10 serverFetch | `src/shared/api/server.ts` + `server.test.ts` (4 tests) | ✓ |
| T11 QueryProvider + query-keys | `src/shared/providers/query-provider.tsx`, `src/shared/api/query-keys.ts` | ✓ |
| T12 shared/auth/cookies.ts | `src/shared/auth/cookies.ts` — COOKIE_AT/RT, maxAge constants, cookieAttrs/clearCookieAttrs | ✓ |
| T13 Auth route handlers | login/refresh/logout/logout-all route.ts + route.test.ts (9 tests) | ✓ |
| T14 BFF catch-all | `src/app/api/[...path]/route.ts` + `route.test.ts` (9 tests, CSRF, bearer injection) | ✓ |
| T15 shared/auth/verify.ts | `src/shared/auth/verify.ts` + `verify.test.ts` (4 tests, jose-only) | ✓ |
| T16 middleware.ts | `middleware.ts` + `middleware.test.ts` (11 tests, ADR-4 tolerant behavior) | ✓ |
| T17 SessionProvider + use-session | `src/shared/providers/session-provider.tsx`, `src/shared/hooks/use-session.ts` + 5 tests | ✓ |
| T18 App shell | `src/app/layout.tsx`, `src/app/(dashboard)/layout.tsx`, `app-nav.tsx`, `page-header.tsx`, `user-menu.tsx`, `not-found.tsx` | ✓ |
| T19 /unauthorized page | `src/app/(dashboard)/unauthorized/page.tsx` — ShieldX icon, rounded-lg card, rounded-md button | ✓ |
| T20 LoginForm + use-login | `LoginForm.tsx`, `use-login.ts`, `LoginForm.test.tsx` (5 tests, `router.push('/')` correct) | ✓ |
| T21 e2e login.spec.ts | `e2e/login.spec.ts` — written; execution deferred (see E2E Status) | WARNING |
| T22 Feature placeholders | all (dashboard) page stubs, .gitkeep files in feature dirs | ✓ |

---

## Findings

### CRITICAL

#### C1 — `__Host-` cookie prefix mismatch: cookies SET with prefix, READ with bare names in production

**Severity:** CRITICAL — would cause complete authentication failure on first production deployment.

**Root cause:** `src/shared/auth/cookies.ts` contains a private `cookieName()` function that returns `__Host-at`/`__Host-rt` when `NODE_ENV === 'production'`. `cookieAttrs()` and `clearCookieAttrs()` use it correctly when SETTING cookies. However, all cookie READS use the bare constants `COOKIE_AT = "at"` and `COOKIE_RT = "rt"`, which never get the prefix applied.

**Effect in production:**
- Browser receives `Set-Cookie: __Host-at=value` → stores cookie named `__Host-at`
- Browser sends `Cookie: __Host-at=value` on every request
- Route handlers call `request.cookies.get("at")` → returns `undefined` (cookie is named `__Host-at`)
- Bearer injection in BFF proxy: no `at` found → no `Authorization` header → backend returns 401 on every call
- Refresh handler reads `rt` → `undefined` → sends `{ refreshToken: undefined }` → backend 401 → `SessionExpiredError`
- Dashboard layout reads `"at"` → `undefined` → `initialUser = null` → session shows as loading indefinitely

**`middleware.ts` is the ONLY component that correctly handles this** (it has its own local `cookieName()` function at line 34–36).

**Tests pass because** `NODE_ENV=test` during vitest → bare names throughout → no mismatch.

**Files affected (all cookie READs in production):**
- `src/app/api/[...path]/route.ts:71` — `request.cookies.get(COOKIE_AT)`
- `src/app/api/auth/refresh/route.ts:25` — `request.cookies.get(COOKIE_RT)`
- `src/app/api/auth/logout/route.ts:17-18` — `request.cookies.get(COOKIE_AT)`, `request.cookies.get(COOKIE_RT)`
- `src/app/api/auth/logout-all/route.ts:15` — `request.cookies.get(COOKIE_AT)`
- `src/app/(dashboard)/layout.tsx:28` — `cookieStore.get("at")`

**Fix:** Export `cookieName()` from `src/shared/auth/cookies.ts` and call it when reading cookies. All 5 affected files must use `cookieName(COOKIE_AT)` / `cookieName(COOKIE_RT)` as the key in `.get()` calls.

```ts
// cookies.ts — add export:
export function cookieName(name: string): string {
  return process.env.NODE_ENV === "production" ? `__Host-${name}` : name;
}
// Then in route handlers:
const at = request.cookies.get(cookieName(COOKIE_AT))?.value;
// In DashboardLayout:
const at = cookieStore.get(cookieName(COOKIE_AT))?.value;
```

---

### WARNING

#### W1 — ADR-4: middleware does NOT call /api/auth/refresh (ACCEPTED DEVIATION)

**Spec:** `frontend-route-protection/refresh-silencioso` (R4) requires server-side silent refresh in middleware when `at` is expired but `rt` is valid.

**Implementation:** Middleware is tolerant — it passes through when `rt` is present, even if `at` is expired. The client single-flight (`src/shared/api/client.ts`) handles the refresh transparently on the first 401.

**ADR-4 rationale** (documented in `middleware.ts:15-23` and `tasks.md §Spec Delta`): server-side refresh in middleware would break with multi-instance Node deployments (shared module state not visible across instances, rotation conflicts). The end-user experience is preserved — no redirect occurs.

**Status: ACCEPTED** per the SDD design decision. Not a blocker for archive.

---

#### W2 — Refresh token cookie Path='/' diverges from spec R1 (Path=/api/auth/refresh)

**Spec:** `frontend-auth/login-exitoso` R1 specifies the refresh token with `Path=/api/auth/refresh`.

**Implementation:** Both `at` and `rt` cookies use `path: '/'` (see `src/shared/auth/cookies.ts:49`).

**Why:** (1) Middleware needs to read `rt` at ALL paths for ADR-4 tolerance — `Path=/api/auth/refresh` would make `rt` invisible to the middleware matcher. (2) The `__Host-` prefix (production) mandates `Path=/` by the cookie prefix specification. Tasks.md T12 explicitly specifies `path: '/'` for this reason. The e2e spec (`e2e/login.spec.ts:93`) also asserts `rtCookie.path === "/"`, confirming the design intent.

**Security impact:** RT is sent to all same-origin routes instead of only `/api/auth/refresh`. `httpOnly` prevents JS exfiltration; `sameSite: 'lax'` prevents CSRF. Acceptable for this stack.

**Not a blocker** but represents an intentional spec delta that was not formally documented as an ADR. Recommend adding a comment to `cookies.ts` explaining the path choice.

---

#### W3 — T21 Playwright e2e not executed (backend not available)

**Status:** `e2e/login.spec.ts` was written (T21) and is syntactically correct. Execution deferred — requires a running NestJS backend + Next.js dev server.

**Static review result (no issues found):**
- Cookie names: `"at"` / `"rt"` ✓ (correct for dev environment)
- Post-login URL assertion: `/\/(dashboard)?$/` ✓ (matches `/` from `router.push('/')`)
- Logout: clicks `getByRole("button", { name: /cerrar sesión/i })` ✓ (UserMenu renders "Cerrar sesión")
- After-logout cookie assertions: checks for `undefined` on both cookies ✓
- `/tickets` after logout → expects `/login` redirect ✓ (middleware will redirect)
- `/tickets` after login → expects heading matching `/tickets/i` ✓ (`tickets/page.tsx` renders `<PageHeader title="Tickets" />` → `<h1>`)

**Fix:** Run with a backend. No code changes needed in the spec file.

---

### SUGGESTION

#### S1 — UserMenu.handleLogout missing explicit `credentials: 'same-origin'`

`src/components/shell/user-menu.tsx:26`: `fetch("/api/auth/logout", { method: "POST" })` relies on the browser default (`credentials: 'same-origin'` is the default for same-origin fetches). This is correct in practice but marginally less explicit than other fetch calls in the codebase.

**Fix (optional):** Add `credentials: 'same-origin'` for clarity. Not a bug.

---

## Spec Traceability

| Capability | Requirements | Coverage |
|-----------|-------------|---------|
| frontend-design-system (13 scenarios) | R1 dark-mode, R2 @theme tokens, R3 radii, R4 atoms | All covered |
| frontend-ui-states (11 scenarios) | R1 skeleton, R2 empty-state, R3 interactive, R4 authz-UI no-FOUC | All covered |
| frontend-auth (9 scenarios) | R1 login+cookies, R2 creds-invalidas, R3 inactive-user, R4 tenant-inactive, R5 logout, R6 logout-all | All covered |
| frontend-route-protection (8 scenarios) | R1 no-session→/login, R2 /login with session, R3 invalid sig+clear, R4 expired+rt (ADR-4), R5 expired+expired, R6 excluded routes | All covered (W1 on R4) |
| frontend-api-client (10 scenarios) | R1 200/204, R2 error normalization, R3 401-retry, R4 no-loop, R5 single-flight, R6 serverFetch RSC | All covered |

---

## E2E Status

**T21: WARNING — e2e unvalidated (requires running backend)**

Static review found the spec to be correct and self-consistent with the implementation. No code changes needed in `e2e/login.spec.ts`.

---

## Constitution Compliance (CLAUDE.md §3)

| Rule | Result |
|------|--------|
| `rounded-lg` for cards/panels | ✓ Login card, UnauthorizedPage card, DashboardLayout panels |
| `rounded-md` for interactive elements | ✓ Button (base cva class), inputs (LoginForm), nav links (AppNav), dropdown (UserMenu) |
| Dark theme by default | ✓ `<html className="dark">` in RootLayout, `--color-background: oklch(0.16 0 0)` |
| Generic auth errors (no user enumeration) | ✓ Error text tested: does NOT contain "email" or "existe"; 403 uses tenant-specific message |
| Scope Rule | ✓ Auth feature components in `features/auth/`; shared atoms in `components/ui/`; shared providers/hooks in `shared/` |
| Screaming Architecture | ✓ Directory structure reflects domain: `features/{tickets,compras,reparaciones,equipos}` |

---

## Summary

**Verdict: FAIL**

1 CRITICAL (C1 — `__Host-` cookie read/write mismatch, production auth failure), 3 WARNING (W1 ADR-4 accepted, W2 RT path deviation, W3 T21 deferred), 1 SUGGESTION.

The four quality gates (vitest/tsc/lint/build) all pass. All 22 tasks are correctly implemented. The CRITICAL issue is a production-only bug (development and all tests are unaffected); the code path only activates when `NODE_ENV === 'production'`. The fix is mechanical: export `cookieName()` from `cookies.ts` and apply it at the 5 read sites.

**next_recommended:** `sdd-apply` (fix C1) → re-verify → `sdd-archive`
