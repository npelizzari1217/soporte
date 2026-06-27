# Archive Report: auth-cliente-nombre

> Archived: 2026-06-27
> Verdict: PASS WITH WARNINGS — 0 CRITICAL
> Status: CLOSED

---

## Summary

Propagation of the `cliente_nombre` JWT claim from server-side tenant lookup to the frontend sidebar. The backend derives the claim from `usuario.clienteId` (no new queries in the login path; the `ClienteEntity` is already loaded to validate `activo`). The refresh path injects `IClienteRepository` and re-validates `cliente.activo` before re-signing — closing a security gap where a suspended tenant could renew access tokens for up to 7 days. The frontend sidebar reads the optional claim with a mandatory fallback to the brand "Soporte", ensuring backward compatibility with pre-existing sessions.

---

## Work-Units Delivered

### WU1 — Contrato JwtPayload + Login

Files:
- `backend/src/auth/domain/ports/i-token.service.ts` — added `cliente_nombre: string` to `JwtPayload`
- `backend/src/auth/application/use-cases/login.use-case.ts` — `cliente_nombre: cliente.nombre` added to payload (no new query)
- `backend/src/auth/application/use-cases/login.use-case.spec.ts` — 2 new tests RED→GREEN

### WU2 — Refresh + Wiring + Activo + Controller 403

Files:
- `backend/src/auth/application/use-cases/refresh-token.use-case.ts` — 4th param `clienteRepo`; step 5b: re-validate `activo`; `cliente_nombre` in payload
- `backend/src/auth/application/use-cases/refresh-token.use-case.spec.ts` — `makeClienteRepo()`, `makeCliente()` factories; 3 new tests RED→GREEN
- `backend/src/auth/auth.module.ts` — `RefreshTokenUseCase` factory: `CLIENTE_REPOSITORY` injected as 4th param
- `backend/src/auth/interface/controllers/auth.controller.ts` — `ClienteInactivoError` → HTTP 403 in `refresh()`
- `backend/src/auth/interface/controllers/auth.controller.spec.ts` — new test for 403 on inactive client

Side-effect: 9 fixture factories across guards, tickets, compras, reparaciones, equipos controller specs updated to include `cliente_nombre: 'Test Corp'` (required by updated `JwtPayload` shape).

### WU3 — Frontend: tipo + sidebar

Files:
- `frontend/src/shared/api/types.ts` — `cliente_nombre?: string` (optional) added to `JwtPayload`; JSDoc updated
- `frontend/src/shared/api/types.test.ts` — 2 new tests for optional/present scenarios
- `frontend/src/components/shell/sidebar.tsx` — `{user?.cliente_nombre || 'Soporte'}` replaces static brand text; doc-comment updated
- `frontend/src/components/shell/sidebar.test.tsx` — 5 new tests: real name, fallback absent, fallback empty string, avatar initial, no-undefined

Note: RTL `queryByText("")` was scoped to `{ selector: "span" }` to avoid false positives from Lucide SVG nodes.

---

## Test Results

| Suite | Files | Tests | Result |
|-------|-------|-------|--------|
| Backend Jest | 101 suites | **1470 passed, 0 failed** | PASS |
| Frontend Vitest | 34 files | **224 passed, 0 failed** | PASS |

Typecheck: backend `tsc --noEmit` CLEAN. Frontend production code CLEAN. Frontend test files have pre-existing TS errors (see W1 below — not introduced by this change).

---

## Security Highlight

**Re-validación de `cliente.activo` en el refresh** (Decisión de design #4):

Without this check, a tenant suspended *after* a user's last login could continue renewing access tokens for up to 7 days (the refresh token TTL). The fix mirrors the login gate exactly: `RefreshTokenUseCase` loads `clienteRepo.findById(usuario.clienteId)` and returns `ClienteInactivoError` before signing — which the controller maps to HTTP 403.

This is documented in `openspec/specs/auth-rbac/spec.md` under "Scenario: Refresh con cliente inactivo es rechazado — seguridad de tenant suspendido".

---

## Specs Promoted

| Canonical Spec | Change |
|---------------|--------|
| `openspec/specs/auth-rbac/spec.md` | Updated "Login exitoso genera JWT" payload to include `cliente_nombre`. Updated "Refresh token válido" scenario to mention `activo` re-validation and `cliente_nombre`. Added new Requirement "Claim `cliente_nombre` en JWT (tenant del usuario)" with 7 new scenarios covering JwtPayload contract (backend/frontend), login claim, and refresh claim + security check. |
| `openspec/specs/frontend-shell/spec.md` | Req 4 "Display del tenant activo" updated to reflect real `cliente_nombre` implementation. Added 5 new scenarios: real name when claim present, name corresponds to authenticated user, avatar initial preserved, fallback when absent, fallback for empty string. Existing "No existe control de tenant switcher" scenario preserved. W3/PARCIAL status closed — Req 4 is now COMPLETE. |

---

## Follow-ups (non-blocking — pending in backlog)

| ID | Description | Priority |
|----|-------------|----------|
| W1 | TypeScript errors in frontend test files — `vi.fn<[], T>` pattern in `sidebar.test.tsx`, `app-shell.test.tsx`, `user-menu.test.tsx`, `layout.test.tsx`. Pre-existing since commit `8f1b62e` (prior change). No runtime impact; 224 tests pass. Fix: replace with `vi.fn(() => ...) as unknown as MockedFunction<...>`. | Low — tech cleanup |
| e2e | Playwright tests for frontend-shell (FOUC, `@media print`, responsive drawer). Remained pending since the `frontend-shell` change. | Medium |
| Suggestion | Explicit test for reactive sidebar transition when JWT is renewed with `cliente_nombre` (full refresh cycle in session context). Implementation already handles this reactively via `useSession`. | Optional |
| CRUDs | Business domain screens (tickets, equipos, compras, reparaciones) over the v2 design system. Next logical change after shell is complete. | High — next feature |

---

## Artifact Inventory

| Artifact | Location |
|----------|----------|
| Proposal | `openspec/changes/archive/auth-cliente-nombre/proposal.md` |
| Spec delta (auth-rbac) | `openspec/changes/archive/auth-cliente-nombre/specs/auth-rbac/spec.md` |
| Spec delta (frontend-shell) | `openspec/changes/archive/auth-cliente-nombre/specs/frontend-shell/spec.md` |
| Design | `openspec/changes/archive/auth-cliente-nombre/design.md` |
| Tasks | `openspec/changes/archive/auth-cliente-nombre/tasks.md` |
| Apply progress | `openspec/changes/archive/auth-cliente-nombre/apply-progress.md` |
| Verify report | `openspec/changes/archive/auth-cliente-nombre/verify-report.md` |
| Archive report (this file) | `openspec/changes/archive/auth-cliente-nombre/archive-report.md` |
| Canonical auth-rbac | `openspec/specs/auth-rbac/spec.md` |
| Canonical frontend-shell | `openspec/specs/frontend-shell/spec.md` |
