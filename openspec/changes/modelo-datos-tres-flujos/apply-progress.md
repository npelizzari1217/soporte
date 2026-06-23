# Apply Progress — modelo-datos-tres-flujos

> Última actualización: 2026-06-23
> Rama activa: `feat/pr10-tickets-domain`
> PR actual: **PR-10** (en progreso — Slice 2 completado)

---

## PR-01: Scaffolding + shared/domain — COMPLETADO

### Tareas completadas

| Tarea | Estado | Notas |
|-------|--------|-------|
| 0.A.1 | ✅ | pnpm + NestJS + TypeScript 5.8 strict + Jest 30 + tsconfig paths `@/*` |
| 0.A.3 | ✅ | ESLint fitness rule: `no-restricted-imports` para `@prisma/client` fuera de `infrastructure/` |
| 0.B.1 | ✅ | 17 tests: UUIDv7 format, monotonic ordering, softDelete, isDeleted, reconstitution |
| 0.B.2 | ✅ | `BaseEntity<T>` abstracta: id/createdAt/updatedAt/deletedAt + softDelete() + isDeleted() |
| 0.B.3 | ✅ | 16 tests: Result.ok/fail/map/chain/getOrThrow + DomainError |
| 0.B.4 | ✅ | `Result<T,E>` + `DomainError` base sin dependencias externas |
| 0.B.5 | ✅ | 5 tests: interface contract + spy verifica independencia de implementación |
| 0.B.6 | ✅ | `IFileStorage` interface + `FILE_STORAGE` token + `LocalFileStorage` (dev/test) |

### Estado de tests
- **38 tests, 3 suites, todos verdes** (`pnpm test`)
- **0 errores de lint** (`pnpm lint`)
- **TypeScript build limpio** (`tsc --noEmit`)

### Archivos creados

```
backend/
├── package.json              — scripts: test, build, lint, lint:fitness, format
├── tsconfig.json             — strict, noImplicitAny, paths @/*
├── tsconfig.build.json       — excluye spec files para producción
├── tsconfig.eslint.json      — incluye spec files para eslint
├── jest.config.ts            — ts-jest, moduleNameMapper @/*
├── eslint.config.js          — flat config v10 + fitness rule
├── .prettierrc               — singleQuote, trailingComma, printWidth 100
├── .npmrc                    — ignore-scripts=false
└── src/
    ├── main.ts               — bootstrap NestJS
    ├── app.module.ts         — módulo raíz vacío
    ├── shared/
    │   ├── domain/
    │   │   ├── base-entity.ts              — BaseEntity<TProps> abstract
    │   │   ├── base-entity.spec.ts         — 17 tests (TDD GREEN)
    │   │   ├── result.ts                   — Result<T,E> + DomainError
    │   │   ├── result.spec.ts              — 16 tests (TDD GREEN)
    │   │   └── ports/
    │   │       ├── i-file-storage.ts       — IFileStorage interface + FILE_STORAGE token
    │   │       └── i-file-storage.spec.ts  — 5 tests (TDD GREEN)
    │   └── infrastructure/
    │       └── storage/
    │           └── local-file-storage.ts   — LocalFileStorage (dev/test, guarda en disco)
    ├── tickets/{domain,application,infrastructure,interface}/  — .gitkeep
    ├── compras/{domain,application,infrastructure,interface}/  — .gitkeep
    ├── reparaciones/{domain,application,infrastructure,interface}/  — .gitkeep
    ├── equipos/{domain,application,infrastructure,interface}/  — .gitkeep
    ├── auth/{domain,application,infrastructure,interface}/     — .gitkeep
    ├── clientes/{domain,application,infrastructure,interface}/ — .gitkeep
    └── shared/tenancy/                                         — .gitkeep (PR-02)
```

### Decisiones tomadas en PR-01
1. **pnpm** como package manager (no npm/yarn).
2. **Jest 30 + ts-jest 29.4** — ts-jest 29 soporta jest `^29.0.0 || ^30.0.0` explícitamente.
3. **ESLint v10 flat config** (`eslint.config.js`) con `tsconfig.eslint.json` separado que incluye spec files.
4. **`uuidv7` lib v1.2.1** — importada directo desde la librería oficial.
5. **`BaseEntity._deletedAt`** expuesto como `public` para que los mappers de infraestructura puedan rehydratar entidades (sin necesidad de un método estático separado).
6. **`DomainError`** usa `Object.setPrototypeOf(this, new.target.prototype)` para corregir el prototype chain en TypeScript al extender `Error`.
7. **Fitness rule** implementada con `no-restricted-imports` + override para `**/infrastructure/**`. Verificada manualmente: falla en `application/`, pasa en `infrastructure/`.

---

---

## PR-02: shared/infrastructure + tenancy — COMPLETADO

### Tareas completadas

| Tarea | Estado | Notas |
|-------|--------|-------|
| 0.A.2 | ✅ | Prisma 7.8.0 + adapter-pg. Schemas mínimos con placeholders. `generate:master` y `generate:tenant` producen clients en `node_modules/.prisma/master` y `.../tenant`. Scripts en package.json. |
| 0.C.1 | ✅ | 6 tests: scope isolation, no-leak, concurrent contexts, getClient throw outside scope |
| 0.C.2 | ✅ | `TenantContext` con AsyncLocalStorage: `run()`, `get()`, `getClient()` (lanza si no hay contexto) |
| 0.C.3 | ✅ | 9 tests: getMasterClient singleton, getTenantClient cache, distintos clientes por dbName, buildTenantUrl, onModuleDestroy disconnect |
| 0.C.4 | ✅ | `PrismaService` factory con adapter-pg (Pool + PrismaPg). `prisma-clients.ts` dentro de `infrastructure/` (fitness rule cumplida). |
| 0.C.5 | ✅ | 5 tests: execute en $transaction, re-bind tx client, error propagation, throw outside ctx, preserve dbName/clienteId |
| 0.C.6 | ✅ | `TenantTransactionRunner` + `ITenantTransactionRunner` interface + `TENANT_TRANSACTION_RUNNER` Symbol token |
| 0.C.7 | ✅ | `SharedModule` @Global: provee/exporta PrismaService, TenantContext, TENANT_TRANSACTION_RUNNER, FILE_STORAGE → LocalFileStorage. Importado en AppModule. |

### Estado de tests post PR-02
- **58 tests, 6 suites, todos verdes** (`pnpm test`)
- **0 errores de lint** (`pnpm lint`) — fitness rule sigue verde
- Nuevos tests PR-02: 20 (6 TenantContext + 9 PrismaService + 5 TenantTransactionRunner)

### Archivos creados en PR-02

```
backend/
├── prisma_master/
│   └── schema.prisma              — datasource + generator + MasterSeedVersion placeholder
├── prisma_tenant/
│   └── schema.prisma              — datasource + generator + TenantSeedVersion placeholder
├── package.json                   — agregados scripts generate:master, generate:tenant, migrate:master, migrate:tenant
├── pnpm-workspace.yaml            — allowBuilds: @prisma/engines: true, prisma: true
└── src/
    ├── app.module.ts              — importa SharedModule
    ├── shared/
    │   ├── shared.module.ts       — @Global, providers + exports: PrismaService, TenantContext, TENANT_TRANSACTION_RUNNER, FILE_STORAGE
    │   ├── tenancy/
    │   │   ├── tenant-context.ts          — TenantContextData + TenantContext (AsyncLocalStorage)
    │   │   └── tenant-context.spec.ts     — 6 tests TDD GREEN
    │   └── infrastructure/
    │       └── persistence/
    │           ├── prisma-clients.ts              — re-exporta MasterPrismaClient + TenantPrismaClient
    │           ├── prisma.service.ts              — factory: master singleton + Map<dbName, tenant> lazy
    │           ├── prisma.service.spec.ts         — 9 tests TDD GREEN
    │           ├── tenant-transaction-runner.ts   — ITenantTransactionRunner + TenantTransactionRunner + token
    │           └── tenant-transaction-runner.spec.ts — 5 tests TDD GREEN
```

### Decisiones tomadas en PR-02
1. **Prisma 7 breaking change**: `datasourceUrl` eliminado del constructor. Ahora se usa `adapter: new PrismaPg(pool)` con `pg.Pool`. Se instaló `@prisma/adapter-pg` + `pg`.
2. **Schemas mínimos con placeholder models**: `MasterSeedVersion` y `TenantSeedVersion` permiten que `prisma generate` produzca clients válidos sin conexión a DB. El DDL real va en PR-03 y PR-08.
3. **`prisma-clients.ts` en `infrastructure/`**: los re-exports de `.prisma/master` y `.prisma/tenant` viven dentro de `infrastructure/` para respetar la fitness rule. Permite mockeo limpio en tests.
4. **`PrismaService` recibe `masterUrl` por constructor**: el `SharedModule` lo instancia con `process.env.DATABASE_URL_MASTER`. Permite tests sin env vars.
5. **`TenantTransactionRunner` lanza si no hay contexto activo**: copia el guard de seguridad de `TenantContext.getClient()` para detectar errores de wiring temprano.

---

---

## PR-03: prisma_master DDL completo + primera migración — COMPLETADO

### Tareas completadas

| Tarea | Estado | Notas |
|-------|--------|-------|
| 1.C.3 | ✅ | `prisma_master/schema.prisma`: modelos `Cliente` y `CicloVigente` con todos los campos, índices y constraints del spec. |
| 2.C.3 | ✅ | Mismo schema: modelos `Usuario`, `RefreshToken`, `Role`, `Permiso`, `RolesPermisos`, `UsuariosRoles` con todos los campos, FKs e índices. |

### Estado de verificaciones PR-03
- **`prisma validate`**: schema válido ✅
- **`generate:master`**: Prisma Client (v7.8.0) generado en `node_modules/.prisma/master` ✅
- **`tsc --noEmit`**: sin errores ✅
- **`pnpm test`**: 58 tests, 6 suites, todos verdes ✅ (sin tests nuevos — PR-03 es DDL puro)
- **`pnpm lint`**: sin errores, fitness rule verde ✅
- **Migración**: SQL artesanal en `prisma_master/migrations/20260622120000_init_master_schema/migration.sql`. **APLICADA ✅** a Postgres 16 local (Docker) vía `pnpm run migrate:master`. Verificado en DB real: 8 tablas + `_prisma_migrations`, índice unique parcial `clientes_cuit_key (WHERE cuit IS NOT NULL)`, índice parcial `usuarios_activo_idx (WHERE deleted_at IS NULL)`, CHECK `ciclos_vigentes_dates_check (fecha_fin > fecha_inicio)`, y `created_at`/`updated_at` con `DEFAULT CURRENT_TIMESTAMP`.

### Infra para aplicar la migración (Prisma 7)
- **`prisma.config.ts`**: en Prisma 7 el `datasource` del schema YA NO acepta `url` (error P1012). La conexión del CLT de Migrate vive en `prisma.config.ts` (`datasource.url = env(DATABASE_URL_MASTER)`). El runtime NO la usa — sigue con `@prisma/adapter-pg`. Carga `.env` con `process.loadEnvFile()` nativo de Node 22 (sin dependencia `dotenv`). TODO(PR-08): parametrizar url para tenant migrations.
- **`docker-compose.dev.yml`**: Postgres 16 master (`soporte_master`, puerto 5432, healthcheck). `docker compose -f docker-compose.dev.yml up -d`.
- **`.env.example`** committeado / **`.env`** gitignored con `DATABASE_URL_MASTER`.

### Enmienda post-verify (sdd-verify PASS-WITH-WARNINGS → resuelto)

Verificación inicial arrojó 0 CRITICAL, 3 WARNING, 3 SUGGESTION. Aplicados en enmienda al commit PR-03:

| Issue | Tipo | Acción tomada |
|-------|------|---------------|
| WARNING-2 | `updated_at` sin DEFAULT en migration SQL | Agregado `DEFAULT CURRENT_TIMESTAMP` en las 6 tablas de audit (clientes, ciclos_vigentes, roles, permisos, usuarios, refresh_tokens). `created_at` ya tenía DEFAULT — sin cambio. |
| WARNING-1 | Divergencia partial index `usuarios.activo` | Agregado comentario inline en `@@index([activo])` del modelo `Usuario` indicando que el índice real en DB es parcial (`WHERE deleted_at IS NULL`). |
| WARNING-3 | `cuit` partial-unique no documentada en schema | Agregado comentario `///` en el campo `Cliente.cuit` advirtiendo que la unicidad es parcial (solo via migration SQL) y que se debe usar `findFirst` (no `findUnique`). |
| SUGGESTION-1 | Falta `@db.Text` explícito | Agregado `@db.Text` a `Usuario.passwordHash`, `RefreshToken.tokenHash`, `Role.descripcion`, `Permiso.descripcion`. No-op a nivel SQL (ya mapeaban a TEXT). |
| SUGGESTION-3 | UUID fallback sin documentar en header | Agregada nota en el header del schema sobre `gen_random_uuid()` = UUIDv4 como red de seguridad; UUIDv7 viene de la app. |

Verificaciones post-enmienda: `prisma validate` ✅ | `generate:master` ✅ | `tsc --noEmit` ✅ | 58/58 tests ✅ | lint ✅

### Archivos creados/modificados en PR-03

```
backend/
├── package.json                     — removido campo "pnpm" inerte (config ya en pnpm-workspace.yaml)
├── prisma_master/
│   ├── schema.prisma                — DDL completo (reemplaza placeholder MasterSeedVersion)
│   └── migrations/
│       ├── migration_lock.toml      — provider = "postgresql"
│       └── 20260622120000_init_master_schema/
│           └── migration.sql        — DDL completo + partial indexes + CHECK constraint
```

### Decisiones tomadas en PR-03

