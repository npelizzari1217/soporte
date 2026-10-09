# Apply progress: asignacion-automatica-por-tipo

## WU-1 — Migración M1, puerto, repo y evaluador (rama `feat/asignacion-automatica-por-tipo-wu01`)

Estado: completa (tareas 1.1 a 1.8).

- 1.1 / 1.2: migración `20261009120000_reglas_asignacion` (`migration.sql` + `rollback.sql`), modelo `ReglaAsignacion` y back-relation en `TipoTicket`; cliente tenant regenerado.
- 1.3 / 1.5: puerto `IReglaAsignacionRepository` (+ token `REGLA_ASIGNACION_REPOSITORY`) y `PrismaReglaAsignacionRepository`.
- 1.4: integración `prisma-regla-asignacion.repository.integration.spec.ts` (tenant efímero, 8 casos incluido el rollback).
- 1.6 / 1.7: `elegibilidad-responsable-regla.ts` (+ spec) y JSDoc ampliado de `listarTecnicosAsignables`.
- 1.8: M1 aplicada a `soporte_tenant_test` (`prisma migrate status` limpio); lint, typecheck, specs de la WU y ratchet de casts en verde (617, sin subir).

Desvíos del diseño: ninguno. `evaluarResponsableRegla` recibe `Pick<IUsuarioMasterChecker, 'listarTecnicosAsignables'>` en vez del checker completo (mocks completos sin casts).

## WU-2a — Constantes, evento, resolver y `operacionesDeApertura` (rama `feat/asignacion-automatica-por-tipo-wu02`)

Estado: completa (tareas 2.1 a 2.5). WU-2 se parte en la costura pactada: 2a (esta) y 2b (`CrearTicketUseCase`, cableado, integración; rama `...-wu02b`).

- 2.2: `AUTOR_SISTEMA`, `DESCRIPCION_ASIGNACION_POR_REGLA`, `ORIGEN_ASIGNACION` y `TicketAsignadoEvent`.
- 2.1 / 2.3: `ResolverAsignacionAutomatica` (el tenant propaga, el maestro degrada a `null` con log enmascarado) y su spec con la mutación documentada.
- 2.4 / 2.5: `operacionesDeApertura` y su spec (búsqueda por tipo de operación).

Desvíos: el resolver loguea `REGLA_ROTA` con `logger.log` y `DEGRADADA` con `logger.error` (el puerto `ILogger` solo tiene esos dos niveles). El spec no repite el caso "tipo inactivo": `desactivar()` ya cubre baja e inactivo a la vez.

## WU-2b — `CrearTicketUseCase` y cableado (rama `feat/asignacion-automatica-por-tipo-wu02b`)

Estado: completa (tareas 2.6 y 2.7). Segunda partición de WU-2: el diff total de 2b con las integraciones pasaba de 490 líneas, así que las integraciones 2.8 y 2.9 van en 2c (`...-wu02c`), sobre esta rama.

- 2.7: `CrearTicketUseCase` recibe `ResolverAsignacionAutomatica` (12.º parámetro, tras el resolver de ciclo), resuelve en la fase de lectura, `assignTo` antes del primer `save`, `operacionesDeApertura` y `ticket.asignado` por `alCommitear` después de `ticket.creado`. `TicketsModule` registra `REGLA_ASIGNACION_REPOSITORY` y el resolver (`useFactory`) y exporta ambos. El archivo no tenía comentarios de "nunca auto-asigna".
- 2.6: specs del caso de uso (con regla, sin regla, regla rota, cola de `alCommitear`, rechazo del tenant). Las otras dos construcciones del caso de uso (`mantenimiento` y `generar-preventivos` integration) reciben el resolver nulo.

## WU-2c — Integraciones del alta con regla y del preventivo (rama `feat/asignacion-automatica-por-tipo-wu02c`)

Estado: completa (tareas 2.8, 2.9 y 2.10). WU-2 queda cerrada en tres ramas encadenadas: 2a, 2b, 2c.

