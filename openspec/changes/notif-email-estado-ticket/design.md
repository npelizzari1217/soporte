# Design: Notificaciones por email al cambiar el estado de un ticket

> Artefacto de `sdd-design`. Store: **openspec** (`openspec/changes/notif-email-estado-ticket/`).
> Insumos verificados contra código real: `transicionar-estado.use-case.ts`, `crear-observacion.use-case.ts`, `usuario-master.checker.ts`, `tickets.module.ts`, `app.module.ts`, `tenant-context.ts`, `tenant-transaction-runner.ts`, `result.ts`, `ticket.entity.ts`, `crear-ticket.use-case.ts`.
> Esto es el HOW arquitectónico (interfaces, firmas, wiring, decisiones). NO tasks, NO implementación completa.

---

## 1. Technical Approach

Domain event `TicketEstadoCambiado` + `EventEmitter2` in-process, publicado **post-commit** en los DOS caminos de cambio de estado. Un listener de infra (`@OnEvent`) delega en un **handler puro de aplicación** que filtra por código de estado, resuelve el email del solicitante cross-DB y llama `EmailSenderPort.send()`. Todo lo que puede fallar (envío, resolución) retorna `Result<T, DomainError>`; nada revierte ni bloquea la transición ya comiteada.

Dos hallazgos del código que definen el diseño:

1. **`CrearObservacionUseCase.execute()` envuelve TODO su cuerpo en `return this.txRunner.run(...)`** (línea 103). No hay "código post-commit" hoy. Publicar post-commit obliga a **reestructurar**: el callback de `txRunner.run()` devuelve los datos de la transición, y la publicación ocurre DESPUÉS de que `run()` resuelve. Es el punto crítico anti-regresión (Requirement 3).
2. **El evento debe filtrarse por CÓDIGO de estado, pero solo el UUID está garantizado** en el mínimo del spec. Ambos use cases tienen el código en scope gratis (`estadoNuevo.codigo` / `destino`). Decisión: el evento carga **también** `estadoNuevoCodigo` y `estadoAnteriorCodigo`, de modo que el filtro del handler sea una función PURA sin tocar la DB (y sin depender de `TenantContext`, que puede no existir cuando el listener async corre). Esto extiende —no contradice— el mínimo del Requirement 9 ("como mínimo estos campos").

---

## 2. Architecture Decisions

