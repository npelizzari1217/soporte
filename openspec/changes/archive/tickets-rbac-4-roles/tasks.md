# Tasks: tickets-rbac-4-roles (Change B)

> Generado por: sdd-tasks  
> Fecha: 2026-06-29  
> Depends on: Change A `tickets-maquina-estados-observaciones` (ARCHIVED)  
> Delivery: auto-chain · 5 PRs (PR4 del design dividido en PR4a + PR4b por presupuesto)  
> TDD: STRICT RED → GREEN · runner `pnpm test` (Vitest, `backend/`)  
> Schema afectada: MASTER (todas las migraciones corren en `prisma_master`, cero fan-out tenant)

---

## UUID Reference — AUTORITATIVO (override del spec file)

> La spec `specs/auth-rbac/spec.md` usa `a0..001–004` para los nuevos roles,
> pero esos UUIDs ya están tomados por los legacy (verificado en
> `20260623010000_seed_rbac_base/migration.sql`):
> ADMIN=001, SOPORTE_IT=002, MANTENIMIENTO=003, APROBADOR_COMPRAS=004, SOLICITANTE=005.
> El próximo UUID libre es **a0..006**.

| Entidad | codigo | UUID determinista |
|---------|--------|-------------------|
| Role | `USUARIO` | `a0000000-0000-4000-a000-000000000006` |
| Role | `COLABORADOR` | `a0000000-0000-4000-a000-000000000007` |
| Role | `TECNICO` | `a0000000-0000-4000-a000-000000000008` |
| Role | `ADMINISTRADOR` | `a0000000-0000-4000-a000-000000000009` |
| Permiso | `ciclo:gestionar` | `b0000000-0000-4000-b000-000000000018` |
| Permiso | `ticket:comentar` | `b0000000-0000-4000-b000-000000000019` |

**Contrato fijo Change A (NO recrear, referenciar por código exacto):**

| codigo | UUID |
|--------|------|
| `ticket:observar` | `b0000000-0000-4000-b000-000000000014` |
| `ticket:transicionar` | `b0000000-0000-4000-b000-000000000015` |
| `ticket:aprobar` | `b0000000-0000-4000-b000-000000000016` |
| `ticket:rechazar` | `b0000000-0000-4000-b000-000000000017` |

---

## Matriz acumulativa completa (PR1 seed)

| Permiso | USUARIO | COLABORADOR | TECNICO | ADMINISTRADOR |
|---------|:-------:|:-----------:|:-------:|:-------------:|
| `ticket:crear` (b0..001) | ✅ | ✅ | ✅ | ✅ |
| `ticket:comentar` (b0..019, NEW) | ✅ | ✅ | ✅ | ✅ |
| `ticket:ver_todos` (b0..004) | — | ✅ | ✅ | ✅ |
| `compra:gestionar` (b0..006) | — | ✅ | ✅ | ✅ |
| `compra:aprobar` (b0..005) | — | ✅ | ✅ | ✅ |
| `ticket:aprobar` (b0..016) | — | ✅ | ✅ | ✅ |
| `ticket:rechazar` (b0..017) | — | ✅ | ✅ | ✅ |
| `ticket:editar` (b0..012) | — | — | ✅ | ✅ |
| `ticket:transicionar` (b0..015) | — | — | ✅ | ✅ |
| `ticket:observar` (b0..014) | — | — | ✅ | ✅ |
| `ticket:asignar` (b0..002) | — | — | ✅ | ✅ |
| `ticket:cerrar` (b0..003) | — | — | ✅ | ✅ |
| `equipo:gestionar` (b0..008) | — | — | ✅ | ✅ |
| `subtarea:actualizar` (b0..007) | — | — | ✅ | ✅ |
| `ticket:eliminar` (b0..013) | — | — | — | ✅ |
| `usuario:gestionar` (b0..009) | — | — | — | ✅ |
| `rol:asignar` (b0..010) | — | — | — | ✅ |
| `cliente:gestionar` (b0..011) | — | — | — | ✅ |
| `ciclo:gestionar` (b0..018, NEW) | — | — | — | ✅ |

