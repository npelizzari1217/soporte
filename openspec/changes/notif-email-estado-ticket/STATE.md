# STATE — notif-email-estado-ticket

> Breadcrumb de resume. Escrito antes de reiniciar la sesión para conectar engram.

## Qué es el change
Notificaciones por **email** cuando **cambia el estado de un ticket** (proyecto Soporte, backend NestJS multi-tenant).

## Fase actual
`explore` ✅ · `proposal` ✅ · `spec` ✅ · `design` ✅ · `tasks` ✅ · `apply PR1` ✅ COMPLETADA (verde, 2054 tests) → siguiente: **`apply PR2`** (sub-agente `sdd-apply`, sonnet) — PAUSADO esperando OK del usuario (chained PR delivery).

### Entrega: chained PRs (elegido por usuario 2026-07-29)
- PR1 ✅ fundaciones evento (branch `notif-email-estado-ticket-pr1`, 2 commits locales, SIN push/PR).
- PR2 ⬜ email port/adapter/resolver/templates (~350-400) — SIGUIENTE.
- PR3 ⬜ handler/listener/wiring (~200).
- PR4 ⬜ puntos de publicación + reestructura CrearObservacion + DTOs/controllers + anti-regresión (~300-400, mayor riesgo).
- ⚠️ Push/PR de cada slice queda gated por el usuario (outward-facing).
- ⚠️ ACTUALIZAR design.md §7: EventEmitterModule.forRoot() va en shared.module.ts (no app.module.ts) — ver Apply Progress PR1.
- Gotcha entorno: usar `corepack pnpm ...` (pnpm no está en PATH global).

### Notas del design para tasks/apply
- Blast radius: ~13 archivos nuevos + ~6 modificados (2 use cases, 2 controllers, tickets.module, app.module, package.json). REVIEW WORKLOAD: revisar forecast de sdd-tasks (posible chained PR).
- REESTRUCTURA de CrearObservacionUseCase (extraer return de txRunner.run) = riesgo de regresión de atomicidad; tests de observación existentes deben seguir verdes.
- Sin migración de DB.
- Open questions: claim de tenant en JWT (asumido = CrearTicketDto); templating .hbs (interno al adapter).

