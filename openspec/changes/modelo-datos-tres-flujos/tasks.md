# Tasks: modelo-datos-tres-flujos

> Cambio: **modelo-datos-tres-flujos** — Modelo de datos completo para los tres flujos (Soporte, Compras, Edilicia)
> Proyecto: **soporte** — Sistema de Gestión de Tickets
> Generado: 2026-06-22
> Estrategia de entrega: `ask-on-risk`
> TDD: **Strict** — toda tarea de implementación `.2` es bloqueada por su tarea de test `.1` (RED → GREEN)

---

## Convenciones de lectura

- **[S]** Secuencial — lista su dependencia entre paréntesis. No puede iniciarse hasta que esa tarea esté completa.
- **[P]** Paralela — puede correrse en paralelo con otras tareas del mismo nivel de dependencia.
- **TEST →** Tarea de test (fase RED). Escribe las specs/assertions que fallarán.
- **IMPL →** Tarea de implementación (fase GREEN). Hace pasar los tests sin tocar la firma de specs.
- Refs a spec se anotan como `[SPEC:módulo/req]`.

---

## Fase 0 — Scaffolding y Módulo Shared (FUNDACIÓN)

> Bloquea todo lo demás. Nada de Fase 1 en adelante puede iniciarse antes de que 0.C esté completa.

### 0.A — Bootstrap de proyecto

**[x] 0.A.1** [S] **SETUP:** Inicializar proyecto NestJS + TypeScript strict (`strict: true`, `noImplicitAny`, `strictNullChecks`) + Jest con paths alias (`@/`) + estructura de carpetas `backend/src/{módulo}/{domain,application,infrastructure,interface}`.
- Dependencia: ninguna
- Criterio de done: `npm run build` pasa; `npm test` corre sin tests (0 suites).
- **Completado PR-01:** pnpm, TypeScript 5.8 strict, Jest 30 + ts-jest, paths `@/*`, estructura hexagonal.

**[x] 0.A.2** [S, dep: 0.A.1] **SETUP:** Configurar dos generators de Prisma: `prisma_master/` (output: `node_modules/.prisma/master`) y `prisma_tenant/` (output: `node_modules/.prisma/tenant`). Scripts npm: `migrate:master`, `migrate:tenant`, `generate:master`, `generate:tenant`.
- **Completado PR-02:** Prisma 7.8.0 + adapter-pg. Schemas mínimos con placeholder models. `prisma generate` produce ambos clients. Scripts agregados a package.json.
- Ref spec: `[SPEC:design/multi-tenancy — generators separados]`

**[x] 0.A.3** [S, dep: 0.A.1] **SETUP:** ESLint custom rule / lint-staged check: prohibir importación de `PrismaService` (y cualquier símbolo de `@prisma/client` o `.prisma/`) fuera de directorios `infrastructure/`. Agregar al pipeline CI como `lint:fitness`.
- Ref spec: `[SPEC:design/ORM — fitness rule]`
- Criterio de done: un import de prueba en `application/` falla el lint con mensaje descriptivo.
- **Completado PR-01:** `no-restricted-imports` en eslint.config.js; override permite prisma en `**/infrastructure/**`.

### 0.B — shared/domain

**[x] 0.B.1** [P, dep: 0.A.1] **TEST →** Unit test de `BaseEntity`: verifica que al instanciar una entidad se propagan `id` (UUIDv7), `created_at`, `updated_at`, `deleted_at = null`; verifica que `softDelete()` setea `deleted_at`; verifica que IDs no son secuenciales entre instancias creadas en el mismo ms.
- Ref spec: `[SPEC:_shared-audit-pattern/Auditoría universal, Soft delete global, PK generado en backend]`
- **Completado PR-01:** 17 assertions; cubre UUIDv7 format, monotonic order, softDelete, isDeleted, reconstitution.

**[x] 0.B.2** [S, dep: 0.B.1] **IMPL →** `shared/domain/base-entity.ts`: clase abstracta `BaseEntity<T>` con campos `id: string` (UUIDv7 via lib `uuidv7`), `createdAt: Date`, `updatedAt: Date`, `deletedAt: Date | null`, método `softDelete()`, `isDeleted()`. Sin imports de Prisma ni NestJS.
- Ref spec: `[SPEC:_shared-audit-pattern]`
- **Completado PR-01:** implementado, todos los tests verdes.

**[x] 0.B.3** [P, dep: 0.A.1] **TEST →** Unit test de `Result<T,E>`: verifica `Result.ok(v).isOk() === true`, `Result.fail(e).isFail() === true`, propagación de error sin throw.
- Ref spec: `[SPEC:design/error-handling — Result<T,E>]`
- **Completado PR-01:** 16 assertions; cubre ok/fail/map/chain/getOrThrow.

**[x] 0.B.4** [S, dep: 0.B.3] **IMPL →** `shared/domain/result.ts`: tipo `Result<T, E>` con constructores `ok()`, `fail()`, método `getOrThrow()`. Sin dependencias externas.
- **Completado PR-01:** implementado con map(), DomainError base, todos los tests verdes.

**[x] 0.B.5** [P, dep: 0.A.1] **TEST →** Unit test del puerto `IFileStorage`: verifica que la interfaz define `upload(key, buffer, mime): Promise<string>` y `delete(key): Promise<void>`; test con spy que el caso de uso no depende de la implementación concreta.
- Ref spec: `[SPEC:tickets-core/Adjuntos vía IFileStorage]`
- **Completado PR-01:** 5 assertions; spy verifica independencia de implementación concreta.

**[x] 0.B.6** [S, dep: 0.B.5] **IMPL →** `shared/domain/ports/i-file-storage.ts`: interfaz `IFileStorage`. `shared/infrastructure/storage/local-file-storage.ts`: implementación local para dev/test que guarda en disco.
- **Completado PR-01:** interface + FILE_STORAGE token + LocalFileStorage implementado.

### 0.C — shared/infrastructure + tenancy

**[x] 0.C.1** [P, dep: 0.A.2] **TEST →** Unit test de `TenantContext`: verifica que `TenantContext.set(ctx)` + `TenantContext.get()` funcionan dentro del mismo `AsyncLocalStorage` scope; verifica que fuera del scope `get()` retorna `undefined`.
- Ref spec: `[SPEC:design/multi-tenancy — TenantContext AsyncLocalStorage]`
- **Completado PR-02:** 6 tests verdes (scope, isolation, leak, getClient, throw outside scope).

**[x] 0.C.2** [S, dep: 0.C.1] **IMPL →** `shared/tenancy/tenant-context.ts`: wrapper de `AsyncLocalStorage` que almacena `{ prismaClient, dbName, clienteId }`. Método `run(ctx, fn)` y `get(): TenantContextData | undefined`.
- **Completado PR-02:** implementado con `getClient()` que lanza si no hay contexto activo.

**[x] 0.C.3** [P, dep: 0.A.2] **TEST →** Unit test de `PrismaService` factory: mock de `PrismaClient`; verifica que `getMasterClient()` retorna el singleton master; verifica que `getTenantClient(dbName)` retorna cliente cacheado en segunda llamada; verifica que un `dbName` nuevo inicializa un cliente nuevo.
- Ref spec: `[SPEC:design/multi-tenancy — factory multi-tenant]`
- **Completado PR-02:** 9 tests verdes (singleton, cache, distintos clients, buildTenantUrl, onModuleDestroy).

**[x] 0.C.4** [S, dep: 0.C.3] **IMPL →** `shared/infrastructure/persistence/prisma.service.ts`: `PrismaService` con `MasterPrismaClient` fijo + `Map<string, TenantPrismaClient>` con lazy init. Método `buildTenantUrl(dbName)`.
- Nota: este es el ÚNICO lugar donde vive `PrismaService`; el fitness rule (0.A.3) lo protege.
- **Completado PR-02:** Prisma 7 usa adapter-pg (Pool + PrismaPg). `prisma-clients.ts` en `infrastructure/` respeta la fitness rule.

