# Exploration: asignacion-automatica-por-tipo (roadmap second stage, point 9)

Source of truth for product decisions: `docs/roadmap-comercial.md`, section "Decisiones de producto de la segunda etapa", bullet "Segunda etapa, punto 9 — asignación automática por tipo" (decided 2026-10-08). All paths below are relative to the repo root. This is investigation only; no code was changed.

## 1. Current State (verified)

**Ticket creation has exactly three entry use cases.** Every channel funnels into one of them:

| Channel | Use case | Evidence |
|---|---|---|
| `POST /tickets` | `CrearTicketUseCase` | `backend/src/tickets/interface/controllers/tickets.controller.ts:299-324` |
| Soporte (with/without equipo) | `CrearTicketSoporteUseCase` | `backend/src/equipos/application/use-cases/crear-ticket-soporte.use-case.ts:87` |
| Public form + QR | `ConfirmarPedidoPublicoUseCase` -> `CrearTicketSoporteUseCase` (`equipoInvalido: 'OMITIR'`, author `AUTOR_FORMULARIO_PUBLICO`) | `backend/src/publico/application/use-cases/confirmar-pedido-publico.use-case.ts:160-172` |
| Edilicia | `CrearTicketEdilicioUseCase` (type fixed to `EDILICIA`) | `backend/src/reparaciones/application/use-cases/crear-ticket-edilicio.use-case.ts:74` |
| Recurring preventive | `GenerarPreventivosUseCase` -> `CrearTicketUseCase` with type `PREVENTIVO`, nested inside the per-plan transaction | `backend/src/preventivo/application/use-cases/generar-preventivos.use-case.ts:131-241` |

`TicketEntity.create(` is called from only these three use cases (grep, non-spec). `crear-compra.use-case.ts` does not create tickets (only mentioned in a comment), so Compras is not a channel.

**Creation shape today.** Each use case: pre-transaction read-only validations (solicitante via `IUsuarioMasterChecker.existeEnTenant`, active cycle, catalogs, `NUEVO` state id, `CAMBIO_ESTADO` op type id) -> `txRunner.run(...)` (numbering with advisory lock + `ticket.save` + opening `OperacionTicket` with `estadoAnteriorId=null, estadoNuevoId=NUEVO`) -> `txRunner.alCommitear(() => publish(TicketCreadoEvent))` (`crear-ticket.use-case.ts:132-214`; `crear-ticket-soporte.use-case.ts:158-246`; `crear-ticket-edilicio.use-case.ts:131-200`). The only `ticket.creado` listener is `sla/infrastructure/listeners/aplicar-sla.listener.ts:43` (log-and-swallow).

**Runner semantics** (`backend/src/shared/infrastructure/persistence/tenant-transaction-runner.ts`): `run()` is re-entrant (`:92-94` participates in the outer tx); `alCommitear()` enqueues on the OUTERMOST tx (`:159-188`) and each callback is wrapped in its own try/catch (`:149-156`). This is why preventive-generated tickets publish post-commit correctly.

**Entity.** `TicketEntity.create()` forces `asignadoId=null` (`ticket.entity.ts:206-213`) but `assignTo()` (`:329`) and `updateEstado()` (`:339`) are public and usable before the first `save()`. No domain change is needed to create a ticket already assigned and in ASIGNADO.

**State machine.** 7 fixed states; `NUEVO -> ASIGNADO | CANCELADO`, `ASIGNADO -> EN_PROCESO | CANCELADO`, `RESUELTO -> CERRADO` only; `CERRADO`, `CANCELADO` terminal (`base-ticket-state-machine.ts:24-29`). No per-type machine is registered anywhere (`factory.register` has no callers), so every type uses the base graph. NUEVO and ASIGNADO both keep the SLA clock running (`estados.constants.ts:33-37`), so `NUEVO->ASIGNADO` does not touch the clock (`afectaRelojSla`, `:53-57`). Nothing in the backend depends on a ticket being born NUEVO (grep of `'NUEVO'` outside creation: only the `asignar-y-poner-en-proceso` path list and state constants). Preventive "pending" logic uses `ESTADOS_TICKET_ATENDIDO = RESUELTO/CERRADO/CANCELADO` (`prisma-preventivo-generacion.repository.ts:36`), so ASIGNADO still counts as "unattended" (no behavior change).

