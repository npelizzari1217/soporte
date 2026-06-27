# Apply Progress: auth-cliente-nombre

> Status: DONE — all 3 work-units complete
> Runner: backend Jest + frontend Vitest (strict TDD — RED → GREEN per pair)
> Date: 2026-06-27

---

## WU1 — Contrato JwtPayload + Login [DONE]

### Tasks completed

- **WU1-T1 [TEST RED]** — `login.use-case.spec.ts`: updated `makeCliente()` to accept `nombre` param; added 2 new `it`s in `describe('Login exitoso')` for `cliente_nombre` claim. Confirmed RED (TS2339 — property did not exist).
- **WU1-T2 [IMPL]** — `i-token.service.ts`: added `cliente_nombre: string` to `JwtPayload`; updated JSDoc.
- **WU1-T3 [IMPL]** — `login.use-case.ts`: added `cliente_nombre: cliente.nombre` to payload; updated JSDoc step 5.
- **WU1-T4 [GREEN]** — `npx jest login.use-case.spec --no-coverage` → **23/23 PASS**.

### Files modified
- `backend/src/auth/domain/ports/i-token.service.ts`
- `backend/src/auth/application/use-cases/login.use-case.ts`
- `backend/src/auth/application/use-cases/login.use-case.spec.ts`

---

## WU2 — Refresh + Wiring + Activo + Controller 403 [DONE]

### Tasks completed

- **WU2-T1 [TEST RED]** — `refresh-token.use-case.spec.ts`: added imports (`IClienteRepository`, `ClienteInactivoError`, `ClienteEntity`); added `makeClienteRepo()` and `makeCliente()` factories; declared `clienteRepo` in describe scope; updated `beforeEach` to 4-arg constructor; added `clienteRepo.findById.mockResolvedValue(makeCliente())` to all 6 success tests; added `it('incluye cliente_nombre...')` and new `describe('Rechazo si cliente inactivo')` with 2 its.
- **WU2-T2 [TEST RED]** — `auth.controller.spec.ts`: added `it('lanza ForbiddenException (403) cuando el cliente está inactivo')` in `POST /auth/refresh` describe; fixed `logoutAll` fixture to add `cliente_nombre: 'Test Corp'` (required by new `JwtPayload` shape).
- **WU2-T3 [IMPL]** — `refresh-token.use-case.ts`: imported `IClienteRepository`, `ClienteInactivoError`; added 4th constructor param `clienteRepo`; added step 5b (load cliente, validate activo); added `cliente_nombre: cliente.nombre` to payload; updated JSDoc.
- **WU2-T4 [IMPL]** — `auth.module.ts`: updated `RefreshTokenUseCase` factory to inject `CLIENTE_REPOSITORY` as 4th param.
- **WU2-T5 [IMPL]** — `auth.controller.ts`: added `ClienteInactivoError` → `ForbiddenException` mapping in `refresh()` method (before token error checks).
- **WU2-T6 [GREEN]** — `npx jest refresh-token.use-case.spec auth.controller.spec --no-coverage` → **23/23 PASS**.

### Files modified
- `backend/src/auth/application/use-cases/refresh-token.use-case.ts`
- `backend/src/auth/application/use-cases/refresh-token.use-case.spec.ts`
- `backend/src/auth/auth.module.ts`
- `backend/src/auth/interface/controllers/auth.controller.ts`
- `backend/src/auth/interface/controllers/auth.controller.spec.ts`

### Side-effect fixes (required by JwtPayload contract change)
9 test fixture factories across the codebase had `JwtPayload` objects without `cliente_nombre`. All updated to add `cliente_nombre: 'Test Corp'`:
- `backend/src/auth/infrastructure/guards/guards.spec.ts`
- `backend/src/tickets/interface/controllers/tickets.controller.spec.ts`
- `backend/src/compras/interface/controllers/compras.controller.spec.ts`
- `backend/src/reparaciones/interface/controllers/subtareas.controller.spec.ts`
- `backend/src/reparaciones/interface/controllers/tickets-edilicio.controller.spec.ts`
- `backend/src/reparaciones/interface/controllers/ubicaciones.controller.spec.ts`
- `backend/src/equipos/interface/controllers/componentes.controller.spec.ts`
- `backend/src/equipos/interface/controllers/equipos.controller.spec.ts`
- `backend/src/equipos/interface/controllers/ticket-soporte.controller.spec.ts`

---

## WU3 — Frontend: tipo + sidebar [DONE]

### Tasks completed

- **WU3-T1 [TEST RED]** — Extended `frontend/src/shared/api/types.test.ts` with `describe('JwtPayload — contrato de tipo')` (2 new its). Confirmed RED at type level.
- **WU3-T2 [TEST RED]** — Extended `frontend/src/components/shell/sidebar.test.tsx` with 5 new its for `cliente_nombre` scenarios. Confirmed RED (3 sidebar tests failed — sidebar showed static "Soporte" always).
- **WU3-T3 [IMPL]** — `frontend/src/shared/api/types.ts`: added `cliente_nombre?: string` (optional) to `JwtPayload`; updated JSDoc.
- **WU3-T4 [IMPL]** — `frontend/src/components/shell/sidebar.tsx`: replaced static `Soporte` with `{user?.cliente_nombre || 'Soporte'}`; updated doc-comment.
- **WU3-T5 [GREEN]** — Vitest `types.test.ts` + `sidebar.test.tsx` → **26/26 PASS**.

### Note: queryByText("") RTL issue
`screen.queryByText("")` matches Lucide SVG icons (empty textContent). Changed assertion to `{ selector: "span" }` to scope to text-bearing elements only. Behavior tested is identical.

### Files modified
- `frontend/src/shared/api/types.ts`
- `frontend/src/shared/api/types.test.ts` (extended, not created)
- `frontend/src/components/shell/sidebar.tsx`
- `frontend/src/components/shell/sidebar.test.tsx` (extended, not created)

---

## Final test results

### Backend Jest
```
Test Suites: 101 passed, 101 total
Tests:       1470 passed, 1470 total
```

### Frontend Vitest
```
Test Files:  34 passed (34)
Tests:       224 passed (224)
```

Zero regressions. All new tests GREEN.

---

## Env check

| Item | Verified |
|------|---------|
| Port real: `IClienteRepository.findById(id: string): Promise<ClienteEntity \| null>` | ✓ |
| Error de inactivo: `ClienteInactivoError` en `auth.errors.ts`; ya importado en `auth.controller.ts` | ✓ |
| `ForbiddenException` ya importado en `auth.controller.ts` | ✓ |
| Provider reutilizado: `CLIENTE_REPOSITORY` ya existía en `auth.module.ts` (línea 31 + provider líneas 93-96) | ✓ |
| `sidebar.test.tsx` extendido, no recreado | ✓ |
| `types.test.ts` extendido, no recreado | ✓ |