**[x] 0.C.5** [P, dep: 0.C.2, 0.C.4] **TEST →** Unit test de `TenantTransactionRunner`: verifica que el runner ejecuta el callback dentro de `client.$transaction`, que re-bindea `TenantContext` con el cliente transaccional, y que un error en el callback hace rollback.
- Ref spec: `[SPEC:design/multi-tenancy — TenantTransactionRunner]`
- **Completado PR-02:** 5 tests verdes (execute, re-bind tx, error propagation, throw outside ctx, preserve dbName/clienteId).

**[x] 0.C.6** [S, dep: 0.C.5] **IMPL →** `shared/infrastructure/persistence/tenant-transaction-runner.ts`: implementa puerto `ITenantTransactionRunner`. Abre `client.$transaction(tx => ...)` y re-bindea `TenantContext` con el `tx`.
- **Completado PR-02:** implementado con `TENANT_TRANSACTION_RUNNER` Symbol token + `ITenantTransactionRunner` interface.

**[x] 0.C.7** [S, dep: 0.C.4, 0.C.6, 0.B.6] **SETUP:** Wiring NestJS: `SharedModule` (global) exporta `PrismaService`, `TenantContext`, `TenantTransactionRunner`, `IFileStorage → LocalFileStorage`. Tokens DI: `PRISMA_SERVICE`, `FILE_STORAGE`, `TENANT_TRANSACTION_RUNNER`.
- **Completado PR-02:** `SharedModule` @Global creado; importado en `AppModule`. URL master desde `process.env.DATABASE_URL_MASTER`.

---

## Fase 1 — MASTER: clientes + tenancy

> Prerequisito: Fase 0 completa. Puede iniciarse en paralelo con Fase 2 en ramas distintas.

### 1.A — Dominio + Puertos

**1.A.1** [P, dep: 0.C.7] **TEST →** Unit tests de entidades de dominio: `Cliente` (constructor, `suspend()`, `reactivate()`, validación de `dbName` único); `CicloVigente` (validación `fecha_fin > fecha_inicio`).
- Ref spec: `[SPEC:clientes/clientes, ciclos_vigentes]`

**1.A.2** [S, dep: 1.A.1] **IMPL →** `clientes/domain/entities/cliente.entity.ts` y `ciclo-vigente.entity.ts` extendiendo `BaseEntity`. Sin imports de Prisma.

**1.A.3** [S, dep: 1.A.2] **IMPL →** `clientes/domain/ports/i-cliente.repository.ts`, `i-ciclo-vigente.repository.ts`: interfaces con métodos `findById`, `findByDbName`, `findAll`, `save`, `delete`.

### 1.B — Application

**1.B.1** [P, dep: 1.A.3] **TEST →** Test de `RegistrarClienteUseCase` (versión básica sin provisioning — el provisioning completo va en Fase 7): mocks de `IClienteRepository`; verifica que no crea cliente si `db_name` ya existe (HTTP 409 via Result.fail); verifica que genera UUIDv7 antes del save.
- Ref spec: `[SPEC:clientes/Identificación única del tenant por db_name]`

**1.B.2** [S, dep: 1.B.1] **IMPL →** `clientes/application/use-cases/registrar-cliente.use-case.ts`: valida unicidad de `db_name`, crea entidad, persiste. Retorna `Result<Cliente, ConflictError>`.

**1.B.3** [P, dep: 1.A.3] **TEST →** Test de `SuspenderClienteUseCase`: verifica que setea `activo = false` + `deleted_at` en soft delete; verifica que no dropea la DB tenant.
- Ref spec: `[SPEC:clientes/Suspensión de tenant, Soft delete de clientes]`

**1.B.4** [S, dep: 1.B.3] **IMPL →** `clientes/application/use-cases/suspender-cliente.use-case.ts` y `reactivar-cliente.use-case.ts`.

**1.B.5** [P, dep: 1.A.3] **TEST →** Test de `CrearCicloVigenteUseCase`: verifica rechazo con HTTP 422 cuando hay solapamiento de fechas con un ciclo activo; verifica que ciclos soft-deleted no cuentan en la validación.
- Ref spec: `[SPEC:clientes/Ciclos vigentes sin solapamiento]`

**1.B.6** [S, dep: 1.B.5] **IMPL →** `clientes/application/use-cases/crear-ciclo-vigente.use-case.ts`: valida solapamiento consultando repo, crea y persiste.

### 1.C — Infrastructure + Schema MASTER (parcial)

**1.C.1** [P, dep: 1.A.3] **TEST →** Integration test de `PrismaClienteRepository`: test sobre DB de test (Postgres real o via testcontainers); verifica `findByDbName`, `save`, soft delete. Test `PrismaCicloVigenteRepository`: verifica save + findActive.
- Ref spec: `[SPEC:clientes/db_name único, ciclos_vigentes]`

**1.C.2** [S, dep: 1.C.1, 0.C.4] **IMPL →** `clientes/infrastructure/persistence/prisma/prisma-cliente.repository.ts` + `cliente.mapper.ts` (PrismaCliente ↔ ClienteEntity). `prisma-ciclo-vigente.repository.ts` + mapper.

**1.C.3** [P, dep: 0.A.2] **SCHEMA:** `prisma_master/schema.prisma` — modelos `Cliente` y `CicloVigente` con todos los campos del spec (columnas, índices, CHECK constraints). Generar y correr `migrate:master` inicial.
- Ref spec: `[SPEC:clientes/Tabla clientes, Tabla ciclos_vigentes]`

### 1.D — Interface

**1.D.1** [P, dep: 1.B.2, 1.B.4, 1.C.2] **TEST →** Unit test de `ClientesController`: mock de use cases; verifica status codes (201, 409, 404, 204) y shape de respuesta.
- Ref spec: `[SPEC:clientes/requirements]`

**1.D.2** [S, dep: 1.D.1] **IMPL →** `clientes/interface/controllers/clientes.controller.ts` + `ciclos-vigentes.controller.ts` + DTOs (`CreateClienteDto`, `CreateCicloVigenteDto`, responses). Wiring del módulo NestJS `ClientesModule` con tokens DI.

---

## Fase 2 — MASTER: Auth + RBAC

> Prerequisito: Fase 0 completa. Paralela con Fase 1.

### 2.A — Dominio + Puertos

**2.A.1** [P, dep: 0.C.7] **TEST →** Unit tests de entidades: `Usuario` (constructor, `suspend()`, `hashPassword()` delegación al hash provider, `verifyPassword()`); `RefreshToken` (isExpired, isRevoked, revoke()); `Role` (addPermiso); `Permiso` (código `recurso:accion`).
- Ref spec: `[SPEC:auth-rbac/Tabla usuarios, refresh_tokens, roles, permisos]`

**2.A.2** [S, dep: 2.A.1] **IMPL →** Entidades de dominio en `auth/domain/entities/`: `usuario.entity.ts`, `refresh-token.entity.ts`, `role.entity.ts`, `permiso.entity.ts`. Sin imports de Prisma ni Nest.

**2.A.3** [S, dep: 2.A.2] **IMPL →** Puertos en `auth/domain/ports/`: `i-usuario.repository.ts` (findByEmail, findById, findByClienteId, save), `i-refresh-token.repository.ts` (findByHash, revokeAllByUsuarioId, save), `i-role.repository.ts` (findByCodigo, findWithPermisos), `i-hash.provider.ts` (hash, verify), `i-token.service.ts` (signJwt, verifyJwt).

### 2.B — Application use cases

**2.B.1** [P, dep: 2.A.3] **TEST →** Test de `LoginUseCase`: verifica hash argon2id (sin texto plano en respuesta); verifica JWT payload `{ sub, cliente_id, email, roles, permisos }`; verifica que usuario inactivo → 401; verifica que cliente inactivo → 403; verifica almacenamiento de `token_hash` (SHA-256) en refresh_tokens.
- Ref spec: `[SPEC:auth-rbac/Autenticación con contraseña segura, Login exitoso genera JWT]`

