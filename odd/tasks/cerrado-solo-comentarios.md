# Ticket resuelto, cerrado o cancelado: solo comentarios

En RESUELTO, CERRADO y CANCELADO, usuario, técnico y colaborador solo pueden comentar: ni tareas, ni
campos, ni adjuntos, ni compras. ADMINISTRADOR y ROOT quedan exentos. Rama sobre feat/ticket-unificado.

## Specs

- **S1** — "un usuario, un tecnico, o un colaborado, no puede editar ni nada en ningun tipo de ticket ni
  en edilicia si esta cumplido, o cancelado; solo puede agregar comentarios pero no tareas ni medificar
  campos o editar".
- **S2** — Estados: RESUELTO, CERRADO y CANCELADO (L2).
- **S3** — ADMINISTRADOR y ROOT exentos: pueden corregir y reabrir (L2).
- **S4** — En esos estados comenta cualquiera que pueda comentar el ticket, públicos e internos (L2); hoy
  los públicos dan 422 (`crear-comentario.use-case.ts:25`).
- **S5** — Adjuntos y vincular/desvincular compras bloqueados en esos estados (L2).
- **S6** — El frontend espeja las reglas (no ofrece lo que el backend rechaza) en Tickets y Edilicia.

## Tasks

- [x] T1 — S1-S6 — worker — guards de backend y gating de frontend — (este commit)

- [x] T2 — S1, S3, L11 — worker — borrado lógico bloqueado en esos estados para quien no es administrador
  — (este commit)

## Log

- **L1** (dueño, 2026-10-23) — pedido S1, textual.
- **L2** (decisiones del dueño, 2026-10-24) — "Resuelto, Cerrado y Cancelado"; "No, quedan exentos (rec.)"
  (ADMINISTRADOR y ROOT); comentarios "Todos, públicos e internos"; adjuntos y compras "No (recomendado)".
- **L3** (evidencia, mapeo) — `ticket-cerrado-solo-lectura` ya bloquea tareas en CERRADO/CANCELADO para
  todos los roles (`ticket-editable-para-tareas.ts:12`); `editar-ticket.use-case.ts:119-131` deja editar
  solo en NUEVO/ASIGNADO salvo ROOT; asignar ya da 422 en terminales; adjuntos
  (`adjuntar-archivo.use-case.ts`) y compras sin guard de estado; ROOT/ADMIN reabren por salto
  correctivo (`transicionar-estado.use-case.ts:207-210`). Consecuencia comunicada al dueño: en RESUELTO un
  técnico ya no puede descompletar una tarea (que reabría el ticket); reabrir queda para administradores.
- **L4** (decisión, T1/S1-S3) — Regla única `ticketSoloComentarios(estadoCodigo, actorEsAdministrador)` en
  `tickets/domain/policies/solo-comentarios.policy.ts`, aplicada por `exigirModificableEnEstado` y
  `verificarTicketModificable` (`tickets/application/services/solo-comentarios.ts`) después de la
  autorización (404/403 mandan antes). Error único `TicketSoloComentariosError` (422,
  `TICKET_SOLO_COMENTARIOS`): "El ticket está {resuelto|cerrado|cancelado}: solo admite comentarios. Solo
  un administrador puede modificarlo o reabrirlo." Administrador = `permisosPorTipo === null` en el
  alcance (lo que `CargadorAlcanceTicket` da solo a ADMINISTRADOR y ROOT; la API v1 siempre arma un mapa) y
  `ActorTarea.esAdministrador` en tareas. La usan: editar ticket y reparación, las cinco acciones de
  tareas, adjuntos (al ticket y a una operación), vincular (también con la fila bloqueada, antes del
  INSERT) y desvincular compras, asignar y asignar-en-proceso, la transición y `POST /soporte/:id/solucion`.
  Los flujos de sistema sin actor no pasan por la regla.
- **L5** (decisión, T1/S3) — Sin ampliar la edición de campos: fuera de NUEVO/ASIGNADO el ADMINISTRADOR
  (no ROOT) sigue recibiendo `TicketBloqueadoParaEdicionError` (403) en `PATCH /tickets/:id` y el motivo
  EN_PROCESO en `PATCH /reparaciones/:id`; corregir campos en esos estados sigue siendo de ROOT. Tareas: en
  CERRADO y CANCELADO, ADMINISTRADOR y ROOT pasan a estar exentos (antes nadie, odd/ticket-cerrado-solo-lectura
  S1, superada); el bloqueo por compra sigue para todos y `TareaTicketNoEditableError` queda solo para él.
  Asignar: CERRADO/CANCELADO siguen con `TicketCerradoNoReasignableError` para todos; RESUELTO pasa a 422
  para quien no es administrador. Transición: quien no es administrador no saca al ticket de esos estados
  (el grafo ya no tenía esos arcos; ahora el 422 nombra el motivo); RESUELTO → CERRADO sigue permitido y los
  administradores reabren por salto correctivo como antes.
