# Apply Progress: admin-general

> Última actualización: 2026-06-30 | PR1: mergeado en master | PR2: `feat/admin-general-pr2-clientes-ciclos`

## PR1 — Security guard + is_global_admin front + migración nestor

### Estado: COMPLETO (incluyendo correcciones W1+W2 del verify-report)

### Archivos modificados / creados

| Archivo | Acción |
|---------|--------|
| `backend/src/auth/infrastructure/guards/global-admin.guard.ts` | NUEVO |
| `backend/src/auth/infrastructure/guards/global-admin.guard.spec.ts` | NUEVO |
| `backend/src/auth/auth.module.ts` | MODIFICADO — GlobalAdminGuard en providers + exports |
| `backend/src/auth/auth.module.spec.ts` | NUEVO — 2 tests metadata reflection (W1) |
| `backend/src/clientes/interface/controllers/clientes.controller.ts` | MODIFICADO — @UseGuards(JwtAuthGuard) |
| `backend/src/clientes/interface/controllers/clientes.controller.spec.ts` | MODIFICADO — T1.3 tests |
| `backend/src/clientes/interface/controllers/ciclos-vigentes.controller.ts` | MODIFICADO — @UseGuards(JwtAuthGuard) |
| `backend/src/clientes/interface/controllers/ciclos-vigentes.controller.spec.ts` | NUEVO — T1.5 tests |
| `backend/src/clientes/clientes.module.ts` | MODIFICADO — imports AuthModule |
| `backend/prisma_master/migrations/20260630000000_set_global_admin_nestor/migration.sql` | NUEVO |
| `frontend/src/shared/api/types.ts` | MODIFICADO — is_global_admin?: boolean |
| `frontend/src/shared/api/types.test.ts` | MODIFICADO — T1.8 tests |
| `frontend/src/shared/hooks/use-session.ts` | MODIFICADO — isGlobalAdmin |
| `frontend/src/shared/hooks/use-session.test.ts` | NUEVO — T1.10 tests |
| `openspec/changes/admin-general/tasks.md` | MODIFICADO — T1.7 path corregido (W2) |

### Tasks completadas

- [x] T1.1 — [RED] Unit test GlobalAdminGuard (5 tests)
- [x] T1.2 — [GREEN] GlobalAdminGuard implementado (O(1), sin DB)
- [x] T1.3 — [RED] Test ClientesController con JwtAuthGuard
- [x] T1.4 — [GREEN] @UseGuards(JwtAuthGuard) en ClientesController
- [x] T1.5 — [RED] Test CiclosVigentesController con JwtAuthGuard
- [x] T1.6 — [GREEN] @UseGuards(JwtAuthGuard) en CiclosVigentesController
- [x] T1.7 — Migración idempotente nestor@sesitec.com.ar → is_global_admin=true
- [x] T1.8 — [RED] Test JwtPayload frontend incluye is_global_admin?: boolean
- [x] T1.9 — [GREEN] is_global_admin?: boolean en types.ts
- [x] T1.10 — isGlobalAdmin en useSession + tests
- [x] W1 — [RED→GREEN] GlobalAdminGuard registrado y exportado en AuthModule
- [x] W2 — Typo path T1.7 corregido en tasks.md (prisma/ → prisma_master/)

### Evidencia final (post W1+W2)

- Backend: **117 archivos, 1786 tests PASS** (+2 nuevos vs baseline). `tsc --noEmit` clean. `pnpm lint` clean.
- Frontend: sin cambios en W1+W2.

---

## PR2 — Backend clientes (listar + provisioning) + ciclos tenant-level

### Estado: COMPLETO

### Archivos modificados / creados

