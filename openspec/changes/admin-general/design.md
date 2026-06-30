# Design: Administración General (multi-tenant, 3 niveles)

## Technical Approach

Clean/Screaming sobre lo existente. AuthZ gruesa en guards (infra, gate de transporte: login/rol/global-admin); AuthZ fina (acotar admin-cliente a su tenant) emerge del `TenantGuard` + ausencia de selector de cliente, NUNCA de un `cliente_id` que viaje por body. Reusar use cases (Crear/Suspender/Reactivar cliente, CrearCicloVigente); agregar los faltantes y un servicio de reportes de solo-lectura sobre la DB tenant resuelta. Slicing = auto-chain de 6 PRs, seguridad primero. Spec ref: `auth-rbac`, `clientes-tenancy`, `reportes`, `admin-ui`, `frontend-shell`.

## Architecture Decisions

### ADR-1 — GlobalAdminGuard y enforcement "solo operador"
**Choice**: Nuevo `GlobalAdminGuard` (infra) que lee `request.user.is_global_admin` (claim ya presente). Se aplica a endpoints cross-cliente: `GET /clientes`, provisioning, suspender/reactivar. Endpoints de ciclos/usuarios NO lo usan: van con `JwtAuthGuard + RolesGuard('ADMINISTRADOR')` y quedan acotados al tenant por `TenantGuard`.
**Alternatives**: (a) chequeo inline en cada use case; (b) reusar `RolesGuard` con un rol GLOBAL. 
**Rationale**: el claim ya existe y `TenantGuard` ya lo consume; un guard dedicado es DRY, testeable y simétrico con `RolesGuard`. Un "rol" global mezclaría RBAC con tenancy. Inline rompe el patrón de gating en transporte.

### ADR-2 — Propagar is_global_admin al frontend
**Choice**: Backend = fuente de verdad (ya lo emite). Solo agregar `is_global_admin?: boolean` al `JwtPayload` del front (`shared/api/types.ts`) y consumirlo en `useSession`. Opcional para tolerar tokens viejos (degradación elegante, como `cliente_nombre`).
**Alternatives**: endpoint `GET /me`. 
**Rationale**: el layout ya decodifica el JWT para hidratar sesión; cero round-trip extra. El backend valida en cada request, el front solo gatea UI.

### ADR-3 — Selector Cliente+Ciclo → cross-tenant
**Choice**: `TenantContext` (provider) con `{ clienteId, cicloId }`. Operador: selector de cliente → `X-Tenant-Id`; selector de ciclo → query `?ciclo=`. Admin-cliente: sin selector de cliente (sin header → tenant propio), solo selector de ciclo. Default `cicloId` = ciclo activo del tenant. **El BFF DEBE reenviar `x-tenant-id`**: hoy `[...path]/route.ts` solo pasa `content-type`/`accept`, así que se agrega `x-tenant-id` a `ALLOWED_HEADERS`. Un hook fino lee `TenantContext` e inyecta el header en `apiFetch(init.headers)`.
**Alternatives**: cliente_id en path/body. 
**Rationale**: `X-Tenant-Id` ya es el mecanismo seguro (TenantGuard rechaza 403 si no es global admin). Admin-cliente nunca puede cruzar porque el guard rechaza el header. Mantiene `apiFetch` genérico.

### ADR-4 — Servicio de reportes
**Choice**: Servicio de aplicación read-only que agrega sobre la DB tenant resuelta (TenantContext), filtrando por `ciclo_id`. 4 agregaciones: por usuario (`solicitante_id`/`asignado_id`), por tipo (`tipo_id`), por estado (`estado_id`, incl. terminados), tiempo de resolución. SIN JOIN cross-tenant.
**GAP marcado**: el schema tenant tiene `tickets.fecha_cierre` (`@db.Date`, granularidad DÍA) pero **NO `fecha_resolucion`**. Tiempo promedio = `avg(fecha_cierre - created_at::date)` en días, solo tickets con `fecha_cierre NOT NULL`. Si negocio exige granularidad fina (horas), requiere columna `fecha_resolucion timestamptz` → fuera de scope, marcar como open question.
**Rationale**: tenancy física (1 DB/cliente) impide cualquier JOIN entre tenants por diseño.

### ADR-5 — Sidebar dinámico por rol (container/presentational)
**Choice**: Container lee `useSession` (`is_global_admin`, `roles`) + `TenantContext`; presentational renderiza secciones con separador `ADMINISTRACIÓN ────`. Detrás de feature-flag. Estado "Elegí un cliente" cuando operador no eligió tenant.
**Alternatives**: lógica en el presentacional. 
**Rationale**: respeta container/presentational del proyecto; flag permite rollback sin tocar el shell viejo.

