# Verify Report — PR-06: auth infrastructure + guards + interface

> Change: **modelo-datos-tres-flujos**
> Scope: Tasks 2.C.1, 2.C.2, 2.D.1, 2.D.2, 2.D.3, 2.D.4 + carried-over W1/W2/W3
> Date: 2026-06-23
> Verdict: **FAIL**

---

## Suite results

| Check | Result |
|-------|--------|
| `pnpm test` | 336/336 green (27 suites) |
| `pnpm lint` | Clean — fitness rule green |
| `tsc --noEmit` | Clean |
| DUMMY_HASH safety | Format valid, timing defense works (47ms) |
| DI bootstrap (`app.module.spec.ts`) | Green — no provider shadowing |

> The suite passes because CRITICAL issues are either untested behavior (TenantGuard DB
> resolution) or tested with the wrong expectation (ClienteInactivoError → 401).

---

## CRITICAL-1 — TenantGuard does not implement full spec contract

**Spec requirement** (`clientes-tenancy/spec.md` — MUST):
```
When el TenantGuard procesa la request
Then MUST resolver db_name consultando master.clientes WHERE id = cliente_id
And  MUST verificar que activo = TRUE y deleted_at IS NULL
And  MUST obtener TenantPrismaClient usando db_name como discriminador de conexión
```

**Design decision** (`design.md` line 324-327):
> "extraen `cliente_id`/`db_name` del JWT → validan en master que el cliente esté activo →
> `getTenantClient(db_name)` → guardan `{ prismaClient, dbName, clienteId }` en
> `AsyncLocalStorage` (`TenantContext`)."

**Tasks** (2.D.1):
> "Test de TenantGuard: verifica que resuelve db_name desde master.clientes, verifica
> rechazo si activo = false."

**Current implementation** (`backend/src/auth/infrastructure/guards/tenant.guard.ts`):
```typescript
canActivate(context: ExecutionContext): boolean {
  const user = request.user;
  if (!user || !user.cliente_id) {
    throw new ForbiddenException('Acceso denegado: tenant no identificado');
  }
  return true;
}
```
Only checks `cliente_id` presence in JWT. No DB query, no `activo` check, no `TenantContext`
setup.

**Impact (dual)**:
1. Mid-session client suspension NOT detected — suspended clients keep access for up to the
   JWT TTL (15 minutes). Spec scenario "Cliente suspendido en mid-sesión" is unimplemented.
2. Fase 3+ tenant controllers CANNOT work — `TenantContext` is never populated by
   `TenantGuard`, so ALL tenant repositories will fail on `TenantContext.getClient()`.
   This blocks the entire next phase.

**Required fix**: Inject `PrismaService` + `TenantContext` into `TenantGuard`. On every
request: query `master.clientes WHERE id = cliente_id`, verify `activo = true` and
`deleted_at IS NULL`, call `PrismaService.getTenantClient(dbName)`, bind `TenantContext`.

---

## CRITICAL-2 — AuthController maps ClienteInactivoError → HTTP 401 (should be 403)

**Spec requirement** (`auth-rbac/spec.md` — MUST):
```
Scenario: Login de usuario con cliente inactivo es rechazado
Then el sistema MUST devolver HTTP 403
And  MUST NOT generar tokens
```

**Current implementation** (`backend/src/auth/interface/controllers/auth.controller.ts`):
```typescript
if (result.isFail()) {
  const error = result.getError();
  if (error instanceof CredencialesInvalidasError) {
    throw new UnauthorizedException(error.message);  // 401
  }
  throw new UnauthorizedException('Credenciales inválidas');  // 401 — catches ClienteInactivoError!
}
```

`ClienteInactivoError` falls through to the generic `UnauthorizedException` → HTTP 401.

**Test gap**: `auth.controller.spec.ts` only tests `CredencialesInvalidasError → 401`.
No RED test was ever written for `ClienteInactivoError → 403`.

**Required fix**: Add explicit branch before the fallthrough:
```typescript
if (error instanceof ClienteInactivoError) {
  throw new ForbiddenException(error.message);  // 403
}
```
Plus add the corresponding controller unit test (RED → GREEN).

---

## WARNING-1 — DUMMY_HASH documentation is inaccurate

**Comment in** `backend/src/auth/application/use-cases/login.use-case.ts`:
> "Este valor fue pre-calculado con @node-rs/argon2 v2 defaults (m=19456, t=2, p=1).
> NOTA: regenerar con `argon2.hash('__dummy_soporte__')` si cambian los parámetros."

