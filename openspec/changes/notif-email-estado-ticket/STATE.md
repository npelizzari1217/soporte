# STATE — notif-email-estado-ticket

> Breadcrumb de resume. Escrito antes de reiniciar la sesión para conectar engram.

## Qué es el change
Notificaciones por **email** cuando **cambia el estado de un ticket** (proyecto Soporte, backend NestJS multi-tenant).

## Fase actual
`explore` ✅ · `proposal` ✅ · `spec` ✅ · `design` ✅ · `tasks` ✅ · `apply PR1` ✅ · `apply PR2` ✅ (Judgment Day Rondas 1-3, APROBADO) · `apply PR3` ✅ (Judgment Day Rondas 1-3) · `apply PR4` ✅ COMPLETADA (verde, 2140 tests) — **último PR del change**. Siguiente: `sdd-verify` y/o Judgment Day sobre PR4, luego decisión de entrega (push/PR) por el usuario.

### Entrega: chained PRs (elegido por usuario 2026-07-29)
- PR1 ✅ fundaciones evento (branch `notif-email-estado-ticket-pr1`, 2 commits locales, SIN push/PR).
- PR2 ✅ email port/adapter/resolver/templates (Judgment Day Rondas 1-3, APROBADO).
- PR3 ✅ handler/listener/wiring (Judgment Day Rondas 1-3).
- PR4 ✅ COMPLETADO — puntos de publicación + reestructura CrearObservacion + DTOs/controllers + anti-regresión + enriquecimiento del evento (branch `notif-email-estado-ticket-pr4`, encadenada sobre PR3). Es el ÚLTIMO PR planificado del change. Sin push/PR — gateado por el usuario.
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

---

## Apply Progress — PR3 (Handler puro + listener + wiring parcial) — 2026-07-30

**Status: DONE.** Tasks 3.1–3.9 completas (RED→GREEN estricto). Branch `notif-email-estado-ticket-pr3` (encadenada sobre PR2, que ya pasó Judgment Day). Sin push/PR (gateado por usuario).

### Tasks completadas
- 3.1-3.4 RED → 3.5 GREEN: `NotificarCambioEstadoHandler` (application, PURO — sin decorators NestJS). `handle(event)` NUNCA throw:
  - estado no-clave ⇒ `{status:'skipped'}`, `resolver`/`emailSender` NO llamados.
  - resolver falla (huérfano/sin email) ⇒ `{status:'no-email', motivo, solicitanteId, ticketId}`.
  - `emailSender.send` falla ⇒ `{status:'send-failed', destinatarioEnmascarado, causa, ticketId}` (usa `EmailError.destinatarioEnmascarado`/`.causa`, ya enmascarados desde PR2 Judgment Day).
  - camino feliz ⇒ `{status:'sent', destinatarioEnmascarado, ticketId}`.
- 3.6 RED → 3.7 GREEN: `NotificarCambioEstadoListener` (`@Injectable()` + `@OnEvent(TICKET_ESTADO_CAMBIADO)`), delega 100% en el handler y mapea el outcome a nivel de log: `skipped`→sin log, `no-email`→`logger.warn`, `send-failed`→`logger.error`, `sent`→`logger.log`. Nunca llama `.value()` sobre ningún `Email` — solo usa `destinatarioEnmascarado`/`motivo`/`causa`, ya strings seguros de loguear.
- 3.8: wire en `tickets.module.ts` — `SOLICITANTE_EMAIL_RESOLVER`→`SolicitanteEmailResolver` (`useClass`), `EMAIL_SENDER`→factory con fallback (ver deviación abajo), `NotificarCambioEstadoHandler` (`useFactory` con los 2 ports inyectados), `NotificarCambioEstadoListener` (clase provider, sin `exports` — el `DiscoveryService` de `@nestjs/event-emitter` la detecta igual). Verificado: DI graph resuelve completo.
- 3.9 Verify: evidencia real abajo.

### Desviación de diseño (documentada, no silenciosa) — EMAIL_SENDER wiring
`design.md` §7 y `email-config.ts` establecen que la config SMTP se valida AL BOOTSTRAP y aborta el arranque si falta (Requirement 7 nota infra, D7) — `NodemailerEmailSender.fromEnv()` sigue lanzando exactamente así, sin cambios, cuando se invoca directamente.

**Problema encontrado al implementar 3.8:** NestJS instancia TODOS los providers de un módulo de forma EAGER durante `moduleRef.compile()`/`.init()` (confirmado empíricamente, no solo supuesto — mismo comportamiento que ya forzó el fallback `DATABASE_URL_MASTER ?? ''` de `PrismaService` en PR previo). Este entorno de test/CI **no tiene `SMTP_*` configurado** (confirmado: `node -e "console.log(!!process.env.SMTP_HOST)"` → `false`, y `vitest.config.ts` no carga `dotenv`). Si `EMAIL_SENDER` se hubiera cableado como `useFactory: () => NodemailerEmailSender.fromEnv()` directo, los siguientes tests YA EXISTENTES y verdes se habrían roto (verificado antes y después del fix):
- `tickets.module.wiring.spec.ts`, `equipos.module.spec.ts`, `compras.module.spec.ts`, `reparaciones.module.wiring.spec.ts`, `app.module.spec.ts` (todos bootstrapean el grafo de DI completo de `TicketsModule` sin SMTP).

**Fix aplicado:** nueva clase `SmtpUnavailableEmailSender implements EmailSenderPort` (`tickets/infrastructure/email/smtp-unavailable-email-sender.ts`, con spec RED→GREEN propio). El `useFactory` de `EMAIL_SENDER` en `tickets.module.ts` envuelve `NodemailerEmailSender.fromEnv()` en `try/catch`: si lanza (SMTP no configurado), loguea un WARN vía `Logger('TicketsModule')` y retorna `SmtpUnavailableEmailSender` en su lugar — un sender que NUNCA lanza y siempre resuelve `Result.fail(EmailError)` en el primer `send()` real, con la causa de config preservada (enmascarada). Efecto: el arranque real en producción con `SMTP_*` presente construye `NodemailerEmailSender` normalmente (comportamiento sin cambios); un arranque de test/dev sin SMTP configurado NO aborta el DI graph, y el fallo de notificación queda visible en logs recién en el primer intento de envío real — consistente con R5/R6 (el email nunca es parte del camino crítico de la transición).
Test agregado a `tickets.module.wiring.spec.ts`: bootstrapea `SharedModule + TicketsModule` sin SMTP y confirma que `EMAIL_SENDER`/`SOLICITANTE_EMAIL_RESOLVER`/`NotificarCambioEstadoHandler`/`NotificarCambioEstadoListener` resuelven sin excepción.

