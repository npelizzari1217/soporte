```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:8b54d7302454fcf3e244c4b7c5d0311eeba7b793a8603e1c6f89865e7ac8460d
verdict: fail
blockers: 1
critical_findings: 1
requirements: 24/24
scenarios: 62/63
test_command: cd backend && pnpm test
test_exit_code: 0
test_output_hash: sha256:9625d88443f87a765645d9d45cdc5c8bb5321a2599125189e52fa409fee3e5d6
build_command: cd backend && pnpm lint && pnpm typecheck
build_exit_code: 0
build_output_hash: sha256:60d56fa71895b1f02e36ea73699565a21f21f501f5b4e8d54d0b7e344c0d41ec
```

## Verification Report

**Change**: sla-primera-respuesta-y-pausa
**Version**: N/A (new capabilities: ticket-esperando-cliente, sla-reloj-activo, sla-primera-respuesta, dashboard-metricas-sla)
**Mode**: Standard (feature; no Strict TDD injection)
**Candidate**: branch `feat/sla-primera-respuesta-y-pausa-wu09b` (tip of the whole chain), HEAD `a6b82cde`, diff `git diff main...HEAD` (merge base `81b0d224`), 154 files, +9964/-1220. `evidence_revision` is the sha256 of that diff.

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 103 |
| Tasks complete | 103 |
| Tasks incomplete | 0 |

`gentle-ai sdd-status sla-primera-respuesta-y-pausa --cwd . --json`: `taskProgress` 103/103, `applyState: all_done`, `verify: ready`, no `blockedReasons`. 9b.6 (roadmap closure) is not a checkbox: `tasks.md` declares it a post-deploy delivery step.

Every WU section of `apply-progress.md` maps to commits in `git log main..HEAD` (34 implementation commits after the 8 planning commits): WU-1 `6a801779`; WU-2 `003621e9`, `03bd3df0`; WU-3a `b67f5286`, `b090f424`, `91012ce1`, `e1ab4a6c`; WU-3b `fbcd9261`, `6f3e49ea`, `e3e472b4`, `98ea3f08`; WU-3c `c1de1266`, `70a83e1a`, `dc45c63b`, `5f116213`; WU-4 `98bef385`, `9849bd0b`; WU-5 `e882560f`, `80d2f16a`; WU-6 `b9920d1b`, `9c538a1d`, `32c186b2`; WU-7 `cd14df0a`, `508ef375`, `b28f2976`, `bb74c0a5`; WU-8 `18868895`, `e9818935`, `fc37318d`; WU-9a `5c3c457f`, `d44459ac`; WU-9b `6e2b197c`, `a6b82cde`. The chain PRs #391-#420 and the tracker PR #421 are open; #421 carries the 9b.7 deploy notes.

### Build & Tests Execution

All gates were run by this verification, in the foreground, on `a6b82cde`:

```text
backend  pnpm lint                                  exit 0  (eslint ., zero errors)
backend  pnpm typecheck                             exit 0  (tsc --noEmit -p tsconfig.typecheck.json)
backend  pnpm test                                  exit 0  627 files, 7685 tests passed (1072 s)
frontend JWT_SECRET=dummy pnpm lint                 exit 0  (No ESLint warnings or errors)
frontend pnpm type-check                            exit 0
frontend pnpm test                                  exit 0  245 files, 1990 tests passed
root     node scripts/check-casts-en-specs.mjs      exit 0  (617 in 114 files, base 617/114; ratchet holds)
root     node scripts/check-roadmap-fresco.mjs      exit 0  ("El roadmap esta fresco"; 3 decisions declared on delivered points)
```

**Build**: Passed. `build_output_hash` is the sha256 of the two observed result lines for backend lint and typecheck.

**Tests**: Passed (0 failed, 0 skipped). `test_output_hash` is the sha256 of the full backend log. The three `FAIL orden-de-arranque.spec.ts` blocks are the child processes that the boot-order test launches on purpose; the outer suite reports 627/627 files. The ERROR/WARN lines come from forced-failure tests and from controller specs whose fixture estados are outside the catalog (see S6).

Environment: `soporte-postgres-master` up; `soporte_tenant_test` already at 57/57 tenant migrations ("Database schema is up to date"); Prisma clients regenerated (`generate:tenant`, `generate:master`) before the run, no tracked file changed.