### Decisión de producto resuelta (2026-07-29)
- `CANCELADO` **SÍ notifica** → set final `{RESUELTO, RECHAZADO, SIN_SOLUCION, CERRADO, CANCELADO}`. Spec actualizado. Reachability: COMPRAS/EDILICIA vía PATCH (terminal); SOPORTE no (frozen); auto-transición no alcanza CANCELADO en ningún tipo.
- Quirk heredado (§0.2 #2 del spec): auto-transición de CrearObservacion usa BaseTicketStateMachine sin tipoCodigo. NO se corrige acá — nota para el design.

## Config SDD de esta sesión
- Execution mode: **interactive** (pausar entre fases, pedir OK)
- Artifact store: **openspec** (engram estaba caído; ahora arreglado — ver abajo)
- Delivery strategy: **ask-on-risk**
- Complejidad evaluada: **COMPLEJO** → SDD completo automático.

## Decisiones de producto YA cerradas por el usuario
1. **Transiciones que notifican:** solo estados clave (afinar terminales en spec: candidatos RESUELTO/RECHAZADO/SIN_SOLUCION/CERRADO).
2. **Destinatario:** SOLO el solicitante (`Ticket.solicitanteId` → `master.Usuario.email`, resuelto cross-DB tipo `UsuarioMasterChecker`). NO el técnico asignado.
3. **Proveedor:** SMTP propio (**nodemailer**) detrás de port `EmailSenderPort`.
4. **Config SMTP:** global por env (MVP); por-tenant = fase 2 documentada.

## Dirección arquitectónica aprobada (para el proposal)
- Enganche: domain event `TicketEstadoCambiado` + `EventEmitter2` in-process, publicado **post-commit** en los DOS caminos:
  - `TransicionarEstadoUseCase.execute()`
  - la **auto-transición inline** de `CrearObservacionUseCase.execute()` (¡no olvidar — bug silencioso si se tapa solo el primero!)
- `EmailSenderPort` con `Result<void, EmailError>` (seguir skill error-handling, NO el precedente `IFileStorage` de Promise+throw).
- Templates de email aparte en infra.

## Artefactos en disco
- `explore.md` ✅ (mapa completo de la exploración)
- `proposal.md` ✅ (intent, scope, approach, 10 decisiones resueltas, riesgos, fase 2)
- `spec/notif-email-estado-ticket.spec.md` ✅ (10 requirements + NFRs, ~21 escenarios Gherkin)
- `design.md` ✅ (10 decisiones D1-D10, firmas TS, file changes, matriz de tests, sin migración)
- `tasks.md` ✅ (36 tasks RED/GREEN en 4 PRs, forecast HIGH, trazabilidad R1-R10)
- apply ⬜ (siguiente, tras decisión de entrega)

## Fix de engram aplicado (persistente)
- Causa: `command: "engram"` sin PATH → server MCP no levantaba.
- Fix: `~/.claude.json` y `~/.claude/mcp/engram.json` ahora apuntan a `C:/Users/Usuario/AppData/Local/Programs/engram/engram.exe`.
- Efecto: engram conecta al reiniciar la sesión. (Al reconectar, guardar este fix en engram vía mem_save: type=config, topic_key `config/engram-mcp-path-fix`.)

## Cómo retomar
Decir: "seguimos con el proposal de notif-email-estado-ticket". El orquestador:
1. Verifica que engram esté conectado (mem_search de prueba).
2. Lanza `sdd-propose` (opus) leyendo `explore.md` + estas decisiones, escribiendo `proposal.md`.
3. Pausa (interactive) para OK antes del spec.

## Skills relevantes (inyectar en sub-agentes de código)
messaging-notifications, clean-arch, nestjs-modules, error-handling, repository-pattern, value-objects, audit-log · (paths: `skills/<nombre>/SKILL.md`)

---

## Apply Progress — PR1 (Fundaciones) — 2026-07-29

**Status: DONE.** Tasks 1.1–1.9 completas (RED→GREEN estricto, sin excepciones). Chained PRs — solo PR1 implementado, PR2/PR3/PR4 quedan pendientes de aprobación del usuario.

### Tasks completadas
- 1.1 deps agregadas e instaladas (`nodemailer@9.0.3`, `@nestjs/event-emitter@3.1.0`, `@types/nodemailer@8.0.1`) vía `corepack pnpm add` (pnpm no está en PATH global de esta máquina — usar `corepack pnpm ...`, no `pnpm ...` a secas).
- 1.2/1.3 RED→GREEN `EventEmitterPublisher` (delega en `emitter.emit(eventName, event)`, D10 fire-and-forget).
- 1.4 Wire `DOMAIN_EVENT_PUBLISHER` — con una desviación de diseño documentada, ver abajo.
- 1.5/1.6 RED→GREEN `TicketEstadoCambiado` — 10 campos (incluye `estadoAnteriorCodigo`/`estadoNuevoCodigo` por D4), coincide con la firma exacta de design.md §5.
- 1.7/1.8 RED→GREEN `esEstadoNotificable()` — set `{RESUELTO, RECHAZADO, SIN_SOLUCION, CERRADO, CANCELADO}`.
- 1.9 Verify — ver evidencia real abajo.

### Desviación de diseño (documentada, no silenciosa)
`design.md` §7 decía `EventEmitterModule.forRoot()` en `app.module.ts`. Al implementar, 4 suites de tests preexistentes (`equipos.module.spec.ts`, `compras.module.spec.ts`, `reparaciones.module.wiring.spec.ts`, `tickets.module.wiring.spec.ts`) bootstrapean `SharedModule` de forma AISLADA (`Test.createTestingModule({ imports: [SharedModule, XModule] })`), sin pasar por `AppModule` — fallaron con `Nest can't resolve dependencies of Symbol(DOMAIN_EVENT_PUBLISHER)` porque `EventEmitter2` no existía en ese grafo de DI.
**Fix aplicado:** `EventEmitterModule.forRoot()` se importa DENTRO de `shared.module.ts` (no en `app.module.ts`), porque es el propio `SharedModule` quien consume `EventEmitter2` en el factory de `DOMAIN_EVENT_PUBLISHER` — regla estándar de Nest: el módulo que inyecta un token en su propio provider debe importar el módulo que lo exporta. `forRoot()` es `global: true` por defecto, así que sigue disponible en toda la app. Se quitó el import redundante de `app.module.ts` para no duplicar el wiring. Los 8 tests que fallaban ahora pasan; toda la suite completa (2054 tests) pasa.

### Archivos creados
- `backend/src/shared/domain/domain-event.ts`
- `backend/src/shared/domain/ports/i-domain-event-publisher.ts`
- `backend/src/shared/infrastructure/events/event-emitter.publisher.ts`
- `backend/src/shared/infrastructure/events/event-emitter.publisher.spec.ts`
- `backend/src/tickets/domain/events/ticket-estado-cambiado.event.ts`
- `backend/src/tickets/domain/events/ticket-estado-cambiado.event.spec.ts`
- `backend/src/tickets/domain/policies/estados-notificables.policy.ts`
- `backend/src/tickets/domain/policies/estados-notificables.policy.spec.ts`

### Archivos modificados
- `backend/package.json` (+3 deps)
- `backend/src/shared/shared.module.ts` (+`DOMAIN_EVENT_PUBLISHER` provider/export, +`EventEmitterModule.forRoot()` en imports)
- `backend/src/app.module.ts` (comentario actualizado; SIN `EventEmitterModule.forRoot()` — ver desviación arriba)

### Evidencia real (backend/, 2026-07-29)

`corepack pnpm test` (== `vitest run`):
```
Test Files  150 passed (150)
     Tests  2054 passed (2054)
  Duration  178.90s
```

`corepack pnpm lint` (== `eslint "src/**/*.ts"`): sin output, exit code 0.

`corepack pnpm exec tsc --noEmit -p tsconfig.json` (mismo tsconfig que usa el script `build`): sin output, exit code 0.

Nota: `tsconfig.eslint.json` (incluye `*.spec.ts`) tiene errores PREEXISTENTES no relacionados a este change (`Cannot find name 'it'/'expect'/'describe'` en specs viejos que no declaran los tipos globales de vitest en ese tsconfig específico — `tsconfig.json` real SÍ excluye specs y es el que usa `build`). Ninguno de los archivos nuevos/tocados de PR1 aparece en esa lista. No se tocó — fuera de scope de PR1.

### Git
Repo real (no vacío). Branch `notif-email-estado-ticket-pr1` creada desde `master`. Un commit local conventional (`feat(tickets): fundaciones de eventos de dominio para notificaciones`, sha `5b474c55`), sin Co-Authored-By. **Sin push, sin PR** — gateado por el usuario vía orquestador.

### Deferred / no tocado (correcto para PR1)
PR2 (Email VO/errores/ports/adapter/resolver/templates), PR3 (handler/listener/wiring parcial), PR4 (puntos de publicación + reestructura CrearObservacion + DTOs/controllers) — todo pendiente, sin tocar. `tickets.module.ts`, `transicionar-estado.use-case.ts`, `crear-observacion.use-case.ts` NO se modificaron (correcto, son PR4).

### Cómo retomar
Decidir: (a) usuario aprueba PR1 → commit local + eventual push/PR (fuera del alcance de este sub-agente) → seguir con PR2; (b) pedir ajustes sobre PR1 antes de avanzar.

---

## Apply Progress — PR2 (Email: VO, errores, ports, adapter, resolver, templates) — 2026-07-30

**Status: DONE.** Tasks 2.1–2.15 completas (RED→GREEN estricto). Branch `notif-email-estado-ticket-pr2` (encadenada sobre PR1). Sin push/PR (gateado por usuario).

> Nota de proceso: el sub-agente `sdd-apply` implementó y verificó todo, pero se cortó dos veces por errores server-side (500 y 529 Overloaded) antes de commitear. El orquestador cerró el tramo final: re-corrió la verificación REAL (abajo) y commiteó. Las 15 tasks ya estaban marcadas por el sub-agente antes del corte.

### Tasks completadas
- 2.1/2.2 RED→GREEN `Email` VO (`create()` valida formato, `mask()`, `equals()`).
- 2.3/2.4 RED→GREEN `EmailError`/`ResolverEmailError` — códigos distinguibles, destinatario ENMASCARADO en el mensaje del error.
- 2.5 `EmailSenderPort`/`EmailMessage`/`EmailBody` en domain/ports.
- 2.6 `ISolicitanteEmailResolver` en domain/ports.
- 2.7/2.8 RED→GREEN resolver cross-DB (`solicitante-email.resolver.ts`), espejo de `UsuarioMasterChecker`, vía `PrismaService.getMasterClient()` mockeado — ok mismo tenant, fail no existe/otro tenant, fail email vacío (aislamiento multi-tenant).
- 2.9/2.10 RED→GREEN `email-config.ts` — lanza al bootstrap si falta env SMTP (cero config SMTP fuera de infra).
- 2.11/2.12 RED→GREEN adapter nodemailer — éxito⇒`Result.ok`, fallo SMTP⇒`Result.fail(EmailError)` enmascarado, NUNCA throw.
- 2.13 templates `.hbs` (`cambio-estado/{subject,body}.hbs`).
- 2.14 **DIFERIDA**: gate de integración implementado y verificado (skip limpio sin `SMTP_TEST=1`), NO ejecutado contra maildev/mailhog real (no disponible en el entorno). Es 1 de los 2 tests skipped de la suite.
- 2.15 Verify — evidencia real abajo.

### Archivos creados
- `backend/src/tickets/domain/value-objects/email.vo.ts` (+ `.spec.ts`)
- `backend/src/tickets/domain/errors/email.errors.ts` (+ `.spec.ts`)
- `backend/src/tickets/domain/ports/i-email-sender.port.ts`
- `backend/src/tickets/domain/ports/i-solicitante-email.resolver.ts`
- `backend/src/tickets/infrastructure/persistence/prisma/solicitante-email.resolver.ts` (+ `.spec.ts`)
- `backend/src/tickets/infrastructure/email/email-config.ts` (+ `.spec.ts`)
- `backend/src/tickets/infrastructure/email/nodemailer-email-sender.adapter.ts` (+ `.spec.ts` + `.integration.spec.ts` gated)
- `backend/src/tickets/infrastructure/email-templates/cambio-estado/subject.hbs`, `body.hbs`

### Archivos modificados
- `openspec/changes/notif-email-estado-ticket/tasks.md` (2.1–2.15 marcadas)

### Evidencia real (backend/, 2026-07-30)
`corepack pnpm test` (== `vitest run`):
```
Test Files  155 passed | 1 skipped (156)
     Tests  2084 passed | 2 skipped (2086)
  Duration  168.32s
```
`corepack pnpm lint` (== `eslint "src/**/*.ts"`): exit 0, sin output.
`corepack pnpm exec tsc --noEmit -p tsconfig.json`: exit 0, sin output.

Los 2 skipped = test de integración gated (2.14) que skippea sin `SMTP_TEST=1`. PR1 tenía 2054 tests; ahora 2086 (+32) por los specs nuevos de PR2.

### Deferred / no tocado (correcto para PR2)
- PR3 (handler puro + listener + wiring de `tickets.module.ts`) y PR4 (puntos de publicación + reestructura CrearObservacion + DTOs/controllers). `tickets.module.ts`, `transicionar-estado.use-case.ts`, `crear-observacion.use-case.ts` NO se tocaron.
- El wiring de los providers `EMAIL_SENDER`/`SOLICITANTE_EMAIL_RESOLVER` es de PR3 (task 3.8) — por eso los adapters existen pero aún no están registrados en el módulo.

### Cómo retomar
Decidir: (a) aprobar PR2 → seguir con PR3 (handler/listener/wiring); (b) pedir ajustes sobre PR2 antes de avanzar. Push/PR de cada slice sigue gateado por el usuario.