- **L6** (decisión, T1/S4) — Comentarios públicos e internos en RESUELTO, CERRADO y CANCELADO: se retiró el
  422 y `ComentarioNoPermitidoError`. El comentario no cambia el estado: `ReanudarPorComentarioListener`
  solo actúa en ESPERANDO_CLIENTE. El público avisa al solicitante y encola el webhook `ticket.comentado`
  como cualquier otro, pero no registra primera respuesta: el ticket ya no la espera (mismo criterio que
  el barrido de SLA, `ESTADOS_SIN_PRIMERA_RESPUESTA_PENDIENTE`). La API v1 dejó de documentar el 422 de
  comentar.
- **L7** (consecuencia, T1) — Cambian respuestas visibles: editar en esos estados, para quien no es ROOT ni
  administrador, pasa de 403 a 422; asignar en RESUELTO a un no administrador pasa de 200 a 422; un
  comentario público en esos estados pasa de 422 a 201. `bloquearTicketActivo` devuelve el ticket releído
  (o `null`) en vez de un booleano, para que vincular decida sobre el estado vigente.
- **L8** (decisión, T1/S6) — Frontend: `motivoSoloComentarios` / `ticketSoloComentariosUi`
  (`features/tickets/lib/solo-comentarios.ts`) espejan la regla con `esAdminCliente`. Detalle del ticket: sin
  Editar, Responsable, adjuntar, acciones de tareas ni de compras, con el motivo en «Ticket»; el formulario
  de comentario (público e interno) sigue. Edilicia: Editar deshabilitado con motivo `SOLO_COMENTARIOS`
  que nombra el estado, subtareas de solo lectura y «Ver compras» en vez de «Gestionar compras». El control
  de estado no cambió (desde RESUELTO solo ofrece CERRADO; en CERRADO/CANCELADO no hay arcos).
- **L9** (fuera de alcance, para el dueño) — `DELETE /tickets/:id` no se tocó: el borrado lógico con
  `BORRADO` sobre el tipo sigue permitido en cualquier estado (odd/permisos-por-tipo-ticket, L40). Si S1
  ("ni nada") debe alcanzarlo, es una decisión aparte.
- **L10** (evidencia, T1) — El cliente Prisma tenant estaba generado desde otra rama (sin `ticketCompra`);
  se regeneró con `pnpm prisma generate --schema prisma_tenant/schema.prisma` (autorizado). Backend: `pnpm
  lint` y `pnpm typecheck` en cero; specs afectados de a uno, incluidos `tickets.e2e`, `tareas-ticket.e2e`,
  `reparaciones.e2e`, `integraciones-api-v1-tickets.e2e`, las integraciones de tareas, estado por tareas,
  lock, borrado y primera respuesta. Frontend: `pnpm lint`, `pnpm type-check` y `pnpm test` (2502) verdes.
  Ayuda: `reparaciones-edilicias.md` corregida (descompletar en RESUELTO es de administradores; sección
  nueva "Reparación resuelta, cerrada o cancelada").
- **L11** (dueño, 2026-10-24) — "Si bloquea el borrado de ticket como dices": el borrado lógico
  (`DELETE /tickets/:id`) también queda bloqueado en RESUELTO, CERRADO y CANCELADO para quien no es
  ADMINISTRADOR ni ROOT (resuelve L9).