**Assignment today.**
- `AsignarTicketUseCase` (`asignar-ticket.use-case.ts:92-147`): validates `estaActivoEnTenant` + `esAsignadoElegiblePorModulo`, writes an `ASIGNACION` op (descripcion/metadata null), **does NOT change state** (deliberate, doc `:68-73`) and has **no state check**.
- `AsignarYPonerEnProcesoUseCase` (`asignar-y-poner-en-proceso.use-case.ts`): assigns and walks `NUEVO->ASIGNADO->EN_PROCESO`, recording `ASIGNACION` then one `CAMBIO_ESTADO` per arc; it already rejects RESUELTO/CERRADO/CANCELADO with `TransicionInvalidaError` (`:214-220`).
- Neither publishes any event. No email is sent on assignment.
- Manual assignment does not register "first response": that only happens from public non-internal comments by someone other than the requester (`crear-comentario.use-case.ts:125-129`; `PrismaPrimeraRespuestaWriteRepository`). So a system `ASIGNACION` at creation cannot affect first-response SLA.

**Frontend assignment UI gap (important).** The only assignment control rendered is `TicketAsignarEnProcesoControl`, mounted only when state is NUEVO or ASIGNADO (`ticket-detail-view.tsx:118`, `lib/estado-transitions.ts:51-53`). `useAsignarTicket` (plain `PATCH /tickets/:id/asignar`) exists in `hooks/use-ticket-mutations.ts:69` but no component uses it. So today an EN_PROCESO / ESPERANDO_CLIENTE / RESUELTO ticket cannot be reassigned from the UI at all, although the decision says "reassign any time until closed".

**Timeline rendering.** `ticket-timeline.tsx:44-53` renders only the operation label, the "Interno" badge, the date, and `descripcion`. It does not render the author or the states. `OperacionResponseDto` does expose `autorId` and `metadata` (`ticket.dto.ts:349-376`). The PDF resolves author names via `resolverNombres` with fallback `'Usuario'` and only includes COMENTARIO and CAMBIO_ESTADO ops (`generar-pdf-ticket.use-case.ts:130-166`).

**"System author" precedent.** `operaciones_ticket.autor_id` is NOT NULL, soft ref, no FK. The public form already uses the nil UUID `AUTOR_FORMULARIO_PUBLICO` (`backend/src/tickets/domain/constants/formulario-publico.constants.ts:10`) because "the timeline does not resolve author names".

**Email infra.** `EMAIL_SENDER` is `TenantAwareEmailSender` (`notificaciones.module.ts:83-91`): it resolves the active client's SMTP per `send()`, and when there is no TenantContext, no config, or a decrypt failure it logs a distinct reason and returns without throwing (`tenant-aware-email-sender.ts:99-128`). Closest analog for "email a specific user after an event": `PreventivoGeneradoNotificacionListener` (`@OnEvent`, loads ticket, `resolverContacto(userId)`, per-recipient try/catch, outer log-and-swallow). Templates are pure functions in `notificaciones/domain/templates/email-templates.ts` (`DatosTicketBase`, `templatePreventivoGenerado` at `:141`). `NotificacionesModule` imports `TicketsModule`; events live in `tickets/domain/events`.

**Catalog / data.** `TipoTicket` (`schema.prisma:123-137`): id, codigo, nombre, modulo, activo, soft delete; admin-editable via `CatalogosController`. `Ticket.asignadoId` soft ref to master users (`:288`). Latest tenant migration: `20261007160000_tickets_sla_meta_pendiente`; recent small tables ship `migration.sql` + `rollback.sql` (e.g. `20261006120000_respuestas_predefinidas`). `TicketEdilicia.personalAsignadoId` is dead; leave untouched.

## 2. Findings per investigation question

