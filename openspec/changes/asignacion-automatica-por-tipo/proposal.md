# Proposal: Automatic assignment by ticket type (roadmap stage 2, point 9)

## Intent

Today every ticket is born "Nuevo" and unassigned, and someone has to triage it by hand. Point 9 assigns a fixed responsible per ticket type at creation, emails every assignment, and enforces "reassign until closed".

Product decision (cite by path): `docs/roadmap-comercial.md` → "Decisiones de producto de la segunda etapa" → "Segunda etapa, punto 9 — asignación automática por tipo", including "Precisiones del 2026-10-09, al explorar". Exploration: `openspec/changes/asignacion-automatica-por-tipo/exploration.md`.

## Scope

### In Scope: every decision bullet becomes a requirement

| # | Bullet |
|---|---|
| D1 | Rule keyed by ticket type only |
| D2 | One fixed responsible per type: no priority, groups, or round-robin |
| D3 | Applies to all 5 channels: normal, Soporte with equipo, Edilicia, public form/QR, recurring preventive |
| D4 | Rule present → born "Asignado"; no rule → "Nuevo" unassigned. Bitácora records the system assignment by type rule |
| D5 | Invalid responsible → created anyway, "Nuevo" unassigned; screen marks the rule broken; config accepts only valid users |
| D6 | Reassignable until closed; a closed ticket cannot be reassigned |
| D7 | Email on every assignment (rule or manual) via the client's account; no SMTP config → assign anyway, no email |
| D8 | Configured by ADMINISTRADOR (and ROOT) on a new admin screen: one row per type, empty = no rule |
| P1 | Responsible = TECNICO or COLABORADOR with the type's module; no ADMINISTRADOR |
| P2 | "Closed" = CERRADO, CANCELADO; RESUELTO stays reassignable |
| P3 | Email always sent, including self-assignment |
| P4 | Manual assignment of a "Nuevo" ticket moves it to "Asignado" |

Also: a reassign control for EN_PROCESO / ESPERANDO_CLIENTE / RESUELTO, and a revision of the stale "el sistema nunca auto-asigna" comments.

### Out of Scope
- Location-based rules; groups, round-robin, load balancing
- Multiple assignees and per-task credit (point 12)
- `TicketEdilicia.personalAsignadoId` (dead field)
- Proactive alerts for broken rules
- Ayuda articles (writing suspended). The debt goes in commits and PRs: new screen, auto-assignment, assignment email, NUEVO→ASIGNADO on manual assign

## Capabilities

### New Capabilities
- `reglas-asignacion`: rule storage, admin API/screen, eligibility, broken-rule status (D1, D2, D5, D8, P1)
- `asignacion-automatica-alta`: rule applied atomically at creation in every channel (D3, D4, D5)
- `ticket-asignacion-manual`: closed-state block, NUEVO→ASIGNADO, reassign UI (D6, P2, P4)
- `notificacion-asignacion`: `ticket.asignado` event and email (D7, P3)

### Modified Capabilities
- None (no existing spec covers assignment; `pedido-publico` and `formulario-publico-cliente` requirements stay valid)

## Approach

Exploration approach 1:
- New tenant table `reglas_asignacion` (PK/FK `tipo_id`, soft-ref responsible).
- A pre-transaction `ResolverAsignacionAutomatica` runs in the three creation use cases. It never fails creation; an invalid rule degrades to "Nuevo".
- When the rule assigns, the ticket is persisted as ASIGNADO with an opening op `null→ASIGNADO` and an `ASIGNACION` op by `AUTOR_SISTEMA` (`metadata.origen='REGLA_TIPO'`), all in the same transaction.
- `TicketAsignadoEvent` is published post-commit from creation and from both manual-assign use cases. It feeds a new listener and email template.
- New `reglas-asignacion` module (`AdminClienteGuard`) and the `/admin/reglas-asignacion` screen.

Rules gate:
- Mirrors another layer? Yes: frontend Zod mirrors the DTOs.
- Behavioral alternatives? Rejected: post-commit listener (not atomic) and a `tipos_ticket` column.
- User-visible? Yes: Ayuda debt recorded.

## Affected Areas

| Area | Impact |
|---|---|
| `backend/prisma_tenant/` (migration + `rollback.sql`) | New |
| `backend/src/tickets/` (creation/assign use cases, events, constants) | Modified |
| `backend/src/equipos/`, `backend/src/reparaciones/` (creation use cases) | Modified |
| `backend/src/reglas-asignacion/` | New |
| `backend/src/notificaciones/` (listener, template) | Modified |
| `frontend/src/app/(dashboard)/admin/reglas-asignacion/`, `frontend/src/features/` | New/Modified |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Resolver bug breaks every creation channel | Med | Degrade-never-throw, one e2e per channel |
| Preventive nested tx aborted by a lookup error | Low | Pre-tx master lookups, caught |
| Broken rule unnoticed | Med | Status shown on screen; alerts out of scope |
| Cast ratchet rises | Med | Complete mocks; run `check-casts-en-specs.mjs` |

## Rollback Plan

The migration is additive and ships `rollback.sql`. Take the standard predeploy dump. Revert the chained PRs in reverse order. Quick mitigation without a revert: delete every rule row, and creation behaves as it does today; P2, P4 and D7 remain active.

## Dependencies

- Delivery: auto-chain, 400-line budget, ~7 WUs (exploration §5)

## Success Criteria

- [ ] Each D1–D8 and P1–P4 maps to a spec scenario that passes in verify
- [ ] At close, the roadmap bullet declares "Cumplida" or "Desviación" (`check-roadmap-fresco.mjs` passes)
- [ ] Backend and frontend pass lint, typecheck, and tests