- **L12** (decisión y evidencia, T2/S1, S3, L11) — `BorrarTicketUseCase` aplica `verificarTicketModificable`
  con `esAlcanceDeAdministrador`: en RESUELTO, CERRADO y CANCELADO quien no es ADMINISTRADOR ni ROOT
  recibe `TicketSoloComentariosError` (422, mismo mensaje que T1); los administradores borran como antes.
  Orden: 404 y 403 (`cargarTicketParaOperar`) → PREVENTIVO (422) → dentro de la transacción, el estado →
  pendientes (422). El estado va antes que pendientes porque en esos estados ese actor tampoco puede
  resolverlas. Carrera: el caso de uso solo tomaba el lock; ahora usa `bloquearTicketActivo` y decide
  sobre el ticket **releído** con el lock (un ticket cerrado mientras esperaba da 422; uno reabierto
  por un administrador, se borra). Nueva dependencia `ESTADO_REPOSITORY` en el provider. `POST
  /tickets/:id/recuperar` ya era solo de administradores (`RecuperarTicketUseCase`, 403 si
  `permisosPorTipo !== null`); no se tocó. Frontend: el detalle no ofrece «Borrar» cuando
  `motivoSoloComentarios` da motivo; Edilicia no tiene botón de borrar ticket. Ayuda: ningún artículo
  dice que se borra en cualquier estado ni documenta el borrado de tickets; sin cambios (queda para la
  tanda final de Ayuda). RED observado antes del fix: unit 5 fallos (`Result.ok` donde se esperaba el
  422; con una tarea pendiente, `TicketConPendientesNoBorrableError`), integración 1 (`expected false to
  be true`: el borrado del ticket cerrado en carrera pasaba), e2e 3 (`expected 204 to be 422`), frontend
  3 (`expected <button> to be null`). GREEN: `borrar-ticket.use-case.spec` 25, `borrar-ticket.concurrencia
  .integration.spec` 5, `borrar-ticket.e2e.spec` 11, `tickets.controller.spec` 87, `recuperar-ticket
  .use-case.spec` 4. Backend `pnpm lint` y `pnpm typecheck` en cero. Frontend `pnpm lint`, `pnpm
  type-check` y `pnpm test` (2509) verdes.
- **L13** (decisión y evidencia, seguimiento de la verificación de T1, S1-S4) — Carrera en las cinco
  acciones de tareas: la regla del estado corría solo antes de la transacción. Ahora, con el lock
  tomado, cada una relee el ticket con `bloquearTicketActivo` y repite la regla sobre ese ticket con
  `VerificadorTicketEditable.verificarEstado` (nuevo; usa `verificarTicketModificable`), igual que
  asignar y vincular. Un ticket resuelto, cerrado o cancelado mientras esperaba el lock da
  `TicketSoloComentariosError` (422) a quien no es administrador, sin escribir. El bloqueo por compra
  sigue verificándose solo antes de la transacción (fuera de alcance). Cambio colateral: asignar técnico
  y eliminar no tomaban el lock y completar no releía el ticket; ahora los tres lo hacen, así que un
  ticket borrado en el medio da `TicketNoEncontradoError` (404) como ya pasaba en crear y descompletar
  (L45). RED observado antes del fix: unit 7 fallos (las 5 acciones con `expected false to be true`, la
  escritura pasaba; 2 casos hermanos de administrador porque asignar y eliminar no llamaban a
  `bloquear`); integración `tareas-ticket.concurrencia` 1 (`expected false to be true`, con la
  verificación en la transacción desactivada temporalmente en completar). Regresiones agregadas: matriz
  completa de la política (7 estados × administrador o no, y el código desconocido `X`); transición de
  sistema (`alcance` null) desde ESPERANDO_CLIENTE; la clave v1 nunca recibe `permisosPorTipo: null`
  (con todas las celdas, rol ADMINISTRADOR y sin tipos de v1); e2e v1 comentario sobre ticket CERRADO
  → 201; Edilicia: ADMINISTRADOR en RESUELTO y CANCELADO → EN_PROCESO. Ya cubiertos, sin duplicar:
  transición no administrador → `TicketSoloComentariosError` y administrador con corrector; asignar
  (administrador en RESUELTO, en CERRADO, carrera a RESUELTO); Edilicia ROOT y bloqueada con ROOT;
  detalle no administrador en CERRADO (comentario público e interno, sin adjuntar ni Responsable).
  GREEN: `tareas-ticket.use-cases.spec` 146, `tareas-ticket.concurrencia.integration` 12,
  `solo-comentarios.policy.spec` 17, `transicionar-estado.use-case.spec` 41, `tickets-v1.controller
  .spec` 13, `integraciones-api-v1-tickets.e2e` 11, `borrar-ticket.concurrencia` 5,
  `escrituras-manuales-con-lock` 4, `estado-por-tareas` 4, `tareas-ticket.atomicidad` 4,
  `tareas-ticket.e2e` 27, `tareas-ticket.controller.spec` 15, `reparaciones.e2e` 32. Backend `pnpm lint`
  y `pnpm typecheck` en cero. Frontend `pnpm lint`, `pnpm type-check` y `pnpm test` (2511) verdes.
- **Deploy** (2026-10-25) — En produccion con `main` 6595d838 (merge de integracion/deploy-2026-10-25): DEPLOY OK, 7 migraciones tenant en los 9 tenants, verificacion posterior igual a la foto previa (4 vinculos, 11 comentarios internos, 0 planes sin tipo, 5 valoraciones MIGRACION). Dump previo C:\soporte\backups\utc-backfill-20261024-205055; rollback de codigo 3b13b320.