| # | Decisión | Elegido | Alternativa rechazada | Rationale |
|---|----------|---------|-----------------------|-----------|
| D1 | Abstracción de publicación | Port fino `IDomainEventPublisher.publish(event): void` en `shared/`, adapter `EventEmitterPublisher` en infra | Inyectar `EventEmitter2` directo en los use cases | Mantiene `application/` libre de `@nestjs/event-emitter` (clean-arch). El repo ya trata `ITenantTransactionRunner` como port; mismo patrón. |
| D2 | Handler vs listener | Handler PURO en `application/event-handlers/` (sin decorators) + listener `@Injectable()/@OnEvent` en `infrastructure/events/` que delega | `@OnEvent` sobre la clase de aplicación | El repo es estricto: use cases y colaboradores son plain classes; el framework vive en infra. El listener es el "adapter de entrada". |
| D3 | Logging de fallos | El handler devuelve un **outcome** (`skipped\|no-email\|sent\|send-failed` + destinatario enmascarado + causa); el **listener** loguea con `Logger` de `@nestjs/common` | Inyectar un `ILogger` en el handler | No existe port de logging en el repo (grep: solo `new Logger()` ad-hoc en `tenant.guard.ts`). Devolver outcome deja `application/` 100% sin framework y pone el log donde vive el framework. |
| D4 | `estadoNuevoCodigo` en el evento | Sí, el evento lleva id **y** código de estado | Handler resuelve el código por UUID vía `IEstadoRepository` | El repo tenant + `TenantContext` NO están disponibles de forma confiable en un listener async post-request. El código ya está en scope gratis en ambos use cases → filtro puro, testeable sin DB. |
| D5 | `tenantId` del evento | Nuevo campo `clienteId` en `TransicionarEstadoDto` y `CrearObservacionDto`, poblado por el controller desde el JWT (idéntico a `CrearTicketDto.clienteId`) | Inyectar `TenantContext` en el use case | Patrón ya establecido en `CrearTicketUseCase`. El resolver cross-DB NO lee `TenantContext`: recibe `clienteId` por parámetro (como `UsuarioMasterChecker`), por eso el evento debe cargarlo. |
| D6 | `tipoCodigo` en auto-transición | Inyectar `ITipoTicketRepository` en `CrearObservacionUseCase` y resolver `findCodigoById(ticket.tipoId)` **solo si hubo auto-transición a estado notificable**, post-commit | Agregar el código al `TicketEntity`; o hardcodear | `TicketEntity` solo expone `tipoId` (UUID), no el código. `TransicionarEstadoUseCase` ya resuelve el código así (línea 119). Un lookup guardado, condicional, es lo más barato y correcto. |
| D7 | Contrato del port de email | `Result<void, EmailError>` (patrón `result.ts`) | `Promise<void>`+throw de `IFileStorage` | Alinea con `error-handling`/`messaging`. Divergencia deliberada; `IFileStorage` queda como deuda, no patrón a imitar. |
| D8 | `Email` como VO | VO `Email` self-validating en `tickets/domain/value-objects/` con `mask()` | `to: string` plano | `value-objects` skill; centraliza validación (Requirement 8 "email nulo/vacío" = fallo de `Email.create`) y enmascarado para logs (Requirement 7). |
| D9 | Placement (tickets vs shared) | Ports/eventos de email en `tickets/` | Promover a `shared/` ya | Scope Rule (CLAUDE.md §2): usado en 1 sola feature → local. Se promueve a `shared/` cuando un 2º dominio lo consuma. El publisher SÍ va en `shared/` (transporte genérico). |
| D10 | Fire-and-forget | `emitter.emit()` (no `emitAsync`); listener async cuyo promise NO se espera | `await emitAsync` en el use case | `.emit()` retorna sincrónico y no espera listeners async → no bloquea la respuesta HTTP (Requirement 6). El handler NUNCA hace throw → sin unhandled rejection. |

---

## 3. Data Flow

```
PATCH /tickets/:id/estado ─┐
                           ├─► UseCase.execute()
POST /tickets/:id/observ. ─┘        │
                                    │ 1. txRunner.run( save ticket + save operacion )  ── COMMIT ──┐
                                    │                                                               │
                                    │ 2. (POST-COMMIT, fuera de la tx)                              │
                                    │    build TicketEstadoCambiado { ids + CÓDIGOS + tenantId }    │
                                    │    publisher.publish(event)  ──► EventEmitter2.emit()  (no bloquea)
                                    │ 3. return Result.ok(ticket) ◄─────────────────────────────────┘
                                    ▼
        [async, desacoplado del request]  @OnEvent listener (infra)
                                    ▼
        NotificarCambioEstadoHandler.handle(event)  (application, puro)
          a. esEstadoNotificable(event.estadoNuevoCodigo)?  ── no ─► outcome:skipped
          b. resolver.resolver(solicitanteId, tenantId) ── fail ─► outcome:no-email
          c. emailSender.send(EmailMessage) ── fail ─► outcome:send-failed
          d. ok ─► outcome:sent
                                    ▼
        listener loguea el outcome (WARN/ERROR, destinatario enmascarado)

  master.Usuario (cross-DB) ◄── PrismaService.getMasterClient() (scoped by clienteId, sin TenantContext)
```

---

