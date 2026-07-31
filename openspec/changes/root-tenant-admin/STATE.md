# STATE — `root-tenant-admin`

> Registro de progreso de apply por PR encadenado (A → B → C). strict_tdd (RED→GREEN).

---

## PR-A — Seguridad backend base (Dz1 R1, Dz4 R4) — APLICADO

Branch: `root-tenant-admin-pr1` (desde `master`). Sin push, sin PR (gateado por el usuario vía orquestador).

### Tasks completadas (A.0–A.15)

- [x] A.0 Verificación de entorno — confirmado: `usuario.entity.ts`, `asignar-rol.use-case.ts`,
      `tenant.guard.ts`, `baja-usuario.use-case.ts`, `usuarios.controller.ts`, `auth.dto.ts` y sus
      specs existentes leídos y tipando correcto antes de tocar código.
- [x] A.1-A.3 `isRoot()` en `UsuarioEntity` (Dz1) — RED confirmado (`isRoot is not a function`),
      luego GREEN. Ver evidencia RED abajo.
- [x] A.4-A.7 `tenant.guard.spec.ts` (NUEVO archivo — no existía) — 3 tests de regresión (R1-c,
      R5-d [CRITICAL], R7-b) contra `tenant.guard.ts` SIN modificarlo. Los 3 pasan en GREEN
      directamente porque el comportamiento ya era correcto (confirma que Dz1/Dz4 no rompen nada
      existente).
- [x] A.8+A.9 (colapsados por ajuste del orquestador) — un único test de regresión RED→GREEN:
      "asignar rol a usuario de OTRO tenant → UsuarioNoEncontradoError (404)". Corrido contra el
      código ACTUAL (sin `clienteId`/check) → **RED confirmado** (ver evidencia abajo). Tras el fix
      Dz4 (A.12) → GREEN. No quedó test muerto separado.
- [x] A.10 Mismo tenant sigue asignando ok sin regresión (R4-c) — GREEN.
- [x] A.11 Root cross-tenant vía `clienteId=target` (simulando `X-Tenant-Id` resuelto por
      `TenantGuard.resolveCrossTenant`) sigue funcionando (R4-d) — GREEN.
- [x] A.12 `asignar-rol.use-case.ts`: `AsignarRolDto` suma `clienteId: string`; tras cargar el
      usuario, `if (usuario.clienteId !== dto.clienteId) return Result.fail(new
      UsuarioNoEncontradoError(dto.usuarioId))` (mismo patrón que `baja-usuario.use-case.ts:69-71`).
      Constructor y wiring `useFactory` en `auth.module.ts` **sin cambios** (confirmado).
- [x] A.13 `usuarios.controller.ts` (`asignarRol`): `clienteId` resuelto de
      `this.tenantContext.get()!.clienteId` — nunca del body.
- [x] A.14 Evidencia real — ver sección de abajo.
- [x] A.15 Commits work-unit (ver Git).

### Desviaciones documentadas (no silenciosas)

1. **A.8/A.9 colapsados en un solo test**, por instrucción explícita del orquestador (evitar test
   RED "histórico" muerto que se descarta). El test único cubre ambos escenarios: reproduce la fuga
   en RED contra el código pre-fix, y confirma el fix en GREEN post-Dz4. No se dejó ningún test
   deshabilitado o comentado.
2. **`tenant.guard.spec.ts` no existía previamente** — se creó de cero (tasks A.4-A.6 lo asumían
   como archivo a extender). Se instanció `TenantGuard` directamente con un `PrismaService` mockeado
   (shape `{ getMasterClient, getTenantClient }`, cast `as unknown as PrismaService` — patrón
   estándar de mocking de puertos de infraestructura en este repo, no es un `as any` sobre lógica de
   negocio) y un `TenantContext` real (mismo patrón que otros tests del guard usan `enterWith`
   fallback). Los 3 tests pasaron en GREEN sin tocar `tenant.guard.ts`, confirmando que Dz1/Dz4 no
   introducen regresión en el comportamiento cross-tenant existente.
3. **Tests preexistentes extendidos** (no solo nuevos): `asignar-rol.use-case.spec.ts` — todas las
   invocaciones anteriores de `useCase.execute(...)` sumaron `clienteId: 'cliente-uuid'` (igual al
   `clienteId` del usuario de prueba) para reflejar el nuevo contrato de `AsignarRolDto` sin romper
   los tests de "mismo tenant, sin regresión". `usuarios.controller.spec.ts` — el test legacy de
   `POST /usuarios/:id/roles` ahora espera `clienteId: 'tenant-a-uuid'` en la llamada al use case
   (resuelto de `TenantContext`, no del body); se agregó un test explícito adicional para dejarlo
   trazable a R4/Dz4.
4. **Falla preexistente NO relacionada, confirmada y NO tocada**:
   `rbac-4-roles-seed.integration.spec.ts` → "tiene exactamente 19 permisos... ADMINISTRADOR"
   espera longitud 19 pero recibe 20. Confirmado con `git stash` (sin los cambios de PR-A) que la
   falla es IDÉNTICA — preexiste al change `root-tenant-admin` y es ajena a Dz1/Dz4 (permisos RBAC,
   no root/tenant). Fuera de alcance de PR-A; queda para backlog separado. NO se modificó ese
   archivo ni el seed de permisos.

