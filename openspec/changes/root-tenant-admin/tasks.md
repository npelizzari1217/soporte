# Tasks: root-tenant-admin

> strict_tdd (RED→GREEN, NO negociable). Slicing = design §7: 3 chained PRs A→B→C.
> Cada task referencia Requirement (R#) + Decisión (Dz#). `[CRITICAL]` = escenario de seguridad.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR-A ~180 (100 prod + 80 test) · PR-B ~270 (120 prod + 150 test) · PR-C ~190 (90 prod + 100 test) · **Total ~640** |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR-A → PR-B → PR-C (stacked, dependencia por `isRoot`/endpoint) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main (cada PR mergeable independiente, cada uno agrega valor de seguridad/feature propio) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `isRoot()` + fix aislamiento `asignar-rol` | PR-A | Independiente, base de seguridad, ~180 líneas |
| 2 | `CrearRootUseCase` + endpoint + bootstrap seed | PR-B | Depende de PR-A (`isRoot`), ~270 líneas |
| 3 | X-Tenant-Id centralizado + Switch root UI | PR-C | Depende de PR-B (endpoint), ~190 líneas |

---

## PR-A — Seguridad backend base (Dz1 R1, Dz4 R4) — independiente

- [x] A.0 Verificar entorno: confirmar paths/imports de `usuario.entity.ts`, `asignar-rol.use-case.ts`, `tenant.guard.ts` y sus specs existen y tipan correcto antes de tocar tests (CLAUDE.md §5.4).
- [x] A.1 [RED] `usuario.entity.spec.ts`: `isRoot()` devuelve igual que `isGlobalAdmin=true` (R1-a).
- [x] A.2 [RED][CRITICAL] `usuario.entity.spec.ts`: rol ADMINISTRADOR con `isGlobalAdmin=false` → `isRoot()===false` (R1-b).
- [x] A.3 [GREEN] Agregar `isRoot(): boolean { return this.isGlobalAdmin; }` a `usuario.entity.ts` (Dz1) — pasa A.1/A.2.
- [x] A.4 [RED] `tenant.guard.spec.ts`: root sin rol RBAC igual concede cross-tenant (R1-c) — confirma comportamiento existente, sin cambio de código esperado.
- [x] A.5 [RED][CRITICAL] `tenant.guard.spec.ts`: no-root con `X-Tenant-Id` explícito sigue rechazado 403 (R5-d) — regresión, sin cambio de código esperado.
- [x] A.6 [RED] `tenant.guard.spec.ts`: auditoría cross-tenant (actor/tenant/timestamp) sin regresión (R7-b) — regresión, sin cambio de código esperado.
- [x] A.7 Confirmar A.4-A.6 en GREEN sin tocar `tenant.guard.ts` (son regresión, no fix) — commit work-unit 1: "test(auth): cubrir isRoot() y regresión de tenant.guard".
- [x] A.8+A.9 [RED][CRITICAL] `asignar-rol.use-case.spec.ts`: **colapsado por ajuste del orquestador** en UN solo test ("asignar rol a usuario de OTRO tenant → UsuarioNoEncontradoError (404) (R4-b)") — corrido contra el código ACTUAL, confirmado RED (output pegado en STATE.md), luego GREEN tras A.12. No quedó test muerto separado.
- [x] A.10 [RED→GREEN] `asignar-rol.use-case.spec.ts`: mismo tenant sigue asignando ok sin regresión (R4-c).
- [x] A.11 [RED→GREEN] `asignar-rol.use-case.spec.ts`: root cross-tenant vía `X-Tenant-Id` (clienteId=target) sigue funcionando (R4-d).
- [x] A.12 [GREEN] `asignar-rol.use-case.ts`: sumar `clienteId` a `AsignarRolDto`, chequeo `usuario.clienteId !== dto.clienteId → Result.fail(UsuarioNoEncontradoError)` tras cargar el usuario (Dz4) — pasa A.9-A.11, A.8 deja de reproducir la fuga.
- [x] A.13 [GREEN] `usuarios.controller.ts` (`asignarRol`): resolver `clienteId` de `this.tenantContext.get()!.clienteId`, nunca del body (D7, Dz4).
- [x] A.14 Evidencia real: correr `corepack pnpm test`, `corepack pnpm lint`, `corepack pnpm exec tsc --noEmit -p tsconfig.json` en `backend/` (serial si hay tests de integración compartidos) y pegar los números tal cual. Ver `STATE.md`.
- [x] A.15 Commit work-unit 2 (conventional, sin Co-Authored-By): "fix(auth): validar tenant del objetivo en asignar-rol".

---

## PR-B — Creación de root + bootstrap (depende de PR-A) (Dz2 R2/R7, Dz3 R3)

- [x] B.0 Verificar entorno: confirmar `IHashProvider`, `IUsuarioRepository`, `Argon2HashProvider`, `USUARIO_REPOSITORY`/`HASH_PROVIDER` tokens y paths de import existen antes de escribir tests.
- [x] B.1 [RED] `crear-root.use-case.spec.ts`: actor root crea usuario con `isGlobalAdmin=true`, `roles=[]`, 201 (R2-a).
- [x] B.2 [RED][CRITICAL] `crear-root.use-case.spec.ts`: actor `isRoot=false` → `RootRequeridoError`, sin crear usuario (R2-b / R7-a, doble validación).
- [x] B.3 [GREEN] `auth.errors.ts`: agregar `RootRequeridoError extends DomainError` (code `AUTH_ROOT_REQUERIDO`, Dz2 firma 2.2).
- [x] B.4 [GREEN] Crear `crear-root.use-case.ts` (`CrearRootUseCase`, firma 2.3): valida `actor.isRoot` primero, luego unicidad de email, luego crea entidad con `isGlobalAdmin=true, roles=[]`, hashea password, persiste — pasa B.1/B.2.
- [x] B.5 [RED][CRITICAL] `usuarios.controller.spec.ts`: `POST /usuarios/root` con actor ADMINISTRADOR no-root → 403 vía `GlobalAdminGuard` (R2-c, integration).
- [x] B.6 [RED][CRITICAL] `crear-usuario.use-case.spec.ts`: `POST /usuarios` (alta normal) SIEMPRE crea `isGlobalAdmin=false`, incluso si el actor es root (R2-d) — confirma que el use case existente ignora cualquier flag entrante.
- [x] B.7 [GREEN] `auth.dto.ts`: agregar `CreateRootDto` (`email`, `nombre`, `apellido`, `password`; SIN campo `rol`, firma 2.5).
- [x] B.8 [GREEN] `usuarios.controller.ts`: agregar `POST /usuarios/root` con `@UseGuards(GlobalAdminGuard)`, resolver `clienteId` de `TenantContext`, mapear `RootRequeridoError→403`, `UsuarioConflictError→409` (firma 2.6) — pasa B.5.
- [x] B.9 [GREEN] `auth.module.ts`: wiring `useFactory` de `CrearRootUseCase` (inject `USUARIO_REPOSITORY`, `HASH_PROVIDER`), sumar dependencia al constructor de `UsuariosController` (firma 2.7).
- [x] B.10 Confirmar B.6 sigue en GREEN sin tocar `crear-usuario.use-case.ts` (regresión verificada, no requiere fix).
- [x] B.11 [RED] `root-bootstrap.seed.spec.ts`: crea la fila si no existe, `isGlobalAdmin=true` (R3-a).
- [x] B.12 [RED][CRITICAL] `root-bootstrap.seed.spec.ts`: re-run idempotente, sin duplicar fila, flag sigue `true` (R3-b).
- [x] B.13 [RED] `root-bootstrap.seed.spec.ts`: actualiza solo `isGlobalAdmin=true` si ya existe, no pisa otras columnas (R3-c).
- [x] B.14 [RED] `root-bootstrap.seed.spec.ts`: falta cualquier `ROOT_ADMIN_*` env → throw ruidoso, cero literales hardcodeados (R3-d).
- [x] B.15 [GREEN] Crear `prisma_master/seeds/root-bootstrap.seed.ts` (`requireEnv` + `upsert` por email, Argon2HashProvider real, firma 2.8) — pasa B.11-B.14.
- [x] B.16 Agregar script `"seed:root": "ts-node prisma_master/seeds/root-bootstrap.seed.ts"` en `backend/package.json`.
- [x] B.17 Documentar `ROOT_ADMIN_EMAIL/PASSWORD/NOMBRE/APELLIDO/CLIENTE_ID` en `.env.example` + README (runbook de deploy: `migrate:master` → `seed:root`).
- [x] B.18 Evidencia real: correr `corepack pnpm test`, `corepack pnpm lint`, `corepack pnpm exec tsc --noEmit -p tsconfig.json` en `backend/` y pegar los números tal cual.
- [x] B.19 Commits work-unit (conventional): 1) "feat(auth): crear usuario root con doble validación" (B.1-B.10), 2) "feat(auth): bootstrap idempotente del primer root" (B.11-B.17).

