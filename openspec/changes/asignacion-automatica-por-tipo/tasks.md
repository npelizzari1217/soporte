# Tasks: Asignación automática por tipo

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2.490 (8 WU, cada una ≤ 400; las más cargadas son WU-4 y WU-7 ~390, WU-2 ~380) |
| 400-line budget risk | Medium (total y por WU: WU-2, WU-4 y WU-7 rozan el tope); Low en las demás |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (WU-1) → PR2 → ... → PR8 (WU-8), un PR por WU, en el orden 1, 2, 3, 4, 5, 6, 7, 8 |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Medium

Modo estándar (feature, sin TDD estricto): los tests viajan en el mismo commit que el código; nunca se separa código de los tests que lo prueban. Los tests de la tabla "Invariantes que DEBEN tener test" del diseño son tareas explícitas, con su mutación donde el diseño la pide. No hay Threat Matrix aplicable (el diseño la declara N/A).

Si el diff real de una WU supera 400 líneas al implementar (riesgo en WU-2, WU-4 y WU-7), se parte en una costura limpia y cada mitad lleva su código con sus tests:
- WU-2 → 2a (`AUTOR_SISTEMA`, evento, evaluador ya en WU-1, resolver, `operacionesDeApertura` con sus unit) y 2b (`CrearTicketUseCase`, cableado en `TicketsModule`, integración).
- WU-4 → 4a (casos de uso `Listar` y `Configurar` con unit) y 4b (controller, DTOs, módulo, registro en `app.module.ts`, e2e).
- WU-7 → 7a (tipos, schemas, hooks, ítem del nav) y 7b (vista y página).
La partición se anota en el PR y en este archivo; las ramas pasan a `...-wuNNa` / `...-wuNNb` y el orden de la cadena se conserva.

Rama tracker: `feat/asignacion-automatica-por-tipo` (ya existe con los commits de planificación; solo ella mergea a `main`). El PR de la WU-1 apunta al tracker; el PR de cada WU apunta a la rama de la WU anterior de la cadena. Cada PR lleva diagrama de dependencia con 📍, inicio/fin, dependencias previas y fuera de alcance. El tracker PR queda en draft/no-merge hasta integrar toda la cadena.

Ramas por WU (base entre paréntesis):
- WU-1 `feat/asignacion-automatica-por-tipo-wu01` (tracker)
- WU-2 `feat/asignacion-automatica-por-tipo-wu02` (wu01)
- WU-3 `feat/asignacion-automatica-por-tipo-wu03` (wu02)
- WU-4 `feat/asignacion-automatica-por-tipo-wu04` (wu03)
- WU-5 `feat/asignacion-automatica-por-tipo-wu05` (wu04)
- WU-6 `feat/asignacion-automatica-por-tipo-wu06` (wu05)
- WU-7 `feat/asignacion-automatica-por-tipo-wu07` (wu06)
- WU-8 `feat/asignacion-automatica-por-tipo-wu08` (wu07)

Nota: las dependencias lógicas del diseño (p. ej. WU-4 solo depende de WU-1; WU-5 y WU-6 de WU-2; WU-8 de WU-5) son un subconjunto del orden lineal; la cadena es lineal por la regla de `feature-branch-chain`.