**Coverage**: not measured (threshold 0 in `openspec/config.yaml`) -> Not available.

**Adversarial mutation** (`rules.verify`). Run on an rsync copy of `backend/` in a scratch directory with `node_modules` linked and the orphan-sweep `globalSetup` removed; the worktree was never touched (`git status` shows only the pre-existing untracked `soporte.jpg`).

| Mutation | Result | After revert |
|---|---|---|
| M1 `RelojSla.plegar`: cumplimiento `<=` -> `<` | RED: "acumulado igual a la meta cumple (borde `<=`)" | GREEN |
| M2 `RelojSla.vencimientoDerivado`: drop `min(slaVenceAt, inicioTramo)` (pause forgives an exceeded target) | RED: 3 tests, incl. "pausa con el SLA ya vencido no suma la espera y conserva min(...)" | GREEN |
| M3 resume keeps the old `correDesde` (`correDesde ?? t`) | GREEN: equivalent mutant (the pause branch already nulls `correDesde`), not a gap | n/a |
| M4 `ESTADOS_NO_DESTINO_CORRECTIVO` empty | RED: 4 tests (salto NUEVO/ASIGNADO/RESUELTO -> ESPERANDO_CLIENTE rejected; constants spec) | GREEN, 298/298 |
| M5 `ESTADOS_RELOJ_CORRE` includes ESPERANDO_CLIENTE (the pause stops nothing) | RED: 8+ tests across constants and `RelojSla` | GREEN |
| M6 sweeper (`findVencibles`/`marcarVencido`) without the `estado.codigo in ESTADOS_RELOJ_CORRE` filter | RED: 4 integration tests (RESUELTO and ESPERANDO_CLIENTE marked; orphan-of-pause case) | GREEN, 22/22 |

These add to the apply-phase mutations (3b.5 `<=`, 3b.9 order by `created_at` instead of `sla_reloj_seq`).

### Spec Compliance Matrix

Totals counted from the four spec files with native heading rules: 24 requirements, 63 scenarios. Every listed test passed in the runs above.

**ticket-esperando-cliente**

| Req | Scenario | Test | Result |
|---|---|---|---|
| R1 | Arcos permitidos | `base-ticket-state-machine.spec.ts > transiciones válidas — 11 arcos`; `transicionar-estado.use-case.spec.ts > marcador del reloj > EN_PROCESO→ESPERANDO_CLIENTE ...`; FE `ticket-transition-control.test.tsx > ESPERANDO_CLIENTE → ofrece [EN_PROCESO, RESUELTO, CANCELADO]` | COMPLIANT |
| R1 | Arcos no permitidos | `base-ticket-state-machine.spec.ts > ESPERANDO_CLIENTE: arcos rechazados`; FE `estado-transitions.test.ts > NUEVO/ASIGNADO/RESUELTO no tienen arco ...`, `> ESPERANDO_CLIENTE no sale hacia NUEVO, ASIGNADO ni CERRADO` | COMPLIANT |
| R1 | Estado disponible en todos los clientes | `tenant-seeder.adapter.integration.spec.ts > ESPERANDO_CLIENTE queda una sola vez con M1, con seed() y al reaplicar M1`; `crear-cliente.e2e.spec.ts` (7 codes) | COMPLIANT |
| R2 | Salto hacia la espera rechazado | `transicionar-estado.use-case.spec.ts > corrector: el salto %s→ESPERANDO_CLIENTE se rechaza (422) y el estado no cambia` (NUEVO, ASIGNADO, RESUELTO); FE `estado-transitions.test.ts > nunca ofrece ESPERANDO_CLIENTE como destino correctivo` | COMPLIANT |
| R2 | Salto desde la espera | `transicionar-estado.use-case.spec.ts > corrector: el salto SALE de ESPERANDO_CLIENTE (→ASIGNADO) → OK`; `reloj-sla.spec.ts > toda salida de la espera (a ASIGNADO) reanuda`; `estados.constants.spec.ts > afectaRelojSla es verdadero para ESPERANDO_CLIENTE → ASIGNADO` | COMPLIANT |
| R3 | Comenta el solicitante | `esperando-cliente.e2e.spec.ts > R3 + invariante "comentario interno"` (EN_PROCESO, timeline, clock marker); `reanudar-por-comentario.listener.spec.ts > el solicitante comenta en ESPERANDO_CLIENTE ...` | COMPLIANT |
| R3 | Comenta otra persona o es interno | same e2e (internal from requester, public from another user do not resume); listener spec (other author) | COMPLIANT |
| R3 | Ticket que no espera | `reanudar-por-comentario.listener.spec.ts` (ticket in EN_PROCESO generates no transition) | COMPLIANT |
| R4 | Aviso al solicitante | `esperando-cliente.e2e.spec.ts > R4: EN_PROCESO→ESPERANDO_CLIENTE envía un mail al solicitante`; `ticket-notificacion.listener.spec.ts > envía al solicitante la plantilla de espera` | COMPLIANT |
| R4 | Falla el envío | `ticket-notificacion.listener.spec.ts > el SMTP que falla no se propaga: queda registrado`; `> el solicitante externo sin correo no recibe nada y el hecho se registra` | COMPLIANT |
| R4 | Otros estados no avisan por este motivo | `ticket-notificacion.listener.spec.ts > la salida a EN_PROCESO no envía el mail de espera`; `transicionar-estado.use-case.spec.ts > R4: ... la salida a EN_PROCESO no` | COMPLIANT |

