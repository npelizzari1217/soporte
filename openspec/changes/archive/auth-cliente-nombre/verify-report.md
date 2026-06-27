# Verify Report: auth-cliente-nombre

> Date: 2026-06-27
> Verifier: sdd-verify (adversarial)
> Verdict: **PASS WITH WARNINGS**

---

## Suite Results

| Suite | Files | Tests | Result |
|-------|-------|-------|--------|
| Backend Jest | 101 suites | **1470 passed, 0 failed** | PASS |
| Frontend Vitest | 34 files | **224 passed, 0 failed** | PASS |

---

## Typecheck / Build

| Target | Result | Notes |
|--------|--------|-------|
| Backend `tsc --noEmit` | **CLEAN** (no output) | Zero errors |
| Frontend `tsc --noEmit` — production code | **CLEAN** | No errors in non-test files |
| Frontend `tsc --noEmit` — test files | **PRE-EXISTING ERRORS** | `vi.fn<[], T>` syntax in `sidebar.test.tsx`, `app-shell.test.tsx`, `user-menu.test.tsx`, `layout.test.tsx` — same pattern exists since commit `8f1b62e` (prior change), not introduced here. All tests pass at runtime. |

---

## Security Fix — Adversarial Verification (Re-validación `activo` en Refresh)

### Implementación

**File:** `backend/src/auth/application/use-cases/refresh-token.use-case.ts:87-92`

```typescript
// 5b. Verificar que el cliente (tenant) siga activo (espeja el check de login).
// Sin este check, un tenant suspendido podría renovar tokens por hasta 7 días.
const cliente = await this.clienteRepo.findById(usuario.clienteId);
if (!cliente || !cliente.activo) {
  return Result.fail(new ClienteInactivoError());
}
```

- El use case carga `clienteRepo.findById(usuario.clienteId)` — id del usuario en DB, no input del cliente.
- Si `!cliente || !cliente.activo` → `Result.fail(new ClienteInactivoError())` — inmediato, antes de firmar JWT.
- Después del check exitoso → `cliente_nombre: cliente.nombre` se agrega al payload (línea 105).

**File:** `backend/src/auth/interface/controllers/auth.controller.ts:82-84`

```typescript
if (error instanceof ClienteInactivoError) {
  throw new ForbiddenException(error.message);
}
```

Mapeo `ClienteInactivoError` → **HTTP 403** confirmado. Está ANTES del bloque de errores de token (401). No puede producir 500 ni 200.

### Cobertura de tests

**`refresh-token.use-case.spec.ts` — `describe('Rechazo si cliente inactivo')` (líneas 238-261):**
- `it('retorna ClienteInactivoError si el cliente está inactivo')` — mock `makeCliente('X', false)` → assert `result.isFail()` + `instanceof ClienteInactivoError`. ✅
- `it('NO emite JWT ni nuevo refresh token si el cliente está inactivo')` — assert `tokenService.signJwt` NOT called. ✅

**`auth.controller.spec.ts` — `describe('POST /auth/refresh')` (línea 118):**
- `it('lanza ForbiddenException (403) cuando el cliente está inactivo')` — mock `Result.fail(new ClienteInactivoError())` → assert `rejects.toThrow(ForbiddenException)`. ✅

**Veredicto:** Fix de seguridad IMPLEMENTADO y CUBIERTO por tests. No se puede bypassear.

---

## Requirements Coverage

### Spec: auth-rbac

| Requirement / Scenario | Estado | Evidencia |
|------------------------|--------|-----------|
| JwtPayload backend incluye `cliente_nombre: string` (no opcional) | SATISFECHO | `i-token.service.ts:20` |
| JwtPayload backend: alias alternativos AUSENTES | SATISFECHO | interfaz auditada, solo `cliente_nombre` |
| JwtPayload backend: `sub`, `email`, `roles`, `permisos`, `cliente_id` presentes | SATISFECHO | `i-token.service.ts:14-21` |
| JwtPayload frontend: `cliente_nombre?: string` (opcional) | SATISFECHO | `types.ts:15` |
| JwtPayload frontend: ausencia produce `undefined`, no error | SATISFECHO | `types.test.ts` it 1 |
| Login exitoso incluye `cliente_nombre` correcto | SATISFECHO | `login.use-case.ts:117` + test `login.use-case.spec.ts` |
| `cliente_nombre` = `cliente.nombre` (no `razonSocial`, no `cuit`) | SATISFECHO | payload construido con `cliente.nombre` exclusivamente |
| `cliente_nombre` corresponde solo al cliente del usuario (no cross-tenant) | SATISFECHO | se toma de `usuario.clienteId` desde DB, sin input del cliente |
| Login con cliente inactivo rechazado sin emitir token (regresión) | SATISFECHO | `login.use-case.ts:99-103`, test en login.use-case.spec.ts |
| Refresh exitoso mantiene `cliente_nombre` | SATISFECHO | `refresh-token.use-case.ts:105` + test línea 219-235 |
| `cliente_nombre` del JWT renovado = cliente del usuario (no cross-tenant) | SATISFECHO | id tomado de `usuario.clienteId` en DB |
| Refresh expirado/revocado rechazado (regresión) | SATISFECHO | tests preexistentes — 1470 pass |
| Refresh con cliente inactivo → `ClienteInactivoError` | SATISFECHO | líneas 87-92 + tests líneas 238-261 |
| Controller mapea `ClienteInactivoError` → 403 en refresh | SATISFECHO | `auth.controller.ts:82-84` + test línea 118 |