**Actual behavior**: `verify(DUMMY_HASH, '__dummy_soporte__')` returns `false`. The hash was
NOT generated from `'__dummy_soporte__'`.

**Risk level**: LOW — functionality is unaffected:
- `verify(DUMMY_HASH, any_wrong_password)` takes 47ms (full argon2id computation runs)
- Returns `false`, never throws
- `Argon2HashProvider.verify()` has a `try/catch` as backup layer

**Maintenance concern**: The regeneration instruction is misleading — a developer following
the note would generate a different hash and not be able to verify it's correct.

**Suggested fix**: Update the comment to reflect the actual password used (or that the
password is unknown), and note that the only requirement is that it's a syntactically valid
argon2id hash. Alternatively, generate the real hash and record the source password.

---

## WARNING-2 — Task 2.D.1 marked complete without TenantGuard DB-resolution scenarios

**Strict TDD mode**: The RED→GREEN cycle for the `db_name` resolution and `activo = false`
rejection scenarios was never run. Task 2.D.1 is marked ✅ but covers only 3 scenarios:

| Test | Covers spec scenario? |
|------|-----------------------|
| "permite cuando el JWT tiene un cliente_id válido" | JWT presence only |
| "lanza ForbiddenException cuando cliente_id está vacío" | JWT presence only |
| "lanza ForbiddenException cuando no hay usuario" | JWT presence only |

Missing (from tasks.md 2.D.1):
- "verifica que resuelve db_name desde master.clientes"
- "verifica rechazo si activo = false"

---

## SUGGESTION-1 — Argon2 algorithm constant

`backend/src/auth/infrastructure/argon2-hash.provider.ts`:
```typescript
algorithm: 2 as const, // 2 = Argon2id
```

If `@node-rs/argon2` exports `Argon2Algorithm.Argon2id`, using it would be self-documenting
and robust against library version changes that renumber constants.

---

## Verified OK

| Area | Status | Notes |
|------|--------|-------|
| W1 — Timing defense | OK | DUMMY_HASH valid, 47ms computation |
| W2 — BajaUsuario transactional | OK | MasterTransactionRunner wraps save+revokeAll |
| W3 — Roles+permisos hydration | OK | USUARIO_INCLUDE nested JOIN |
| 2.C.1 — Integration tests | OK | 18 tests, PrismaUsuarioRepo/RefreshTokenRepo/RoleRepo |
| 2.C.2 — Argon2HashProvider | OK | @node-rs/argon2, no node-gyp, argument order inverted |
| 2.C.2 — JwtTokenService | OK | verifyJwt returns null (not throws) |
| 2.D.1 — JwtAuthGuard tests | OK | 4 tests, all scenarios |
| 2.D.1 — RolesGuard tests | OK | 4 tests, OR logic |
| 2.D.1 — PermissionsGuard tests | OK | 4 tests, AND logic |
| 2.D.2 — Guards zero-DB | OK | JwtAuthGuard/RolesGuard/PermissionsGuard |
| 2.D.2 — Decorators | OK | @Roles, @RequirePermissions, @CurrentUser |
| 2.D.3 — Controller tests | Partial | ClienteInactivoError → 403 scenario missing |
| 2.D.4 — AuthModule wiring | OK | No provider shadowing, bootstrap test green |
| 2.D.4 — AuthController routes | OK | POST /auth/login|refresh|logout|logout-all |
| maxWorkers: 1 | OK | Prevents integration test DB conflicts |
| app.module.spec.ts | OK | Compiles full DI graph including AuthModule |

---

## Files requiring changes

| File | Change needed |
|------|---------------|
| `backend/src/auth/infrastructure/guards/tenant.guard.ts` | Full reimplementation: inject PrismaService + TenantContext, query DB, verify activo, setup TenantContext |
| `backend/src/auth/infrastructure/guards/guards.spec.ts` | Add TenantGuard DB-resolution tests (RED before impl) |
| `backend/src/auth/interface/controllers/auth.controller.ts` | Add `ClienteInactivoError → ForbiddenException (403)` |
| `backend/src/auth/interface/controllers/auth.controller.spec.ts` | Add `ClienteInactivoError → 403` unit test (RED before fix) |
| `backend/src/auth/application/use-cases/login.use-case.ts` | Fix DUMMY_HASH comment accuracy |

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| CRITICAL | 2 | TenantGuard incomplete; ClienteInactivoError → 401 instead of 403 |
| WARNING | 2 | DUMMY_HASH doc wrong; TenantGuard task incompletely tested |
| SUGGESTION | 1 | Argon2 algorithm enum constant |

**Next recommended**: `sdd-apply` to fix CRITICAL issues, then re-verify before archive.