### 2.1 Where the rule runs (atomicity across channels)
- **Option A (recommended): application service `ResolverAsignacionAutomatica` injected into the 3 creation use cases.** Same pattern as `ResolverCicloActivoParaCreacion` (plain class built with `useFactory` in `tickets.module.ts:173-178`, exported). Called in the pre-transaction read-only phase with `(tipoId, clienteId)`; returns `{ asignadoId } | null`. Inside `txRunner.run` the use case then creates the ticket with state ASIGNADO + `assignTo`, and the extra operation, in the SAME transaction. The preventive path needs no change: it calls `CrearTicketUseCase`, which now resolves the rule itself (the re-entrant runner keeps it in the per-plan tx; rollback semantics unchanged).
- Option B: post-commit listener on `ticket.creado` that assigns. Rejected: not atomic. A failure leaves a NUEVO-unassigned ticket with no retry (listeners are log-and-swallow, `aplicar-sla.listener.ts:50-58`; `ejecutarProtegida` swallows too), races with the SLA listener, and contradicts "born ASIGNADO".
- Option C: hook inside `PrismaTicketRepository.save`. Rejected: hidden magic, infrastructure making business decisions, breaks the repo-as-persistence rule.
- Duplication mitigation: extract one small helper (e.g. `construirAperturaConAsignacion`) so the 3 use cases do not each re-implement the op construction.
- Wiring: the new rule repository token and the resolver must be exported from `TicketsModule` (Equipos and Reparaciones modules import it and build their own use cases from its tokens).
- Paths that publish `ticket.creado`: exactly the three. Each must additionally publish a `TicketAsignadoEvent` post-commit when the rule assigned (see 2.7).

### 2.2 State representation and "system" author
- State: the `estados` table has `NUEVO` and `ASIGNADO` rows; the ticket row is persisted directly with `estadoId = ASIGNADO` and `asignadoId`. Nothing else is needed because the creation path does not go through the state machine.
- Operations at creation with a rule:
  - **Option 1 (recommended)**: opening `CAMBIO_ESTADO` `null -> ASIGNADO` (author unchanged: actor, or public sentinel) + one `ASIGNACION` op authored by the system, `descripcion` = fixed text (e.g. "Asignación automática por la regla del tipo"), `metadata = { origen: 'REGLA_TIPO', asignadoId, tipoId }`. Two rows; the PDF renders the opening coherently ("Nuevo -> Asignado", since a null previous state is rendered as "Nuevo", `generar-pdf-ticket.use-case.ts:170`).
  - Option 2: keep opening `null -> NUEVO` plus `CAMBIO_ESTADO NUEVO->ASIGNADO` plus `ASIGNACION` (mirrors `AsignarYPonerEnProceso`). Pros: history always starts at NUEVO. Cons: three rows; the extra system-authored CAMBIO_ESTADO shows as "Usuario" in the PDF; extra noise.
- System author: `autor_id` is NOT NULL with no FK. Recommended: a new constant `AUTOR_SISTEMA` (a second reserved UUID with version nibble 0, e.g. `00000000-0000-0000-0000-000000000001`, which `gen_random_uuid()` can never produce), placed next to `formulario-publico.constants.ts`. Alternative: reuse the nil UUID (less code, but conflates "external requester" with "system"; metadata would then be the only discriminator). Using the human actor as author is rejected: it would claim a person assigned it.
- Because the timeline UI renders only `descripcion`, the "assigned by the system by type rule" statement MUST be in `descripcion` (and `metadata` for machines). Optional: make the PDF map the system UUID to "Sistema" instead of "Usuario".
- The repo's audit trail IS the `operaciones_ticket` bitácora, so no separate audit table is needed for assignments.