Totales por rol: USUARIO=2, COLABORADOR=7, TECNICO=14, ADMINISTRADOR=19.

---

## PR1 — Seed 4 roles + 2 permisos + matriz acumulativa

**Branch:** `feat/rbac-seed-4-roles`  
**Dependencia de deploy:** ninguna (INSERT ON CONFLICT DO NOTHING, seguro en cualquier momento)  
**Spec ref principal:** `specs/auth-rbac/spec.md` §Catálogo de roles, §Catálogo de permisos, §Matriz rol→permisos  
**Design ref:** ADR-1

| ID | Tipo | Descripción | Archivo(s) | Spec / ADR | Paralelo |
|----|------|-------------|------------|------------|----------|
| T1.1 | RED | [x] Test de integración: los 4 nuevos roles existen con UUIDs a0..006–009 (NOT 001–004); `deleted_at IS NULL`; 4 filas exactas | `backend/src/auth/infrastructure/persistence/prisma/rbac-4-roles-seed.integration.spec.ts` (NEW) | spec §Los 4 roles existen con UUIDs deterministas | — |
| T1.2 | RED | [x] Test: `ciclo:gestionar`=b0..018 y `ticket:comentar`=b0..019 sembrados; `deleted_at IS NULL` | mismo archivo | spec §ticket:comentar / §ciclo:gestionar sembrados con UUID determinista | en paralelo con T1.1 |
| T1.3 | RED | [x] Test: USUARIO tiene EXACTAMENTE `ticket:crear`+`ticket:comentar` — NOT `ticket:observar`, NOT `ticket:aprobar/rechazar` | mismo archivo | spec §USUARIO obtiene exactamente sus 2 permisos base | después de T1.1 |
| T1.4 | RED | [x] Test: COLABORADOR acumula permisos de USUARIO + `ticket:ver_todos`, `compra:gestionar`, `compra:aprobar`, `ticket:aprobar`(b0..016), `ticket:rechazar`(b0..017) — NOT `ticket:observar`, NOT `ticket:editar` | mismo archivo | spec §COLABORADOR acumula permisos | después de T1.1 |
| T1.5 | RED | [x] Test: TECNICO acumula permisos de COLABORADOR + `ticket:editar`, `ticket:transicionar`(b0..015), `ticket:observar`(b0..014), `ticket:asignar`, `ticket:cerrar`, `equipo:gestionar`, `subtarea:actualizar` — NOT `ticket:eliminar`, NOT `ciclo:gestionar` | mismo archivo | spec §TECNICO acumula permisos | después de T1.1 |
| T1.6 | RED | [x] Test: ADMINISTRADOR tiene los 19 permisos incluyendo `ticket:eliminar`, `usuario:gestionar`, `rol:asignar`, `cliente:gestionar`, `ciclo:gestionar`(b0..018) | mismo archivo | spec §ADMINISTRADOR obtiene todos los permisos | después de T1.1 |
| T1.7 | RED | [x] Test: idempotencia — re-ejecutar el mismo SQL no modifica row counts en `roles`, `permisos`, `roles_permisos`; migración completa sin error | mismo archivo | spec §Seed de roles_permisos es idempotente | después de T1.1 |
| T1.8 | RED | [x] Test: contrato Change A — TECNICO tiene asociación con `ticket:observar` UUID `b0..014` Y `ticket:transicionar` UUID `b0..015` exactos | mismo archivo | spec §Contrato Change A — UUIDs exactos | después de T1.1 |
| T1.9 | RED | [x] Test: USUARIO NO tiene `ticket:observar` NI `ticket:transicionar` NI `ticket:aprobar`/`rechazar` (invariante "solo Técnico cambia estado") | mismo archivo | spec §USUARIO no recibe ticket:observar | después de T1.1 |
| T1.10 | IMPL | [x] Crear migración: INSERT roles USUARIO/COLABORADOR/TECNICO/ADMINISTRADOR (a0..006–009) `ON CONFLICT (codigo) DO NOTHING`; INSERT permisos `ciclo:gestionar`/`ticket:comentar` (b0..018–019) `ON CONFLICT (codigo) DO NOTHING` | `backend/prisma_master/migrations/20260629100000_seed_rbac_4_roles/migration.sql` (NEW) | design ADR-1 | después de T1.1–T1.9 |
| T1.11 | IMPL | [x] Extender migración: INSERT `roles_permisos` (matriz acumulativa completa — 2+5+7+5=19 asociaciones únicas por rol) vía `SELECT JOIN ON codigo`; `ON CONFLICT (rol_id, permiso_id) DO NOTHING` | mismo archivo | design ADR-1; spec §Matriz rol→permisos | secuencial después de T1.10 |
| T1.12 | GREEN | [x] Aplicar migración en la DB de test (`soporte_master_test`) y confirmar que T1.1–T1.9 pasan; `pnpm test` sin regresiones en `rbac-seed.integration.spec.ts` existente | — | todos los escenarios de PR1 | después de T1.11 |

