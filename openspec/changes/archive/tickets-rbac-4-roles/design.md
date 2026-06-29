# Design: tickets-rbac-4-roles (Change B)

## Technical Approach

Master-DB RBAC refactor: replace 5 legacy flat roles with 4 hierarchical accumulative roles
(USUARIO ⊂ COLABORADOR ⊂ TECNICO ⊂ ADMINISTRADOR) seeded as plain permission unions — the
`PermissionsGuard` is NOT touched (hierarchy lives in `roles_permisos`, not in code). Adds a
`ticket:comentar` use case so USUARIO has a usable action, a cross-tenant `is_global_admin` flag
read by `TenantGuard`, and a forced re-login on deploy (permissions live in the JWT). Non-admin users
who send `X-Tenant-Id` receive HTTP 403 (ForbiddenException) — not a silent ignore (confirmed
decision 2026-06-29, obs #1583). All DDL/seed goes in idempotent `prisma_master` migrations (single
master DB, no per-tenant fan-out). Tenant schema is unchanged — `ticket:comentar` reuses the
existing `COMENTARIO` tipo_operacion (`f0…002`). Reference: proposal #1566, decisions
#1567/#1551, Change A archive #1563.

## Architecture Decisions

### ADR-1: 4 roles + accumulative matrix via seed (replaces A's provisional seeding)
**Choice**: New master migration inserts 4 roles (fixed UUIDs `a0…006-009`), 2 new permisos, and a
`roles_permisos` matrix built by `SELECT JOIN ... ON codigo` (same pattern as existing seeds).
Change A's permissions are referenced by code (`ticket:observar/transicionar/aprobar/rechazar`),
never recreated. The accumulative matrix on the NEW roles supersedes A's provisional rows on the OLD
roles; those old rows die with the frozen roles (ADR-3).
**Alternatives rejected**: (a) hierarchy in `PermissionsGuard` (role-implies-role logic) — rejected,
adds runtime coupling and breaks the "guard never queries DB / token is source of truth" invariant;
(b) DELETE old roles_permisos explicitly — unnecessary once old roles are frozen and unassigned.
**Rationale**: pure data change, zero guard code, deterministic cross-env UUIDs, idempotent reruns.

