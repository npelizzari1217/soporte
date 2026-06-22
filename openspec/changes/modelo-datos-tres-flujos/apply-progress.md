# Apply Progress — modelo-datos-tres-flujos

> Última actualización: 2026-06-22
> Rama activa: `feat/pr02-shared-infra-tenancy`
> PR actual: **PR-02** (completado)

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

## Pendiente para PR-03 (prisma_master DDL completo)

| Tarea | Descripción |
|-------|-------------|
| 1.C.3 | DDL completo en `prisma_master/schema.prisma`: modelos Cliente, CicloVigente, Usuario, RefreshToken, Role, Permiso, RolesPermisos, UsuariosRoles. Correr `migrate:master`. |
| 2.C.3 | Agregar modelos Auth al schema master. |
| 2.E.1 | Migration seed: roles, permisos, roles_permisos. |

---

## Estado global del cambio

| Fase | Progreso |
|------|---------|
| Fase 0 — Scaffolding + Shared | **16/16 tareas completadas** (PR-01: 0.A.1, 0.A.3, 0.B.1-0.B.6 / PR-02: 0.A.2, 0.C.1-0.C.7) |
| Fase 1 — MASTER: clientes | 0/15 — DESBLOQUEADA (Fase 0 completa) |
| Fase 2 — MASTER: auth+RBAC | 0/22 — DESBLOQUEADA (Fase 0 completa) |
| Fases 3-7 | 0 — bloqueadas por Fase 1/2 |