### Limitación conocida (no bloquea PR3, documentada para PR4/futuro)
El handler construye el `EmailMessage` (`body: {type:'template', name:'cambio-estado', data:{...}}`) solo con los campos disponibles en `TicketEstadoCambiado` (`ticketId`, `tipoCodigo`, `estadoAnteriorCodigo`, `estadoNuevoCodigo`) — el evento, por diseño (D4), NO carga `numero`/`tituloTicket` del ticket (los templates `.hbs` de PR2 sí los referencian). Esos dos placeholders renderizan vacíos hoy. Task 3.4 ya anticipaba esto ("parcial — sin use case real"): la forma completa del evento y su consumo real recién se ejercitan en PR4 (puntos de publicación). Si se necesita enriquecer el email con número/título, es un cambio de infraestructura aislado al handler o al evento — no bloquea ningún requirement de PR3 (R1/R4/R5, que solo exigen el contrato de outcomes).

### Archivos creados
- `backend/src/tickets/application/event-handlers/notificar-cambio-estado.handler.ts` (+ `.spec.ts`)
- `backend/src/tickets/infrastructure/events/notificar-cambio-estado.listener.ts` (+ `.spec.ts`)
- `backend/src/tickets/infrastructure/email/smtp-unavailable-email-sender.ts` (+ `.spec.ts`) — deviación documentada arriba

### Archivos modificados
- `backend/src/tickets/tickets.module.ts` (+providers `SOLICITANTE_EMAIL_RESOLVER`, `EMAIL_SENDER`, `NotificarCambioEstadoHandler`, `NotificarCambioEstadoListener`)
- `backend/src/tickets/tickets.module.wiring.spec.ts` (+1 test de resolución DI para los 4 tokens/clases nuevos)
- `openspec/changes/notif-email-estado-ticket/tasks.md` (3.1–3.9 marcadas)

### No tocado (correcto, fuera de scope PR3)
`transicionar-estado.use-case.ts`, `crear-observacion.use-case.ts`, DTOs, controllers — PR4. `DOMAIN_EVENT_PUBLISHER` NO se inyectó en ningún use case (eso es PR4); el listener es un SUSCRIPTOR, no necesita el publisher.

### Evidencia real (backend/, 2026-07-30)
`corepack pnpm test` (== `vitest run`):
```
Test Files  160 passed | 1 skipped (161)
     Tests  2117 passed | 2 skipped (2119)
  Duration  175.38s
```
(antes de PR3: 158 files / 2105 tests — PR3 agrega 3 archivos de test nuevos + 14 tests: 4 handler, 6 listener, 3 smtp-unavailable-sender, 1 wiring nuevo.)

`corepack pnpm lint` (== `eslint "src/**/*.ts"`): exit 0, sin output.
`corepack pnpm exec tsc --noEmit -p tsconfig.json`: exit 0, sin output.

### Git
Branch `notif-email-estado-ticket-pr3` (creada desde `notif-email-estado-ticket-pr2` local, que ya incluye los fixes de Judgment Day Rondas 1-3). Commit conventional pendiente de esta sesión, sin Co-Authored-By. **Sin push, sin PR** — gateado por el usuario.

### Cómo retomar
Decidir: (a) aprobar PR3 → seguir con PR4 (puntos de publicación + reestructura `CrearObservacionUseCase` + DTOs/controllers + anti-regresión, mayor riesgo); (b) correr Judgment Day sobre PR3 antes de avanzar (mismo patrón que PR2); (c) pedir ajustes sobre PR3.

## Judgment Day — PR3 — fixes Ronda 1 (2026-07-30)

**Veredicto de los 2 jueces:** el fallback `SmtpUnavailableEmailSender` de 3.8 (arriba) era el problema real, no la solución — convertía un fail-fast intencional (D7, Requirement 7 nota infra) en fallo silencioso EN TODOS los entornos, incluido producción. Un deploy sin `SMTP_*` arrancaría "sano" y nunca mandaría mails, sin ningún log de arranque visible salvo un WARN fácil de perder.

### Decisión clave: fail-fast restaurado, causa raíz resuelta en el entorno de test
En vez de tolerar el throw de config SMTP faltante en el `useFactory` de `EMAIL_SENDER`, se resolvió la causa raíz: el problema NUNCA fue que la app deba tolerar SMTP ausente — fue que el ENTORNO DE TEST bootstrapea `TicketsModule`/`AppModule` sin `SMTP_*`. Fix: env SMTP dummy inyectada globalmente en el setup de Vitest, no en el código de producción.

### Fixes aplicados
1. **[CRITICAL] `EMAIL_SENDER` fail-fast restaurado.**
   - `backend/src/tickets/tickets.module.ts`: el `useFactory` de `EMAIL_SENDER` volvió a ser `() => NodemailerEmailSender.fromEnv()` directo, SIN try/catch. El throw de config SMTP faltante se propaga y aborta `moduleRef.compile()`/`.init()` — comportamiento correcto para un deploy real sin SMTP.
   - **Eliminados**: `backend/src/tickets/infrastructure/email/smtp-unavailable-email-sender.ts` y su `.spec.ts` (ya no hacen falta).
   - `backend/src/tickets/infrastructure/email/email-config.ts`: `loadEmailConfig()` ahora lanza `SmtpConfigError` (nueva clase exportada, extiende `Error`) en vez de `Error` genérico — mismo mensaje, solo tipado, para distinguir config-faltante de un bug real en el adapter.
   - **Entorno de test resuelto en la raíz**: nuevo `backend/test/setup-env.ts` (registrado en `vitest.config.ts` vía `setupFiles`) inyecta `SMTP_HOST/PORT/USER/PASS/FROM` DUMMY (`??=`, no pisa env real si ya está seteado) para TODA la suite. Cubre `tickets.module.wiring.spec.ts`, `equipos.module.spec.ts`, `compras.module.spec.ts`, `reparaciones.module.wiring.spec.ts`, `app.module.spec.ts`, `app.module.validation-pipe.spec.ts`, `tickets.dto.validation-pipe.spec.ts`, `smoke.e2e.spec.ts` — ninguno rompió.
   - `tickets.module.wiring.spec.ts` actualizado: el test que antes solo pedía `EMAIL_SENDER` `toBeDefined()` ahora asserta `toBeInstanceOf(NodemailerEmailSender)` — confirma que con env dummy el DI graph resuelve el sender REAL, no un stand-in.
   - Efecto neto: cero regresión de comportamiento en producción (sigue fail-fast, mismo mensaje de error); el entorno de test ya no depende de que el código de producción tolere config faltante.

2. **[CRITICAL DoD §9] `as unknown as` eliminados de los 2 specs señalados.**
   - `notificar-cambio-estado.handler.spec.ts`: `resolver`/`emailSender` tipados directo como `ISolicitanteEmailResolver & {...}` / `EmailSenderPort & {...}` — interfaces planas, sin cast.
   - `notificar-cambio-estado.listener.spec.ts`: `NotificarCambioEstadoHandler` tiene campos privados (`resolver`/`emailSender`) → un objeto literal NO es asignable ni con single-cast (`as X`) sin pasar por `unknown` (TS "brands" clases con miembros privados). Se reemplazó el mock manual por una instancia REAL del handler con stubs tipados de sus 2 ports + `vi.spyOn(handler, 'handle')` — cero casts de ningún tipo, el listener recibe el tipo exacto de su constructor.