---

## PR2 — Remap usuarios_roles + freeze de roles legacy

**Branch:** `feat/rbac-remap-legacy-roles` (apunta a rama PR1)  
**Dependencia de deploy:** PR1 aplicado primero (los nuevos role IDs deben existir en `roles`)  
**Spec ref principal:** `specs/auth-rbac/spec.md` §Migración de usuarios_roles  
**Design ref:** ADR-3

| ID | Tipo | Descripción | Archivo(s) | Spec / ADR | Paralelo |
|----|------|-------------|------------|------------|----------|
| T2.1 | RED | [x] Test de integración: usuario con rol `ADMIN` tiene fila `(usuario_id, ADMINISTRADOR_id)` en `usuarios_roles` tras la migración | `backend/src/auth/infrastructure/persistence/prisma/rbac-remap-usuarios-roles.integration.spec.ts` (NEW) | spec §Usuario con ADMIN migra a ADMINISTRADOR | — |
| T2.2 | RED | [x] Test: usuario con `SOLICITANTE` → `USUARIO`; fila con `a0..006` | mismo archivo | spec §SOLICITANTE migra a USUARIO | después de T2.1 |
| T2.3 | RED | [x] Test: usuario con `SOPORTE_IT` → `TECNICO`; usuario con `MANTENIMIENTO` → `TECNICO`; usuario con AMBOS roles colapsa a UNA sola fila (ON CONFLICT DO NOTHING; no duplicados) | mismo archivo | spec §SOPORTE_IT migra a TECNICO; §MANTENIMIENTO migra a TECNICO | después de T2.1 |
| T2.4 | RED | [x] Test: usuario con `APROBADOR_COMPRAS` → `COLABORADOR` (`a0..007`) | mismo archivo | spec §APROBADOR_COMPRAS migra a COLABORADOR | después de T2.1 |
| T2.5 | RED | [x] Test: tras la migración, NINGÚN usuario tiene rows legacy en `usuarios_roles` (los 5 roles viejos están desasignados) | mismo archivo | spec §Migración de usuarios_roles idempotente | después de T2.1 |
| T2.6 | RED | [x] Test: los 5 roles legacy tienen `deleted_at IS NOT NULL` (soft-deleted); los 4 nuevos tienen `deleted_at IS NULL` | mismo archivo | design ADR-3 | después de T2.1 |
| T2.7 | RED | [x] Test: idempotencia — re-ejecutar la migración no cambia row counts en `usuarios_roles`; no error; `deleted_at` de legacy sigue not null (no overwrite con nueva timestamp) | mismo archivo | spec §Migración es idempotente | después de T2.1 |
| T2.8 | RED | [x] Test: usuario migrado (ex-APROBADOR_COMPRAS → COLABORADOR) puede invocar endpoint protegido por `ticket:aprobar`; NO puede invocar `ticket:observar` (exclusivo TECNICO) | mismo archivo | spec §Usuario migrado conserva capacidades operativas | después de T2.1 |
| T2.9 | IMPL | [x] Crear migración: INSERT INTO `usuarios_roles` (nuevas asignaciones) vía `SELECT r_new.id, u_r.usuario_id FROM usuarios_roles u_r JOIN roles r_old ON r_old.id=u_r.rol_id JOIN roles r_new ON r_new.codigo=<mapeo>` para los 5 pares; `ON CONFLICT (usuario_id, rol_id) DO NOTHING` | `backend/prisma_master/migrations/20260629110000_remap_usuarios_roles/migration.sql` (NEW) | design ADR-3 | después de T2.1–T2.8 |
| T2.10 | IMPL | [x] Extender migración: DELETE old `usuarios_roles` rows (eliminar filas con `rol_id` de roles legacy) | mismo archivo | design ADR-3 | secuencial después de T2.9 |
| T2.11 | IMPL | [x] Extender migración: `UPDATE roles SET deleted_at = now() WHERE codigo IN ('ADMIN','SOPORTE_IT','MANTENIMIENTO','APROBADOR_COMPRAS','SOLICITANTE') AND deleted_at IS NULL` (idempotente: guarda con `AND deleted_at IS NULL`) | mismo archivo | design ADR-3 | secuencial después de T2.10 |
| T2.12 | GREEN | [x] Aplicar migración en test DB y confirmar T2.1–T2.8 pasan; PR1 tests no regresionan — pnpm test 1731/1731 · lint clean · tsc clean | — | todos los escenarios de PR2 | después de T2.11 |

