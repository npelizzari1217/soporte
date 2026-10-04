```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:cf552f1625247d452235870d200bc05296bd2ff285feef4b6c5157f6f3b6df1c
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 21/21
scenarios: 57/57
test_command: cd backend && pnpm test
test_exit_code: 0
test_output_hash: sha256:9569753f69f2f704d3879c091b72ce67c19d98aca4bef23513f6098f2bfcca07
build_command: cd backend && pnpm typecheck && pnpm lint
build_exit_code: 0
build_output_hash: sha256:42cb804fe1f22859c73ca2244d92fde1db5b7a9f33ecddd8332f3d8182524c11
```

## Verification Report

**Change**: formulario-publico-qr
**Version**: N/A (delta specs: formulario-publico-cliente, equipos-qr, solicitante-externo, pedido-publico)
**Mode**: Standard (feature; Strict TDD not active)
**Candidate**: branch `feat/formulario-publico-qr-wu19c`, HEAD `6513eb4c`, diff `git diff main...HEAD` (merge base `fcbba1c1`), 204 files, +13931/-99. `evidence_revision` is the sha256 of that diff.

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 71 |
| Tasks complete | 71 |
| Tasks incomplete | 0 |

`gentle-ai sdd-status formulario-publico-qr`: `apply: all_done`, `verify: ready`, tasks 71/71. Every WU section in `apply-progress.md` (WU-1 to WU-19) matches a file in the diff.

### Build & Tests Execution

**Build**: Passed

```text
backend  pnpm lint                          exit 0  (eslint ., zero errors)
backend  pnpm typecheck                     exit 0
backend  pnpm typecheck && pnpm lint        exit 0  (build_command from openspec/config.yaml)
frontend JWT_SECRET=dummy pnpm lint         exit 0  (No ESLint warnings or errors)
frontend pnpm type-check                    exit 0
root     node scripts/check-casts-en-specs.mjs   exit 0  (627 in 116 files, base 627/116; ratchet holds)
root     node scripts/check-roadmap-fresco.mjs   exit 0  ("El roadmap esta fresco"; 3 decisions declared)
```

**Tests**: Passed (0 failed, 0 skipped)

```text
backend  pnpm test                                              exit 0  581 files, 7231 tests passed (997 s)
backend  pnpm vitest run src/publico src/equipos src/tickets \
           src/notificaciones src/csat src/clientes             exit 0  204 files, 2089 tests passed
frontend pnpm test                                              exit 0  239 files, 1901 tests passed
```

The Postgres container was up. There were no `PrismaClientKnownRequestError` failures, so no `migrate status` diagnosis was needed. The ERROR lines in the backend log come from forced-failure tests (`[e2e-forced-failure]`, `CORREO_CLIENTE_ERROR` with a fake sender). They are expected.

**Adversarial mutation** (`rules.verify`). It was run on an isolated `git archive` copy in a scratch directory, and the worktree was not touched:

| Mutation | Result | After revert |
|---|---|---|
| `ResolverClientePublicoService`: drop the `!cliente.formularioPublicoHabilitado` filter | RED: 2 tests ("formulario deshabilitado", "mensajes identicos entre motivos") | GREEN, 29/29 |
| `ConfirmarPedidoPublicoUseCase`: drop the `token.clienteId !== cliente.id` check | RED: "token de otro cliente sobre este slug es 404 sin abrir transaccion" | GREEN, 29/29 |

These add to the mutations the apply phase already recorded: the WU-14 sentinel, the WU-17 route order and the WU-19 AppModule registration.

**Coverage**: Not run (threshold 0 in config).

### Spec Compliance Matrix