3. **[WARNING] Listener sin try/catch — RED→GREEN.**
   - `notificar-cambio-estado.listener.ts`: `await this.handler.handle(event)` ahora envuelto en `try/catch`. Si `handle()` rechaza (rompiendo su contrato "nunca throw"), se loguea `ERROR` con el `ticketId` y el motivo (sin email en claro) y NUNCA se relanza — última red de seguridad contra un unhandled rejection que en Node 24 mataría el proceso.
   - Test RED nuevo en `notificar-cambio-estado.listener.spec.ts`: `handleSpy.mockRejectedValue(...)` → confirma que la promesa del listener resuelve (`resolves.not.toThrow()`) y que se logueó ERROR.

4. **[SUGGESTION] Exhaustividad + Logger.**
   - `notificar-cambio-estado.listener.ts`: rama `default` agregada al `switch (outcome.status)` con `const _exhaustive: never = outcome` — un `NotificacionOutcome` nuevo sin manejar rompe `tsc --noEmit` en vez de fallar en silencio. Defensivo en runtime: loguea ERROR en vez de lanzar (nunca alcanzable si el tipo se respeta).
   - Extracción de `new Logger(...)` a constante de módulo: NO aplica — ese `new Logger('TicketsModule').warn(...)` vivía DENTRO del try/catch de `EMAIL_SENDER` que el fix 1 eliminó por completo (ya no hay ningún Logger inline en ningún factory de `tickets.module.ts`). `NotificarCambioEstadoListener` ya usaba el patrón correcto (`private readonly logger = new Logger(...)` a nivel de clase) — nada que extraer ahí.

5. **[Backlog, no implementado — decisión de diseño de PR4]**
   - `openspec/changes/notif-email-estado-ticket/tasks.md`: nuevo ítem `4.14` bajo PR4 documentando que `EmailMessage.data` necesita `numero`/`tituloTicket` (hoy placeholders vacíos, D4 — el evento no los carga) antes de que el flujo real quede activo en prod.

### Evidencia real (backend/, 2026-07-30)
`corepack pnpm test`:
```
Test Files  159 passed | 1 skipped (160)
     Tests  2115 passed | 2 skipped (2117)
  Duration  164.84s
```
(vs. Apply Progress PR3 original: 161→160 test files, 2119→2117 tests. Neto: -1 archivo [`smtp-unavailable-email-sender.spec.ts` eliminado, -3 tests] +1 test RED nuevo en el listener [rechazo de `handler.handle()`] = -2 tests.)

`corepack pnpm lint` (== `eslint "src/**/*.ts"`): exit 0, sin output.
`corepack pnpm exec tsc --noEmit -p tsconfig.json`: exit 0, sin output.

### Archivos tocados
- Modificados: `backend/src/tickets/tickets.module.ts`, `backend/src/tickets/infrastructure/email/email-config.ts`, `backend/src/tickets/tickets.module.wiring.spec.ts`, `backend/src/tickets/application/event-handlers/notificar-cambio-estado.handler.spec.ts`, `backend/src/tickets/infrastructure/events/notificar-cambio-estado.listener.ts`, `backend/src/tickets/infrastructure/events/notificar-cambio-estado.listener.spec.ts`, `backend/vitest.config.ts`, `openspec/changes/notif-email-estado-ticket/tasks.md`.
- Creados: `backend/test/setup-env.ts`.
- Eliminados: `backend/src/tickets/infrastructure/email/smtp-unavailable-email-sender.ts`, `backend/src/tickets/infrastructure/email/smtp-unavailable-email-sender.spec.ts`.

### No tocado (correcto, fuera de scope PR4)
`transicionar-estado.use-case.ts`, `crear-observacion.use-case.ts`, DTOs, controllers, y el enriquecimiento de `EmailMessage.data` con `numero`/`tituloTicket` (backlog 4.14, decisión de diseño de PR4).

---

## Judgment Day — PR3 — fixes Ronda 2 (2026-07-30)

Ronda 2 de jueces sobre PR3: el fail-fast de Ronda 1 quedó verificado correcto (factory sin try/catch, `SmtpUnavailableEmailSender` eliminado sin refs, `setup-env.ts` confinado a tests y fuera del build). Cero CRITICAL nuevos. Se arreglaron 3 real WARNINGs de cobertura de test + logging.

### Arreglos
- **1** [confirmado 2 jueces]: `email-config.spec.ts` ahora asserta `toThrow(SmtpConfigError)` **por tipo** (no solo regex del mensaje) — un `throw new Error` genérico ya no pasaría verde.
- **2** [Juez B, el más agudo]: agregado test de **wiring negativo** en `tickets.module.wiring.spec.ts` — hace `delete process.env.SMTP_HOST` y asserta que `Test.createTestingModule({imports:[SharedModule, TicketsModule]}).compile()` **rechaza con `SmtpConfigError`**, restaurando el env en `finally`. Blinda la regresión del CRITICAL de Ronda 1 (antes el env dummy global hacía que el guard fuera ciego).
- **3** [Juez A]: el catch de última red del listener ahora enmascara `err.message` con la nueva `maskEmailsInText()` (en `tickets/domain/mask-email-like.ts`) — enmascara emails EMBEBIDOS en texto libre sin mutilar el resto (a diferencia de `maskEmailLike()`, que asume que el string entero es un email). Evita fuga de PII si un bug de capa inferior mete el email crudo en el Error.

### Residuales dejados como INFO (trazados, no arreglados)
- `main.ts` sin `.catch()`/`process.exit(1)` explícito: el proceso igual muere ante `SmtpConfigError` al bootstrap (unhandled rejection de Node ≥15), pero no de forma prolija. Pre-existente, fuera de PR3.
- `backend/test/setup-env.ts` fuera del scope de `eslint "src/**"` (archivo trivial).
- Retry-with-backoff (messaging-notifications regla 4) no implementado: es decisión de diseño D5/D6 ("no revierte la transición"), no de este PR.

### Nota sobre tests de integración (diagnóstico honesto)
Durante el juicio, correr los 2 jueces en paralelo hizo fallar specs `*.integration.spec.ts` (reparaciones `$transaction`, tickets FK) por pisarse el estado de una DB de test compartida. **Corrida SERIAL única del orquestador: 2117 passed / 2 skipped, TODO verde** — confirmado que eran flakiness de concurrencia, no regresión de PR3 (que no toca reparaciones ni persistencia de tickets).

### Evidencia real (backend/, 2026-07-30, corrida serial)
`corepack pnpm test`: `Test Files 159 passed | 1 skipped (160)` · `Tests 2117 passed | 2 skipped (2119)`.
`corepack pnpm lint`: exit 0. `corepack pnpm exec tsc --noEmit -p tsconfig.json`: exit 0.

---

## Judgment Day — PR3 — fixes Ronda 3 (2026-07-30)

