# Proposal: Notificaciones por email al cambiar el estado de un ticket

> Artefacto de `sdd-propose`. Store activo: **openspec** (engram estaba caído al arrancar el change; se persiste en disco para continuidad y también en engram al reconectar).
> Change: `notif-email-estado-ticket` · Proyecto: **soporte** (backend NestJS multi-tenant, Clean/Screaming Architecture, Prisma/PostgreSQL).
> Insumo: `explore.md` (mapa completo de la exploración) + decisiones de producto ya cerradas por el usuario.

---

## 1. Intent / Por qué

Hoy cuando un ticket cambia de estado, **el solicitante no se entera**: tiene que entrar a la app a mirar. Queremos cerrar ese loop enviando un **email transaccional al solicitante** cuando el ticket llega a un estado clave (candidatos terminales: RESUELTO / RECHAZADO / SIN_SOLUCION / CERRADO, a afinar en el spec). El éxito se mide en tres cosas: (1) el email sale en AMBOS caminos que cambian estado —no solo en el "oficial"—, (2) el envío es **fire-and-forget**: nunca bloquea ni revierte la transición del ticket, y (3) el proveedor SMTP es **swappable** detrás de un port, sin tocar la lógica de negocio. Es un cambio COMPLEJO: introduce dos piezas de infraestructura que hoy NO existen (mensajería de email y un bus de eventos in-process) sobre un dominio multi-tenant con resolución de datos cross-DB.

## 2. Scope

### In-scope (MVP)
- Emisión de un **domain event** `TicketEstadoCambiado` (pasado, plain object) en el dominio de tickets.
- Publicación del evento vía **`EventEmitter2`** (`@nestjs/event-emitter`) **post-commit** en los **DOS** caminos que cambian estado.
- Un **event handler** en `application/` que reacciona al evento, resuelve el email del solicitante y dispara el envío.
- Port **`EmailSenderPort`** con contrato `Result<void, EmailError>` + adapter **nodemailer** en infraestructura.
- Port **resolver de email cross-DB** del solicitante (`solicitanteId` → `master.Usuario.email`), reusando el patrón `UsuarioMasterChecker`.
- **Templates** de email aislados en infraestructura (subject + body), referenciados por nombre + data.
- Config SMTP **global por env** (validada al bootstrap).
- Filtro de "qué transiciones notifican" (set de estados clave) como política de dominio/aplicación.

### Out-of-scope (ver §7 Fase 2)
- **Config SMTP por-tenant** (branding/white-label por organización).
- **Notificar al técnico asignado** (`asignadoId`) — MVP solo solicitante.
- **`NotificationPreferences` / opt-out** — no hay hoy tabla ni UI; diferido.
- **Outbox real / cola (BullMQ/Redis)** — no hay Redis ni infra de cron; MVP es best-effort in-process.
- **Otros canales** (push, SMS, WebSocket, in-app).
- **Endpoint de consulta** de notificaciones enviadas.

## 3. Approach (arquitectura)

### 3.1 Punto de enganche: domain event + EventEmitter2 (post-commit, en los DOS caminos)
Elegimos el enfoque **A.2** de la exploración: desacoplar "qué pasó" (cambio de estado) de "quién reacciona" (email hoy; audit/push/webhook mañana sin tocar los use cases).

El evento `TicketEstadoCambiado` se publica **fuera de la transacción**, una vez que `txRunner.run()` ya commiteó, en:
1. `TransicionarEstadoUseCase.execute()` — camino "oficial" (`PATCH /tickets/:id/estado`).
2. La **auto-transición inline** dentro de `CrearObservacionUseCase.execute()` (ticket en APROBADO). **Este es el punto crítico**: ese camino reproduce el cambio de estado SIN llamar a `TransicionarEstadoUseCase` (ADR-2: evita `txRunner` anidado no atómico). **Enganchar solo el primero es un bug silencioso día uno.** El spec DEBE exigir un test dedicado para este camino.

**Regla dura:** NUNCA emitir/enviar dentro de `txRunner.run()` ni dentro de `$transaction`. El envío de red no debe poder bloquear ni revertir el commit del ticket. `.emit()` es no-bloqueante y el handler corre fuera de la transacción; un fallo de email jamás toca la transición.

### 3.2 El evento (dominio)
`TicketEstadoCambiado` es un **plain object en tiempo pasado** en `domain/events/`, sin dependencias de framework (regla clean-arch: `domain/` no importa nada externo). Carga lo mínimo para que el handler resuelva todo: `ticketId`, `tipoCodigo`, `estadoAnteriorId`, `estadoNuevoId`, `solicitanteId`, `autorId`, `tenantId`, `occurredAt`. El `EventEmitter2` es el **transporte** y se inyecta en la capa de aplicación como un port fino (`EventBus`/`DomainEventPublisher`), de modo que los use cases NO importen `@nestjs/event-emitter` directamente (mantiene `application/` libre de framework).

