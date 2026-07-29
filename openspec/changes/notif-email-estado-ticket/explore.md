# Exploration: Notificaciones por email al cambiar estado de ticket

> Artefacto de `sdd-explore`. Persistido por el orquestador (engram no disponible en la sesión → artifact store = openspec).

## Decisiones de producto ya cerradas (usuario)

- **Transiciones que notifican:** solo estados clave (a afinar en spec; candidatos terminales: RESUELTO / RECHAZADO / SIN_SOLUCION / CERRADO).
- **Destinatario:** **solo el solicitante** (`solicitanteId` → `master.Usuario.email`). NO se notifica al técnico asignado en el MVP.
- **Proveedor:** SMTP propio vía **nodemailer**, detrás de un port `EmailSenderPort` (swappable).
- **Config SMTP:** global por env en el MVP; por-tenant como fase 2 documentada.

## Estado actual

**Único use case "oficial" de transición, pero DOS caminos que llegan a un cambio de estado:**

1. `PATCH /tickets/:id/estado` → `TicketsController.transicionarEstado` (`backend/src/tickets/interface/controllers/tickets.controller.ts:354-416`) → `TransicionarEstadoUseCase.execute()` (`backend/src/tickets/application/use-cases/transicionar-estado.use-case.ts:83-180`). Único use case de transición, **compartido por los 3 tipos** (SOPORTE, COMPRAS, EDILICIA). Validación de arco vía `TicketStateMachineFactory.resolve(tipoCodigo)` (Strategy). Persistencia: `ticketRepo.save(ticket)` + `operacionRepo.save(operacion)` dentro de `txRunner.run()` (líneas 174-177).

2. `POST /tickets/:id/observaciones` → `CrearObservacionUseCase.execute()` (`backend/src/tickets/application/use-cases/crear-observacion.use-case.ts:102-208`). Con ticket en `APROBADO`, dispara una **auto-transición inline** (líneas 140-193) que **reproduce el cambio de estado SIN llamar a `TransicionarEstadoUseCase`** (ADR-2, línea 83: "evitar txRunner anidado no atómico"). **Cualquier hook solo sobre `TransicionarEstadoUseCase` pierde las auto-transiciones.**

**Denominador común:** ambos crean `OperacionTicketEntity` con `tipoOperacionId = CAMBIO_ESTADO`, `estadoAnteriorId`/`estadoNuevoId` no-nulos (`backend/src/tickets/domain/entities/operacion-ticket.entity.ts`), dentro del mismo `ITenantTransactionRunner.run()` (`backend/src/shared/infrastructure/persistence/tenant-transaction-runner.ts:36-58`).

**Historial ya existe:** `operaciones_ticket` es un timeline inmutable (cercano a audit-log), pero hoy NO dispara efectos secundarios. Sin columna "procesado" → no es outbox todavía.

**Sin mecanismo de eventos:** 0 matches de `EventEmitter|@nestjs/event-emitter|DomainEvent|outbox`. Sin `bull/bullmq/ioredis`. Todo síncrono request→DB.

**Infra de email:** no existe (0 matches reales de `nodemailer/smtp/sendgrid/mailer`). Se crea todo.

**Multi-tenant:** `TenantGuard` resuelve tenant y bindea `TenantContext`; `ITenantTransactionRunner` re-bindea dentro de `$transaction`. Master DB vía `PrismaService.getMasterClient()`, patrón ya usado por `UsuarioMasterChecker` (`backend/src/tickets/infrastructure/persistence/prisma/usuario-master.checker.ts`) para soft-refs cross-DB.

**Destinatarios (emails):**
- `master.Usuario.email` (`backend/prisma_master/schema.prisma:88`) — ÚNICA fuente de email. `Cliente` (org/tenant) NO tiene email.
- `tenant.Ticket.solicitanteId` / `asignadoId` (`backend/prisma_tenant/schema.prisma:167,169`) = soft-refs UUID → `master.Usuario.id`. Resolver email = query cross-DB al master (patrón `UsuarioMasterChecker`).
- No hay tabla de config SMTP por tenant.

## Affected Areas

- `backend/src/tickets/application/use-cases/transicionar-estado.use-case.ts` — enganche primario 1.
- `backend/src/tickets/application/use-cases/crear-observacion.use-case.ts` — enganche primario 2 (auto-transición, fácil de olvidar).
- `backend/src/tickets/tickets.module.ts` — wiring de ambos use cases; se inyecta el nuevo port acá.
- `backend/src/tickets/domain/entities/operacion-ticket.entity.ts` — fuente de datos del email (`estadoAnteriorId`, `estadoNuevoId`, `autorId`, `metadata: Json?`).
- `backend/src/tickets/infrastructure/persistence/prisma/usuario-master.checker.ts` — patrón para resolver email de `master.Usuario` desde módulo tenant.
- `backend/src/shared/domain/ports/i-file-storage.ts` — precedente de puerto de infra (usa `Promise<T>`+throw, NO `Result` — inconsistencia a resolver).
- `backend/package.json` — sin deps de email/colas; agregar `nodemailer` (+ `@nestjs/event-emitter`).