Ronda 3 de jueces sobre PR3: 3 WARNINGs confirmados por 2 jueces, los 3 concentrados en `tickets/domain/mask-email-like.ts` (introducido en Ronda 2) y su único consumidor de infra. Cero CRITICAL.

### Arreglos
- **1** [DRY, confirmado 2 jueces]: `nodemailer-email-sender.adapter.ts` tenía su PROPIA constante `EMAIL_IN_TEXT` con el mismo regex copy-pasteado de `mask-email-like.ts` (arrastrado de PR2, antes de que `maskEmailsInText()` existiera). Eliminada la copia local; `sanitizeCausa()` ahora delega en `maskEmailsInText()` importada de `../../domain/mask-email-like` — una sola fuente de verdad para el detector de emails embebidos. Comportamiento observable sin cambios (mismos tests del adapter, verdes).
- **2** [cobertura, confirmado 2 jueces]: `maskEmailsInText()` solo tenía cobertura indirecta (vía `sanitizeCausa()`/listener). Agregado `describe('maskEmailsInText()', ...)` en `mask-email-like.spec.ts` con 4 casos atómicos: (a) texto sin ningún email → passthrough intacto, (b) un email embebido con texto alrededor → solo el email enmascarado, (c) múltiples emails en el mismo texto → todos enmascarados, (d) dominio de una sola etiqueta (`user@localhost`) → cubre el arreglo 3.
- **3** [RED→GREEN, confirmado 2 jueces]: el regex `EMAIL_IN_TEXT` exigía un punto literal en el dominio (`[\w-]+\.[\w.-]+`), así que `no-reply@localhost` NUNCA se enmascaraba — una fuga de PII real dado que `backend/test/setup-env.ts` fija `SMTP_HOST='localhost'` (entorno de test/dev común). Test RED agregado primero (caso (d) del arreglo 2) confirmando la falla; luego relajado el regex a `[\w.+-]+@[\w-]+(?:\.[\w-]+)*` — dominio de 1+ etiquetas sin puntos anidados/solapados (sin riesgo de catastrophic backtracking). Verificado que no rompe ningún test existente de `maskEmailLike`/`sanitizeCausa`/listener.

### Evidencia real (backend/, 2026-07-30, corrida serial)
`corepack pnpm test`: `Test Files 159 passed | 1 skipped (160)` · `Tests 2121 passed | 2 skipped (2123)`.
`corepack pnpm lint`: exit 0. `corepack pnpm exec tsc --noEmit -p tsconfig.json`: exit 0.

---

## Apply Progress — PR4 (Puntos de publicación + DTOs/controllers + anti-regresión) — 2026-07-30

**Status: DONE.** Tasks 4.1–4.14 completas (RED→GREEN estricto). Branch `notif-email-estado-ticket-pr4` (encadenada sobre PR3, que ya pasó Judgment Day Rondas 1-3). Sin push/PR (gateado por usuario). **Es el PR MÁS RIESGOSO del change** (reestructura de atomicidad + puntos de publicación) — el riesgo se manejó con máximo cuidado: la suite `crear-observacion.use-case.spec.ts` preexistente (15 tests) quedó 100% verde, con 9 tests nuevos agregados (24/24 total).

### Decisión de diseño del usuario (2026-07-30) — enriquecimiento del evento (task 4.14)
El backlog de Judgment Day PR3 Ronda 1 (issue 5) dejó pendiente que `EmailMessage.data` renderizaba `numero`/`tituloTicket` vacíos porque el evento no los cargaba. El usuario decidió: **el use case enriquece el evento**, no el handler.
- `TicketEstadoCambiado` pasa de 10 a **12 campos**: se agregan `numero: string` y `tituloTicket: string`, insertados justo después de `ticketId` (agrupación semántica "qué ticket es"). Firma completa: `(ticketId, numero, tituloTicket, tipoCodigo, estadoAnteriorId, estadoNuevoId, estadoAnteriorCodigo, estadoNuevoCodigo, solicitanteId, autorId, tenantId, occurredAt)`.
- Ambos use cases pueblan estos 2 campos desde la `TicketEntity` que YA tienen en la mano al publicar (post-commit) — `ticket.numero`/`ticket.titulo` (getters ya existentes, sin cambios en la entidad) — **sin query extra**.
- `NotificarCambioEstadoHandler.handle()` ahora mapea `event.numero`/`event.tituloTicket` al `EmailMessage.data` (antes quedaban ausentes del payload del template).
- **D4 se AMPLÍA, no se contradice**: la decisión de NOTIFICAR sigue siendo pura sobre `estadoNuevoCodigo` (`esEstadoNotificable`), sin tocar la DB. Los 2 campos nuevos son solo payload de display para el template — no entran en el filtro de notificabilidad.
- Actualizado: `ticket-estado-cambiado.event.spec.ts` (PR1) a 12 campos; `notificar-cambio-estado.handler.spec.ts`/`notificar-cambio-estado.listener.spec.ts` (PR3) — sus helpers `makeEvent()` actualizados a la nueva firma de 12 args; +1 test nuevo en el handler que asserta el mapeo `numero`/`tituloTicket` → `EmailMessage.data`.

