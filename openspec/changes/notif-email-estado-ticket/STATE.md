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

---

## Judgment Day — PR2 — fixes Ronda 1 (2026-07-30)

**Status: DONE.** 6 issues confirmados (1 CRITICAL de build, 1 CRITICAL de seguridad XSS, 4 WARNING) arreglados RED→GREEN, estrictamente dentro de PR2 (`tickets.module.ts`, handler, listener, use cases de PR3/PR4 NO tocados).

### Fixes aplicados

1. **[CRITICAL] Templates `.hbs` no llegaban a `dist/`** — `backend/package.json` script `build`: se agregó paso `copyfiles -u 1 "src/tickets/infrastructure/email-templates/**/*.hbs" dist` después de `tsc-alias`. Herramienta elegida: `copyfiles@2.4.1` (devDependency nueva, cross-platform Windows/Linux, liviana — no había ninguna ya instalada). `-u 1` recorta el segmento `src/` para que el destino mirror-ee exactamente la ruta que `TEMPLATES_ROOT` resuelve en runtime (`dist/tickets/infrastructure/email-templates`). Verificado con build REAL (`pnpm run build` completo, no solo el smoke test): `dist/tickets/infrastructure/email-templates/cambio-estado/{subject,body}.hbs` quedan en la ruta exacta que espera `path.join(__dirname, '..', 'email-templates')` del adapter compilado. Smoke test agregado: `backend/src/tickets/infrastructure/email/email-templates-build.spec.ts` (verifica el script declarado, no corre el build completo en cada test run por costo).

2. **[CRITICAL] XSS — `interpolate()` no escapaba HTML** — `nodemailer-email-sender.adapter.ts`: `interpolate()` ahora acepta `{ escapeHtml: boolean }`; se agregó `escapeHtml()` (entidades `& < > " '`). Se aplica `escapeHtml: true` SOLO al interpolar `body.hbs` (contexto HTML) — el `subject.hbs` queda sin escapar (es texto plano de header, escaparlo mostraría `&amp;` literal al usuario). Tests RED→GREEN en `nodemailer-email-sender.adapter.spec.ts` (uno prueba el escape en el body, otro prueba explícitamente que el subject NO se escapa).

3. **[WARNING] `causa` filtraba el email completo en errores/logs (R7)** — `nodemailer-email-sender.adapter.ts`: nueva función `sanitizeCausa()` con regex `EMAIL_IN_TEXT` que detecta emails embebidos en texto libre (mensajes de rechazo SMTP) y los enmascara reusando `Email.maskRaw()`. Decisión: se hizo público `Email.maskRaw()` (antes `private static`) en `email.vo.ts` para reusar la MISMA regla de enmascarado del dominio en vez de duplicar lógica en infra — coherente con "shared kernel" de `value-objects/SKILL.md`.

4. **[WARNING] `as any`/`as unknown as` en specs (DoD §9)** — Cero ocurrencias nuevas quedaron:
   - `nodemailer-email-sender.adapter.spec.ts`: las 6 ocurrencias de `{ sendMail } as any` reemplazadas por `const transporter: EmailTransporter = { sendMail }` (tipado con la interfaz que el propio adapter exporta para esto).
   - `solicitante-email.resolver.spec.ts`: `as unknown as PrismaService` → `as PrismaService` (single-cast). Se verificó con un scratch file + `tsc --noEmit` que el single-cast compila (la clase real tiene fields privados pero es asignable EN REVERSA a la forma estructural del mock, lo que habilita el cast de un solo paso — no hace falta pasar por `unknown`).

5. **[WARNING] Resolver sin try/catch → promise reject en listener async** — `solicitante-email.resolver.ts`: el `findFirst` cross-DB ahora está en try/catch; ante fallo de infra (conexión/timeout/pool) se retorna `Result.fail(new ResolverEmailError('INFRAESTRUCTURA_INDISPONIBLE', ...))` en vez de dejar rechazar la promesa. Se agregó el código `INFRAESTRUCTURA_INDISPONIBLE` a `ResolverEmailErrorCode` (`email.errors.ts`) — no existía un código distinguible para fallos de infra vs. "email no disponible"/"usuario no encontrado", y reusar uno de esos dos habría sido semánticamente incorrecto. Mensaje del error NO incluye detalle crudo del driver (solo IDs de solicitante/tenant).