---

## PR3 — is_global_admin: columna + schema + JWT claim + TenantGuard cross-tenant + mass revoke

**Branch:** `feat/is-global-admin-cross-tenant` (apunta a rama PR2)  
**Dependencia de deploy:** PR2 aplicado (revocación masiva debe ocurrir con los nuevos permisos ya activos)  
**Spec ref principal:** `specs/auth-rbac/spec.md` §Admin global multi-tenant; §Invalidación JWT  
**Design ref:** ADR-4, ADR-5

> Nota sobre `test@example.com`: la columna DEFAULT FALSE siembre todos los usuarios en false.
> Para tests de integración/E2E cross-tenant, el fixture hace `UPDATE usuarios SET is_global_admin=true WHERE email='test@example.com'` directamente en el setup del test — no en la migración de producción.

| ID | Tipo | Descripción | Archivo(s) | Spec / ADR | Paralelo |
|----|------|-------------|------------|------------|----------|
| T3.1 | RED | [x] Unit test: LoginUseCase popula `is_global_admin: true` en JwtPayload cuando `usuario.isGlobalAdmin=true`; popula `false` cuando `false`; claims existentes (`sub`, `cliente_id`, etc.) siguen presentes (no regresión) | `backend/src/auth/application/use-cases/login.use-case.spec.ts` (MODIFY) | spec §JWT incluye claim is_global_admin | — |
| T3.2 | RED | [x] Unit test: TenantGuard — `is_global_admin=false` + header `X-Tenant-Id` presente → `ForbiddenException` (403); header ignorado pero la PRESENCIA con false es rechazo explícito | `backend/src/auth/infrastructure/guards/guards.spec.ts` (MODIFY) | spec §Usuario con is_global_admin=false nunca puede operar cross-tenant | paralelo con T3.1 |
| T3.3 | RED | [x] Unit test: TenantGuard — `is_global_admin=true` + `X-Tenant-Id` apunta a cliente existente y activo → resuelve ESE cliente; `TenantContext.bind` llamado con `clienteId=targetTenantId` | mismo archivo | spec §Admin global accede a tenant ajeno | después de T3.2 |
| T3.4 | RED | [x] Unit test: TenantGuard — `is_global_admin=true` + `X-Tenant-Id` cuyo cliente NO existe en master → `NotFoundException` (404) | mismo archivo | spec §Tenant objetivo inexistente rechazado con 404 | después de T3.2 |
| T3.5 | RED | [x] Unit test: TenantGuard — `is_global_admin=true` + SIN header → resuelve `cliente_id` propio (no regresión del comportamiento base) | mismo archivo | spec §Admin global sin tenant objetivo opera sobre su propio tenant | después de T3.2 |
| T3.6 | RED | [x] Unit test: TenantGuard — `is_global_admin=false` + SIN header → resuelve propio `cliente_id` (existing behavior preservado) | mismo archivo | spec §existing behavior no regression | después de T3.2 |
| T3.7 | IMPL | [x] Agregar `isGlobalAdmin Boolean @default(false) @map("is_global_admin")` al model `Usuario` | `backend/prisma_master/schema.prisma` (MODIFY) | design ADR-4 | después de T3.1–T3.6 |
| T3.8 | IMPL | [x] Crear migración: `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_global_admin BOOLEAN NOT NULL DEFAULT FALSE` | `backend/prisma_master/migrations/20260629120000_add_is_global_admin/migration.sql` (NEW) | design ADR-4; spec §Modelo de datos delta | después de T3.7 |
| T3.9 | IMPL | [x] Extender migración: revocación masiva `UPDATE refresh_tokens SET revoked_at = now() WHERE revoked_at IS NULL AND deleted_at IS NULL` | mismo archivo | design ADR-5; spec §Revocación masiva de refresh tokens; orchestrator override: revocación masiva SIN rotar secret (ventana stale ≤15min aceptada) | secuencial después de T3.8 |
| T3.10 | IMPL | [x] Agregar `is_global_admin: boolean` a interfaz `JwtPayload` (campo required, no nullable — backend) | `backend/src/auth/domain/ports/i-token.service.ts` (MODIFY) | spec §JwtPayload backend required | después de T3.7 |
| T3.11 | IMPL | [x] Actualizar helper `makePayload()` en guards.spec.ts para incluir `is_global_admin: false` como default (evita error TS tras T3.10); verificar que todos los tests existentes del archivo siguen pasando | `backend/src/auth/infrastructure/guards/guards.spec.ts` (MODIFY) | structural fix — prerequisito de T3.2–T3.6 | después de T3.10, antes de T3.13 |
| T3.12 | IMPL | [x] Leer `usuario.isGlobalAdmin` desde la entidad en LoginUseCase y setear `is_global_admin` en el JwtPayload que se pasa a `tokenService.signJwt` | `backend/src/auth/application/use-cases/login.use-case.ts` (MODIFY) | spec §JWT incluye claim is_global_admin | después de T3.10 |
| T3.13 | IMPL | [x] Modificar TenantGuard: (1) leer header `X-Tenant-Id` del request; (2) si present + `is_global_admin=false` → throw ForbiddenException; (3) si present + `is_global_admin=true` → lookup target cliente (activo + !deleted_at) → throw NotFoundException si no existe; (4) audit-log vía `Logger.log` cross-tenant access (who→which tenant); (5) bind TenantContext con targetId; (6) sin header → existing behavior | `backend/src/auth/infrastructure/guards/tenant.guard.ts` (MODIFY) | design ADR-4 | después de T3.11–T3.12 |
| T3.14 | GREEN | [x] `pnpm test` — T3.1–T3.6 pasan; tests previos de guards.spec.ts sin regresión; `rbac-seed` y `rbac-remap` integration tests sin regresión — 1740/1740 · lint clean · tsc clean | — | todos los escenarios de PR3 | después de T3.13 |

