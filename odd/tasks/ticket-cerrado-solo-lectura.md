# Ticket cerrado, cancelado o bloqueado: tareas y comentarios de solo lectura (2026-10-17)

Hoy las subtareas (endpoint genérico de tareas de ticket) y los comentarios de reparación se aceptan en
cualquier estado del ticket; solo se chequea permiso. Pasan a ser de solo lectura cuando el ticket está
CERRADO o CANCELADO, y en Edilicia también cuando la reparación está bloqueada por una compra activa.
Ver sigue funcionando igual.

## Specs
- S1. Regla de tareas (todos los tickets, decisión L2): un ticket en estado CERRADO o CANCELADO no acepta
  crear, completar, descompletar, eliminar ni asignar técnico a sus tareas (decisión L2: "Todas las
  acciones"). RESUELTO no bloquea (decisión L2: "No, solo los tres que dije"). Rechazo: 422
  `TareaTicketNoEditableError` con el motivo ("El ticket está cerrado y no acepta cambios en sus
  tareas." / "...cancelado..."). La regla se evalúa después de la autorización (404/403 siguen mandando
  antes) y vale para cualquier actor, incluido ROOT.
- S2. Bloqueo por compra (solo Edilicia): si el ticket tiene una reparación bloqueada por una compra
  activa (`comprasQueBloquean` no vacío, mismo criterio que el chip "Bloqueada" del listado), tampoco
  acepta ninguna acción sobre sus tareas. Motivo: "La reparación está bloqueada por una compra en
  curso y no acepta cambios en sus tareas." Un ticket sin reparación nunca está bloqueado. Puerto nuevo
  del módulo tickets (`IBloqueoTicketRepository.estaBloqueadoPorCompra(ticketId)`), implementado en
  Prisma reutilizando el mapper y `comprasQueBloquean` de reparaciones.
- S3. Comentarios de reparación: `POST /reparaciones/:id/comentarios` se rechaza con 422
  `ComentarioReparacionNoPermitidoError` cuando el ticket está CERRADO o CANCELADO o la reparación
  está bloqueada por una compra, con los mismos motivos. `GET` de comentarios sigue siempre.
- S4. Frontend: `TicketTareas` recibe `motivoSoloLectura` y, cuando viene, no muestra el formulario de
  alta, ni asignar técnico, ni completar/descompletar, ni eliminar; muestra el motivo como nota. La
  lista sigue visible. Un helper `motivoTareasSoloLectura(estadoCodigo, bloqueada)` espeja S1 y S2 y
  lo usan el detalle del ticket (sin bloqueo por compra: ese dato no viaja en el detalle) y
  `SubtareasDialog` (con `estadoCodigo` y `bloqueada` de la fila). Catálogo de estados sin resolver →
  sin bloqueo en UI (decide el backend).
- S5. Frontend Edilicia: `ComentariosDialog` recibe `motivoSoloLectura`; con motivo, oculta el formulario
  "Nuevo comentario" y muestra la nota; la lista sigue visible.
- S6. Documentación: deuda de Ayuda anotada (Ayuda suspendida); roadmap si corresponde.

## Tasks
- [x] T1 (S1, S2): backend tareas: error, puerto + repo Prisma, regla compartida en
  `ticket-editable-para-tareas.ts`, los 5 casos de uso, módulo, mapeo 422; tests unitarios de los 5 casos
  (CERRADO, CANCELADO, bloqueada, RESUELTO permitido), spec del repo, controller spec.
- [x] T2 (S3): backend comentarios de reparación: error, caso de uso, módulo, mapeo; tests.
- [x] T3 (S4, S5): frontend: helper, `TicketTareas`, detalle, `SubtareasDialog`, `ComentariosDialog`,
  listado; tests.
- [x] T4 (S6): docs.

## Log
- L1 (2026-10-17, dueño): "Cuando en edilicia un ticket fue cerrado, bloqueado o canselado ya no se
  tiene quepoder agregar ni sub tareas ni comentarios, pero se pueden seguir viendo"
- L2 (2026-10-17, dueño), cuestionario: alcance de la regla de tareas → "A todos los tickets"; acciones
  → "Todas las acciones" (crear, completar, descompletar, eliminar); RESUELTO → "No, solo los tres que
  dije" (CERRADO, CANCELADO, bloqueada por compra).
- Hallazgo previo: los comentarios del ticket (no los de reparación) ya se rechazan en
  RESUELTO/CERRADO/CANCELADO (`ComentarioNoPermitidoError`); no se tocan. "Bloqueado" en Edilicia no es
  un estado del ticket: es `bloqueada` (compra activa vinculada).
- 2026-10-17, T1: `TareaTicketNoEditableError` (motivo cerrado/cancelado/bloqueado, 422),
  `IBloqueoTicketRepository` + `PrismaBloqueoTicketRepository` (reutiliza el mapper y
  `comprasQueBloquean` de reparaciones), `VerificadorTicketEditable` (estado terminal manda antes que el
  bloqueo; RESUELTO no bloquea), inyectado en los 5 casos de uso después de la autorización. Tests:
  18 nuevos en el spec unitario (matriz 5 acciones × 3 causas, RESUELTO permitido, orden 404/403
  antes de 422, sin escrituras), mutación verificada (sin el `if` en crear: 4 rojos), 3 de integración
  del repo (sin reparación, compra activa, cancelada/eliminada/por ticket), mapeo en controller spec.
  Los 4 specs de integración de tareas reciben un verificador inerte. Gotcha: el CHECK
  `compras_cancelacion_atomica_check` exige fecha, autor y motivo de cancelación juntos en el fixture.
- 2026-10-17, T2: `ComentarioReparacionNoPermitidoError`; `CrearComentarioReparacionUseCase` relee el
  ticket y reutiliza `VerificadorTicketEditable` (exportado por `TicketsModule`), traduciendo el
  error. 5 tests nuevos; catálogo cerrado de errores de reparaciones 5 → 6; mapeo 422 en controller.
- 2026-10-17, T3: `motivoTareasSoloLectura` en `permisos-tareas.ts` (3 tests); `TicketTareas` con
  `motivoSoloLectura` (apaga gestión y completado, muestra `role="note"`; 2 tests);
  `SubtareasDialog` recibe `estadoCodigo` y `bloqueada`; `ComentariosDialog` recibe el motivo y oculta el
  formulario (1 test); el listado los pasa desde la fila (2 tests, uno por fila cerrada y bloqueada,
  mutación verificada); el detalle pasa solo el estado. Frontend: lint 0, type-check 0.
  Gotcha: el front no tiene Prettier; un `prettier --write` reformateó 365 líneas ajenas y hubo que
  rehacer los cambios a mano.
- 2026-10-17, T4: roadmap (decisión fuera de los puntos + deuda de Ayuda en
  `reparaciones-edilicias.md`, que queda incompleto pero no falso).
- 2026-10-17, cierre: commits T1 `36442a50`, T2 `3cce9b3e`, T3 `66bfd051`, T4 `376678df` en
  `feat/ticket-cerrado-solo-lectura`. Backend: lint 0, typecheck 0, ratchet de casts sostenido, tests
  748 archivos / 8996 pasan. Frontend: lint 0, type-check 0, tests 274 archivos / 2332 pasan.
  Pendiente del dueño: merge a main y deploy.
- 2026-10-17, verificación independiente (gentle-ai-verify): S1-S6 cumplidos, sin bloqueantes. Assess
  nativo: riesgo medio, `reviewDue: false` (bajo presupuesto), sin revisión nativa. Advisorias cerradas en
  `e42a8f7b`: test del cableado del detalle (mutación a `null` → rojo) y la nota del detalle ya no dice
  "y comentarios" (los comentarios internos del ticket siguen permitidos). Advisoria aceptada sin
  cambio: `verificar()` corre antes de la transacción; una carrera con el cierre del ticket en el mismo
  instante podría colar una escritura (ventana mínima, mismo patrón que la autorización).