6. **[WARNING] `Email` VO sin `toString()`** — `email.vo.ts`: `toString()` agregado, delega en `mask()` (nunca el valor crudo) para no reintroducir riesgo de fuga por interpolación implícita.

### Decisiones no explícitamente pedidas pero necesarias
- Nuevo código de error `INFRAESTRUCTURA_INDISPONIBLE` en `ResolverEmailErrorCode` (issue 5) — cambio aditivo mínimo, no rompe el contrato existente.
- `Email.maskRaw()` pasó de `private` a `static` público (issue 3) — mismo motivo: reuso de lógica de dominio en vez de duplicarla en infra.

### Evidencia real (backend/, 2026-07-30)
`corepack pnpm test`: **156 test files (155 passed + 1 skipped), 2094 tests (2092 passed + 2 skipped)** — antes de este fix eran 2086 (+8 tests nuevos: 1 toString, 1 try/catch resolver, 1 causa masking, 2 XSS body/subject, 3 smoke test de build).
`corepack pnpm lint`: exit 0 (2 errores de formato `prettier/prettier` detectados en la primera corrida sobre el spec del adapter, corregidos con `prettier --write`; verde en la corrida final).
`corepack pnpm exec tsc --noEmit -p tsconfig.json`: exit 0.

### Archivos tocados
- `backend/package.json` (+devDependency `copyfiles`, script `build`)
- `backend/pnpm-lock.yaml` (lockfile, por `copyfiles`)
- `backend/src/tickets/infrastructure/email/nodemailer-email-sender.adapter.ts`
- `backend/src/tickets/infrastructure/email/nodemailer-email-sender.adapter.spec.ts`
- `backend/src/tickets/infrastructure/email/email-templates-build.spec.ts` (nuevo)
- `backend/src/tickets/infrastructure/persistence/prisma/solicitante-email.resolver.ts`
- `backend/src/tickets/infrastructure/persistence/prisma/solicitante-email.resolver.spec.ts`
- `backend/src/tickets/domain/errors/email.errors.ts`
- `backend/src/tickets/domain/value-objects/email.vo.ts`
- `backend/src/tickets/domain/value-objects/email.vo.spec.ts`

### No tocado (correcto, fuera de scope)
`tickets.module.ts`, handler, listener, use cases de PR3/PR4 — cero cambios, tal como lo exigía el mandato de esta ronda.

---

## Judgment Day — PR2 — fixes Ronda 2 (2026-07-30)

**Status: DONE.** 5 issues confirmados (0 CRITICAL, 4 WARNING, 1 SUGGESTION doc-only) arreglados RED→GREEN, estrictamente dentro de PR2 (`tickets.module.ts`, handler, listener, use cases de PR3/PR4 NO tocados).

### Fixes aplicados

**A. [WARNING] Smoke test del build era tautológico** — `email-templates-build.spec.ts` reescrito para ejecutar `copyfiles` REAL (la librería, no un mock) contra un `tmpDir`, con los parámetros (`glob`, `-u N`) parseados dinámicamente del script `build` real de `package.json` (no hardcodeados). La ruta esperada se deriva con `path.relative()` a partir de `TEMPLATES_ROOT` — ahora exportado del adapter (`nodemailer-email-sender.adapter.ts`) en vez de recalculado — contra la raíz de `src/`, aprovechando que `tsc` mirror-ea esa misma estructura relativa en `dist/`. Se ejecuta con `process.chdir(BACKEND_ROOT)` durante la copia para replicar el mismo cwd que usa pnpm al correr `build` (el recorte `-u N` de `copyfiles` opera sobre la FORMA del path que matchea el glob — con un glob absoluto el recorte da un resultado distinto al de producción). Verificado con mutation test manual: cambiar `TEMPLATES_ROOT` a `path.join(__dirname, '..', '..', 'email-templates')` (un nivel de más) hace fallar el test — se revirtió después de confirmar la detección. Nuevo archivo `copyfiles.d.ts` (declaración ambiente mínima; `copyfiles` no publica tipos propios).

