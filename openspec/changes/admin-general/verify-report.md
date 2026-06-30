# Verify Report: admin-general — PR1

> Generado: 2026-06-30 | Scope: PR1 (T1.1–T1.10) | Verifier: sdd-verify
> Rama: feat/admin-general-pr1-security | Verdict: PASS WITH WARNINGS

---

## Suite results (runs reales)

| Suite | Archivos | Tests | tsc | Lint |
|-------|----------|-------|-----|------|
| Backend | 116 | 1784 PASS | clean | clean |
| Frontend | 50 | 401 PASS | clean | 2 warnings pre-existentes (no son del PR1) |

---

## CRITICAL (0)

Ninguno.

---

## WARNING (2)

### W1 — GlobalAdminGuard no registrado/exportado en AuthModule

**File**: `backend/src/auth/auth.module.ts`

`GlobalAdminGuard` es `@Injectable()` y vive en `auth/infrastructure/guards/` pero NO está en `AuthModule.providers[]` ni en `AuthModule.exports[]`. El tasks T1.2 dice "registrar en auth.module.ts **si se inyecta vía DI** (o exportar como clase plana)". La implementación eligió la ruta clase-plana, lo que funciona porque el guard no tiene dependencias de constructor (NestJS instancia en demanda).

El problema aparece en PR2: los controllers que apliquen `@UseGuards(JwtAuthGuard, GlobalAdminGuard)` deberán importar el archivo de la clase directamente en lugar de recibirlo por `AuthModule`. Esto rompe el patrón de módulo como boundary.

**Recomendación**: agregar `GlobalAdminGuard` a `AuthModule.providers[]` y `AuthModule.exports[]` **antes de que aterrice PR2**.

### W2 — Path de migración en tasks.md incorrecto

**File**: `openspec/changes/admin-general/tasks.md`, task T1.7

`tasks.md` dice: `backend/prisma/migrations/20260630_set_global_admin_nestor/migration.sql`

Path real: `backend/prisma_master/migrations/20260630000000_set_global_admin_nestor/migration.sql`

El directorio `backend/prisma/` **no existe** en este repo (solo existe `backend/prisma_master/`). La implementación es CORRECTA — el apply lo documentó como corrección. El tasks.md tiene una referencia inválida que puede confundir PR2+.

---

## SUGGESTION (2)

### S1 — use-session.test.ts testea lógica extraída, no el hook real

**File**: `frontend/src/shared/hooks/use-session.test.ts`

El test define `deriveIsGlobalAdmin()` como función espejo de la lógica del hook y la testea directamente, sin llamar `useSession()` vía `renderHook`. La forma de retorno del hook `{ user, isLoading, can, isGlobalAdmin }` no se verifica en ningún test. Es aceptable dado el constraint de React context, pero el DOD de T1.10 dice "hook retorna `{ user, isLoading, can, isGlobalAdmin }`" — ese contrato no está directamente asertado.

### S2 — Comentario de forwardRef() engañoso en ClientesModule

**File**: `backend/src/clientes/clientes.module.ts`, línea 81

El comentario dice "AuthModule NO importa ClientesModule → sin circularidad" pero usa `forwardRef()`. El `forwardRef` es CORRECTO (hay imports a nivel de archivo Node.js: `auth.module.ts` importa archivos del módulo clientes, y `clientes.module.ts` importa `auth.module.ts`). El comentario debería aclarar que es por circularidad a nivel de archivos Node.js, no del grafo de módulos NestJS.

---

## Cobertura de requirements spec (T1.x)

| Tarea | Spec scenario | Estado |
|-------|---------------|--------|
| T1.1/T1.2 | GlobalAdminGuard: false→403, undefined→403, null→403, true→pass, O(1) no-DB | ✓ 5 tests |
| T1.3/T1.4 | ClientesController: metadata guard, no-auth→401, expired→401, valid→passes | ✓ 4 tests |
| T1.5/T1.6 | CiclosVigentesController: metadata guard, no-auth→401, expired→401 | ✓ 3 tests (spec no exige "valid→passes" para este controller) |
| T1.7 | Migración idempotente nestor@sesitec.com.ar → is_global_admin=true | ✓ UPDATE WHERE (no-op si no existe) |
| T1.8/T1.9 | JwtPayload frontend: is_global_admin?: boolean, retrocompat, cliente_nombre presente | ✓ 4 tests |
| T1.10 | useSession.isGlobalAdmin: true/false/undefined/null + invariante ADMINISTRADOR | ✓ 5 tests (lógica extraída) |

---

## Invariantes del spec verificadas

- `is_global_admin=true` != rol ADMINISTRADOR: ✓ ADMINISTRADOR con false → ForbiddenException (guard) y isGlobalAdmin false (hook).
- GlobalAdminGuard no consulta DB: ✓ sin constructor injections.
- Retrocompatibilidad: ✓ campo opcional en frontend, `undefined` → false en hook.
- Composabilidad: ✓ guard es standalone, composable con `@UseGuards(JwtAuthGuard, GlobalAdminGuard)`.

---

## Compliance arquitectónica

- GlobalAdminGuard en `infrastructure/guards/`: ✓ (auth-access skill — auth providers are infrastructure)
- Guard sin imports de domain/application: ✓ (solo `JwtPayload` del domain port)
- Use cases intactos: ✓
- Controllers son thin (zero logic): ✓
- `forwardRef` justificado: ✓ (circular file imports Node.js, no NestJS module graph)

---

## Recomendación final

**PASS WITH WARNINGS. PR1 puede mergearse.**

Acción bloqueante antes de PR2: exportar `GlobalAdminGuard` desde `AuthModule` (W1).
Acción no bloqueante: corregir path en `tasks.md` T1.7 (W2, documentación).
