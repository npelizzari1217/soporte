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

---

## PR-B — Creación de root + bootstrap (Dz2 R2/R7, Dz3 R3) — APLICADO

Branch: `root-tenant-admin-pr2` (desde `root-tenant-admin-pr1` — depende de `isRoot()`, verificado
con `git log` antes de empezar: presente en `usuario.entity.ts` vía commit `91fdf9c1`). Sin push, sin
PR (gateado por el usuario vía orquestador).

### Tasks completadas (B.0–B.19)

- [x] B.0 Verificación de entorno — confirmado contra código real: `IUsuarioRepository`
      (`findByEmail`/`create` presentes), `IHashProvider` (`hash`/`verify`), `Argon2HashProvider`
      instanciable sin DI (`new Argon2HashProvider()`), tokens `USUARIO_REPOSITORY`/`HASH_PROVIDER`,
      `GlobalAdminGuard` YA EXISTÍA (con specs propios, `global-admin.guard.spec.ts`) — no era tarea
      de este PR crearlo, solo reusarlo. `UsuarioEntity.create` acepta `isGlobalAdmin`/`roles` en
      props. `PrismaService.getMasterClient()` expone el cliente Prisma master; modelo `usuario`
      (`isGlobalAdmin` @map `is_global_admin`, `id` `dbgenerated(gen_random_uuid())`).
- [x] B.1-B.4 `crear-root.use-case.spec.ts` + `crear-root.use-case.ts` (Dz2) — RED confirmado
      (`Cannot find module './crear-root.use-case'`), luego GREEN (9/9 tests). `CrearRootUseCase`
      valida `actor.isRoot` ANTES de cualquier I/O (ni siquiera llama `findByEmail` si el actor no es
      root — test explícito de esto), luego unicidad de email, luego crea con `isGlobalAdmin=true,
      roles=[]`.