- 2.8: `crear-ticket.asignacion-automatica.integration.spec.ts` (tenant efímero): con regla nace ASIGNADO con apertura null→ASIGNADO y ASIGNACION de `AUTOR_SISTEMA`; sin regla idéntico a hoy; el `save` de la ASIGNACION forzado a fallar deja cero tickets y cero eventos (atomicidad). `CrearTicketUseCase` no tiene satélite, así que la falla se fuerza en el repo de operaciones.
- 2.9: tres casos en `generar-preventivos.integration.spec.ts` (regla aplicada dentro de la tx del plan; fallo del maestro no aborta el plan; `marcarGenerado` forzado a fallar → ROLLBACK y ningún `ticket.asignado`) y el caso de SLA (A9) en la integración nueva. El barrido procesa todos los planes vencidos del tenant: los eventos se filtran por `ticketId` y el fallo forzado es permanente en la corrida.
- 2.10: lint, typecheck, `pnpm test` completo y ratchet de casts en verde (617/114).

Desvíos de WU-2: la partición pactada era 2a/2b; 2b con las integraciones daba ~490 líneas, así que las integraciones pasaron a una tercera rama (2c). `orden-de-arranque.spec.ts` falla en este worktree por falta de `backend/.env` (`DATABASE_URL_MASTER`, `APP_BASE_URL`), no por el cambio.

## WU-3a — Soporte, formulario público y Edilicia: casos de uso y cableado (rama `feat/asignacion-automatica-por-tipo-wu03`)

Estado: parcial (tareas 3.1 y 3.2 hechas; 3.3 y 3.4 pendientes). WU-3 se parte para respetar el tope de 400 líneas: 3a (esta) lleva el código con sus tests unit; 3b llevará los casos con regla por canal contra Postgres (3.3) y la verificación final (3.4).

- 3.2: `CrearTicketSoporteUseCase` y `CrearTicketEdilicioUseCase` reciben `ResolverAsignacionAutomatica` (parámetro tras el resolver de ciclo), resuelven antes de abrir la transacción, `assignTo` antes del primer `save`, `operacionesDeApertura` y `ticket.asignado` por `alCommitear` tras `ticket.creado`. `equipos.module.ts` y `reparaciones.module.ts` lo inyectan desde `TicketsModule` (sin reconstruirlo). El formulario público no tiene use case propio: usa `CrearTicketSoporteUseCase`, así que queda cubierto. Los archivos no tenían comentarios de "nunca auto-asigna".
- 3.1: casos con y sin regla, regla rota (resolver nulo), cola de `alCommitear`, rechazo del tenant, y en Soporte la apertura con `AUTOR_FORMULARIO_PUBLICO` frente a la `ASIGNACION` de `AUTOR_SISTEMA`. Las tres construcciones de integración existentes reciben el resolver nulo.
- Verificado: los e2e existentes `reparaciones.e2e` y `pedido-publico-confirmar.e2e` levantan la app real (el cableado de DI resuelve).

## WU-3b — Integración por canal y verificación final (misma rama `...-wu03`, commit nuevo)

Estado: completa (tareas 3.3 y 3.4). WU-3 queda cerrada.

- 3.3: `asignacion-automatica.canales.integration.spec.ts` (tenant efímero, 5 casos): Soporte, formulario público (apertura `AUTOR_FORMULARIO_PUBLICO`, `ASIGNACION` de `AUTOR_SISTEMA`) y Edilicia nacen ASIGNADO con la regla; ROLLBACK de Soporte (cero ticket, cero operaciones nuevas, cero eventos); y `POST /tickets` con el responsable fuera de `listarTecnicosAsignables` (membresía dada de baja) → alta ok, NUEVO, sin asignado, una sola operación.
- Desvío: el 3.3 pedía e2e HTTP. Se probó a nivel de caso de uso sobre Postgres real (mismo cableado que los módulos); el DI real ya lo ejercitan `reparaciones.e2e` y `pedido-publico-confirmar.e2e`. Master es un doble (no se trunca master, sin `usarLockMasterTest()`).
- 3.4: verificación en el reporte del apply. **Deuda de Ayuda para el cuerpo del PR:** un ticket de Soporte, Edilicia o del formulario público ahora puede nacer Asignado (con responsable y la bitácora "Asignación automática") si el tipo tiene regla; los artículos de Ayuda que describen esos altos como "siempre Nuevo" o sin responsable deben revisarse al levantar la pausa de la Ayuda.