## 4. File Changes

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `shared/domain/domain-event.ts` | Crear | Marker `interface DomainEvent { readonly eventName: string; readonly occurredAt: Date }`. |
| `shared/domain/ports/i-domain-event-publisher.ts` | Crear | `IDomainEventPublisher` + token `DOMAIN_EVENT_PUBLISHER`. |
| `shared/infrastructure/events/event-emitter.publisher.ts` | Crear | Adapter `@Injectable()` sobre `EventEmitter2`. |
| `shared/shared.module.ts` | Modificar | Proveer/exportar `DOMAIN_EVENT_PUBLISHER` (@Global) para ambos use cases. |
| `tickets/domain/events/ticket-estado-cambiado.event.ts` | Crear | Evento + constante `TICKET_ESTADO_CAMBIADO='ticket.estado.cambiado'`. |
| `tickets/domain/policies/estados-notificables.policy.ts` | Crear | `ESTADOS_NOTIFICABLES = new Set([...])` + `esEstadoNotificable(codigo)`. |
| `tickets/domain/value-objects/email.vo.ts` | Crear | VO `Email` (`create`→`Result`, `value()`, `mask()`, `equals`). |
| `tickets/domain/ports/i-email-sender.port.ts` | Crear | `EmailSenderPort` + `EmailMessage`/`EmailBody` + token `EMAIL_SENDER`. |
| `tickets/domain/ports/i-solicitante-email.resolver.ts` | Crear | `ISolicitanteEmailResolver` + token `SOLICITANTE_EMAIL_RESOLVER`. |
| `tickets/domain/errors/email.errors.ts` | Crear | `EmailError`, `ResolverEmailError` (extienden `DomainError`). |
| `tickets/application/event-handlers/notificar-cambio-estado.handler.ts` | Crear | Handler puro; retorna `NotificacionOutcome`. |
| `tickets/infrastructure/events/notificar-cambio-estado.listener.ts` | Crear | `@Injectable()` `@OnEvent(...)`; delega y loguea. |
| `tickets/infrastructure/email/nodemailer-email-sender.adapter.ts` | Crear | Adapter nodemailer; lee SMTP de env; mapea fallo → `Result.fail(EmailError)`. |
| `tickets/infrastructure/email/email-config.ts` | Crear | Lectura + validación de env SMTP (falla al bootstrap si falta). |
| `tickets/infrastructure/persistence/prisma/solicitante-email.resolver.ts` | Crear | Adapter cross-DB (espejo de `UsuarioMasterChecker`). |
| `tickets/infrastructure/email-templates/cambio-estado/{subject,body}.hbs` | Crear | Template subject + body (provider-agnóstico). |
| `tickets/application/use-cases/transicionar-estado.use-case.ts` | Modificar | +`clienteId` en DTO; +`publisher` en ctor; publicar tras `txRunner.run()`. |
| `tickets/application/use-cases/crear-observacion.use-case.ts` | Modificar | +`clienteId` en DTO; +`tipoTicketRepo`+`publisher` en ctor; **reestructurar** para publicar post-commit. |
| `tickets/interface/controllers/tickets.controller.ts` + `operaciones.controller.ts` | Modificar | Poblar `clienteId` desde el JWT en ambos DTOs. |
| `tickets/tickets.module.ts` | Modificar | Wiring de nuevos providers/tokens; inyectar publisher/tipoTicketRepo en los 2 use cases. |
| `app.module.ts` | Modificar | `EventEmitterModule.forRoot()`. |
| `backend/package.json` | Modificar | +`nodemailer`, `@types/nodemailer`, `@nestjs/event-emitter`. |

---

## 5. Interfaces / Contracts (firmas reales)