**sla-reloj-activo**

| Req | Scenario | Test | Result |
|---|---|---|---|
| R1 | Entrar a la espera detiene | `reloj-sla.spec.ts > entrar a espera con 3 h activas deja acumulado 3 h y reloj detenido` | COMPLIANT |
| R1 | Toda salida reanuda | `reloj-sla.spec.ts > toda salida de la espera (a EN_PROCESO/NUEVO/ASIGNADO) reanuda desde ese instante`; `esperando-cliente.e2e.spec.ts` (comment path) | COMPLIANT |
| R2 | Pausa que corre el vencimiento | `reloj-sla.spec.ts > meta 8 h y 3 h activas, tras 2 días hábiles de espera el vencimiento queda 5 h hábiles después de reanudar` | COMPLIANT |
| R2 | Pausa con SLA ya vencido | `reloj-sla.spec.ts > pausa con el SLA ya vencido no suma la espera y conserva min(slaVenceAt, inicioTramo)`; `reloj-sla.meta.spec.ts > con la meta superada conserva el vencimiento anterior al tramo` (mutation M2 RED) | COMPLIANT |
| R2 | Calendario editado durante la pausa | `reloj-sla.spec.ts > usa el calendario vigente al reanudar` | COMPLIANT |
| R2 | Reprioritizar conserva lo acumulado | `aplicar-sla.use-case.spec.ts > repriorizar con 3 h acumuladas a una prioridad de 4 h deja 1 h hábil por correr y conserva las pausas` | COMPLIANT |
| R3 | Resuelto a tiempo tras una semana de espera | `reloj-sla.cumplimiento.spec.ts > 5 h activas y 7 días de espera sobre meta 8 h cumple` | COMPLIANT |
| R3 | Editar la prioridad no cambia la meta | `reloj-sla.cumplimiento.spec.ts > la meta es la fijada en el ticket: ... resolver con 6 h sobre una meta de 8 h cumple` | COMPLIANT |
| R3 | Resuelto tarde antes del barrido | `reloj-sla.cumplimiento.spec.ts > 9 h sobre una meta de 8 h no cumple de inmediato` | COMPLIANT |
| R3 | Cierre administrativo tardío | `reloj-sla.cumplimiento.spec.ts > CERRADO no cambia el cumplimiento` | COMPLIANT |
| R4 | Ticket en espera | `prisma-sla-ticket.integration.spec.ts > excluye un ticket en ESPERANDO_CLIENTE con vencimiento pasado y sin marca`; `marcar-vencidos.integration.spec.ts > un ticket en ESPERANDO_CLIENTE ... no se marca ni se notifica` (mutation M6 RED) | COMPLIANT |
| R4 | Ticket corriendo | `prisma-sla-ticket.integration.spec.ts > incluye un ticket con sla_vence_at < now`; `marcar-vencidos.use-case.spec.ts > el evento sale una sola vez por ticket marcado`; `marcar-vencidos.integration.spec.ts > un previo corriendo se marca por estado ... y se notifica una vez` | COMPLIANT |
| R4 | Huérfano de pausa | `marcar-vencidos.integration.spec.ts > huérfano de pausa con dos listeners caídos ...`, `> huérfano reanudado: el vencimiento viejo no lo marca` | COMPLIANT |
| R5 | Resuelto tarde | `estado-sla-derivado.policy.spec.ts > resuelto con cumplido=false da VENCIDO sin marca del barrido`; `ticket.dto.spec.ts > resuelto con cumplido=false: VENCIDO aunque vencido sea false`; FE `ticket-header.test.tsx > resuelto tarde muestra 'SLA vencido' sin depender de vencido` | COMPLIANT |
| R5 | En espera | `estado-sla-derivado.policy.spec.ts > ESPERANDO_CLIENTE da EN_PAUSA ...`; `ticket.dto.spec.ts > en ESPERANDO_CLIENTE: EN_PAUSA y sin fecha de vencimiento vigente`; FE `ticket-header.test.tsx > en pausa: ... la fecha guardada NO se muestra como vigente` | COMPLIANT |
| R6 | Reabrir y volver a resolver | `reloj-sla.cumplimiento.spec.ts > reapertura con 7 h + 2 h da 9 h y gana la última resolución` | COMPLIANT |
| R6 | Tiempo en RESUELTO no cuenta | same test ("el tiempo en RESUELTO no suma") | COMPLIANT |
| R7 | Primera pausa de un ticket previo | `aplicar-sla.use-case.spec.ts > un previo que pasa a espera se incorpora con el tiempo activo desde su creación y V no se reescribe`; `reloj-sla.cumplimiento.spec.ts > incorporación de previos` | COMPLIANT |
| R7 | Sin recálculo masivo | `tickets-reloj-sla.integration.spec.ts > M2 no recalcula vencimientos ni cumplimientos de los tickets previos`, `> las filas existentes quedan con acumulado y corre_desde NULL` | COMPLIANT |
| R8 | Cierre antes y después del vencimiento | `prisma-dashboard.integration.spec.ts > cuenta el cumplimiento fijado en cada resolución y, en los previos, fechaCierre <= slaVenceAt`; `estado-sla-derivado.policy.spec.ts > previo sin cumplimiento ...` | COMPLIANT |
| R9 | Pausa en cohorte CORRIDO | `reloj-sla.spec.ts > cohorte CORRIDO: meta 24 h, 10 h activas y 48 h de pared en espera vencen 14 h de pared tras reanudar` | COMPLIANT |
| R9 | Preventivo | `reloj-sla.cumplimiento.spec.ts > preventivo (meta null) deja cumplido null`; `aplicar-sla.use-case.spec.ts > preventivo: meta null y no consulta la prioridad` | COMPLIANT |