## WU-4a — Casos de uso de configuración (rama `feat/asignacion-automatica-por-tipo-wu04`)

Estado: parcial (tareas 4.1 a 4.5 hechas; 4.6 a 4.8 pendientes). WU-4 se parte en la costura pactada: 4a (esta) lleva dominio, casos de uso y sus unit; 4b llevará controller, DTO, módulo, registro en `app.module.ts`, e2e y la verificación final.

- 4.1: `reglas-asignacion/domain/estado-regla-asignacion.ts` (estados, `ReglaAsignacionFila`, `CandidatoRegla`) y `domain/errors.ts` (`TipoTicketNoConfigurableError`, `ResponsableReglaNoElegibleError`).
- 4.2 / 4.3: `ListarReglasAsignacionUseCase` devuelve `{ reglas, candidatosPorModulo }`; una consulta a master por módulo distinto; `ROTA` toma el nombre de `resolverNombres` en un solo lote (`null` si el usuario fue borrado).
- 4.4 / 4.5: `ConfigurarReglaAsignacionUseCase` devuelve `Result<ReglaAsignacionFila, ...>`; `null` quita sin consultar a master; el UUID se revalida contra `listarTecnicosAsignables` y se fija con el actor; un fallo de master se propaga.

Desvíos: el caso de uso de configuración usa `esResponsableElegible` (la función pura de WU-1) sobre la lista que ya trajo, en vez de `evaluarResponsableRegla`, para reutilizar la misma consulta y devolver el nombre del candidato sin una segunda llamada a master; el criterio es el mismo. Los dos casos filtran también `activo`/`isDeleted` del tipo, por si el repo devolviera un tipo de baja. Verificación completa (lint, typecheck, ratchet de casts, `pnpm test`) en el reporte del apply.

## WU-4c — Controller, DTO, módulo y e2e (rama `feat/asignacion-automatica-por-tipo-wu04c`, sobre 4b)

Estado: completa (tareas 4.6 a 4.8). WU-4 queda cerrada en 4a (dominio y casos de uso), 4b (listar / configurar) y 4c.

- 4.6: `ReglasAsignacionController` (`GET /reglas-asignacion`, `PUT /reglas-asignacion/:tipoId`; guards de clase `JwtAuthGuard, TenantGuard` y `AdminClienteGuard` por método; `TipoTicketNoConfigurableError` → 404, el resto → 422), DTO `ConfigurarReglaAsignacionBodyDto` (`@IsDefined()` + `@ValidateIf(!== null) @IsUUID()`), `ReglasAsignacionModule` (`imports: [AuthModule, TicketsModule]`, casos de uso por `useFactory`) y registro en `app.module.ts`.
- 4.7: `reglas-asignacion.e2e.spec.ts` contra Postgres real (tenant efímero, usuarios, membresías y matriz de master sembrados de verdad, `usarLockMasterTest()`): 401, 403 para TECNICO/COLABORADOR/USUARIO, ROOT lee, `SIN_REGLA` con candidatos solo TECNICO/COLABORADOR con el módulo, fijar/reemplazar/quitar, `ROTA` por módulo perdido y por membresía inactiva, 404 (inexistente y de baja), 422 (ADMIN, sin módulo, desconocido) con la regla anterior intacta, 400 de forma, `clienteId` del body ignorado.
- 4.8: lint, typecheck, `vitest run src/reglas-asignacion` y ratchet de casts (617/114) en verde; `pnpm test` completo en el reporte del apply.

Desvíos: el e2e no desactiva la membresía por HTTP sino directo en master (no hay endpoint en este módulo). **Deuda de Ayuda para el cuerpo del PR:** API sin pantalla hasta la WU-7; sin artículo de Ayuda nuevo mientras dure la pausa.

## WU-5a — Asignación manual: `AsignarTicketUseCase` (rama `feat/asignacion-automatica-por-tipo-wu05`, sobre `...-wu04c`)