## Approaches comparados

**A. Punto de enganche**
1. Decorar ambos use cases con el port, invocado post-`txRunner.run()`. Pros: explícito, cero infra nueva, cubre los 2 caminos. Cons: duplica "armar+publicar evento"; un 3er camino futuro hay que recordarlo. Effort: Low.
2. **Domain event + EventEmitter2 in-process**, publicado por ambos post-commit; handler separado llama al port. Pros: desacopla "qué pasó" de "qué reacciona" (email, audit, futuros push/webhook sin tocar use cases); encaja clean-arch. Cons: agrega `@nestjs/event-emitter`; igual hay que emitir en los 2 lugares. Effort: Medium.
3. Outbox real sobre `operaciones_ticket` (columna `notificado_at` + worker). Pros: máxima resiliencia, reintentos, un solo punto de lectura. Cons: migración + poller + dedupe/concurrencia; sobre-ingeniería para el volumen; sin infra de cron/cola. Effort: High.

**B. Síncrono vs async**
- Síncrono in-request: simple, pero viola regla de messaging-notifications (fire-and-forget); acopla latencia del ticket al SMTP. Low.
- **Async EventEmitter2** (`.emit()` no bloqueante, handler fuera de la transacción): cumple el skill; fallo de email no revierte ni bloquea la transición. Riesgo: si el proceso muere entre commit y handler, se pierde (reintentos a mano). Medium.
- Cola BullMQ+Redis: reintentos nativos, resiliente. Requiere Redis (no existe hoy). Medium-High.

**C. Provider**
- Port `EmailSenderPort` en `application/ports/` con `send(email): Result<void, EmailError>` (messaging-notifications). Adapter `infrastructure/email/nodemailer-email-sender.adapter.ts`. Templates en `infrastructure/email-templates/`.
- Consistencia: `IFileStorage` usa `Promise`+throw, no `Result`. El proposal DEBE decidir explícitamente `Result` (skill) vs precedente. Recomendación: `Result`.

**D. Config SMTP**
- Global por env: trivial, cero schema. Cons: mismo "From" para todos, sin white-label. Low.
- Por tenant (tabla/columnas en master): branding/deliverability por org. Cons: migración master + UI + fallback. Medium.

## Preguntas abiertas (para el proposal)
1. Enganche en ambos use cases (A.1) o domain-event compartido (A.2). Tapar solo `TransicionarEstadoUseCase` = bug día uno.
2. Destinatario → **CERRADO: solo solicitante.**
3. ¿Qué transiciones? → estados clave (afinar terminales en spec).
4. Config SMTP → **CERRADO: global env (MVP), por-tenant fase 2.**
5. ¿Fallo de envío se traza en `operaciones_ticket.metadata` o log aparte?
6. ¿`NotificationPreferences` (opt-out) en MVP o diferido?
7. Reintentos: best-effort in-process con backoff manual (MVP) vs outbox/cola (futuro).

## Recomendación preliminar
- **Enganche:** A.2 (domain event `TicketEstadoCambiado` + EventEmitter2), publicado post-commit en `TransicionarEstadoUseCase` y en la rama de auto-transición de `CrearObservacionUseCase`. Nunca dentro de la transacción.
- **Provider:** `EmailSenderPort` con `Result<void, EmailError>`.
- **Config:** SMTP global env (MVP); por-tenant fase 2 documentada.
- **Destinatario:** email resuelto vía nuevo método en un port cross-DB (reusar patrón `UsuarioMasterChecker`).

## Risks
- Perder la auto-transición de `CrearObservacionUseCase` (bug silencioso sin test dedicado).
- Enviar dentro de la transacción Prisma (bloquear `$transaction` con I/O de red).
- Sin tests de integración SMTP: `EmailSenderPort` mockeado en unit; definir cómo se prueba el adapter (maildev/mailhog o solo mock).
- `asignadoId` nullable (no aplica al MVP porque solo notificamos al solicitante, pero tenerlo presente).
- Sin infra de reintentos: un fallo de red pierde el email si no hay backoff mínimo.

## Ready for Proposal
Sí. Flujo real mapeado (incluida la trampa de los 2 caminos), modelo de destinatarios claro, ausencia total de infra de email/eventos confirmada.