#### formulario-publico-cliente (4 requirements, 15 scenarios)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Slug cargado por ROOT (D7) | ROOT carga el slug | `clientes/interface/controllers/formulario-publico.e2e.spec.ts` (ROOT 200) | COMPLIANT |
| Slug cargado por ROOT (D7) | ADMINISTRADOR intenta cargar el slug | `formulario-publico.e2e.spec.ts` (ADMIN 403) | COMPLIANT |
| Slug cargado por ROOT (D7) | Slug duplicado o con formato invalido | `formulario-publico.e2e.spec.ts` (409 duplicado, 400 formato/UUID/dbName); `slug-cliente` VO unit | COMPLIANT |
| Slug inmutable tras el primer QR (D7) | Cambio de slug con QR emitido | `formulario-publico.e2e.spec.ts` (409 congelado); `prisma-cliente.repository.integration.spec.ts` (CAS) | COMPLIANT |
| Slug inmutable tras el primer QR (D7) | Cambio de slug sin QR emitido | `configurar-formulario-publico.use-case.spec.ts`; repo integration `cambiarSlugSiNoCongelado` | COMPLIANT |
| Apagado por defecto, solo ROOT (D12) | Cliente nuevo | `cliente.entity.spec.ts`; `formulario-publico.e2e.spec.ts:127` | COMPLIANT |
| Apagado por defecto, solo ROOT (D12) | Cliente existente tras la migracion | `prisma-cliente.repository.integration.spec.ts:56` (DB default false) | COMPLIANT |
| Apagado por defecto, solo ROOT (D12) | ADMINISTRADOR intenta habilitar | `formulario-publico.e2e.spec.ts` (403, state unchanged) | COMPLIANT |
| Apagado por defecto, solo ROOT (D12) | ROOT habilita | `formulario-publico.e2e.spec.ts` (200) | COMPLIANT |
| Apagado por defecto, solo ROOT (D12) | No se puede habilitar sin slug | `formulario-publico.e2e.spec.ts` (409 SLUG_REQUERIDO) | COMPLIANT |
| Sin correo solo acepta sesion (D3) | Anonimo en cliente sin correo | `pedido-publico-contexto.e2e.spec.ts` > "correo sin configurar responde SESION"; FE `pedido-publico-view.test.tsx` (redirect to `/login?siguiente=`) | COMPLIANT |
| Sin correo solo acepta sesion (D3) | Usuario registrado con sesion llega por QR | FE `destino-pos-login.test.ts`, `use-login.test.tsx`, `middleware.test.ts`, landing + dialog tests; BE `resolver-qr-autenticado.e2e.spec.ts` | COMPLIANT |
| Sin correo solo acepta sesion (D3) | Intento de pedido anonimo por la API | `pedido-publico-solicitud.e2e.spec.ts` > "correo sin LISTO: 404 uniforme, no escribe PII" | COMPLIANT |
| Sin correo solo acepta sesion (D3) | Cliente con correo listo | `pedido-publico-contexto.e2e.spec.ts` > "correo LISTO responde EXTERNO"; FE view test | COMPLIANT |
| Sin correo solo acepta sesion (D3) | El correo se pierde despues de habilitar | `pedido-publico-contexto.e2e.spec.ts` (SESION for an enabled client without SMTP; `estado()` is read on every request, with no cache) | COMPLIANT |

#### equipos-qr (4 requirements, 8 scenarios)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Un QR por equipo, token opaco (D8) | Emision del QR | `emitir-qr-equipo.e2e.spec.ts` (201, only hash in DB); UC unit (128 bits, not the id) | COMPLIANT |
| Un QR por equipo, token opaco (D8) | Sin sesion o sin permiso | `emitir-qr-equipo.e2e.spec.ts` (401, 403 without freezing) | COMPLIANT |
| Un QR por equipo, token opaco (D8) | Emision sin slug | `emitir-qr-equipo.e2e.spec.ts` (409 `QR_REQUIERE_SLUG`) | COMPLIANT |
| Regeneracion invalida el anterior (D8) | Regenerar tras extravio | `emitir-qr-equipo.e2e.spec.ts` (regeneration); `prisma-equipo-informatico.qr.integration.spec.ts` (old hash resolves to nothing) | COMPLIANT |
| Resolucion solo en el cliente del slug (D8) | Token de otro cliente | `pedido-publico-contexto.e2e.spec.ts` > "token de B sobre el slug de A es byte a byte igual a uno inexistente" | COMPLIANT |
| Resolucion solo en el cliente del slug (D8) | Token valido del propio cliente | `pedido-publico-contexto.e2e.spec.ts` > "devuelve solo los nombres" | COMPLIANT |
| Baja abre sin equipo (D8) | Escaneo de un equipo dado de baja | `pedido-publico-contexto.e2e.spec.ts` > "baja o borrado abre sin equipo" | COMPLIANT |
| Baja abre sin equipo (D8) | Baja entre la apertura y la confirmacion | `baja-equipo.concurrencia.integration.spec.ts` case (e2); `crear-ticket-soporte.use-case.spec.ts` (`OMITIR`) | COMPLIANT |