**2.B.2** [S, dep: 2.B.1] **IMPL →** `auth/application/use-cases/login.use-case.ts`: valida usuario activo + cliente activo, verifica hash, calcula permisos efectivos (unión de roles, sin duplicados), firma JWT, crea refresh token.

**2.B.3** [P, dep: 2.A.3] **TEST →** Test de `RefreshTokenUseCase`: verifica rotación (revoca anterior, emite nuevo); verifica rechazo si `expires_at < now()`; verifica rechazo si `revoked_at IS NOT NULL`.
- Ref spec: `[SPEC:auth-rbac/Renovación y revocación de refresh tokens]`

**2.B.4** [S, dep: 2.B.3] **IMPL →** `auth/application/use-cases/refresh-token.use-case.ts`.

**2.B.5** [P, dep: 2.A.3] **TEST →** Test de `RevocarTokenUseCase` (individual) y `RevocarTodosTokensUsuarioUseCase` (bulk): verifica que setea `revoked_at`; test bulk verifica que todos los tokens del usuario quedan revocados.
- Ref spec: `[SPEC:auth-rbac/Revocación de refresh token individual, Revocación masiva]`

**2.B.6** [S, dep: 2.B.5] **IMPL →** `auth/application/use-cases/revocar-token.use-case.ts` + `revocar-todos-tokens.use-case.ts`.

**2.B.7** [P, dep: 2.A.3] **TEST →** Test de `AsignarRolUseCase`: verifica que agrega fila en `usuarios_roles`; verifica que no duplica si ya existe. Test de `BajaUsuarioUseCase`: verifica `activo = false` + `deleted_at` + revocación masiva de tokens en la misma operación.
- Ref spec: `[SPEC:auth-rbac/Soft delete en usuarios]`

**2.B.8** [S, dep: 2.B.7] **IMPL →** `auth/application/use-cases/asignar-rol.use-case.ts` + `baja-usuario.use-case.ts`.

### 2.C — Infrastructure

**2.C.1** [P, dep: 2.A.3] **TEST →** Integration test de `PrismaUsuarioRepository`: verifica findByEmail, findById, save con UUIDv7, soft delete. Test de `PrismaRefreshTokenRepository`: verifica findByHash, revokeAll.
- Ref spec: `[SPEC:auth-rbac/requirements]`

**2.C.2** [S, dep: 2.C.1, 0.C.4] **IMPL →** `auth/infrastructure/persistence/prisma/`: `prisma-usuario.repository.ts` + `usuario.mapper.ts`, `prisma-refresh-token.repository.ts` + mapper, `prisma-role.repository.ts` + mapper. `Argon2HashProvider` (adapts `argon2` lib). `JwtTokenService` (adapts `@nestjs/jwt`).

**2.C.3** [P, dep: 1.C.3] **SCHEMA:** `prisma_master/schema.prisma` — agregar modelos `Usuario`, `RefreshToken`, `Role`, `Permiso`, `RolesPermisos`, `UsuariosRoles` con todos los campos, FK, índices. Correr migration `migrate:master`.
- Ref spec: `[SPEC:auth-rbac/Tablas MASTER]`

### 2.D — Guards + Interface

**2.D.1** [P, dep: 2.B.2] **TEST →** Test de `JwtAuthGuard`: verifica rechazo (401) sin Bearer token; verifica que hidrata `request.user`. Test de `RolesGuard`: verifica que rechaza (403) cuando el claim `roles` del JWT no incluye el rol requerido. Test de `PermissionsGuard`: verifica check de `permisos` claim. Test de `TenantGuard`: verifica que resuelve `db_name` desde `master.clientes`, verifica rechazo si `activo = false`.
- Ref spec: `[SPEC:auth-rbac/Guards encadenados en NestJS]`; `[SPEC:clientes/Tenant inactivo mid-sesión]`

**2.D.2** [S, dep: 2.D.1, 2.C.2] **IMPL →** `auth/infrastructure/guards/`: `jwt-auth.guard.ts`, `roles.guard.ts`, `permissions.guard.ts`, `tenant.guard.ts`. Decoradores: `@Roles(...)`, `@RequirePermissions(...)`, `@CurrentUser()`. `JwtStrategy` con `passport-jwt`.

**2.D.3** [P, dep: 2.B.2, 2.B.4, 2.B.6, 2.C.2] **TEST →** Test de `AuthController` y `UsuariosController`: mock use cases; verifica shape de respuestas y status codes.
- Ref spec: `[SPEC:auth-rbac/requirements]`

**2.D.4** [S, dep: 2.D.3, 2.D.2] **IMPL →** `auth/interface/controllers/auth.controller.ts` (POST /auth/login, POST /auth/refresh, POST /auth/logout) + `usuarios.controller.ts` + `roles.controller.ts` + DTOs. Wiring `AuthModule` con todos los tokens DI.

### 2.E — MASTER migration seed

**2.E.1** [S, dep: 2.C.3] **SEED:** Migration de datos maestros (idempotente, `ON CONFLICT DO NOTHING`): `roles` (ADMIN, SOPORTE_IT, MANTENIMIENTO, APROBADOR_COMPRAS, SOLICITANTE) + `permisos` (11 permisos del spec) + `roles_permisos` (mapeo base: ADMIN → todos los permisos; tablas de asignación por rol).
- Ref spec: `[SPEC:auth-rbac/Seeds iniciales en migración master]`

---

## Fase 3 — TENANT: Tickets Core

> Prerequisito: Fase 0 completa + Fase 2.D.2 (guards disponibles para aplicar en controllers). Las Fases 1 y 3 pueden solapar si los guards ya están disponibles.

### 3.A — Dominio: entidades base del ticket

**[x] 3.A.1** [P, dep: 0.C.7] **TEST →** Unit tests de entidades de dominio del tenant: `Ticket` (constructor con estado inicial `ABIERTO`, `assignTo()`, `canTransitionTo()`); `OperacionTicket` (inmutabilidad del registro); `Archivo` (validación de tamano_bytes > 0); `CicloCliente` (soft ref sin FK).
- Ref spec: `[SPEC:tickets-core/Tabla tickets, operaciones_ticket, archivos, ciclos_cliente]`
- **Completado PR-10 Slice 1:** 47 unit tests TDD GREEN. 4 suites. Cubre constructor, assignTo, canTransitionTo, inmutabilidad, Result.fail en tamano_bytes, soft ref sin FK.

**[x] 3.A.2** [S, dep: 3.A.1] **IMPL →** Entidades en `tickets/domain/entities/`: `ticket.entity.ts`, `operacion-ticket.entity.ts`, `archivo.entity.ts`, `ciclo-cliente.entity.ts`, `estado.entity.ts`, `prioridad.entity.ts`. Todas extienden `BaseEntity`. Sin Prisma.
- **Completado PR-10 Slice 1:** 6 entidades implementadas. Sin imports de Prisma ni NestJS. Fitness rule verde.

**[x] 3.A.3** [S, dep: 3.A.2] **IMPL →** Puertos en `tickets/domain/ports/`: `i-ticket.repository.ts`, `i-operacion-ticket.repository.ts`, `i-archivo.repository.ts`, `i-ciclo-cliente.repository.ts`, `i-estado.repository.ts`, `i-usuario-tipos-ticket.repository.ts`.
- **Completado PR-10 Slice 1:** 6 puertos con Symbol DI tokens.

### 3.B — Dominio: máquina de estados + numerador

**[x] 3.B.1** [P, dep: 3.A.2] **TEST →** Test de `BaseTicketStateMachine`: verifica todas las transiciones válidas e inválidas del diagrama base (ABIERTO→EN_PROGRESO OK; CERRADO→EN_PROGRESO rechazado; estados terminales). Verifica que `puedeTransicionar()` es pure function.
- Ref spec: `[SPEC:tickets-core/Máquina de estados base, Transición inválida rechazada]`
- **Completado PR-10 Slice 2:** 32 unit tests TDD (RED → GREEN). 2 describe blocks (BaseTicketStateMachine + TicketStateMachineFactory). Cubre 6 válidas, 8 terminales, 8 inválidas, 4 pureza de función, 6 factory.