1. **`@default(dbgenerated("gen_random_uuid()"))` como red de seguridad**: el backend genera UUIDv7 siempre; la DB solo actúa como fallback.
2. **`@db.Uuid` en todos los IDs**: tipo nativo `uuid` en Postgres (no `varchar(36)`).
3. **Partial UNIQUE en `cuit`** (`WHERE cuit IS NOT NULL`): no expresable en Prisma schema → agregado como raw SQL en la migración. En el schema Prisma, `cuit` no tiene `@unique` para no crear una constraint estándar duplicada.
4. **Partial index en `usuarios.activo`** (`WHERE deleted_at IS NULL`): también en raw SQL migration. El schema tiene `@@index([activo])` regular para que Prisma sepa que existe un index; el partial real reemplaza al estándar en la migración.
5. **CHECK `fecha_fin > fecha_inicio`** en `ciclos_vigentes`: raw SQL en migración. La validación de dominio va en `CicloVigenteUseCase`, pero la DB también lo refuerza.
6. **Sin `updatedAt` en tablas join** (`roles_permisos`, `usuarios_roles`): baja es eliminación física, sin soft delete. Solo tienen `created_at`.
7. **`passwordHash String`** (sin `@db` annotation): mapea a `TEXT` en Postgres, correcto para argon2id hashes.
8. **Migración offline**: `prisma migrate diff` requiere datasource URL en el schema en Prisma 7 (adapter mode no expone URL al motor de migraciones). SQL generado artesanalmente y validado contra la spec.
9. **`"pnpm"` field removido de `package.json`**: configuración ya centralizada en `pnpm-workspace.yaml` (`allowBuilds`). El campo causaba una advertencia JSON inerte.

### Pendiente (se corrije aquí el bloque anterior)

| Tarea | PR | Descripción |
|-------|-----|-------------|
| 2.E.1 | **PR-07** | Seed migration RBAC: roles, permisos, roles_permisos. (NO es PR-03) |
| Aplicar migración | ✅ HECHO | Aplicada a Postgres 16 local (Docker). `prisma.config.ts` + `docker-compose.dev.yml` agregados. |

---

## PR-04: clientes feature — domain, application, infra, interface — COMPLETADO (post-verify fixes applied)

### Tareas completadas

| Tarea | Estado | Notas |
|-------|--------|-------|
| 1.A.1 | ✅ | 26 tests: ClienteEntity (constructor, UUIDv7, suspend, reactivate, getters) + CicloVigenteEntity (validación fecha_fin > fecha_inicio, softDelete) |
| 1.A.2 | ✅ | `ClienteEntity` (create/reconstitute + suspend/reactivate) + `CicloVigenteEntity` (create con validación + reconstitute) — sin imports de Prisma |
| 1.A.3 | ✅ | `IClienteRepository` (findById, findByDbName, findAll, save, delete + `CLIENTE_REPOSITORY` token) + `ICicloVigenteRepository` (findById, findAllNonDeleted, findActiveNonDeleted, findAll, save, delete + `CICLO_VIGENTE_REPOSITORY` token) |
| 1.B.1 | ✅ | 9 tests: RegistrarClienteUseCase — UUIDv7 antes de save, 409 en dup db_name, resultado ok con datos del DTO |
| 1.B.2 | ✅ | `RegistrarClienteUseCase` — valida unicidad de db_name, crea ClienteEntity, retorna `Result<ClienteEntity, ClienteConflictError>` |
| 1.B.3 | ✅ | 13 tests: SuspenderClienteUseCase (activo=false + deletedAt, no dropea DB) + ReactivarClienteUseCase (activo=true + deletedAt=null) |
| 1.B.4 | ✅ | `SuspenderClienteUseCase` + `ReactivarClienteUseCase` |
| 1.B.5 | ✅ | 14 tests (era 12, +2 S4): CrearCicloVigenteUseCase — 422 en solapamiento, soft-deleted excluidos, activo=false excluido (S4), UUIDv7 antes de save |
| 1.B.6 | ✅ | `CrearCicloVigenteUseCase` — usa `findActiveNonDeleted()` (activo=true AND deletedAt=null) alineado a spec |
| 1.C.1 | ✅ | 15 integration tests (+2 S4 para findActiveNonDeleted): PrismaClienteRepository + PrismaCicloVigenteRepository |
| 1.C.2 | ✅ | `PrismaClienteRepository` + `ClienteMapper` + `PrismaCicloVigenteRepository` (+ `findActiveNonDeleted`) + `CicloVigenteMapper` |
| 1.D.1 | ✅ | 10 tests: ClientesController (201, 409, 204, 404) + CiclosVigentesController (201, 422) |
| 1.D.2 | ✅ | `ClientesController` + `CiclosVigentesController` + DTOs + `ClientesModule` (PrismaService removido de providers — C1 fix) |
| W1    | ✅ | Bootstrap test (`app.module.spec.ts`) — regression guard C1 DI bug. `@nestjs/testing@11.1.27` instalado. RED con bug, GREEN después del fix. |

### Post-verify fixes (sdd-verify FAIL → post-fix)

| Issue | Tipo | Acción |
|-------|------|--------|
| C1 — DI bug PrismaService en ClientesModule | CRITICAL | Removido `PrismaService` de `ClientesModule.providers`. Re-declararlo como shorthand (`useClass`) sombrea el @Global singleton y lanza `UnknownDependenciesException` en startup porque el constructor requiere `masterUrl: string` y NestJS no tiene provider para `String`. |
| W1 — Bootstrap test faltante | WARNING | Agregado `src/app.module.spec.ts` con `Test.createTestingModule({ imports: [AppModule] }).compile()`. Demostrado RED (UnknownDependenciesException) → GREEN (C1 fix). `@nestjs/testing@^11.1.27` instalado como devDependency. |
| W2 — JSDoc mentiroso en findById | WARNING | Corregido `IClienteRepository.findById` JSDoc: retorna null solo si el registro no existe; clientes soft-deleted SÍ son retornados. |
| S4 — Overlap check más estricto que spec | SUGGESTION→fix | Agregado `findActiveNonDeleted()` al port `ICicloVigenteRepository` e implementado en `PrismaCicloVigenteRepository` (filtro `activo: true AND deletedAt: null`). `CrearCicloVigenteUseCase` ahora llama `findActiveNonDeleted()` en vez de `findAllNonDeleted()`. Tests: +2 unit (S4 scenarios) + 2 integration. |

### Estado de tests post PR-04 (post-verify)
- **146 tests, 14 suites, todos verdes** (`pnpm test`)  
  - +1 bootstrap (app.module.spec.ts)
  - +2 unit S4 (crear-ciclo-vigente.use-case.spec.ts)
  - +2 integration S4 (prisma-clientes.integration.spec.ts)
- **0 errores de lint** (`pnpm lint`) — fitness rule verde
- **TypeScript build limpio** (`tsc --noEmit`)

### Archivos creados en PR-04

```
backend/src/clientes/
├── clientes.module.ts                                   — NestJS wiring (DI tokens, use case factories)
├── domain/
│   ├── errors/
│   │   └── clientes.errors.ts                          — ClienteConflictError, ClienteNotFoundError,
│   │                                                      CicloVigenteOverlapError, CicloVigenteInvalidDatesError
│   ├── entities/
│   │   ├── cliente.entity.ts + *.spec.ts               — 14 tests
│   │   └── ciclo-vigente.entity.ts + *.spec.ts         — 12 tests
│   └── ports/
│       ├── i-cliente.repository.ts                     — + CLIENTE_REPOSITORY token
│       └── i-ciclo-vigente.repository.ts               — + CICLO_VIGENTE_REPOSITORY token
├── application/use-cases/
│   ├── registrar-cliente.use-case.ts + *.spec.ts       — 9 tests
│   ├── suspender-cliente.use-case.ts
│   ├── reactivar-cliente.use-case.ts
│   ├── suspender-cliente.use-case.spec.ts              — 13 tests (suspender + reactivar)
│   ├── crear-ciclo-vigente.use-case.ts + *.spec.ts     — 12 tests
├── infrastructure/persistence/prisma/
│   ├── prisma-cliente.repository.ts
│   ├── cliente.mapper.ts
│   ├── prisma-ciclo-vigente.repository.ts
│   ├── ciclo-vigente.mapper.ts
│   └── prisma-clientes.integration.spec.ts             — 13 integration tests
└── interface/
    ├── controllers/
    │   ├── clientes.controller.ts + *.spec.ts          — 7 tests
    │   └── ciclos-vigentes.controller.ts               — 3 tests (en spec conjunto)
    └── dtos/
        ├── create-cliente.dto.ts
        ├── create-ciclo-vigente.dto.ts
        ├── cliente-response.dto.ts
        └── ciclo-vigente-response.dto.ts
```

### Decisiones tomadas en PR-04

1. **`@/` path alias no funciona en ts-jest** para archivos fuera de `shared/`: los source files y specs de clientes usan imports relativos (`../../../shared/domain/base-entity`) porque ts-jest no resuelve `@/` en compilación de archivos que no están en `shared/`. Los archivos de `shared/` usan relative imports también (patrón existente).
2. **`ClienteEntity.reconstitute()` y `CicloVigenteEntity.reconstitute()`**: static factory para reconstitución desde DB. Usa `(entity as any)._createdAt = ...` confinado dentro del método del propio entity, no en el mapper.
3. **`@nestjs/testing` instalado** (post-verify W1): versión `11.1.27` (match exacto con `@nestjs/common`). Usado en el bootstrap test `app.module.spec.ts`. Controller tests siguen con instanciación directa (no requieren testing module).
4. **Integration test sin `.env`**: la URL de test se hardcodea como fallback (`process.env.DATABASE_URL_MASTER ?? 'postgresql://soporte:soporte@localhost:5432/soporte_master_test'`). Credenciales locales throwaway, seguro commitear.
5. **TRUNCATE en beforeEach**: `TRUNCATE TABLE clientes RESTART IDENTITY CASCADE` + `TRUNCATE TABLE ciclos_vigentes RESTART IDENTITY CASCADE` para determinismo entre runs.
6. **Open handles warning** en tests: esperado — Prisma 7 + adapter-pg mantiene la Pool abierta hasta el GC. No afecta resultados. `onModuleDestroy()` en `afterAll` intenta cerrar pero el pool de pg puede tardar.
7. **`ICicloVigenteRepository.findAllNonDeleted()`**: el port tiene `findAllNonDeleted()` en lugar de `findByDbName()` (no aplica para ciclos). La validación de solapamiento filtra `deleted_at IS NULL` en DB.
8. **`ClientesModule` NO debe re-declarar `PrismaService`** (post-verify C1 fix): re-declararlo como shorthand `PrismaService` (= `useClass: PrismaService`) sombrea el singleton @Global y causa `UnknownDependenciesException` en startup. Los repos reciben el singleton de SharedModule directamente.

### Pendiente

| Tarea | PR | Descripción |
|-------|-----|-------------|
| 2.A.1–2.D.4 | **PR-05/PR-06** | Auth + RBAC (domain + application + infra + guards) |
| 2.E.1 | **PR-07** | Seed migration RBAC |

---

## PR-05: auth domain entities + ports + application use cases — COMPLETADO

### Tareas completadas

| Tarea | Estado | Notas |
|-------|--------|-------|
| 2.A.1 | ✅ | 61 tests: PermisoEntity (validación `recurso:accion`), RoleEntity (addPermiso, dedup), RefreshTokenEntity (isExpired, isRevoked, revoke), UsuarioEntity (suspend, hashPassword delegación, verifyPassword) |
| 2.A.2 | ✅ | 4 entidades de dominio en `auth/domain/entities/`: permiso, role, refresh-token, usuario. Extienden BaseEntity. CERO imports de Prisma/NestJS. |
| 2.A.3 | ✅ | 5 puertos en `auth/domain/ports/`: IHashProvider, ITokenService (JwtPayload), IUsuarioRepository, IRefreshTokenRepository, IRoleRepository. Cada uno con Symbol DI token. |
| 2.B.1 | ✅ | 19 tests LoginUseCase: JWT payload {sub, cliente_id, email, roles, permisos}, permisos efectivos (unión deduplicada), SHA-256 del refresh token, usuario inactivo→401, cliente inactivo→403, password incorrecto→401 |
| 2.B.2 | ✅ | `login.use-case.ts`: verifica usuario activo, verifica password vía IHashProvider, verifica cliente activo (via IClienteRepository cross-feature), calcula permisos efectivos, firma JWT, genera refresh token SHA-256 con Node crypto |
| 2.B.3 | ✅ | 11 tests RefreshTokenUseCase: rotación (revoca anterior + emite nuevo), busca por SHA-256(rawToken), rechazo si expires_at<now→TokenExpiradoError, rechazo si revokedAt≠null→TokenRevocadoError, token no existe→TokenInvalidoError |
| 2.B.4 | ✅ | `refresh-token.use-case.ts`: rotación completa con SHA-256 y crypto.randomBytes |
| 2.B.5 | ✅ | 10 tests: RevocarTokenUseCase (individual, idempotente) + RevocarTodosTokensUsuarioUseCase (bulk, delega a repo) |
| 2.B.6 | ✅ | `revocar-token.use-case.ts` + `revocar-todos-tokens.use-case.ts` |
| 2.B.7 | ✅ | 17 tests: AsignarRolUseCase (agrega rol, no duplica → RolYaAsignadoError, rol no existe → RolNoEncontradoError) + BajaUsuarioUseCase (activo=false, soft delete, revocación masiva de tokens en misma op) |
| 2.B.8 | ✅ | `asignar-rol.use-case.ts` + `baja-usuario.use-case.ts` |

### Estado de tests post PR-05
- **264 tests, 22 suites, todos verdes** (`pnpm test`)
  - +118 tests nuevos (PR-05)
  - Baseline PR-04: 146 tests