---

## PR4a — ComentarioNoPermitidoError + CrearComentarioUseCase + unit tests

**Branch:** `feat/crear-comentario-use-case` (puede apuntar a main si el código se desarrolla en paralelo con PR2/PR3)  
**Dependencia de deploy:** PR1 aplicado (ticket:comentar b0..019 debe existir en `permisos`; el use case no genera migración propia)  
**Desarrollo paralelo:** el código de PR4a NO depende del código de PR2/PR3 (módulo separado: `tickets/` vs `auth/`)  
**Spec ref principal:** `specs/tickets-core/spec.md` §CrearComentarioUseCase  
**Design ref:** ADR-2

> Estados permitidos para comentar: ABIERTO, APROBADO, EN_PROGRESO, SUSPENDIDO.  
> Estados bloqueados: RESUELTO, SIN_SOLUCION, RECHAZADO (terminales) + CERRADO, CANCELADO, PENDIENTE_APROBACION (congelados legacy).

| ID | Tipo | Descripción | Archivo(s) | Spec / ADR | Paralelo |
|----|------|-------------|------------|------------|----------|
| T4A.1 | RED | [x] Unit test: ticket no encontrado → `Result.fail(TicketNoEncontradoError)`; operacionRepo.save NO llamado | `backend/src/tickets/application/use-cases/crear-comentario.use-case.spec.ts` (NEW) | spec §Ticket no encontrado 404 | — |
| T4A.2 | RED | [x] Test: ticket en `RESUELTO` → `Result.fail(ComentarioNoPermitidoError)`; ticket en `SIN_SOLUCION` → mismo; ticket en `RECHAZADO` → mismo; operacionRepo.save NO llamado en ninguno | mismo archivo | spec §Comentar en estado terminal rechazado 422 | después de T4A.1 |
| T4A.3 | RED | [x] Test: ticket en `CERRADO` → `ComentarioNoPermitidoError`; ticket en `CANCELADO` → mismo; ticket en `PENDIENTE_APROBACION` → mismo | mismo archivo | spec §Comentar en ticket congelado rechazado 422 | después de T4A.1 |
| T4A.4 | RED | [x] Test: ticket en `ABIERTO` → `Result.ok(operacion)` con `tipo_operacion_id` correspondiente a `COMENTARIO` (f0..002); `ticketRepo.save` NOT llamado (sin cambio de estado); `transiciones_estado` NO creadas; `estadoAnteriorId=null`, `estadoNuevoId=null` | mismo archivo | spec §Usuario crea comentario en ABIERTO | después de T4A.1 |
| T4A.5 | RED | [x] Test: ticket en `APROBADO` → same as T4A.4 (comentario permitido); estado del ticket MUST NOT cambiar (a diferencia de CrearObservacionUseCase) | mismo archivo | spec §Comentar en APROBADO o EN_PROGRESO permitido | después de T4A.1 |
| T4A.6 | RED | [x] Test: ticket en `EN_PROGRESO` → permitido; ticket en `SUSPENDIDO` → permitido | mismo archivo | spec §Comentar en SUSPENDIDO permitido | después de T4A.1 |
| T4A.7 | IMPL | [x] Agregar `ComentarioNoPermitidoError` a `tickets.errors.ts`: `DomainError` subclass, `code='COMENTARIO_NO_PERMITIDO'`, mensaje describe el estado que bloquea | `backend/src/tickets/domain/errors/tickets.errors.ts` (MODIFY) | design ADR-2; spec §422 on terminal/frozen | después de T4A.1–T4A.6 |
| T4A.8 | IMPL | [x] Crear `CrearComentarioUseCase` con `CrearComentarioDto { ticketId, texto, autorId }`: (1) `ticketRepo.findById` → 404; (2) `estadoRepo.findById(ticket.estadoId)` → 500 si no existe; (3) bloqueo si estado en set de bloqueados → 422; (4) `tipoOperacionRepo.findIdByCodigo('COMENTARIO')` → 500 si missing; (5) crear `OperacionTicketEntity` con `estadoAnteriorId=null`, `estadoNuevoId=null`; (6) `operacionRepo.save(comentario)`; (7) `Result.ok(comentario)` — SIN txRunner (no hay writes en ticket) | `backend/src/tickets/application/use-cases/crear-comentario.use-case.ts` (NEW) | design ADR-2 | después de T4A.7 |
| T4A.9 | GREEN | [x] `pnpm test` — 1754/1754 passed (14 nuevos de PR4a); `crear-observacion.use-case.spec.ts` sin regresión; lint clean; tsc clean | — | todos los escenarios de PR4a | después de T4A.8 |