**[x] 3.B.2** [S, dep: 3.B.1] **IMPL →** `tickets/domain/state-machine/`: `i-ticket-state-machine.ts` (interface `puedeTransicionar(desde, hacia, ctx): boolean`), `base-ticket-state-machine.ts`, `ticket-state-machine.factory.ts` (Strategy: elige implementación según `tipos_ticket.codigo`).
- **Completado PR-10 Slice 2:** 3 archivos en `tickets/domain/state-machine/`. Sin imports de Prisma ni NestJS. Función pura, singleton-safe.

**[x] 3.B.3** [P, dep: 3.A.2] **TEST →** Test de `NumeradorTicket`: verifica que genera `SOP-2026-00042` dado prefijo `SOP`, año `2026`, y last sequence `41`; verifica formato de los tres flujos; verifica que la secuencia es local (no global).
- Ref spec: `[SPEC:tickets-core/Numeración legible de tickets]`
- **Completado PR-10 Slice 3:** 14 unit tests TDD (RED → GREEN). Suite: numerador-ticket.service.spec.ts. Cubre: SOP/COM/EDI prefijos, padding 5 dígitos, localidad de secuencia (findLastSecuencia llamado con tipoId+anio), secuencias independientes por tipo, reset por año, error en codigo desconocido.

**[x] 3.B.4** [S, dep: 3.B.3] **IMPL →** `tickets/domain/services/numerador-ticket.service.ts`: genera `{PREFIJO}-{AÑO}-{SECUENCIA_5_DIGITS}`. Consulta last number por tipo via repositorio.
- **Completado PR-10 Slice 3:** `NumeradorTicket` class + `PREFIJO_POR_CODIGO` const exportada. `generarNumero(tipoId, tipoCodigo, anio)` async. `generarFormato(prefijo, anio, secuencia)` static puro. Depende solo de `Pick<ITicketRepository, 'findLastSecuencia'>`. Sin Prisma ni NestJS.

### 3.C — Application use cases

**[x] 3.C.1** [P, dep: 3.A.3, 3.B.2, 3.B.4] **TEST →** Test de `CrearTicketUseCase`: verifica validación cross-DB (solicitante_id existe en master y pertenece al tenant); verifica estado inicial `ABIERTO`; verifica número generado; verifica que crea `operaciones_ticket` CAMBIO_ESTADO (`anterior=NULL`, `nuevo=ABIERTO`) en la misma transacción; verifica que si `tipo=COMPRAS` delega a `CrearTicketCompraUseCase` (o rechaza — ver Fase 4).
- Ref spec: `[SPEC:tickets-core/Validación soft refs, Estado inicial ABIERTO, Transición válida registra operacion]`
- **Completado PR-11a:** 24 unit tests TDD RED→GREEN. Cubre: validación cross-DB, estado ABIERTO, número generado, operacion CAMBIO_ESTADO (anterior=null, nuevo=ABIERTO), transacción atómica, happy path UUIDv7.

**[x] 3.C.2** [S, dep: 3.C.1] **IMPL →** `tickets/application/use-cases/crear-ticket.use-case.ts`: genera UUIDv7, valida soft ref al master de `solicitante_id`, genera número, persiste ticket + operacion dentro de `TenantTransactionRunner`.
- **Completado PR-11a:** Implementado. Nuevos puertos: `IUsuarioMasterChecker`, `ITipoTicketRepository`, `ITipoOperacionRepository`. Nuevos errores: `SolicitanteInvalidoError`, `EstadoCatalogoNoEncontradoError`, `TipoTicketNoEncontradoError`, `TipoOperacionNoEncontradoError`.

**[x] 3.C.3** [P, dep: 3.A.3, 3.B.2] **TEST →** Test de `AsignarTicketUseCase`: verifica existencia de `asignado_id` en master; verifica que el usuario tiene `usuario_tipos_ticket` para el tipo del ticket (elegibilidad); verifica rechazo HTTP 422 sin elegibilidad.
- Ref spec: `[SPEC:tickets-core/Asignado debe ser elegible, Elegibilidad separada de permisos]`
- **Completado PR-11b:** 19 unit tests TDD RED→GREEN. Cubre: ticket not found, estaActivoEnTenant (activo=TRUE distinto de existeEnTenant), AsignadoInvalidoError, isUserEligibleForType, AsignadoNoElegibleError, tipo_operacion ASIGNACION, ticket.assignTo(), transacción atómica.

**[x] 3.C.4** [S, dep: 3.C.3] **IMPL →** `tickets/application/use-cases/asignar-ticket.use-case.ts`: valida cross-DB + elegibilidad, actualiza `asignado_id`, registra operacion `ASIGNACION`.
- **Completado PR-11b:** Implementado. Nuevos errores: AsignadoInvalidoError, AsignadoNoElegibleError. Nuevo método IUsuarioMasterChecker.estaActivoEnTenant (activo=TRUE).

**[x] 3.C.5** [P, dep: 3.A.3, 3.B.2] **TEST →** Test de `TransicionarEstadoUseCase`: verifica que routea al state machine correcto via factory; verifica transición válida → actualiza `estado_id` + crea `operaciones_ticket` en misma tx; verifica transición inválida → HTTP 422 sin modificar estado.
- Ref spec: `[SPEC:tickets-core/Transición inválida rechazada, Transición válida registra operacion]`
- **Completado PR-11a:** 27 unit tests TDD RED→GREEN. Cubre: ticket not found, estado resolution, invariante entidad (soft-deleted), routing factory, transición inválida (no modifica estado, no crea operacion, no llama txRunner), transición válida (actualiza estadoId, crea operacion con anterior/nuevo, persiste en tx atómica).

**[x] 3.C.6** [S, dep: 3.C.5] **IMPL →** `tickets/application/use-cases/transicionar-estado.use-case.ts`: carga state machine via factory, evalúa `puedeTransicionar()`, ejecuta dentro de `TenantTransactionRunner`.
- **Completado PR-11a:** Implementado. Doble validación: canTransitionTo() (invariantes entidad) + machine.puedeTransicionar() (reglas de tipo). StateMachineContext pasa `{}` — decisión inferida para Fase 5 (porcentajeAvance edilicio).

**[x] 3.C.7** [P, dep: 3.A.3] **TEST →** Test de `AdjuntarArchivoUseCase`: verifica upload a `IFileStorage` antes del INSERT; verifica que solo persiste metadata en `archivos`; verifica creación de fila en `archivos_ticket`; verifica que soft delete de adjunto NO espera a storage cleanup.
- Ref spec: `[SPEC:tickets-core/Upload adjunto guarda solo metadata, Borrado de adjunto]`
- **Completado PR-11b:** 19 unit tests TDD RED→GREEN. Cubre: ticket not found, upload antes de DB save, storageKey desde upload, ArchivoTamanoCeroError (validación temprana), NO llama IFileStorage.delete si DB falla (fire-and-forget), linkToTicket con archivoId+ticketId, transacción atómica, upload fuera de tx.

**[x] 3.C.8** [S, dep: 3.C.7] **IMPL →** `tickets/application/use-cases/adjuntar-archivo.use-case.ts`: llama `IFileStorage.upload()`, crea entidad `Archivo`, persiste metadata + join.
- **Completado PR-11b:** Implementado. Pre-genera UUIDv7 para usar en storage key y entity id. IArchivoRepository.linkToTicket nuevo método para archivos_ticket join.

### 3.D — Infrastructure + Schema TENANT