**B. [WARNING] `toString()` no evita fuga por logging de objeto** — `email.vo.ts`: agregado `toJSON()` (delega en `mask()`, usado por `JSON.stringify()`) y `[Symbol.for('nodejs.util.inspect.custom')]()` (delega en `mask()`, usado por `console.log`/`util.inspect()`). El símbolo se registra vía `Symbol.for(...)` — NO se importa `'util'` en domain, así no se viola clean-arch; `const` con inicializador `Symbol.for(...)` es tipado por TS como `unique symbol`, válido como nombre de miembro computado de clase sin necesidad de cast. Tests RED→GREEN confirmaron el leak real antes del fix: `JSON.stringify(email)` → `{"_value":"usuario@dominio.com"}` y `util.inspect(email)` → `Email { _value: 'usuario@dominio.com' }`.

**C. [WARNING] `Email.maskRaw` público debilitaba el VO** — algoritmo de enmascarado extraído a `backend/src/shared/domain/mask-email-like.ts` (`export function maskEmailLike(raw: string): string`), función pura del shared kernel. `Email.mask()` y `sanitizeCausa()` (adapter) ahora reusan esa función; `Email.maskRaw` fue ELIMINADO del VO (no solo `private` — ya no hacía falta ningún método interno, `mask()` llama directo a `maskEmailLike`). Decisión de ubicación: `shared/domain/` (no `tickets/domain/`) porque es lógica de shared kernel reusable fuera del contexto de tickets si en el futuro otro bounded context necesita enmascarar emails. Grep confirmó que `Email.maskRaw` no tenía otros consumidores. Test unitario nuevo: `mask-email-like.spec.ts`.

**D. [WARNING] CRLF injection en subject (hardening)** — `nodemailer-email-sender.adapter.ts`: `interpolate()` ahora acepta `stripCrlf?: boolean`, independiente de `escapeHtml`; se aplica `stripCrlf: true` SOLO al interpolar `subject.hbs` (el body HTML no lo necesita). Test RED→GREEN con un valor conteniendo `\r\nBcc: atacante@evil.com` interpolado en `numero` — confirmado que sin el fix el subject resultante contenía el CRLF crudo.

**E. [SUGGESTION doc-only] Path `type:'html'` no escapa** — comentario agregado en `i-email-sender.port.ts` sobre la variante `EmailBody` `{ type: 'html' }`, documentando que asume contenido ya confiable/estático y que la capa de aplicación NUNCA debe alimentarla con datos de dominio sin sanitizar. Sin cambio de comportamiento, sin test nuevo (por diseño del fix).

### Evidencia real (backend/, 2026-07-30)
`corepack pnpm test`: **158 test files (157 passed + 1 skipped), 2100 tests (2098 passed + 2 skipped)** — antes de esta ronda eran 2094 (+6: 3 toJSON/inspect, 1 CRLF subject, 3 `maskEmailLike` menos 1 test neto del build spec que redujo de 3 a 2 casos = +6 netos).
`corepack pnpm lint`: exit 0 (184 errores CRLF/formato detectados tras una edición vía PowerShell que reescribió `nodemailer-email-sender.adapter.ts` con line-endings CRLF — corregidos con `prettier --write`; verde en la corrida final).
`corepack pnpm exec tsc --noEmit -p tsconfig.json`: exit 0.