**sla-primera-respuesta**

| Req | Scenario | Test | Result |
|---|---|---|---|
| R1 | Primera respuesta válida | `crear-comentario.use-case.spec.ts > comentario público de un técnico registra la fecha de la operación, dentro de la tx`; `primera-respuesta.integration.spec.ts > un comentario público de un técnico registra la fecha de la operación` | COMPLIANT |
| R1 | Eventos que no cuentan | `crear-comentario.use-case.spec.ts > un comentario interno no la registra`, `> un comentario público del propio solicitante no la registra`; `primera-respuesta.integration.spec.ts > el interno y el público del solicitante no cuentan`. No test runs an assignment or a state change and then asserts `primera_respuesta_at IS NULL` (see C1) | PARTIAL |
| R1 | Solicitante externo | `crear-comentario.use-case.spec.ts > solicitante externo (solicitanteId null): cualquier autor interno la registra` | COMPLIANT |
| R1 | Segundo comentario o concurrencia | `primera-respuesta.integration.spec.ts > un segundo comentario no cambia la fecha`, `> dos registros concurrentes dejan UNA fecha ...` | COMPLIANT |
| R1 | El comentario que la registró se borra después | `primera-respuesta.integration.spec.ts > borrar el comentario que registró la primera respuesta no cambia la fecha` | COMPLIANT |
| R2 | Meta válida y vacía | `catalogo.dto.spec.ts > PATCH acepta null (limpia la meta) y un entero positivo`; `crear-prioridad`/`editar-prioridad.use-case.spec.ts`; FE `prioridad-form-dialog.test.tsx > vacío se envía como null (sin meta)` | COMPLIANT |
| R2 | Meta inválida | `catalogo.dto.spec.ts > POST rechaza 0, -1, 1.5`, `> PATCH rechaza 0, -3`; `prioridades-primera-respuesta.integration.spec.ts > el CHECK rechaza la meta 0 / -1`; FE form test (0 and -2 rejected) | COMPLIANT |
| R2 | Prioridades existentes | `prioridades-primera-respuesta.integration.spec.ts > las prioridades existentes quedan sin meta tras aplicar M3` | COMPLIANT |
| R3 | Cálculo hábil | `aplicar-sla.use-case.spec.ts > HABIL con meta: suma las horas hábiles desde createdAt (viernes 17:30, meta 2 h, cierre 18:00)`; `calcular-sla-habil-vence.service.spec.ts` (2.2 case) | COMPLIANT |
| R3 | Sin pausa | `aplicar-sla.use-case.spec.ts > entrar a ESPERANDO_CLIENTE no corre el vencimiento`; `sla-primera-respuesta.e2e.spec.ts > un ticket en espera sin respuesta igual se notifica y se marca` | COMPLIANT |
| R3 | Repriorización | `aplicar-sla.use-case.spec.ts > repriorizar reescribe con el repo condicionado a "sin respuesta"`; `primera-respuesta.integration.spec.ts > fijarVencimientoSiSinRespuesta escribe sin respuesta y deja igual al ya respondido` | COMPLIANT |
| R4 | Vence sin respuesta | `sla-primera-respuesta.e2e.spec.ts > dos barridos envían un solo mail al asignado y a cada administrador`, `> un administrador que es el asignado recibe un solo mail`; FE `ticket-header.test.tsx > primera respuesta vencida muestra su badge` | COMPLIANT |
| R4 | En espera igual vence | `sla-primera-respuesta.e2e.spec.ts > un ticket en espera sin respuesta igual se notifica y se marca`; `marcar-vencidos.integration.spec.ts > la primera respuesta no se pausa` | COMPLIANT |
| R4 | Aislamiento de fallos | `notificador-vencimiento-sla.spec.ts > aislamiento por-destinatario: un send() que falla NO bloquea el resto` | COMPLIANT |
| R4 | Ya respondido o cerrado | `marcar-vencidos.integration.spec.ts > excluye al ya respondido, al ya marcado, al borrado ...`; the same spec covers the three excluded states (RESUELTO, CERRADO, CANCELADO) | COMPLIANT |
| R5 | Relleno desde el historial | `tickets-primera-respuesta.integration.spec.ts > rellena desde el historial: ignora interno, borrado y solicitante; toma el primer publico de un tecnico` | COMPLIANT |
| R5 | Sin meta retroactiva | `tickets-primera-respuesta.integration.spec.ts > no asigna meta ni vencimiento retroactivos aunque la prioridad ya tenga meta`; `prisma-dashboard.integration.spec.ts > el rellenado sin meta entra al tiempo medio` | COMPLIANT |
| R5 | Idempotencia | `tickets-primera-respuesta.integration.spec.ts > reaplicar el relleno no cambia ninguna fecha, ni siquiera ante comentarios posteriores` | COMPLIANT |
| R6 | Preventivo | `aplicar-sla.use-case.spec.ts > preventivo: sin vencimiento aunque la prioridad tenga meta`; `sla-primera-respuesta.e2e.spec.ts > ... sin meta tampoco` | COMPLIANT |