### ADR-6 — Endpoints faltantes (Clean Arch)
**Choice**: `ListarClientesUseCase`, wire de provisioning a `CrearClienteUseCase` (hoy el POST usa el básico `RegistrarCliente`), `ListarCiclosUseCase`/`ActivarCicloUseCase` (sobre `ciclos_cliente` del tenant, flag `activo`), `CrearUsuarioUseCase`/`ListarUsuariosUseCase` (Baja y AsignarRol ya existen). AuthZ en application vía identidad; controllers solo HTTP↔use case (api-design).
**Rationale**: separa provisioning (full) de registro básico; no inventa lógica en infra.

### ADR-7 — Migración idempotente nestor global admin
**Choice**: `UPDATE master.usuarios SET is_global_admin=true WHERE email='nestor@sesitec.com.ar'`. Idempotente por naturaleza; corre SOLO en master. La columna ya existe.
**Rationale**: el `UPDATE ... WHERE` es seguro de re-correr; sin drop/add.

## Data Flow

    [Operador] selector → TenantContext{clienteId,cicloId}
         │ apiFetch(init: X-Tenant-Id) ──→ BFF (forward x-tenant-id) ──→ Nest
         │                                          │ JwtAuthGuard → GlobalAdminGuard?/RolesGuard → TenantGuard(resuelve DB)
         └── ?ciclo= ─────────────────────────────→ UseCase/Reportes (tenant DB, filtra ciclo_id)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/auth/infrastructure/guards/global-admin.guard.ts` | Create | Gate is_global_admin |
| `backend/src/clientes/interface/controllers/clientes.controller.ts` | Modify | Guards + GET listar + provisioning |
| `backend/src/clientes/interface/controllers/ciclos-vigentes.controller.ts` | Modify | Guards + listar/activar ciclo |
| `backend/src/clientes/application/use-cases/{listar-clientes,listar-ciclos,activar-ciclo}.use-case.ts` | Create | Faltantes |
| `backend/src/auth/.../usuarios.controller.ts` | Modify | POST crear, GET listar |
| `backend/src/auth/application/use-cases/{crear-usuario,listar-usuarios}.use-case.ts` | Create | Faltantes |
| `backend/src/reportes/**` | Create | Servicio agregaciones tenant+ciclo |
| `backend/prisma/migrations/**_nestor_global_admin/` | Create | UPDATE idempotente |
| `frontend/src/shared/api/types.ts` | Modify | `is_global_admin?` en JwtPayload |
| `frontend/src/app/api/[...path]/route.ts` | Modify | `x-tenant-id` en ALLOWED_HEADERS |
| `frontend/src/shared/providers/tenant-context.tsx` | Create | clienteId+cicloId |
| `frontend/src/components/shell/sidebar.tsx` | Modify | Dinámico por rol + separador (flag) |
| `frontend/src/app/(dashboard)/admin/{clientes,ciclos,usuarios,reportes}/` | Create | Pantallas + @media print en reportes |

## Interfaces / Contracts

```ts
// Reportes (application, sobre tenant DB resuelta; filtra cicloId)
interface ReportesService {
  porUsuario(cicloId?: string): Promise<{ usuarioId: string; total: number }[]>;
  porTipo(cicloId?: string): Promise<{ tipoId: string; total: number }[]>;
  porEstado(cicloId?: string): Promise<{ estadoId: string; total: number }[]>;
  // GAP: solo fecha_cierre (Date). Promedio en días, fecha_cierre NOT NULL.
  tiempoResolucionPromedioDias(cicloId?: string): Promise<number | null>;
}
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | GlobalAdminGuard (allow/deny), use cases nuevos, agregaciones | Test-First RED→GREEN, atómicos |
| Integration | Controllers protegidos rechazan sin login/rol; reportes sobre seed tenant | Nest TestingModule |
| E2E | Operador cross-tenant vía X-Tenant-Id; admin-cliente bloqueado | Capa fina deliberada |

## Migration / Rollout

Auto-chain 6 PRs (seguridad primero): (1) GlobalAdminGuard + guards en controllers abiertos + is_global_admin front + migración nestor; (2) clientes+ciclos; (3) usuarios; (4) reportes; (5) shell+selectores+BFF header; (6) pantallas. Sidebar tras feature-flag. Guard additive: si rompe, se ajusta rol — nunca se vuelve a "abierto".

## Open Questions

- [ ] Tiempo de resolución: ¿alcanza granularidad DÍA (`fecha_cierre`) o negocio exige `fecha_resolucion timestamptz`? (nueva columna = otro change)
- [ ] "Por usuario" en reportes: ¿solicitante, asignado, o ambos en vistas separadas?
- [ ] Feature-flag del sidebar: ¿env var, claim, o config por tenant?