Verificación común por WU (lo que aplique): backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run <rutas>`; frontend `JWT_SECRET=dummy pnpm lint`, `pnpm type-check`, `pnpm test`; raíz `node scripts/check-casts-en-specs.mjs` (el ratchet no debe subir; las 3 altas suman un parámetro de constructor, así que los mocks de sus specs deben ser completos, sin casts). Specs de integración sobre bases de test compartidas: aplicar antes la migración tenant `20261009120000_reglas_asignacion` a `soporte_tenant_test` (una vez, desde la WU-1); buscar-o-crear las filas de catálogo y borrar solo lo que el spec creó; todo spec que trunca `soporte_master_test` llama `usarLockMasterTest()` (`src/testing/lock-master-test.ts`) antes de su `describe`. Tenant efímero: limpiar filas → `app.close()` → `dropDatabase`. Si la suite tira `PrismaClientKnownRequestError` masivo, comprobar primero la base (`pnpm prisma migrate status --schema prisma_tenant/schema.prisma`). El `pnpm test` completo del backend corre al menos en la última WU de backend (WU-6) y el del frontend en la WU-8.

Deuda de Ayuda (escritura suspendida desde 2026-09-07): anotar en el commit y en el cuerpo del PR de cada WU que cambie lo que el usuario ve o hace: WU-2 y WU-3 (asignación automática al crear, el ticket nace Asignado), WU-4 (la API; la pantalla va en WU-7), WU-5 (asignar a mano un Nuevo lo pasa a Asignado; un cerrado/cancelado ya no se reasigna), WU-6 (mail de asignación), WU-7 (pantalla "Asignación automática") y WU-8 (control de reasignación). Corregir solo un artículo existente que el cambio vuelva falso. Comentarios que pasan a ser falsos ("el sistema nunca auto-asigna") se reescriben en la WU que toca ese archivo (WU-5).

Despliegue: solo la cadena completa. Sin reglas cargadas el alta queda igual que hoy; lo que cambia desde el primer minuto es lo manual (bloqueo en terminales, `NUEVO → ASIGNADO`, mail en cada asignación).

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Migración tenant M1, Prisma, puerto/repo de reglas, evaluador de elegibilidad | PR 1 (base tracker) | `pnpm vitest run src/tickets/infrastructure/persistence/prisma/prisma-regla-asignacion.repository.integration.spec.ts src/tickets/application/services/elegibilidad-responsable-regla.spec.ts` | Integración sobre `soporte_tenant_test` (PK, upsert, cascada) | `rollback.sql` de M1; sin consumidores |
| 2 | `AUTOR_SISTEMA`, evento, resolver, `operacionesDeApertura`, `CrearTicketUseCase` (cubre preventivo) | PR 2 (base PR1) | `pnpm vitest run src/tickets src/preventivo` | Integración: alta con regla atómica y rollback; preventivo anidado | `CrearTicketUseCase` y cableado de `TicketsModule` |
| 3 | Soporte (incluye formulario público) y Edilicia, e2e por canal | PR 3 (base PR2) | `pnpm vitest run src/equipos src/reparaciones src/formulario-publico test` | e2e: un caso con regla por canal | Dos casos de uso y su cableado |
| 4 | Módulo `reglas-asignacion` (API de configuración) | PR 4 (base PR3) | `pnpm vitest run src/reglas-asignacion test` | e2e con guards reales (403, 404, 422, estados) | Módulo nuevo sin consumidores del frontend |
| 5 | Asignación manual: terminal, `NUEVO → ASIGNADO`, evento, comentarios | PR 5 (base PR4) | `pnpm vitest run src/tickets` | e2e: `/asignar` en `CERRADO` → 422 y en `NUEVO` → `ASIGNADO` | Dos casos de uso y mapeo 422 |
| 6 | Plantilla y listener de mail de asignación | PR 6 (base PR5) | `pnpm vitest run src/notificaciones` | N/A: unit con puertos mockeados | Listener y plantilla nuevos |
| 7 | Frontend: pantalla `/admin/reglas-asignacion` | PR 7 (base PR6) | frontend `pnpm vitest run src/features/reglas-asignacion src/components/shell` | N/A: Vitest + Testing Library + msw | Página, feature y un ítem del nav |
| 8 | Frontend: `TicketReasignarControl` | PR 8 (base PR7) | frontend `pnpm vitest run src/features/tickets` | N/A: Vitest + Testing Library + msw | Control nuevo y su montaje |

## WU-1 — Migración M1, puerto, repo y evaluador (~280 líneas)

Rama `feat/asignacion-automatica-por-tipo-wu01` → target `feat/asignacion-automatica-por-tipo` (tracker). Requerimientos: R7, R1 (una regla por tipo: PK), R2 (universo, evaluador).

- [x] 1.1 Migración tenant `backend/prisma_tenant/migrations/20261009120000_reglas_asignacion/migration.sql` con la tabla `reglas_asignacion` (`tipo_id` PK + FK a `tipos_ticket(id) ON DELETE CASCADE ON UPDATE CASCADE`, `responsable_id`, `actualizado_por`, `created_at`, `updated_at`; sin seed) y `rollback.sql` (`DROP TABLE IF EXISTS "reglas_asignacion";`). Cabecera y nombres de constraints como `20261006120000_respuestas_predefinidas`. (R7, R1)
- [x] 1.2 Actualizar `backend/prisma_tenant/schema.prisma`: `model ReglaAsignacion { … @@map("reglas_asignacion") }` y la back-relation opcional `reglaAsignacion ReglaAsignacion?` en `TipoTicket` (solo esquema: `TipoTicketEntity` y su mapper no cambian); regenerar el cliente. (R7)
- [x] 1.3 Puerto `backend/src/tickets/domain/ports/i-regla-asignacion.repository.ts` (tipo `ReglaAsignacion`, `findByTipoId`, `listar`, `fijar`, `quitar`, token `REGLA_ASIGNACION_REPOSITORY`). (R1)
- [x] 1.4 Test de integración `prisma-regla-asignacion.repository.integration.spec.ts`: PK única (una regla por tipo), `fijar` es upsert, FK con cascada al borrar el tipo, `quitar` idempotente, `findByTipoId` sin fila devuelve `null`. Aplicar M1 a `soporte_tenant_test` antes de correr; borrar solo lo creado. (R1, R7)
- [x] 1.5 Implementar `PrismaReglaAsignacionRepository` en `backend/src/tickets/infrastructure/persistence/prisma/` (único lugar con `@prisma/client`; `quitar` con `deleteMany`). (R1, R7)
- [x] 1.6 Test unit `elegibilidad-responsable-regla.spec.ts`: `esResponsableElegible` pura (id presente/ausente en la lista); `evaluarResponsableRegla` pide `listarTecnicosAsignables(clienteId, modulo)` y aplica la función pura; un ADMINISTRADOR que el checker no incluye → `false` (invariante P1). (R2)
- [x] 1.7 Crear `backend/src/tickets/application/services/elegibilidad-responsable-regla.ts` (`esResponsableElegible`, `evaluarResponsableRegla`) y sumar al JSDoc de `listarTecnicosAsignables` en `i-usuario-master.checker.ts` que también define el universo de responsables de regla. (R2)
- [x] 1.8 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run` de las rutas de la WU; raíz `node scripts/check-casts-en-specs.mjs`; confirmar M1 aplicada a `soporte_tenant_test` (`prisma migrate status` limpio).