---

## PR4b — CrearComentarioDto + ComentariosController + module wiring + controller tests + no-regression observaciones

**Branch:** `feat/comentarios-endpoint` (apunta a rama PR4a)  
**Dependencia de deploy:** PR4a merged  
**Spec ref principal:** `specs/tickets-core/spec.md` §POST /tickets/:id/comentarios; §Invariante solo Técnico cambia estado  
**Design ref:** ADR-2

| ID | Tipo | Descripción | Archivo(s) | Spec / ADR | Paralelo |
|----|------|-------------|------------|------------|----------|
| T4B.1 | RED | [x] Unit test controller: `POST /tickets/:id/comentarios` → 201 con representación del comentario creado; delega a `CrearComentarioUseCase.execute` con `ticketId=params.id`, `autorId` del JWT, `texto` del body | `backend/src/tickets/interface/controllers/comentarios.controller.spec.ts` (NEW) | spec §Usuario crea comentario → 201 | — |
| T4B.2 | RED | [x] Test: sin `ticket:comentar` en JWT → PermissionsGuard rechaza 403 antes de ejecutar use case; operacionRepo.save NOT llamado | mismo archivo | spec §Request sin ticket:comentar rechazada 403 | después de T4B.1 |
| T4B.3 | RED | [x] Test: use case retorna `ComentarioNoPermitidoError` → controller mapea a HTTP 422 con mensaje de error descriptivo | mismo archivo | spec §Comentar en terminal 422 | después de T4B.1 |
| T4B.4 | RED | [x] Test: use case retorna `TicketNoEncontradoError` → controller mapea a HTTP 404 | mismo archivo | spec §Ticket no encontrado 404 | después de T4B.1 |
| T4B.5 | RED | [x] Test: body `{ contenido: "" }` o `{ contenido: "   " }` → DTO validation rechaza con 422 antes de invocar use case | mismo archivo | spec §Comentario con contenido vacío rechazado 422 | después de T4B.1 |
| T4B.6 | RED | [x] No-regression: USUARIO (tiene `ticket:comentar`, NO tiene `ticket:observar`) → `POST /tickets/:id/observaciones` → PermissionsGuard devuelve 403; COLABORADOR → mismo; TECNICO con `ticket:observar` → NO 403 | `backend/src/tickets/interface/controllers/operaciones.controller.spec.ts` (MODIFY — agregar casos) | spec §USUARIO → 403 observaciones; §COLABORADOR → 403; §TECNICO no-regresión | paralelo con T4B.1 |
| T4B.7 | IMPL | [x] Agregar `CrearComentarioRequestDto` (body: `contenido: @IsString @IsNotEmpty @Trim`) y `CrearComentarioDto` (application-level: `ticketId, texto, autorId`) a `tickets.dto.ts` | `backend/src/tickets/interface/dtos/tickets.dto.ts` (MODIFY) | design §Interfaces/Contracts | después de T4B.1–T4B.6 |
| T4B.8 | IMPL | [x] Crear `ComentariosController`: `@Controller('tickets')` `@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)`; `@Post(':id/comentarios') @RequirePermissions('ticket:comentar')`; extrae `autorId` del `@Request().user.sub`; mapea Result → 201/404/422 | `backend/src/tickets/interface/controllers/comentarios.controller.ts` (NEW) | design ADR-2 | después de T4B.7 |
| T4B.9 | IMPL | [x] Registrar `ComentariosController` en `controllers[]` y `CrearComentarioUseCase` en `providers[]` del `TicketsModule` | `backend/src/tickets/tickets.module.ts` (MODIFY) | design §File Changes | después de T4B.8 |
| T4B.10 | GREEN | [x] `pnpm test` — T4B.1–T4B.6 pasan; tickets.controller.spec, operaciones.controller.spec, crear-observacion.use-case.spec sin regresiones; pnpm test 1770/1770 · pnpm lint clean · tsc clean | — | todos los escenarios de PR4b | después de T4B.9 |