### 3.3 El handler (aplicación)
Un handler en `application/event-handlers/` (p. ej. `notificar-cambio-estado.handler.ts`):
1. **Filtra**: ¿el `estadoNuevoId` está en el set de estados que notifican? Si no, corta.
2. **Resuelve** el email del solicitante vía el port cross-DB.
3. **Arma** el `EmailMessage` (template por nombre + data).
4. **Envía** vía `EmailSenderPort.send()` y trata el `Result`: si es `err`, **loguea con contexto** (WARN/ERROR) y NO propaga —el email es side-effect, no lógica primaria (mismo principio que audit-log). Nunca hace `throw` que escale.

### 3.4 Ports
- **`EmailSenderPort`** — contrato `send(email: EmailMessage): Result<void, EmailError>`. **Decisión deliberada:** usamos `Result<void, EmailError>` siguiendo el skill `error-handling`/`messaging-notifications`, y **NO** el precedente de `IFileStorage` (que usa `Promise<T>` + throw). Esa inconsistencia se resuelve a favor de `Result`; documentamos que `IFileStorage` queda como deuda, no como patrón a imitar. `EmailError` es un error tipado con contexto (destinatario enmascarado, causa).
- **Resolver de email cross-DB** — nuevo port (p. ej. `i-usuario-email.resolver.ts`) que dado un `solicitanteId` (UUID soft-ref) devuelve el email desde `master.Usuario`. Su implementación reusa `PrismaService.getMasterClient()`, exactamente el patrón de `UsuarioMasterChecker`. Devuelve `Result` (puede no encontrar el usuario o venir sin email).

### 3.5 Placement (Screaming / Clean Architecture)
Convención del repo: los ports viven en `domain/ports/` con prefijo `i-` (ej. `i-usuario-master.checker.ts`); los use cases en `application/use-cases/`; los adapters en `infrastructure/persistence/prisma/` e `infrastructure/`. Ubicaciones propuestas (rutas a fijar en el design):

| Pieza | Capa | Ubicación propuesta |
|-------|------|---------------------|
| `TicketEstadoCambiado` (evento) | domain | `backend/src/tickets/domain/events/ticket-estado-cambiado.event.ts` |
| `EmailSenderPort` + `EmailMessage`/`EmailError` | domain/application (port) | `backend/src/tickets/domain/ports/i-email-sender.port.ts` |
| Port publicador de eventos (abstrae EventEmitter2) | domain/application (port) | `backend/src/shared/domain/ports/i-domain-event-publisher.ts` |
| Resolver email cross-DB (port) | domain (port) | `backend/src/tickets/domain/ports/i-usuario-email.resolver.ts` |
| Handler de notificación | application | `backend/src/tickets/application/event-handlers/notificar-cambio-estado.handler.ts` |
| Adapter nodemailer | infrastructure | `backend/src/tickets/infrastructure/email/nodemailer-email-sender.adapter.ts` |
| Adapter resolver email (master) | infrastructure | `backend/src/tickets/infrastructure/persistence/prisma/usuario-email.resolver.ts` |
| Adapter publicador (EventEmitter2) | infrastructure | `backend/src/shared/infrastructure/events/event-emitter.publisher.ts` |
| Templates | infrastructure | `backend/src/tickets/infrastructure/email-templates/cambio-estado/{subject,body}` |
| Wiring | módulo | `backend/src/tickets/tickets.module.ts` + `EventEmitterModule.forRoot()` en `AppModule` |

> Nota de placement: el skill `messaging-notifications` sugiere `application/ports/`; el repo hoy centraliza ports en `domain/ports/`. Adoptamos la convención del repo por consistencia (el resolver es hermano de `i-usuario-master.checker`). El design puede ratificar o mover; lo importante es que el port es una interfaz sin framework y el adapter vive en infra.

## 4. Affected areas (de explore.md)
- `backend/src/tickets/application/use-cases/transicionar-estado.use-case.ts` — enganche 1 (emitir post-commit).
- `backend/src/tickets/application/use-cases/crear-observacion.use-case.ts` — enganche 2 (auto-transición inline; el fácil de olvidar).
- `backend/src/tickets/tickets.module.ts` — wiring de use cases, handler, ports y adapters.
- `backend/src/tickets/domain/entities/operacion-ticket.entity.ts` — fuente de datos del cambio (`estadoAnteriorId`, `estadoNuevoId`, `autorId`, `metadata`).
- `backend/src/tickets/infrastructure/persistence/prisma/usuario-master.checker.ts` — patrón a reusar para el resolver de email.
- `backend/src/shared/domain/ports/i-file-storage.ts` — precedente de port (Promise+throw): NO imitar; documentar la divergencia hacia `Result`.
- `backend/package.json` — agregar `nodemailer` (+ `@types/nodemailer`) y `@nestjs/event-emitter`.
- `AppModule` — registrar `EventEmitterModule.forRoot()` y validación de env SMTP al bootstrap.