## WU-2 — Resolver, apertura y alta de `CrearTicketUseCase` (~380 líneas)

Rama `feat/asignacion-automatica-por-tipo-wu02` → target `feat/asignacion-automatica-por-tipo-wu01`. Requerimientos: A1, A2, A3, A4, A5, A7, A8, A9, A6 (canales `POST /tickets` y barrido de preventivos), N1 (alta con regla).

- [x] 2.1 Test unit del resolver (tabla de ADR-2) `resolver-asignacion-automatica.service.spec.ts`: tipo borrado o inactivo → `null`; sin fila → `null` sin tocar master; `findByTipoId` rechaza → el resolver rechaza (invariante: no traga fallo tenant); `listarTecnicosAsignables` rechaza → `null` y log `ASIGNACION_AUTOMATICA_DEGRADADA` con el nombre de la clase del error; responsable fuera del universo → `null` y log `ASIGNACION_AUTOMATICA_REGLA_ROTA`; válido → `{ asignadoId, estadoAsignadoId, tipoOperacionAsignacionId }`; catálogo ausente → `throw`. Mutación documentada: quitar el `try/catch` de master pone el test en rojo. (A1, A2, A4, A5, A7)
- [x] 2.2 Crear las constantes `backend/src/tickets/domain/constants/autor-sistema.constants.ts` (`AUTOR_SISTEMA = '00000000-0000-0000-0000-000000000001'`, `DESCRIPCION_ASIGNACION_POR_REGLA`, `ORIGEN_ASIGNACION`) con el JSDoc de justificación al estilo de `formulario-publico.constants.ts`, y `backend/src/tickets/domain/events/ticket-asignado.event.ts` (`TicketAsignadoEvent`, `name = 'ticket.asignado'`, `origen`, `autorId: string | null`, solo ids). (A3, N1)
- [x] 2.3 Crear `resolver-asignacion-automatica.service.ts` (contrato de ADR-2; nunca devuelve `Result.fail`). (A1, A2, A4, A5)
- [x] 2.4 Test unit de `operacionesDeApertura`: sin asignación → `[apertura]` con `estadoAnteriorId = null`; con asignación → `[apertura, asignacion]` con `autorId = AUTOR_SISTEMA`, `esInterno = false`, descripción y `metadata = { origen: 'REGLA_TIPO', tipoId, asignadoId }`; la apertura conserva el autor recibido. Los tests buscan por tipo de operación, no por posición. (A3)
- [x] 2.5 Crear `operaciones-apertura.ts`. (A3)
- [x] 2.6 Tests unit de `CrearTicketUseCase` (con y sin regla): con regla → nace en `ASIGNADO` con `asignado_id`, `estadoInicialId` correcto, operaciones de ADR-3, `ticket.asignado` `REGLA_TIPO` publicado con `alCommitear` después de `TicketCreadoEvent`; sin regla → idéntico a hoy; regla rota → Nuevo sin asignar, sin error (D5); `publish` no se llama hasta correr la cola de `alCommitear` (runner falso). Mocks completos con el parámetro nuevo. (A1, A2, A3, A4, A7, A8, N1)
- [x] 2.7 Modificar `CrearTicketUseCase` (resolver en la fase de lectura, `assignTo` antes del primer `save`, `operacionesDeApertura`, evento con `alCommitear`) y cablear en `tickets.module.ts`: `REGLA_ASIGNACION_REPOSITORY`, `ResolverAsignacionAutomatica` (`useFactory`), exportarlos. Revisar comentarios del archivo que afirmen que el sistema nunca auto-asigna. (A1, A6, A7, A8)
- [x] 2.8 Test de integración del alta con regla (molde `asignar-y-poner-en-proceso.reloj-sla.integration.spec.ts`, `TenantContext.run` + `PrismaTenantTransactionRunner`): nace `ASIGNADO`, `asignado_id`, apertura `null→ASIGNADO` y `ASIGNACION` de `AUTOR_SISTEMA` con `metadata.origen`; con el `save` del satélite forzado a fallar → ni ticket ni operaciones (atomicidad). (A3, A7)
- [x] 2.9 Test de integración del preventivo anidado con regla: aplica la regla; un fallo de master no aborta el plan; fallo forzado del plan → ningún evento `ticket.asignado`. Test de SLA: un ticket nacido `ASIGNADO` mide el reloj igual y la primera respuesta solo la marca un comentario público. (A6, A7, A9, N1)
- [x] 2.10 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/tickets src/preventivo`; raíz `node scripts/check-casts-en-specs.mjs` (no sube). Deuda de Ayuda anotada en commit y PR (asignación automática al crear).

## WU-3 — Soporte, formulario público y Edilicia (~330 líneas)

Rama `feat/asignacion-automatica-por-tipo-wu03` → target `feat/asignacion-automatica-por-tipo-wu02`. Requerimientos: A6 (Soporte, formulario público, Edilicia), A1, A3, A4, A7, A8, N1.

- [x] 3.1 Tests unit de `CrearTicketSoporteUseCase` y `CrearTicketEdilicioUseCase` (con y sin regla, regla rota → Nuevo sin error, evento con `alCommitear`); en el formulario público la apertura conserva `AUTOR_FORMULARIO_PUBLICO` y la `ASIGNACION` es de `AUTOR_SISTEMA`. Mocks completos con el parámetro nuevo. (A1, A3, A4, A6, A7, A8, N1)
- [x] 3.2 Modificar `crear-ticket-soporte.use-case.ts` y `crear-ticket-edilicio.use-case.ts` con el mismo patrón que la WU-2 (resolver tras `findByCodigo`, estado inicial, `operacionesDeApertura`, evento) y sumar `ResolverAsignacionAutomatica` al `inject` de sus factories en `equipos.module.ts` y `reparaciones.module.ts` (sin reconstruirlo). Revisar comentarios obsoletos del archivo. (A6, A7)
- [x] 3.3 e2e un caso con regla por canal (tenant efímero, `usarLockMasterTest()` si trunca master): `tickets.e2e` (`POST /tickets`), Soporte, Edilicia (`reparaciones.e2e`) y formulario público (`pedido-publico-confirmar.e2e`) → 201/ok, ticket `ASIGNADO` con el responsable de la regla; más el caso `POST /tickets` con la membresía del responsable desactivada → 201, Nuevo, sin asignado. (A4, A6)
- [x] 3.4 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/equipos src/reparaciones src/formulario-publico src/tickets` y los e2e tocados; raíz `node scripts/check-casts-en-specs.mjs`. Deuda de Ayuda anotada (el ticket de Soporte/Edilicia/formulario público puede nacer Asignado).

