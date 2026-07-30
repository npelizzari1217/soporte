# Tasks: Notificaciones por email al cambiar el estado de un ticket

> Test-First estricto (RED→GREEN, sin REFACTOR separado salvo que un task lo pida). Cada RED apunta a UN Scenario del spec. No inventar APIs — firmas exactas de `design.md` §5.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1150-1350 (código ~556 + tests ~600-700, sobre 15 archivos nuevos + 6 modificados) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 (ver tabla) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Deps + `DomainEvent`/`IDomainEventPublisher`/`EventEmitterPublisher` + `EventEmitterModule.forRoot()` + evento `TicketEstadoCambiado` + policy `esEstadoNotificable` | PR 1 | Sin dependencias externas al change; base para todo lo demás. ~250 líneas. |
| 2 | `Email` VO + `EmailError`/`ResolverEmailError` + `EmailSenderPort` + `ISolicitanteEmailResolver` + adapter nodemailer + `email-config` + resolver cross-DB + templates | PR 2 | Depende de PR 1 solo por convención de carpetas, no por import directo. ~350-400 líneas. |
| 3 | `NotificarCambioEstadoHandler` (puro) + `NotificarCambioEstadoListener` (`@OnEvent`) + wiring parcial en `tickets.module.ts` | PR 3 | Depende de PR 1 (evento/policy) y PR 2 (ports). ~200 líneas. |
| 4 | Los dos puntos de publicación (`TransicionarEstadoUseCase`, **reestructura** `CrearObservacionUseCase`) + DTOs/`clienteId` + controllers + wiring final + tests anti-regresión | PR 4 | Depende de PR 1-3 completos. Mayor riesgo (reestructura atomicidad). ~300-400 líneas. |

Cada PR: verificación propia (`pnpm test`/`lint`/`tsc --noEmit`), inicio/fin claros, rollback sin tocar unidades previas (`work-unit-commits`, `chained-pr`).

---

## PR 1 — Fundaciones: publisher de eventos + evento + policy

- [x] 1.1 Agregar deps `nodemailer`, `@types/nodemailer`, `@nestjs/event-emitter` a `backend/package.json`
- [x] 1.2 RED: test `EventEmitterPublisher.publish()` llama `emitter.emit(eventName, event)` (D1, D10)
- [x] 1.3 GREEN: crear `shared/domain/domain-event.ts`, `shared/domain/ports/i-domain-event-publisher.ts`, `shared/infrastructure/events/event-emitter.publisher.ts`
- [x] 1.4 Wire `DOMAIN_EVENT_PUBLISHER` (@Global) en `shared/shared.module.ts`; `EventEmitterModule.forRoot()` en `app.module.ts` (nota: `forRoot()` terminó viviendo en `shared.module.ts`, no en `app.module.ts` — ver Apply Progress en STATE.md)
- [x] 1.5 RED: test forma de `TicketEstadoCambiado` — 10 campos no nulos (R9 Scenario "campos requeridos", incl. estadoAnteriorCodigo/estadoNuevoCodigo por D4)
- [x] 1.6 GREEN: crear `tickets/domain/events/ticket-estado-cambiado.event.ts`
- [x] 1.7 RED: test `esEstadoNotificable()` — true para los 5 códigos del set, false para el resto (R1 Scenarios "en el set"/"fuera del set")
- [x] 1.8 GREEN: crear `tickets/domain/policies/estados-notificables.policy.ts`
- [x] 1.9 Verify: pegar salida real `pnpm test` / `pnpm lint` / `tsc --noEmit` (backend) — ver Apply Progress en STATE.md

## PR 2 — Email: VO, errores, ports, adapter nodemailer, resolver cross-DB, templates

