# Proposal: Administración General (multi-tenant, 3 niveles)

## Intent

No existe panel de administración: el sidebar está hardcodeado sin filtro por rol y faltan endpoints/pantallas para gestionar clientes, ciclos, usuarios y reportes. Peor: `ClientesController` y `CiclosVigentesController` están ABIERTOS sin auth guard (riesgo crítico). Necesitamos un panel multi-tenant de 3 niveles — operador global (sesitec), admin por cliente, usuario — para que sesitec opere todas las orgs y cada admin gestione solo la suya.

## Scope

### In Scope
- Tapar el agujero de auth en `ClientesController` y `CiclosVigentesController` (guard de login + rol).
- `GlobalAdminGuard` ("solo operador") + exponer `is_global_admin` en el `JwtPayload` (back y front).
- Backend faltante: GET /clientes, endpoint de provisioning (`CrearClienteUseCase`), GET/activar ciclos, POST/GET usuarios + baja, endpoints de reportes (4 agregaciones por tenant+ciclo).
- Frontend: pantallas Clientes/Ciclos/Usuarios/Reportes, selectores Cliente+Ciclo, sidebar dinámico por rol con separador ADMINISTRACIÓN ──── operativo.
- Cross-tenant del operador vía header `X-Tenant-Id` (mecanismo ya existente).

### Out of Scope
- Export PDF/XLSX de reportes (v1 = on-screen + `@media print`).
- Edición de datos fiscales del cliente, self-reset de password, onboarding self-service.
- Dashboards/gráficos analíticos y nuevos roles.

## Capabilities

### New Capabilities
- `reportes`: agregaciones por tenant+ciclo (tickets por usuario, por tipo, por estado, tiempo de resolución promedio). On-screen, solo lectura sobre `tickets-core`.
- `admin-ui`: pantallas frontend de administración (Clientes, Ciclos, Usuarios, Reportes) + selectores.

### Modified Capabilities
- `auth-rbac`: nuevo `GlobalAdminGuard`, `is_global_admin` en el JWT, login guard en los controllers abiertos.
- `clientes-tenancy`: nuevos endpoints HTTP (listar clientes, provisioning, ciclos GET/activar, usuarios crear/listar/baja).
- `frontend-shell`: sidebar dinámico por rol con separador; selectores Cliente+Ciclo; estado "Elegí un cliente".

## Approach

- **Backend (Clean/Screaming):** reusar use cases existentes (Crear/Suspender/Reactivar cliente, `CrearCicloVigente`); agregar los faltantes (`ListarClientes`, `ActivarCiclo`, `CrearUsuario`, `ListarUsuarios`, `BajaUsuario`) y un servicio de reportes que agrega sobre la DB tenant. AuthZ en application (`UserIdentity.hasRole` / `is_global_admin`), NUNCA en infra. Reportes leen la DB tenant resuelta por `X-Tenant-Id` (operador) o el tenant propio (admin) — jamás cross-tenant en una query (tenancy física, 1 DB por cliente).
- **Frontend (Next.js):** `TenantContext` con cliente+ciclo (ciclo default = activo); el sidebar filtra ítems por `is_global_admin`/rol; pantallas con filas-tarjeta, skeleton/empty/interactive states, modo dual y `@media print` en reportes.
- **Entrega (auto-chain):** PRs chicos encadenados — (1) guard de seguridad, (2) endpoints clientes/ciclos, (3) usuarios, (4) reportes, (5) shell+selectores, (6) pantallas admin.

## Affected Areas

| Área | Impacto | Descripción |
|------|---------|-------------|
| `backend/src/auth` | Modified | `GlobalAdminGuard`, `is_global_admin` en JWT, guards en controllers abiertos |
| `backend/src/clientes` | Modified | endpoints listar/provisioning/ciclos/usuarios |
| `backend/src/reportes` | New | use cases de agregación por tenant+ciclo |
| `frontend/.../admin` | New | pantallas Clientes/Ciclos/Usuarios/Reportes + selectores |
| `frontend/.../shell` | Modified | sidebar dinámico por rol |

## Risks

| Riesgo | Prob. | Mitigación |
|--------|-------|-----------|
| Controllers abiertos siguen expuestos hasta el primer PR | Alta | El guard de seguridad es el PRIMER slice del auto-chain |
| Fuga cross-tenant en reportes | Media | Agregaciones acotadas a la DB tenant resuelta; nunca JOIN entre tenants |
| `is_global_admin` mal propagado al front | Media | Test del payload JWT + guard en backend como fuente de verdad |

## Rollback

Cada slice es un PR atómico revertible. Sidebar nuevo detrás de feature-flag. El guard de auth es additive: si rompe, se ajusta el rol permitido — NUNCA se vuelve a estado "abierto".

## Dependencies

- `nestor@sesitec.com.ar` → `is_global_admin=true` en `master.usuarios` (migración idempotente).

## Success Criteria

- [ ] `ClientesController` y `CiclosVigentesController` rechazan requests sin login.
- [ ] Operador ve/gestiona todos los clientes; admin-cliente solo su org; usuario sin sección admin.
- [ ] Reportes filtran por cliente+ciclo (default = ciclo activo).
- [ ] `is_global_admin` disponible en el JWT consumido por el frontend.