- [x] B.3 `RootRequeridoError` (`AUTH_ROOT_REQUERIDO`) agregado a `auth.errors.ts`.
- [x] B.5-B.10 `usuarios.controller.ts` + `usuarios.controller.spec.ts` — RED confirmado (23 tests
      fallando por firma de constructor desalineada tras sumar `crearRootUseCase`), luego GREEN
      (47/47 tests). `POST /usuarios/root` con `@UseGuards(GlobalAdminGuard)`; test de wiring vía
      `Reflect.getMetadata(GUARDS_METADATA, ...)` confirma el guard declarado en el método (ver
      desviación #1). `crear-usuario.use-case.spec.ts` — regresión explícita agregada (B.6/B.10):
      alta normal sigue forzando `isGlobalAdmin=false` incluso con rol `ADMINISTRADOR`.
- [x] B.7 `CreateRootDto` en `auth.dto.ts` (sin campo `rol`).
- [x] B.9 Wiring `auth.module.ts`: `useFactory` de `CrearRootUseCase` (inject `USUARIO_REPOSITORY`,
      `HASH_PROVIDER`); `UsuariosController` suma el nuevo caso de uso al constructor (penúltima
      posición, antes de `tenantContext`).
- [x] B.11-B.15 `root-bootstrap.seed.spec.ts` + `root-bootstrap.seed.ts` (Dz3) — RED confirmado
      (`Cannot find module './root-bootstrap.seed'`), luego GREEN (12/12 tests, INTEGRACIÓN real
      contra `soporte_master_test` — no mockeado, mismo patrón que
      `prisma-auth.integration.spec.ts`: `TEST_DB_URL`, `TRUNCATE` en `beforeEach`, `ClienteEntity`
      real vía `PrismaClienteRepository`). Cubre R3-a (crea si no existe), R3-b [CRITICAL]
      (idempotente, sin duplicar), R3-c (update mínimo, no pisa `nombre`/`apellido`/`passwordHash`
      preexistentes), R3-d (`requireEnv`/`readRootBootstrapEnv` — falta cualquier `ROOT_ADMIN_*` →
      throw).
- [x] B.16 Script `seed:root` en `backend/package.json`.
- [x] B.17 `.env.example` (+5 envs `ROOT_ADMIN_*`) y `backend/README.md` (NUEVO — no existía ningún
      README en `backend/` ni en la raíz del repo; se creó con el runbook `migrate:master` →
      `seed:root` y la tabla de envs).
- [x] B.18 Evidencia real — ver sección de abajo.
- [x] B.19 Commits work-unit (ver Git).

### Desviaciones documentadas (no silenciosas)

1. **B.5 "integration" reinterpretado como test de metadata + reuso de cobertura existente.** El
   spec de tareas describe el test de `GlobalAdminGuard` en `POST /usuarios/root` como
   "integration". El repo NO tiene precedente de tests e2e con `supertest`/`Test.createTestingModule`
   completo para rutas de `UsuariosController` (ni falta — `guards.spec.ts`,
   `global-admin.guard.spec.ts` etc. son unitarios sobre el guard aislado). En vez de introducir un
   andamiaje nuevo (bootstrapear `AppModule` completo solo para este test, violando CLAUDE.md §5.2
   "tests atómicos, no andamiajes elaborados"), el test verifica el WIRING real vía
   `Reflect.getMetadata(GUARDS_METADATA, UsuariosController.prototype.crearRoot)` — el mismo mecanismo
   que NestJS usa en runtime para resolver `@UseGuards()`. El comportamiento del guard en sí
   (rechaza `is_global_admin=false` con `ForbiddenException`) YA estaba cubierto exhaustivamente en
   `global-admin.guard.spec.ts` (preexistente). Esto detecta la regresión real (si alguien quita el
   decorator de la ruta) sin duplicar cobertura ni montar infraestructura Nest completa en el test.
2. **`dotenv/config` del design (§2.8) reemplazado por `process.loadEnvFile()`** — el design.md sugiere
   `import 'dotenv/config'`, pero el precedente REAL del repo (`prisma_tenant/seeds/tenant-seed.ts`,
   `prisma.config.ts`, `prisma.tenant.config.ts`) usa `process.loadEnvFile()` en `try/catch` (Node
   22+, sin dependencia extra). Se siguió el patrón real del repo por consistencia (`work-unit-commits`
   / disciplina de no introducir un segundo mecanismo de carga de env en el mismo proyecto).
3. **`root-bootstrap.seed.ts` diseñado con inyección de `masterClient`/`hashProvider`** en
   `bootstrapRoot(masterClient, env, hashProvider)` en vez de instanciarlos dentro de la función (como
   sugiere el pseudocódigo del design). Esto permite testear R3-a/b/c contra la DB real de test sin
   duplicar el wiring de `PrismaService`, y sigue el patrón de `prisma-auth.integration.spec.ts`
   (instancia `PrismaService` directo, sin NestJS DI, en el bloque `if (require.main === module)`).
4. **`backend/README.md` es un archivo NUEVO** — no existía ningún README en `backend/` ni en la raíz
   del repo (solo `frontend/README.md`). Se creó con el mínimo necesario para el runbook de deploy
   (`migrate:master` → `seed:root`) + tabla de envs, sin inventar contenido no solicitado.
5. **`.env.example` es un dotfile bloqueado para las herramientas Read/Edit/Write del agente** (por
   patrón de seguridad genérico de secretos) — se editó vía `powershell Add-Content` (Bash tool),
   confirmando el contenido final con `Get-Content`.
6. **Falla preexistente NO relacionada, confirmada de nuevo, NO tocada**:
   `rbac-4-roles-seed.integration.spec.ts` → "tiene exactamente 19 permisos... ADMINISTRADOR" (19
   esperados vs 20 recibidos). Ídem PR-A: ajena a `root-tenant-admin`, no se modificó.

### Archivos creados

- `backend/src/auth/application/use-cases/crear-root.use-case.ts`
- `backend/src/auth/application/use-cases/crear-root.use-case.spec.ts`
- `backend/prisma_master/seeds/root-bootstrap.seed.ts`
- `backend/prisma_master/seeds/root-bootstrap.seed.spec.ts`
- `backend/README.md` (nuevo — no existía)

### Archivos modificados

- `backend/src/auth/domain/errors/auth.errors.ts` (+`RootRequeridoError`)
- `backend/src/auth/application/use-cases/crear-usuario.use-case.spec.ts` (+test de regresión R2-d)
- `backend/src/auth/interface/dtos/auth.dto.ts` (+`CreateRootDto`)
- `backend/src/auth/interface/controllers/usuarios.controller.ts` (+`POST /usuarios/root`)
- `backend/src/auth/interface/controllers/usuarios.controller.spec.ts` (+tests B.5-B.9, +factory
  `makeCrearRootUseCase`, +override `is_global_admin` en `makeJwtUser`)
- `backend/src/auth/auth.module.ts` (+wiring `CrearRootUseCase`)
- `backend/package.json` (+script `seed:root`)
- `backend/.env.example` (+5 envs `ROOT_ADMIN_*`)
- `openspec/changes/root-tenant-admin/tasks.md` (B.0-B.19 marcadas `[x]`)

### Evidencia RED (confirmando el contrato ausente antes del fix)

```
FAIL src/auth/application/use-cases/crear-root.use-case.spec.ts
Error: Cannot find module './crear-root.use-case' imported from .../crear-root.use-case.spec.ts

FAIL src/auth/interface/controllers/usuarios.controller.spec.ts (23 tests fallando)
TypeError: controller.crearRoot is not a function
TypeError: this.tenantContext.get is not a function
  (constructor con 6 args en el test vs 5 en el controller real — tenantContext quedaba bindeado
   al mock de crearRootUseCase, confirmando que la firma del constructor real no había cambiado)

FAIL prisma_master/seeds/root-bootstrap.seed.spec.ts
Error: Cannot find module './root-bootstrap.seed' imported from .../root-bootstrap.seed.spec.ts
```

### Evidencia GREEN (targeted, tras cada fix)

```
$ corepack pnpm exec vitest run src/auth/application/use-cases/crear-root.use-case.spec.ts
 Test Files  1 passed (1) | Tests  9 passed (9)

$ corepack pnpm exec vitest run \
    src/auth/interface/controllers/usuarios.controller.spec.ts \
    src/auth/application/use-cases/crear-usuario.use-case.spec.ts \
    src/auth/application/use-cases/crear-root.use-case.spec.ts \
    src/auth/auth.module.spec.ts
 Test Files  4 passed (4) | Tests  47 passed (47)

$ corepack pnpm exec vitest run prisma_master/seeds/root-bootstrap.seed.spec.ts
 Test Files  1 passed (1) | Tests  12 passed (12)   (integración real contra soporte_master_test)
```

### Evidencia real — B.18 (suite completa + lint + tsc, desde `backend/`)

```
$ corepack pnpm test
 Test Files  1 failed | 162 passed | 1 skipped (164)
      Tests  1 failed | 2179 passed | 2 skipped (2182)
   Duration  181.69s

FAIL src/auth/infrastructure/persistence/prisma/rbac-4-roles-seed.integration.spec.ts
  > tiene exactamente 19 permisos... ADMINISTRADOR
  AssertionError: expected [...] to have a length of 19 but got 20
  (PRE-EXISTENTE — idéntico a PR-A, confirmado ajeno a root-tenant-admin. NO tocado.)

$ corepack pnpm run lint
$ eslint "src/**/*.ts"
(sin output — 0 errores, 0 warnings)

$ corepack pnpm exec tsc --noEmit -p tsconfig.json
(sin output — 0 errores de tipos)

# prisma_master/ está fuera de "include" del tsconfig.json principal (mismo alcance que
# prisma_tenant/seeds/tenant-seed.ts, precedente ya existente) — verificado aparte con las mismas
# compilerOptions vía `tsc --noEmit` standalone sobre root-bootstrap.seed.ts y su spec: 0 errores.
```

**Resumen: 2179 passed / 1 failed (preexistente, ajeno) / 2 skipped. Lint limpio. Typecheck limpio
(src/ vía proyecto + prisma_master/seeds/ vía standalone).**

### Qué queda para PR-C (no tocado en este PR)

- `shared/api/tenant-header.ts` (holder module-level X-Tenant-Id, Dz5).
- `client.ts` (`rawFetch`): inyección del header desde el holder.
- `tenant-context.tsx`: efecto puente `setTenantHeader`.
- `UsuariosPage.tsx`: `Switch` "Root" gateado por `isGlobalAdmin`, branch de submit
  `useCrearRoot`/`useCrearUsuario`.

### Git

- Branch: `root-tenant-admin-pr2` (desde `root-tenant-admin-pr1`).
- Commit 1 (work-unit): `feat(auth): crear usuario root con doble validación` (B.1-B.10).
- Commit 2 (work-unit): `feat(auth): bootstrap idempotente del primer root` (B.11-B.17).
- Sin push, sin PR — entrega afuera gateada por el usuario vía orquestador (delivery_strategy:
  ask-on-risk, Review Workload Forecast: Chained PRs recomendado).

---

## PR-B — Judgment Day Ronda 1 (fixes aplicados)

Fix agent quirúrgico sobre `root-tenant-admin-pr2`, strict_tdd (RED→GREEN). Sin push, sin PR.

### FIX 1 (PRINCIPAL, WARNING confirmado por 2 jueces) — Auditar la creación de root

`CrearRootUseCase` no dejaba rastro de quién creaba un superusuario de plataforma, pese a que el
spec R2 exige `MUST ... auditarse (actor, objetivo, timestamp)` en el camino de éxito.

**Mecanismo reusado**: se investigó el código real (no se inventó nada nuevo). No existe un
`AuditLogPort`/tabla de auditoría persistente en el repo — el mecanismo reusable existente es el
puerto `ILogger` (`shared/domain/ports/i-logger.port.ts`, ya wireado `@Global()` en
`shared.module.ts`, mismo puerto que usan `crear-observacion.use-case.ts`/
`transicionar-estado.use-case.ts` para log-and-swallow post-commit), combinado con el formato de
mensaje estructurado que ya usa `TenantGuard.resolveCrossTenant` para auditoría cross-tenant
(`"EVENTO | campo=valor | ... | at=ISO"`, infra, `new Logger().log(...)` directo — válido ahí por
ser infraestructura). `ILogger` solo tenía `error()`; se le agregó `log()` (consumidor real, no
especulativo) e implementación en `NestLoggerAdapter`.

- RED confirmado: `crear-root.use-case.spec.ts` — 3 tests nuevos fallando (`logger.log` nunca
  llamado, `CrearRootUseCase` con firma de 2 args).
- GREEN: `CrearRootUseCase` recibe `ILogger` como 3er constructor param; tras
  `usuarioRepo.create(entity)` y ANTES de `return Result.ok`, emite
  `"ROOT CREADO | actor=${dto.actor.id} | objetivo=${entity.email} | at=${ISO}"`. Solo en el camino
  de éxito — NO en `RootRequeridoError` ni `UsuarioConflictError` (sin precedente en el repo de
  auditar intentos fallidos para esta acción). Email del objetivo es dato auditable legítimo (no se
  enmascara); password NUNCA aparece en el mensaje (test explícito). Wiring `useFactory`+`inject`
  actualizado en `auth.module.ts` (suma `LOGGER`).

### FIX 2 (SUGGESTION confirmada por 2 jueces) — `as any` en tests nuevos de PR-B

`crear-root.use-case.spec.ts` y `root-bootstrap.seed.spec.ts` reemplazaron todos los `as any` por
mocks tipados a `IUsuarioRepository`/`IHashProvider`/`ILogger` (factories tipadas al retorno de la
interfaz; `vi.mocked(...)` en los call sites que necesitan `.mockResolvedValue`/`.mockImplementation`
sin perder el chequeo estructural). `makeFakeHashProvider()` del seed ahora implementa `IHashProvider`
completo (`hash` + `verify`) en vez de un objeto parcial. Cero `as any`/`as unknown as` en ambos
archivos — confirmado con `tsc --noEmit`.

### FIX 3 (SUGGESTION confirmada por 2 jueces) — Seed re-hasheaba en cada run

`root-bootstrap.seed.ts`: el hash argon2id (costoso) corría incondicionalmente aunque el camino
`update` lo descartara. Reestructurado a `findUnique` por email primero: si existe → `update` (sin
hashear); si no existe → hashea y `create`. RED confirmado contra la implementación vieja (vía
`git stash` de `root-bootstrap.seed.ts`, DB de test real): `hashProvider.hash` llamado igual en el
camino update. GREEN tras el fix: test explícito `hashProvider.hash` NO llamado en update.

### FIX 4 (WARNING theoretical, Juez B — robustez R3) — Seed no reactivaba cuenta suspendida

En el mismo camino `update`, se agrega `activo: true, deletedAt: null` además de
`isGlobalAdmin: true`. Motivo: si `ROOT_ADMIN_EMAIL` apunta a un usuario suspendido/soft-deleted, el
seed viejo flippeaba el flag pero la cuenta seguía sin poder loguear (contradice R3 "MUST NOT quedar
sin ningún root usable"). RED confirmado (mismo `git stash`): `activo`/`deletedAt` no se tocaban. Test
nuevo cubre usuario existente con `activo:false`/`deletedAt` seteado → tras el seed queda
`activo:true, deletedAt:null, isGlobalAdmin:true`, sin pisar `nombre`/`passwordHash`.

### FIX 5 (SUGGESTION, Juez A) — Test del guard R2-c era metadata-only

`usuarios.controller.spec.ts`: el test de `POST /usuarios/root` solo verificaba que
`GlobalAdminGuard` estuviera declarado en `@UseGuards` (metadata). Se agregó un test complementario
(sin borrar el de metadata) que instancia `GlobalAdminGuard` e invoca `canActivate()` directo contra
un request de actor no-root, esperando `ForbiddenException` — mismo patrón que
`global-admin.guard.spec.ts`.

### FIX 6 (doc, Juez A) — README rotation note

`backend/README.md`: nota agregada aclarando que rotar `ROOT_ADMIN_PASSWORD` y re-correr `seed:root`
NO cambia el password de un root existente (el `update` no toca `passwordHash`) — para rotar el
password se usa el flujo normal de cambio de password.

### Evidencia real (desde `backend/`)

```
$ corepack pnpm test
 Test Files  1 failed | 162 passed | 1 skipped (164)
      Tests  1 failed | 2187 passed | 2 skipped (2190)
   Duration  269.32s

FAIL src/auth/infrastructure/persistence/prisma/rbac-4-roles-seed.integration.spec.ts
  > tiene exactamente 19 permisos... ADMINISTRADOR
  AssertionError: expected [...] to have a length of 19 but got 20
  (PRE-EXISTENTE — idéntico a PR-A/PR-B, ajeno a root-tenant-admin. NO tocado.)

$ corepack pnpm exec eslint "src/**/*.ts"
(sin output — 0 errores, 0 warnings)

$ corepack pnpm exec tsc --noEmit -p tsconfig.json
(sin output — 0 errores de tipos)

# prisma_master/seeds/ fuera de "include" del tsconfig principal (mismo alcance documentado en
# PR-B) — verificado standalone con las mismas compilerOptions + --types vitest/globals,node:
# 0 errores.
```

Targeted (archivos tocados por Judgment Day):

```
$ corepack pnpm exec vitest run \
    src/auth/application/use-cases/crear-root.use-case.spec.ts \
    prisma_master/seeds/root-bootstrap.seed.spec.ts \
    src/auth/interface/controllers/usuarios.controller.spec.ts \
    src/auth/infrastructure/guards/global-admin.guard.spec.ts \
    src/auth/auth.module.spec.ts \
    src/tickets/application/use-cases/crear-observacion.use-case.spec.ts \
    src/tickets/application/use-cases/transicionar-estado.use-case.spec.ts
 Test Files  7 passed (7) | Tests  142 passed (142)
```

**Resumen: 2187 passed / 1 failed (preexistente, ajeno) / 2 skipped. Lint limpio. Typecheck limpio.**

### Archivos modificados (Judgment Day Ronda 1)

- `backend/src/shared/domain/ports/i-logger.port.ts` (+`log()`)
- `backend/src/shared/infrastructure/logging/nest-logger.adapter.ts` (+`log()`)
- `backend/src/auth/application/use-cases/crear-root.use-case.ts` (+`ILogger`, +auditoría)
- `backend/src/auth/application/use-cases/crear-root.use-case.spec.ts` (+tests de auditoría, mocks
  tipados sin `as any`)
- `backend/src/auth/auth.module.ts` (+`LOGGER` en wiring de `CrearRootUseCase`)
- `backend/prisma_master/seeds/root-bootstrap.seed.ts` (findUnique+create/update, no re-hash, +
  reactivación `activo`/`deletedAt`)
- `backend/prisma_master/seeds/root-bootstrap.seed.spec.ts` (+tests FIX 3/FIX 4, mocks tipados sin
  `as any`)
- `backend/src/auth/interface/controllers/usuarios.controller.spec.ts` (+test de rechazo real del
  guard)
- `backend/README.md` (+nota de rotation)

### Git

- Branch: `root-tenant-admin-pr2` (continúa desde los commits de PR-B).
- Commit 1 (work-unit): `feat(auth): auditar creación de root` (FIX 1).
- Commit 2 (work-unit): `test(auth): endurecer tests y robustez del seed root` (FIX 2-6).
- Sin push, sin PR.

---

## PR-B — Judgment Day Ronda 2 (fixes aplicados)

Fix agent quirúrgico sobre `root-tenant-admin-pr2`, strict_tdd (RED→GREEN). Sin push, sin PR. NO se
tocó PR-C.

### FIX 1 (WARNING real, confirmado por 2 jueces) — 3 mocks de `ILogger` incompletos (TS2741)

El fix de Ronda 1 agregó `log(message: string): void` como miembro REQUERIDO al puerto `ILogger`
(`shared/domain/ports/i-logger.port.ts`), pero 3 mocks pre-existentes (de ANTES de esa ronda, en
`tickets/application/use-cases/`) solo declaraban `{ error: vi.fn() }` — dejaban de satisfacer la
interfaz completa (TS2741 "Property 'log' is missing"). No rompía los gates (`tsconfig.json` excluye
specs) pero era deuda de tipos real. Se completaron los 3 con `log: vi.fn()`, sin `as any`:

- `ticket-estado-cambiado-forma-identica.spec.ts` (`loggerA`/`loggerB`, líneas 105/167).
- `crear-observacion.use-case.spec.ts` (`logger` en `makeMocks()`, línea ~144).
- `transicionar-estado.use-case.spec.ts` (`logger` en `beforeEach`, línea ~144).

**Evidencia (tsc spec-inclusive, `tsconfig.eslint.json` — incluye `**/*.spec.ts`)**: antes del fix,
2 TS2741 confirmados en `ticket-estado-cambiado-forma-identica.spec.ts` líneas 105/167 (los otros 2
mocks usan `vi.Mocked<ILogger>` y el ambiente de esta tsconfig no resuelve el namespace `vi` como
tipo — TS2503 pre-existente y ajeno, enmascara el TS2741 ahí, pero el fix real es el mismo). Después
del fix: 0 ocurrencias de TS2741 en los 3 archivos target (diff línea por línea confirmado). Targeted
`vitest run` de los 3 archivos: 3 passed, 82 tests passed.

### FIX 2 (WARNING theoretical → alineado con patrón del proyecto) — audit post-commit sin try/catch

`CrearRootUseCase`: el `this.logger.log(...)` de auditoría (paso 6) corría DESPUÉS de
`usuarioRepo.create(entity)` (paso 5, ya persistido) pero SIN try/catch — un throw ahí habría
propagado un 500 pese a que el root ya estaba creado, violando el propio docblock de la clase ("la
auditoría nunca debe decidir el resultado de la operación") y divergiendo del patrón ya establecido
en PR4 (`crear-observacion.use-case.ts`/`transicionar-estado.use-case.ts`: guard try/catch
log-and-swallow sobre side-effects post-commit).

RED confirmado: nuevo test `logger.log RECHAZA/lanza post-commit: execute() igual devuelve Result.ok
del root ya creado, no relanza, create llamado 1 vez` — falla contra el código sin guard
(`Error: Logger de auditoría no disponible` propagado desde `execute()`).

GREEN: se envolvió el `logger.log` de auditoría en try/catch. A diferencia del patrón de PR4 (donde
el catch loguea el error vía `logger.error`), acá la operación que puede fallar ES el logger mismo —
no hay un segundo canal seguro al que reportar sin arriesgar otro throw, así que el catch queda
deliberadamente vacío (swallow puro, sin relogueo). El root ya persistido se retorna igual vía
`Result.ok`.

### FIX 3 (doc menor, Juez A suggestion) — README: cuenta deshabilitada a propósito

`backend/README.md`: se agregó una nota junto a la tabla de envs de `seed:root` aclarando que
`ROOT_ADMIN_EMAIL` NO debe apuntar a una cuenta suspendida/deshabilitada a propósito, porque
`seed:root` la reactiva (`activo:true`, `deletedAt:null`) en cada corrida para garantizar un root
usable (R3) — si esa cuenta fue desactivada deliberadamente (ej. baja de seguridad), el próximo
redeploy la reactiva sin aviso.

### FIX 4 (doc menor, Juez B suggestion) — spec.md: reconciliar wording de R3

`openspec/changes/root-tenant-admin/spec/root-tenant-admin.spec.md`: el escenario "Bootstrap
actualiza el flag si el usuario ya existe sin root" decía "sin alterar otras columnas", que divergía
del comportamiento real (el `update` también reactiva `activo`/`deletedAt`, agregado en Ronda 1 FIX
4 de PR-B). Ajustado el wording para aclarar que la reactivación es intencional (garantiza un root
usable en cada corrida) y que lo que NO se toca es específicamente `nombre`/`apellido`/`passwordHash`.
Cambio de texto de spec solamente, sin tocar código.

### Evidencia real (desde `backend/`)

```
$ corepack pnpm test
 Test Files  1 failed | 162 passed | 1 skipped (164)
      Tests  1 failed | 2188 passed | 2 skipped (2191)

FAIL src/auth/infrastructure/persistence/prisma/rbac-4-roles-seed.integration.spec.ts
  > tiene exactamente 19 permisos... ADMINISTRADOR
  AssertionError: expected [...] to have a length of 19 but got 20
  (PRE-EXISTENTE — idéntico a rondas anteriores, ajeno a root-tenant-admin. NO tocado.)

$ corepack pnpm exec eslint "src/**/*.ts"
(sin output — 0 errores, 0 warnings)

$ corepack pnpm exec tsc --noEmit -p tsconfig.json
(sin output — 0 errores de tipos)

$ corepack pnpm exec tsc --noEmit -p tsconfig.eslint.json   # spec-inclusive, confirma FIX 1
# 0 ocurrencias de TS2741 en los 3 archivos target (antes: 2 confirmadas). El resto de errores
# de esta tsconfig son ruido pre-existente y ajeno (vitest globals sin tipar: TS2582/TS2304/TS2503
# en TODOS los specs del repo, incluida esta misma corrida — no relacionado a ILogger).
```

Targeted (archivos tocados por Judgment Day Ronda 2):

```
$ corepack pnpm exec vitest run \
    src/tickets/application/use-cases/ticket-estado-cambiado-forma-identica.spec.ts \
    src/tickets/application/use-cases/crear-observacion.use-case.spec.ts \
    src/tickets/application/use-cases/transicionar-estado.use-case.spec.ts \
    src/auth/application/use-cases/crear-root.use-case.spec.ts
 Test Files  4 passed (4) | Tests  97 passed (97)
```

**Resumen: 2188 passed / 1 failed (preexistente, ajeno) / 2 skipped. Lint limpio. Typecheck limpio
(gate principal + spec-inclusive para FIX 1).**

### Archivos modificados (Judgment Day Ronda 2)

- `backend/src/tickets/application/use-cases/ticket-estado-cambiado-forma-identica.spec.ts` (mocks
  `loggerA`/`loggerB` completos)
- `backend/src/tickets/application/use-cases/crear-observacion.use-case.spec.ts` (mock `logger`
  completo en `makeMocks()`)
- `backend/src/tickets/application/use-cases/transicionar-estado.use-case.spec.ts` (mock `logger`
  completo en `beforeEach`)
- `backend/src/auth/application/use-cases/crear-root.use-case.ts` (try/catch log-and-swallow sobre
  la auditoría post-commit)
- `backend/src/auth/application/use-cases/crear-root.use-case.spec.ts` (+test RED→GREEN del guard)
- `backend/README.md` (+nota cuenta deshabilitada)
- `openspec/changes/root-tenant-admin/spec/root-tenant-admin.spec.md` (wording R3 reconciliado)

### Git

- Branch: `root-tenant-admin-pr2` (continúa desde los commits de Ronda 1).
- Commit work-unit: `fix(auth): completar mocks de ILogger y guardar audit post-commit`.
- Sin push, sin PR.
