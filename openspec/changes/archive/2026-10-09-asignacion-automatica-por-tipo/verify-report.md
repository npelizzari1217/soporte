```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:98b1486c703f961b24e5bb8488f47ec7ebe4c0278a1c2ae4bfa0c213aa177e9a
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 29/29
scenarios: 95/95
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:317a0df6df024eac72bf53f4dc965a88bf80f651aea45ac4c7a1e591c18d899e
build_command: pnpm typecheck && pnpm lint
build_exit_code: 0
build_output_hash: sha256:42cb804fe1f22859c73ca2244d92fde1db5b7a9f33ecddd8332f3d8182524c11
```

## Verification Report

**Change**: asignacion-automatica-por-tipo (roadmap stage 2, point 9)
**Version**: N/A
**Mode**: Standard (feature cycle, `strict_tdd: false`, no Strict TDD injection)
**Candidate**: branch `feat/asignacion-automatica-por-tipo-wu08`, HEAD `91e62e36`, tree `e02fada5`, compared against `origin/main` (`3ad267c4`). The local `main` ref is stale (it lacks the already-merged 2FA PRs #480/#481), so the diff was taken against `origin/main`: 25 commits, 85 files, +6815/-86.
**Envelope notes**: `evidence_revision` is the sha256 of `git diff origin/main...HEAD`. `test_command`/`test_output_hash` are for the backend `pnpm test` run; `build_command`/`build_output_hash` are for the backend `pnpm typecheck` and `pnpm lint` outputs, concatenated. The frontend gates are listed below. In the `scenarios` count, PARTIAL scenarios count as covered, because a covering test passed at runtime. Each one appears again as a WARNING.

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 56 |
| Tasks complete | 56 |
| Tasks incomplete | 0 |

Task 8.7 (closing the roadmap after the deploy) is a delivery step outside the task list. By design it does not block archive, and it is still pending.

`gentle-ai sdd-status`: `apply: all_done`, `verify: ready`, `tasks: 56/56`.

### Build & Tests Execution
**Build**: Passed
```text
backend  pnpm lint            -> exit 0 (eslint ., no output)
backend  pnpm typecheck       -> exit 0 (tsc --noEmit -p tsconfig.typecheck.json)
frontend JWT_SECRET=dummy pnpm lint -> exit 0 ("No ESLint warnings or errors")
frontend pnpm type-check      -> exit 0 (tsc --noEmit)
root     node scripts/check-casts-en-specs.mjs -> exit 0 (617 casts in 114 files, base 617/114; ratchet holds)
root     node scripts/check-roadmap-fresco.mjs -> exit 0 ("El roadmap esta fresco")
```

**Tests**: 10176 passed / 0 failed / 0 skipped
```text
backend  pnpm test -> exit 0. Test Files 667 passed (667), Tests 8076 passed (8076), Duration 1146s
         (run alone in the foreground, nothing in parallel; Postgres container soporte-postgres-master up)
frontend pnpm test -> exit 0. Test Files 259 passed (259), Tests 2100 passed (2100), Duration 223s
```

**Coverage**: not measured (`coverage_threshold: 0`).

### Spec Compliance Matrix

Legend: COMPLIANT = a covering test passed. PARTIAL = a test passed but covers only part of the scenario (see WARNINGS). Backend paths are relative to `backend/src/` and frontend paths to `frontend/src/`.

#### reglas-asignacion (7 requirements, 30 scenarios)
| Req | Scenario | Test | Result |
|-----|----------|------|--------|
| R1 | Alta de la regla de un tipo | `reglas-asignacion.e2e.spec.ts > PUT fija, reemplaza y quita`; `prisma-regla-asignacion.repository.integration.spec.ts > fijar crea la regla` | COMPLIANT |
| R1 | Reemplazo | `prisma-regla-asignacion...integration > fijar es upsert`; e2e `PUT fija, reemplaza y quita` | COMPLIANT |
| R1 | Sin prioridad ni grupos | Static by definition (inspect model/DTO): `ReglaAsignacion` has only `tipoId/responsableId/actualizadoPor/timestamps`; DTO has only `responsableId`. Plus `schemas.test.ts > el body acepta un UUID y null` | COMPLIANT |
| R2 | Técnico con el módulo | `configurar-regla-asignacion.use-case.spec > un responsable elegible se fija`; e2e `PUT fija` | COMPLIANT |
| R2 | Colaborador con el módulo | e2e `PUT fija, reemplaza` (colaborador); `usuario-master.checker.integration > COLABORADOR ... incluido` | COMPLIANT |
| R2 | Administrador | e2e `[CRITICAL] PUT con un responsable no elegible → 422` (ADMIN); e2e `GET: candidatos solo TECNICO/COLABORADOR`; `elegibilidad-responsable-regla.spec > ADMINISTRADOR ... no es elegible` | COMPLIANT |
| R3 | Responsable inactivo | `configurar...spec > it.each(u-dado-de-baja)` (mocked checker) | PARTIAL (W3) |
| R3 | Sin membresía en el cliente | `configurar...spec > it.each(u-otro-cliente)`; `usuario-master.checker.integration > membresía INACTIVA → excluido` | COMPLIANT |
| R3 | Sin el módulo del tipo | e2e `PUT con un responsable no elegible → 422` (tecnicoSinModulo) | COMPLIANT |
| R3 | Vaciar la regla | e2e `PUT fija, reemplaza y quita`; `configurar...spec > null quita la regla` | COMPLIANT |
| R3 | Tipo inexistente | e2e `PUT con un tipo inexistente → 404` | COMPLIANT |
| R4 | Regla vigente | e2e `PUT fija ... el GET refleja VALIDA`; `listar...spec > VALIDA toma el nombre` | COMPLIANT |
| R4 | Sin regla | e2e `GET: tipo sin regla → SIN_REGLA`; `listar...spec > SIN_REGLA` | COMPLIANT |
| R4 | Responsable dado de baja | `listar...spec > ROTA toma el nombre de resolverNombres` (mocked checker) | PARTIAL (W3) |
| R4 | Responsable sin membresía | e2e `GET: ... perdió la membresía activa → ROTA` | COMPLIANT |
| R4 | Responsable sin el módulo | e2e `GET: ... perdió el módulo del tipo → ROTA` | COMPLIANT |
| R4 | Se edita el módulo del tipo | `listar...spec > un responsable de otro módulo es ROTA (cambió el módulo del tipo)` | COMPLIANT |
| R4 | Los candidatos son solo válidos | e2e `GET: candidatos solo TECNICO/COLABORADOR con el módulo`; `listar...spec > consulta candidatos una vez por módulo` | COMPLIANT |
| R5 | Administrador | e2e `PUT fija, reemplaza y quita` (adminToken) | COMPLIANT |
| R5 | ROOT | e2e `ROOT → GET 200` (GET only; PUT not exercised) | PARTIAL (W6) |
| R5 | Técnico | e2e `[CRITICAL] no administrador → 403 en GET y PUT` | COMPLIANT |
| R5 | Sin sesión | e2e `sin token → 401` | COMPLIANT |
| R6 | Una fila por tipo activo | `listar...spec > una fila por tipo activo; el de baja no aparece`; `reglas-asignacion-admin-view.test > una fila por tipo` | COMPLIANT |
| R6 | Fila vacía | `admin-view.test > ... vacía = Sin regla` | COMPLIANT |
| R6 | Regla rota visible | `admin-view.test > it.each(con nombre / sin nombre)` (badge "Rota" + "ya no es válido") | COMPLIANT |
| R6 | Solo candidatos válidos | `admin-view.test > solo ofrece los candidatos del módulo del tipo` + backend R4 candidates | COMPLIANT |
| R6 | Cambio rechazado | `admin-view.test > un 422 muestra el toast y el selector vuelve a la regla anterior`; `use-reglas-asignacion.test > 422 ... no invalida` | COMPLIANT |
| R6 | Acceso de un no administrador | `admin-view.test > un no administrador no ve la pantalla`; `admin-nav.test` (TECNICO does not see the item) | COMPLIANT |
| R7 | Unicidad por tipo | `prisma-regla-asignacion...integration > la PK impide dos filas` | COMPLIANT |
| R7 | Reversión | `prisma-regla-asignacion...integration > rollback.sql elimina la tabla y es re-ejecutable` | COMPLIANT |

#### asignacion-automatica-alta (9 requirements, 26 scenarios)
| Req | Scenario | Test | Result |
|-----|----------|------|--------|
| A1 | Alta con regla | `crear-ticket.asignacion-automatica.integration > con regla: nace ASIGNADO` | COMPLIANT |
| A2 | Alta sin regla | `crear-ticket.asignacion-automatica.integration > sin regla: nace NUEVO` | COMPLIANT |
| A3 | Operaciones al nacer | same integration `con regla` (null→ASIGNADO + ASIGNACION by AUTOR_SISTEMA, metadata.origen) | COMPLIANT |
| A3 | Texto visible en la línea de tiempo | `operaciones-apertura.spec` (descripcion = DESCRIPCION_ASIGNACION_POR_REGLA) + `ticket-timeline.test` (renders `descripcion`) | COMPLIANT |
| A3 | Sin autoría humana | integration `con regla` (opening by the requester, ASIGNACION by AUTOR_SISTEMA) | COMPLIANT |
| A4 | Responsable dado de baja | `resolver...spec > responsable fuera del universo → null` (mocked checker) | PARTIAL (W3) |
| A4 | Responsable sin membresía | `asignacion-automatica.canales.integration > A4 POST /tickets: membresía dada de baja → ok, NUEVO` | COMPLIANT |
| A4 | Responsable sin el módulo del tipo | `resolver...spec > fuera del universo` + checker integration S22 (module filter) | COMPLIANT |
| A4 | Falla la consulta al maestro | `resolver...spec > listarTecnicosAsignables rechaza → null y log DEGRADADA`; `generar-preventivos.integration > fallo del maestro no aborta el plan` | COMPLIANT |
| A4 | Sin evento de asignación | `crear-ticket.use-case.spec > regla rota: nace NUEVO`; Soporte/Edilicia specs `sin regla o regla rota ... solo ticket.creado` | COMPLIANT |
| A5 | Regla eliminada | `prisma-regla...integration > quitar borra la regla`; integration A9 test creates after `quitar` and gets NUEVO | COMPLIANT |
| A5 | Tickets previos intactos | `crear-ticket.asignacion-automatica.integration > A9` runs `quitar` after a rule-born ticket and re-reads it, but asserts only SLA fields | PARTIAL (W1) |
| A6 | Alta normal | `crear-ticket.asignacion-automatica.integration > con regla`; `ticket-asignado-notificacion.e2e > el alta con regla manda un mail` (HTTP) | COMPLIANT |
| A6 | Soporte con equipo | `asignacion-automatica.canales.integration > Soporte con regla` | COMPLIANT |
| A6 | Soporte sin equipo | `crear-ticket-soporte.use-case.spec > con regla` / canales integration | COMPLIANT |
| A6 | Edilicia | `canales.integration > Edilicia con regla` | COMPLIANT |
| A6 | Formulario público con QR | `canales.integration > formulario público con regla: apertura AUTOR_FORMULARIO_PUBLICO, ASIGNACION del sistema` | COMPLIANT |
| A6 | Preventivo recurrente | `generar-preventivos.integration > aplica la regla dentro de la transacción del plan` | COMPLIANT |
| A6 | Canal sin regla | `sin regla` cases in the three use-case specs + integration `sin regla` | COMPLIANT |
| A7 | Reversión del alta | `crear-ticket.asignacion-automatica.integration > atomicidad`; `canales.integration > A7 Soporte ROLLBACK` | COMPLIANT |
| A7 | Preventivo anidado | `generar-preventivos.integration > fallo forzado del plan → ROLLBACK total y ningún ticket.asignado` | COMPLIANT |
| A7 | Fallo de resolución en preventivo | `generar-preventivos.integration > fallo del maestro no aborta el plan` | COMPLIANT |
| A8 | Evento de creación | use-case specs `ticket.asignado REGLA_TIPO después de ticket.creado`; integration A9 (SLA applied) | COMPLIANT |
| A9 | Reloj en marcha | integration `A9: ... corre el reloj igual` | COMPLIANT |
| A9 | Sin primera respuesta por asignar | integration `A9: ... no marca primera respuesta` | COMPLIANT |
| A9 | Primera respuesta por comentario | `crear-comentario.use-case.spec` (the mechanism does not depend on the state; the regression for this change is that assignment does not mark it, covered above) | COMPLIANT |

#### ticket-asignacion-manual (6 requirements, 20 scenarios)
| Req | Scenario | Test | Result |
|-----|----------|------|--------|
| M1 | Ticket cerrado | `tickets.e2e > CERRADO → 422 en /asignar, sin operaciones nuevas`; `asignar-ticket.spec > it.each(CERRADO, CANCELADO)` | COMPLIANT |
| M1 | Ticket cancelado | `asignar-ticket.spec > it.each(CANCELADO)` | COMPLIANT |
| M1 | Asignar y poner en proceso un ticket cerrado | `tickets.e2e > CANCELADO → 422 en /asignar-en-proceso`; `asignar-y-poner-en-proceso.spec > it.each(CERRADO, CANCELADO)` | COMPLIANT |
| M1 | Rechazo sin efectos | e2e (no new operations); `ticket-asignado-notificacion.e2e > rechazada (ticket cerrado) no manda mail` | COMPLIANT |
| M2 | Ticket en proceso | `asignar-ticket.spec > it.each(... EN_PROCESO ...)` | COMPLIANT |
| M2 | Ticket en espera del cliente | `asignar-ticket.spec > it.each(... ESPERANDO_CLIENTE ...)` | COMPLIANT |
| M2 | Ticket resuelto | `tickets.e2e > RESUELTO → 200 sin cambio de estado` | COMPLIANT |
| M2 | Destinatario no elegible | `asignar-ticket.spec > SIN el módulo → AsignadoNoElegibleError`; `destinatario no elegible en un NUEVO` | COMPLIANT |
| M3 | Asignar un ticket Nuevo | `tickets.e2e > NUEVO → ASIGNADO`; `asignar-ticket.spec > M3` | COMPLIANT |
| M3 | Asignar y poner en proceso un ticket Nuevo | existing `asignar-y-poner-en-proceso.spec` (NUEVO→ASIGNADO→EN_PROCESO) | COMPLIANT |
| M3 | Reasignar un ticket Asignado | `asignar-ticket.spec > it.each(ASIGNADO ...) sin cambiar de estado` | COMPLIANT |
| M3 | Reloj del SLA | No test on `/asignar`. Only the sibling path is tested (`asignar-y-poner-en-proceso.reloj-sla.integration`, same persistence invariant) | PARTIAL (W2) |
| M4 | En proceso | `ticket-detail-view-reasignar.test > en EN_PROCESO se ofrece solo la reasignación` | COMPLIANT |
| M4 | Esperando cliente | `estado-transitions.test > puedeReasignar it.each(ESPERANDO_CLIENTE)` (mount gate) | COMPLIANT |
| M4 | Resuelto | `estado-transitions.test > puedeReasignar it.each(RESUELTO)` | COMPLIANT |
| M4 | Cerrado o cancelado | `ticket-detail-view-reasignar.test > it.each(CERRADO, CANCELADO) no se muestra` | COMPLIANT |
| M4 | Nuevo o asignado | `ticket-detail-view-reasignar.test > it.each(NUEVO, ASIGNADO) convive` | COMPLIANT |
| M4 | Usuario sin permiso | `ticket-detail-view-reasignar.test > sin TICKETS:ASIGNAR`; `ticket-reasignar-control.test > sin TICKETS:ASIGNAR` | COMPLIANT |
| M5 | Reasignación del ticket automático | `tickets.e2e > un ticket nacido por regla se reasigna igual (M5)` | COMPLIANT |
| M6 | Comentarios vigentes | Static by definition: `rg -i "nunca auto-?asign|auto-asign|DELIBERADAMENTE NO transiciona" backend/src frontend/src` returns no matches (exit 1) | COMPLIANT |

#### notificacion-asignacion (7 requirements, 19 scenarios)
| Req | Scenario | Test | Result |
|-----|----------|------|--------|
| N1 | Alta con regla | use-case specs `ticket.asignado REGLA_TIPO ... alCommitear`; e2e `el alta con regla manda un mail` | COMPLIANT |
| N1 | Asignación manual | `asignar-ticket.spec > N1: MANUAL con autorId del actor` | COMPLIANT |
| N1 | Asignar y poner en proceso | `asignar-y-poner-en-proceso.spec > N1` | COMPLIANT |
| N1 | Reversión | `crear-ticket...integration > atomicidad ... ni eventos`; `canales.integration > A7 ROLLBACK`; e2e `rechazada no manda mail` | COMPLIANT |
| N1 | Preventivo anidado | `generar-preventivos.integration > aplica la regla ... post-commit` and `ROLLBACK ... ningún ticket.asignado` | COMPLIANT |
| N2 | Asignación por regla | e2e `N1/N2: el alta con regla manda un mail al responsable` | COMPLIANT |
| N2 | Asignación manual | e2e `N2/N3: asignar a mano avisa al asignado` | COMPLIANT |
| N2 | Reasignación | same e2e (`la reasignación avisa al nuevo`) | COMPLIANT |
| N2 | Cuenta del cliente | existing `tenant-aware-email-sender.spec` (tenant SMTP); listener uses `EMAIL_SENDER` = TenantAwareEmailSender | COMPLIANT |
| N3 | Autoasignación | `listener.spec > N3`; e2e `N2/N3 ... también en la autoasignación` | COMPLIANT |
| N4 | Cliente sin SMTP | `listener.spec > N4: sin correo configurado ... no lanza` | COMPLIANT |
| N4 | Alta con regla sin SMTP | Covered only in parts (`listener.spec > N4` + `tenant-aware-email-sender.spec`); no combined test | PARTIAL (W5) |
| N4 | Registro de la omisión | `tenant-aware-email-sender.spec` (`EMAIL_CLIENTE_SIN_CONFIG`) | COMPLIANT |
| N5 | Falla el envío | `listener.spec > N5: si send lanza, el handler resuelve` | COMPLIANT |
| N5 | Falla al resolver el contacto | `listener.spec > N5: sin contacto resoluble` | COMPLIANT |
| N6 | Formulario público | Event emission tested (`canales.integration:231`); the listener is not run in the public-form context | PARTIAL (W4) |
| N6 | Barrido de preventivos | Event emission tested (`generar-preventivos.integration`); the listener is not run in the sweep context | PARTIAL (W4) |
| N6 | Evento sin datos personales | `ticket-asignado.event.ts` (ids and origin only) + listener spec loads data | COMPLIANT |
| N7 | Preventivo asignado | `listener.spec > N7: no deduplica` | COMPLIANT |

**Compliance summary**: 86/95 scenarios COMPLIANT, 9/95 PARTIAL, 0 FAILING, 0 UNTESTED. Every scenario has at least one covering test that passed at runtime.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| R1-R7 | Implemented | Tenant table with PK `tipo_id` and FK CASCADE, plus `rollback.sql`. The API has method-level `AdminClienteGuard`. Writes revalidate on the server against `listarTecnicosAsignables` |
| A1-A9 | Implemented | `ResolverAsignacionAutomatica` runs before the transaction in all 3 creation use cases. `assignTo` runs before the first `save`. Shared `operacionesDeApertura`. `ticket.asignado` is published via `alCommitear` after `ticket.creado` |
| M1-M6 | Implemented | Terminal guard runs before master lookups in both use cases. NUEVO→ASIGNADO happens in the same transaction. 422 mapping. Stale comments rewritten |
| N1-N7 | Implemented | `TicketAsignadoNotificacionListener` uses log-and-swallow and logs only `ticketId`. No self-assignment branch. Template has HTML escaping and an origin-specific text |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| ADR-1 table `reglas_asignacion` | Yes | Matches the column spec and the rollback |
| ADR-2 resolver before tx, master degrades / tenant propagates | Yes | `resolver-asignacion-automatica.service.ts` |
| ADR-3 opening `null→ASIGNADO` + system ASIGNACION | Yes | `operaciones-apertura.ts` |
| ADR-4 `AUTOR_SISTEMA` v0 UUID | Yes | |
| ADR-5 eligibility = `listarTecnicosAsignables` | Yes | The configure use case uses the pure `esResponsableElegible` on the same list (declared in apply-progress) |
| ADR-6 manual assignment | Yes | Write order inside the tx is ASIGNACION, CAMBIO_ESTADO, then save (declared) |
| ADR-7 event and listener | Yes | |
| ADR-8 wiring without cycles | Yes | `ReglasAsignacionModule` imports `TicketsModule`, not the other way around |
| ADR-9 config API | Yes | 404/422/400 behavior verified by e2e |
| ADR-10 frontend | Yes | Simple reassignment in NUEVO/ASIGNADO too (agreed; spec M4 amended) |
| Task 3.3 "e2e per channel" | Deviated (declared) | Delivered as use-case integration on real Postgres plus existing HTTP e2e for DI (apply-progress WU-3b) |

### Roadmap decision check (`docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa", point 9)
| Bullet | Verdict | Evidence |
|---|---|---|
| Rule only by ticket type, location excluded | Implemented | PK `tipo_id`; DTO has only `responsableId` |
| One fixed responsible per type, no order/priority/groups/round-robin | Implemented | Schema, upsert by PK |
| All creation channels (normal, Soporte with equipo, Edilicia, public form/QR, preventive) | Implemented | Use-case specs plus channel and preventive integration tests |
| Rule → born Asignado; no rule → Nuevo; bitácora records the system by type rule | Implemented | Integration tests, `DESCRIPCION_ASIGNACION_POR_REGLA` |
| Invalid responsible → created anyway, Nuevo, unassigned; screen marks broken rule; config accepts only valid users | Implemented | Resolver, ROTA state, PUT 422 (user-deactivation path only tested with mocks, W3) |
| Reassignable until closed; closed is not reassigned | Implemented, with the agreed UI extension (simple reassignment also offered in NUEVO/ASIGNADO, spec M4) | M1/M2/M4 tests |
| Email on every assignment (rule or manual) via the client's account; no SMTP → assign, no email | Implemented | Listener, e2e, TenantAwareEmailSender |
| Configured by ADMINISTRADOR (and ROOT) on a new admin screen; one row per type; empty = no rule | Implemented | `/admin/reglas-asignacion`, nav item "Asignación automática", AdminClienteGuard |
| P1 TECNICO or COLABORADOR with the module; no ADMINISTRADOR | Implemented | e2e 422 for ADMIN, candidates filtered |
| P2 Closed = CERRADO/CANCELADO; RESUELTO reassignable | Implemented | e2e RESUELTO → 200 |
| P3 Email always, including self-assignment | Implemented | Listener has no omission branch, plus unit and e2e |
| P4 Manual assignment of NUEVO → ASIGNADO | Implemented | e2e + unit (demo-seed adjusted in `04ce78ec`) |
| Shared work between technicians goes to point 12 | Out of scope by decision | Declared in the spec "Declaración de lo no implementado" |

No bullet is unimplemented without a declared deviation. The two agreed deviations show up in the artifacts: the M4 extension is in spec M4 and design ADR-10, and the master-only tolerance of A7 is in spec A7 and design ADR-2. Task 8.7 has to state both when it closes the bullet as "Cumplida".

### Issues Found
**CRITICAL**: None.

**WARNING**:
- W1 A5 "Tickets previos intactos" is PARTIAL. `backend/src/tickets/application/use-cases/crear-ticket.asignacion-automatica.integration.spec.ts:205-219` deletes the rule after a rule-born ticket and re-reads that ticket, but asserts only SLA fields, not `estadoId`/`asignadoId`. Two assertions would close it.
- W2 M3 "Reloj del SLA" is PARTIAL. No test covers the `/asignar` NUEVO→ASIGNADO path. It is guaranteed by the upsert, which excludes the SLA fields (`backend/src/tickets/infrastructure/persistence/prisma/ticket.mapper.ts:29-34`), and it is tested only for the sibling `asignar-en-proceso` path.
- W3 User-level deactivation ("dado de baja") is tested only with a mocked checker: R3 "Responsable inactivo", R4 "Responsable dado de baja", A4 "Responsable dado de baja". The e2e at `backend/src/reglas-asignacion/interface/controllers/reglas-asignacion.e2e.spec.ts:331-344` uses ADMIN, no module and an unknown id. The user-level `activo: true` filter at `backend/src/tickets/infrastructure/persistence/prisma/usuario-master.checker.ts:174` has no integration case. Only the membership level does.
- W4 N6 "Formulario público" and "Barrido de preventivos" are PARTIAL. The listener runs only in the HTTP e2e (`backend/src/tickets/interface/controllers/ticket-asignado-notificacion.e2e.spec.ts:249`). The tenant context in the public-form and sweep scopes relies on the same ALS mechanism as `PreventivoGeneradoNotificacionListener`.
- W5 N4 "Alta con regla sin SMTP" is PARTIAL. It is covered only in parts (`backend/src/notificaciones/infrastructure/listeners/ticket-asignado-notificacion.listener.spec.ts:197` + `tenant-aware-email-sender.spec.ts`).
- W6 R5 "ROOT" is PARTIAL. The e2e covers ROOT GET only (`reglas-asignacion.e2e.spec.ts:237`), not PUT. Both methods use the same `AdminClienteGuard`.
- W7 The `rules.verify` adversarial mutation (`openspec/config.yaml:72`) was not re-run by verify, because the launch forbids changing source. Apply recorded three mutation checks: `apply-progress.md:83` (NUEVO branch), `:94` (terminal guard) and task 2.1 (resolver try/catch).
- W8 Declared deviation from task 3.3: per-channel HTTP e2e was replaced by use-case integration on real Postgres (`apply-progress.md:55`).

**SUGGESTION**:
- S1 `backend/src/reparaciones/application/use-cases/crear-ticket-edilicio.use-case.ts:132`: the "5. Sección crítica" comment now sits above the resolver call (`:136`) instead of above `txRunner.run` (`:139`).
- S2 `frontend/src/features/tickets/components/ticket-reasignar-control.tsx:25`: `seleccionado` is not reset after a successful reassignment, so the select keeps showing the previous choice.
- S3 Commit `562b846d` still says "(sin verificar) ... No abrir PR desde este commit". The verification was done later (`apply-progress.md:74`), but published history cannot be reworded, so note it in the tracker PR body.
- S4 Task 8.7 is still pending after the deploy: mark point 9 as Entregado, declare "Cumplida" with the two agreed deviations, and run `check-roadmap-fresco.mjs`.

### Verdict
PASS WITH WARNINGS
All 56 tasks are done, all gates are green (backend 8076/8076, frontend 2100/2100, lint and typecheck clean, cast ratchet held), and every roadmap bullet is implemented. The 8 warnings are test-depth gaps or declared deviations. None of them is a behavioral defect.