#### solicitante-externo (5 requirements, 13 scenarios)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| El externo vive en el tenant (D2) | Alta de un externo | `confirmar-pedido-publico.use-case.integration.spec.ts` (externo in tenant); `crear-ticket-soporte.use-case.spec.ts` ("externo sin consulta a master") | COMPLIANT (combined evidence: the confirm path has no Usuario/Membresia port; no test directly asserts that no master row appears, see W1) |
| El externo vive en el tenant (D2) | Mismo email en dos clientes | `prisma-solicitante-externo.repository.integration.spec.ts` (A/B isolation, one row per request) | COMPLIANT |
| Exactamente un solicitante (D2) | Ticket con ambos o ninguno | `tickets-solicitante-externo.integration.spec.ts` (CHECK, also on UPDATE) | COMPLIANT |
| Exactamente un solicitante (D2) | Ticket existente | `tickets-solicitante-externo.integration.spec.ts` (old rows intact) | COMPLIANT |
| Lectores toleran nulo (D2) | Listado con ticket externo | `tickets.controller.spec.ts` > "listado con externo y registrado mezclados" / "detalle de un ticket externo" | COMPLIANT |
| Lectores toleran nulo (D2) | Detalle sin telefono | `tickets.controller.spec.ts` > "externo sin telefono"; FE `ticket-header` test | COMPLIANT |
| Notificaciones al externo (D5) | Numero del ticket | `pedido-publico-confirmar.e2e.spec.ts` (mail with number); `pedido-publico-flujo.e2e.spec.ts` | COMPLIANT |
| Notificaciones al externo (D5) | Cambio de estado | `ticket-notificacion.listener.spec.ts:93` | COMPLIANT |
| Notificaciones al externo (D5) | Comentario publico e interno | `ticket-notificacion.listener.spec.ts:211`, `:235` | COMPLIANT |
| Notificaciones al externo (D5) | Encuesta CSAT | `ticket-csat.listener.spec.ts:110` | COMPLIANT |
| Notificaciones al externo (D5) | CSAT deshabilitado | `ticket-csat.listener.spec.ts:154` (the `csatHabilitado` check runs before contact resolution, `ticket-csat.listener.ts:77-86`) | COMPLIANT |
| Retencion (D11) | Datos mientras exista el ticket | `tickets-solicitante-externo.integration.spec.ts` (FK RESTRICT); no delete path exists | COMPLIANT |
| Retencion (D11) | Retencion anotada | Manual evidence: PR #311 body mentions D11; migration and `schema.prisma` comments | COMPLIANT (documentary scenario) |