- **0 errores de lint** (`pnpm lint`) — fitness rule verde; cero imports de @nestjs/*, Prisma, argon2, @nestjs/jwt, passport en domain/ o application/
- **TypeScript build limpio** (`tsc --noEmit`)
- **Bootstrap test** (`app.module.spec.ts`) verde ✅ — no se agregó AuthModule ni wiring NestJS

### Decisiones clave tomadas en PR-05

1. **Cliente activo check vía IClienteRepository**: el `LoginUseCase` inyecta `IClienteRepository` de la feature `clientes/`. Cross-feature dependency en la capa de aplicación, aceptable porque ambos son el mismo dominio (MASTER). El test mockea `IClienteRepository` directamente. NO se duplicó la entidad Cliente en auth.

2. **SHA-256 hashing con Node crypto (stdlib)**: el `LoginUseCase` y `RefreshTokenUseCase` usan `crypto.createHash('sha256').update(rawToken).digest('hex')`. Node crypto es stdlib, no framework de infra — cumple la fitness rule. Los tests importan `crypto` para verificar la igualdad del hash.

3. **hashPassword / verifyPassword delegan al IHashProvider**: el `UsuarioEntity` recibe el `IHashProvider` como parámetro de método (no inyectado en constructor), permitiendo que los tests mocken el provider sin afectar la entidad. Argon2id real irá en Argon2HashProvider → PR-06.

4. **PermisoEntity valida formato `recurso:accion`**: lanza `PermisoCodigoInvalidoError` en `create()`. El `reconstitute()` omite la validación (datos ya validados en DB).

5. **Permisos efectivos = unión deduplicada con Set**: `[...new Set(usuario.roles.flatMap(r => r.permisos.map(p => p.codigo)))]`. Implementado tanto en `LoginUseCase` como en `RefreshTokenUseCase` (para regenerar JWT actualizado en cada renovación).

6. **`UsuarioEntity.addRol()`**: método de dominio para AsignarRolUseCase. La deduplicación de roles se hace en el use case (chequeo por `r.codigo === dto.rolCodigo`) y en la entidad (por `r.id`).

7. **BajaUsuarioUseCase**: `usuario.suspend()` + `revokeAllByUsuarioId` + `usuarioRepo.save` — los tres en la misma operación lógica (sin transacción distribuida; wiring final en PR-06).

8. **Sin AuthModule, sin controllers, sin DTOs HTTP**: PR-05 es puro domain + application. No se tocó `app.module.ts`. El bootstrap test sigue verde.

### Deferred a PR-06 (infra + guards + interface + AuthModule wiring)

| Tareas | Motivo |
|--------|--------|
| 2.C.1–2.C.2 | PrismaUsuarioRepository, Argon2HashProvider, JwtTokenService |
| 2.D.1–2.D.4 | JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard, AuthController, AuthModule |
| 2.E.1 | RBAC seed migration → PR-07 |

### Archivos creados en PR-05

```
backend/src/auth/
├── domain/
│   ├── errors/
│   │   └── auth.errors.ts                              — 9 error classes (CredencialesInvalidas, ClienteInactivo, Token*, Usuario*, Rol*, Permiso*)
│   ├── entities/
│   │   ├── permiso.entity.ts + spec.ts                 — validación recurso:accion, 11 tests
│   │   ├── role.entity.ts + spec.ts                    — addPermiso (dedup por id), 14 tests
│   │   ├── refresh-token.entity.ts + spec.ts           — isExpired, isRevoked, revoke(), 14 tests
│   │   └── usuario.entity.ts + spec.ts                 — suspend, hashPassword, verifyPassword, addRol, 22 tests
│   └── ports/
│       ├── i-hash.provider.ts                          — hash(plaintext), verify(plaintext, hash) + HASH_PROVIDER token
│       ├── i-token.service.ts                          — signJwt(JwtPayload), verifyJwt(token) + TOKEN_SERVICE token
│       ├── i-usuario.repository.ts                     — findByEmail, findById, findByClienteId, save + USUARIO_REPOSITORY token
│       ├── i-refresh-token.repository.ts               — findByHash, revokeAllByUsuarioId, save + REFRESH_TOKEN_REPOSITORY token
│       └── i-role.repository.ts                        — findByCodigo, findWithPermisos + ROLE_REPOSITORY token
└── application/
    └── use-cases/
        ├── login.use-case.ts + spec.ts                 — 19 tests
        ├── refresh-token.use-case.ts + spec.ts         — 11 tests
        ├── revocar-token.use-case.ts + spec.ts         — 10 tests (incluye RevocarTodos)
        ├── revocar-todos-tokens.use-case.ts            — delegado al repo (bulk)
        ├── asignar-rol.use-case.ts + spec.ts           — 17 tests (incluye BajaUsuario)
        └── baja-usuario.use-case.ts
```

---

---

## PR-05 post-verify: fixes aplicados (sdd-verify PASS-WITH-WARNINGS → resuelto)

> Rama: `feat/pr05-auth-domain` — enmienda al commit PR-05 existente

### Fixes aplicados

| Issue | Tipo | Acción |
|-------|------|--------|
| WARNING-2 — BajaUsuarioUseCase write ordering | security | Reordenado: `usuarioRepo.save()` PRIMERO, `revokeAllByUsuarioId()` DESPUÉS. Si el revoke falla después del save, el usuario ya tiene activo=false en DB → no puede re-loguear. Estado seguro. TDD: test de call-order con array `callOrder` (RED: orden invertido → `['revokeAll','save']`; GREEN: correcto → `['save','revokeAll']`). |
| WARNING-3 — reconstitute() signatures | correctness | `RefreshTokenEntity.reconstitute()`, `RoleEntity.reconstitute()`, `PermisoEntity.reconstitute()` ahora aceptan `(props, id, createdAt, updatedAt, deletedAt)` igual que `UsuarioEntity.reconstitute()` y `ClienteEntity.reconstitute()`. Usan `(entity as any)._createdAt` / `(entity as any)._updatedAt` / `entity._deletedAt` para hidratar. TDD: +4 tests por entidad (createdAt preservado, updatedAt preservado, deletedAt no-nulo → isDeleted()=true, deletedAt nulo → isDeleted()=false). Callers actualizados: `asignar-rol.use-case.spec.ts` (makeRole), `login.use-case.spec.ts` (makePermisoEntity + makeRole). |
| SUGGESTION-1 — addRol dedup por codigo | defense-in-depth | `UsuarioEntity.addRol()` ahora deduplica por `r.id === role.id || r.codigo === role.codigo`. Alinea la entidad con `AsignarRolUseCase` (que ya deduplicaba por `r.codigo === dto.rolCodigo`) y con el UNIQUE constraint en `roles.codigo` en DB. TDD: test "no agrega un rol cuyo codigo ya existe aunque el id sea distinto" (RED → GREEN). |

### Deferred a PR-06 — MUST-DO (WARNING-1 deferral)

**WARNING-1: Login constant-time defense (timing side-channel)**

El `LoginUseCase` actualmente retorna `CredencialesInvalidasError` de forma inmediata cuando el usuario no existe o está inactivo, SIN verificar el password. Esto crea un timing side-channel: un attacker puede inferir si un email está registrado midiendo el tiempo de respuesta (la verificación argon2id tarda ~200ms).

**Solución requerida en PR-06:** Antes del early return por user-not-found o user-inactivo, ejecutar un `hashProvider.verify(password, DUMMY_HASH)` con un hash argon2id válido prefijado para consumir el mismo tiempo que el path exitoso. El `DUMMY_HASH` es una constante argon2id definida en `Argon2HashProvider` (infrastructure) — no inventar una versión falsa en PR-05 porque el `Argon2HashProvider` real llega en PR-06.

**Impacto**: No está bloqueando — PR-05 queda en PASS. Pero DEBE implementarse en PR-06 junto con el `Argon2HashProvider`.

### Estado de tests post PR-05 post-verify
- **281 tests, 22 suites, todos verdes** (`pnpm test`) — +17 nuevos respecto a los 264 de la entrega inicial
  - +1 BajaUsuarioUseCase call-order test
  - +4 RefreshTokenEntity reconstitute timestamp tests
  - +4 RoleEntity reconstitute timestamp tests  
  - +4 PermisoEntity reconstitute timestamp tests
  - +4 UsuarioEntity addRol tests (incluye dedup-por-codigo)
- **TypeScript build limpio** (`tsc --noEmit`)
- **Lint + fitness rule verde** (`pnpm lint`)

---

---

## PR-07: RBAC base seed migration — COMPLETADO

> Rama: `feat/pr07-seed-rbac` | Commit: `821038a`
> Última actualización: 2026-06-23

### Tareas completadas

| Tarea | Estado | Notas |
|-------|--------|-------|
| 2.E.1 | ✅ | Migration idempotente `20260623010000_seed_rbac_base`. Aplicada a `soporte_master` (dev) y `soporte_master_test` (test). 6 integration tests TDD GREEN. |

### Catálogo sembrado (verbatim del spec)

**Roles (5):**

| id (fijo) | codigo | nombre |
|-----------|--------|--------|
| `a0000000-0000-4000-a000-000000000001` | `ADMIN` | Administrador |
| `a0000000-0000-4000-a000-000000000002` | `SOPORTE_IT` | Soporte IT |
| `a0000000-0000-4000-a000-000000000003` | `MANTENIMIENTO` | Mantenimiento |
| `a0000000-0000-4000-a000-000000000004` | `APROBADOR_COMPRAS` | Aprobador de Compras |
| `a0000000-0000-4000-a000-000000000005` | `SOLICITANTE` | Solicitante |

**Permisos (11 — verbatim del spec auth-rbac):**

| id (fijo) | codigo | descripcion |
|-----------|--------|-------------|
| `b0000000-0000-4000-b000-000000000001` | `ticket:crear` | Crear ticket de cualquier tipo |
| `b0000000-0000-4000-b000-000000000002` | `ticket:asignar` | Asignar o reasignar ticket |
| `b0000000-0000-4000-b000-000000000003` | `ticket:cerrar` | Cerrar/cancelar ticket |
| `b0000000-0000-4000-b000-000000000004` | `ticket:ver_todos` | Ver tickets de otros usuarios (no solo los propios) |
| `b0000000-0000-4000-b000-000000000005` | `compra:aprobar` | Aprobar o rechazar ticket de compra |
| `b0000000-0000-4000-b000-000000000006` | `compra:gestionar` | Crear/editar items y presupuestos de compra |
| `b0000000-0000-4000-b000-000000000007` | `subtarea:actualizar` | Marcar subtareas edilicias como completadas |
| `b0000000-0000-4000-b000-000000000008` | `equipo:gestionar` | Alta/baja/modificación de equipos informáticos |
| `b0000000-0000-4000-b000-000000000009` | `usuario:gestionar` | Crear/modificar/desactivar usuarios |
| `b0000000-0000-4000-b000-000000000010` | `rol:asignar` | Asignar o quitar roles a usuarios |
| `b0000000-0000-4000-b000-000000000011` | `cliente:gestionar` | Crear/modificar clientes (solo ROOT/ADMIN global) |

**roles_permisos (24 filas):**

| Rol | Permisos | Origen |
|-----|----------|--------|
| ADMIN | todos los 11 | SPEC-EXPLICIT ("ADMIN tiene todos los permisos") |
| SOPORTE_IT | ticket:crear, ticket:asignar, ticket:cerrar, ticket:ver_todos, equipo:gestionar (5) | SPEC-EXPLICIT: ticket:crear + ticket:ver_todos; INFERRED: ticket:asignar, ticket:cerrar, equipo:gestionar |
| MANTENIMIENTO | ticket:crear, ticket:ver_todos, subtarea:actualizar (3) | INFERRED: gestiona subtareas edilicias (ref task 5.D.1 guard subtarea:actualizar) |
| APROBADOR_COMPRAS | ticket:crear, ticket:ver_todos, compra:aprobar, compra:gestionar (4) | SPEC-EXPLICIT: ticket:crear + compra:aprobar; INFERRED: ticket:ver_todos, compra:gestionar |
| SOLICITANTE | ticket:crear (1) | INFERRED: rol más básico, solo puede crear tickets |

**Inferencias documentadas (no explícitas en spec):**
- SOPORTE_IT + ticket:asignar, ticket:cerrar, equipo:gestionar: lógico para un rol de soporte IT que asigna y cierra tickets y gestiona equipos.
- MANTENIMIENTO + ticket:ver_todos: necesita ver todos los tickets edilicios para coordinar.
- APROBADOR_COMPRAS + ticket:ver_todos: necesita ver todos los tickets de compra. + compra:gestionar: gestiona ítems y presupuestos además de aprobar.
- SOLICITANTE + solo ticket:crear: rol más restringido del sistema.

**Decisión de UUIDs:** fijos deterministas (prefijo `a0...` roles, `b0...` permisos) para estabilidad cross-env. La join table `roles_permisos` se llena via `SELECT JOIN ON codigo` — no hardcodea IDs.

### Estado de verificaciones

| Check | Resultado |
|-------|-----------|
| `pnpm test` | **287 tests, 23 suites, todos verdes** (+6 integration) |
| `tsc --noEmit` | ✅ limpio |
| `pnpm lint` | ✅ fitness rule verde |
| `app.module.spec.ts` bootstrap | ✅ verde (no wiring NestJS agregado) |
| Dev DB: roles / permisos / roles_permisos | **5 / 11 / 24 filas** ✅ |
| Test DB: roles / permisos / roles_permisos | **5 / 11 / 24 filas** ✅ |
| ADMIN → todos los permisos | ✅ verificado via DB query |

### Archivos creados en PR-07

```
backend/
├── prisma_master/
│   └── migrations/
│       └── 20260623010000_seed_rbac_base/
│           └── migration.sql                              — seed idempotente de RBAC
└── src/
    └── auth/
        └── infrastructure/
            └── persistence/
                └── prisma/
                    └── rbac-seed.integration.spec.ts      — 6 integration tests TDD
```

### Decisiones tomadas en PR-07

1. **UUIDs fijos deterministas** para roles y permisos (prefijos `a0000000` y `b0000000`). Ventaja: estabilidad cross-env, fácil de referenciar en futuros seeds. La join table usa SELECT JOIN por `codigo` para evitar hardcodeo de UUIDs en el mapeo.
2. **Migration artesanal** (no generada por Prisma): consistente con PR-03. Prisma 7 en adapter mode no puede generar seeds vía `migrate`.
3. **Test sin TRUNCATE**: los datos de catálogo son de referencia. El test es puramente read-only + re-run idempotencia. No destruye datos.
4. **Idempotencia verificada**: el test 5 re-corre el seed SQL completo via `pg.Pool` y confirma que los row counts no cambian.
5. **Inferencias de mapeo**: SOPORTE_IT, MANTENIMIENTO, APROBADOR_COMPRAS y SOLICITANTE tienen asignaciones parcialmente inferidas. Se documentan explícitamente en el SQL de migración y en este documento.

---

---

## PR-06: auth infrastructure + guards + interface — COMPLETADO

> Rama: `feat/pr06-auth-infra` | Commit: `65ab93c`
> Última actualización: 2026-06-23

### Tareas completadas

| Tarea | Estado | Notas |
|-------|--------|-------|
| W1 — LoginUseCase timing defense | ✅ | `DUMMY_HASH` + `hashProvider.verify(pwd, DUMMY_HASH)` antes del early return. 21 tests verdes. |
| W2 — BajaUsuario transactional | ✅ | `IMasterTransactionRunner` port + `MasterContext` (ALS) + `MasterTransactionRunner` (wraps `$transaction`). SharedModule actualizado. 19 tests verdes. |
| W3 — roles+permisos hydration | ✅ | `PrismaUsuarioRepository.findByEmail/findById` siempre incluyen `usuariosRoles → rol → rolesPermisos → permiso`. 18 integration tests verdes. |
| 2.C.1 | ✅ | 18 integration tests en `prisma-auth.integration.spec.ts`: PrismaUsuarioRepository (findByEmail, findById, save, soft-delete, multi-roles hydration), PrismaRefreshTokenRepository (save, findByHash, revokeAll), PrismaRoleRepository (findByCodigo, findWithPermisos). |
| 2.C.2 | ✅ | `PermisoMapper`, `RoleMapper` (basic + withPermisos), `UsuarioMapper` (withRoles include constant), `RefreshTokenMapper`. Repos: `PrismaUsuarioRepository` (MasterContext-aware), `PrismaRefreshTokenRepository` (MasterContext-aware), `PrismaRoleRepository`. `Argon2HashProvider` (@node-rs/argon2). `JwtTokenService`. |
| 2.D.1 | ✅ | 15 unit tests en `guards.spec.ts`: JwtAuthGuard (valid token, no header, invalid, no bearer), RolesGuard (public, OR match, missing, no user), PermissionsGuard (public, AND all, missing, no user), TenantGuard (valid, empty cliente_id, no user). |
| 2.D.2 | ✅ | `JwtAuthGuard` (custom, no passport-jwt), `RolesGuard` (OR), `PermissionsGuard` (AND), `TenantGuard`. `decorators.ts`: `@Roles()`, `@RequirePermissions()`, `@CurrentUser()`. CERO queries DB en guards. |
| 2.D.3 | ✅ | 9 unit tests `auth.controller.spec.ts` + 6 unit tests `usuarios.controller.spec.ts`. |
| 2.D.4 | ✅ | `AuthController` (POST /auth/login|refresh|logout|logout-all), `UsuariosController` (POST /usuarios/:id/roles, DELETE /usuarios/:id). `auth.dto.ts`. `AuthModule` (JwtModule.register, useFactory para use cases, guard providers). AppModule + AppModule spec actualizados. |

### Estado de tests post PR-06

| Suite | Tests |
|-------|-------|
| Unit (sin integration) | **297/297 verdes** |
| Integration (auth + clientes + rbac) | **39/39 verdes** |
| **TOTAL** | **336/336 verdes** |

- `tsc --noEmit`: ✅ limpio
- `pnpm lint`: ✅ limpio
- `app.module.spec.ts` bootstrap con AuthModule: ✅ verde
- `jest.config.ts`: `maxWorkers: 1` agregado para evitar conflictos de DB concurrentes en integration tests

### Archivos creados en PR-06

```
backend/
├── jest.config.ts                                 — maxWorkers: 1
├── src/
│   ├── app.module.ts                              — importa AuthModule
│   ├── app.module.spec.ts                         — +AuthController + JwtAuthGuard assertions
│   ├── shared/
│   │   ├── domain/ports/
│   │   │   └── i-master-transaction-runner.ts     — IMasterTransactionRunner + MASTER_TRANSACTION_RUNNER token
│   │   ├── infrastructure/persistence/
│   │   │   └── master-transaction-runner.ts       — MasterTransactionRunner (wraps $transaction, re-binds MasterContext)
│   │   ├── tenancy/
│   │   │   └── master-context.ts                  — MasterContext (AsyncLocalStorage para tx master)
│   │   └── shared.module.ts                       — +MasterContext + MASTER_TRANSACTION_RUNNER
│   └── auth/
│       ├── auth.module.ts                         — JwtModule + todos los DI tokens + controllers
│       ├── application/use-cases/
│       │   ├── login.use-case.ts                  — +DUMMY_HASH + timing defense (W1)
│       │   ├── login.use-case.spec.ts             — +3 timing defense tests
│       │   ├── baja-usuario.use-case.ts           — +MasterTransactionRunner wrapping (W2)
│       │   └── asignar-rol.use-case.spec.ts       — +mock runner + atomicity test
│       ├── infrastructure/
│       │   ├── argon2-hash.provider.ts            — Argon2HashProvider (@node-rs/argon2, no node-gyp)
│       │   ├── jwt-token.service.ts               — JwtTokenService (wraps JwtService)
│       │   ├── guards/
│       │   │   ├── decorators.ts                  — @Roles, @RequirePermissions, @CurrentUser
│       │   │   ├── jwt-auth.guard.ts              — JwtAuthGuard (custom, no passport)
│       │   │   ├── roles.guard.ts                 — RolesGuard (OR)
│       │   │   ├── permissions.guard.ts           — PermissionsGuard (AND)
│       │   │   ├── tenant.guard.ts                — TenantGuard (cliente_id check)
│       │   │   └── guards.spec.ts                 — 15 tests (2.D.1)
│       │   └── persistence/prisma/
│       │       ├── permiso.mapper.ts
│       │       ├── role.mapper.ts                 — basic + withPermisos
│       │       ├── usuario.mapper.ts              — withRoles + USUARIO_INCLUDE constant
│       │       ├── refresh-token.mapper.ts
│       │       ├── prisma-usuario.repository.ts   — MasterContext-aware, sync usuarios_roles en save()
│       │       ├── prisma-refresh-token.repository.ts — MasterContext-aware
│       │       ├── prisma-role.repository.ts
│       │       └── prisma-auth.integration.spec.ts — 18 integration tests (2.C.1 + W3)
│       └── interface/
│           ├── dtos/auth.dto.ts                   — LoginDto, RefreshDto, LogoutDto, AsignarRolDto
│           └── controllers/
│               ├── auth.controller.ts + spec.ts   — 9 tests
│               └── usuarios.controller.ts + spec.ts — 6 tests
```

### Decisiones clave PR-06

1. **`@node-rs/argon2` (no `argon2` de npm)**: binarios precompilados, sin node-gyp, para evitar problemas de compilación nativa en CI.
2. **JwtAuthGuard custom (no passport-jwt strategy)**: más simple, testeable en unidad sin NestJS DI, sin dependencia de passport middleware.
3. **Guards CERO queries DB**: los guards leen solo el payload del JWT (roles, permisos, cliente_id). La resolución de permisos efectivos ocurre en login y se embebe en el JWT.
4. **MasterContext (ALS) + MasterTransactionRunner**: análogos a TenantContext/TenantTransactionRunner pero para la DB master. Los repos auth verifican `masterContext.getClient()` antes de caer al master client normal.
5. **`save()` sincroniza `usuarios_roles`**: delete-all + createMany con los roles del dominio. Atómico cuando está dentro de `masterTxRunner.run()`.
6. **CLIENTE_REPOSITORY en AuthModule**: `LoginUseCase` necesita `IClienteRepository` para verificar cliente activo. Se provee `PrismaClienteRepository` localmente en `AuthModule` (no se importa `ClientesModule`).
7. **`maxWorkers: 1` en jest**: las 3 suites de integration tests (clientes, rbac-seed, auth) comparten `soporte_master_test`. Ejecución paralela causa conflictos de truncate. `maxWorkers: 1` resuelve sin complejidad extra.

---

---

## PR-06-fix: tenant guard + ClienteInactivoError → 403 — COMPLETADO

> Rama: `fix/pr06-tenant-guard-cliente-inactivo` | Commits: `22e3da2`, `0689d4d`
> Última actualización: 2026-06-23

### CRITICALs resueltos (de sdd-verify)

| CRITICAL | Tipo | Estado |
|----------|------|--------|
| CRITICAL-1: TenantGuard stub | TDD RED→GREEN | ✅ |
| CRITICAL-2: ClienteInactivoError → 401 | TDD RED→GREEN | ✅ |

### CRITICAL-1 — TenantGuard: DB resolution + TenantContext binding

**Archivos modificados:**

| Archivo | Cambio |
|---------|--------|
| `backend/src/shared/tenancy/tenant-context.ts` | +`bind(ctx)` usando `AsyncLocalStorage.enterWith()` |
| `backend/src/shared/tenancy/tenant-context.spec.ts` | +2 tests: bind() setea contexto + getClient() post-bind |
| `backend/src/auth/infrastructure/guards/tenant.guard.ts` | Reescritura completa: injecta PrismaService + TenantContext, consulta master.clientes, valida activo/deleted_at, vincula TenantContext |
| `backend/src/auth/infrastructure/guards/guards.spec.ts` | +6 tests TenantGuard: resuelve db_name, activo=false, deleted_at≠null, cliente no existe, vincula TenantContext |

**Tests de TenantGuard (nuevos):**
1. "lanza ForbiddenException cuando cliente_id está vacío (sin consultar DB)" — validación temprana, sin DB
2. "lanza ForbiddenException cuando no hay usuario en el request" — validación temprana
3. "resuelve db_name desde master.clientes y permite la request" — happy path con DB mock
4. "lanza ForbiddenException cuando el cliente tiene activo=false"
5. "lanza ForbiddenException cuando el cliente tiene deleted_at seteado"
6. "lanza ForbiddenException cuando el cliente no existe en master"
7. "vincula TenantContext con el cliente Prisma resuelto"

**Decisiones técnicas:**
1. `TenantContext.bind()` usa `AsyncLocalStorage.enterWith()` (no `run()`): en NestJS, los guards no pueden envolver el handler del controlador con `run()`. `enterWith()` propaga el contexto a través de todo el pipeline del request (interceptors + controller + repos) desde el scope async del guard.
2. `PrismaService.getMasterClient().cliente.findUnique()` — query directa a master.clientes usando la PK. Sin pasar por `IClienteRepository` (el guard es infraestructura, puede usar PrismaService directamente).
3. `PrismaService` y `TenantContext` son @Global (SharedModule) — no requieren cambios en AuthModule. DI automático.
4. `app.module.spec.ts` sigue verde — el DI graph compila correctamente con el nuevo constructor.

### CRITICAL-2 — AuthController: ClienteInactivoError → ForbiddenException (403)

**Archivos modificados:**

| Archivo | Cambio |
|---------|--------|
| `backend/src/auth/interface/controllers/auth.controller.ts` | +`ClienteInactivoError` import + branch `ForbiddenException(error.message)` |
| `backend/src/auth/interface/controllers/auth.controller.spec.ts` | +1 test: "lanza ForbiddenException (403) cuando el cliente está inactivo" |

### Estado de tests post PR-06-fix

| Suite | Tests |
|-------|-------|
| Unit (sin integration) | **304/304** |
| Integration (auth + clientes + rbac) | **39/39** |
| **TOTAL** | **343/343 verdes** |

- `tsc --noEmit`: ✅ limpio
- `pnpm lint`: ✅ limpio
- `app.module.spec.ts`: ✅ verde

---

---

## PR-08: prisma_tenant DDL completo + primera migración tenant — COMPLETADO

> Rama: `feat/pr08-tenant-schema` | Commits: `c31880d`, `7cab640`, `067eb03`
> Última actualización: 2026-06-23

### Tareas completadas

| Tarea | Estado | Notas |
|-------|--------|-------|
| 3.D.3 | ✅ | 11 modelos Prisma en `prisma_tenant/schema.prisma`. Migration `20260623120000_init_tenant_schema` aplicada a `soporte_tenant_test`. 18 integration tests TDD GREEN. |

### Modelos implementados (verbatim del spec tickets-core/Tablas TENANT)

| Modelo Prisma | Tabla SQL | Notas destacadas |
|---------------|-----------|-----------------|
| `Estado` | `estados` | Named relations EstadoAnterior/EstadoNuevo para OperacionTicket |
| `Prioridad` | `prioridades` | Catálogo con color/orden |
| `TipoTicket` | `tipos_ticket` | CHECK codigo IN ('SOPORTE','COMPRAS','EDILICIA') — raw SQL en migration |
| `TipoOperacion` | `tipo_operacion` | Catálogo de tipos de evento de timeline |
| `CicloCliente` | `ciclos_cliente` | ciclo_vigente_id es soft ref cross-DB (sin FK) |
| `Ticket` | `tickets` | solicitante_id y asignado_id son soft refs. Partial indexes WHERE NOT NULL |
| `OperacionTicket` | `operaciones_ticket` | metadata JSONB, dos named relations a Estado |
| `Archivo` | `archivos` | BigInt tamano_bytes, CHECK > 0, storage_key UNIQUE |
| `ArchivoTicket` | `archivos_ticket` | PK compuesta, ON DELETE CASCADE, sin soft delete |
| `ArchivoOperacion` | `archivos_operacion` | PK compuesta, ON DELETE CASCADE, sin soft delete |
| `UsuarioTiposTicket` | `usuario_tipos_ticket` | usuario_id soft ref, tipo_ticket_id FK real |

### Estado de verificaciones PR-08

| Check | Resultado |
|-------|-----------|
| `pnpm test` | **361 tests, 28 suites, todos verdes** (+18 nuevos de 3.D.3) |
| `tsc --noEmit` | ✅ limpio |
| `pnpm lint` | ✅ fitness rule verde |
| `prisma validate --schema=prisma_tenant/schema.prisma` | ✅ válido |
| `generate:tenant` | ✅ Prisma Client v7.8.0 regenerado en `.prisma/tenant` |
| Migration `20260623120000_init_tenant_schema` | ✅ aplicada a `soporte_tenant_test` |
| 18 integration tests (3.D.3) | ✅ 18/18 GREEN |

### Infra para aplicar la migración tenant (Prisma 7)

- **`prisma.tenant.config.ts`**: análogo a `prisma.config.ts` pero para la DB tenant. Lee `DATABASE_URL_TENANT`. La URL puede ser una DB tenant concreta o el target del fan-out.
- **`migrate:tenant` actualizado**: ahora pasa `--config prisma.tenant.config.ts` para que Prisma use `DATABASE_URL_TENANT` en lugar de `DATABASE_URL_MASTER`.
- **`soporte_tenant_test`**: DB de test creada en Docker postgres. Migration aplicada. Los 18 integration tests corren contra esta DB.

### Decisiones tomadas en PR-08

1. **`prisma.tenant.config.ts` separado**: limpia la separación master/tenant sin contaminar `prisma.config.ts`. El `migrate:tenant` script usa `--config prisma.tenant.config.ts` → `DATABASE_URL_TENANT`.
2. **Named relations para Estado dual**: `OperacionTicket` referencia `estados` dos veces (estado_anterior_id, estado_nuevo_id). Prisma requiere `@relation("EstadoAnterior")` / `@relation("EstadoNuevo")` + back-relations en `Estado`.
3. **`BigInt` para `tamano_bytes`**: tipo nativo de Prisma → mapea a `BIGINT` en Postgres. No requiere `@db` annotation adicional.
4. **Soft refs documentados con `///` inline**: `solicitante_id`, `asignado_id`, `autor_id`, `subido_por_id`, `ciclo_vigente_id`, `usuario_id` tienen comentarios `///` explicando el cross-DB sin FK.
5. **Partial indexes en raw SQL**: `tickets.ciclo_id WHERE NOT NULL` y `tickets.asignado_id WHERE NOT NULL` no son expresables en Prisma schema. Se agregan como raw SQL en la migration. En schema Prisma, `@@index([cicloId])` regular con comentario de advertencia.
6. **Migración artesanal**: consistente con PR-03. Prisma 7 en adapter mode no genera DDL automáticamente.
7. **Verificación TDD**: test en `src/shared/infrastructure/persistence/tenant-schema.integration.spec.ts` consulta `information_schema` para verificar tablas, columnas, FKs, CASCADE, CHECKs y ausencia de `cliente_id`.

### Archivos creados/modificados en PR-08

```
backend/
├── prisma.tenant.config.ts                        — datasource config para CLI tenant migrations
├── package.json                                   — migrate:tenant ahora usa --config prisma.tenant.config.ts
├── prisma_tenant/
│   ├── schema.prisma                              — DDL completo (reemplaza placeholder TenantSeedVersion)
│   └── migrations/
│       ├── migration_lock.toml                    — provider = "postgresql"
│       └── 20260623120000_init_tenant_schema/
│           └── migration.sql                      — DDL completo + partial indexes + CHECK constraints
└── src/
    └── shared/
        └── infrastructure/
            └── persistence/
                └── tenant-schema.integration.spec.ts  — 18 integration tests TDD (3.D.3)
```

---

## PR-09: seed catálogos base TENANT — COMPLETADO

> Rama: `feat/pr09-tenant-seeds` | Commit: `d5b8990`
> Última actualización: 2026-06-23

### Tareas completadas

| Tarea | Estado | Notas |
|-------|--------|-------|
| 3.D.4 | ✅ | `prisma_tenant/seeds/tenant-seed.ts` — idempotente. 11 integration tests TDD GREEN. `seed:tenant` script en package.json. |

### Catálogos sembrados (verbatim del spec tickets-core)

**estados (8 valores base):**

| id (fijo) | codigo | nombre | orden |
|-----------|--------|--------|-------|
| `c0000000-0000-4000-c000-000000000001` | `ABIERTO` | Abierto | 10 |
| `c0000000-0000-4000-c000-000000000002` | `PENDIENTE_APROBACION` | Pendiente de aprobación | 20 |
| `c0000000-0000-4000-c000-000000000003` | `APROBADO` | Aprobado | 30 |
| `c0000000-0000-4000-c000-000000000004` | `RECHAZADO` | Rechazado | 35 |
| `c0000000-0000-4000-c000-000000000005` | `EN_PROGRESO` | En progreso | 40 |
| `c0000000-0000-4000-c000-000000000006` | `RESUELTO` | Resuelto | 50 |
| `c0000000-0000-4000-c000-000000000007` | `CERRADO` | Cerrado | 60 |
| `c0000000-0000-4000-c000-000000000008` | `CANCELADO` | Cancelado | 70 |

**prioridades (4 niveles):**

| id (fijo) | codigo | nombre | orden |
|-----------|--------|--------|-------|
| `d0000000-0000-4000-d000-000000000001` | `BAJA` | Baja | 10 |
| `d0000000-0000-4000-d000-000000000002` | `MEDIA` | Media | 20 |
| `d0000000-0000-4000-d000-000000000003` | `ALTA` | Alta | 30 |
| `d0000000-0000-4000-d000-000000000004` | `CRITICA` | Crítica | 40 |

**tipos_ticket (3 discriminadores de flujo):**

| id (fijo) | codigo | nombre |
|-----------|--------|--------|
| `e0000000-0000-4000-e000-000000000001` | `SOPORTE` | Soporte |
| `e0000000-0000-4000-e000-000000000002` | `COMPRAS` | Compras |
| `e0000000-0000-4000-e000-000000000003` | `EDILICIA` | Edilicia |

**tipo_operacion (5 tipos de evento de timeline):**

| id (fijo) | codigo | nombre |
|-----------|--------|--------|
| `f0000000-0000-4000-f000-000000000001` | `CAMBIO_ESTADO` | Cambio de estado |
| `f0000000-0000-4000-f000-000000000002` | `COMENTARIO` | Comentario |
| `f0000000-0000-4000-f000-000000000003` | `ASIGNACION` | Asignación |
| `f0000000-0000-4000-f000-000000000004` | `ADJUNTO` | Adjunto |
| `f0000000-0000-4000-f000-000000000005` | `AVANCE_EDILICIO` | Avance edilicio |

### Valores inferidos (spec no los define explícitamente)

El spec tickets-core define `codigo` y `orden` para los catálogos, pero NO los valores de `nombre`.
Los nombres usados son inferidos del codigo (ej. `BAJA` → "Baja", `CAMBIO_ESTADO` → "Cambio de estado").
Ver riesgo R-01 si se requiere revisión.

El campo `color` (nullable en schema) se omite en el seed — el spec no define colores.

### Estado de verificaciones

| Check | Resultado |
|-------|-----------|
| `pnpm test` | **372 tests, 29 suites, todos verdes** (+11 integration de 3.D.4) |
| `tsc --noEmit` | ✅ limpio |
| `pnpm lint` | ✅ fitness rule verde |
| `seed:tenant` en `soporte_tenant_test` | ✅ ejecutado |
| Idempotencia verificada | ✅ re-run no modifica row counts |

### Archivos creados/modificados en PR-09

```
backend/
├── package.json                                   — +seed:tenant script (ts-node)
├── prisma_tenant/
│   └── seeds/
│       └── tenant-seed.ts                         — seed idempotente de catálogos tenant
└── src/
    └── shared/
        └── infrastructure/
            └── persistence/
                └── tenant-seed.integration.spec.ts — 11 integration tests TDD (3.D.4)
```

### Decisiones tomadas en PR-09

1. **TypeScript script (no SQL migration)**: el tenant seed es un script TS standalone, no una migración Prisma. Razón: el fan-out de provisioning requiere ejecutar el seed por cada DB tenant individualmente, sobreescribiendo `DATABASE_URL_TENANT`. Una migration SQL en `prisma_tenant/migrations/` se aplicaría automáticamente a todos los tenants vía `migrate:tenant` en fan-out — lo cual también funciona. Se eligió el script TS para alinearse con la convención `seeds/` definida en tasks.md (3.D.4 y 6.C.4).
2. **UUIDs deterministas**: prefijos `c0`, `d0`, `e0`, `f0` para los 4 catálogos. Mismo patrón que PR-07 (`a0`, `b0` para master RBAC). Estabilidad cross-environment. La clave de idempotencia es el UNIQUE ON `codigo`, no el UUID.
3. **`ON CONFLICT (codigo) DO NOTHING`**: clave de idempotencia explícita en el spec. El `nombre` y `orden` no se actualizan en re-runs (DO NOTHING, no DO UPDATE). Si se necesita actualizar nombres/órdenes: separar en una migración ALTER.
4. **`import` antes del `try/catch`**: corregido para seguir el estándar de ES modules. `process.loadEnvFile()` carga el `.env` antes de usar `pool` pero después de importar `Pool`.
5. **Test sin TRUNCATE**: los catálogos son datos de referencia. La suite asume que `migrate:tenant` fue aplicada antes. Si se truncan y re-ejecutan tests, `seed:tenant` debe correr antes.

### Riesgos documentados (R-01)

| Riesgo | Tipo | Estado |
|--------|------|--------|
| R-01: nombres de catálogos inferidos | GAP — spec no define `nombre` para prioridades, tipos_ticket, tipo_operacion | ABIERTO — el usuario debe confirmar o sobrescribir los nombres |

---

---

## PR-10 Slice 1: tickets-core dominio base — entidades + puertos (3.A) — COMPLETADO

> Rama: `feat/pr10-tickets-domain` | Commit: `d811b3d`
> Última actualización: 2026-06-23

### Tareas completadas

| Tarea | Estado | Notas |
|-------|--------|-------|
| 3.A.1 | ✅ | 49 unit tests TDD (RED → GREEN). 4 suites: ticket.entity.spec, operacion-ticket.entity.spec, archivo.entity.spec, ciclo-cliente.entity.spec. Cubre: constructor/estado-inicial-ABIERTO, assignTo(), canTransitionTo(desde,hacia), inmutabilidad OperacionTicket, validación tamano_bytes, soft-ref sin FK en CicloCliente. |
| 3.A.2 | ✅ | 6 entidades en `tickets/domain/entities/`: ticket.entity.ts, operacion-ticket.entity.ts, archivo.entity.ts, ciclo-cliente.entity.ts, estado.entity.ts, prioridad.entity.ts. Todas extienden BaseEntity. Sin imports de Prisma ni NestJS. |
| 3.A.3 | ✅ | 6 puertos en `tickets/domain/ports/`: i-ticket.repository.ts, i-operacion-ticket.repository.ts, i-archivo.repository.ts, i-ciclo-cliente.repository.ts, i-estado.repository.ts, i-usuario-tipos-ticket.repository.ts. Con Symbol DI tokens. |

### Estado de tests post PR-10 Slice 1 (post-normalización)

| Check | Resultado |
|-------|-----------|
| `pnpm test` | **422 tests, 33 suites, todos verdes** (+49 nuevos de 3.A.1) |
| `tsc --noEmit` | ✅ limpio |
| `pnpm lint` | ✅ fitness rule verde; cero imports de @prisma/client en domain/ |

### Archivos creados en PR-10 Slice 1

```
backend/src/tickets/
└── domain/
    ├── errors/
    │   └── tickets.errors.ts                          — ArchivoTamanoCeroError
    ├── entities/
    │   ├── ticket.entity.ts + spec.ts                 — 17 tests (TDD GREEN)
    │   ├── operacion-ticket.entity.ts + spec.ts       — 13 tests (TDD GREEN)
    │   ├── archivo.entity.ts + spec.ts                — 12 tests (TDD GREEN)
    │   ├── ciclo-cliente.entity.ts + spec.ts          — 11 tests (TDD GREEN)
    │   ├── estado.entity.ts                           — catálogo (sin tests propios, cubierto por reconstitute pattern)
    │   └── prioridad.entity.ts                        — catálogo (ídem)
    └── ports/
        ├── i-ticket.repository.ts                     — + TICKET_REPOSITORY token
        ├── i-operacion-ticket.repository.ts           — + OPERACION_TICKET_REPOSITORY token
        ├── i-archivo.repository.ts                    — + ARCHIVO_REPOSITORY token
        ├── i-ciclo-cliente.repository.ts              — + CICLO_CLIENTE_REPOSITORY token
        ├── i-estado.repository.ts                     — + ESTADO_REPOSITORY token
        └── i-usuario-tipos-ticket.repository.ts       — + USUARIO_TIPOS_TICKET_REPOSITORY token
```

### Decisiones tomadas en PR-10 Slice 1

1. **`TicketEntity` NORMALIZADO — sin `estadoCodigo`** ✅ CONFIRMADO POR USUARIO: el Ticket guarda solo `estadoId` (UUID FK → estados). Una sola fuente de verdad. El use case cargará el Estado desde `IEstadoRepository` y pasará los códigos a la state machine y a `canTransitionTo()` como parámetros.

2. **`canTransitionTo(desdeEstadoCodigo, haciaEstadoCodigo): boolean`**: firma definitiva. La entidad verifica solo invariantes: `isDeleted()` + `TERMINAL_STATES.has(desdeEstadoCodigo)`. La lógica de transición específica por tipo (BaseTicketStateMachine) llega en Slice 2 (3.B). El use case carga los códigos desde IEstadoRepository antes de llamar a este método.

3. **`OperacionTicketEntity` es inmutable**: no tiene métodos de mutación de negocio. `softDelete()` es el único cambio de estado permitido (herencia de BaseEntity para auditoría). Esto se verifica en los tests de inmutabilidad.

4. **`ArchivoEntity.create()` retorna `Result<ArchivoEntity, ArchivoTamanoCeroError>`**: sigue el patrón del skill `error-handling`: operaciones que pueden fallar retornan Result, no throws. `reconstitute()` NO valida (datos ya validados al persistir).

5. **`ArchivoEntity` tiene constructor `private`**: para forzar el uso de `create()` (con validación) o `reconstitute()` (sin validación). Los tests usan `ArchivoProps` directamente en lugar de `ConstructorParameters`.

6. **`CicloClienteEntity.cicloVigenteId` es soft ref pura**: el dominio almacena el UUID sin validar existencia. La validación cross-DB es responsabilidad del use case (capa de aplicación).

7. **`IUsuarioTiposTicketRepository.revoke()` elimina fila físicamente**: la tabla `usuario_tipos_ticket` no tiene soft delete por diseño (solo `created_at`, sin `deleted_at`). Documentado en el puerto.

8. **`ITicketRepository.findLastSecuencia(tipoId, anio)`**: método requerido por `NumeradorTicket` (Slice 2, 3.B.4) para generar el siguiente número legible. Incluido en el puerto para que esté disponible en el wiring del Slice 2.

### Pendiente en PR-10 (otros slices)

| Tareas | Slice | Descripción |
|--------|-------|-------------|
| 3.B.3–3.B.4 | **Slice 3** | NumeradorTicket (service + test) |
| 3.C.1–3.C.8 | **Slice 3+** | Application use cases (CrearTicket, AsignarTicket, etc.) |
| 3.D.1–3.D.2 | **Slice 3+** | Infrastructure: repos Prisma + mappers |
| 3.E.1–3.E.2 | **Slice 3+** | Interface: TicketsController + TicketsModule |

---

## PR-10 Slice 2: máquina de estados base + factory (3.B.1 y 3.B.2) — COMPLETADO

> Rama: `feat/pr10-tickets-domain`
> Última actualización: 2026-06-23

### Tareas completadas

| Tarea | Estado | Notas |
|-------|--------|-------|
| 3.B.1 | ✅ | 32 unit tests TDD (RED → GREEN). 2 suites: BaseTicketStateMachine (22 tests) + TicketStateMachineFactory (10 tests). Cubre: 6 transiciones válidas, 8 terminales, 8 inválidas del diagrama, 4 tests de pureza de función, 4 tests de factory behavior. |
| 3.B.2 | ✅ | 3 archivos en `tickets/domain/state-machine/`. Sin imports de Prisma ni NestJS. Función pura, singleton-safe. `StateMachineContext` con `porcentajeAvance?: number` extensible para Fases 4 y 5. |

### Estado de tests post PR-10 Slice 2

| Check | Resultado |
|-------|-----------|
| `pnpm test` | **454 tests, 34 suites, todos verdes** (+32 nuevos de 3.B.1) |
| `tsc --noEmit` | ✅ limpio |
| `pnpm lint` | ✅ fitness rule verde; cero imports de @prisma/client en domain/ |

### Archivos creados en PR-10 Slice 2

```
backend/src/tickets/
└── domain/
    └── state-machine/
        ├── i-ticket-state-machine.ts            — interface ITicketStateMachine + StateMachineContext
        ├── base-ticket-state-machine.ts          — implementación base (6 transiciones del diagrama)
        ├── base-ticket-state-machine.spec.ts     — 32 tests TDD (3.B.1)
        └── ticket-state-machine.factory.ts       — Strategy factory instance-based con register()
```

### Decisiones tomadas en PR-10 Slice 2

1. **`StateMachineContext` con `porcentajeAvance?: number`**: campo opcional para que `EdiliciaStateMachine` (Fase 5) pueda evaluar la guarda `EN_PROGRESO → RESUELTO` (`porcentaje_avance = 100`). `BaseTicketStateMachine` y `ComprasStateMachine` lo ignoran. El diseño es extensible sin romper la interfaz base.

2. **Constante `VALID_TRANSITIONS` como `Map<string, ReadonlySet<string>>`**: definida fuera de la clase (nivel de módulo), compartida entre instancias. Inmutable (`ReadonlySet`), segura para uso como singleton. Elimina alocaciones repetidas.

3. **Factory instance-based (no estática)**: cada instancia tiene su propio `Map` de registro. Evita bleeding de estado entre tests y entre módulos. En producción NestJS gestiona el singleton. El fallback por constructor injection permite substituirlo en tests.

4. **`BaseTicketStateMachine` como fallback del factory**: no hay registros iniciales explícitos. COMPRAS y EDILICIA llaman a `factory.register()` en su módulo NestJS al inicializarse (Fases 4 y 5). Para SOPORTE, el fallback base es el comportamiento correcto.

5. **Pureza garantizada**: `VALID_TRANSITIONS` es constante inmutable; `puedeTransicionar` solo lee el Map y el Set sin mutarlos. El contexto no se modifica. Tests de pureza verifican: mismo resultado ante múltiples llamadas, no-mutación de ctx, independencia entre instancias.

---

---

## PR-10 Slice 3: NumeradorTicket (3.B.3 y 3.B.4) — COMPLETADO

> Rama: `feat/pr10-tickets-domain`
> Última actualización: 2026-06-23

### Tareas completadas

| Tarea | Estado | Notas |
|-------|--------|-------|
| 3.B.3 | ✅ | 14 unit tests TDD RED→GREEN. Suite: numerador-ticket.service.spec. Cubre prefijos SOP/COM/EDI, padding 5 dígitos, localidad de secuencia (findLastSecuencia llamado con tipoId+anio), secuencias independientes por tipo, reset por año, error en codigo desconocido. |
| 3.B.4 | ✅ | `NumeradorTicket` en `tickets/domain/services/numerador-ticket.service.ts`. `PREFIJO_POR_CODIGO` exportado. `generarNumero(tipoId, tipoCodigo, anio)` async. `generarFormato(prefijo, anio, secuencia)` static puro. Pick<ITicketRepository, 'findLastSecuencia'> como dependencia. Sin Prisma ni NestJS. |

### Estado de tests post PR-10 Slice 3

| Check | Resultado |
|-------|-----------|
| `pnpm test` | **468 tests, 35 suites, todos verdes** (+14 nuevos de 3.B.3) |
| `tsc --noEmit` | ✅ limpio |
| `pnpm lint` | ✅ fitness rule verde; cero imports de @prisma/client en domain/ |

### Archivos creados en PR-10 Slice 3

```
backend/src/tickets/
└── domain/
    └── services/
        ├── numerador-ticket.service.ts       — NumeradorTicket + PREFIJO_POR_CODIGO (3.B.4)
        └── numerador-ticket.service.spec.ts  — 14 tests TDD (3.B.3)
```

### Decisiones tomadas en PR-10 Slice 3

1. **`PREFIJO_POR_CODIGO` como const exportada**: el mapa `{ SOPORTE: 'SOP', COMPRAS: 'COM', EDILICIA: 'EDI' }` se exporta como constante para que el use case (`CrearTicketUseCase`, Slice 3+) pueda acceder a él sin instanciar el servicio. También permite testearlo directamente sin mock.

2. **`Pick<ITicketRepository, 'findLastSecuencia'>` en constructor**: el servicio solo necesita un método del repositorio. Usar `Pick` en lugar del tipo completo reduce el acoplamiento y simplifica el mock en tests (stub minimal).

3. **`generarFormato()` static puro**: la lógica de formateo (prefijo + año + padding) es independiente del repositorio. Extraída como método estático para ser testeable sin ningún mock y reutilizable en otros contextos (ej. validación, display).

4. **`tipoCodigo` como parámetro (no derivado desde `tipoId`)**: el servicio recibe `tipoCodigo` explícitamente porque la entidad `TicketEntity` solo almacena `tipoId` (UUID). El use case carga el `codigo` del tipo desde el repositorio y lo pasa. Esto mantiene el servicio sin dependencias de `IEstadoRepository` ni queries adicionales.

5. **Prefijos inferidos del spec**: `SOP` (SOPORTE), `COM` (COMPRAS), `EDI` (EDILICIA). El spec los define explícitamente: "el prefijo MUST derivarse del codigo del tipo de ticket: SOP (SOPORTE), COM (COMPRAS), EDI (EDILICIA)".

### Pendiente en PR-10 (otros slices)

| Tareas | Slice | Descripción |
|--------|-------|-------------|
| 3.C.1–3.C.8 | **Slice 4+** | Application use cases (CrearTicket, AsignarTicket, etc.) |
| 3.D.1–3.D.2 | **Slice 4+** | Infrastructure: repos Prisma + mappers |
| 3.E.1–3.E.2 | **Slice 4+** | Interface: TicketsController + TicketsModule |

---

---

## PR-11a: tickets-core application core — CrearTicket + TransicionarEstado (3.C) — COMPLETADO

> Rama: `feat/pr11a-tickets-usecases-core`
> Última actualización: 2026-06-23

### Tareas completadas

| Tarea | Estado | Notas |
|-------|--------|-------|
| 3.C.1 | ✅ | 24 unit tests TDD RED→GREEN. Cubre: validación cross-DB, estado ABIERTO, número generado, operacion CAMBIO_ESTADO inicial (anterior=null), transacción atómica (orden de saves dentro del runner), happy path UUIDv7. |
| 3.C.2 | ✅ | `CrearTicketUseCase` implementado. Sin imports de Prisma ni NestJS. Retorna `Result<TicketEntity, DomainError>`. |
| 3.C.5 | ✅ | 27 unit tests TDD RED→GREEN. Cubre: ticket not found, estado resolution (actual por id, nuevo por codigo), invariante soft-deleted, routing factory, transición inválida (5 tests: no modifica estado, no crea operacion, no llama txRunner, no llama ticketSave, retorna 422 semántico), transición válida (11 tests). |
| 3.C.6 | ✅ | `TransicionarEstadoUseCase` implementado. Doble validación: `canTransitionTo()` (invariantes entidad) + `machine.puedeTransicionar()` (reglas por tipo). |

### Nuevos puertos (tickets/domain/ports/)

| Puerto | Token | Descripción |
|--------|-------|-------------|
| `IUsuarioMasterChecker` | `USUARIO_MASTER_CHECKER` | `existeEnTenant(usuarioId, clienteId): Promise<boolean>` — validación cross-DB de soft refs |
| `ITipoTicketRepository` | `TIPO_TICKET_REPOSITORY` | `findCodigoById(tipoId): Promise<string \| null>` — resuelve tipoCodigo para numerador y factory |
| `ITipoOperacionRepository` | `TIPO_OPERACION_REPOSITORY` | `findIdByCodigo(codigo): Promise<string \| null>` — resuelve uuid de CAMBIO_ESTADO, ASIGNACION, etc. |

### Nuevos errores (tickets/domain/errors/tickets.errors.ts)

| Error | Código | Descripción |
|-------|--------|-------------|
| `SolicitanteInvalidoError` | `SOLICITANTE_INVALIDO` | Soft ref inválida: solicitante no existe en master o pertenece a otro tenant |
| `EstadoCatalogoNoEncontradoError` | `ESTADO_CATALOGO_NO_ENCONTRADO` | Estado no encontrado en catálogo tenant (seed incorrecto) |
| `TipoTicketNoEncontradoError` | `TIPO_TICKET_NO_ENCONTRADO` | Tipo ticket no encontrado (tipoId inválido) |
| `TipoOperacionNoEncontradoError` | `TIPO_OPERACION_NO_ENCONTRADO` | Tipo operación no encontrado (seed incorrecto) |
| `TicketNoEncontradoError` | `TICKET_NO_ENCONTRADO` | Ticket con id dado no existe (HTTP 404) |
| `TransicionInvalidaError` | `TRANSICION_INVALIDA` | Transición rechazada por invariante o state machine (HTTP 422) |

### Estado de tests post PR-11a (incl. fix D-3)

| Check | Resultado |
|-------|-----------|
| `pnpm test` | **547 tests, 39 suites, todos verdes** (+5 tests TDD D-3 fix: tipo no encontrado en TransicionarEstado) |
| `tsc --noEmit` | ✅ limpio |
| `pnpm lint` | ✅ fitness rule verde — cero imports de @prisma/client en application/ ni domain/ |

### Archivos creados en PR-11a

```
backend/src/tickets/
├── domain/
│   ├── errors/
│   │   └── tickets.errors.ts                           — +6 errores de aplicación (SolicitanteInvalidoError, EstadoCatalogoNoEncontradoError, etc.)
│   └── ports/
│       ├── i-usuario-master.checker.ts                 — NUEVO: IUsuarioMasterChecker + USUARIO_MASTER_CHECKER token
│       ├── i-tipo-ticket.repository.ts                 — NUEVO: ITipoTicketRepository + TIPO_TICKET_REPOSITORY token
│       └── i-tipo-operacion.repository.ts              — NUEVO: ITipoOperacionRepository + TIPO_OPERACION_REPOSITORY token
└── application/
    └── use-cases/
        ├── crear-ticket.use-case.ts + spec.ts          — 24 unit tests TDD
        └── transicionar-estado.use-case.ts + spec.ts   — 32 unit tests TDD (27 originales + 5 fix D-3)
```

### Decisiones tomadas en PR-11a

1. **`IUsuarioMasterChecker` mínimo (decisión inferida)**: Se creó un puerto dedicado con un único método `existeEnTenant()` en lugar de reusar `IUsuarioRepository` de auth. Razón: auth tiene métodos de escritura (save, revokeAll) no relevantes para tickets, y cruzar módulos así crea acoplamiento innecesario. La implementación concreta consultará `master.usuarios` via `MasterPrismaClient`. **Pendiente confirmación de la forma exacta del checker** — específicamente si debe verificar también que `usuario.activo = true` o solo `deleted_at IS NULL`. La spec dice "deleted_at IS NULL" pero la best practice sería verificar ambos. Se implementó verificando ambos (docs + todo).

2. **`ITipoTicketRepository.findCodigoById()` mínimo**: En lugar de crear una `TipoTicketEntity` completa (scope creep), el puerto retorna directamente el `codigo` string. Suficiente para el numerador y el factory. La entidad completa llegará cuando sea necesaria (Fase 4+ con `CrearTicketCompraUseCase` que crea satélite).

3. **`ITipoOperacionRepository.findIdByCodigo()` mínimo**: El `tipo_operacion` catalog es estable y tiene UUIDs deterministas. El puerto abstrae la resolución sin hardcodear UUIDs en el use case. La implementación puede cache-ar el resultado si lo desea (catálogo cambia raramente).

4. **`StateMachineContext` pasa `{}` en `TransicionarEstadoUseCase`**: El contexto es vacío para el MVP actual. Cuando se implemente `EdiliciaStateMachine` (Fase 5), el DTO deberá extenderse con `porcentajeAvance?: number` y el use case construirá el ctx apropiado. **Decisión inferida: se necesita confirmar cómo el controller o el caller provee el porcentajeAvance** — si viene en el body del request o si el use case lo carga desde un port de EdiliciaRepository.

5. **Doble validación de transición**: `ticket.canTransitionTo()` (invariantes de entidad: soft-delete, terminales) + `machine.puedeTransicionar()` (reglas por tipo de ticket). Ambas retornan `TransicionInvalidaError`. El mensaje incluye la razón en el primer caso. Defense in depth sin duplicar lógica.

6. **`TicketStateMachineFactory` inyectada como `Pick<TicketStateMachineFactory, 'resolve'>`**: Permite mockear la factory en tests como un objeto plain `{ resolve: jest.fn() }` sin instanciar la clase real. La DI de NestJS usará el token `TICKET_STATE_MACHINE_FACTORY` en PR-11b.

### Decisiones inferidas pendientes de confirmación

| # | Decisión | Impacto |
|---|----------|---------|
| D-1 | `IUsuarioMasterChecker.existeEnTenant()` verifica `deleted_at IS NULL` + pertenecer al tenant | Confirmado por coordinador: CORRECTO — `activo = true` aplica solo al ASIGNADO (PR-11b), no al solicitante. No tocar. |
| D-2 | `StateMachineContext` vacío `{}` en TransicionarEstado | Confirmado por coordinador: OK — reservar `porcentajeAvance?` para Edilicia Fase 5. |
| D-3 | ~~Fallback silencioso cuando `tipoCodigo` es null~~ | **RESUELTO** — Implementado como fail loud: `TipoTicketNoEncontradoError` cuando `findCodigoById` retorna null. Razón: el ticket ya existe con ese tipoId en DB; null = inconsistencia de datos, no caso normal. Sin fallback, se evita enrutar mal a BaseTicketStateMachine cuando se registren máquinas COMPRAS/EDILICIA (Fase 4/5). +5 tests TDD agregados. |

---

## PR-11b: tickets-core application use cases — asignar + adjuntar — COMPLETADO

> Rama: `feat/pr11b-tickets-usecases-asignar-adjuntar`
> Última actualización: 2026-06-23

### Tareas completadas

| Tarea | Estado | Notas |
|-------|--------|-------|
| 3.C.3 | ✅ | 19 unit tests TDD RED→GREEN. AsignarTicketUseCase spec completa. |
| 3.C.4 | ✅ | AsignarTicketUseCase implementado. Nuevos errores: AsignadoInvalidoError, AsignadoNoElegibleError. |
| 3.C.7 | ✅ | 19 unit tests TDD RED→GREEN. AdjuntarArchivoUseCase spec completa. |
| 3.C.8 | ✅ | AdjuntarArchivoUseCase implementado. Pre-genera UUIDv7 para storage key + entity id coherentes. |

### Modificaciones a puertos existentes

| Puerto | Cambio | Razón |
|--------|--------|-------|
| `IUsuarioMasterChecker` | +`estaActivoEnTenant(usuarioId, clienteId)` | El asignado DEBE tener `activo=TRUE` (spec); el solicitante solo necesita `deleted_at IS NULL`. Dos métodos con semántica explícita. |
| `IArchivoRepository` | +`linkToTicket(archivoId, ticketId)` | Necesario para crear la fila en `archivos_ticket` desde el use case. La alternativa (manejar el join dentro de `save`) oculta la operación y dificulta el test de transaccionalidad. |

### Errores de dominio nuevos

| Error | Code | Semántica |
|-------|------|-----------|
| `AsignadoInvalidoError` | `ASIGNADO_INVALIDO` | El asignado no existe en master con `activo=TRUE`, está eliminado, o no pertenece al tenant. HTTP 422. |
| `AsignadoNoElegibleError` | `ASIGNADO_NO_ELEGIBLE` | El asignado no tiene fila en `usuario_tipos_ticket` para el tipo del ticket. HTTP 422. Independiente de RBAC. |

### Estado de tests post PR-11b

| Métrica | Valor |
|---------|-------|
| Tests totales | **588 tests, 41 suites, todos verdes** |
| Tests nuevos en PR-11b | +38 (19 asignar + 19 adjuntar) + 3 extra en crear-ticket mock update |
| Baseline PR-11a | 547 tests |
| tsc --noEmit | ✅ limpio |
| pnpm lint (+ fitness rule) | ✅ limpio (0 imports @prisma en application/) |

### Archivos creados/modificados en PR-11b

```
backend/src/
├── shared/
│   └── domain/ports/
│       └── i-file-storage.ts                             — sin cambios (ya existía)
└── tickets/
    ├── domain/
    │   ├── errors/
    │   │   └── tickets.errors.ts                         — +AsignadoInvalidoError, +AsignadoNoElegibleError
    │   └── ports/
    │       ├── i-usuario-master.checker.ts               — +estaActivoEnTenant()
    │       └── i-archivo.repository.ts                   — +linkToTicket()
    └── application/use-cases/
        ├── asignar-ticket.use-case.ts                    — NUEVO (3.C.4)
        ├── asignar-ticket.use-case.spec.ts               — NUEVO (3.C.3) — 19 tests
        ├── adjuntar-archivo.use-case.ts                  — NUEVO (3.C.8)
        ├── adjuntar-archivo.use-case.spec.ts             — NUEVO (3.C.7) — 19 tests
        └── crear-ticket.use-case.spec.ts                 — MODIFICADO: +estaActivoEnTenant en mock
```

### Decisiones inferidas PR-11b

| # | Decisión | Impacto |
|---|----------|---------|
| D-4 | `estaActivoEnTenant` como método separado de `existeEnTenant` | Sin cambio de semántica en el método existente. Si la infra necesita una sola query con OR, la implementación puede combinarlos internamente. |
| D-5 | `linkToTicket` separado en `IArchivoRepository` | La alternativa era un `saveForTicket(archivo, ticketId)` monolítico, pero separar los métodos da control explícito de transaccionalidad al use case y facilita el test de orden. |
| D-6 | UUIDv7 pre-generado en `AdjuntarArchivoUseCase` | Necesario para construir la storage key antes de crear el entity, y para que el id de la entidad coincida con el id en la key. Alternativa rechazada: crear entity con storageKey placeholder y mutarla post-upload (viola inmutabilidad de props). |
| D-7 | Storage key = `tickets/{ticketId}/{archivoId}` | Patrón path-based simple. No incluye extensión (inferible desde mimeType en presentación). El infra adapter puede agregar prefijo de bucket. |
| D-8 | Fire-and-forget en error de DB post-upload | Si upload exitoso + DB falla → archivo huérfano en storage. El use case NO llama `IFileStorage.delete`. Cleanup asíncrono per spec "MUST NOT bloquear la respuesta". |
| D-9 | Validación `tamanoBytes > 0` ANTES del upload | Fail-fast para evitar costos de storage con datos inválidos. La misma validación existe en `ArchivoEntity.create()` pero se duplica aquí a propósito para evitar el round-trip a IFileStorage con datos inválidos. |

---

---

## PR-11c: tickets-core infra repos Prisma + mappers (3.D.1 y 3.D.2) — COMPLETADO

> Rama: `feat/pr11c-tickets-infra`
> Última actualización: 2026-06-23

### Tareas completadas

| Tarea | Estado | Notas |
|-------|--------|-------|
| 3.D.1 | ✅ | 38 integration tests TDD RED→GREEN. Suite: `prisma-tickets.integration.spec.ts`. Cubre 7 repos tenant + UsuarioMasterChecker. |
| 3.D.2 | ✅ | 9 archivos: 7 repos + 4 mappers + UsuarioMasterChecker. Todos los repos tenant usan TenantContext. Fitness rule verde. |

### Repos implementados

| Clase | Puerto | Notas |
|-------|--------|-------|
| `PrismaTicketRepository` | `ITicketRepository` | save, findById, findByNumero, findLastSecuencia, soft-delete |
| `PrismaOperacionTicketRepository` | `IOperacionTicketRepository` | save (INSERT-only, timeline inmutable), findByTicketId |
| `PrismaArchivoRepository` | `IArchivoRepository` | save (INSERT-only), findById, findByStorageKey, findByTicketId, linkToTicket, soft-delete |
| `PrismaEstadoRepository` | `IEstadoRepository` | findById, findByCodigo, findAllActive, findAll (read-only catálogo) |
| `PrismaUsuarioTiposTicketRepository` | `IUsuarioTiposTicketRepository` | assign (createMany skipDuplicates), isUserEligibleForType, revoke (deleteMany) |
| `PrismaTipoTicketRepository` | `ITipoTicketRepository` | findCodigoById |
| `PrismaTipoOperacionRepository` | `ITipoOperacionRepository` | findIdByCodigo |
| `UsuarioMasterChecker` | `IUsuarioMasterChecker` | existeEnTenant, estaActivoEnTenant — usa PrismaService (master), NO TenantContext |

### Mappers implementados

| Clase | Notas |
|-------|-------|
| `TicketMapper` | toDomain + toPersistence. UUIDs + Date + campos nullables. |
| `OperacionTicketMapper` | toDomain (cast metadata: Json → Record) + toPersistence (Record<string,any> por Prisma Json? quirk). |
| `ArchivoMapper` | toDomain + toPersistence. BigInt tamano_bytes sin conversión. |
| `EstadoMapper` | toDomain únicamente (catálogo read-only). |

### Tests de integración (38 en total)

| Describe | Tests | Cobertura |
|----------|-------|-----------|
| PrismaTicketRepository | 8 | save, findById, findByNumero, findByNumero null, findLastSecuencia, findLastSecuencia-multiple, findLastSecuencia-cero, soft-delete |
| PrismaOperacionTicketRepository | 3 | save, findByTicketId multiple, findByTicketId excluye soft-deleted |
| PrismaArchivoRepository | 6 | save, findById, findByStorageKey, findByTicketId via join, linkToTicket, soft-delete (no borra DB) |
| PrismaEstadoRepository | 4 | findById, findByCodigo, findAllActive (excluye soft-deleted), findAll |
| PrismaUsuarioTiposTicketRepository | 4 | assign, assign idempotente, isUserEligibleForType, revoke |
| PrismaTipoTicketRepository | 2 | findCodigoById, findCodigoById null |
| PrismaTipoOperacionRepository | 2 | findIdByCodigo, findIdByCodigo null |
| UsuarioMasterChecker (master DB) | 4 | existeEnTenant true/false, estaActivoEnTenant true/false(inactivo) |
| Architectural invariants | 5 | Fitness: no PrismaService en repos tenant; constructors toman TenantContext; UsuarioMasterChecker toma PrismaService |

### Estado de verificaciones

| Check | Resultado |
|-------|-----------|
| `pnpm test` | **626 tests, 42 suites, todos verdes** (+38 nuevos integration) |
| `tsc --noEmit` | ✅ limpio |
| `pnpm lint` | ✅ limpio — fitness rule verde, sin unused directives |
| Fitness rule | ✅ Prisma imports solo en `infrastructure/` |

### Archivos creados en PR-11c

```
backend/src/tickets/infrastructure/persistence/prisma/
├── prisma-tickets.integration.spec.ts     — 38 integration tests TDD (3.D.1)
├── ticket.mapper.ts                       — TicketMapper toDomain + toPersistence
├── operacion-ticket.mapper.ts             — OperacionTicketMapper (Record<string,any> por Json? quirk)
├── archivo.mapper.ts                      — ArchivoMapper (BigInt nativo, reconstitute)
├── estado.mapper.ts                       — EstadoMapper toDomain (read-only)
├── prisma-ticket.repository.ts            — PrismaTicketRepository
├── prisma-operacion-ticket.repository.ts  — PrismaOperacionTicketRepository
├── prisma-archivo.repository.ts           — PrismaArchivoRepository
├── prisma-estado.repository.ts            — PrismaEstadoRepository
├── prisma-usuario-tipos-ticket.repository.ts — PrismaUsuarioTiposTicketRepository
├── prisma-tipo-ticket.repository.ts       — PrismaTipoTicketRepository
├── prisma-tipo-operacion.repository.ts    — PrismaTipoOperacionRepository
└── usuario-master.checker.ts             — UsuarioMasterChecker (master DB via PrismaService)
```

### Decisiones técnicas PR-11c

1. **`OperacionTicketMapper.toPersistence()` retorna `Record<string, any>`**: Prisma 7 tipo `Json?` requiere `Prisma.DbNull` sentinel para SQL NULL en entradas tipadas. En runtime `null` → SQL NULL funciona; el tipo formal no lo acepta. Se usa `Record<string, any>` + `data as any` en el repo para eludir la restricción sin perder seguridad en dominio.

2. **`findLastSecuencia` usa `contains + orderBy string`**: filtra tickets cuyo `numero` contiene `-{anio}-`, ordena descendente por string, toma 1, parsea el último segmento después del último `-`. Funciona porque los números son zero-padded a 5 dígitos (orden string = orden numérico).

3. **`TenantContext.run()` como helper `withTenant<T>` en tests**: simula la activación del guard sin NestJS DI. `tenantContext.run({ prismaClient, dbName, clienteId }, fn)` — el mismo mecanismo que usa `TenantGuard.bind()` en producción.

4. **`UsuarioMasterChecker` usa `PrismaService.getMasterClient()`**: la única excepción a "repos tenant usan TenantContext". El checker consulta `master.usuarios` (cross-DB). PrismaService es @Global y se inyecta directamente en el constructor. Sin TenantContext en su signature.

5. **Fitness rule verificada por test**: el test `"PrismaTicketRepository constructor solo acepta TenantContext"` verifica `PrismaTicketRepository.length === 1` (un parámetro en constructor). Defense-in-depth contra futuros refactors que rompan la regla.

6. **`PrismaArchivoRepository.findByTicketId` vía `archivosTicket: { some: { ticketId } }`**: join indirecto vía tabla `archivos_ticket`. Filtra `deletedAt: null` en el archivo principal. La join table no tiene soft delete.

---

## Estado global del cambio

| Fase | Progreso |
|------|---------|
| Fase 0 — Scaffolding + Shared | **16/16 tareas completadas** (PR-01 + PR-02) |
| Fase 1 — MASTER: clientes | **14/15 tareas completadas** — 1.A.1–1.D.2 ✅ PR-04; 1.C.3 ✅ PR-03 |
| Fase 2 — MASTER: auth+RBAC | **20/22** — 2.A.1–2.B.8 ✅ PR-05; 2.C.1/2.C.2/2.D.1–2.D.4 ✅ PR-06; PR-06-fix ✅ CRITICALs; 2.C.3 ✅ PR-03; 2.E.1 ✅ PR-07; pendiente: 2.D.5 (registro usuario, out-of-scope) |
| Fase 3 — TENANT: tickets-core | **21/18 COMPLETA** — 3.D.3 ✅ PR-08; 3.D.4 ✅ PR-09; 3.A.1/3.A.2/3.A.3 ✅ PR-10 Slice 1; 3.B.1/3.B.2 ✅ PR-10 Slice 2; 3.B.3/3.B.4 ✅ PR-10 Slice 3; 3.C.1/3.C.2/3.C.5/3.C.6 ✅ PR-11a; 3.C.3/3.C.4/3.C.7/3.C.8 ✅ PR-11b; 3.D.1/3.D.2 ✅ PR-11c; **3.E.1/3.E.2 ✅ PR-11d** |
| Fase 4 — TENANT: Compras | **3/14** — 4.A.1/4.A.2/4.A.3 ✅ PR-12a (dominio) |
| Fases 5-7 | 0 — desbloqueadas (Fase 3 COMPLETA) |

---

## PR-11d: Interface layer + TicketsModule — COMPLETADO

### Tareas completadas

| Tarea | Estado | Notas |
|-------|--------|-------|
| 3.E.1 | ✅ | 29 unit tests TDD (24 TicketsController + 5 OperacionesController) |
| 3.E.2 | ✅ | 5 endpoints + OperacionesController + DTOs + TicketsModule + AppModule |

### Archivos creados en PR-11d

```
backend/src/tickets/
├── application/use-cases/
│   ├── obtener-ticket.use-case.ts           — thin wrapper GET /tickets/:id (clean-arch)
│   └── listar-operaciones.use-case.ts       — thin wrapper GET /tickets/:id/operaciones
├── interface/
│   ├── dtos/tickets.dto.ts                  — plain interfaces (no class-validator)
│   └── controllers/
│       ├── tickets.controller.ts            — 5 endpoints, guard chain, error mapping
│       ├── tickets.controller.spec.ts       — 24 unit tests TDD
│       ├── operaciones.controller.ts        — GET /tickets/:id/operaciones
│       └── operaciones.controller.spec.ts   — 5 unit tests TDD
└── tickets.module.ts                        — wires 8 repos + checker + SM + numerador + 6 use cases
backend/src/app.module.ts                    — agrega TicketsModule
backend/package.json                         — @types/multer 2.1.0 (devDependency)
```

### Decisiones técnicas PR-11d

1. **ObtenerTicketUseCase + ListarOperacionesUseCase**: thin wrappers necesarios para respetar clean-arch — controller no puede importar domain ports directamente.

2. **@types/multer instalado explícitamente**: Express.Multer.File viene de `@types/multer` que NO es transitiva de `@nestjs/platform-express`. Sin ella, `tsc` falla con "Namespace 'global.Express' has no exported member 'Multer'".

3. **PATCH /tickets/:id/estado sin @RequirePermissions**: cualquier usuario autenticado en el tenant puede transicionar; la state machine enforces business rules de negocio. Solo ticket:asignar para POST /tickets/:id/asignar.

4. **JwtAuthGuard no re-declarado en TicketsModule**: AuthModule lo exporta; TicketsModule lo importa via `imports: [AuthModule]`.

5. **Guards RolesGuard/PermissionsGuard/TenantGuard declarados como providers**: necesitan ser resolvibles en el scope del módulo para que NestJS los instancie correctamente.

6. **bigint tamanoBytes serializado como `.toString()`**: JSON no soporta bigint nativamente. ArchivoResponseDto.tamanoBytes es string.

### Estado de verificaciones

| Check | Resultado |
|-------|-----------|
| `pnpm test` | **655 tests, 44 suites, todos verdes** (+29 nuevos unit tests) |
| `tsc --noEmit` | ✅ limpio |
| `pnpm lint` | ✅ limpio — fitness rule verde |
| Bootstrap DI | ✅ 655 tests incluyen app.module.spec.ts (NestJS resuelve todas las deps) |

### Commit

`0bd886e` en rama `feat/pr11d-tickets-interface`

---

---

## PR-12a: Compras — capa de dominio (4.A) — COMPLETADO

> Rama: `feat/pr12a-compras-domain`
> Última actualización: 2026-06-23

### Tareas completadas

| Tarea | Estado | Notas |
|-------|--------|-------|
| 4.A.1 | ✅ | 69 unit tests TDD RED→GREEN. 4 suites. Cubre todas las transiciones válidas/inválidas del ciclo COMPRAS + invariantes de entidades. |
| 4.A.2 | ✅ | 3 entidades + ComprasStateMachine + errors. Sin imports de Prisma ni NestJS. Fitness rule verde. |
| 4.A.3 | ✅ | 3 puertos con Symbol DI tokens. |

### Entidades implementadas

| Entidad | Archivo | Validación de dominio | Tests |
|---------|---------|----------------------|-------|
| `TicketCompraEntity` | `compras/domain/entities/ticket-compra.entity.ts` | campos de aprobación null inicialmente | 14 |
| `ItemCompraEntity` | `compras/domain/entities/item-compra.entity.ts` | `cantidad > 0` → Result<ItemCompra, CantidadInvalidaError> | 18 |
| `PresupuestoEntity` | `compras/domain/entities/presupuesto.entity.ts` | moneda ISO 4217 (ARS/USD/EUR) → Result<Presupuesto, MonedaInvalidaError>; seleccionado default false | 21 |

### ComprasStateMachine — transiciones implementadas

| Desde | Hacia | Resultado |
|-------|-------|-----------|
| ABIERTO | PENDIENTE_APROBACION | ✅ válido |
| ABIERTO | CANCELADO | ✅ válido |
| ABIERTO | EN_PROGRESO | ❌ BLOQUEADO (ciclo de aprobación obligatorio) |
| PENDIENTE_APROBACION | APROBADO | ✅ válido |
| PENDIENTE_APROBACION | RECHAZADO | ✅ válido |
| PENDIENTE_APROBACION | CANCELADO | ✅ válido |
| APROBADO | EN_PROGRESO | ✅ válido |
| RECHAZADO | CERRADO | ✅ válido |
| EN_PROGRESO | RESUELTO | ✅ válido |
| EN_PROGRESO | CANCELADO | ✅ válido |
| RESUELTO | CERRADO | ✅ válido |
| RESUELTO | EN_PROGRESO | ✅ válido (reapertura) |
| CERRADO | cualquiera | ❌ terminal |
| CANCELADO | cualquiera | ❌ terminal |

### Puertos implementados

| Puerto | Token DI | Métodos |
|--------|----------|---------|
| `ITicketCompraRepository` | `TICKET_COMPRA_REPOSITORY` | findByTicketId, findById, save, delete |
| `IItemCompraRepository` | `ITEM_COMPRA_REPOSITORY` | findById, findByTicketCompraId, findActiveByTicketCompraId, save, delete |
| `IPresupuestoRepository` | `PRESUPUESTO_REPOSITORY` | findById, findByTicketCompraId, findSelectedByTicketCompraId, save, delete |

### Estado de verificaciones

| Check | Resultado |
|-------|-----------|
| `pnpm test` | **732 tests, 49 suites, todos verdes** (+69 nuevos de 4.A) |
| `tsc --noEmit` | ✅ limpio |
| `pnpm lint` | ✅ fitness rule verde — cero imports de @prisma/client en compras/domain/ |
| Baseline antes de PR-12a | 663 tests, 45 suites |

### Archivos creados en PR-12a

```
backend/src/compras/domain/
├── errors/
│   └── compras.errors.ts                              — CantidadInvalidaError, MonedaInvalidaError
├── entities/
│   ├── ticket-compra.entity.ts + spec.ts              — 14 unit tests TDD
│   ├── item-compra.entity.ts + spec.ts                — 18 unit tests TDD
│   └── presupuesto.entity.ts + spec.ts                — 21 unit tests TDD
├── state-machine/
│   ├── compras-state-machine.ts                       — ComprasStateMachine (ITicketStateMachine)
│   └── compras-state-machine.spec.ts                  — 16 unit tests TDD (incl. factory integration)
└── ports/
    ├── i-ticket-compra.repository.ts                  — + TICKET_COMPRA_REPOSITORY token
    ├── i-item-compra.repository.ts                    — + ITEM_COMPRA_REPOSITORY token
    └── i-presupuesto.repository.ts                    — + PRESUPUESTO_REPOSITORY token
```

### Decisiones tomadas en PR-12a

1. **`ComprasStateMachine` es implementación standalone** (no extiende `BaseTicketStateMachine`): el patrón Strategy elegido en el design usa reemplazo completo, no herencia. La máquina de COMPRAS define su propio `VALID_TRANSITIONS_COMPRAS` Map que incluye los estados del ciclo de aprobación y excluye explícitamente `ABIERTO → EN_PROGRESO`.

2. **Registro en factory vía wiring NestJS** (ComprasModule — PR futuro): la factory tiene `register('COMPRAS', machine)` disponible. Los tests de 4.A.1 ya verifican la integración (`factory.register() + factory.resolve()`). El `onModuleInit` del ComprasModule llamará `factory.register('COMPRAS', new ComprasStateMachine())`.

3. **`TicketCompraEntity.create(ticketId)` en lugar de `create(props)`**: la API simplificada refleja que al crear un ticket_compra todos los campos de aprobación son null por invariante de dominio. El use case no necesita especificarlos.

4. **`ItemCompraEntity` con constructor `private`**: fuerza el uso de `create()` (con validación) o `reconstitute()` (sin validación). Mismo patrón que `ArchivoEntity` en tickets-core.

5. **`PresupuestoEntity` valida moneda en `create()`, no en `reconstitute()`**: los datos en DB se asume que fueron validados al insertar. `reconstitute()` es bypass para el mapper de infraestructura.

6. **Estados de COMPRAS YA en el seed (PR-09)**: PENDIENTE_APROBACION, APROBADO y RECHAZADO fueron sembrados en PR-09 (`c0...0002`, `c0...0003`, `c0...0004`). NO se requiere seed adicional en este PR ni en el sub-PR de infra (13a).

### Decisiones inferidas documentadas

| # | Decisión inferida | Resolución |
|---|-------------------|------------|
| D-1 | Estados PENDIENTE_APROBACION, APROBADO, RECHAZADO en seed | YA EN SEED (PR-09) — no requiere acción adicional |
| D-2 | `montoTotal >= 0` no validado en entidad | Spec dice CHECK >= 0 en DB. La entidad no valida (valor 0 puede ser válido para cotizaciones en blanco). La DB enforcea el constraint. |
| D-3 | `APROBADO → CANCELADO` no está en el spec COMPRAS | No incluido — la spec no lista esta transición. Si se necesita, requiere revisión de spec. |
| D-4 | Registro de ComprasStateMachine en factory | Wiring NestJS en ComprasModule (PR-12b o cuando se cree el módulo). Test de 4.A.1 ya verifica el mecanismo. |