**dashboard-metricas-sla**

| Req | Scenario | Test | Result |
|---|---|---|---|
| R1 | Resuelto tarde antes del barrido | `prisma-dashboard.integration.spec.ts > cuenta el cumplimiento fijado en cada resolución ...` (incorporated with `sla_cumplido=false`, `vencido=false`) + `reloj-sla.cumplimiento.spec.ts > 9 h sobre una meta de 8 h no cumple de inmediato` | COMPLIANT |
| R1 | Semana en espera | same integration test (incorporated `sla_cumplido=true`) + `reloj-sla.cumplimiento.spec.ts > 5 h activas y 7 días de espera ...` | COMPLIANT |
| R1 | Cohorte previa | same integration test (previo with `fechaCierre > slaVenceAt`, no mark) | COMPLIANT |
| R1 | Sin datos | `prisma-dashboard.integration.spec.ts > sin datos devuelve ceros`; `obtener-metricas.use-case.spec.ts` (percentage null) | COMPLIANT |
| R2 | Porcentaje | `prisma-dashboard.integration.spec.ts > cuatro tickets con meta (dos a tiempo, uno tarde, uno sin respuesta y vencido) dan 2 de 4` | COMPLIANT |
| R2 | Tiempo medio en horas hábiles | `promedio-horas-habiles.spec.ts > viernes 17:00 respondido lunes 10:00 (2 h hábiles) y respondido 17:30 (0,5 h) dan 1,25 h`; integration "medido en horas hábiles" | COMPLIANT |
| R2 | Ticket rellenado y sin meta | `prisma-dashboard.integration.spec.ts > el rellenado sin meta entra al tiempo medio ...` | COMPLIANT |
| R2 | Sin datos | `prisma-dashboard.integration.spec.ts > sin datos el tiempo medio es null`; `promedio-horas-habiles.spec.ts > sin tramos devuelve null, no 0` | COMPLIANT |
| R3 | Tarjetas | FE `dashboard-view.test.tsx > muestra las tres tarjetas de SLA con sus valores`, `> con las tres métricas nulas se lee 'sin datos' y no 0 %` | COMPLIANT |
| R4 | Preventivo resuelto | `prisma-dashboard.integration.spec.ts > un preventivo resuelto con respuesta de un técnico no altera ninguna de las tres métricas` | COMPLIANT |
| R5 | Ticket en espera | `prisma-dashboard.integration.spec.ts > un ticket asignado en ESPERANDO_CLIENTE cuenta en abiertos y en la carga, y no en el cumplimiento de resolución` | COMPLIANT |