#### pedido-publico (8 requirements, 21 scenarios)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Link de un solo uso (D1) | Envio del pedido | `pedido-publico-solicitud.e2e.spec.ts` > "202 constante: PII solo en el tenant, master solo el hash, sale el mail" | COMPLIANT |
| Link de un solo uso (D1) | Confirmacion del link | `pedido-publico-flujo.e2e.spec.ts` (real link from the mail, one ticket) | COMPLIANT |
| Link de un solo uso (D1) | Link reutilizado, vencido o revocado | `pedido-publico-confirmar.e2e.spec.ts` (used, expired); `pedido-publico-token.entity.spec.ts:52` (revoked is not vigente) | COMPLIANT |
| Link de un solo uso (D1) | Doble confirmacion concurrente | `confirmar-pedido-publico.use-case.integration.spec.ts` > "Promise.all ... un ticket y un 404" | COMPLIANT |
| Link de un solo uso (D1) | Token en claro | `pedido-publico-solicitud.e2e.spec.ts` (hash only, raw token not in the row) | COMPLIANT |
| Pedido autenticado sin correo (D3) | Usuario con sesion crea el ticket con el equipo precargado | `resolver-qr-autenticado.e2e.spec.ts` (200 with equipo); FE landing + `ticket-soporte-create-dialog` tests (`equipoInicial`) | COMPLIANT |
| Pedido autenticado sin correo (D3) | Sesion de otro cliente | `resolver-qr-autenticado.e2e.spec.ts` (foreign slug 404, equipo not revealed); landing test (otra organizacion) | COMPLIANT |
| Nace en NUEVO (D4) | Estado inicial | `confirmar-pedido-publico.use-case.integration.spec.ts` (real `CrearTicketSoporteUseCase`; the only seeded estado is NUEVO; creation event published once) | COMPLIANT |
| Nace en NUEVO (D4) | Sin ciclo activo | `confirmar-pedido-publico.use-case.integration.spec.ts` (409, no ticket, pending intact, link still valid); `pedido-publico-confirmar.e2e.spec.ts` | COMPLIANT |
| SOPORTE y MEDIA fijos (D6) | Defaults | Integration: MEDIA asserted; SOPORTE is the only seeded tipo, resolved by code inside the real use case | COMPLIANT |
| SOPORTE y MEDIA fijos (D6) | El visitante intenta elegir prioridad | `confirmar-pedido-publico.use-case.integration.spec.ts` > "prioridadId CRITICA se ignora y sale MEDIA" | COMPLIANT |
| Limites anti-abuso (D10) | Cuarto pedido del mismo email | `pedido-publico-solicitud.e2e.spec.ts` > "el 4.o da 429 sin mail" | COMPLIANT |
| Limites anti-abuso (D10) | Cambiar el header de IP no elude el limite | same test (different XFF on each request) | COMPLIANT |
| Limites anti-abuso (D10) | Pedido 31 al cliente | `pedido-publico-solicitud.e2e.spec.ts` > "el pedido 31 al cliente da 429" | COMPLIANT |
| Limites anti-abuso (D10) | Otro cliente no se ve afectado | same test | COMPLIANT |
| 404 uniforme | Slug inexistente | `pedido-publico-contexto.e2e.spec.ts`; `app-module.registro.e2e.spec.ts` (real AppModule) | COMPLIANT |
| 404 uniforme | Deshabilitado e inactivo indistinguibles | `pedido-publico-contexto.e2e.spec.ts` > "inexistente, deshabilitado, inactivo, borrado y mal formado responden identico" (status, body and headers without `Date`) | COMPLIANT |
| Tenant desde la fila master | Cliente inyectado en el cuerpo | `pedido-publico-confirmar.e2e.spec.ts` > "crea el ticket en el tenant del slug aunque el body traiga un clienteId ajeno" | COMPLIANT |
| Tenant desde la fila master | Dos tenants con guards reales (equipo token of B on A, then confirm) | `pedido-publico-contexto.e2e.spec.ts` (B token on A gives `equipo: null`); `pedido-publico-solicitud.e2e.spec.ts` (a token not in the bound tenant gives `equipoId` null); `prisma-equipo-informatico.qr.integration.spec.ts` (A/B isolation); `pedido-publico-confirmar.e2e.spec.ts` (ticket only in A) | COMPLIANT (combined evidence; no single e2e, see W1) |
| Tenant desde la fila master | Cliente inactivo | `pedido-publico-confirmar.e2e.spec.ts` > "cliente inactivo da 404 y no crea el ticket" | COMPLIANT |
| Validacion de contenido | Descripcion excesiva | `pedido-pendiente.entity.spec.ts:45` (4001 chars rejected); `solicitar-pedido-publico.use-case.spec.ts` (invalid data: no write, no mail); `pedido-publico-solicitud.e2e.spec.ts` (HTTP 400 without writes); FE `schemas.test.ts:52` | COMPLIANT (combined evidence; the DTO `@MaxLength` branch itself is not exercised, see W1) |