### 2.3 Data model for the rule
| Option | Pros | Cons |
|---|---|---|
| **A. New tenant table `reglas_asignacion` (recommended)**: `tipo_id UUID UNIQUE/PK FK -> tipos_ticket`, `responsable_id UUID` soft ref, `created_at`, `updated_at`, optional `actualizado_por` soft ref | Isolated concept; empty = no rule is "no row"; no ripple into `TipoTicketEntity`/mapper/DTOs/catalog CRUD (which a full-entity `save` could clobber); room for future extension (point 12) | One new table, repo, migration |
| B. Nullable column `responsable_asignacion_id` on `tipos_ticket` | One `ALTER`, no join | Touches the catalog entity, mapper, DTOs, `EditarTipoTicketUseCase`, tests and frontend catalog types; conflates two permissions/screens; hard to evolve |

Migration implications: new folder `backend/prisma_tenant/migrations/<ts>_reglas_asignacion/` with `migration.sql` AND `rollback.sql` (house convention), `CHECK`/unique as needed, plus the Prisma model. No seed (born empty). It rides the normal `migrate:tenants` fan-out in the deploy window; additive and non-destructive, so no special dump handling beyond the standard predeploy dump. E2E specs provision an ephemeral tenant DB and pick the migration up automatically; integration specs that use the fixed `soporte_tenant_test` need `pnpm migrate:tenant` against it once.

### 2.4 Eligibility at creation time
- Reuse `IUsuarioMasterChecker.estaActivoEnTenant` (1 master query, `usuario-master.checker.ts:58`) + `esAsignadoElegiblePorModulo` (`elegibilidad-asignado.ts:27-45`: `getAutorizacionModulos` = 2-3 master queries, plus a tenant `tipoTicketRepo.findById`). Cost with a rule: roughly 4-5 small indexed queries; without a rule: 1 tenant lookup (by unique `tipo_id`).
- Master checks run on `PrismaService.getMasterClient()`, a separate connection from the tenant tx, so they are technically safe even inside the tx. They should run in the PRE-transaction phase (like the solicitante check) so the advisory-lock window of `generarNumero` is not lengthened. The race (user deactivated between check and commit) is the same as manual assignment and acceptable. In the preventive path the pre-tx phase already runs inside the outer per-plan tx; the extra queries are negligible.
- Failure semantics: the resolver must NEVER fail creation. Invalid responsible -> return `null` (ticket born NUEVO, unassigned). Catch/degrade only exceptions from the MASTER lookups (log a masked line). Do not catch tenant-query errors inside the interactive tx: a failed Postgres statement aborts the tx anyway.
- Caveat: `esAsignadoElegiblePorModulo` loads the type again; the creation use cases already hold the type, so passing `modulo` directly (or a thin overload) saves one query. Optional.