**[x] 3.D.1** [P, dep: 3.A.3] **TEST →** Integration test de `PrismaTicketRepository`: sobre DB tenant de test; verifica `save` con UUIDv7, `findById`, `findByNumero`, soft delete; verifica que `PrismaService` no se llama directamente (usa TenantContext).
- Ref spec: `[SPEC:tickets-core/requirements]`; `[SPEC:_shared-audit-pattern/Soft delete]`
- **Completado PR-11c:** 38 integration tests TDD GREEN. Suite: `prisma-tickets.integration.spec.ts`. Cubre los 7 repos tenant + UsuarioMasterChecker. Patrón `withTenant<T>(fn)` para simular TenantContext sin NestJS DI.

**[x] 3.D.2** [S, dep: 3.D.1, 0.C.4] **IMPL →** `tickets/infrastructure/persistence/prisma/`: `prisma-ticket.repository.ts` + `ticket.mapper.ts`, `prisma-operacion-ticket.repository.ts` + mapper, `prisma-archivo.repository.ts` + mapper, `prisma-estado.repository.ts`, `prisma-usuario-tipos-ticket.repository.ts`. Todos obtienen client via `TenantContext`.
- **Completado PR-11c:** 9 archivos implementados (5 repos + 4 mappers + UsuarioMasterChecker). PrismaTipoTicketRepository + PrismaTipoOperacionRepository también incluidos. Fitness rule verde.

**[x] 3.D.3** [P, dep: 0.A.2] **SCHEMA:** `prisma_tenant/schema.prisma` — modelos: `Estado`, `Prioridad`, `TipoTicket`, `TipoOperacion`, `CicloCliente`, `Ticket`, `OperacionTicket`, `Archivo`, `ArchivoTicket`, `ArchivoOperacion`, `UsuarioTiposTicket`. Con todos los campos, FK, índices, CHECK constraints del spec.
- Ref spec: `[SPEC:tickets-core/Tablas TENANT]`
- **Completado PR-08:** 11 modelos + migration 20260623120000_init_tenant_schema aplicada. 18 integration tests TDD GREEN.

**[x] 3.D.4** [S, dep: 3.D.3] **SEED:** `prisma_tenant/seeds/tenant-seed.ts` — idempotente (`ON CONFLICT (codigo) DO NOTHING`): `estados` (8 valores), `prioridades` (4 valores), `tipos_ticket` (SOPORTE, COMPRAS, EDILICIA), `tipo_operacion` (5 valores).
- Ref spec: `[SPEC:tickets-core/Seeds de catálogos en provisioning, Seed idempotente]`
- **Completado PR-09:** seed idempotente + script `seed:tenant` en package.json. 11 integration tests TDD GREEN.

### 3.E — Interface

**3.E.1** [P, dep: 3.C.2, 3.C.4, 3.C.6, 3.C.8, 3.D.2] **TEST →** Unit test de `TicketsController`: mock use cases; verifica guard chain (JWT → Roles/Permissions → Tenant); verifica status codes; verifica que `@CurrentUser()` inyecta usuario del JWT correctamente.
- Ref spec: `[SPEC:tickets-core/TenantContext activo]`; `[SPEC:auth-rbac/Guards]`

**3.E.2** [S, dep: 3.E.1] **IMPL →** `tickets/interface/controllers/tickets.controller.ts` (POST /tickets, GET /tickets/:id, PATCH /tickets/:id/estado, POST /tickets/:id/asignar, POST /tickets/:id/adjuntos) + `OperacionesController` (GET /tickets/:id/operaciones) + DTOs. Wiring `TicketsModule`.

---

## Fase 4 — TENANT: Compras

> Prerequisito: Fase 3 completa. Puede correrse en paralelo con Fases 5 y 6 en ramas distintas.

### 4.A — Dominio

**4.A.1** [P, dep: 3.A.3] **TEST →** Unit tests de entidades: `TicketCompra` (campos de aprobación inicialmente null); `ItemCompra` (cantidad > 0); `Presupuesto` (moneda ISO, seleccionado default false). Test de `ComprasStateMachine`: verifica bloqueo de ABIERTO→EN_PROGRESO; verifica ABIERTO→PENDIENTE_APROBACION; verifica PENDIENTE_APROBACION→APROBADO/RECHAZADO; verifica RECHAZADO→CERRADO automático.
- Ref spec: `[SPEC:compras/Máquina de estados COMPRAS, Ciclo de aprobación]`

**4.A.2** [S, dep: 4.A.1] **IMPL →** `compras/domain/entities/`: `ticket-compra.entity.ts`, `item-compra.entity.ts`, `presupuesto.entity.ts`. `compras/domain/state-machine/compras-state-machine.ts` registrado en `TicketStateMachineFactory` para `codigo = 'COMPRAS'`.

**4.A.3** [S, dep: 4.A.2] **IMPL →** Puertos: `i-ticket-compra.repository.ts`, `i-item-compra.repository.ts`, `i-presupuesto.repository.ts`.

### 4.B — Application

**4.B.1** [P, dep: 4.A.3, 3.B.2] **TEST →** Test de `CrearTicketCompraUseCase`: verifica creación atómica (`tickets` + `ticket_compra` en misma tx); verifica que ticket SOPORTE no genera `ticket_compra`; verifica rollback si algún INSERT falla.
- Ref spec: `[SPEC:compras/Satélite obligatorio, Creación atómica]`

**4.B.2** [S, dep: 4.B.1] **IMPL →** `compras/application/use-cases/crear-ticket-compra.use-case.ts`: extiende `CrearTicketUseCase`, inserta también `ticket_compra` en la misma transacción.

**4.B.3** [P, dep: 4.A.3] **TEST →** Test de `EnviarAAprobacionUseCase`: verifica que requiere al menos 1 ítem activo (no soft-deleted); verifica transición ABIERTO→PENDIENTE_APROBACION con `operaciones_ticket`.
- Ref spec: `[SPEC:compras/Gestión de ítems, Envío a aprobación]`

**4.B.4** [S, dep: 4.B.3] **IMPL →** `compras/application/use-cases/enviar-a-aprobacion.use-case.ts`.

**4.B.5** [P, dep: 4.A.3] **TEST →** Test de `AprobarCompraUseCase`: verifica gate `compra:aprobar` en permiso (o usa mock del guard); verifica seteo de `aprobado_por_id`, `aprobado_en`; verifica transición a `APROBADO` + operacion en misma tx. Test de `RechazarCompraUseCase`: verifica que `motivo_rechazo` es requerido; verifica doble transición RECHAZADO → CERRADO en misma tx con dos `operaciones_ticket`.
- Ref spec: `[SPEC:compras/Gate de aprobación, Aprobación exitosa, Rechazo requiere motivo, Ticket rechazado→CERRADO]`

**4.B.6** [S, dep: 4.B.5] **IMPL →** `compras/application/use-cases/aprobar-compra.use-case.ts` + `rechazar-compra.use-case.ts`.

**4.B.7** [P, dep: 4.A.3] **TEST →** Test de `SeleccionarPresupuestoUseCase`: verifica swap atómico (set anterior FALSE + nuevo TRUE en misma tx); verifica que no pueden coexistir dos con `seleccionado = TRUE`.
- Ref spec: `[SPEC:compras/Selección única de presupuesto]`

**4.B.8** [S, dep: 4.B.7] **IMPL →** `compras/application/use-cases/seleccionar-presupuesto.use-case.ts`.

### 4.C — Infrastructure + Schema

**4.C.1** [P, dep: 4.A.3] **TEST →** Integration test de `PrismaTicketCompraRepository`: verifica relación 1:1 con ticket; verifica update de `aprobado_por_id`. Test de `PrismaPresupuestoRepository`: verifica swap de `seleccionado`.
- Ref spec: `[SPEC:compras/requirements]`

**4.C.2** [S, dep: 4.C.1, 0.C.4] **IMPL →** `compras/infrastructure/persistence/prisma/`: repos + mappers para `ticket_compra`, `items_compra`, `presupuestos`, `archivos_presupuesto`.