### Tasks completadas
- **4.1** `clienteId: string` agregado a `TransicionarEstadoDto` y `CrearObservacionDto` (D5).
- **4.2** `clienteId` poblado desde `user.cliente_id` (JWT) en `tickets.controller.ts`, en AMBOS métodos (`transicionarEstado` y `crearObservacion`) — **desviación documentada respecto de tasks.md/design.md**: ambos mencionaban "`tickets.controller.ts` + `operaciones.controller.ts`", pero se verificó contra el código real que `OperacionesController` SOLO expone `GET /tickets/:id/operaciones` (timeline de solo lectura) y NUNCA invoca `TransicionarEstadoUseCase` ni `CrearObservacionUseCase` — ambos endpoints que sí los invocan (`PATCH /tickets/:id/estado`, `POST /tickets/:id/observaciones`) viven en `TicketsController`. `operaciones.controller.ts` quedó sin tocar (correcto — no tiene ningún DTO que poblar). 2 tests nuevos en `tickets.controller.spec.ts` confirman `clienteId: 'cli-abc'` llega a ambos use cases.
- **4.3/4.4 RED → 4.5 GREEN**: `TransicionarEstadoUseCase` — inyecta `IDomainEventPublisher` (8º parámetro del constructor, al final — mínimo diff en tests existentes). Tras `await this.txRunner.run(...)`, si `esEstadoNotificable(estadoNuevo.codigo)`, publica `TicketEstadoCambiado` completo (con `ticket.numero`/`ticket.titulo`). Estado no-clave ⇒ no publica. Nuevo describe block "publicación post-commit..." con 6 tests: evento correcto (RESUELTO), Result.ok preservado, no-clave no publica, orden call (`tx:end` ANTES de `publisher:publish`), CANCELADO vía COMPRAS, CANCELADO vía EDILICIA.
- **4.6/4.7 RED → 4.8 GREEN**: reestructura de `CrearObservacionUseCase` (design §6.B, D6) — ver detalle abajo. Nuevo describe block "publicación post-commit... (auto-transición)" con 8 tests: RESUELTO publica con evento correcto, orden call (post-commit), SUSPENDIDO no publica, EN_PROGRESO (default) no publica, SIN_SOLUCION publica, ticket no-APROBADO no publica (y NO llama `tipoTicketRepo.findCodigoById`), `findCodigoById→null` no publica (guard D6), transición inválida (Sc7) no publica ni resuelve tipoCodigo.
- **4.9**: `tickets.module.ts` — `DOMAIN_EVENT_PUBLISHER` agregado al `inject` de `TransicionarEstadoUseCase` (8º arg) y de `CrearObservacionUseCase`; `TIPO_TICKET_REPOSITORY` agregado al `inject` de `CrearObservacionUseCase` (ya existía en `TicketsModule.providers`, solo faltaba inyectarlo en este use case). Verificado con `tickets.module.wiring.spec.ts` (compile()/init() reales, sin `UnknownDependenciesException`).
- **4.10**: nuevo archivo `ticket-estado-cambiado-forma-identica.spec.ts` — construye AMBOS use cases con datos de ticket equivalentes (mismo `ticketId`/`numero`/`titulo`/`solicitanteId`/`tenantId`/`autorId`, mismo destino `RESUELTO`), ejecuta ambos caminos, y compara: mismas claves (`Object.keys` ordenadas), mismo tipo por campo, y valores de negocio idénticos donde el escenario los hace coincidir. 1 test, verde.
- **4.11**: 2 tests nuevos en `transicionar-estado.use-case.spec.ts` — `tipoTicketRepo.findCodigoById` mockeado a `'COMPRAS'`/`'EDILICIA'`, destino `CANCELADO`, aserta `publisher.publish` llamado con `estadoNuevoCodigo: 'CANCELADO'` y el `tipoCodigo` correspondiente (R1).
- **4.12**: nuevo test en `event-emitter.publisher.spec.ts` — `EventEmitter2` REAL (no mock) + listener async con `setTimeout(50ms)`; confirma que `publish()` retorna en <20ms (sin esperar el listener) y que el listener eventualmente completa (fire-and-forget, sin pérdida).
- **4.13**: evidencia real pegada abajo, incluyendo la suite `crear-observacion` aislada.
- **4.14**: ver "Decisión de diseño del usuario" arriba.

### La reestructura de `CrearObservacionUseCase` (design §6.B, D6) — cómo se preservó la atomicidad
El riesgo central de este PR (design §9): `execute()` era `return this.txRunner.run(async () => { ...cuerpo completo...; return Result.ok(ticket); })`. Publicar post-commit exige código DESPUÉS de que `run()` resuelva, pero todo el cuerpo vivía DENTRO del callback.

**Regla seguida al pie de la letra**: el CUERPO del `txRunner.run` (qué se lee, qué se muta, qué se persiste, en qué orden, con qué guards) **NO cambió una sola línea de lógica de negocio**. El ÚNICO cambio estructural fue:
1. Se definió un tipo interno `ExecuteTxOutcome = { result: Result<TicketEntity, DomainError>; publicar: CambioEstadoParaPublicar | null }`.
2. TODOS los `return Result.fail(...)`/`return Result.ok(ticket)` que antes eran el valor de retorno DIRECTO del callback pasaron a ser `return { result: Result.fail(...), publicar: null }` / `return { result: Result.ok(ticket), publicar }` — mismo camino de código, mismo orden de validaciones, mismos guards, solo se envuelve el `Result` en un objeto junto a los datos de publicación (`estadoAnteriorId/estadoNuevoId/...codigo/solicitanteId/tipoId/numero/tituloTicket` — armados donde `ticket`/`estadoActual`/`estadoDestino` YA estaban en scope, dentro del `if (estadoActual.codigo === 'APROBADO')`).
3. `execute()` ahora hace `const outcome = await this.txRunner.run<ExecuteTxOutcome>(...)`, y DESPUÉS de ese `await` (fuera de la tx): si `outcome.publicar` existe Y `outcome.result.isOk()` Y `esEstadoNotificable(outcome.publicar.estadoNuevoCodigo)`, resuelve `tipoCodigo` vía `tipoTicketRepo.findCodigoById(outcome.publicar.tipoId)` (D6 — lookup guardado, condicional, solo cuando hubo auto-transición a estado notificable) y publica. Retorna `outcome.result`.
4. **Ningún guard de negocio se reordenó, se eliminó ni se relajó.** Los 12 `return` tempranos (ticket no encontrado, estado catálogo corrupto, estado terminal, tipoOperación no encontrada ×2, transición inválida, fechaCierre requerida, estado destino no encontrado) siguen exactamente en el mismo punto del flujo, con la misma condición — solo cambió la FORMA del valor de retorno, nunca la lógica que decide cuándo retornar.
5. **Verificación empírica de que la tx sigue rollbackeando igual**: Sc11 (falla `save(CAMBIO_ESTADO)` → `execute()` rechaza) y S1 (falla el primer `save(OBSERVACION)` → rechaza) — AMBOS siguen verdes sin tocarlos. Razón: el callback sigue siendo la MISMA función async; si `await this.operacionRepo.save(...)` rechaza dentro de él, la promesa del callback rechaza igual que antes, y como el mock de test (`txRunner.run: vi.fn((fn) => fn())`) solo llama y retorna `fn()` sin envolver en try/catch, el rechazo se propaga sin cambios hasta `await this.txRunner.run(...)` en `execute()`.
6. **Resultado**: la suite completa `crear-observacion.use-case.spec.ts` (15 tests preexistentes, TODOS sin modificar ni un assert) pasó 100% verde en la primera corrida tras la reestructura — sin necesidad de ningún ajuste retroactivo.

### Archivos creados
- `backend/src/tickets/application/use-cases/ticket-estado-cambiado-forma-identica.spec.ts` (task 4.10)