## WU-4 — Módulo `reglas-asignacion`: API de configuración (~390 líneas)

Rama `feat/asignacion-automatica-por-tipo-wu04` → target `feat/asignacion-automatica-por-tipo-wu03`. Requerimientos: R1, R2, R3, R4, R5, R7.

Partición aplicada en la costura pactada: 4a (4.1 a 4.5, rama `...-wu04`) y 4b (listar, rama `...-wu04b`), 4c (4.6 a 4.8, controller, módulo y e2e, rama `...-wu04c`).

- [x] 4.1 Crear `backend/src/reglas-asignacion/domain/estado-regla-asignacion.ts` (`ESTADOS_REGLA_ASIGNACION = ['SIN_REGLA', 'VALIDA', 'ROTA'] as const`) y `domain/errors.ts` (`TipoTicketNoConfigurableError` 404, `ResponsableReglaNoElegibleError` 422). (R3, R4)
- [x] 4.2 Tests unit de `ListarReglasAsignacionUseCase`: una fila por tipo activo; un tipo dado de baja no aparece; `SIN_REGLA` / `VALIDA` (con nombre del candidato) / `ROTA` (nombre de `resolverNombres`, `null` si el usuario fue borrado); `listarTecnicosAsignables` una vez por módulo distinto, no por fila; candidatos por módulo. (R2, R4)
- [x] 4.3 Crear `ListarReglasAsignacionUseCase`. (R2, R4)
- [x] 4.4 Tests unit de `ConfigurarReglaAsignacionUseCase`: `null` → `quitar` idempotente; UUID válido → `evaluarResponsableRegla` y `fijar(tipoId, responsableId, actor.sub)`; ADMINISTRADOR, usuario de otro cliente, sin el módulo o dado de baja → `ResponsableReglaNoElegibleError` sin escribir; tipo inexistente o borrado → `TipoTicketNoConfigurableError`; un fallo de master se propaga (no se degrada). (R1, R2, R3)
- [x] 4.5 Crear `ConfigurarReglaAsignacionUseCase`. (R1, R3)
- [x] 4.6 `ReglasAsignacionController` (`GET /reglas-asignacion`, `PUT /reglas-asignacion/:tipoId`; `JwtAuthGuard, TenantGuard` por clase y `AdminClienteGuard` por método; `ParseUUIDPipe`; `clienteId = actor.cliente_id`), DTO con `@IsDefined()` y `@ValidateIf(o => o.responsableId !== null) @IsUUID()`, `ReglasAsignacionModule` (`imports: [AuthModule, TicketsModule]`) y registro en `app.module.ts`. (R5, R3)
- [x] 4.7 e2e `reglas-asignacion.e2e.spec.ts` (tenant efímero, `usarLockMasterTest()`): 403 para TECNICO y sin sesión; ADMINISTRADOR del cliente y ROOT leen y editan; `PUT` con ADMIN como responsable → 422; tipo inexistente → 404; estados `SIN_REGLA`/`VALIDA`/`ROTA` tras desactivar la membresía; `PUT` con `null` quita la regla; el `clienteId` del body se ignora. (R2, R3, R4, R5)
- [x] 4.8 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/reglas-asignacion` y el e2e; raíz `node scripts/check-casts-en-specs.mjs`. Deuda de Ayuda anotada (la pantalla llega en la WU-7).

## WU-5 — Asignación manual: terminal, Nuevo→Asignado, evento y comentarios (~300 líneas)

Rama `feat/asignacion-automatica-por-tipo-wu05` → target `feat/asignacion-automatica-por-tipo-wu04`. Requerimientos: M1, M2, M3, M5, M6, N1 (asignaciones manuales).

- [ ] 5.1 Agregar `TicketCerradoNoReasignableError(ticketId, codigo)` a `tickets.errors.ts` y su mapeo explícito a 422 en `toHttpException` de `tickets.controller.ts`. (M1)
- [ ] 5.2 Tests unit de `AsignarTicketUseCase`: `CERRADO` y `CANCELADO` → `TicketCerradoNoReasignableError` sin escribir ni consultar master; `RESUELTO`, `EN_PROCESO`, `ESPERANDO_CLIENTE` y `ASIGNADO` reasignan sin cambiar de estado; `NUEVO` → `CAMBIO_ESTADO NUEVO→ASIGNADO` del actor además de `ASIGNACION` (mutación: quitar la rama `NUEVO` pone el test en rojo); destinatario no elegible conserva su error; `ticket.asignado` `MANUAL` con `autorId` del actor, solo vía `alCommitear`; autoasignación sigue permitida. (M1, M2, M3, N1)
- [ ] 5.3 Modificar `AsignarTicketUseCase` (ADR-6: `estadoRepo`, `eventPublisher`, guarda terminal antes de las validaciones, paso `NUEVO → ASIGNADO` en la transacción, evento) y su factory en `tickets.module.ts` (`ESTADO_REPOSITORY`, `DOMAIN_EVENT_PUBLISHER`). Reescribir los comentarios falsos de `asignar-ticket.use-case.ts:24-26` y `:68-73`. (M1, M2, M3, M6)
- [ ] 5.4 Tests unit de `AsignarYPonerEnProcesoUseCase`: terminal → `TicketCerradoNoReasignableError` antes de resolver los pasos; `RESUELTO` conserva `TransicionInvalidaError`; evento `MANUAL` con `alCommitear` tras el `run`. (M1, N1)
- [ ] 5.5 Modificar `AsignarYPonerEnProcesoUseCase` (+ `eventPublisher`, guarda `ESTADOS_TERMINALES`, evento) y su factory. (M1, N1)
- [ ] 5.6 Reescribir el comentario de `tickets.controller.ts:567` ("el sistema nunca auto-asigna"); `rg "nunca auto-asigna|auto-asign"` sobre `backend/src` y `frontend/src` no debe dejar comentarios vigentes falsos. Un ticket nacido por regla se reasigna igual que cualquier otro (sin rama especial). (M5, M6)
- [ ] 5.7 e2e: `PATCH /tickets/:id/asignar` en `CERRADO` → 422 con el error nuevo y sin operaciones nuevas; `PATCH /tickets/:id/asignar-en-proceso` en `CANCELADO` → 422; `NUEVO` → `ASIGNADO`; `RESUELTO` → 200 sin cambio de estado; ticket nacido por regla reasignable. (M1, M2, M3, M5)
- [ ] 5.8 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/tickets` y el e2e; raíz `node scripts/check-casts-en-specs.mjs`. Deuda de Ayuda anotada (asignar a mano un Nuevo lo pasa a Asignado; un cerrado o cancelado ya no se reasigna).

