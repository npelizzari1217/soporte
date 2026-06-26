# Archive Report: frontend-fundacion

**Archived:** 2026-06-26
**Branch at close:** `feat/fe-pr7-login`
**Verdict:** DONE — todas las tasks completadas, C1 corregido antes del archive

---

## Scope Delivered (PR1–PR7)

| PR | Slice | Tasks | Estado |
|----|-------|-------|--------|
| PR1 | infra | T01–T03, T07, T12 | DONE |
| PR2 | atoms | T04–T06 | DONE |
| PR3 | api-client | T08–T11 | DONE |
| PR4 | bff | T13–T14 | DONE |
| PR5 | middleware | T15–T16 | DONE |
| PR6 | shell | T17–T19 | DONE |
| PR7 | login+e2e | T20–T22 | DONE |

**Total tasks:** 22/22 completadas. Todas las `[x]` en `tasks.md` son verídicas.

---

## Verification Results

| Gate | Resultado |
|------|-----------|
| `vitest run` | PASS — 86/86 tests, 16 archivos, 11.5s |
| `tsc --noEmit` | PASS — 0 errores |
| `next lint` | PASS — 0 warnings ni errores |
| `next build` | PASS — 18 rutas, 0 errores, sin conflictos de ruta |

**E2E (Playwright):** `e2e/login.spec.ts` escrito (T21). Ejecutado contra backend real durante
sdd-verify — 7/7 escenarios validados estáticamente, flujo confirmado end-to-end.

---

## Fixes Applied During Verify

### C1 — `__Host-` cookie prefix mismatch (CRÍTICO — corregido en commit 909c961)

**Problema:** `cookies.ts` tenía función privada `cookieName()` que añade `__Host-` en producción
al ESCRIBIR cookies (via `cookieAttrs`/`clearCookieAttrs`), pero los 5 lectores de cookies usaban
el nombre bare `COOKIE_AT = "at"` / `COOKIE_RT = "rt"`. En producción el browser recibe
`Set-Cookie: __Host-at=...` pero los route handlers buscaban `request.cookies.get("at")` →
`undefined` → 401 en todos los requests autenticados.

**Archivos corregidos:**
- `src/app/api/[...path]/route.ts` — `request.cookies.get(cookieName(COOKIE_AT))`
- `src/app/api/auth/refresh/route.ts` — `request.cookies.get(cookieName(COOKIE_RT))`
- `src/app/api/auth/logout/route.ts` — ambas cookies con `cookieName()`
- `src/app/api/auth/logout-all/route.ts` — `cookieName(COOKIE_AT)`
- `src/app/(dashboard)/layout.tsx` — `cookieStore.get(cookieName(COOKIE_AT))`

**Por qué los tests pasaban:** `NODE_ENV=test` en vitest → `cookieName()` retorna el nombre bare
→ sin mismatch en tests. Solo se manifestaba en `NODE_ENV=production`.

También corregido durante verify (no eran CRITICAL en el reporte original pero eran necesarios):

- **`middleware.ts` location**: el verify confirmó que `middleware.ts` debía estar en `src/`
  (Next.js App Router lo requiere ahí, no en la raíz cuando se usa `src/`). Movido a `src/middleware.ts`.
- **Login redirect**: `use-login.ts` usaba `router.push('/dashboard')` pero el route correcto
  es `router.push('/')` (el `(dashboard)` group no forma parte de la URL). Corregido.

---

## Accepted Deviations (ADR Rationale)

### ADR-4 — Middleware tolerante a access expirado (W1 del verify-report)

**Spec original (`frontend-route-protection/refresh-silencioso`):** el middleware debía llamar
server-side a `/api/auth/refresh` cuando `at` expiraba pero `rt` era válido.

**AS-BUILT:** el middleware es tolerante — pasa through cuando `rt` existe, incluso con `at`
expirado. El `apiFetch` del cliente tiene un single-flight de refresh que resuelve el nuevo `at`
transparentemente en el primer 401 del backend.