**4.C.3** [P, dep: 3.D.3] **SCHEMA:** `prisma_tenant/schema.prisma` — agregar modelos `TicketCompra`, `ItemCompra`, `Presupuesto`, `ArchivoPresupuesto`. Correr migration tenant.
- Ref spec: `[SPEC:compras/Tablas TENANT]`

### 4.D — Interface

**4.D.1** [P, dep: 4.B.2, 4.B.4, 4.B.6, 4.B.8, 4.C.2] **TEST →** Unit test de `ComprasController` e `ItemsCompraController`: mock use cases; verifica que `@RequirePermissions('compra:aprobar')` en endpoints de aprobación.
- Ref spec: `[SPEC:compras/Gate de aprobación con permiso]`

**4.D.2** [S, dep: 4.D.1] **IMPL →** `compras/interface/controllers/`: `compras.controller.ts`, `items-compra.controller.ts`, `presupuestos.controller.ts` + DTOs. Wiring `ComprasModule`.

---

## Fase 5 — TENANT: Reparaciones (Edilicia)

> Prerequisito: Fase 3 completa. Paralela con Fases 4 y 6.

### 5.A — Dominio

**5.A.1** [P, dep: 3.A.3] **TEST →** Unit tests: `Ubicacion` (tree self-ref, `padre_id` nullable); `TicketEdilicia` (porcentaje_avance initial 0.00, CHECK 0-100); `SubtareaEdilicia` (completada default false, `completar()` setea `completada_en` + `completada_por_id`). Test de `AvanceCalculator`: verifica fórmula con 3 subtareas / 1 completada = 33.33; sin subtareas activas = 0; todas completadas = 100.00; NULLIF evita división por cero.
- Ref spec: `[SPEC:reparaciones/Tablas, Fórmula de porcentaje de avance]`

**5.A.2** [S, dep: 5.A.1] **IMPL →** `reparaciones/domain/entities/`: `ubicacion.entity.ts`, `ticket-edilicia.entity.ts`, `subtarea-edilicia.entity.ts`. `reparaciones/domain/services/avance-calculator.ts`: función pura, testeable sin Prisma.

**5.A.3** [P, dep: 5.A.2] **TEST →** Test de `EdiliciaStateMachine`: verifica que EN_PROGRESO→RESUELTO retorna `false` cuando `ctx.porcentajeAvance < 100`; verifica `true` cuando `=100`; verifica que completar última subtarea NO transiciona automáticamente (la transición es explícita).
- Ref spec: `[SPEC:reparaciones/Guard de avance en transición a RESUELTO, Completar subtarea no transiciona automáticamente]`

**5.A.4** [S, dep: 5.A.3] **IMPL →** `reparaciones/domain/state-machine/edilicia-state-machine.ts`: implementa `ITicketStateMachine`, registrado en factory para `codigo = 'EDILICIA'`.

**5.A.5** [S, dep: 5.A.4] **IMPL →** Puertos: `i-ubicacion.repository.ts`, `i-ticket-edilicia.repository.ts`, `i-subtarea-edilicia.repository.ts`.

### 5.B — Application

**5.B.1** [P, dep: 5.A.5] **TEST →** Test de `CrearTicketEdilicioUseCase`: verifica creación atómica (`tickets` + `ticket_edilicia`); verifica rechazo si `ubicacion_id` inactiva o soft-deleted; verifica `porcentaje_avance = 0.00` inicial.
- Ref spec: `[SPEC:reparaciones/Satélite obligatorio, ticket_edilicia requiere ubicacion válida]`

**5.B.2** [S, dep: 5.B.1] **IMPL →** `reparaciones/application/use-cases/crear-ticket-edilicio.use-case.ts`.

**5.B.3** [P, dep: 5.A.5] **TEST →** Test de `CrearSubtareaUseCase`: verifica INSERT subtarea + recalculo `porcentaje_avance` en misma tx + registro `AVANCE_EDILICIO` en `operaciones_ticket` con metadata `{ porcentaje_anterior, porcentaje_nuevo }`.
- Ref spec: `[SPEC:reparaciones/porcentaje_avance recalculado tras crear subtarea]`

**5.B.4** [S, dep: 5.B.3] **IMPL →** `reparaciones/application/use-cases/crear-subtarea.use-case.ts`.

**5.B.5** [P, dep: 5.A.5] **TEST →** Test de `CompletarSubtareaUseCase`: verifica `completada = TRUE`, `completada_en = now()`, `completada_por_id`; verifica recalculo avance + operacion `AVANCE_EDILICIO` en misma tx; verifica que al llegar a 100% el estado NO cambia automáticamente.
- Ref spec: `[SPEC:reparaciones/porcentaje_avance recalculado tras completar, Guard de avance]`

**5.B.6** [S, dep: 5.B.5] **IMPL →** `reparaciones/application/use-cases/completar-subtarea.use-case.ts`.

**5.B.7** [P, dep: 5.A.5] **TEST →** Test de `GestionarUbicacionUseCase`: verifica soft delete en cascada lógica (padre → hijos); verifica que no puede referenciarse padre soft-deleted como padre_id; verifica registro de evento en `operaciones_ticket` de tickets afectados.
- Ref spec: `[SPEC:reparaciones/Ubicaciones jerárquicas, Soft delete cascada]`

**5.B.8** [S, dep: 5.B.7] **IMPL →** `reparaciones/application/use-cases/gestionar-ubicacion.use-case.ts`.

### 5.C — Infrastructure + Schema

**5.C.1** [P, dep: 5.A.5] **TEST →** Integration test de `PrismaSubtareaEdiliciaRepository`: verifica soft delete + exclusión en recalculo; verifica que repo de `TicketEdilicia` actualiza `porcentaje_avance`.
- Ref spec: `[SPEC:reparaciones/Soft delete subtarea no cuenta en avance]`

**5.C.2** [S, dep: 5.C.1, 0.C.4] **IMPL →** `reparaciones/infrastructure/persistence/prisma/`: repos + mappers para `ubicaciones`, `ticket_edilicia`, `subtareas_edilicia`.

**5.C.3** [P, dep: 3.D.3] **SCHEMA:** `prisma_tenant/schema.prisma` — agregar modelos `Ubicacion` (self-ref `padre_id`), `TicketEdilicia`, `SubtareaEdilicia`. Correr migration.
- Ref spec: `[SPEC:reparaciones/Tablas TENANT]`

### 5.D — Interface

**5.D.1** [P, dep: 5.B.2, 5.B.4, 5.B.6, 5.B.8, 5.C.2] **TEST →** Unit test de `UbicacionesController` + `TicketsEdilicioController` + `SubtareasController`: mock use cases; verifica guards (`subtarea:actualizar` permiso en completar).
- Ref spec: `[SPEC:auth-rbac/Permiso subtarea:actualizar]`

**5.D.2** [S, dep: 5.D.1] **IMPL →** `reparaciones/interface/controllers/`: `ubicaciones.controller.ts`, `tickets-edilicio.controller.ts`, `subtareas.controller.ts` + DTOs. Wiring `ReparacionesModule`.

---

## Fase 6 — TENANT: Equipos

> Prerequisito: Fase 3 completa. Paralela con Fases 4 y 5.

### 6.A — Dominio

**6.A.1** [P, dep: 3.A.3] **TEST →** Unit tests de entidades: `EquipoInformatico` (activo default true, `deactivate()`); `ComponenteEquipo` (tipo_componente_id requerido); `TicketSoporte` (equipo_id nullable). Verifica que `asignado_a_id` es soft ref (sin FK domain-level).
- Ref spec: `[SPEC:equipos/Tablas TENANT]`

**6.A.2** [S, dep: 6.A.1] **IMPL →** `equipos/domain/entities/`: `equipo-informatico.entity.ts`, `componente-equipo.entity.ts`, `tipos-componente.entity.ts`, `ticket-soporte.entity.ts`.