## WU-6 — Plantilla y listener del mail de asignación (~220 líneas)

Rama `feat/asignacion-automatica-por-tipo-wu06` → target `feat/asignacion-automatica-por-tipo-wu05`. Requerimientos: N1, N2, N3, N4, N5, N6, N7.

- [ ] 6.1 Tests unit de `templateTicketAsignado`: asunto `Ticket {numero} asignado a usted`; cuerpo con número, título, tipo y prioridad; texto distinto para `REGLA_TIPO` y `MANUAL`; escape HTML de título y nombres; link `/tickets/:id`. (N2)
- [ ] 6.2 Agregar `templateTicketAsignado` a `backend/src/notificaciones/domain/templates/email-templates.ts`. (N2)
- [ ] 6.3 Tests unit de `TicketAsignadoNotificacionListener`: manda el mail al asignado; autoasignación (`autorId` = `asignadoId`) → `send` llamado (sin rama de omisión); tipo o prioridad faltante omite esa línea sin cancelar; ticket inexistente → log `TICKET_ASIGNADO_SIN_TICKET` y termina; sin contacto → log `TICKET_ASIGNADO_SIN_CONTACTO` sin dirección ni nombre; `send` lanza → el handler resuelve y loguea con el `ticketId`, nunca el error crudo; sin correo configurado no hay excepción (`EMAIL_CLIENTE_SIN_CONFIG` ya lo registra el sender); no deduplica contra `preventivo.generado`. (N3, N4, N5, N6, N7)
- [ ] 6.4 Crear `ticket-asignado-notificacion.listener.ts` (molde `PreventivoGeneradoNotificacionListener`, `@OnEvent('ticket.asignado')`) y registrarlo en `notificaciones.module.ts` (tomar `TICKET_REPOSITORY`, `TIPO_TICKET_REPOSITORY`, `PRIORIDAD_REPOSITORY` de `TicketsModule` si hace falta exportarlos). (N1, N2, N6)
- [ ] 6.5 Test de integración o e2e de punta a punta con el `EMAIL_SENDER` falso: alta con regla y asignación manual disparan un mail al responsable, con contexto del cliente correcto. (N1, N2, N6)
- [ ] 6.6 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm test` completo (última WU de backend); raíz `node scripts/check-casts-en-specs.mjs`. Deuda de Ayuda anotada (mail de asignación).

## WU-7 — Frontend: pantalla `/admin/reglas-asignacion` (~390 líneas)

Rama `feat/asignacion-automatica-por-tipo-wu07` → target `feat/asignacion-automatica-por-tipo-wu06`. Requerimientos: R6, R4 (presentación), R5 (gate de la vista).

- [ ] 7.1 Test de schemas Zod `features/reglas-asignacion/schemas.ts` (espejo de `ReglaAsignacionFilaDto`, `CandidatoDto`, `ESTADOS_REGLA_ASIGNACION`) y de los hooks `useReglasAsignacion()` (`queryKey: ["reglas-asignacion"]`) y `useConfigurarReglaAsignacion()` (invalida la key; toast de éxito y de error) con msw. (R6)
- [ ] 7.2 Crear `types.ts`, `schemas.ts` y `hooks/*` sobre `apiFetch`, como `use-modelos-equipo.ts`. (R6)
- [ ] 7.3 Test de `reglas-asignacion-admin-view.tsx`: una fila por tipo activo con nombre, código y módulo; vacía = "Sin regla" y envía `null`; badges "Sin regla", "Activa", "Rota" con el texto de ayuda; regla rota muestra al responsable actual como opción deshabilitada, y "Usuario no disponible" si no hay nombre; fila deshabilitada mientras corre el `PUT`; `PUT` rechazado (422) → toast y el selector vuelve a la regla anterior; solo candidatos del módulo del tipo. (R4, R6)
- [ ] 7.4 Crear `components/reglas-asignacion-admin-view.tsx` (dentro de `<SoloAdminCliente>` + `<AdminNav />`, `Select` nativo de `@/components/ui/select`) y la página fina `app/(dashboard)/admin/reglas-asignacion/page.tsx` (molde `admin/modelos-equipo/page.tsx`). (R5, R6)
- [ ] 7.5 Test e implementación del ítem `{ href: "/admin/reglas-asignacion", label: "Asignación automática" }` en `ADMIN_NAV_ITEMS` (`components/shell/admin-nav.tsx`) con el mismo gate `esAdminCliente`: visible para quien administra, oculto para los demás. (R5, R6)
- [ ] 7.6 Verificación: frontend `JWT_SECRET=dummy pnpm lint`, `pnpm type-check`, `pnpm test` de las rutas de la WU; raíz `node scripts/check-casts-en-specs.mjs`. Deuda de Ayuda anotada (pantalla "Asignación automática").

## WU-8 — Frontend: control de reasignación (~200 líneas)

Rama `feat/asignacion-automatica-por-tipo-wu08` → target `feat/asignacion-automatica-por-tipo-wu07`. Requerimientos: M4, M2 (interfaz), M5 (interfaz).

- [ ] 8.1 Test de `puedeReasignar` en `features/tickets/lib/estado-transitions.ts`: verdadero en `NUEVO`, `ASIGNADO`, `EN_PROCESO`, `ESPERANDO_CLIENTE` y `RESUELTO`; falso en `CERRADO` y `CANCELADO`; es el complemento de `ESTADOS_TERMINALES` (espejo). (M4)
- [ ] 8.2 Implementar `puedeReasignar`. (M4)
- [ ] 8.3 Test de `TicketReasignarControl`: gate `TICKETS:ASIGNAR` (sin permiso no se muestra); usa `useAsignarTicket` con los candidatos de `useTecnicosAsignables`; en `NUEVO` y `ASIGNADO` conviven con "Asignar y poner en proceso"; no se muestra nada en `CERRADO`/`CANCELADO`; error 422 muestra el toast; un ticket nacido por regla se reasigna igual. (M2, M4, M5)
- [ ] 8.4 Crear `ticket-reasignar-control.tsx` (presentacional) y montarlo en `ticket-detail-view.tsx` cuando `puedeReasignar(estadoCodigo)`. Anotar deuda de Ayuda (control de reasignación) en commit y PR. (M4)
- [ ] 8.5 Verificación: frontend `JWT_SECRET=dummy pnpm lint`, `pnpm type-check`, `pnpm test` completo (última WU de frontend); raíz `node scripts/check-casts-en-specs.mjs`; si hay `node scripts/check-roadmap-fresco.mjs` aplicable, correrlo.
- [ ] 8.6 Notas de deploy en el PR del tracker: migración tenant `20261009120000_reglas_asignacion` con `rollback.sql`, aplicada por el fan-out de `migrate:tenants` dentro de la ventana `Stop-Service`/`Start-Service` del runbook, con el dump previo estándar (`soporte/predeploy-dump.ps1`); aditiva y no destructiva, sin seed (tabla vacía = alta igual que hoy); sin dependencias nuevas ni variables de entorno (el lockfile no se espera que cambie); despliegue solo de la cadena completa; conducta desde el primer minuto: bloqueo en terminales, `NUEVO → ASIGNADO` al asignar a mano y mail en cada asignación; mitigación rápida sin revert: vaciar las reglas desde la pantalla o `DELETE FROM reglas_asignacion` por tenant; revert total: `git revert` en orden inverso + `rollback.sql` por tenant; deuda de Ayuda consolidada (pantalla nueva, asignación automática al crear, mail de asignación, `NUEVO → ASIGNADO` al asignar a mano, control de reasignación). Smoke posterior al deploy: configurar una regla de prueba en un tenant, crear un ticket de ese tipo y comprobar que nace Asignado y que el responsable recibe el mail; vaciar la regla.

> **8.7 — cierre posterior al deploy (paso de entrega, fuera de la lista de tareas de implementación; no bloquea el archive):** DESPUÉS del deploy de la cadena completa y del smoke: en `docs/roadmap-comercial.md` marcar el punto 9 de la segunda etapa como Entregado y declarar **Cumplida** o **Desviación** (con motivo) en la viñeta "Segunda etapa, punto 9 — asignación automática por tipo" de "Decisiones de producto de la segunda etapa", incluidas las "Precisiones del 2026-10-09, al explorar"; correr `node scripts/check-roadmap-fresco.mjs`. Declarar las desviaciones acordadas: la reasignación simple se ofrece también en `NUEVO` y `ASIGNADO` (M4 ampliado por el dueño) y que la tolerancia de A7 cubre las consultas al maestro (las del tenant se propagan, ADR-2). Diferencia con el diseño: el diseño ubica la viñeta en la WU-8; aquí va después del deploy para no declarar Cumplida algo no entregado.

## Cobertura de requerimientos (para verify)

| Spec | Requerimiento | WU / tareas |
|------|---------------|-------------|
| `reglas-asignacion` | R1 Una regla por tipo, un responsable fijo | WU-1 (1.1, 1.3-1.5), WU-4 (4.4-4.5, 4.7) |
| `reglas-asignacion` | R2 Universo: TECNICO o COLABORADOR con el módulo | WU-1 (1.6-1.7), WU-4 (4.2-4.5, 4.7) |
| `reglas-asignacion` | R3 La configuración revalida en el servidor | WU-4 (4.1, 4.4-4.7) |
| `reglas-asignacion` | R4 Estado calculado al leer | WU-4 (4.1-4.3, 4.7), WU-7 (7.3) |
| `reglas-asignacion` | R5 Solo el administrador lee y edita | WU-4 (4.6-4.7), WU-7 (7.4-7.5) |
| `reglas-asignacion` | R6 Pantalla: una fila por tipo, vacía = sin regla | WU-7 (7.1-7.5) |
| `reglas-asignacion` | R7 Persistencia aditiva y reversible | WU-1 (1.1-1.2, 1.4-1.5) |
| `asignacion-automatica-alta` | A1 Con regla válida, nace Asignado | WU-2 (2.1, 2.3, 2.6-2.8), WU-3 (3.1-3.3) |
| `asignacion-automatica-alta` | A2 Sin regla, nace Nuevo y sin asignar | WU-2 (2.1, 2.3, 2.6) |
| `asignacion-automatica-alta` | A3 Bitácora con la asignación del sistema | WU-2 (2.2, 2.4-2.6, 2.8), WU-3 (3.1) |
| `asignacion-automatica-alta` | A4 Responsable inválido degrada; el alta nunca falla | WU-2 (2.1, 2.3, 2.6), WU-3 (3.1, 3.3) |
| `asignacion-automatica-alta` | A5 Regla eliminada: comportamiento previo | WU-2 (2.1, 2.3), WU-4 (4.4, 4.7) |
| `asignacion-automatica-alta` | A6 Cinco canales de alta | WU-2 (2.7, 2.9: `POST /tickets` y preventivo), WU-3 (3.1-3.3: Soporte, formulario público, Edilicia) |
| `asignacion-automatica-alta` | A7 Atómica con el alta | WU-2 (2.1, 2.6-2.9), WU-3 (3.1-3.2) |
| `asignacion-automatica-alta` | A8 El resto del alta no cambia | WU-2 (2.6-2.7), WU-3 (3.1) |
| `asignacion-automatica-alta` | A9 No altera el SLA | WU-2 (2.9) |
| `ticket-asignacion-manual` | M1 Un cerrado no se reasigna | WU-5 (5.1-5.5, 5.7) |
| `ticket-asignacion-manual` | M2 Hasta el cierre, reasignable | WU-5 (5.2-5.3, 5.7), WU-8 (8.3) |
| `ticket-asignacion-manual` | M3 Asignar un Nuevo lo pasa a Asignado | WU-5 (5.2-5.3, 5.7) |
| `ticket-asignacion-manual` | M4 La interfaz permite reasignar hasta el cierre | WU-8 (8.1-8.4) |
| `ticket-asignacion-manual` | M5 Ticket nacido por regla se reasigna igual | WU-5 (5.6-5.7), WU-8 (8.3) |
| `ticket-asignacion-manual` | M6 Comentarios "nunca auto-asigna" corregidos | WU-2 (2.7), WU-3 (3.2), WU-5 (5.3, 5.6) |
| `notificacion-asignacion` | N1 Evento solo después del commit | WU-2 (2.2, 2.6, 2.9), WU-3 (3.1), WU-5 (5.2, 5.4-5.5), WU-6 (6.4-6.5) |
| `notificacion-asignacion` | N2 Mail al responsable en cada asignación | WU-6 (6.1-6.2, 6.4-6.5) |
| `notificacion-asignacion` | N3 El mail sale también en la autoasignación | WU-6 (6.3) |
| `notificacion-asignacion` | N4 Sin correo configurado, se asigna sin mail | WU-6 (6.3) |
| `notificacion-asignacion` | N5 Un fallo del mail nunca bloquea la asignación | WU-6 (6.3) |
| `notificacion-asignacion` | N6 Contexto del cliente y datos mínimos | WU-6 (6.3-6.5) |
| `notificacion-asignacion` | N7 Sin deduplicación entre avisos distintos | WU-6 (6.3) |

Decisión de producto citada: `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 9 — asignación automática por tipo" y "Precisiones del 2026-10-09, al explorar". Cada viñeta ya está convertida en requerimiento (R*/A*/M*/N*); lo no implementado se declara en la sección "Declaración de lo no implementado" de cada spec.