### 2.5 "Broken rule" detection for the config screen
Compute at read time (no stored flag): for each row with a responsible, run the same `estaActivoEnTenant` + `esAsignadoElegiblePorModulo` evaluator used at creation, extracted as one shared function returning `valido: boolean`. Covers: inactive/deleted user, lost membership (membership inactive or removed), lost module (including the type's `modulo` being edited later, since the check reads the current `tipos_ticket.modulo`). A deactivated type: list only ACTIVE types on the screen; a rule on an inactive type is dormant (verify during design that creation rejects inactive types; `CrearTicketUseCase` currently only does `findById`, `crear-ticket.use-case.ts:109`). The checker returns booleans only, so v1 shows a generic reason ("Ya no es válido: dado de baja, sin acceso al cliente o sin el módulo del tipo"). Granular reasons would need a new checker method (optional). Cost: ~4 master queries per configured row; with ~5-10 types it is fine; a batch method is an optional optimization.
- "Config only allows valid users": the selector candidates come from `listarTecnicosAsignables(clienteId, tipo.modulo)` (TECNICO/COLABORADOR with the module, `usuario-master.checker.ts:153-189`) and `PUT` re-validates server-side. Note the asymmetry: the existing assign combo excludes ADMINISTRADOR/ROOT although `esAsignadoElegiblePorModulo` accepts them (see open question 1).

### 2.6 Closed-ticket reassignment block
Three different "closed" sets exist today:
- `ESTADOS_TERMINALES = CERRADO, CANCELADO` (`estados.constants.ts:25`; no outgoing arcs).
- `ESTADOS_QUE_CIERRAN = RESUELTO, CERRADO` (`transicionar-estado.use-case.ts:36`; sets `fechaCierre`).
- `ESTADOS_SIN_COMENTARIOS_PUBLICOS = RESUELTO, CERRADO, CANCELADO` (`crear-comentario.use-case.ts:25`).

Recommendation: block on `ESTADOS_TERMINALES` (CERRADO, CANCELADO). RESUELTO stays reassignable (it still has an arc to CERRADO and can be corrected). `PATCH /asignar` needs a state lookup added (constructor change) and a new 422 domain error (e.g. `TicketCerradoNoReasignableError`). `PATCH /asignar-en-proceso` already rejects RESUELTO/CERRADO/CANCELADO. ROOT/ADMINISTRADOR can still reopen a terminal ticket with the corrective jump (`transicionar-estado.use-case.ts:147-150`), after which reassignment is possible. Flagged as a low-severity product question (open question 2).
Also revise the stale invariant comments "el sistema nunca auto-asigna" at `tickets.controller.ts:567` and `asignar-ticket.use-case.ts:24-26`.

### 2.7 Email on assignment
- New domain event `TicketAsignadoEvent { name: 'ticket.asignado', ticketId, asignadoId, origen: 'REGLA_TIPO' | 'MANUAL', autorId | null }` (IDs only, no PII, like `TicketCreadoEvent`). Published post-commit via `txRunner.alCommitear` from: the 3 creation use cases (when the rule assigned), `AsignarTicketUseCase`, and `AsignarYPonerEnProcesoUseCase` (the last two currently publish nothing and use no `alCommitear`; add the event and a runner/publisher dependency).
- New `TicketAsignadoNotificacionListener` in `notificaciones/infrastructure/listeners/`, modeled on `PreventivoGeneradoNotificacionListener`: load ticket, `resolverContacto(asignadoId)`, new pure `templateTicketAsignado` in `email-templates.ts`, send via `EMAIL_SENDER`, full log-and-swallow. "Skipped silently if the client has no mail config" is already provided by `TenantAwareEmailSender` (logs `EMAIL_CLIENTE_SIN_CONFIG`, no throw), so no extra logic is needed.
- Context: the listener runs synchronously in the emitter's ALS scope, so `TenantContext` is available for HTTP, the public form, and the preventive sweep (same mechanism the preventive listener relies on).
- Overlap to decide: a rule-assigned PREVENTIVO ticket will trigger both `preventivo.generado` (plan responsable + administrators) and `ticket.asignado` (rule assignee), so one person may get two mails (open question 3).
- Self-assignment (actor == assignee): emailing yourself is noise (open question 3).

### 2.8 Frontend
- New page `frontend/src/app/(dashboard)/admin/reglas-asignacion/page.tsx` as a thin server component (mold: `admin/modelos-equipo/page.tsx`), view `features/asignacion-automatica/components/reglas-asignacion-admin-view.tsx` wrapped in `<SoloAdminCliente>` + `<AdminNav />` (mold: `modelos-equipo-admin-view.tsx`); add `{ href: "/admin/reglas-asignacion", label: "Asignación automática" }` to `ADMIN_NAV_ITEMS` (`frontend/src/components/shell/admin-nav.tsx:38`). Gate `esAdminCliente` (ADMINISTRADOR or ROOT); backend `AdminClienteGuard` per method (mold: `politica-tfa.controller.ts`, no new matrix permission).
- UI: one row per active type with the native `Select` from `@/components/ui/select` (same one used in `ticket-asignar-en-proceso-control.tsx`), empty option = no rule, a "regla rota" badge on invalid rows, candidates grouped by `modulo` so only one request per module is needed. React Query hooks with `apiFetch` and flat query keys (convention in `use-modelos-equipo.ts`), Zod schemas mirroring backend DTOs.
- Backend API (new module `reglas-asignacion`, imports `TicketsModule`; no cycle because `TicketsModule` does not import it): `GET /reglas-asignacion` (rows with `tipoId, codigo, nombre, modulo, responsableId?, responsableNombre?, estado: SIN_REGLA|VALIDA|ROTA` + candidates by module), `PUT /reglas-asignacion/:tipoId { responsableId: uuid | null }` (upsert/delete, re-validates eligibility, 422 if invalid). The port, repo, and resolver live in `TicketsModule` (they are needed by the creation use cases); only the config use cases and controller live in the new module.
- Reassign UI (new scope item): a control for EN_PROCESO / ESPERANDO_CLIENTE / RESUELTO states that calls `useAsignarTicket` (plain `/asignar`), hidden for CERRADO/CANCELADO; reuse `GET /tickets/:id/asignables`. For NUEVO/ASIGNADO keep the unified control (a rule-born ASIGNADO ticket can be reassigned and started from it).
- Ayuda is suspended (`CLAUDE.md`): record the Ayuda debt (new screen + automatic assignment + email) in commit messages and PR body; no article is written.

### 2.9 Tests
- Unit specs: use cases as plain classes with mocked ports. All three creation use cases get a new constructor dependency; their specs and any `as never` constructions must be updated using COMPLETE mocks (the cast ratchet `scripts/check-casts-en-specs.mjs` must not rise).
- Integration: construct repos directly against the fixed `soporte_tenant_test` DB via `PrismaService`, `TenantContext.run`, `PrismaTenantTransactionRunner` (pattern in `tickets/application/use-cases/asignar-y-poner-en-proceso.reloj-sla.integration.spec.ts`). Needed: rule repo (unique per type, upsert, FK), and creation use cases asserting the ticket is born ASIGNADO with both operations in one tx, plus the rollback case. Clean up fixtures in the spec.
- E2E: `tickets.e2e.spec.ts` pattern: ephemeral tenant DB `soporte_prov_*_test`, and `usarLockMasterTest()` from `backend/src/testing/lock-master-test.ts` because the spec truncates the shared `soporte_master_test`. Any new e2e that truncates that DB must call it. Cover: config endpoints (guard 403 for non-admin, 422 invalid responsible), POST /tickets with and without rule, broken rule -> NUEVO.
- Cases to cover explicitly: public form channel (nil author + rule), preventive nested (rollback leaves no half state; rule applies), EDILICIA, invalid responsible (inactive, no membership, no module), rule removed, closed ticket reassign 422, event published only post-commit, mail skipped without SMTP config.

## 3. Approaches summary
| # | Approach | Pros | Cons | Effort |
|---|---|---|---|---|
| 1 | **Shared resolver service in the 3 creation use cases, new `reglas_asignacion` table (recommended)** | Atomic, one place for the rule, preventive for free, clean ports | 3 use cases + specs touched, new module/table | Medium-High |
| 2 | Post-commit listener assigning after `ticket.creado` | Zero changes to creation use cases | Not atomic; failure leaves NUEVO ticket; races with SLA listener; contradicts "born ASIGNADO" | Medium |
| 3 | Column on `tipos_ticket` | One migration | Ripples through the catalog entity/DTO/UI; conflates concerns | Medium |

## 4. Recommendation
Approach 1: new tenant table `reglas_asignacion` (soft-ref responsible, unique per type), a `ResolverAsignacionAutomatica` application service (exported by `TicketsModule`) called pre-transaction by `CrearTicketUseCase`, `CrearTicketSoporteUseCase` and `CrearTicketEdilicioUseCase`. On a valid responsible the ticket is persisted directly as ASIGNADO with `asignadoId`, opening op `null->ASIGNADO`, plus a system-authored `ASIGNACION` op (new `AUTOR_SISTEMA` sentinel, `descripcion` + `metadata.origen = 'REGLA_TIPO'`) in the same transaction; an invalid or missing rule degrades to today's NUEVO/unassigned. A `TicketAsignadoEvent` published via `alCommitear` from creation and from both manual assign use cases feeds a new notificaciones listener and template. Closed-ticket block on `ESTADOS_TERMINALES`. Config in a new `reglas-asignacion` module (AdminClienteGuard) and a new `/admin/reglas-asignacion` screen; broken-rule status computed at read time with the shared evaluator. Add the missing reassign UI for in-progress states.

## 5. Suggested work-unit split (PR budget 400 lines; estimates include tests)
| WU | Scope | Est. lines |
|---|---|---|
| WU-1 | Migration (+rollback), Prisma model, domain port/entity, Prisma repo, shared eligibility evaluator (`evaluarResponsable`), repo integration spec | 250-320 |
| WU-2 | `reglas-asignacion` module: list (with broken status + candidates), set/clear use cases, controller (AdminClienteGuard), DTOs, e2e | 330-400 |
| WU-3 | `ResolverAsignacionAutomatica` + `AUTOR_SISTEMA` + `CrearTicketUseCase` (preventive covered) + `TicketAsignadoEvent` + module wiring + tests | 300-380 |
| WU-4 | Same integration in `CrearTicketSoporteUseCase` (incl. public form) and `CrearTicketEdilicioUseCase` + tests | 250-330 |
| WU-5 | Mail on assignment (listener, template, event publishing from `AsignarTicket`/`AsignarYPonerEnProceso`) + closed-ticket block + comment revisions + tests | 300-380 |
| WU-6 | Frontend admin screen + nav item + hooks + Zod + tests | 330-400 |
| WU-7 | Frontend reassign control for EN_PROCESO/ESPERANDO_CLIENTE/RESUELTO + tests | 150-220 |

Order: WU-1 -> WU-2 (can run in parallel with WU-3 after WU-1) -> WU-3 -> WU-4 -> WU-5 -> WU-6 -> WU-7. Total roughly 1,900-2,400 lines.

## 6. Risks
- Three creation use cases get a new constructor dependency; unit specs must be updated with complete mocks (the cast ratchet is manual and does not block merges, so run `scripts/check-casts-en-specs.mjs` before integrating).
- Regression risk on every creation channel: a bug in the resolver would affect all ticket creation. Mitigation: the resolver never throws for config problems; one e2e per channel.
- Preventive path: the nested tx must stay atomic (assignment inside it, email only via `alCommitear`); a master-lookup exception must not abort the per-plan tx or trigger the "responsable inválido -> throw -> rollback" path.
- Possible duplicate emails on preventives (plan responsable/admins + rule assignee) and self-assignment noise.
- The timeline UI does not render author or states, so the "system" marker is visible only through `descripcion`; the PDF shows "Usuario" for the sentinel unless mapped.
- A rule can go stale silently (user deactivated, type module edited): detection exists only on the config screen; tickets still get created unassigned. No proactive alert is in scope.
- The reassign UI does not exist today for in-progress tickets; without WU-7 "reassign until closed" is backend-only.
- Roadmap hygiene: at close, the point-9 bullet must declare "Cumplida" or "Desviación", or `scripts/check-roadmap-fresco.mjs` fails; the spec must cite the decision by path and turn each bullet into a requirement with a verifiable scenario (project `CLAUDE.md`).
- Eligibility asymmetry: assignment validation accepts ADMINISTRADOR/ROOT, but the candidate list does not offer them.

## 7. Open product questions
1. Can an ADMINISTRADOR (or ROOT) be the fixed responsible? Validation accepts them, but the existing assign combo lists only TECNICO/COLABORADOR. Proposed default: same as the combo (TECNICO/COLABORADOR only).
2. "Ticket closed" for the reassignment block: only CERRADO and CANCELADO (terminal; proposed default), or also RESUELTO?
3. Email edge cases: skip the mail when the actor assigns to themselves? Send a second mail to the preventive plan responsable who is also the rule assignee? Proposed default: skip self-assignment, no dedupe for preventives.
4. Manual `PATCH /asignar` leaves a NUEVO ticket in NUEVO (pre-existing; the UI does not use it). For the new reassign control on NUEVO tickets, should plain assignment also move NUEVO -> ASIGNADO for consistency with "assigned = ASIGNADO"? Proposed default: leave as is; the reassign control is only for states after ASIGNADO and the unified control stays for NUEVO/ASIGNADO.