### Archivos modificados
- `backend/src/tickets/domain/events/ticket-estado-cambiado.event.ts` (+`numero`/+`tituloTicket`, 10→12 campos, task 4.14)
- `backend/src/tickets/domain/events/ticket-estado-cambiado.event.spec.ts` (actualizado a 12 campos)
- `backend/src/tickets/application/event-handlers/notificar-cambio-estado.handler.ts` (mapea `numero`/`tituloTicket` a `EmailMessage.data`, task 4.14)
- `backend/src/tickets/application/event-handlers/notificar-cambio-estado.handler.spec.ts` (`makeEvent()` a 12 args, +1 test de mapeo)
- `backend/src/tickets/infrastructure/events/notificar-cambio-estado.listener.spec.ts` (`makeEvent()` a 12 args)
- `backend/src/shared/infrastructure/events/event-emitter.publisher.spec.ts` (+1 test 4.12, EventEmitter2 real)
- `backend/src/tickets/application/use-cases/transicionar-estado.use-case.ts` (+`clienteId` en DTO, +`publisher` en ctor, publish post-commit, task 4.3-4.5)
- `backend/src/tickets/application/use-cases/transicionar-estado.use-case.spec.ts` (+`clienteId` en todos los DTOs literales del archivo, +publisher mock, +describe block de 6 tests)
- `backend/src/tickets/application/use-cases/crear-observacion.use-case.ts` (+`clienteId` en DTO, +`tipoTicketRepo`+`publisher` en ctor, **reestructura** del `txRunner.run`, tasks 4.6-4.8)
- `backend/src/tickets/application/use-cases/crear-observacion.use-case.spec.ts` (+`tipoTicketRepo`+`publisher` en mocks/ctor, +describe block de 8 tests)
- `backend/src/tickets/tickets.module.ts` (+`DOMAIN_EVENT_PUBLISHER` en `inject` de ambos use cases, +`TIPO_TICKET_REPOSITORY` en `inject` de `CrearObservacionUseCase`, task 4.9)
- `backend/src/tickets/interface/controllers/tickets.controller.ts` (+`clienteId: user.cliente_id` en ambas llamadas a use case, task 4.2)
- `backend/src/tickets/interface/controllers/tickets.controller.spec.ts` (+2 tests de propagación de `clienteId`)
- `openspec/changes/notif-email-estado-ticket/tasks.md` (4.1–4.14 marcadas)

### No tocado (correcto, fuera de scope PR4)
- `backend/src/tickets/interface/controllers/operaciones.controller.ts` — no invoca ninguno de los 2 use cases modificados (ver desviación 4.2 arriba).
- `TicketEntity` (`ticket.entity.ts`) — sin cambios; `numero`/`titulo` ya existían como getters públicos, reusados tal cual.
- Ningún cambio de schema/migración (confirmado, cero DB tocada en este change completo).

### Evidencia real (backend/, 2026-07-30, corrida serial)

**Suite `crear-observacion` aislada (anti-regresión, evidencia explícita pedida):**
```
corepack pnpm exec vitest run src/tickets/application/use-cases/crear-observacion.use-case.spec.ts
Test Files  1 passed (1)
     Tests  24 passed (24)
```
(15 tests preexistentes de PR2, TODOS verdes sin modificar — + 9 tests nuevos de PR4: 8 de publicación + 0 adicionales de rollback ya cubiertos por Sc11/S1 preexistentes.)

**Suite completa `pnpm test` (== `vitest run`):**
```
Test Files  160 passed | 1 skipped (161)
     Tests  2140 passed | 2 skipped (2142)
  Duration  ~174-180s
```
(vs. PR3 Judgment Day Ronda 3: 160 files / 2123 tests → PR4 agrega 1 archivo nuevo [`ticket-estado-cambiado-forma-identica.spec.ts`] + 19 tests netos: 1 handler [4.14] + 2 controller [4.2] + 6 transicionar-estado [4.3/4.4/4.11] + 8 crear-observacion [4.6/4.7] + 1 forma-idéntica [4.10] + 1 publisher [4.12] = 19.)

`corepack pnpm lint` (== `eslint "src/**/*.ts"`): 5 errores de formato `prettier/prettier` detectados en la primera corrida (indentación de argumentos multilinea en 2 archivos), corregidos con `eslint --fix`; **exit 0, sin output** en la corrida final. Re-corrida completa de `pnpm test` después del `--fix` confirmó los mismos 2140/2142 — el auto-fix no cambió comportamiento, solo formato.

`corepack pnpm exec tsc --noEmit -p tsconfig.json`: **exit 0, sin output.**

### Git
Branch `notif-email-estado-ticket-pr4` (creada desde `notif-email-estado-ticket-pr3` local, que ya incluye Judgment Day Rondas 1-3). Commit(s) conventional pendientes de esta sesión, sin Co-Authored-By. **Sin push, sin PR** — gateado por el usuario.

### Cómo retomar
PR4 es el ÚLTIMO PR planificado (tasks.md no tiene PR5). Decidir: (a) correr Judgment Day sobre PR4 (mismo patrón que PR2/PR3, dado el riesgo alto de este PR) antes de dar por cerrado el change; (b) aprobar directo y avanzar a `sdd-verify`/`sdd-archive`; (c) pedir ajustes sobre PR4.

---

## Judgment Day — PR4 — fixes Ronda 1 (2026-07-30)

**Veredicto de los 2 jueces:** 1 CRITICAL confirmado (bloque post-commit sin try/catch en `CrearObservacionUseCase`), 1 fix defensivo consistente aplicado por analogía en `TransicionarEstadoUseCase`, 1 docstring desactualizado, 1 WARNING theoretical dejado como backlog (no arreglado, fuera de scope).

### Fixes aplicados

1. **[CRITICAL] Guard post-commit en `crear-observacion.use-case.ts`** (~líneas 284-320).
   El bloque POST-COMMIT (`tipoTicketRepo.findCodigoById(...)` + construcción del `TicketEstadoCambiado` + `publisher.publish(...)`) NO estaba en try/catch. Si `findCodigoById` (o el publish) rechazaba la promesa DESPUÉS de que la tx ya committeó (DB drop, timeout, pool agotado), el reject se propagaba fuera de `execute()` → el controller no tiene catch genérico → 500 crudo al cliente, PESE a que el ticket + las filas de `OperacionTicket` YA estaban persistidas. Rompía el invariante fire-and-forget (R6/R10) y violaba error-handling regla 4 (todo `catch` debe mapear/re-wrap; acá directamente faltaba el catch). Peor: un retry del cliente ante el 500 habría duplicado la OBSERVACION.
   **Fix**: todo el bloque post-commit envuelto en try/catch. En el catch: `this.logger.error(...)` (nuevo `private readonly logger = new Logger(CrearObservacionUseCase.name)`, mismo patrón que `NotificarCambioEstadoListener`) con el `ticketId` y `err.message` (sin datos sensibles adicionales — el mensaje del error de infra no contiene PII en este flujo), y NO se relanza — se retorna igual `outcome.result` (el `Result.ok` ya obtenido del `txRunner.run`, la tx ya resuelta no se toca).
   **RED→GREEN**: nuevo test `4.8` en `crear-observacion.use-case.spec.ts` — `tipoTicketRepo.findCodigoById.mockRejectedValue(dbError)` tras un `setupAprobado()` → `RESUELTO` (estado notificable). Confirma: `result.isOk()` true con el ticket committeado, `ticketRepo.save`/`operacionRepo.save` llamados exactamente 1 vez / 2 veces (nada se re-invoca ni revierte), `publisher.publish` NO llamado (sin tipoCodigo no se arma el evento), y `Logger.prototype.error` llamado 1 vez. RED confirmado antes del fix (el error se propagaba sin catch, test fallaba con el `Error` crudo); GREEN tras envolver en try/catch.

