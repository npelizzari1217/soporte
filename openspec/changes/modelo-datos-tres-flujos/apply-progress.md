# Apply Progress — modelo-datos-tres-flujos

> Última actualización: 2026-06-22
> Rama activa: `feat/pr03-master-schema`
> PR actual: **PR-03** (completado)

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

## Estado global del cambio

| Fase | Progreso |
|------|---------|
| Fase 0 — Scaffolding + Shared | **16/16 tareas completadas** (PR-01: 0.A.1, 0.A.3, 0.B.1-0.B.6 / PR-02: 0.A.2, 0.C.1-0.C.7) |
| Fase 1 — MASTER: clientes | 1/15 — 1.C.3 ✅ PR-03; demás tareas desbloqueadas |
| Fase 2 — MASTER: auth+RBAC | 1/22 — 2.C.3 ✅ PR-03; demás tareas desbloqueadas |
| Fases 3-7 | 0 — bloqueadas por Fase 1/2 |