**6.A.3** [S, dep: 6.A.2] **IMPL →** Puertos: `i-equipo-informatico.repository.ts`, `i-componente-equipo.repository.ts`, `i-tipos-componente.repository.ts`, `i-ticket-soporte.repository.ts`.

### 6.B — Application

**6.B.1** [P, dep: 6.A.3, 3.B.2] **TEST →** Test de `CrearTicketSoporteUseCase`: verifica creación atómica `tickets` + `ticket_soporte`; verifica que si `equipo_id` provisto el equipo existe y está activo; verifica que `equipo_id = null` es válido.
- Ref spec: `[SPEC:equipos/Satélite ticket_soporte, equipo_id referenciado debe existir]`

**6.B.2** [S, dep: 6.B.1] **IMPL →** `equipos/application/use-cases/crear-ticket-soporte.use-case.ts`.

**6.B.3** [P, dep: 6.A.3] **TEST →** Test de `GestionarEquipoUseCase`: verifica uniqueness de `numero_serie` (409 si duplicado); verifica que `numero_serie = null` es válido (UNIQUE parcial); verifica soft delete sin cascade a tickets.
- Ref spec: `[SPEC:equipos/Número de serie único, Soft delete de equipo]`

**6.B.4** [S, dep: 6.B.3] **IMPL →** `equipos/application/use-cases/gestionar-equipo.use-case.ts` (crear, editar, soft delete).

**6.B.5** [P, dep: 6.A.3] **TEST →** Test de `AsignarEquipoUseCase`: verifica cross-DB validation de `asignado_a_id` (existe en master, pertenece al tenant). Test de `GestionarComponenteUseCase`: verifica que tipo_componente inactivo rechaza nuevos componentes pero no afecta existentes.
- Ref spec: `[SPEC:equipos/asignado_a_id validado, Tipo de componente inactivo]`

**6.B.6** [S, dep: 6.B.5] **IMPL →** `equipos/application/use-cases/asignar-equipo.use-case.ts` + `gestionar-componente.use-case.ts`.

### 6.C — Infrastructure + Schema

**6.C.1** [P, dep: 6.A.3] **TEST →** Integration test de `PrismaEquipoInformaticoRepository`: verifica UNIQUE parcial de `numero_serie`; verifica soft delete; test de `PrismaTicketSoporteRepository`: verifica relación 1:1.
- Ref spec: `[SPEC:equipos/requirements]`

**6.C.2** [S, dep: 6.C.1, 0.C.4] **IMPL →** `equipos/infrastructure/persistence/prisma/`: repos + mappers para `equipos_informaticos`, `componentes_equipo`, `tipos_componente`, `archivos_equipo`, `ticket_soporte`.

**6.C.3** [P, dep: 3.D.3] **SCHEMA:** `prisma_tenant/schema.prisma` — agregar modelos `TipoComponente`, `EquipoInformatico`, `ComponenteEquipo`, `ArchivoEquipo`, `TicketSoporte`. Correr migration.
- Ref spec: `[SPEC:equipos/Tablas TENANT]`

**6.C.4** [S, dep: 6.C.3] **SEED:** `prisma_tenant/seeds/tenant-seed.ts` — agregar `tipos_componente` (10 tipos: CPU, RAM, DISCO, MONITOR, TECLADO, MOUSE, GPU, FUENTE, IMPRESORA, RED). Idempotente.
- Ref spec: `[SPEC:equipos/Seeds de tipos_componente]`

### 6.D — Interface

**6.D.1** [P, dep: 6.B.2, 6.B.4, 6.B.6, 6.C.2] **TEST →** Unit test de `EquiposController` + `ComponentesController`: mock use cases; verifica guard `equipo:gestionar`.
- Ref spec: `[SPEC:auth-rbac/Permiso equipo:gestionar]`

**6.D.2** [S, dep: 6.D.1] **IMPL →** `equipos/interface/controllers/`: `equipos.controller.ts`, `componentes.controller.ts`, `ticket-soporte.controller.ts` + DTOs. Wiring `EquiposModule`.

---

## Fase 7 — Integración cross-cutting

> Prerequisito: Fase 0 + Fase 1 + Fase 2 + Fase 3. Esta fase orquesta el provisioning completo y valida el sistema end-to-end.

### 7.A — PostgresAdminService + Provisioning

**7.A.1** [P, dep: 0.C.7] **TEST →** Test de `PostgresAdminService`: mock de `pg.Pool` sobre DB admin (`postgres`); verifica `createDatabase(dbName)` ejecuta `CREATE DATABASE`; verifica `dropDatabase(dbName)` como compensación en rollback; verifica que usa DB admin, NO el client tenant.
- Ref spec: `[SPEC:clientes/Provisioning fallido dispara rollback compensatorio]`

**7.A.2** [S, dep: 7.A.1] **IMPL →** `shared/infrastructure/persistence/postgres-admin.service.ts`: usa `pg.Pool` apuntando a la DB `postgres` (admin). Métodos `createDatabase`, `dropDatabase`, `databaseExists`.

**7.A.3** [P, dep: 1.B.2, 2.C.2, 7.A.2] **TEST →** Test de `CrearClienteUseCase` completo (provisioning): verifica orden estricto (crear DB → migraciones → seed → alta en master); verifica que fallo en "seed" → rollback (drop DB, no alta en master); verifica idempotencia del seed; verifica que el admin inicial se crea en `master.usuarios`.
- Ref spec: `[SPEC:clientes/Provisioning de tenant nuevo, Rollback compensatorio, Seed idempotente]`

**7.A.4** [S, dep: 7.A.3] **IMPL →** `clientes/application/use-cases/crear-cliente.use-case.ts` (provisioning completo): orquesta `PostgresAdminService.createDatabase` → `runTenantMigrations` → `seedCatalogos` → `IClienteRepository.save` → crear usuario admin. Pasos compensatorios (drop DB) en caso de error intermedio.

### 7.B — Fan-out migration runner

**7.B.1** [P, dep: 0.A.2] **TEST →** Test del fan-out runner: mock de lista de tenants (`clientes` activos + soft-deleted excluidos); verifica que ejecuta `prisma migrate deploy` con `DATABASE_URL` de cada tenant; verifica que un fallo en tenant N no aborta tenants N+1..M (no-aborting fan-out); verifica registro de resultado por tenant (success/error).
- Ref spec: `[SPEC:design/Fan-out de migraciones, riesgo de drift de esquema]`

**7.B.2** [S, dep: 7.B.1] **IMPL →** `scripts/migrate-tenants.ts`: script Node que consulta `master.clientes` (solo `activo=true`, `deleted_at IS NULL`), itera, aplica `prisma migrate deploy --schema prisma_tenant/schema.prisma` con `DATABASE_URL` por tenant, registra resultado. Idempotente (Prisma migrate es idempotente por naturaleza).

### 7.C — End-to-end: provisioning + smoke test

**7.C.1** [P, dep: 7.A.4, 3.D.4, 6.C.4] **TEST →** Test e2e de provisioning completo: `CrearClienteUseCase` crea un cliente con db real → conecta a la nueva DB tenant → verifica que los 5 catálogos están sembrados (`estados`, `prioridades`, `tipos_ticket`, `tipo_operacion`, `tipos_componente`) → verifica idempotencia del seed corriendo dos veces.
- Ref spec: `[SPEC:clientes/Provisioning, Seed catálogos por tenant idempotente]`; `[SPEC:tickets-core/Nuevo tenant tiene catálogos pre-poblados]`; `[SPEC:equipos/Seeds de tipos_componente]`

**7.C.2** [P, dep: 7.C.1, 2.D.4, 3.E.2] **TEST →** Smoke test e2e del flujo completo: login (JWT válido) → crear ticket SOPORTE → asignar → transicionar estado → verificar `operaciones_ticket` en timeline. Login con cliente inactivo → 403. Request a endpoint tenant sin TenantGuard → 403.
- Ref spec: `[SPEC:auth-rbac/Login exitoso]; [SPEC:tickets-core/requirements]; [SPEC:clientes/Suspensión de tenant]`