## 5. Decisiones resueltas

| # | Decisión | Resolución | Rationale (1 línea) |
|---|----------|------------|---------------------|
| 1 | Transiciones que notifican | Solo estados clave (terminales candidatos); set final en el spec | Producto cerrado; evita ruido de notificaciones intermedias. |
| 2 | Destinatario | **Solo el solicitante** (`solicitanteId` → `master.Usuario.email`) | Producto cerrado; técnico asignado queda para fase 2. |
| 3 | Proveedor | **nodemailer** detrás de `EmailSenderPort` | SMTP propio, provider swappable sin tocar aplicación. |
| 4 | Config SMTP | **Global por env** (MVP) | Cero schema nuevo; por-tenant es fase 2. |
| 5 | Enganche | Domain event `TicketEstadoCambiado` + EventEmitter2, post-commit en los 2 caminos | Desacopla reacción del use case; cubre la auto-transición. |
| 6 | Contrato del port | `Result<void, EmailError>` (NO Promise+throw de `IFileStorage`) | Alinea con `error-handling`; envío es fallo esperado, no excepción. |
| 7 | Trazado de fallos de envío | **Log estructurado con contexto** (WARN/ERROR), NO escribir en `operaciones_ticket.metadata` en el MVP | `operaciones_ticket` es timeline inmutable de negocio; contaminarlo con estado de entrega acopla dominio a infra de email. Si se necesita auditar entregas, va tabla propia en fase 2. |
| 8 | `NotificationPreferences` (opt-out) | **Diferido** (fase 2) | No hay tabla ni UI; agregar VO+persistencia excede el MVP. Se notifica siempre a estados clave. |
| 9 | Reintentos | **Best-effort in-process** (MVP): un intento; si falla, log con contexto. Sin backoff automático en v1 | No hay cola/Redis/cron; un outbox real es sobre-ingeniería para el volumen actual. El skill pide retry, pero sin infra async se difiere explícitamente a fase 2 (outbox). |
| 10 | Testeo del adapter nodemailer | **Mock del port en unit** (contrato) + **1 test de integración fina con maildev/mailhog** para el adapter real (opcional en CI, gated por env) | Cumple el testing efectivo del repo: unit atómico sobre el contrato; integración deliberada donde gana valor (SMTP real), sin mocks pesados. |

## 6. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| **Perder la auto-transición** de `CrearObservacionUseCase` (solo enganchar el use case "oficial") | Bug silencioso: media de las notificaciones nunca sale | El spec DEBE incluir un escenario/test dedicado que verifique que crear observación sobre ticket APROBADO también emite `TicketEstadoCambiado`. TDD RED primero. |
| **Enviar dentro de la transacción** Prisma (`$transaction`/`txRunner.run()`) | I/O de red bloquea/alarga la tx; un timeout SMTP podría abortar el commit | Regla dura: emitir SOLO post-commit; el handler corre async fuera de la tx. Verificar en review que no haya `send`/`emit` dentro de `run()`. |
| **Proceso muere entre commit y handler** (best-effort in-process) | Email perdido sin rastro | Aceptado en MVP (log de intento). Mitigación real = outbox/cola en fase 2 (§7). Documentado como límite conocido. |
| **Solicitante sin email o UUID huérfano** en master | `send` falla o resuelve vacío | Resolver devuelve `Result`; handler loguea WARN y corta sin romper. Nunca throw. |
| **Secretos SMTP** hardcodeados | Fuga de credenciales | Config 100% por env, validada al bootstrap; cero config de provider en domain/application (regla messaging + seguridad del repo). |
| **Adapter sin cobertura de integración** | Regresiones SMTP invisibles | Un test de integración fina (maildev/mailhog) gated por env, además del mock unit. |

## 7. Out of scope / Fase 2

- **SMTP por-tenant**: tabla/columnas de config en master + fallback a global + branding "From" por org.
- **Outbox / cola resiliente**: columna `notificado_at` (o tabla de outbox) + worker con reintentos exponenciales (1min/5min/30min por el skill) y dedupe. Resuelve la pérdida best-effort del MVP.
- **`NotificationPreferences`** (opt-out por canal) como VO en el dominio del usuario + persistencia + UI.
- **Notificar al técnico asignado** (`asignadoId`) y otros roles.
- **Otros canales**: push, SMS, in-app, WebSocket (cada uno con su propio port, nunca un `NotificationService` monolítico).
- **Auditoría de entregas** (tabla propia de delivery log si el negocio lo pide).

---

**Siguiente fase:** `sdd-spec` (fijar el set exacto de estados que notifican, escenarios Gherkin incl. el de la auto-transición, y el contrato de los ports). `sdd-design` puede correr en paralelo (detalle de wiring, templates, estrategia de test del adapter).