### Archivos tocados
- `backend/src/tickets/infrastructure/email/email-templates-build.spec.ts` (reescrito — ejecución real)
- `backend/src/tickets/infrastructure/email/copyfiles.d.ts` (nuevo)
- `backend/src/tickets/infrastructure/email/nodemailer-email-sender.adapter.ts` (`TEMPLATES_ROOT` exportado, `stripCrlf`, usa `maskEmailLike`)
- `backend/src/tickets/infrastructure/email/nodemailer-email-sender.adapter.spec.ts` (+1 test CRLF)
- `backend/src/tickets/domain/value-objects/email.vo.ts` (`toJSON()`, inspect symbol, `maskRaw` eliminado, usa `maskEmailLike`)
- `backend/src/tickets/domain/value-objects/email.vo.spec.ts` (+3 tests JSON/inspect)
- `backend/src/shared/domain/mask-email-like.ts` (nuevo)
- `backend/src/shared/domain/mask-email-like.spec.ts` (nuevo)
- `backend/src/tickets/domain/ports/i-email-sender.port.ts` (comentario doc-only)

### No tocado (correcto, fuera de scope)
`tickets.module.ts`, handler, listener, use cases de PR3/PR4 — cero cambios.

### Cómo retomar
Decidir: (a) aprobar PR2 (Ronda 2 incluida) → seguir con PR3; (b) pedir ajustes adicionales sobre PR2 antes de avanzar.

---

## Judgment Day — PR2 — fixes Ronda 3 (2026-07-30)

Ronda 3 de jueces: los 5 fixes de Ronda 2 quedaron verificados correctos (ambos jueces corrieron build/tests reales). Cero real WARNING **confirmados** por 2 jueces. El Juez B levantó 2 real WARNINGs (single-judge pero correctos y baratos) que se arreglaron igual, más 1 theoretical confirmado por ambos que se cerró de raíz.

### Arreglos aplicados
- **C** [scope-rule]: `maskEmailLike` movido de `shared/domain/` → `backend/src/tickets/domain/mask-email-like.ts` (+ spec). Solo lo usa la feature `tickets`, no cruza bounded contexts → no correspondía al shared kernel global (CLAUDE.md §2). Imports actualizados en `email.vo.ts` y adapter; cero refs colgadas.
- **D** [seguridad, fix incompleto de Ronda 2]: el strip de CR/LF del subject ahora es **INCONDICIONAL** en `resolveContent()` (`stripCrlf(subject)` sobre las 3 variantes `template`/`text`/`html`), no solo la rama `template`. Antes `text`/`html` pasaban `email.subject` crudo a `sendMail()` → header injection SMTP latente que PR3 iba a heredar. RED→GREEN con payload `\r\nBcc:` en `text` y `html`.
- **B** [fuga por enumeración]: `Email._value` (private de TS, solo compile-time) → `#value` (private field REAL de ECMAScript). Ahora `Object.keys(email)`, `{...email}`, `Object.values(email)` NO exponen el crudo; `toString()`/`toJSON()`/`[inspect.custom]` siguen delegando en `mask()`. `.value()` es el único acceso explícito al crudo.

### Residuales dejados como INFO (trazados, no arreglados — no lo ameritan)
- Smoke test del build usa `process.chdir(BACKEND_ROOT)` (efecto global de proceso); seguro HOY porque `vitest.config.ts` fija `fileParallelism: false`. Si esa opción se relaja, revisar este test.
- `copyfiles.d.ts` es una ambient declaration sin guarda; si algún día se instala `@types/copyfiles`, puede colisionar por declaration merging.
- `type:'html'` del port asume contenido confiable (documentado en `i-email-sender.port.ts`); sin caller de prod hoy — PR3 no debe alimentarlo con datos de dominio sin sanitizar.

### Evidencia real (backend/, 2026-07-30)
`corepack pnpm test`: `Test Files 157 passed | 1 skipped (158)` · `Tests 2103 passed | 2 skipped (2105)`.
`corepack pnpm lint`: exit 0. `corepack pnpm exec tsc --noEmit -p tsconfig.json`: exit 0.

### Veredicto
**Judgment Day PR2 — APROBADO** tras Ronda 3: cero CRITICAL, cero real WARNING pendientes. Siguiente: PR3 (handler + listener + wiring).