### Archivos creados

- `backend/src/auth/infrastructure/guards/tenant.guard.spec.ts` (nuevo)

### Archivos modificados

- `backend/src/auth/domain/entities/usuario.entity.ts` (+`isRoot()`)
- `backend/src/auth/domain/entities/usuario.entity.spec.ts` (+tests R1-a, R1-b[CRITICAL];
  +`isGlobalAdmin` en el helper `makeUsuario`)
- `backend/src/auth/application/use-cases/asignar-rol.use-case.ts` (+`clienteId` en
  `AsignarRolDto`, +guard cross-tenant tras cargar el usuario)
- `backend/src/auth/application/use-cases/asignar-rol.use-case.spec.ts` (+`clienteId` en todas las
  invocaciones existentes; +suite "Aislamiento de tenant (R4/Dz4)" con 3 tests: R4-b [CRITICAL],
  R4-c, R4-d)
- `backend/src/auth/interface/controllers/usuarios.controller.ts` (`asignarRol` resuelve
  `clienteId` de `TenantContext`)
- `backend/src/auth/interface/controllers/usuarios.controller.spec.ts` (test legacy actualizado +
  test explícito de `clienteId` server-side)
- `openspec/changes/root-tenant-admin/tasks.md` (A.0-A.15 marcadas `[x]`)

### Evidencia RED (confirmando la fuga/comportamiento antes del fix)

```
FAIL src/auth/domain/entities/usuario.entity.spec.ts > UsuarioEntity > isRoot() > devuelve true cuando isGlobalAdmin=true (R1-a)
TypeError: usuario.isRoot is not a function

FAIL src/auth/domain/entities/usuario.entity.spec.ts > UsuarioEntity > isRoot() > [CRITICAL] rol ADMINISTRADOR con isGlobalAdmin=false → isRoot()===false (R1-b)
TypeError: usuario.isRoot is not a function

FAIL src/auth/application/use-cases/asignar-rol.use-case.spec.ts > AsignarRolUseCase > Aislamiento de tenant (R4/Dz4) > asignar rol a usuario de OTRO tenant → UsuarioNoEncontradoError (404) (R4-b)
AssertionError: expected false to be true // Object.is equality
- Expected: true
+ Received: false
  (result.isFail() era false — la operación completaba sin bloqueo cross-tenant, demostrando la fuga)
```

### Evidencia GREEN (targeted, tras el fix)

```
$ corepack pnpm exec vitest run \
    src/auth/application/use-cases/asignar-rol.use-case.spec.ts \
    src/auth/domain/entities/usuario.entity.spec.ts \
    src/auth/infrastructure/guards/tenant.guard.spec.ts \
    src/auth/interface/controllers/usuarios.controller.spec.ts

 Test Files  4 passed (4)
      Tests  72 passed (72)
   Duration  3.69s
```

### Evidencia real — A.14 (suite completa + lint + tsc, desde `backend/`)

```
$ corepack pnpm test
 Test Files  1 failed | 160 passed | 1 skipped (162)
      Tests  1 failed | 2153 passed | 2 skipped (2156)
   Duration  238.66s

FAIL src/auth/infrastructure/persistence/prisma/rbac-4-roles-seed.integration.spec.ts
  > tiene exactamente 19 permisos... ADMINISTRADOR
  AssertionError: expected [...] to have a length of 19 but got 20
  (PRE-EXISTENTE — confirmado idéntico con `git stash` de los cambios de PR-A. Ajeno a
   Dz1/Dz4, root-tenant-admin. NO tocado en este PR.)

$ corepack pnpm exec eslint "src/**/*.ts"
(sin output — 0 errores, 0 warnings)

$ corepack pnpm exec tsc --noEmit -p tsconfig.json
(sin output — 0 errores de tipos)
```

**Resumen: 2153 passed / 1 failed (preexistente, ajeno) / 2 skipped. Lint limpio. Typecheck limpio.**

### Qué queda para PR-B (no tocado en este PR)

- `CrearRootUseCase` (Dz2), `RootRequeridoError`, endpoint `POST /usuarios/root` con
  `GlobalAdminGuard`, `CreateRootDto`, wiring en `auth.module.ts`.
- Bootstrap idempotente `prisma_master/seeds/root-bootstrap.seed.ts` (Dz3) + script `seed:root` +
  documentación `.env.example`/README.

### Git

- Branch: `root-tenant-admin-pr1`.
- Commit 1 (work-unit): `test(auth): cubrir isRoot() y regresión de tenant.guard` (A.1-A.7).
- Commit 2 (work-unit): `fix(auth): validar tenant del objetivo en asignar-rol` (A.8-A.13).
- Sin push, sin PR — entrega afuera gateada por el usuario vía orquestador (delivery_strategy:
  ask-on-risk, Review Workload Forecast: Chained PRs recomendado).