2. **[Consistencia, no CRITICAL en sí — mismo patrón defensivo] Guard en `transicionar-estado.use-case.ts`** (~líneas 192-214).
   `TransicionarEstadoUseCase` resuelve `tipoCodigo` ANTES de la tx (no tiene la misma exposición de lookup post-commit que crear-observacion), pero su `publisher.publish()` post-commit igual podía lanzar sin red de seguridad. Por consistencia arquitectónica (mismo invariante fire-and-forget, R6/R10) se aplicó el mismo guard: `publisher.publish(...)` envuelto en try/catch, catch loguea `this.logger.error(...)` (nuevo `private readonly logger = new Logger(TransicionarEstadoUseCase.name)`) con el `ticket.id` y el motivo, sin relanzar — retorna igual `Result.ok(ticket)` de la transición ya committeada.
   **RED→GREEN**: nuevo test `4.12` en `transicionar-estado.use-case.spec.ts` — `publisher.publish.mockImplementation(() => { throw publishError; })` en una transición `RESUELTO` (notificable). Confirma `result.isOk()` true, `ticketRepo.save`/`operacionRepo.save` llamados 1 vez cada uno (sin duplicar), y `Logger.prototype.error` llamado 1 vez.

3. **[Docstring, Juez B] Comentario desactualizado en `crear-observacion.use-case.ts`** (~línea 123-124, ahora ~123-133).
   El comentario decía "Errores de infraestructura (DB) sí burbujean como throw para rollback de transacción" — ya no era exacto para el tramo post-commit tras el fix 1. Actualizado para separar explícitamente DOS casos: errores DENTRO de `txRunner.run()` → siguen burbujeando → rollback nativo del runner (sin cambios, no se tocó esa semántica); errores POST-commit (lookup/publish de la notificación) → se capturan en el nuevo try/catch y NUNCA rompen la respuesta de una operación ya committeada.

### Backlog / known-limitation (NO arreglado — fuera de scope de esta ronda, por instrucción explícita)
- **WARNING theoretical — `clienteId` de `CrearObservacionDto`/`TransicionarEstadoDto` viaja desde el JWT crudo, no desde un `TenantContext` ligado**, en el camino global-admin cross-tenant (`is_global_admin`). Es el mismo patrón heredado de `CrearTicketDto` (D5) — no es un bug introducido por PR4, es una decisión de modelo de tenant preexistente. Cerrarlo implicaría cambiar cómo se resuelve el tenant efectivo para usuarios `is_global_admin`, fuera del alcance quirúrgico de este fix. Dejado como nota de backlog para una futura revisión del modelo de tenant.

### Evidencia real (backend/, 2026-07-30, corrida serial FOREGROUND)

**Suites aisladas (RED→GREEN, anti-regresión explícita):**
```
corepack pnpm exec vitest run src/tickets/application/use-cases/crear-observacion.use-case.spec.ts src/tickets/application/use-cases/transicionar-estado.use-case.spec.ts
Test Files  2 passed (2)
     Tests  78 passed (78)
```
(24 preexistentes de `crear-observacion` + 1 nuevo [4.8] = 25; 52 preexistentes de `transicionar-estado` + 1 nuevo [4.12] = 53. Total 78, todos verdes.)

**Suite completa `pnpm test` (== `vitest run`):**
```
Test Files  160 passed | 1 skipped (161)
     Tests  2142 passed | 2 skipped (2144)
  Duration  169.45s
```
(vs. PR4 Apply original: 2140/2142 → +2 tests netos de esta ronda [4.8 + 4.12].)

`corepack pnpm lint` (== `eslint "src/**/*.ts"`): **exit 0, sin output.**
`corepack pnpm exec tsc --noEmit -p tsconfig.json`: **exit 0, sin output.**

### Archivos tocados
- `backend/src/tickets/application/use-cases/crear-observacion.use-case.ts` (+`Logger` import, +campo `logger`, try/catch en bloque post-commit, docstring actualizado)
- `backend/src/tickets/application/use-cases/crear-observacion.use-case.spec.ts` (+`Logger` import, +test 4.8)
- `backend/src/tickets/application/use-cases/transicionar-estado.use-case.ts` (+`Logger` import, +campo `logger`, try/catch en `publisher.publish()` post-commit)
- `backend/src/tickets/application/use-cases/transicionar-estado.use-case.spec.ts` (+`Logger` import, +test 4.12)

### No tocado (correcto, fuera de scope de esta ronda)
- Ningún cambio de lógica de negocio dentro de `txRunner.run()` en ninguno de los 2 use cases — la atomicidad no se tocó, solo se agregó el guard post-commit.
- `clienteId`/`TenantContext` (backlog arriba) — sin cambios.
- Ningún otro archivo del change.

### Git
Branch `notif-email-estado-ticket-pr4` (sin cambiar). Commit(s) conventional de esta ronda, sin Co-Authored-By. **Sin push, sin PR** — gateado por el usuario.

### Cómo retomar
Judgment Day PR4 Ronda 1 cerrada. Decidir: (a) correr Ronda 2 de jueces sobre estos fixes (mismo patrón que PR2/PR3); (b) dar por aprobado PR4 y avanzar a `sdd-verify`/`sdd-archive`; (c) decidir push/PR de la cadena completa (PR1-PR4).

---

## Judgment Day — PR4 — fixes Ronda 2 (2026-07-30)

**Veredicto de los 2 jueces:** cero CRITICAL. 3 WARNING reales confirmados (puerto `ILogger`, PII+stack en el log, cobertura del reject de `publisher.publish`), 1 SUGGESTION (docstring parity). El fix de Ronda 1 (guard post-commit try/catch) era funcionalmente correcto — atomicidad intacta, `Result.ok` preservado — pero había introducido un `new Logger()` de `@nestjs/common` DIRECTO en `application/`, violando la dependency rule NON-NEGOTIABLE de `clean-arch/SKILL.md`.

### Corrección de la justificación errónea de Ronda 1
La nota de Ronda 1 (fix 1) justificaba el `new Logger(CrearObservacionUseCase.name)` citando "mismo patrón que `NotificarCambioEstadoListener`". Ese precedente era incorrecto: `NotificarCambioEstadoListener` vive en `tickets/infrastructure/events/` (infra), donde importar `@nestjs/common` Logger directo SÍ es válido — la dependency rule permite `infrastructure/` → framework. `CrearObservacionUseCase`/`TransicionarEstadoUseCase` viven en `tickets/application/use-cases/` (application), donde NO. El precedente citado nunca aplicaba a la capa donde se usó. Se resuelve con el puerto `ILogger` (abajo).

### Fixes aplicados

