# Tasks: admin-general — Panel de Administración Multi-Tenant (3 niveles)

> Generado: 2026-06-30 | Artifact store: hybrid | Delivery: auto-chain (6 PRs, seguridad primero)
> Spec refs: auth-rbac (obs #1606), clientes-tenancy, reportes, admin-ui
> Design ref: obs #1605 | Proposal ref: obs #1603

---

## Decisiones baked-in (no re-abrir)

| # | Decisión |
|---|----------|
| D1 | Ciclos = POR CLIENTE (DB tenant). `ciclos_cliente`, flag `activo`. Un activo por tenant. NO modelo master global. |
| D2 | Tiempo de resolución = DÍAS. Usa `fecha_cierre` (ya existe, `@db.Date`). Sin columna nueva. |
| D3 | "Tickets por usuario" = DOS vistas: por `solicitante_id` y por `asignado_id`. Nombres enriquecidos en application (query separada a `master.usuarios`). PROHIBIDO JOIN cross-DB. |
| D4 | AuthZ reportes: gate `ADMINISTRADOR` OR `is_global_admin`. Sin permiso granular nuevo. |
| D5 | Baja usuario = `PATCH /usuarios/:id/baja` (idempotente, soft-delete). |
| D6 | BFF: agregar `x-tenant-id` a `ALLOWED_HEADERS` en `[...path]/route.ts`. Requerido para cross-tenant del operador. |
| D7 | Sidebar: gating por `is_global_admin`/rol. Feature-flag simple (env var). Sin complejidad adicional. |
| D8 | Migración idempotente `nestor@sesitec.com.ar` → `is_global_admin=true`. Va en PR1 como dependencia crítica. |

---

## Quick Reference: Dependency Map

```
PR1 (seguridad)
  └─► PR2 (clientes + ciclos backend)
  └─► PR3 (usuarios backend)
  └─► PR4 (reportes backend)
  └─► PR5 (shell + selectores + BFF)   [necesita PR2 para GET /clientes y GET /ciclos]
        └─► PR6 (pantallas admin)      [necesita PR5 para TenantContext]
```

PR2, PR3, PR4 pueden correr en paralelo después de PR1.
PR5 depende de PR1 (is_global_admin en JWT) y necesita PR2 funcionando para los selectores.
PR6 depende de PR5.

---

## PR1 — Security guard + is_global_admin front + migración nestor

> Specs satisfechas: `auth-rbac` (GlobalAdminGuard, fix controllers abiertos, is_global_admin frontend)
> Branch base: `main`
> Estimado: ~160 líneas cambiadas

### Orden de ejecución: estrictamente secuencial

**T1.1** — [x] [RED] Unit test `GlobalAdminGuard`
- Archivos: `backend/src/auth/infrastructure/guards/global-admin.guard.spec.ts` (nuevo)
- Tests mínimos:
  - JWT con `is_global_admin: false` → `canActivate` lanza `ForbiddenException`
  - JWT con `is_global_admin: true` → `canActivate` retorna `true`
  - Sin `request.user` (sin JWT) → `canActivate` lanza `ForbiddenException` (JwtAuthGuard debe correr antes)
  - Verificar: zero llamadas a ningún repositorio/DB dentro del guard
- Spec ref: `auth-rbac/GlobalAdminGuard` — evaluación O(1) sin I/O
- DOD: test en RED (compilar, correr, fallar porque la clase no existe)

**T1.2** — [x] [GREEN] Implementar `GlobalAdminGuard`
- Archivos: `backend/src/auth/infrastructure/guards/global-admin.guard.ts` (nuevo)
- Implementación: `CanActivate` que lee `request.user.is_global_admin`; lanza `ForbiddenException` si false/undefined
- Composable: se usa después de `JwtAuthGuard` — no re-valida el token
- Archivos secundarios: registrar en `backend/src/auth/auth.module.ts` si se inyecta vía DI (o exportar como clase plana)
- DOD: T1.1 en GREEN; `pnpm test` backend pasa; tsc sin errores

**T1.3** — [x] [RED] Test integración `ClientesController` con `JwtAuthGuard`
- Archivos: `backend/src/clientes/interface/controllers/clientes.controller.spec.ts` (modificar)
- Tests mínimos:
  - `GET /clientes` sin Authorization → 401
  - `POST /clientes` sin Authorization → 401
  - Token expirado/malformado → 401
  - Token válido → JwtAuthGuard pasa (guards subsiguientes se evalúan)
- Spec ref: `auth-rbac/ClientesController protegido`
- DOD: tests en RED (controlador no tiene guards hoy)

**T1.4** — [x] [GREEN] Agregar `@UseGuards(JwtAuthGuard)` a `ClientesController`
- Archivos: `backend/src/clientes/interface/controllers/clientes.controller.ts` (modificar)
- Agregar a nivel de controlador: `@UseGuards(JwtAuthGuard)` (no por método)
- Importar `JwtAuthGuard` de `../../auth/infrastructure/guards/jwt-auth.guard` o ruta correcta
- DOD: T1.3 en GREEN; tests existentes siguen pasando

**T1.5** — [x] [RED] Test integración `CiclosVigentesController` con `JwtAuthGuard`
- Archivos: `backend/src/clientes/interface/controllers/ciclos-vigentes.controller.spec.ts` (nuevo o modificar)
- Tests mínimos:
  - `POST /ciclos-vigentes` sin Authorization → 401
  - Token expirado → 401
  - Token válido → 201 (comportamiento existente se preserva)
- Spec ref: `auth-rbac/CiclosVigentesController protegido`
- DOD: tests en RED

**T1.6** — [x] [GREEN] Agregar `@UseGuards(JwtAuthGuard)` a `CiclosVigentesController`
- Archivos: `backend/src/clientes/interface/controllers/ciclos-vigentes.controller.ts` (modificar)
- Agregar a nivel de controlador
- DOD: T1.5 en GREEN; funcionalidad existente preservada

**T1.7** — [x] Crear migración idempotente `nestor@sesitec.com.ar`
- Archivos: `backend/prisma_master/migrations/20260630000000_set_global_admin_nestor/migration.sql` (nuevo)
- Contenido:
  ```sql
  -- Migración idempotente: designa operador global inicial
  -- Safe to re-run: UPDATE WHERE es no-op si ya es true o si el email no existe
  UPDATE master.usuarios
  SET is_global_admin = true
  WHERE email = 'nestor@sesitec.com.ar';
  ```
- Spec ref: `clientes-tenancy/Migración idempotente designa admin global inicial`
- DOD: migración corre sin error; re-correrla es no-op; `nestor@sesitec.com.ar` tiene `is_global_admin=true` en master

**T1.8** — [x] [RED] Test: `JwtPayload` frontend incluye `is_global_admin?: boolean`
- Archivos: `frontend/src/shared/api/types.test.ts` (modificar)
- Tests mínimos:
  - Type-level assertion: `JwtPayload` tiene `is_global_admin?: boolean` (optional)
  - Payload sin el campo no produce error de tipo (retrocompatibilidad)
  - `cliente_nombre?: string` sigue presente (no-regression)
- Spec ref: `auth-rbac/Claim is_global_admin disponible en JwtPayload frontend`
- DOD: test en RED (campo no existe aún en types.ts)

**T1.9** — [x] [GREEN] Agregar `is_global_admin?: boolean` a `JwtPayload` en `types.ts`
- Archivos: `frontend/src/shared/api/types.ts` (modificar)
- Agregar después de `cliente_nombre?`: `is_global_admin?: boolean;`
- DOD: T1.8 en GREEN; `tsc --noEmit` en frontend pasa; todos los tests existentes pasan

**T1.10** — [x] Exponer `isGlobalAdmin` en `useSession`
- Archivos: `frontend/src/shared/hooks/use-session.ts` (modificar)
- Agregar campo derivado: `isGlobalAdmin: user?.is_global_admin ?? false`
- Archivos test: `frontend/src/shared/hooks/use-session.test.ts` (modificar si existe o crear)
- Tests: `isGlobalAdmin` es `true` cuando JWT tiene `is_global_admin: true`; `false` cuando ausente/undefined
- DOD: hook retorna `{ user, isLoading, can, isGlobalAdmin }`; tsc pasa

---

## PR2 — Backend clientes (listar + provisioning) + ciclos tenant

> Specs satisfechas: `clientes-tenancy` (GET /clientes, POST /clientes, GET /ciclos, POST /ciclos, PATCH /ciclos/:id/activar)
> Depende de: PR1 (GlobalAdminGuard disponible)
> Estimado: ~680 líneas cambiadas ⚠️ RIESGO ALTO — ver Forecast

### Notas de arquitectura PR2

- Los endpoints `/ciclos` son **tenant-level** (`ciclos_cliente`, flag `activo`) — NOT los `/ciclos-vigentes` del master.
- Se crea un nuevo controlador `CiclosController` en el módulo `clientes` (path `/ciclos`).
- Se necesitan nuevas entidades, puerto y repositorio para `ciclos_cliente` en el tenant DB.
- El permiso `ciclo:gestionar` debe existir en el seed RBAC. Verificar en la migración del módulo de auth antes de usarlo.

### Orden: T2.1–T2.5 pueden paralelizarse internamente (dependen solo de PR1)

**T2.1** — Extender `IClienteRepository` con `findAll(): Promise<Cliente[]>`
- Archivos:
  - `backend/src/clientes/domain/ports/i-cliente.repository.ts` (modificar)
  - `backend/src/clientes/infrastructure/persistence/prisma/prisma-cliente.repository.ts` (modificar)
- Implementación: `findAll()` retorna clientes con `deleted_at IS NULL`; excluye soft-deleted
- Spec ref: `clientes-tenancy/GET /clientes — listar todos los tenants`
- DOD: método compilado; sin test unitario separado (cubierto en T2.2)

**T2.2** — [RED] Unit test `ListarClientesUseCase`
- Archivos: `backend/src/clientes/application/use-cases/listar-clientes.use-case.spec.ts` (nuevo)
- Tests mínimos:
  - Retorna array de clientes activos (deleted_at IS NULL)
  - Array vacío cuando no hay clientes (no 404)
  - Cada item incluye: `id, nombre, activo, db_name, created_at`
  - No expone passwords ni datos sensibles
- Spec ref: `clientes-tenancy/GET /clientes`

**T2.3** — [GREEN] Implementar `ListarClientesUseCase`
- Archivos: `backend/src/clientes/application/use-cases/listar-clientes.use-case.ts` (nuevo)
- Inyecta `IClienteRepository`; llama `findAll()`
- DOD: T2.2 en GREEN

**T2.4** — [RED] Test integración: GET /clientes y POST /clientes en `ClientesController`
- Archivos: `backend/src/clientes/interface/controllers/clientes.controller.spec.ts` (modificar)
- Tests GET /clientes:
  - `is_global_admin=true` → 200 con lista de clientes
  - `ADMINISTRADOR (is_global_admin=false)` → 403
  - Lista vacía → 200 `{ data: [] }` (no 404)
  - Sin auth → 401 (ya cubierto en T1.3 pero confirmar)
- Tests POST /clientes (provisioning):
  - `is_global_admin=true` con body válido → 201 con `{ id, nombre, db_name, activo: true }`
  - `adminPassword` MUST NOT en respuesta
  - `db_name` duplicado → 409 con mensaje indicando conflicto en db_name
  - `adminEmail` duplicado → 409
  - Fallo de provisioning → 500 con detalle del paso fallido
  - `ADMINISTRADOR (no global admin)` → 403
- Spec ref: `clientes-tenancy/GET /clientes`, `clientes-tenancy/POST /clientes`

**T2.5** — [GREEN] Agregar GET /clientes y reconectar POST /clientes → `CrearClienteUseCase`
- Archivos: `backend/src/clientes/interface/controllers/clientes.controller.ts` (modificar)
- Agregar:
  - `@Get() @UseGuards(JwtAuthGuard, GlobalAdminGuard)` → `ListarClientesUseCase`
  - Modificar el `@Post()` existente para usar `CrearClienteUseCase` (provisioning completo) en lugar de `RegistrarClienteUseCase`
- Archivos DTO: `backend/src/clientes/interface/dtos/create-cliente.dto.ts` (modificar — agregar `adminEmail`, `adminNombre`, `adminApellido`, `adminPassword`)
- Archivos: `backend/src/clientes/interface/dtos/cliente-response.dto.ts` (verificar que incluye `activo`)
- Actualizar `backend/src/clientes/clientes.module.ts` para proveer `ListarClientesUseCase`
- DOD: T2.4 en GREEN; provisioning completo via CrearClienteUseCase

**T2.6** — Crear dominio para ciclos tenant: entidad + puerto
- Archivos:
  - `backend/src/clientes/domain/entities/ciclo-cliente.entity.ts` (nuevo)
    - Campos: `id, tenantId, nombre, fechaInicio, fechaFin, activo`
  - `backend/src/clientes/domain/ports/i-ciclo-cliente.repository.ts` (nuevo)
    - Métodos: `findByTenant(tenantId), findById(id, tenantId), create(data), activar(id, tenantId), deactivateAll(tenantId)`
- Spec ref: `clientes-tenancy/GET /ciclos`, `clientes-tenancy/PATCH /ciclos/:id/activar`
- DOD: entidad tiene spec de validación (fecha_fin > fecha_inicio); compila

**T2.7** — [RED] Unit test `ListarCiclosUseCase`
- Archivos: `backend/src/clientes/application/use-cases/listar-ciclos.use-case.spec.ts` (nuevo)
- Tests:
  - Retorna ciclos del tenant resuelto únicamente
  - Array vacío → 200 (no 404)
  - Cada item incluye: `id, nombre, fecha_inicio, fecha_fin, activo`
  - MUST NOT incluir ciclos de otro tenant

**T2.8** — [GREEN] Implementar `ListarCiclosUseCase`
- Archivos: `backend/src/clientes/application/use-cases/listar-ciclos.use-case.ts` (nuevo)
- DOD: T2.7 en GREEN

**T2.9** — [RED] Unit test `CrearCicloTenantUseCase`
- Archivos: `backend/src/clientes/application/use-cases/crear-ciclo-tenant.use-case.spec.ts` (nuevo)
- Tests:
  - Crea ciclo con `activo=FALSE` por defecto
  - `fecha_fin < fecha_inicio` → error de validación
  - Fechas solapan con ciclo activo existente → `CicloVigenteOverlapError`
  - Respuesta incluye `id` del ciclo creado

**T2.10** — [GREEN] Implementar `CrearCicloTenantUseCase`
- Archivos: `backend/src/clientes/application/use-cases/crear-ciclo-tenant.use-case.ts` (nuevo)
- DOD: T2.9 en GREEN

**T2.11** — [RED] Unit test `ActivarCicloUseCase`
- Archivos: `backend/src/clientes/application/use-cases/activar-ciclo.use-case.spec.ts` (nuevo)
- Tests:
  - Activa ciclo objetivo; todos los demás del tenant quedan `activo=FALSE`
  - Ambas operaciones en una única transacción (mock transacción)
  - Ciclo de otro tenant → `NotFoundException` (aislamiento)
  - Ciclo inexistente → `NotFoundException`
  - Operador via X-Tenant-Id puede activar en cualquier tenant

**T2.12** — [GREEN] Implementar `ActivarCicloUseCase`
- Archivos: `backend/src/clientes/application/use-cases/activar-ciclo.use-case.ts` (nuevo)
- CRÍTICO: usar transacción Prisma (`prisma.$transaction(...)`) para atomicidad
- DOD: T2.11 en GREEN

**T2.13** — Implementar `PrismaCicloClienteRepository`
- Archivos:
  - `backend/src/clientes/infrastructure/persistence/prisma/prisma-ciclo-cliente.repository.ts` (nuevo)
  - `backend/src/clientes/infrastructure/persistence/prisma/ciclo-cliente.mapper.ts` (nuevo)
- Usa el Prisma client del tenant resuelto por `TenantGuard`
- `activar()`: `UPDATE ciclos_cliente SET activo=false WHERE tenant_id=X` + `UPDATE SET activo=true WHERE id=Y` en `$transaction`
- DOD: compila; integración verificada en spec del controller (T2.15)

**T2.14** — [RED] Test `CiclosController` (tenant-level)
- Archivos: `backend/src/clientes/interface/controllers/ciclos.controller.spec.ts` (nuevo)
- Tests GET /ciclos:
  - ADMINISTRADOR → 200 con ciclos del tenant propio únicamente
  - Operador + X-Tenant-Id → 200 con ciclos del tenant objetivo
  - USUARIO (sin ciclo:gestionar) → 403
  - Sin ciclos → 200 `{ data: [] }`
- Tests POST /ciclos:
  - ADMINISTRADOR válido → 201, `activo=false` por defecto, incluye `id`
  - Fechas solapadas → 422
  - `fecha_fin < fecha_inicio` → 400
- Tests PATCH /ciclos/:id/activar:
  - ADMINISTRADOR → 200; ciclo activo; otros inactivos
  - Ciclo de otro tenant → 404
  - Ciclo inexistente → 404
  - Operador via X-Tenant-Id → 200, ciclos del tenant objetivo actualizados
- Spec ref: `clientes-tenancy/GET /ciclos`, `POST /ciclos`, `PATCH /ciclos/:id/activar`

**T2.15** — [GREEN] Crear `CiclosController` en módulo clientes
- Archivos:
  - `backend/src/clientes/interface/controllers/ciclos.controller.ts` (nuevo)
  - `backend/src/clientes/interface/dtos/create-ciclo.dto.ts` (nuevo)
  - `backend/src/clientes/interface/dtos/ciclo-response.dto.ts` (nuevo)
- Guards por controlador: `JwtAuthGuard`, `TenantGuard`; por endpoint: `PermissionsGuard(ciclo:gestionar)`
- Rutas: `@Controller('ciclos')`, GET /, POST /, PATCH /:id/activar
- DOD: T2.14 en GREEN

**T2.16** — Registrar nuevos use cases y repositorios en `ClientesModule`
- Archivos: `backend/src/clientes/clientes.module.ts` (modificar)
- Proveer: `ListarCiclosUseCase, CrearCicloTenantUseCase, ActivarCicloUseCase, PrismaCicloClienteRepository`
- Verificar que `ciclo:gestionar` existe en el seed RBAC; agregar si falta
- DOD: módulo compila; `pnpm test` pasa en backend

---

## PR3 — Backend usuarios (crear, listar, PATCH baja)

> Specs satisfechas: `clientes-tenancy` (GET /usuarios, POST /usuarios, PATCH /usuarios/:id/baja)
> Depende de: PR1 (guards disponibles)
> Puede correr en paralelo con PR2 y PR4
> Estimado: ~390 líneas cambiadas ⚠️ BORDERLINE

### Notas de arquitectura PR3

- `BajaUsuarioUseCase` ya existe. Verificar si maneja: (a) self-baja → 422, (b) cross-tenant → 404, (c) idempotencia. Extender si falta.
- El campo `cliente_id` del usuario nuevo SIEMPRE viene del `TenantGuard` (JWT o X-Tenant-Id), NUNCA del body.
- La respuesta de cualquier endpoint de usuarios MUST NOT incluir `password_hash`.

**T3.1** — Extender `IUsuarioRepository` con métodos faltantes
- Archivos: `backend/src/auth/domain/ports/i-usuario.repository.ts` (modificar)
- Métodos a agregar si no existen:
  - `create(data: CreateUsuarioData): Promise<Usuario>`
  - `findByClienteId(clienteId: string): Promise<Usuario[]>` (excluye `deleted_at IS NOT NULL`)
- Archivos: `backend/src/auth/infrastructure/persistence/prisma/prisma-usuario.repository.ts` (modificar)
- DOD: métodos compilados e implementados

**T3.2** — [RED] Unit test `CrearUsuarioUseCase`
- Archivos: `backend/src/auth/application/use-cases/crear-usuario.use-case.spec.ts` (nuevo)
- Tests:
  - Crea usuario con: `cliente_id` del contexto, `activo=TRUE`, `is_global_admin=FALSE`, `password_hash` argon2id
  - Asigna rol en `master.usuarios_roles`
  - Email duplicado → error de conflicto (`UsuarioConflictError` o similar)
  - Rol inválido (no en enum) → error de validación
  - `password` NEVER en respuesta (el use case no lo retorna)
  - `is_global_admin=TRUE` CANNOT ser establecido via este use case
- Spec ref: `clientes-tenancy/POST /usuarios`

**T3.3** — [GREEN] Implementar `CrearUsuarioUseCase`
- Archivos: `backend/src/auth/application/use-cases/crear-usuario.use-case.ts` (nuevo)
- Inyecta: `IUsuarioRepository`, `IHashProvider`, `IRoleRepository`
- DOD: T3.2 en GREEN

**T3.4** — [RED] Unit test `ListarUsuariosUseCase`
- Archivos: `backend/src/auth/application/use-cases/listar-usuarios.use-case.spec.ts` (nuevo)
- Tests:
  - Retorna usuarios del tenant resuelto (filtra por `cliente_id`)
  - Excluye usuarios con `deleted_at IS NOT NULL`
  - Incluye usuarios con `activo=FALSE` (admin ve inactivos)
  - MUST NOT incluir `password_hash` en ningún campo
  - Aislamiento: no devuelve usuarios de otros tenants
- Spec ref: `clientes-tenancy/GET /usuarios`

**T3.5** — [GREEN] Implementar `ListarUsuariosUseCase`
- Archivos: `backend/src/auth/application/use-cases/listar-usuarios.use-case.ts` (nuevo)
- DOD: T3.4 en GREEN

**T3.6** — Auditar y extender `BajaUsuarioUseCase` para el spec
- Archivos: `backend/src/auth/application/use-cases/baja-usuario.use-case.ts` (revisar/modificar)
- Verificar que el use case:
  - [ ] Hace soft-delete: `deleted_at=now(), activo=FALSE`
  - [ ] Revoca TODOS los refresh tokens del usuario (`revoked_at=now()`)
  - [ ] Rechaza si el usuario objetivo está en otro tenant → `UsuarioNoEncontradoError`
  - [ ] Rechaza si `usuarioId === requesterId` → nuevo `AutoBajaProhibidaError`
  - [ ] Es idempotente: si ya tiene `deleted_at IS NOT NULL`, retorna OK sin re-ejecutar
  - [ ] Las tres operaciones (activo, deleted_at, tokens) en una sola transacción
- Agregar tests faltantes a: `backend/src/auth/application/use-cases/baja-usuario.use-case.spec.ts`
- DOD: todos los escenarios del spec cubiertos en tests

**T3.7** — Agregar DTO `CreateUsuarioDto` al módulo auth
- Archivos: `backend/src/auth/interface/dtos/auth.dto.ts` (modificar)
- Campos: `email (IsEmail)`, `nombre`, `apellido`, `password`, `rol (IsIn(['USUARIO','COLABORADOR','TECNICO','ADMINISTRADOR']))`
- DOD: DTO con validaciones class-validator; compila

**T3.8** — [RED] Test integración: POST /usuarios, GET /usuarios, PATCH /usuarios/:id/baja
- Archivos: `backend/src/auth/interface/controllers/usuarios.controller.spec.ts` (modificar)
- Tests POST /usuarios:
  - ADMINISTRADOR body válido → 201; no `password`/`password_hash` en respuesta
  - Operador + X-Tenant-Id → 201 con `cliente_id` del header
  - Email duplicado → 409
  - Rol inválido → 400
  - TECNICO (sin usuario:gestionar) → 403
- Tests GET /usuarios:
  - ADMINISTRADOR → 200 con usuarios del tenant propio (no password_hash)
  - Operador + X-Tenant-Id → 200 con usuarios del tenant objetivo
  - Incluye `activo=FALSE`, excluye `deleted_at IS NOT NULL`
- Tests PATCH /usuarios/:id/baja:
  - ADMINISTRADOR mismo tenant → 200
  - ADMINISTRADOR otro tenant → 404
  - ADMINISTRADOR se da de baja a sí mismo → 422
  - Usuario ya dado de baja → 200 (idempotente)
  - TECNICO → 403
- Spec ref: `clientes-tenancy/POST, GET, PATCH /usuarios`

**T3.9** — [GREEN] Agregar POST /usuarios, GET /usuarios, PATCH /usuarios/:id/baja a `UsuariosController`
- Archivos: `backend/src/auth/interface/controllers/usuarios.controller.ts` (modificar)
- Guards: `JwtAuthGuard + PermissionsGuard(usuario:gestionar)` a nivel de controlador o endpoint
- POST /usuarios: inyectar `clienteId` del request context (resuelto por TenantGuard), nunca del body
- GET /usuarios: retornar lista sin `password_hash`; mapear a DTO de respuesta
- PATCH /usuarios/:id/baja: delegar a `BajaUsuarioUseCase`; inyectar `requesterId` del JWT
- DOD: T3.8 en GREEN

**T3.10** — Registrar nuevos use cases en `AuthModule`
- Archivos: `backend/src/auth/auth.module.ts` (modificar)
- Proveer: `CrearUsuarioUseCase`, `ListarUsuariosUseCase`
- DOD: módulo compila; `pnpm test` pasa

---

## PR4 — Backend reportes (4 agregaciones por tenant+ciclo)

> Specs satisfechas: `reportes` (todos los endpoints + aislamiento + tiempo resolución en días)
> Depende de: PR1 (guards)
> Puede correr en paralelo con PR2 y PR3
> Estimado: ~580 líneas cambiadas ⚠️ RIESGO ALTO — ver Forecast

### Notas de arquitectura PR4

- Módulo NUEVO: `backend/src/reportes/` (screaming arch)
- Solo lectura. Cero side-effects. PROHIBIDO INSERT/UPDATE/DELETE.
- "tickets por usuario" = DOS vistas: `porSolicitante` y `porAsignado`. Respuesta contiene ambos arrays.
- Nombres enriquecidos en application layer: UUIDs del tenant DB → nombres de `master.usuarios` (query separada al master Prisma client). PROHIBIDO JOIN cross-DB.
- Ciclo default = `ciclos_cliente.activo=TRUE` del tenant. Sin ciclo activo y sin `cicloId` → HTTP 422.
- Soft-deleted tickets (`deleted_at IS NOT NULL`) excluidos de TODAS las queries.
- Tiempo resolución: `AVG(fecha_cierre::date - created_at::date)` en días. Solo `RESUELTO` y `SIN_SOLUCION`. Excluir `RECHAZADO`. Solo `fecha_cierre IS NOT NULL`.
- AuthZ: `is_global_admin OR rol ADMINISTRADOR` → guard `AdminOrGlobalGuard` (nuevo, sin permiso granular).

**T4.1** — Crear dominio `reportes`: puerto de repositorio
- Archivos: `backend/src/reportes/domain/ports/i-reportes.repository.ts` (nuevo)
- Interfaz:
  ```ts
  interface IReportesRepository {
    ticketsPorSolicitante(cicloId: string): Promise<{ solicitanteId: string; total: number }[]>;
    ticketsPorAsignado(cicloId: string): Promise<{ asignadoId: string | null; total: number }[]>;
    ticketsPorTipo(cicloId: string): Promise<{ tipoId: string; total: number }[]>;
    ticketsPorEstado(cicloId: string): Promise<{ estadoId: string; total: number }[]>;
    tiempoResolucionPromedioDias(cicloId: string): Promise<{ promedioDias: number | null; totalResueltos: number }>;
    cicloActivo(): Promise<string | null>; // retorna cicloId o null
  }
  ```
- DOD: interfaz compilada

**T4.2** — Crear guard `AdminOrGlobalGuard`
- Archivos: `backend/src/reportes/infrastructure/guards/admin-or-global.guard.ts` (nuevo o en auth)
- Lógica: `request.user.is_global_admin === true OR request.user.roles.includes('ADMINISTRADOR')`
- Archivos test: `admin-or-global.guard.spec.ts` (nuevo)
- Tests:
  - is_global_admin=true → pasa
  - rol ADMINISTRADOR (is_global_admin=false) → pasa
  - TECNICO → 403
  - Sin user → 403
- DOD: tests en GREEN

**T4.3** — [RED] Unit test `TicketsPorUsuarioUseCase`
- Archivos: `backend/src/reportes/application/use-cases/tickets-por-usuario.use-case.spec.ts` (nuevo)
- Tests:
  - Retorna `{ porSolicitante: [...], porAsignado: [...] }` con nombres enriquecidos del master
  - Sin asignado → `{ asignadoId: null, totalTickets: N }` consistente
  - Con `cicloId` param → filtra a ese ciclo exactamente
  - Sin `cicloId` → usa ciclo activo del tenant
  - Sin ciclo activo y sin `cicloId` → lanza `NoCicloActivoError`
  - `cicloId` de otro tenant → retorna `[]` (no 500, no cross-DB)
  - Excluye tickets con `deleted_at IS NOT NULL`
  - Solo lectura: cero writes
- Spec ref: `reportes/ReporteTicketsPorUsuario`; Decisión D3

**T4.4** — [GREEN] Implementar `TicketsPorUsuarioUseCase`
- Archivos: `backend/src/reportes/application/use-cases/tickets-por-usuario.use-case.ts` (nuevo)
- Inyecta: `IReportesRepository` (tenant), `IUsuarioRepository` (master, para nombres)
- DOD: T4.3 en GREEN

**T4.5** — [RED] Unit test `TicketsPorTipoUseCase`
- Archivos: `backend/src/reportes/application/use-cases/tickets-por-tipo.use-case.spec.ts` (nuevo)
- Tests:
  - Los 3 tipos (SOPORTE, COMPRAS, EDILICIA) ALWAYS en respuesta, incluso con `total: 0`
  - Filtra por `cicloId`
  - Excluye soft-deleted
  - Sin ciclo activo y sin `cicloId` → error 422
  - Aislamiento: no mezcla tenants

**T4.6** — [GREEN] Implementar `TicketsPorTipoUseCase`
- Archivos: `backend/src/reportes/application/use-cases/tickets-por-tipo.use-case.ts` (nuevo)
- Los 3 tipos fijos deben estar representados aunque el LEFT JOIN no retorne filas (merge en app layer)
- DOD: T4.5 en GREEN

**T4.7** — [RED] Unit test `TicketsPorEstadoUseCase`
- Archivos: `backend/src/reportes/application/use-cases/tickets-por-estado.use-case.spec.ts` (nuevo)
- Tests:
  - TODOS los estados del catálogo (10) en respuesta, incluso con `total: 0`
  - Incluye terminales (RESUELTO, SIN_SOLUCION, RECHAZADO)
  - Excluye soft-deleted
  - `ABIERTO: 3` si 5 tickets pero 2 tienen `deleted_at IS NOT NULL`
  - Filtra por `cicloId`

**T4.8** — [GREEN] Implementar `TicketsPorEstadoUseCase`
- Archivos: `backend/src/reportes/application/use-cases/tickets-por-estado.use-case.ts` (nuevo)
- Los 10 estados deben estar siempre presentes (merge catálogo + query en app layer)
- DOD: T4.7 en GREEN

**T4.9** — [RED] Unit test `TiempoResolucionUseCase`
- Archivos: `backend/src/reportes/application/use-cases/tiempo-resolucion.use-case.spec.ts` (nuevo)
- Tests:
  - `{ promedioDias: 4.0, totalResueltos: 3 }` con 3 tickets RESUELTOS (2+4+6 días)
  - Excluye RECHAZADO del cálculo
  - Solo tickets con `fecha_cierre IS NOT NULL`
  - Sin tickets resueltos → `{ promedioDias: null, totalResueltos: 0 }` (no error, no división por cero)
  - Filtra por `cicloId`
  - Granularidad DÍA (fecha_cierre - created_at::date). Decisión D2.

**T4.10** — [GREEN] Implementar `TiempoResolucionUseCase`
- Archivos: `backend/src/reportes/application/use-cases/tiempo-resolucion.use-case.ts` (nuevo)
- DOD: T4.9 en GREEN; cero errores de división por cero

**T4.11** — Implementar `PrismaReportesRepository`
- Archivos:
  - `backend/src/reportes/infrastructure/persistence/prisma/prisma-reportes.repository.ts` (nuevo)
- Queries sobre tenant Prisma client:
  - `ticketsPorSolicitante`: `GROUP BY solicitante_id WHERE ciclo_id=X AND deleted_at IS NULL`
  - `ticketsPorAsignado`: `GROUP BY asignado_id WHERE ciclo_id=X AND deleted_at IS NULL`
  - `ticketsPorTipo`: query + merge con catálogo fijo (SOPORTE, COMPRAS, EDILICIA)
  - `ticketsPorEstado`: query + merge con catálogo fijo (10 estados)
  - `tiempoResolucionPromedioDias`: `AVG(DATE(fecha_cierre) - DATE(created_at)) WHERE estado IN (RESUELTO, SIN_SOLUCION) AND fecha_cierre IS NOT NULL AND deleted_at IS NULL`
  - `cicloActivo`: `SELECT id FROM ciclos_cliente WHERE activo=true LIMIT 1`
- DOD: compila; queries retornan shapes correctos

**T4.12** — [RED] Test integración `ReportesController`
- Archivos: `backend/src/reportes/interface/controllers/reportes.controller.spec.ts` (nuevo)
- Tests (selección representativa):
  - `GET /reportes/tickets-por-usuario` ADMINISTRADOR → 200 con `{ porSolicitante, porAsignado }`
  - `GET /reportes/tickets-por-usuario` con TECNICO → 403
  - `GET /reportes/tickets-por-tipo` sin ciclo activo, sin cicloId → 422
  - `GET /reportes/tickets-por-estado` con `cicloId` → filtra correctamente
  - `GET /reportes/tiempo-resolucion` → `{ promedioDias, totalResueltos }`
  - Ningún endpoint produce write en DB
  - is_global_admin + X-Tenant-Id → 200 con datos del tenant objetivo
- Spec ref: `reportes` (todos los requirements)

**T4.13** — [GREEN] Crear `ReportesController`
- Archivos:
  - `backend/src/reportes/interface/controllers/reportes.controller.ts` (nuevo)
  - `backend/src/reportes/interface/dtos/reporte-response.dto.ts` (nuevo)
- Guards a nivel de controlador: `JwtAuthGuard, TenantGuard, AdminOrGlobalGuard`
- Query param `cicloId` (opcional UUID) en todos los endpoints
- Rutas: `@Controller('reportes')`:
  - `GET /tickets-por-usuario`
  - `GET /tickets-por-tipo`
  - `GET /tickets-por-estado`
  - `GET /tiempo-resolucion`
- DOD: T4.12 en GREEN

**T4.14** — Crear `ReportesModule` y registrar en `AppModule`
- Archivos:
  - `backend/src/reportes/reportes.module.ts` (nuevo)
  - `backend/src/app.module.ts` (modificar)
- DOD: módulo compila; `pnpm test` pasa en backend completo

---

## PR5 — Frontend shell + TenantContext + selectores + BFF fix + sidebar dinámico

> Specs satisfechas: `admin-ui` (TenantContext, selectores, sidebar, middleware, estado "Elegí un cliente")
> Depende de: PR1 (is_global_admin en JWT), PR2 (GET /clientes, GET /ciclos disponibles)
> Estimado: ~640 líneas cambiadas ⚠️ RIESGO ALTO — ver Forecast

### Notas de arquitectura PR5

- BFF fix (T5.1-T5.2) es CRÍTICO — sin él el cross-tenant del operador no funciona.
- TenantContext vive en `shared/providers/`. Se agrega al árbol de providers del dashboard.
- Feature-flag sidebar: env var `NEXT_PUBLIC_ADMIN_PANEL=true` (sin ella, sidebar igual al actual).
- Para usuarios regulares, `TenantContext` se inicializa desde el JWT (`cliente_id`) y fetch del ciclo activo.
- Para el operador, `clienteId` comienza en `null` (estado "Elegí un cliente").

### T5.1 y T5.2 primero — son el desbloqueo crítico

**T5.1** — [x] [RED] Test BFF: `x-tenant-id` se reenvía al backend
- Archivos: `frontend/src/app/api/[...path]/route.test.ts` (modificar)
- Tests:
  - Request con `x-tenant-id: some-uuid` → el fetch al backend incluye `x-tenant-id: some-uuid`
  - Request sin `x-tenant-id` → no se agrega header artificial
  - Headers `content-type` y `accept` siguen siendo reenviados (no-regression)
- Spec ref: ADR-3 del design

**T5.2** — [x] [GREEN] Agregar `x-tenant-id` a `ALLOWED_HEADERS` en BFF
- Archivos: `frontend/src/app/api/[...path]/route.ts` (modificar)
- Cambio: agregar `"x-tenant-id"` al Set `ALLOWED_HEADERS`
- DOD: T5.1 en GREEN; `tsc --noEmit` pasa

**T5.3** — [x] [RED] Test `TenantContext`
- Archivos: `frontend/src/shared/providers/tenant-context.test.tsx` (nuevo)
- Tests:
  - Se inicializa con `clienteId` del JWT para usuario regular; `cicloId` = ciclo activo
  - Operador: `clienteId = null` en primera carga (sin cliente pre-seleccionado)
  - `setCliente(clienteId, clienteNombre)` actualiza contexto y dispara re-fetch de ciclos
  - `setCiclo(cicloId, cicloNombre)` actualiza `cicloId` en contexto
  - Todos los campos expuestos: `{ clienteId, clienteNombre, cicloId, cicloNombre, setCliente, setCiclo }`

**T5.4** — [x] [GREEN] Crear `TenantContext` provider
- Archivos: `frontend/src/shared/providers/tenant-context.tsx` (nuevo)
- `TenantContextValue`: `{ clienteId: string | null, clienteNombre: string | null, cicloId: string | null, cicloNombre: string | null, setCliente, setCiclo }`
- Inicialización según rol del usuario (leído desde `useSession`)
- DOD: T5.3 en GREEN

**T5.5** — [x] Integrar TenantContext en providers y layout
- Archivos:
  - `frontend/src/shared/providers/providers.tsx` (modificar — agregar `TenantContextProvider`)
  - `frontend/src/app/(dashboard)/layout.tsx` (verificar que providers envuelven correctamente)
- DOD: TenantContext disponible en todos los componentes del dashboard; tsc pasa

**T5.6** — [x] [RED] Test hooks `useClientes` y `useCiclos`
- Archivos:
  - `frontend/src/features/admin/hooks/use-clientes.test.ts` (nuevo)
  - `frontend/src/features/admin/hooks/use-ciclos.test.ts` (nuevo)
- Tests useClientes:
  - Llama a `GET /clientes`; retorna lista; maneja loading/error
  - Solo disponible para is_global_admin (test de precondición)
- Tests useCiclos:
  - Llama a `GET /ciclos` con `X-Tenant-Id` del TenantContext cuando hay clienteId
  - Default ciclo activo en respuesta
  - Re-fetch cuando `clienteId` cambia

**T5.7** — [x] [GREEN] Implementar hooks `useClientes` y `useCiclos`
- Archivos:
  - `frontend/src/features/admin/hooks/use-clientes.ts` (nuevo)
  - `frontend/src/features/admin/hooks/use-ciclos.ts` (nuevo)
- DOD: T5.6 en GREEN; usan `apiFetch` del cliente compartido

**T5.8** — [x] [RED] Test `ClienteSelector` component
- Archivos: `frontend/src/features/admin/components/ClienteSelector.test.tsx` (nuevo)
- Tests:
  - Renderizado solo para `isGlobalAdmin=true`; `null` para otros usuarios
  - Skeleton durante carga de opciones
  - Selección actualiza `TenantContext.clienteId + clienteNombre`
  - Cambio de cliente → resetea selector de ciclo al ciclo activo del nuevo cliente
  - Estado de carga correcto (disabled mientras carga)
- Spec ref: `admin-ui/Selectores — Operador ve ambos selectores`

**T5.9** — [x] [GREEN] Crear `ClienteSelector` component
- Archivos: `frontend/src/features/admin/components/ClienteSelector.tsx` (nuevo)
- Design: combobox/dropdown, glassmorphism card, premium dual mode, skeleton loader
- DOD: T5.8 en GREEN; accesible (aria-label, keyboard nav)

**T5.10** — [x] [RED] Test `CicloSelector` component
- Archivos: `frontend/src/features/admin/components/CicloSelector.test.tsx` (nuevo)
- Tests:
  - Renderizado para `isGlobalAdmin` y `ADMINISTRADOR`; ausente para USUARIO
  - Default = ciclo activo
  - Selección actualiza `TenantContext.cicloId + cicloNombre`
  - Re-fetch de ciclos cuando `TenantContext.clienteId` cambia (cascade)
- Spec ref: `admin-ui/Selectores — Admin-cliente ve solo selector de Ciclo`

**T5.11** — [x] [GREEN] Crear `CicloSelector` component
- Archivos: `frontend/src/features/admin/components/CicloSelector.tsx` (nuevo)
- DOD: T5.10 en GREEN

**T5.12** — [x] [RED] Test `Sidebar` dinámico por rol
- Archivos: `frontend/src/components/shell/sidebar.test.tsx` (nuevo o modificar)
- Tests:
  - `isGlobalAdmin=true` → sección ADMINISTRACIÓN con: Clientes, Ciclos, Usuarios, Reportes (en orden)
  - `ADMINISTRADOR (is_global_admin=false)` → sección con: Ciclos, Usuarios, Reportes (sin Clientes)
  - `USUARIO` → sin sección ADMINISTRACIÓN; sin divider; 4 ítems operativos (no-regression)
  - Ítem activo → `aria-current="page"` (un único ítem activo)
  - Label ADMINISTRACIÓN: `text-xs tracking-wider` uppercase
  - Divider es ultra-thin (clase Tailwind)
  - Sin feature flag → sidebar igual al actual (no-regression)
- Spec ref: `admin-ui/Sección ADMINISTRACIÓN condicional`

**T5.13** — [x] [GREEN] Modificar `Sidebar` para ser dinámico
- Archivos: `frontend/src/components/shell/sidebar.tsx` (modificar)
- Container pattern: lee `useSession({ isGlobalAdmin, roles })` + TenantContext
- Renderiza `ClienteSelector` y `CicloSelector` según nivel
- Sección ADMINISTRACIÓN con divider + label debajo de selectores, sobre sección operativa
- Feature flag: `process.env.NEXT_PUBLIC_ADMIN_PANEL === 'true'` como gate
- DOD: T5.12 en GREEN; 4 ítems operativos siguen sin cambios para usuarios no-admin

**T5.14** — [x] [RED] Test: protección de rutas `/admin/*` en middleware
- Archivos: `frontend/src/middleware.test.ts` (modificar)
- Tests:
  - `/admin/clientes` con `isGlobalAdmin=false` (ADMINISTRADOR) → redirect `/tickets`
  - `/admin/clientes` sin auth → redirect `/login`
  - `/admin/ciclos` con ADMINISTRADOR (no global admin) → pasa (no redirect)
  - `/admin/reportes` con is_global_admin → pasa
- Spec ref: `admin-ui/Pantalla Clientes — Protección de ruta`

**T5.15** — [x] [GREEN] Agregar protección `/admin/*` en `middleware.ts`
- Archivos: `frontend/src/middleware.ts` (modificar)
- Regla: `/admin/clientes` requiere `is_global_admin=true`; resto de `/admin/*` requiere auth básica
- DOD: T5.14 en GREEN; rutas no-admin no son afectadas

**T5.16** — [x] [RED] Test: estado "Elegí un cliente" en dashboard
- Archivos: `frontend/src/app/(dashboard)/page.test.tsx` (nuevo o modificar)
- Tests:
  - Operador con `clienteId=null` → placeholder "Elegí un cliente" visible; nav operativa deshabilitada
  - Operador selecciona cliente → placeholder desaparece; nav operativa activa
  - No-operador → nunca ve placeholder (contexto ya resuelto desde JWT)
- Spec ref: `admin-ui/Estado "Elegí un cliente"`

**T5.17** — [x] [GREEN] Implementar estado "Elegí un cliente"
- Archivos:
  - `frontend/src/app/(dashboard)/page.tsx` (modificar)
  - Posiblemente: `frontend/src/components/shell/empty-client-state.tsx` (nuevo componente)
- Lógica: si `isGlobalAdmin && !TenantContext.clienteId` → mostrar placeholder
- DOD: T5.16 en GREEN

---

## PR6 — Pantallas admin: Clientes, Ciclos, Usuarios, Reportes

> Specs satisfechas: `admin-ui` (pantallas, formularios, estados UI, @media print)
> Depende de: PR5 (TenantContext, sidebar, hooks base)
> Estimado: ~1100 líneas cambiadas ⚠️ RIESGO MUY ALTO — ver Forecast
> RECOMENDACIÓN: implementar en 4 work-unit commits internos (uno por pantalla)

### Convenciones de diseño (CLAUDE.md §3) para todas las pantallas

- Layout: filas-tarjeta (NO tablas HTML densas), glassmorphism cards, bordes ultra-finos
- Skeleton loader durante carga. Empty state con ilustración + acción primaria.
- Botones con estado loading (disabled + spinner interno) al submit.
- Modo dual dark+light en todos los componentes.
- Tailwind v4, Lucide icons, Radix UI/Shadcn.

### Grupo A: Pantalla Clientes (solo operador)

**T6.1** — [x] [RED] Test `ClientesPage`
- Archivos: `frontend/src/features/admin/components/ClientesPage.test.tsx` (nuevo)
- Tests:
  - Skeleton durante `GET /clientes`
  - Renderiza filas-tarjeta: nombre, badge activo/suspendido, db_name, acciones
  - Empty state: ilustración + "No hay clientes registrados" + botón "Nuevo cliente"
  - "Nuevo cliente" → abre formulario con campos: nombre, db_name, email admin, nombre admin, apellido admin, contraseña admin
  - Submit → loading state en botón
  - On success → toast éxito + refetch lista
  - `db_name` duplicado → "Ese identificador de DB ya existe"
  - Error genérico → muestra mensaje del servidor
- Spec ref: `admin-ui/Pantalla Clientes`

**T6.2** — [x] [GREEN] Implementar pantalla Clientes
- Archivos:
  - `frontend/src/app/(dashboard)/admin/clientes/page.tsx` (nuevo)
  - `frontend/src/features/admin/components/ClientesPage.tsx` (nuevo)
  - `frontend/src/features/admin/hooks/use-crear-cliente.ts` (nuevo)
  - `frontend/src/features/admin/types.ts` (nuevo — types compartidos del módulo admin)
- DOD: T6.1 en GREEN; diseño premium dual; skeleton/empty/interactive states
- Nota de implementación (PR6a): `types.ts` ya existía de PR5 (`Cliente` cubría todos
  los campos necesarios) — no requirió extensión. Se agregaron acciones
  Suspender/Reactivar (DELETE/PUT ya existentes en `ClientesController` de PR2) para
  cumplir el bullet "acciones" de la fila-tarjeta del spec `admin-ui/Pantalla
  Clientes`, implementadas inline en `ClientesPage.tsx` (sin hooks adicionales, fuera
  del file-list original) para no ampliar el scope de archivos. Formulario con estado
  controlado simple (`useState`), no react-hook-form + zod — no había validación
  cliente-side requerida por el spec.

### Grupo B: Pantalla Ciclos

**T6.3** — [x] [RED] Test `CiclosPage`
- Archivos: `frontend/src/features/admin/components/CiclosPage.test.tsx` (nuevo)
- Tests:
  - Filas-tarjeta: nombre, fechaInicio, fechaFin, badge activo (emerald) / inactivo
  - Botón "Activar" solo en ciclos inactivos → llama PATCH /ciclos/:id/activar
  - "Activar" entra en loading durante request
  - On success → refetch; ciclo activo tiene badge emerald; anteriores inactivos
  - On error → toast con mensaje
  - "Nuevo ciclo" → formulario con: nombre, fechaInicio (date picker), fechaFin (date picker)
  - On overlap error → "Las fechas solapan con un ciclo existente"
  - On success creación → ciclo agregado (inactivo)
  - Operador ve ciclos del cliente seleccionado en TenantContext (X-Tenant-Id en request)
- Spec ref: `admin-ui/Pantalla Ciclos`

**T6.4** — [x] [GREEN] Implementar pantalla Ciclos
- Archivos:
  - `frontend/src/app/(dashboard)/admin/ciclos/page.tsx` (nuevo)
  - `frontend/src/features/admin/components/CiclosPage.tsx` (nuevo)
  - `frontend/src/features/admin/hooks/use-ciclos-admin.ts` (nuevo)
  - `frontend/src/features/admin/hooks/use-activar-ciclo.ts` (nuevo)
  - `frontend/src/features/admin/hooks/use-crear-ciclo.ts` (nuevo)
- DOD: T6.3 en GREEN; inyecta `X-Tenant-Id` desde TenantContext cuando `clienteId` está presente

### Grupo C: Pantalla Usuarios

**T6.5** — [RED] Test `UsuariosPage`
- Archivos: `frontend/src/features/admin/components/UsuariosPage.test.tsx` (nuevo)
- Tests:
  - Filas-tarjeta: nombre+apellido, email, badge rol, badge activo/inactivo
  - MUST NOT mostrar campo relacionado con contraseña
  - "Dar de baja" → dialog de confirmación (acción destructiva)
  - On confirmar → PATCH /usuarios/:id/baja → badge inactivo actualizado
  - On cancelar → sin acción
  - "Dar de baja" deshabilitado para el usuario autenticado (propio)
  - "Nuevo usuario" → formulario: nombre, apellido, email, rol (selector 4 opciones), contraseña
  - On submit → loading state
  - On success → usuario en lista con badge activo
  - Email duplicado → "Este email ya está registrado"
- Spec ref: `admin-ui/Pantalla Usuarios`

**T6.6** — [GREEN] Implementar pantalla Usuarios
- Archivos:
  - `frontend/src/app/(dashboard)/admin/usuarios/page.tsx` (nuevo)
  - `frontend/src/features/admin/components/UsuariosPage.tsx` (nuevo)
  - `frontend/src/features/admin/hooks/use-usuarios-admin.ts` (nuevo)
  - `frontend/src/features/admin/hooks/use-crear-usuario.ts` (nuevo)
  - `frontend/src/features/admin/hooks/use-baja-usuario.ts` (nuevo)
- DOD: T6.5 en GREEN; `disabled` en "Dar de baja" propio con `user.sub === userId`

### Grupo D: Pantalla Reportes

**T6.7** — [RED] Test `ReportesPage`
- Archivos: `frontend/src/features/admin/components/ReportesPage.test.tsx` (nuevo)
- Tests:
  - Emite 4 fetches paralelos con `cicloId` del TenantContext
  - 4 secciones skeleton durante carga
  - Cambio de ciclo (TenantContext.cicloId) → re-fetcha los 4 reportes
  - Fallo de UN reporte → esa sección muestra error inline + "Reintentar"; las otras 3 renderizan
  - HTTP 422 → "No hay ciclo activo. Seleccioná un ciclo para ver los reportes."
  - Ciclo sin tickets → "Sin datos para este ciclo" por sección
  - `@media print`: sidebar ausente, botones ausentes, fondo blanco, texto negro, borders visibles en cards
  - Tickets-por-usuario: DOS tablas/listas — "Por solicitante" y "Por asignado"
  - Nombres de usuario presentes (enriquecidos por backend)
- Spec ref: `admin-ui/Pantalla Reportes`; Decisiones D2, D3

**T6.8** — [GREEN] Implementar pantalla Reportes
- Archivos:
  - `frontend/src/app/(dashboard)/admin/reportes/page.tsx` (nuevo)
  - `frontend/src/features/admin/components/ReportesPage.tsx` (nuevo)
  - `frontend/src/features/admin/hooks/use-reportes.ts` (nuevo)
  - CSS: estilos `@media print` en `globals.css` o módulo CSS dedicado
- Arquitectura: 4 secciones independientes con error boundaries individuales
- `Promise.allSettled` para fetch paralelo sin fallo en cascada
- DOD: T6.7 en GREEN; `@media print` verificado; dual mode completo

---

## Review Workload Forecast

| PR | Scope | Estimado | Riesgo 400L | Decisión |
|----|-------|----------|-------------|----------|
| PR1 | GlobalAdminGuard + guards + migration + JWT front | ~160 loc | BAJO ✅ | Proceed |
| PR2 | Backend clientes + ciclos tenant (domain + repo + controller) | ~680 loc | ALTO ⚠️ | auto-chain: implementar como PR único; work-unit commits internos por capa (domain → repo → controller) |
| PR3 | Backend usuarios (crear + listar + baja) | ~390 loc | BORDERLINE | Proceed con trabajo ordenado |
| PR4 | Backend reportes (módulo completo, 4 use cases) | ~580 loc | ALTO ⚠️ | auto-chain: work-unit commits por caso de uso |
| PR5 | Shell + TenantContext + selectores + BFF + middleware | ~640 loc | ALTO ⚠️ | auto-chain: BFF fix primero (crítico), luego TenantContext, luego UI |
| PR6 | 4 pantallas admin + hooks + tests | ~1100 loc | MUY ALTO ❌ | auto-chain: 4 work-unit commits internos (Clientes → Ciclos → Usuarios → Reportes); considerar size:exception |

**Chained PRs recommended**: Sí para PR2, PR4, PR5, PR6  
**400-line budget risk**: HIGH en PR2, PR4, PR5; VERY HIGH en PR6  
**Decision needed before apply**: No (delivery = auto-chain; sdd-apply avanza slice a slice)  
**Estrategia recomendada**: PRs 2-6 usan work-unit commits internos agrupando cambios lógicos. PR6 puede ser el candidato a `size:exception` si el repo tiene esa convención.

---

## Dependency Graph (parallelism)

```
[PR1] ──► [PR2]─┐
         [PR3]  ├─► [PR5] ──► [PR6]
         [PR4]─┘
```

PR2, PR3, PR4: paralelizables entre sí (después de merge de PR1).
PR5: espera PR1 (is_global_admin en JWT) + PR2 (endpoints /clientes y /ciclos disponibles).
PR6: espera PR5.

---

## Risks

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| Controllers abiertos hasta PR1 | CRÍTICO | PR1 es el primer slice y debe mergearse urgente |
| `ciclo:gestionar` no existe en seed RBAC | ALTO | T2.16 verifica y agrega si falta |
| BFF descarta `x-tenant-id` hasta PR5 | ALTO | T5.2 lo corrige; documentar que cross-tenant no funciona hasta PR5 |
| PR6 > 1000 líneas (4 páginas completas) | ALTO | work-unit commits por pantalla; posible size:exception |
| `BajaUsuarioUseCase` puede no cubrir todos los escenarios del spec | MEDIO | T3.6 audita y extiende; specs definen todos los casos |
| Name enrichment cross-module (reportes → master usuarios) | MEDIO | `TicketsPorUsuarioUseCase` inyecta `IUsuarioRepository` del módulo auth; verificar que AuthModule exporta el repositorio |