### Spec: frontend-shell

| Requirement / Scenario | Estado | Evidencia |
|------------------------|--------|-----------|
| Header sidebar muestra `cliente_nombre` cuando está presente | SATISFECHO | `sidebar.tsx:55` — `{user?.cliente_nombre \|\| 'Soporte'}` |
| Texto estático "Soporte" AUSENTE cuando claim disponible | SATISFECHO | `sidebar.test.tsx` línea 179 |
| Elemento de display de solo lectura (no button/select/input) | SATISFECHO | `sidebar.test.tsx` línea 145-155 |
| Nombre mostrado = cliente del usuario autenticado | SATISFECHO | claim server-side, no input del cliente |
| Avatar con inicial del email presente cuando hay `cliente_nombre` | SATISFECHO | `sidebar.test.tsx` línea 202-212 |
| Fallback "Soporte" cuando claim ausente | SATISFECHO | `sidebar.tsx:55` + test línea 182-187 |
| Fallback ante string vacío en `cliente_nombre` | SATISFECHO | `||` (no `??`) cubre `""` — test línea 189-199 |
| MUST NOT renderizar `"undefined"` | SATISFECHO | `sidebar.test.tsx` línea 214-218 |
| Transición reactiva cuando JWT se renueva con claim | SATISFECHO* | `{user?.cliente_nombre \|\| 'Soporte'}` re-renderiza con `useSession`; no hay test explícito para el ciclo de refresh (ver SUGGESTION) |
| Cierre de W3 — Req 4 promovido a COMPLETO | SATISFECHO | Comment del componente actualizado; fallback + nombre real implementados |

---

## Findings

### WARNING — Errores TypeScript en test files frontend (pre-existentes)

**Archivos afectados:**
- `frontend/src/components/shell/sidebar.test.tsx:26,28` — `vi.fn<[], T>` causa TS2558 y cascada de TS2345 en todos los `mockReturnValue()` calls.
- `frontend/src/components/shell/app-shell.test.tsx:31` — mismo patrón (pre-existente, commit `8f1b62e`).
- `frontend/src/components/shell/user-menu.test.tsx:28` — ídem.
- `frontend/src/app/layout.test.tsx:32+` — ídem.

**Impacto:** Ninguno en runtime. Los 224 tests Vitest pasan. El código de producción no tiene errores TS. El patrón `vi.fn<[], T>` es incompatible con la versión actual de los tipos de Vitest en strict mode.

**Clasificación:** WARNING (pre-existente, no introducido por este change; bloquear archive sería incorrecto).

**Acción recomendada:** Reemplazar `vi.fn<[], T>(() => ...)` por `vi.fn(() => ...) as unknown as MockedFunction<...>` en un cleanup técnico separado.

### SUGGESTION — Sin test explícito para el escenario de transición reactiva

**Scenario:** "Transición al obtener un JWT con `cliente_nombre` actualizado" — el sidebar muestra el nombre actualizado tras un refresh sin recargar página.

La implementación es inherentemente reactiva (`{user?.cliente_nombre || 'Soporte'}` re-renderiza cuando `useSession` emite un nuevo usuario). No es un bug de implementación — es una gap de coverage de tests de integración. Un test de este escenario requeriría simular el ciclo completo de refresh en el context de session.

**Clasificación:** SUGGESTION.

---

## Wiring Verification

`auth.module.ts:127-135`: `RefreshTokenUseCase` factory usa `(refreshTokenRepo, usuarioRepo, tokenService, clienteRepo)` con `inject: [REFRESH_TOKEN_REPOSITORY, USUARIO_REPOSITORY, TOKEN_SERVICE, CLIENTE_REPOSITORY]`. `CLIENTE_REPOSITORY` ya existía como provider en el módulo (línea 93-96). Wiring correcto.

## Fixtures (9 factories actualizadas)

Todos los specs en `guards`, `tickets`, `compras`, `reparaciones`, `equipos` controllers actualizados con `cliente_nombre: 'Test Corp'` en los fixtures de `JwtPayload`. Resultado: 1470/1470 backend tests pasan sin regresiones.

---

## Summary

| Categoría | Conteo |
|-----------|--------|
| CRITICAL | 0 |
| WARNING | 1 (TS errors en test files — pre-existentes) |
| SUGGESTION | 1 (sin test explícito para transición reactiva) |
| Requisitos SATISFECHO | 26/26 + 1 con nota |
| Requisitos PARCIAL | 0 |
| Requisitos NO SATISFECHO | 0 |

**Veredicto: PASS WITH WARNINGS — apto para archive.**