---

## Resumen de tareas y dependencias críticas

| Fase | Tareas | Puede paralelo con |
|------|--------|--------------------|
| 0 — Scaffolding + Shared | 16 | — (fundación) |
| 1 — MASTER: clientes | 15 | Fase 2 (ramas distintas) |
| 2 — MASTER: auth+RBAC | 22 | Fase 1 (ramas distintas) |
| 3 — TENANT: tickets-core | 18 | — (dep Fase 0 + 2.D.2 para guards) |
| 4 — Compras | 14 | Fases 5 y 6 (dep Fase 3) |
| 5 — Reparaciones | 16 | Fases 4 y 6 (dep Fase 3) |
| 6 — Equipos | 13 | Fases 4 y 5 (dep Fase 3) |
| 7 — Integración | 8 | — (dep 1+2+3) |
| **Total** | **122** | |

**Dependencias críticas (cuellos de botella):**
1. `0.C.7` (SharedModule) bloquea todas las demás fases.
2. `2.D.2` (guards) bloquea los controllers de toda la capa tenant.
3. `3.D.3` (schema tenant inicial) es prerequisito de las adiciones de schema en Fases 4, 5, 6.
4. `7.A.2` (`PostgresAdminService`) bloquea el `CrearClienteUseCase` completo (provisioning real).

---

## Review Workload Forecast

### Estimación de líneas cambiadas por agrupación lógica

| Agrupación | Archivos nuevos (aprox.) | Líneas estimadas |
|------------|--------------------------|------------------|
| Scaffolding (tsconfig, jest, eslint rule, scripts npm) | ~10 | ~600 |
| Prisma schemas (prisma_master + prisma_tenant completos) | 2 | ~600 |
| Migrations + seeds (master seed RBAC + tenant seeds) | ~8 archivos SQL/ts | ~700 |
| shared/domain (BaseEntity, Result, IFileStorage, ports) | ~8 | ~400 |
| shared/infrastructure (PrismaService factory, TenantContext, TenantTransactionRunner, PostgresAdminService, LocalFileStorage) | ~6 | ~900 |
| auth: domain + application (5 use cases) | ~15 | ~1,200 |
| auth: infrastructure + guards + decoradores + interface | ~12 | ~1,400 |
| clientes: domain + application + infrastructure + interface | ~10 | ~900 |
| tickets-core: domain + state machine + NumeradorTicket | ~12 | ~1,100 |
| tickets-core: application (4 use cases) + infrastructure (5 repos+mappers) + interface | ~18 | ~2,000 |
| compras: domain + state machine + application + infra + interface | ~16 | ~1,800 |
| reparaciones: domain + state machine + avance + application + infra + interface | ~18 | ~2,000 |
| equipos: domain + application + infra + interface | ~15 | ~1,500 |
| fan-out migration script + CrearClienteUseCase completo | ~4 | ~600 |
| **Test files (aprox. 1:1 con impl — todos los módulos)** | ~60 | ~6,000 |
| **TOTAL ESTIMADO** | **~194** | **~21,800 líneas** |

> Nota: Greenfield — la mayor parte son archivos nuevos. El costo de revisión es real aunque el diff es 100% aditivo.

---

### Chained PRs recommended: **Yes**

21,800 líneas / límite 400 líneas = 54 PRs teóricos. No es práctico, pero el cambio se puede cortar en **18 PRs encadenados** agrupando por módulo completo + capa, manteniendo cada uno deployable y verificable de forma independiente.

#### Propuesta de slices (orden de merge)

| PR | Contenido | Dep (merge después de) | Líneas est. |
|----|-----------|------------------------|-------------|
| PR-01 | Scaffolding + shared/domain (BaseEntity, Result, IFileStorage, puertos) + ESLint fitness rule | — | ~800 |
| PR-02 | shared/infrastructure (PrismaService factory, TenantContext, TenantTransactionRunner, LocalFileStorage) + SharedModule | PR-01 | ~900 |
| PR-03 | `prisma_master/schema.prisma` (DDL completo: clientes, ciclos_vigentes, usuarios, refresh_tokens, RBAC tables) + primera migration | PR-01 | ~700 |
| PR-04 | clientes: domain + application (3 use cases) + infra (repos+mappers) + interface + module | PR-02, PR-03 | ~900 |
| PR-05 | auth: domain entities + ports + application use cases (LoginUseCase, Refresh, Revoke, AsignarRol, BajaUsuario) | PR-02, PR-03 | ~1,200 |
| PR-06 | auth: infrastructure (repos, JwtStrategy, Argon2) + guards (Jwt/Roles/Permissions/Tenant) + decoradores + interface + AuthModule | PR-05 | ~1,400 |
| PR-07 | MASTER seed migration (RBAC: roles, permisos, roles_permisos mapeo base) | PR-03 | ~300 |
| PR-08 | `prisma_tenant/schema.prisma` (DDL completo: catálogos + tickets core + ticket_compra, items_compra, presupuestos, ubicaciones, ticket_edilicia, subtareas, tipos_componente, equipos, ticket_soporte) + migration inicial tenant | PR-01 | ~700 |
| PR-09 | TENANT seeds (todos los catálogos: estados 8, prioridades 4, tipos_ticket 3, tipo_operacion 5, tipos_componente 10) | PR-08 | ~400 |
| PR-10 | tickets-core: domain + state machine base + NumeradorTicket + puertos | PR-02, PR-06 | ~900 |
| PR-11 | tickets-core: application (4 use cases) + infra (repos+mappers) + interface + TicketsModule | PR-10, PR-08, PR-09 | ~2,000 |
| PR-12 | compras: domain + ComprasStateMachine + application (5 use cases) + puertos | PR-10 | ~1,000 |
| PR-13 | compras: infra (repos+mappers) + interface (3 controllers + DTOs) + ComprasModule | PR-12, PR-11 | ~800 |
| PR-14 | reparaciones: domain + EdiliciaStateMachine + AvanceCalculator + application (4 use cases) + puertos | PR-10 | ~1,100 |
| PR-15 | reparaciones: infra (repos+mappers) + interface (3 controllers + DTOs) + ReparacionesModule | PR-14, PR-11 | ~800 |
| PR-16 | equipos: domain + application (4 use cases) + TicketSoporte + puertos | PR-10 | ~900 |
| PR-17 | equipos: infra (repos+mappers) + interface (2 controllers + DTOs) + EquiposModule | PR-16, PR-11 | ~700 |
| PR-18 | PostgresAdminService + CrearClienteUseCase (provisioning completo con rollback) + fan-out migration script + e2e tests provisioning | PR-04, PR-06, PR-11, PR-09 | ~1,400 |

**Dependencias entre PRs:**
```
PR-01 → PR-02 → PR-04, PR-05, PR-10
PR-01 → PR-03 → PR-04, PR-05, PR-07
PR-01 → PR-08 → PR-09 → PR-11 → PR-12→PR-13, PR-14→PR-15, PR-16→PR-17
PR-06 → PR-10 → PR-11
PR-11 → PR-18
PR-04, PR-06 → PR-18
```

Todos los PRs de Fases 4, 5 y 6 (PR-12 al PR-17) son paralelos entre sí una vez que PR-11 esté mergeado.

---

### Decision needed before apply: **Yes**

Antes de correr `sdd-apply`, confirmar:
1. ¿Se aprueba la estrategia de 18 PRs encadenados o se ajustan los límites de tamaño?
2. ¿El entorno de test tiene Postgres real disponible para los integration tests (testcontainers vs DB compartida)?
3. ¿El `LocalFileStorage` (dev) es suficiente para la primera fase o se necesita un adaptador de S3 desde el inicio?
4. ¿Los PR sizes sobre 400 líneas son aceptados con `size:exception` implícita o se requiere aprobación explícita por PR?