```typescript
// shared/domain/domain-event.ts
export interface DomainEvent { readonly eventName: string; readonly occurredAt: Date; }

// shared/domain/ports/i-domain-event-publisher.ts
export const DOMAIN_EVENT_PUBLISHER = Symbol('DOMAIN_EVENT_PUBLISHER');
export interface IDomainEventPublisher { publish(event: DomainEvent): void; } // fire-and-forget

// shared/infrastructure/events/event-emitter.publisher.ts
@Injectable()
export class EventEmitterPublisher implements IDomainEventPublisher {
  constructor(private readonly emitter: EventEmitter2) {}
  publish(event: DomainEvent): void { this.emitter.emit(event.eventName, event); }
}

// tickets/domain/events/ticket-estado-cambiado.event.ts
export const TICKET_ESTADO_CAMBIADO = 'ticket.estado.cambiado';
export class TicketEstadoCambiado implements DomainEvent {
  readonly eventName = TICKET_ESTADO_CAMBIADO;
  constructor(
    readonly ticketId: string,
    readonly tipoCodigo: string,
    readonly estadoAnteriorId: string,
    readonly estadoNuevoId: string,
    readonly estadoAnteriorCodigo: string, // D4
    readonly estadoNuevoCodigo: string,    // D4 (filtro del handler)
    readonly solicitanteId: string,
    readonly autorId: string,
    readonly tenantId: string,             // = clienteId
    readonly occurredAt: Date,
  ) {}
}

// tickets/domain/policies/estados-notificables.policy.ts
export const ESTADOS_NOTIFICABLES = new Set<string>(
  ['RESUELTO', 'RECHAZADO', 'SIN_SOLUCION', 'CERRADO', 'CANCELADO']);
export const esEstadoNotificable = (codigo: string): boolean => ESTADOS_NOTIFICABLES.has(codigo);

// tickets/domain/value-objects/email.vo.ts
export class Email {
  private constructor(private readonly _value: string) {}
  static create(raw: string): Result<Email, EmailError>;   // vacío/inválido → fail
  value(): string;                                          // crudo (para el adapter/DB)
  mask(): string;                                           // "u***@dominio.com" (logs)
  equals(o: Email): boolean;
}

// tickets/domain/ports/i-email-sender.port.ts
export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
export type EmailBody =
  | { type: 'text'; content: string }
  | { type: 'html'; content: string }
  | { type: 'template'; name: string; data: Record<string, unknown> };
export interface EmailMessage { to: Email; subject: string; body: EmailBody; }
export interface EmailSenderPort { send(email: EmailMessage): Promise<Result<void, EmailError>>; }

// tickets/domain/ports/i-solicitante-email.resolver.ts
export const SOLICITANTE_EMAIL_RESOLVER = Symbol('SOLICITANTE_EMAIL_RESOLVER');
export interface ISolicitanteEmailResolver {
  resolver(solicitanteId: string, clienteId: string): Promise<Result<Email, ResolverEmailError>>;
}

// tickets/domain/errors/email.errors.ts
export class EmailError extends DomainError {
  readonly code: string; // 'EMAIL_INVALIDO' | 'EMAIL_SEND_FAILED'
  constructor(readonly destinatarioEnmascarado: string, readonly causa: string, code?: string);
}
export class ResolverEmailError extends DomainError {
  readonly code: 'USUARIO_NO_ENCONTRADO' | 'EMAIL_NO_DISPONIBLE'; // Requirement 8 distinguible
}

// tickets/application/event-handlers/notificar-cambio-estado.handler.ts
export type NotificacionOutcome =
  | { status: 'skipped' }
  | { status: 'no-email'; motivo: string; solicitanteId: string; ticketId: string }
  | { status: 'send-failed'; destinatarioEnmascarado: string; causa: string; ticketId: string }
  | { status: 'sent'; destinatarioEnmascarado: string; ticketId: string };
export class NotificarCambioEstadoHandler {
  constructor(
    private readonly resolver: ISolicitanteEmailResolver,
    private readonly emailSender: EmailSenderPort,
  ) {}
  async handle(event: TicketEstadoCambiado): Promise<NotificacionOutcome>; // NUNCA throw
}
```

---

## 6. Los dos puntos de publicación (contra el código real)

**A) `TransicionarEstadoUseCase.execute()`** — `tipoCodigo` (línea 119) y `estadoActual/estadoNuevo` ya están en scope. Publicar **después** de `txRunner.run()` (línea 177), antes del return:

```typescript
await this.txRunner.run(async () => {           // ← línea 174-177 actual (SIN cambios dentro)
  await this.ticketRepo.save(ticket);
  await this.operacionRepo.save(operacion);
});
// ── POST-COMMIT (nuevo) ──
if (esEstadoNotificable(estadoNuevo.codigo)) {
  this.publisher.publish(new TicketEstadoCambiado(
    ticket.id, tipoCodigo,
    estadoActual.id, estadoNuevo.id, estadoActual.codigo, estadoNuevo.codigo,
    ticket.solicitanteId, dto.autorId, dto.clienteId, new Date(),
  ));
}
return Result.ok(ticket);
```