**Compliance summary**: 57/57 scenarios compliant, 0 failing, 0 untested. 54 have direct runtime tests; 3 (marked "combined evidence") are proven by several passing tests together rather than by one end-to-end test (W1). 21/21 requirements covered.

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|---|---|---|
| D7 slug ROOT + freeze | Implemented | `SlugCliente`, `ClienteEntity.configurarSlug`, CAS `congelarSlug`/`cambiarSlugSiNoCongelado`, DB CHECK |
| D12 off by default | Implemented | DB default false, entity `?? false`, `GlobalAdminGuard` + inline `isGlobalAdmin` check |
| D3 mode from `estado()` | Implemented | `ConsultarContextoPedidoUseCase`: LISTO is EXTERNO, anything else is SESION; solicitud and confirmar return 404 unless LISTO |
| D8 QR | Implemented | `randomBytes(16)` base64url, sha256 stored, URL built from `APP_BASE_URL`, lookup only in the bound tenant |
| D2 externo | Implemented | tenant table, CHECK `tickets_solicitante_exactamente_uno`, no master writes in the confirm path |
| D5 notifications | Implemented | `IContactoSolicitanteResolver`, templates with `sinLink` for externos |
| D1/D4/D6 confirm | Implemented | `DELETE ... RETURNING` inside `txRunner.run`, rollback sentinel, MEDIA by code, `OMITIR` |
| D10 throttling | Implemented | `email` `${slug}:${email}` (no XFF), `cliente` slug, `confirmacion` sha256(token), `contexto` `${xff}:${slug}` |
| Uniform 404 | Implemented | single `FormularioPublicoNoDisponibleError` with a fixed message (`pedido-publico.controller.ts`) |
| Tenant from master row | Implemented | `ResolverClientePublicoService` binds with the master row `dbName`/`id` only; DTOs carry no tenant fields (`whitelist: true`) |
| Content validation | Implemented | DTO limits mirror `PedidoPendienteEntity`; React escaping, templates use `escaparHtml` |

### Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| ADR-1 D3 from `estado()` | Yes | resolver filters run first, then `estado()` |
| ADR-2 slug required; freeze before writing the hash | Yes | equipo and slug are validated before the CAS, so a missing equipo never freezes the slug |
| ADR-3 `equipoInvalido` policy | Yes | `OMITIR` keeps `FOR SHARE` |
| ADR-4 ignore client-sent ids | Yes | |
| ADR-5 invalid QR on a valid slug | Yes | `equipo: null`, byte-identical |
| ADR-6 nullable + CHECK | Yes | |
| ADR-7 token master / pending tenant | Yes | Write order in solicitud (pending, then token) is not stated in ADR-7; see W2 |
| ADR-8 throttling | Yes | `contexto` uses XFF as ADR-8 states; the "behind the BFF" rationale is only in code, see S1. Trackers have no unit tests (design Testing Strategy lists them); e2e covers them, see S2 |
| ADR-9 routes and D3 path | Yes | `@Get('qr')` before `@Get(':ticketId')`; allowlist `destinoPosLogin` |
| ADR-10 `uqr` | Yes | MIT, 0 deps; lockfile change noted for deploy |
| ADR-11 copy | Yes | |
| ADR-12 gradual exposure | Yes | registered in WU-19 (`app.module.ts`), real-AppModule e2e |

### Orchestrator concerns

1. **XFF in the `contexto` tracker**: ACCEPTED BY DESIGN, with a documentation gap. ADR-8 explicitly sets the `contexto` tracker to `${xff}:${slug}` (modeled on `csat-throttler.guard.ts`) and says it "solo frena enumeracion; no protege una escritura". The spec forbids XFF only for the email limit, and the `email`, `cliente` and `confirmacion` trackers do not use it (tested: rotating XFF does not grant new quota). However, **the design never mentions the BFF**. The "behind the BFF, the slug separates quotas and XFF is only a spoofable discriminator" rationale lives only in the guard JSDoc and in the BFF route comment (CSAT ADR-C6). The BFF forwards the client-supplied `x-forwarded-for` verbatim for `publico/*`, so rotating it gets a fresh `contexto` quota. Enumeration throttling on `contexto` can therefore be bypassed. This is an accepted, low-impact limitation: enabled slugs are public by nature, and disabled and nonexistent slugs are indistinguishable. See S1.
2. **Non-atomic pending (tenant) then token (master) in solicitud**: ACCEPTABLE UNDER THE DESIGN, but the premise "purged at expiry" is inaccurate. If the master write fails, the request returns 500, and the orphan pending row can never be confirmed: no token points to it, and confirm returns 404. The reverse order would also be safe, because a token without a pending row gives 404 on `consumir`. ADR-7 does not discuss the order, but it accepts its consequence. The purge is `DELETE ... WHERE expires_at < now()` and runs **only at the next solicitud in the same tenant** (there is no scheduler). So an orphan, like any unconfirmed pending row, keeps its PII until a later request arrives in that tenant. If the client never gets another request, or ROOT disables the form, it stays forever. See W2.
3. **BFF forwards `publico/*` without a session**: CORRECT. `frontend/src/app/api/[...path]/route.ts` is unchanged generic code. It adds `Authorization` only when the `at` cookie exists, and forwards XFF only for `publico/`. Its existing tests cover a no-cookie forward and a `publico/` GET. The middleware matcher excludes `/api`, so `/api/publico/...` is never redirected to `/login`. The hook paths (`publico/c/${slug}/pedido/{contexto,solicitud,confirmar}`, `soporte/qr`) match the backend controllers exactly. The backend end of the chain is proven by a real-AppModule e2e. What remains unproven is only browser -> Next -> Nest in one run; no Playwright smoke exists. See S3.
4. **WU-18 follow-ups** (all out of spec scope; none is a spec violation):
   - (a) An unauthenticated direct visit to `/pedido-qr` goes through the generic protected redirect to `/login` without `siguiente`. The QR always points to `/c/<slug>/pedido`, which does carry `siguiente`, so the spec path works. SUGGESTION S4.
   - (b) `useResolverQr` has no `enabled` guard. A missing `c` produces a backend 404, and the landing then shows "otra organizacion", which is misleading. A missing `e` is the legitimate "form without equipment" path (`equipo: null`) and is correct. SUGGESTION S4.
   - (c) The page is bare after the dialog closes. This is UX only. SUGGESTION S4.