---

## PR-C — Frontend: X-Tenant-Id centralizado + UI root (depende de PR-B) (Dz5 R5, Dz2-UI R6)

- [x] C.0 Verificar entorno: confirmar paths de `apiFetch`/`rawFetch` (`client.ts`), `TenantContextProvider`, `useSession`, `ClienteSelector` existen y tipan antes de escribir tests.
- [x] C.1 [RED][CRITICAL] `tenant-header.test.ts` + `client.test.ts`: usuario no-root nunca envía `X-Tenant-Id` (holder queda `null`) (R5-c).
- [x] C.2 [RED][CRITICAL] `client.test.ts`: root con cliente seleccionado → header inyectado en request arbitraria (tickets/compras/equipos/reparaciones heredan del mismo punto) (R5-a, R5-b).
- [x] C.3 [RED] `client.test.ts`: header `X-Tenant-Id` explícito ya presente NO es pisado por el holder (precedencia; protege el fetch de ciclos en `tenant-context.tsx:87`).
- [x] C.4 [GREEN] Crear `shared/api/tenant-header.ts` (`setTenantHeader`/`getTenantHeader`, holder module-level, firma 2.9).
- [x] C.5 [GREEN] `client.ts` (`rawFetch`): inyectar `X-Tenant-Id` desde `getTenantHeader()` solo si hay valor y `!headers.has('x-tenant-id')` (firma 2.10) — pasa C.1-C.3.
- [x] C.6 [RED] `tenant-context.test.tsx`: efecto puente llama `setTenantHeader(isGlobalAdmin && clienteId ? clienteId : null)`; cleanup en unmount/logout setea `null`.
- [x] C.7 [GREEN] `tenant-context.tsx`: agregar `useEffect` puente con cleanup (firma 2.11) — pasa C.6.
- [x] C.8 [CRITICAL] Verificación cruzada (sin nuevo test): confirmado que R5-d (backend rechaza 403 cross-tenant de no-root aunque el frontend mandara el header) sigue cubierto por `tenant.guard.spec.ts` de PR-A — no requirió cambio.
- [x] C.9 [RED] `UsuariosPage.test.tsx`: root ve el `Switch` "Root"; al activarlo y enviar, llama `POST /usuarios/root` con `isGlobalAdmin=true` (R6-a).
- [x] C.10 [RED][CRITICAL] `UsuariosPage.test.tsx`: ADMINISTRADOR no-root NO renderiza el `Switch`; ningún camino de UI setea el flag (R6-b).
- [x] C.11 [GREEN] `features/admin/types.ts`: agregar `NuevoRootInput`; crear `hooks/use-crear-root.ts` (`useCrearRoot`, firma 2.12).
- [x] C.12 [GREEN] `UsuariosPage.tsx`: gatear `Switch` por `isGlobalAdmin` (`useSession`), branch de submit `crearRoot.mutateAsync` vs `crearUsuario.mutateAsync` (firma 2.13) — pasa C.9/C.10.
- [x] C.13 Evidencia real: correr `corepack pnpm test`, `corepack pnpm lint`, `corepack pnpm exec tsc --noEmit` en `frontend/` — ver `STATE.md`.
- [x] C.14 Commits work-unit (conventional): 1) "feat(api): centralizar X-Tenant-Id vía holder module-level" (C.1-C.8), 2) "feat(admin): toggle root gateado en alta de usuarios" (C.9-C.12).

---

## Fuera de alcance

Dz6 (dedupe `ROLES_VALIDOS`) — diferido a Fase 2, NO incluir tasks acá.