---

## Dependencias entre tareas

```
PR1 (T1.1–T1.12)
  └─► PR2 (T2.1–T2.12)          [migración PR2 requiere roles de PR1 en DB]
        └─► PR3 (T3.1–T3.14)    [mass revoke debe correr con nuevos permisos activos]

PR4a (T4A.1–T4A.9)              [código independiente — puede desarrollarse en paralelo con PR2/PR3]
  └─► PR4b (T4B.1–T4B.10)       [PR4b importa CrearComentarioUseCase de PR4a]
```

**Código paralelo permitido:** PR4a se puede desarrollar en paralelo con PR2 y PR3 (módulos distintos: `tickets/` vs `auth/`). Solo el DEPLOY es secuencial (PR1→PR2→PR3→PR4).

**Bottlenecks críticos:**
1. T1.10–T1.11 (migration SQL) debe completar antes de que T2.9 pueda verificar que los UUIDs existen en la DB de test.
2. T3.10 (add `is_global_admin` to `JwtPayload` interface) rompe TypeScript en `guards.spec.ts` hasta que T3.11 actualice `makePayload()` — estas dos tareas son secuenciales sin gap.
3. T4A.7 (`ComentarioNoPermitidoError`) es prerequisito de T4A.8 — sin el error class, el use case no compila.