5. **Cross-tenant isolation**: HOLDS.
   - `contexto`, `solicitud` and `confirmar` all bind the tenant only from the master row of the slug (`ResolverClientePublicoService`).
   - The QR token is looked up only in that tenant.
   - `confirmar` additionally requires `token.clienteId === cliente.id`.
   - `GET /soporte/qr` compares the session client's slug with `c` and resolves the token in the session tenant only.
   - Tests: contexto e2e (B token on A is byte-identical to a nonexistent one), confirmar e2e (body `clienteId`/`dbName` of B writes only in A; B token on A gives the same 404), and resolver-qr e2e (foreign slug 404).
   - Mutating the token/client check goes red (this report).
   - Residual gap: scenario "Dos tenants" is proven only by combined evidence (W1).
6. **Uniform 404**: HOLDS for every spec-listed reason. On `contexto`, a nonexistent, disabled, inactive, deleted or malformed slug gives the same status, body and headers (without `Date`). `solicitud` without LISTO returns the same text as a nonexistent slug. On `confirmar`, a nonexistent, used, expired, revoked or foreign token, an inactive client and a slug mismatch all get the same fixed message. The non-404 outcomes are by design and do not enumerate:
   - 400 from DTO validation runs before slug resolution and is slug-independent.
   - 409 for no active cycle needs a valid token.
   - 429 throttling: a nonexistent slug has its own counter.
   - The post-resolution 400 for `PedidoPendienteInvalidoError` is reachable only if the DTO passes and the entity rejects. Even then it reveals no more than `contexto` already does for enabled clients.
7. **`FormularioPublicoModule` registration, off by default**: CONFIRMED. It is registered in `backend/src/app.module.ts` (WU-19), and `app-module.registro.e2e.spec.ts` boots the real AppModule: the public routes return the uniform 404 without a session, not "Cannot GET" and not 401. The form is off by default in the DB (`formulario_publico_habilitado BOOLEAN NOT NULL DEFAULT false`), in the entity (`?? false`) and in the tests. Nit: the module JSDoc still says it is "NO esta registrado en AppModule todavia" (S5).

### Roadmap declaration ("Segunda etapa, punto 1", `docs/roadmap-comercial.md:660-699`)

The declaration **Cumplida** is **TRUE**. Each of the 13 bullets is implemented in the delivered code:

| # | Bullet | Verdict | Evidence |
|---|---|---|---|
| 1 | Anyone can request; ticket only on single-use mail link | Met | solicitud creates no ticket; confirm `DELETE ... RETURNING`; flow e2e |
| 2 | External requester in the client DB, no `Usuario`/`Membresia` | Met (test evidence partial) | tenant table; confirm path never touches master users. No test asserts the absence (W1) |
| 3 | No mail: only registered users with a session; login then ticket with equipment loaded | Met | SESION mode; `destinoPosLogin`; `/pedido-qr` landing with `equipoInicial` |
| 4 | Directly NUEVO, no moderation | Met | real `CrearTicketSoporteUseCase` |
| 5 | Number, status changes, public comments, CSAT by mail; no tracking page | Met | listeners + `templatePedidoCreado`; no tracking route exists |
| 6 | Link expires at 24 h | Met | `PEDIDO_PUBLICO_TTL_MS = 24h`; entity tests; expired gives 404 in the e2e |
| 7 | SOPORTE and MEDIA fixed | Met | MEDIA by code; SOPORTE by the use case; client values ignored |
| 8 | Slug loaded by ROOT, immutable after the first QR | Met | GlobalAdminGuard + CAS freeze |
| 9 | One QR per equipment, opaque regenerable token, decommissioned opens without equipment, no batch printing | Met | |
| 10 | No attachments | Met | DTO has no multipart |
| 11 | 3 per mail per 15 min per client; 30 per client per hour; generic message | Met | throttlers; FE copy "Espera unos minutos y volve a intentar" is the same for both limits |
| 12 | Data retained while the ticket exists; retention noted for review | Met | FK RESTRICT, no delete path; PR #311, migration, schema |
| 13 | Off by default, enabled by ROOT like CSAT | Met | |

Nuance: the declaration says the bullets are "probadas". For bullet 2 the test evidence is indirect (W1), but there is no deviation. Also, the whole "Decisiones de producto de la segunda etapa" section was written on this branch (commit `b7365b93`, before any code), so it reaches `main` together with the tracker. `check-roadmap-fresco.mjs` passes. It enforces only the existence of declarations for first-stage points; this second-stage declaration was added under the `soporte/CLAUDE.md` rule.

### Issues Found

**CRITICAL**: None.

**WARNING**:
- W1. Three spec scenarios are proven only by combined evidence: several passing tests cover them, but no single test proves each one end to end:
  - (a) solicitante-externo "Alta de un externo": no assertion that no `Usuario`/`Membresia` is created.
  - (b) pedido-publico "Dos tenants con guards reales": there is no single e2e for solicitud with a token from B followed by confirm.
  - (c) pedido-publico "Descripcion excesiva": the HTTP 400 without mail is tested only with an invalid email; the 4001-character limit is tested at entity level.
  Code inspection shows the behavior is correct in all three. Each deserves one direct test.
- W2. PII in unconfirmed or orphan `pedidos_publicos_pendientes` rows is purged only by the next solicitud in the same tenant, not when the row expires. A tenant with no further requests, or with the form disabled, keeps that PII indefinitely. This applies to the orphan rows from a failed master write (concern 2) and to every unconfirmed request. ADR-7 accepts "no scheduler", but nobody has registered the retention consequence. Recommend adding it to the D11 retention review.

**SUGGESTION**:
- S1. Add the BFF rationale for the `contexto` XFF tracker to ADR-8 (today it lives only in code), and state explicitly that rotating XFF bypasses the enumeration throttle.
- S2. Add unit tests for `trackerEmail`, `trackerCliente` and `trackerConfirmacion`. The design Testing Strategy lists "trackers" as unit; today only the e2e covers them.
- S3. Add one Playwright or real-process smoke for browser -> BFF -> backend on `publico/*`.
- S4. WU-18 UX follow-ups: keep `siguiente` on a direct unauthenticated `/pedido-qr` visit; add `enabled: Boolean(slug)` to `useResolverQr`; give the landing a fallback after the dialog closes.
- S5. Remove the stale "NO esta registrado en AppModule todavia" paragraph from the `FormularioPublicoModule` JSDoc (`backend/src/publico/formulario-publico.module.ts`), and the stale "El mail con el numero y la ruta llegan en la WU-15" line in `confirmar-pedido-publico.use-case.ts`.

### Verdict

PASS WITH WARNINGS

All 71 tasks are complete, and every gate is green: backend lint and typecheck, 7231/7231 backend tests, frontend lint and type-check, 1901/1901 frontend tests, the casts ratchet and roadmap freshness. Mutations of two central guards go red. All 57 scenarios are covered by passing tests (3 only by combined evidence), with no critical findings. The roadmap declaration "Cumplida" is true.