- [x] 2.1 RED: `Email.create()` válido/inválido, `mask()`, `equals()` (design D8, tabla testing "VO Email")
- [x] 2.2 GREEN: crear `tickets/domain/value-objects/email.vo.ts`
- [x] 2.3 RED: `EmailError`/`ResolverEmailError` — códigos distinguibles, destinatario enmascarado (R7 Scenario "Result.fail tipado", R8 Scenario "email nulo")
- [x] 2.4 GREEN: crear `tickets/domain/errors/email.errors.ts`
- [x] 2.5 Definir `EmailSenderPort`/`EmailMessage`/`EmailBody` en `tickets/domain/ports/i-email-sender.port.ts` (R7)
- [x] 2.6 Definir `ISolicitanteEmailResolver` en `tickets/domain/ports/i-solicitante-email.resolver.ts` (R8)
- [x] 2.7 RED: resolver — ok (mismo tenant), fail (no existe/otro tenant), fail (email vacío), vía `PrismaService.getMasterClient()` mockeado (R8 Scenarios 1-3, NFR aislamiento multi-tenant)
- [x] 2.8 GREEN: crear `tickets/infrastructure/persistence/prisma/solicitante-email.resolver.ts` (espejo `UsuarioMasterChecker`)
- [x] 2.9 RED: `email-config.ts` lanza al bootstrap si falta env SMTP (R7 nota infra; NFR "cero config SMTP fuera de infra")
- [x] 2.10 GREEN: crear `tickets/infrastructure/email/email-config.ts`
- [x] 2.11 RED: adapter nodemailer — éxito ⇒ `Result.ok`; fallo SMTP ⇒ `Result.fail(EmailError)` enmascarado, nunca throw (R7 Scenarios "ok"/"fail tipado")
- [x] 2.12 GREEN: crear `tickets/infrastructure/email/nodemailer-email-sender.adapter.ts`
- [x] 2.13 Crear templates `tickets/infrastructure/email-templates/cambio-estado/{subject,body}.hbs`
- [x] 2.14 Integración gated (`SMTP_TEST=1`, maildev/mailhog): adapter envía mensaje real end-to-end (tabla testing "Adapter nodemailer real") — DIFERIDA: gate implementado y verificado (skip limpio sin SMTP_TEST=1), no se ejecutó contra un maildev/mailhog real en esta sesión (no disponible en el entorno). Ver Apply Progress PR2 en STATE.md.
- [x] 2.15 Verify: pegar salida real `pnpm test` / `pnpm lint` / `tsc --noEmit`

## PR 3 — Handler puro + listener + wiring parcial

- [x] 3.1 RED: `NotificarCambioEstadoHandler.handle()` — estado no-clave ⇒ outcome `skipped`, `send` NO llamado (R1/R2 filtro no-clave)
- [x] 3.2 RED: resolver falla (huérfano / sin email) ⇒ outcome `no-email`, sin throw (R4 Scenarios 1-2)
- [x] 3.3 RED: `emailSender.send` falla ⇒ outcome `send-failed`, sin throw (R5 Scenario "SMTP falla")
- [x] 3.4 RED: camino feliz ⇒ outcome `sent` (R2 Scenario "dispara email", parcial — sin use case real)
- [x] 3.5 GREEN: crear `tickets/application/event-handlers/notificar-cambio-estado.handler.ts`
- [x] 3.6 RED: `NotificarCambioEstadoListener` (`@OnEvent`) delega y loguea outcome (WARN/ERROR), sin exponer email en claro (R4/R5 logging)
- [x] 3.7 GREEN: crear `tickets/infrastructure/events/notificar-cambio-estado.listener.ts`
- [x] 3.8 Wire providers en `tickets.module.ts`: `EMAIL_SENDER`, `SOLICITANTE_EMAIL_RESOLVER`, `NotificarCambioEstadoHandler`, `NotificarCambioEstadoListener` — ver deviación documentada (SmtpUnavailableEmailSender) en STATE.md Apply Progress PR3
- [x] 3.9 Verify: pegar salida real `pnpm test` / `pnpm lint` / `tsc --noEmit` — ver STATE.md Apply Progress PR3

## PR 4 — Puntos de publicación + DTOs/controllers + anti-regresión