**B) `CrearObservacionUseCase.execute()`** — hoy es `return this.txRunner.run(async () => { ... })` (línea 103). Reestructura: el callback devuelve los datos de la transición; se publica afuera.

```typescript
async execute(dto): Promise<Result<TicketEntity, DomainError>> {
  const outcome = await this.txRunner.run(async () => {
    // ... cuerpo actual sin cambios ...
    // al final, en vez de `return Result.ok(ticket)`:
    return {
      result: Result.ok(ticket),
      publicar: cambioEstado
        ? { estadoAnteriorId: estadoActual.id, estadoNuevoId: estadoDestino!.id,
            estadoAnteriorCodigo: estadoActual.codigo, estadoNuevoCodigo: destino!,
            solicitanteId: ticket.solicitanteId, tipoId: ticket.tipoId }
        : null,
    };
  });
  // ── POST-COMMIT (nuevo, fuera de la tx) ──
  const p = outcome.publicar;
  if (p && outcome.result.isOk() && esEstadoNotificable(p.estadoNuevoCodigo)) {
    const tipoCodigo = await this.tipoTicketRepo.findCodigoById(p.tipoId); // D6 (guardado)
    if (tipoCodigo) {
      this.publisher.publish(new TicketEstadoCambiado(
        dto.ticketId, tipoCodigo, p.estadoAnteriorId, p.estadoNuevoId,
        p.estadoAnteriorCodigo, p.estadoNuevoCodigo,
        p.solicitanteId, dto.autorId, dto.clienteId, new Date(),
      ));
    }
  }
  return outcome.result;
}
```

Requirement 10 (NFR): no hay ninguna llamada a `publish`/`send` dentro de los bloques `txRunner.run(...)`. Verificable estructuralmente.

---

## 7. Handler + filtro, template, wiring

- **Filtro**: `esEstadoNotificable(event.estadoNuevoCodigo)` — pura, sin DB (D4). El set `ESTADOS_NOTIFICABLES` es la política de dominio.
- **Template**: `email-templates/cambio-estado/{subject,body}.hbs`, referenciados por `body: { type:'template', name:'cambio-estado', data:{ numero, tituloTicket, estadoNuevoCodigo, ... } }`. El adapter nodemailer compila el template (provider-agnóstico: cambiar de nodemailer a SES solo toca el adapter).
- **Wiring `tickets.module.ts`**: agregar providers `EMAIL_SENDER`→`NodemailerEmailSender`, `SOLICITANTE_EMAIL_RESOLVER`→`SolicitanteEmailResolver`, `NotificarCambioEstadoHandler` (useFactory con los 2 ports), `NotificarCambioEstadoListener` (clase provider para que EventEmitter la descubra). En los `useFactory` de `TransicionarEstadoUseCase` y `CrearObservacionUseCase`: agregar `DOMAIN_EVENT_PUBLISHER` (ambos) y `TIPO_TICKET_REPOSITORY` (crear-observación) al `inject`.
- **`app.module.ts`**: `imports: [ EventEmitterModule.forRoot(), ... ]`.
- **Env SMTP**: validada al bootstrap en `email-config.ts` (falta de config = throw que aborta el arranque, NO un `send()` individual — Requirement 7). Cero refs SMTP fuera de `infrastructure/` (NFR).

---

## 8. Testing Strategy (Test-First estricto, atómico)