**Compliance summary**: 62/63 scenarios COMPLIANT, 1 PARTIAL, 0 FAILING, 0 UNTESTED.

### Roadmap Decision Fidelity

Source: `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa", bullet "Segunda etapa, punto 6". Each sub-bullet was checked against the code, not against the spec.

| # | Sub-bullet | Code evidence | Status |
|---|---|---|---|
| 1 | New state; enters from En proceso, exits to En proceso, Resuelto or Cancelado | `base-ticket-state-machine.ts` `VALID_TRANSITIONS`; M1; seeder; FE mirror `estado-transitions.ts` | Fulfilled |
| 2 | Clock stops while waiting; due date shifts by the business hours paused; the sweep does not mark a waiting ticket | `RelojSla.plegar` + `vencimientoDerivado` (`sumar(resume, meta - accumulated)`, equivalent to shifting by the paused business time); `findVencibles` restricted to `ESTADOS_RELOJ_CORRE` | Fulfilled (CORRIDO cohort measured in wall time, see S1) |
| 3 | Requester comments while waiting -> back to En proceso | `ReanudarPorComentarioListener` (requester, public, normal arc) | Fulfilled |
| 4 | First response = first public comment from someone other than the requester | `CrearComentarioUseCase` (`!esInterno && autorId !== solicitanteId`), the only writer of `primera_respuesta_at` | Fulfilled |
| 5 | Optional per-priority "Primera respuesta (h)", business hours, same calendar, no pause | M3 + DTO `@IsInt @Min(1)`; `AplicarSla` `medidor.sumar(createdAt, h)` (HABIL only), independent of `slaActivo` and of the pause | Fulfilled |
| 6 | Expired first response: badge + mail to assignee and administrators, like the resolution expiry | `derivarEstadoPrimeraRespuesta` + header badge; sweep step 3 + `NotificadorVencimientoSla` shared with the resolution listener | Fulfilled |
| 7 | Existing tickets are not recalculated; first-response date backfilled, no retroactive target | M4 backfill sets only `primera_respuesta_at`; `primera_respuesta_vence_at` stays NULL | Fulfilled |
| 8 | Existing tickets and active clock: open ones incorporated lazily with all time since creation as active, due date untouched; resolved/closed ones by close date vs due date | `RelojSla.plegar` previo branch (`acumuladoS IS NULL`, meta = time to V, V not rewritten without a resume); dashboard `previos` count `fechaCierre <= slaVenceAt` | Fulfilled (also incorporates on resolve, as spec R7 states) |
| 9 | Dashboard adds % first response on time and mean first-response time next to resolution compliance | `prisma-dashboard.repository.ts`; FE `dashboard-view.tsx` three cards | Fulfilled |
| 10 | Resolution compliance by active time; Cerrado does not overwrite; no false "on time" | `cumplido = acumulado <= meta` fixed on RESUELTO; RESUELTO->CERRADO does not mark; dashboard never reads `vencido` | Fulfilled |
| 11 | Pause always discounts, even if already overdue | no "already overdue" branch exists; exceeded target keeps `min(V, tramo start)` (M2 RED) | Fulfilled |
| 12 | Reopen by corrective jump keeps accumulating, no extra time, last resolution wins; extra time / new clock is a PENDING decision | `plegar` resumes from stored accumulated, clears `cumplido`, recomputes on next RESUELTO; pending decision declared out of scope in `ticket-esperando-cliente` spec | Fulfilled; pending decision correctly not implemented |
| 13 | Mean first-response time in business hours | `promedioHorasHabiles` with `msHabilesEntre`, calendar loaded once | Fulfilled |
| 14 | Mail to the requester on entering "Esperando al cliente" | `estados-notificables.policy.ts` + `templateEsperandoCliente`; external requester by registered email, logged when there is none | Fulfilled |
| 15 | Corrective jump cannot enter the state; any exit (also by jump) resumes the clock | `ESTADOS_NO_DESTINO_CORRECTIVO` in the use case and FE `ESTADOS_CORRECTIVOS`; `afectaRelojSla` true for every waiting -> running exit | Fulfilled |
| 16 | Preventive tickets stay outside the SLA | `AplicarSla` (meta null, no first-response due date); dashboard `sinPreventivos` on all three metrics | Fulfilled |

No undeclared deviation was found. The roadmap row 6 is still "Pendiente" and the bullet has no Cumplida/Desviación line yet: that is task 9b.6, a post-deploy step, and `check-roadmap-fresco.mjs` passes because the point is not marked delivered.

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|---|---|---|
| ticket-esperando-cliente R1-R4 | Implemented | backend is the single source; FE mirrors arcs and corrective targets |
| sla-reloj-activo R1-R9 | Implemented | `RelojSla` pure fold by `sla_reloj_seq`, CAS write, sweep reconciles pending before marking |
| sla-primera-respuesta R1-R6 | Implemented | registration in the comment transaction; due date only for HABIL; sweep step 3 does not exclude the pause |
| dashboard-metricas-sla R1-R5 | Implemented | four `count` with field references; no `$queryRaw`; open/load queries unchanged |

### Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| ADR-1 data model (7 columns, NULL-then-DEFAULT, CHECKs, partial indexes, `slaVenceAt`/`vencido` out of the entity `update`) | Yes | drift test compares Prisma and DDL defaults |
| ADR-2 business-time engine | Yes, minor deviation | `sumarMsHabiles` accepts finite non-integer `ms >= 0` (recorded in apply-progress WU-2) |
| ADR-3 hybrid hook, per-ticket sequence under the row lock, post-commit event | Yes | rollback, concurrency and order-by-sequence covered by integration tests |
| ADR-4 derived due date, sweep, compliance, reopen, legacy incorporation | Yes | `AplicarSla` throws `SLA_RELOJ_CONFLICTO` after two lost CAS (see S2) |
| ADR-5 resume by comment and requester mail | Yes | |
| ADR-6 first response | Yes, extended | `fijarVencimientoSiSinRespuesta` also resets `primera_respuesta_vencida` (orchestrator decision, recorded in WU-7) |
| ADR-7 dashboard | Yes | |
| ADR-8 derived DTO state | Yes, two recorded decisions | `SIN_SLA` also while waiting when there is no due date; unknown estado code treated as running with a controller warning (WU-9b) |

Migrations: M1-M4 (`20261007120000` .. `20261007150000`) sort after the last migration on `main` (`20261006120000_respuestas_predefinidas`), each has a `rollback.sql`, M1 is idempotent (`ON CONFLICT DO NOTHING`), the M4 backfill is idempotent (`WHERE primera_respuesta_at IS NULL`) and writes no due date, and neither M2 nor M4 recalculates anything. Integration specs apply the rollback and re-apply each migration.

### Issues Found

**CRITICAL**:
- **C1 (test-evidence gap, not a behavioral defect)** `sla-primera-respuesta` R1, scenario "Eventos que no cuentan": no runtime test runs an assignment or a state change and then asserts that `primera_respuesta_at` is still NULL. Only the internal comment and the requester's comment are tested (`crear-comentario.use-case.spec.ts`, `primera-respuesta.integration.spec.ts`). Static evidence says the behavior is correct: `registrarSiFalta` has a single caller, `CrearComentarioUseCase.execute` (`backend/src/tickets/application/use-cases/crear-comentario.use-case.ts:129`), and it is the only place that creates a `COMENTARIO` operation. Remediation: one assertion, for example in `esperando-cliente.e2e.spec.ts`: after the assignment and the transitions and before any comment, `primera_respuesta_at` is NULL. Under the skill rule (a scenario is compliant only with a passing covering test), the scenario stays PARTIAL and blocks archive until that test exists. The gentle-ai validator refuses a passing verdict with 62/63 scenarios.

**WARNING**:
- **W1** `apply-progress.md` contradicts `tasks.md`. The WU-9b heading says "9b.6 y 9b.7 quedan pendientes", but `tasks.md` marks 9b.7 done (the deploy notes are in PR #421) and turns 9b.6 into a post-deploy step. The "WU-3a.3" section also appears twice. This is artifact hygiene, but under §3.3 an artifact that misstates progress needs fixing before archive.

**SUGGESTION**:
- **S1** When 9b.6 declares the bullet, state the precision for the legacy `CORRIDO` cohort: its pause is measured in wall time (spec R9), while the roadmap sub-bullet says "horas hábiles". New tickets are always `HABIL`, so this is a precision rather than a deviation. A CORRIDO ticket also gets no first-response due date (`aplicar-sla.use-case.ts`, HABIL only).
- **S2** `AplicarSlaUseCase` gives up after two lost CAS rounds and throws `SLA_RELOJ_CONFLICTO`. The listener only logs it, and nothing re-applies the target: the sweep reconciles only `sla_reloj_pendiente`, and `ConsolidarRelojSlaUseCase` never sets `sla_meta_s`. A creation or reprioritization that races two transitions would keep a stale or missing target. The probability is low and the failure is logged.
- **S3** The resolution `vencido` flag is not reset when a reprioritization moves the due date forward. This is the same as before the change, but it is now asymmetric with `primera_respuesta_vencida`, which is reset. A ticket that becomes overdue again would get no second mail. The displayed state is derived from the dates, so only the mail is affected.
- **S4** `tiempoPromedioPrimeraRespuestaHoras` loads every answered ticket in scope without a bound and walks business windows per row on each dashboard request (`prisma-dashboard.repository.ts:187`). Watch this on large tenants.
- **S5** Migration folders are dated 2026-10-07 (one day ahead). They are harmless for ordering today, but any tenant migration created on `main` before the deploy needs a later timestamp.
- **S6** Controller specs log many `Estado ... fuera del catálogo activo` warnings because their fixture estado ids are not in the mocked catalog. That is noise in the suite output only.

**Open follow-ups (not blockers)**:
- Dead code: `backend/src/sla/domain/services/calcular-sla-vence.service.ts` and its spec have no production consumer since WU-3c (`ticket.entity.ts` only mentions it in a comment).
- Shared test tenant `soporte_tenant_test`: specs create estados/tipo_operacion rows with prefixed `codigo` values and clean them by prefix. A prefix collision between specs, or an interrupted run, can leave rows that break unique `codigo` inserts in later runs.
- Pre-deploy: count `COMENTARIO` operations per production tenant (read-only) to size the M4 backfill. Only the synthetic measurement exists (~1.1 s for 20,000 tickets and 80,000 comments).
- Post-deploy 9b.6: mark row 6 as Entregado and declare Cumplida (with S1) in the roadmap bullet.
- Ayuda debt recorded in the commits and PRs: the new state, the pause rule, the priority field and the dashboard indicators. `tickets-listado.md` was corrected in WU-9b.

### Verdict

FAIL

This is not a behavior failure: all gates are green, every requirement is implemented, and every roadmap sub-bullet matches the code with no undeclared deviation. The FAIL comes from one evidence gap: 62/63 scenarios have passing runtime coverage, and the remaining scenario is PARTIAL (C1). Closing it takes one assertion and a re-verify. Fix W1 (apply-progress) in the same pass. Expected outcome after that: PASS WITH WARNINGS.