- [x] 4.1 Agregar `clienteId` a `TransicionarEstadoDto` y `CrearObservacionDto` (D5)
- [x] 4.2 Poblar `clienteId` desde JWT en `tickets.controller.ts` (patrón `CrearTicketDto`) — desviación documentada: `operaciones.controller.ts` NO usa ninguno de los 2 DTOs (solo expone `GET /tickets/:id/operaciones`, timeline de solo lectura); ambos endpoints (`PATCH /tickets/:id/estado` y `POST /tickets/:id/observaciones`) viven en `tickets.controller.ts`. Ver STATE.md Apply Progress PR4.
- [x] 4.3 RED: `TransicionarEstadoUseCase` — estado clave ⇒ `publisher.publish()` post-`txRunner.run()` con evento completo; estado no-clave ⇒ no publica (R2 Scenarios 1-2, R9 Scenario "campos requeridos")
- [x] 4.4 RED: dentro del `txRunner.run` mock NO se invoca `publish`/`send` (R6 Scenario "durable", R10 NFR "nada dentro de la tx")
- [x] 4.5 GREEN: modificar `transicionar-estado.use-case.ts` — publish tras commit (design §6.A)
- [x] 4.6 RED: `CrearObservacionUseCase` — `APROBADO`→clave ⇒ publica tras commit; no-`APROBADO` ⇒ no publica; `APROBADO`→no-clave ⇒ no publica (R3 Scenarios 1-3, **anti-regresión crítica**)
- [x] 4.7 RED: correr suite EXISTENTE `crear-observacion.use-case.spec.ts` — debe seguir 100% verde tras la reestructura (riesgo atomicidad, design §9) — 24/24 verde (15 preexistentes + 9 nuevas de PR4)
- [x] 4.8 GREEN: reestructurar `crear-observacion.use-case.ts` — extraer return de `txRunner.run`, publicar afuera con `tipoTicketRepo.findCodigoById` (design §6.B, D6)
- [x] 4.9 Inyectar `DOMAIN_EVENT_PUBLISHER` (ambos use cases) + `TIPO_TICKET_REPOSITORY` (crear-observación) en `tickets.module.ts`
- [x] 4.10 RED: evento publicado por ambos caminos tiene forma idéntica (R9 Scenario "misma forma") — `ticket-estado-cambiado-forma-identica.spec.ts`
- [x] 4.11 RED: `CANCELADO` notifica vía `PATCH` en `COMPRAS`/`EDILICIA` (R1 Scenario "transición a CANCELADO")
- [x] 4.12 RED: `.emit()` no bloquea la respuesta HTTP — `EventEmitterPublisher` real + listener con delay artificial (R6 Scenario "no bloquea")
- [x] 4.13 Verify: pegar salida real `pnpm test` / `pnpm lint` / `tsc --noEmit`, incluyendo suite completa `crear-observacion` sin regresión — ver STATE.md Apply Progress PR4
- [x] 4.14 Enriquecimiento del evento (decisión de diseño del usuario 2026-07-30): `TicketEstadoCambiado` pasa a 12 campos (+`numero` +`tituloTicket`), poblados por ambos use cases desde la `TicketEntity` que ya tienen en la mano al publicar (SIN query extra, D4 se amplía pero no se contradice). `NotificarCambioEstadoHandler.handle()` mapea `numero`/`tituloTicket` al `EmailMessage.data`. Test de forma del evento (PR1) actualizado a 12 campos.

---

## Definition of Done (CLAUDE.md §9 — recordatorio por PR)

- Pegar salida REAL de `pnpm test`, `pnpm lint`, `tsc --noEmit` en `backend/` antes de marcar cualquier PR como "done". Prohibido "tests pass" sin evidencia.
- Prohibido `as any` / `as unknown as`.
- Conventional commits, SIN Co-Authored-By.
- Reporte honesto: si algo falla o se difiere, decirlo explícitamente (ej. integración nodemailer gated si no hay maildev disponible).

## Trazabilidad (requirement → task)

R1→1.7-1.8,4.11 · R2→4.3,4.5 · R3→4.6-4.8 · R4→3.2 · R5→3.3 · R6→4.4,4.12 · R7→2.1-2.4,2.11-2.12 · R8→2.7-2.8 · R9→1.5-1.6,4.10 · R10(NFR)→4.4