| Requirement / Scenario | Tipo | Seam / cómo |
|---|---|---|
| R1 filtro por código (in/out del set) | Unit | `esEstadoNotificable()` puro: input código → bool. |
| R2 camino oficial publica post-commit | Unit | `TransicionarEstadoUseCase` con `publisher` **mock (spy)**; assert `publish` llamado con evento correcto y estado ok. |
| R3 auto-transición publica (anti-regresión) | Unit | `CrearObservacionUseCase` con `publisher` spy + `tipoTicketRepo` mock; ticket APROBADO→RESUELTO ⇒ `publish` llamado; ticket NO-APROBADO ⇒ NO. |
| R2/R3 estado no-clave no envía | Unit | Spy: `publish` puede o no emitir, pero handler con estado no-clave ⇒ `send` NO llamado. |
| R4 solicitante huérfano / sin email | Unit | Handler con `resolver` mock→`Result.fail`; assert outcome `no-email`, `send` NO llamado, sin throw. |
| R5 SMTP falla no revierte | Unit | Handler con `emailSender` mock→`Result.fail(EmailError)`; outcome `send-failed`, sin throw. |
| R6 nada dentro de la tx | Unit + review | Test: dentro del `txRunner.run` mock, `publish` NO fue invocado (invocación solo tras resolver `run`). |
| R6 `.emit()` no bloquea | Unit | `EventEmitterPublisher` con `EventEmitter2` real + listener con delay; `publish()` retorna sin esperar. |
| R7 `send()` ok / fail tipado | Unit | Contrato de `EmailSenderPort` mock; y adapter: fallo → `Result.fail(EmailError)` con destinatario enmascarado. |
| R8 resolver cross-DB (ok / no encontrado / otro tenant / email vacío) | Unit + Integración fina | Unit del contrato con `PrismaService.getMasterClient()` mockeado (espejo de `UsuarioMasterChecker`); códigos distinguibles. |
| R9 payload completo e idéntico en ambos caminos | Unit | Assert de forma del evento en los spies de R2 y R3 (mismos campos/tipos). |
| VO `Email` create/mask/equals | Unit | Válido/ inválido/ enmascarado. |
| Adapter nodemailer real | Integración (gated) | `maildev`/`mailhog` vía env (`SMTP_TEST=1`); si no, se corre solo el contrato mock. Cumple "integración deliberada donde gana valor". |

Anti-bucle (CLAUDE.md §5): contrato ANTES del test; sin over-mock (el handler solo mockea 2 ports); si un test falla 2 veces, cortar y reportar. `emit`/handler async no se testea con timers frágiles — se testea el contrato del handler (puro, `await handle()`), no el scheduling de EventEmitter.

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| **Quirk heredado (spec §0.2 #2)**: la auto-transición usa `BaseTicketStateMachine` sin `tipoCodigo`, así un `COMPRAS` en `APROBADO` puede auto-transicionar (y notificar) a `SIN_SOLUCION` aunque `ComprasStateMachine` no lo permita por PATCH. | **FUERA DE SCOPE — NO se corrige acá.** Se documenta como riesgo preexistente del dominio. El filtro es por código destino, por diseño; la notificación es correcta dado ese comportamiento. |
| Proceso muere entre commit y handler (best-effort in-process) | Aceptado en MVP (log de intento). Fase 2 = outbox. |
| Promise flotante del listener async | El handler NUNCA hace throw (retorna outcome); el listener envuelve y loguea. Sin unhandled rejection. |
| `clienteId` no llega al DTO (controller no lo puebla) | Test de use case exige `dto.clienteId`; el evento sin tenant no resolvería email. Verificar en controller (mismo patrón que `CrearTicketDto`). |
| Reestructura de `CrearObservacionUseCase` rompe atomicidad | El cuerpo del `txRunner.run` NO cambia; solo se extrae el `return` a un objeto y se publica afuera. Tests de observación existentes deben seguir verdes (regresión). |

---

## 10. Migration / Rollout

**NO se requiere migración de schema.** Los fallos de envío van a logs estructurados, no a `operaciones_ticket.metadata` ni a tabla nueva (decisión #7 del proposal). `master.Usuario.email` ya existe (`@unique NOT NULL`). Ningún campo nuevo en DB. Config SMTP es 100% env. Si en review aparece necesidad de persistir estado de entrega, es Fase 2 (tabla propia) y se **flaggea** — hoy: cero migración.

## Open Questions

- [ ] Confirmar en `sdd-tasks` el nombre exacto del claim de tenant en el JWT que el controller mapea a `clienteId` (se asume idéntico al usado por `CrearTicketDto`).
- [ ] Elegir librería de templating para los `.hbs` (handlebars vs interpolación simple) — decisión de implementación del adapter, sin impacto en el contrato del port.