1. **[WARNING real, confirmado 2 jueces] Puerto `ILogger`.**
   - Nuevo `backend/src/shared/domain/ports/i-logger.port.ts`: interfaz `ILogger` (mínima — solo `error(message: string, stack?: string): void`, lo único que los 2 use cases necesitan) + token `LOGGER = Symbol('LOGGER')`. Mismo patrón exacto que `IDomainEventPublisher`/`DOMAIN_EVENT_PUBLISHER`.
   - Nuevo `backend/src/shared/infrastructure/logging/nest-logger.adapter.ts`: `NestLoggerAdapter implements ILogger`, envuelve `new Logger('Application')` de `@nestjs/common` — ÚNICO punto donde `application/` toca el framework de logging, y lo toca indirectamente vía el puerto. Contexto fijo `'Application'` (singleton global, no hay contexto por-clase como antes — los mensajes ya incluyen el `ticketId` en el texto, así que no se pierde trazabilidad real).
   - `shared.module.ts`: provider `{ provide: LOGGER, useClass: NestLoggerAdapter }` + export, `@Global()` (mismo patrón que `DOMAIN_EVENT_PUBLISHER`).
   - `crear-observacion.use-case.ts`/`transicionar-estado.use-case.ts`: eliminado `import { Logger } from '@nestjs/common'` y `new Logger(...)`; `logger: ILogger` agregado como ÚLTIMO parámetro del constructor (plain class, sin `@Injectable()`/`@Inject()` — mismo patrón que `publisher: IDomainEventPublisher`, wireado vía `useFactory`+`inject` en el módulo, NO decorators, consistente con `nestjs-modules/SKILL.md` "use cases NO usan decorators NestJS").
   - `tickets.module.ts`: `LOGGER` agregado al `inject` de ambos use cases (último elemento del array, mismo orden que el parámetro del constructor).
   - Verificado con grep: cero imports de `@nestjs/common`/infra en ninguno de los 2 use cases (solo quedan menciones en comentarios explicando la regla).
   - Tests: stub tipado `const logger: vi.Mocked<ILogger> = { error: vi.fn() }` en ambos specs — CERO casts (`as any`/`as unknown as`).

2. **[WARNING real] PII enmascarada + stack en el log del catch.**
   - Ambos catch post-commit: `err.message` pasa por `maskEmailsInText()` (`tickets/domain/mask-email-like.ts`) antes de loguearse — mismo patrón que `NotificarCambioEstadoListener` (PR3 Ronda 2). `err.stack` se pasa como 2do argumento (`logger.error(mensaje, stack)`) — frames de código, bajo riesgo de PII, mejora la debuggabilidad del fallo post-commit.
   - Tests RED→GREEN nuevos en ambos specs: error con un email embebido en el mensaje (`'... contactar admin@dbhost.internal'`) → asserta que el mensaje logueado NO contiene el email crudo, SÍ contiene la forma enmascarada (`a***@dbhost.internal`), y que el 2do argumento es exactamente `error.stack`.

3. **[WARNING real] Cobertura faltante: `publisher.publish` que lanza en `crear-observacion`.**
   - El try post-commit de `CrearObservacionUseCase` guarda DOS fallos posibles (`findCodigoById` Y `publisher.publish`), pero solo el primero tenía test (4.8, Ronda 1). Nuevo test: `findCodigoById` resuelve un código válido y `publisher.publish` LANZA sincrónicamente (D10 — `publish(): void`, no async, así que "lanza", no "rechaza") → `execute()` sigue devolviendo `Result.ok` del ticket ya committeado, `ticketRepo.save`/`operacionRepo.save` NO se re-invocan, `logger.error` llamado exactamente 1 vez.

4. **[SUGGESTION] Docstring parity.**
   - `transicionar-estado.use-case.ts`: agregado el párrafo que espeja el de `crear-observacion` — distingue explícitamente errores DENTRO de `txRunner.run()` (burbujean, rollback nativo, sin cambios) de errores POST-commit del `publisher.publish()` (try/catch, log-and-swallow, `Result.ok` preservado). Ambos docstrings mencionan ahora que el logueo va vía el puerto `ILogger`, no `@nestjs/common` Logger directo.

### Archivos creados
- `backend/src/shared/domain/ports/i-logger.port.ts`
- `backend/src/shared/infrastructure/logging/nest-logger.adapter.ts`

### Archivos modificados
- `backend/src/shared/shared.module.ts` (+provider/export `LOGGER`)
- `backend/src/tickets/tickets.module.ts` (+`LOGGER` en `inject` de ambos use cases)
- `backend/src/tickets/application/use-cases/crear-observacion.use-case.ts` (puerto `ILogger`, masking+stack, docstring)
- `backend/src/tickets/application/use-cases/crear-observacion.use-case.spec.ts` (stub `ILogger`, +2 tests)
- `backend/src/tickets/application/use-cases/transicionar-estado.use-case.ts` (puerto `ILogger`, masking+stack, docstring parity)
- `backend/src/tickets/application/use-cases/transicionar-estado.use-case.spec.ts` (stub `ILogger`, +1 test)
- `backend/src/tickets/application/use-cases/ticket-estado-cambiado-forma-identica.spec.ts` (stub `ILogger` en ambas instanciaciones directas — sin tocar aserciones)

### No tocado (correcto, fuera de scope de esta ronda)
- Ningún cambio de lógica transaccional ni de guards de negocio dentro de `txRunner.run()` en ninguno de los 2 use cases — atomicidad intacta.
- `clienteId`/`TenantContext` (backlog Ronda 1) — sin cambios.

### Evidencia real (backend/, 2026-07-30, corrida serial FOREGROUND)

**Suites aisladas (anti-regresión explícita):**
```
corepack pnpm exec vitest run src/tickets/application/use-cases/crear-observacion.use-case.spec.ts src/tickets/application/use-cases/transicionar-estado.use-case.spec.ts
Test Files  2 passed (2)
     Tests  81 passed (81)
```
(25 preexistentes `crear-observacion` [24 + 4.8 de Ronda 1] + 2 nuevos = 27; 54 preexistentes `transicionar-estado` [53 + 4.12 de Ronda 1] + 1 nuevo = 54. Total 81.)

**Suite completa `pnpm test`:**
```
Test Files  160 passed | 1 skipped (161)
     Tests  2145 passed | 2 skipped (2147)
   Duration  ~168-170s
```
(vs. Ronda 1: 2142 → 2145, +3 tests netos de esta ronda.)

`corepack pnpm lint`: 1 error de formato `prettier/prettier` detectado (indentación multilinea en `transicionar-estado.use-case.spec.ts`), corregido con `eslint --fix`; **exit 0, sin output** en la corrida final. Re-corrida completa de `pnpm test` tras el fix confirmó los mismos 2145/2147 — el auto-fix no cambió comportamiento, solo formato.

`corepack pnpm exec tsc --noEmit -p tsconfig.json`: **exit 0, sin output.**

### Git
Branch `notif-email-estado-ticket-pr4` (sin cambiar). Commit(s) conventional de esta ronda, sin Co-Authored-By. **Sin push, sin PR** — gateado por el usuario.

### Cómo retomar
Judgment Day PR4 Ronda 2 cerrada. Decidir: (a) correr Ronda 3 de jueces (mismo patrón que PR2/PR3); (b) dar por aprobado PR4 y avanzar a `sdd-verify`/`sdd-archive`; (c) decidir push/PR de la cadena completa (PR1-PR4).