Permission UUIDs (next free after A's `…017`, preserving the proposal pin):
| codigo | UUID |
|--------|------|
| `ciclo:gestionar` | `b0000000-0000-4000-b000-000000000018` |
| `ticket:comentar` | `b0000000-0000-4000-b000-000000000019` |

Accumulative matrix (each role = its row + all rows above):
| Role | Adds |
|------|------|
| USUARIO | `ticket:crear`, `ticket:comentar` |
| COLABORADOR | + `ticket:aprobar`, `ticket:rechazar` |
| TECNICO | + `ticket:transicionar`, `ticket:observar` |
| ADMINISTRADOR | + `usuario:gestionar`, `rol:asignar`, `cliente:gestionar`, `ciclo:gestionar` |

### ADR-2: CrearComentarioUseCase — COMENTARIO operation, no transition
**Choice**: New `CrearComentarioUseCase` mirroring `CrearObservacionUseCase` but WITHOUT any state
machine: load ticket (404) → load current estado (500 if corrupt) → block if cerrado/terminal (422
`ComentarioNoPermitidoError`) → resolve `COMENTARIO` tipoOperacion (500 if missing) → create
`OperacionTicketEntity` (estadoAnterior/Nuevo = null) → save. New `POST /tickets/:id/comentarios`
guarded by `@RequirePermissions('ticket:comentar')`.
**Alternatives rejected**: reuse `ticket:observar`/`CrearObservacionUseCase` — rejected, that path
auto-transitions APROBADO→EN_PROGRESO (decision #1567 keeps `ticket:observar` EXCLUSIVE to TECNICO so
"only the Technician changes state" holds).
**Rationale**: USUARIO/COLABORADOR get a usable, side-effect-free action; preserves the Change A
state-machine contract untouched.

### ADR-3: Freeze (soft-delete) legacy roles, remap usuarios_roles
**Choice**: Migrate `usuarios_roles` by INSERT-SELECT new mappings, then DELETE old rows, then
soft-delete the 5 legacy roles (`deleted_at = now()`). Mapping: ADMIN→ADMINISTRADOR,
SOLICITANTE→USUARIO, SOPORTE_IT→TECNICO, MANTENIMIENTO→TECNICO, APROBADOR_COMPRAS→COLABORADOR.
**Alternatives rejected**: hard DELETE roles — rejected, requires FK cascade cleanup and destroys
audit history; the schema convention is universal soft-delete.
**Rationale**: reversible, FK-safe, no cascade. `ON CONFLICT (usuario_id, rol_id) DO NOTHING`
dedupes users holding two roles that collapse to one (SOPORTE_IT+MANTENIMIENTO→TECNICO). Idempotent:
on rerun, new rows already present and old rows already gone.

### ADR-4: is_global_admin flag + X-Tenant-Id header for cross-tenant
**Choice**: `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_global_admin boolean NOT NULL DEFAULT
false`; add to `schema.prisma`, to `JwtPayload`, and to `LoginUseCase` payload. `TenantGuard`: if
`payload.is_global_admin === true` AND request carries `X-Tenant-Id`, resolve THAT cliente (same
exists/activo/deleted validation) instead of `cliente_id`; audit-log the cross-tenant access. If the
flag is false, the header results in HTTP 403 (ForbiddenException) — not ignored (decision #1583:
403 is more auditable, surfaces suspicious cross-tenant intent in logs; no escalation surface).
No header ⇒ falls back to own tenant.
**Alternatives rejected**: `?tenantId=` query param — rejected, tenant id leaks into access logs,
browser history and Referer; a header keeps a sensitive selector out of URLs. Per-request DB lookup
of the flag — rejected, breaks the token-is-truth invariant and adds latency.
**Rationale**: minimal surface, flag in token (no extra query), explicit and auditable. Designating
the first global admin is an operational step (guarded UPDATE by known root email), out of scope of
the auto-seed — ADMINISTRADOR does NOT imply global.

### ADR-5: Forced re-login via mass refresh-token revocation
**Choice**: One-off `UPDATE refresh_tokens SET revoked_at = now() WHERE revoked_at IS NULL AND
deleted_at IS NULL` in the deploy migration. Short-lived access tokens (≤15 min) expire naturally;
revoked refresh tokens force re-login, after which the new role codes/permisos are minted.
**Alternatives rejected**: rotate the JWT signing secret for instant hard logout — kept as an
OPTIONAL switch only if zero stale-permission tolerance is required (tradeoff: instant global logout
vs. a graceful ≤15-min window). Per-user `revokeAllByUsuarioId` loop — rejected, O(n) and racy.
**Rationale**: graceful, single SQL statement, bounded staleness window.

## Data Flow (cross-tenant)

    Request + Bearer JWT(is_global_admin, permisos) + X-Tenant-Id
        │
    JwtAuthGuard → PermissionsGuard(token perms) → TenantGuard
                                                       │ is_global_admin?
                                          ┌────────────┴────────────┐
                                        false                      true + header
                                          │                          │
                                  resolve cliente_id          resolve X-Tenant-Id
                                          └────────────┬────────────┘
                                              validate activo/!deleted → bind TenantContext

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `prisma_master/migrations/<ts>_seed_rbac_4_roles/migration.sql` | Create | 4 roles + 2 permisos + accumulative `roles_permisos` (ADR-1) |
| `prisma_master/migrations/<ts>_remap_usuarios_roles/migration.sql` | Create | remap + freeze legacy roles (ADR-3) |
| `prisma_master/migrations/<ts>_add_is_global_admin/migration.sql` | Create | column + mass refresh-token revoke (ADR-4, ADR-5) |
| `prisma_master/schema.prisma` | Modify | `Usuario.isGlobalAdmin Boolean @default(false)` |
| `auth/domain/ports/i-token.service.ts` | Modify | add `is_global_admin: boolean` to `JwtPayload` |
| `auth/application/use-cases/login.use-case.ts` | Modify | populate `is_global_admin` in payload |
| `auth/infrastructure/guards/tenant.guard.ts` | Modify | X-Tenant-Id cross-tenant resolution + audit log |
| `tickets/application/use-cases/crear-comentario.use-case.ts` | Create | COMENTARIO op, no transition (ADR-2) |
| `tickets/domain/errors/tickets.errors.ts` | Modify | `ComentarioNoPermitidoError` (422) |
| `tickets/interface/controllers/comentarios.controller.ts` | Create | `POST /tickets/:id/comentarios` |
| `tickets/interface/dtos/tickets.dto.ts` | Modify | `CrearComentarioDto` |

## Interfaces / Contracts

```typescript
// JwtPayload (add)
is_global_admin: boolean;

// CrearComentarioDto (application)
interface CrearComentarioDto { ticketId: string; texto: string; autorId: string; }

// CrearComentarioUseCase
execute(dto: CrearComentarioDto): Promise<Result<OperacionTicketEntity, DomainError>>;
// blocks on: RESUELTO, SIN_SOLUCION, RECHAZADO, CERRADO, CANCELADO, PENDIENTE_APROBACION
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | accumulative matrix correctness; CrearComentarioUseCase (404 / blocked terminal / happy) | mock repos, RED→GREEN |
| Unit | TenantGuard: flag=false + header → 403; flag=true resolves header; invalid target → 404 | mock PrismaService |
| Integration | master migrations idempotent (rerun = no-op); usuarios_roles remap incl. double-role collapse; mass revoke | real master DB |
| E2E | global admin reaches tenant B via X-Tenant-Id; non-admin with header stays in own tenant; `POST /comentarios` 201/403/422 | supertest |

## Migration / Rollout (master, ordered)

1. roles (insert 4) → 2. permisos (insert 2) → 3. roles_permisos (accumulative matrix) →
4. usuarios_roles (remap + freeze legacy) → 5. is_global_admin column → 6. mass refresh-token revoke.
All idempotent (`ON CONFLICT DO NOTHING`, `IF NOT EXISTS`, soft-delete guards). Master is a single DB
— migrations run once, no tenant fan-out.

## Slicing (chained PRs, auto-chain, <400 lines each)

- **PR1** — seed 4 roles + 2 permisos + accumulative matrix (replaces A's provisional). +tests.
- **PR2** — usuarios_roles remap + freeze legacy roles. +tests.
- **PR3** — is_global_admin (column+schema+JWT claim+login+TenantGuard X-Tenant-Id) + mass refresh-token revoke. +tests. *(Budget risk: if >400 lines, split mass-revoke as PR3b.)*
- **PR4** — CrearComentarioUseCase + `POST /tickets/:id/comentarios` + DTO + error + module wiring. +tests.

## Open Questions

- [ ] Operational designation of the first `is_global_admin` user (guarded UPDATE by root email vs. manual) — not auto-seeded.
- [ ] Confirm hard JWT-secret rotation is NOT required (graceful ≤15-min stale-permission window accepted).