| Archivo | Acción |
|---------|--------|
| `backend/src/clientes/application/use-cases/listar-clientes.use-case.ts` | NUEVO |
| `backend/src/clientes/application/use-cases/listar-clientes.use-case.spec.ts` | NUEVO |
| `backend/src/clientes/domain/entities/ciclo-cliente.entity.ts` | NUEVO — admin, sin cicloVigenteId |
| `backend/src/clientes/domain/ports/i-ciclo-cliente.repository.ts` | NUEVO |
| `backend/src/clientes/application/use-cases/listar-ciclos.use-case.ts` | NUEVO |
| `backend/src/clientes/application/use-cases/listar-ciclos.use-case.spec.ts` | NUEVO |
| `backend/src/clientes/application/use-cases/crear-ciclo-tenant.use-case.ts` | NUEVO |
| `backend/src/clientes/application/use-cases/crear-ciclo-tenant.use-case.spec.ts` | NUEVO |
| `backend/src/clientes/application/use-cases/activar-ciclo.use-case.ts` | NUEVO |
| `backend/src/clientes/application/use-cases/activar-ciclo.use-case.spec.ts` | NUEVO |
| `backend/src/clientes/infrastructure/persistence/prisma/prisma-ciclo-cliente.repository.ts` | NUEVO |
| `backend/src/clientes/interface/controllers/ciclos.controller.ts` | NUEVO |
| `backend/src/clientes/interface/controllers/ciclos.controller.spec.ts` | NUEVO |
| `backend/src/clientes/interface/dtos/create-ciclo.dto.ts` | NUEVO |
| `backend/src/clientes/interface/dtos/ciclo-response.dto.ts` | NUEVO |
| `backend/src/clientes/interface/controllers/clientes.controller.ts` | MODIFICADO — ListarClientes + CrearCliente provisioning |
| `backend/src/clientes/interface/controllers/clientes.controller.spec.ts` | MODIFICADO — T2.4/T2.5 tests |
| `backend/src/clientes/interface/dtos/create-cliente.dto.ts` | MODIFICADO — campos admin provisioning |
| `backend/src/clientes/clientes.module.ts` | MODIFICADO — ListarClientes, ciclos use cases, CiclosController |
| `backend/src/auth/auth.module.ts` | MODIFICADO — exporta TenantGuard + PermissionsGuard |

### Tasks completadas

- [x] T2.1 — [RED] Unit test ListarClientesUseCase (4 tests)
- [x] T2.2 — [GREEN] ListarClientesUseCase (filtra deletedAt===null)
- [x] T2.3 — CreateClienteDto ampliado con adminEmail/Nombre/Apellido/Password
- [x] T2.4 — [RED] Tests ClientesController GET + POST (+ guards metadata)
- [x] T2.5 — [GREEN] GET /clientes + POST /clientes (ListarClientesUseCase + CrearClienteUseCase)
- [x] T2.6 — CicloClienteEntity (admin) con activate/deactivate, valida fechaFin>fechaInicio
- [x] T2.7 — [RED] Unit test ListarCiclosUseCase (4 tests)
- [x] T2.8 — [GREEN] ListarCiclosUseCase
- [x] T2.9 — [RED] Unit test CrearCicloTenantUseCase (6 tests)
- [x] T2.10 — [GREEN] CrearCicloTenantUseCase (overlap check, activo=false default)
- [x] T2.11 — [RED] Unit test ActivarCicloUseCase (5 tests)
- [x] T2.12 — [GREEN] ActivarCicloUseCase
- [x] T2.13 — PrismaCicloClienteRepository (TenantContext, activarCiclo $transaction)
- [x] T2.14 — [RED] Tests CiclosController (17 tests: GET/POST/PATCH + guard metadata)
- [x] T2.15 — [GREEN] CiclosController con JwtAuthGuard+TenantGuard+PermissionsGuard+ciclo:gestionar
- [x] T2.16 — ClientesModule wired + AuthModule exports TenantGuard+PermissionsGuard

### Commits

- `6712f1a` feat(clientes): add ListarClientesUseCase + wire GET /clientes with GlobalAdminGuard
- `94f0540` feat(clientes): add CicloClienteEntity, ICicloClienteRepository port, and ciclos use cases (T2.6-T2.12)
- `f8c9025` feat(clientes): add PrismaCicloClienteRepository for tenant-scoped ciclo admin ops (T2.13)
- `54952f1` feat(clientes): add CiclosController, wire ciclos use cases in ClientesModule, export guards (T2.14-T2.16)

### Evidencia final

- Backend: **122 archivos, 1831 tests PASS**. `tsc --noEmit` clean. `pnpm lint` clean.
- Rama: `feat/admin-general-pr2-clientes-ciclos`

### Pendiente

- T3.x–T6.x (PR3–PR6)