Estado: parcial (tareas 5.1, 5.2, 5.3 y 5.6 hechas; 5.4, 5.5, 5.7 y 5.8 pendientes). El `target` de tasks.md dice `...-wu04`, pero el padre real es `...-wu04c` (PR #496) porque WU-4 se partió en 4a/4b/4c. WU-5 se parte para respetar el tope: 5a (esta) lleva `AsignarTicketUseCase`, el error nuevo y el comentario del controller; 5b llevará `AsignarYPonerEnProcesoUseCase` (5.4, 5.5), el e2e (5.7) y la verificación final (5.8).

- 5.1: `TicketCerradoNoReasignableError(ticketId, estadoCodigo)` (código `TICKET_CERRADO_NO_REASIGNABLE`) y mapeo explícito a 422 en `toHttpException`; el catálogo de `tickets.controller.spec.ts` pasa de 24 a 25 clases.
- 5.2 / 5.3: `AsignarTicketUseCase` recibe `estadoRepo` y `eventPublisher` (al final del constructor). La guarda terminal va antes de `estaActivoEnTenant`; un `NUEVO` pasa a `ASIGNADO` en la misma transacción con `CAMBIO_ESTADO` del actor; `ticket.asignado` `MANUAL` (`autorId` = actor) sale por `alCommitear`. El factory de `tickets.module.ts` inyecta `ESTADO_REPOSITORY` y `DOMAIN_EVENT_PUBLISHER`. Comentarios falsos reescritos. **Mutación comprobada:** con `const eraNuevo = false` fallan dos tests (`T14 asignación válida` y `M3 NUEVO → ASIGNADO`); restaurado.
- 5.6: el comentario del controller ("el sistema nunca auto-asigna") reescrito; `rg "nunca auto-asigna|auto-asign"` sobre `backend/src` y `frontend/src` queda sin coincidencias fuera de specs.

Desvío: el orden de escritura dentro de la transacción es `ASIGNACION`, `CAMBIO_ESTADO`, `save` del ticket (antes era `save` del ticket y después la operación), como pide el ADR-6 (mismo orden que `AsignarYPonerEnProcesoUseCase`).

**Deuda de Ayuda para el cuerpo del PR:** asignar a mano un ticket Nuevo lo pasa a Asignado, y un ticket cerrado o cancelado ya no se puede reasignar (422). Sin edición de `backend/ayuda` mientras dure la pausa.

## WU-5b — `AsignarYPonerEnProcesoUseCase` y e2e (rama `feat/asignacion-automatica-por-tipo-wu05b`, sobre `...-wu05`)

Estado: completa (tareas 5.4, 5.5, 5.7 y 5.8). WU-5 queda cerrada en 5a y 5b.

- 5.4 / 5.5: `AsignarYPonerEnProcesoUseCase` recibe `eventPublisher` (último parámetro). Carga `estadoActual` antes de las validaciones de master y, si es `CERRADO`/`CANCELADO`, devuelve `TicketCerradoNoReasignableError`; `RESUELTO` conserva `TransicionInvalidaError`. `ticket.asignado` `MANUAL` (`autorId` = actor) sale por `alCommitear` tras el `run`. El factory de `tickets.module.ts` inyecta `DOMAIN_EVENT_PUBLISHER`. JSDoc del controller (`asignar-en-proceso`) y del caso de uso actualizados. **Mutación comprobada:** con la guarda terminal anulada fallan los dos tests M1 (CERRADO y CANCELADO); restaurado. El spec de integración del reloj de SLA solo suma el parámetro nuevo.
- 5.7: bloque `WU-5b` en `tickets.e2e.spec.ts` (se extiende el harness existente): `/asignar` en CERRADO → 422 sin operaciones nuevas ni cambio de asignado/estado; `/asignar-en-proceso` en CANCELADO → 422 sin operaciones nuevas; NUEVO → ASIGNADO por `/asignar`; RESUELTO → 200 sin cambio de estado; ticket nacido por regla (responsable TECNICO con módulo) se reasigna con 200.
- 5.8: lint, typecheck, `vitest run src/tickets` (75 archivos, 760 tests), e2e, `demo-seed.integration.spec.ts` y ratchet de casts (617/114) en verde.

Desvíos: el 422 no expone el nombre de la clase en el cuerpo, así que el e2e verifica el mensaje ("ya no se puede reasignar"). El responsable de la regla debe tener rol TECNICO/COLABORADOR (regla de `listarTecnicosAsignables`); si no, la regla queda ROTA y el ticket nace sin asignar.

**Deuda de Ayuda para el cuerpo del PR:** asignar y poner en proceso un ticket cerrado o cancelado se rechaza con 422. Sin edición de `backend/ayuda` mientras dure la pausa.

## WU-6a — Plantilla y listener del mail de asignación (rama `feat/asignacion-automatica-por-tipo-wu06`, sobre `...-wu05b`)

Estado: parcial (tareas 6.1, 6.2 y 6.4 hechas; 6.3, 6.5 y 6.6 en la rama `...-wu06b`). El `target` de tasks.md dice `...-wu05`, pero el padre real es `...-wu05b` (PR #498) porque WU-5 se partió en 5a/5b. WU-6 se parte para respetar el tope de 380 líneas acumuladas: 6a lleva el código de producción y los tests de la plantilla; 6b lleva los tests del listener (6.3), el e2e (6.5) y la verificación (6.6).

- 6.1 / 6.2: `templateTicketAsignado` en `email-templates.ts`: asunto `Ticket {numero} asignado a usted`, texto distinto para `REGLA_TIPO` ("automáticamente, según la regla de su tipo") y `MANUAL` ("Le asignaron"), líneas de tipo y prioridad opcionales, HTML escapado y link `/tickets/:id`.
- 6.4: `TicketAsignadoNotificacionListener` (`@OnEvent('ticket.asignado')`), registrado en `notificaciones.module.ts` con `TICKET_REPOSITORY`, `TIPO_TICKET_REPOSITORY` y `PRIORIDAD_REPOSITORY`. `TicketsModule` ya exportaba los tres: no hizo falta tocarlo ni aparece import circular nuevo. Sin rama de omisión por autoasignación. Logs `TICKET_ASIGNADO_SIN_TICKET`, `TICKET_ASIGNADO_SIN_CONTACTO` y `TICKET_ASIGNADO_FALLO_NOTIFICACION`, todos con el `ticketId` y nunca la dirección, el nombre ni el error crudo.

**Deuda de Ayuda para el cuerpo del PR:** la persona asignada ahora recibe un mail cuando le asignan un ticket (por la regla del tipo o a mano). Sin edición de `backend/ayuda` mientras dure la pausa.

## WU-6b-1 — Tests unitarios del listener (rama `feat/asignacion-automatica-por-tipo-wu06`)

- 6.3: `ticket-asignado-notificacion.listener.spec.ts` (10 tests): mail al asignado con asunto, tipo y prioridad (N2); autoasignación manda el mail (N3); el origen cambia el texto; tipo o prioridad faltante omite la línea; ticket inexistente y sin contacto loguean su código sin datos personales; `send` o `findById` que lanzan se tragan y loguean solo el `ticketId` (N5); sin correo configurado no hay error (N4); no deduplica (N7).
- El código del listener y su spec unitario van en la misma rama (size:exception: separarlos rompería la unidad). 6.5 y 6.6 siguen en `...-wu06b`.

## WU-6b-2 — E2E del mail y verificación final (rama `feat/asignacion-automatica-por-tipo-wu06b`, sobre `...-wu06`)

Estado: WU-6 completa (6.1 a 6.6). Última WU de backend.

- 6.5: `ticket-asignado-notificacion.e2e.spec.ts` (4 tests, DB tenant efímera propia, `EMAIL_SENDER` falso, `usarLockMasterTest()`): alta con regla manda mail al responsable (texto "automáticamente", link al ticket); alta sin regla no manda; asignación manual avisa al asignado, la autoasignación también y la reasignación avisa al nuevo; asignación rechazada por ticket cerrado (422) no manda mail. Se quitó una llamada duplicada a `usarLockMasterTest()` del borrador.
- 6.6: `pnpm lint` y `pnpm typecheck` sin errores; `pnpm test` completo 667 archivos / 8076 tests verdes; ratchet de casts 617 en 114 archivos (sin cambio).

**Deuda de Ayuda para el cuerpo del PR:** la persona asignada recibe un mail cuando le asignan un ticket (por la regla del tipo o a mano). Sin edición de `backend/ayuda` mientras dure la pausa.