---

## Review Workload Forecast

| PR | Archivos nuevos | Archivos modificados | Líneas estimadas | Budget risk | Decisión antes de apply |
|----|----------------|---------------------|-----------------|-------------|------------------------|
| PR1 | migration.sql (100L), seed.integration.spec.ts (250L) | — | ~350 | LOW | No |
| PR2 | migration.sql (65L), remap.integration.spec.ts (180L) | — | ~245 | LOW | No |
| PR3 | migration.sql (30L) | schema.prisma (+3L), i-token.service.ts (+3L), login.use-case.ts (+15L), login.use-case.spec.ts (+40L), guards.spec.ts (+120L), tenant.guard.ts (+55L) | ~266 | LOW | No |
| PR4a | crear-comentario.use-case.ts (90L), crear-comentario.use-case.spec.ts (175L) | tickets.errors.ts (+25L) | ~290 | LOW | No |
| PR4b | comentarios.controller.ts (55L), comentarios.controller.spec.ts (120L) | tickets.dto.ts (+15L), tickets.module.ts (+8L), operaciones.controller.spec.ts (+40L) | ~238 | LOW | No |
| **TOTAL** | | | **~1389** | — | — |

**Chained PRs recommended:** YES (5 PRs, auto-chain activo)  
**400-line budget risk:** LOW en todos los PRs — PR4 del design se dividió en PR4a+PR4b precisamente por esto; el split reduce ambos a ~290 y ~238 líneas respectivamente.  
**Decision needed before apply:** No. Auto-chain confirmado, todos los slices bajo presupuesto.

---

## Checklist de Definition of Done (por PR)

Antes de marcar cualquier PR como done:
- [ ] `pnpm test` corre y pasa — output real pegado (no "tests pass" sin evidencia)
- [ ] `pnpm lint` sin errores en `backend/`
- [ ] `tsc --noEmit` sin errores en `backend/`
- [ ] Migraciones son idempotentes (verificado con doble-run en test DB)
- [ ] Test RED escrito y confirmado como fallo ANTES de la implementación
- [ ] Commits en Conventional Commits sin Co-Authored-By ni atribución de AI
- [ ] Ningún `as any` ni `as unknown as` en código nuevo