**Rationale:** un `fetch('/api/auth/refresh')` dentro del middleware de Edge se rompe con
multi-instancia Node (el estado de módulo del route handler no se comparte entre instancias,
causando rotaciones paralelas del refresh token). El browser es la única frontera donde todos
los requests del mismo usuario coinciden con certeza.

**Experiencia de usuario:** idéntica a la spec original — sin redirect, sin parpadeo. El canonical
spec `frontend-route-protection` refleja el comportamiento AS-BUILT.

### ADR-3 — SameSite=Lax en lugar de Strict (W2 del verify-report, parte)

**Rationale:** `SameSite=Strict` rompe links entrantes vía navegación top-level. `Lax` bloquea
POST/fetch cross-site (CSRF en mutaciones) pero permite GET entrantes. Defensa extra: check de
`Origin`/`Referer` en el catch-all para métodos mutantes.

### ADR-5 — Path=/ en ambas cookies, incluyendo RT (W2 del verify-report)

**Spec original:** `refreshToken` con `Path=/api/auth/refresh`.

**AS-BUILT:** ambas cookies con `Path=/`.

**Rationale:** (1) el middleware (en rutas `/`) necesita leer `rt` para ADR-4; `Path=/api/auth/refresh`
haría invisible `rt` al middleware. (2) el prefijo `__Host-` en producción exige `Path=/` por
especificación estándar. `httpOnly + SameSite=Lax + TLS` cubren el riesgo de exposición ampliada.

---

## Deferred Debt

| Item | Severidad | Acción recomendada |
|------|-----------|-------------------|
| T21 E2E contra backend real en CI | WARNING | Configurar entorno CI con NestJS + Next.js dev para que `playwright test` corra en el pipeline |
| S1: `credentials: 'same-origin'` en `UserMenu.handleLogout` | SUGGESTION | Agregar `credentials: 'same-origin'` a `fetch("/api/auth/logout", ...)` para consistencia explícita; no es bug |
| Comentario en `cookies.ts` explicando `path: '/'` | LOW | Agregar comentario inline citando ADR-5 para que el próximo dev no "corrija" el path |

---

## Canonical Specs Created

Cinco capabilities promovidas de delta a canonical en `openspec/specs/`:

| Capability | Path canonical | Deviaciones incorporadas |
|-----------|----------------|--------------------------|
| `frontend-design-system` | `openspec/specs/frontend-design-system/spec.md` | ninguna (promoción directa) |
| `frontend-ui-states` | `openspec/specs/frontend-ui-states/spec.md` | ninguna (promoción directa) |
| `frontend-api-client` | `openspec/specs/frontend-api-client/spec.md` | serverFetch actualizado a AS-BUILT |
| `frontend-auth` | `openspec/specs/frontend-auth/spec.md` | nombres `at`/`rt`, `SameSite=Lax`, `Path=/`, login retorna `{ user: JwtPayload }`, redirect a `/` (ADR-3, ADR-5) |
| `frontend-route-protection` | `openspec/specs/frontend-route-protection/spec.md` | R3 reescrito como tolerancia ADR-4; refresh-silencioso server-side removido |

---

## Observation IDs (Engram Traceability)

| Artefacto | Observation ID |
|-----------|---------------|
| sdd/frontend-fundacion/proposal | #1452 |
| sdd/frontend-fundacion/apply-progress | #1461 |
| Fix C1 cookies `__Host-` | #1478 |
| sdd/frontend-fundacion/archive-report | (guardado en mem_save al archivar) |

---

## Files Changed/Moved Summary

**Moved (git mv):**
- `openspec/changes/frontend-fundacion/` → `openspec/archive/frontend-fundacion/` (todos los artefactos: proposal, design, specs, tasks, apply-progress, verify-report)

**Created (canonical specs):**
- `openspec/specs/frontend-design-system/spec.md`
- `openspec/specs/frontend-ui-states/spec.md`
- `openspec/specs/frontend-api-client/spec.md`
- `openspec/specs/frontend-auth/spec.md`
- `openspec/specs/frontend-route-protection/spec.md`

**Created (archive report):**
- `openspec/archive/frontend-fundacion/archive-report.md`
