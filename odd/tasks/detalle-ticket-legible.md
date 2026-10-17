# Detalle del ticket legible y edición de reparaciones en Edilicia (2026-10-17)

El detalle del ticket se lee mal: las secciones no se distinguen. Tareas y Actividad pasan a tarjetas
como la de Acciones, la Actividad se invierte (lo más nuevo arriba) con el formulario de comentario
arriba de la lista, y cada tarjeta lleva en modo claro un fondo pastel propio. En Edilicia aparece
"Editar" para una reparación que todavía no se empezó a trabajar y no está bloqueada; hoy no existe
(la ubicación propia de Edilicia no se edita desde ningún lado).

## Specs
- S1. Tarjetas. Tareas, Actividad y Nuevo comentario se muestran cada una dentro de una tarjeta con
  título, igual que Acciones (`<section>` con borde, fondo y padding). L1: "las tareas necesitaría
  entrar dentro de una etiqueta al igual que los comentarios".
- S2. Orden de la Actividad: toda la línea de tiempo (comentarios, cambios de estado, asignaciones,
  tareas, adjuntos) se muestra de la más nueva a la más vieja (decisión L2: "Toda la Actividad, lo más
  nuevo arriba"). El formulario "Nuevo comentario" y la carga de adjuntos van arriba de la lista, dentro
  de la misma tarjeta "Actividad". El backend sigue devolviendo ascendente; invierte el frontend.
- S3. Colores en modo claro: cada tarjeta tiene un fondo pastel distinto (Acciones, Tareas, Actividad),
  definidos como tokens CSS en `styles/globals.css` solo para `:root`; en modo oscuro las tres usan el
  fondo de tarjeta de siempre. L1: "A cada etiqueta en modo día, le colocaría un color de fondo
  distinto en tonos suaves y pastel". El texto conserva contraste AA sobre el pastel.
- S4. Backend: `PATCH /reparaciones/:reparacionId` (`EDILICIA:MODIFICACION`) edita título, descripción,
  ubicación de Edilicia, prioridad y sector (decisión L2). Caso de uso `EditarReparacionUseCase`: con la
  fila del ticket bloqueada y releída dentro de la transacción (como las demás escrituras manuales),
  actualiza `tickets` y `ticket_edilicia` juntos, con operación en el historial si cambia la prioridad
  (mismo evento `ticket.reprioritizado` que editar el ticket).
- S5. Regla "no se empezó a trabajar" (decisión L2: "Nuevo o Asignado, sin tareas completadas"): se
  edita si el estado es NUEVO o ASIGNADO y ninguna tarea activa está completada. Fuera de eso, solo
  ROOT. Una reparación **bloqueada** (con una compra activa vinculada) no se edita, ni siquiera ROOT
  (L1: "o que no este bloqueada"). Rechazo: `ReparacionNoEditableError` → 422 con el motivo
  ("en proceso", "con tareas completadas" o "bloqueada por una compra").
- S6. Frontend Edilicia: botón "Editar" en cada fila del listado que abre un diálogo con los cinco
  campos precargados. Cuando la regla de S5 no se cumple, el botón se muestra deshabilitado con el motivo
  visible; el backend sigue siendo la autoridad. Al guardar, el listado se refresca.
- S7. Documentación: roadmap (decisión fuera de los puntos), artículos de Ayuda que el cambio vuelve
  falsos (`reparaciones-edilicias.md`, `reparaciones-listado.md` si describen que no se edita), deuda de
  Ayuda anotada.

## Tasks
- [x] T1 (S4, S5): backend: `EditarReparacionUseCase`, error, DTO, ruta, módulo; tests unitarios, spec
  del controller y e2e de autorización/regla.
- [x] T2 (S1, S2, S3): frontend detalle: tarjetas, orden inverso, formulario arriba, tokens pastel;
  tests.
- [x] T3 (S6): frontend Edilicia: `ReparacionEditDialog`, hook, schema, regla en UI; tests.
- [x] T4 (S7): roadmap, Ayuda, deuda.

## Log
- L1 (2026-10-17, dueño): "Perfecto funciono. Ahora al ver como queda la edicion del tiquet, siento
  que no esta prolijo y qu cuesta leer los sctores que tiene, las tareas necesitaria entar dentro de
  una etiqueta al igual que los comentarios; los comentarios los ordenaria por fecha+hora en forma
  inversa para ver mas arriba las ultimas noticias.A cada etiqueta en modo dia, le colocaría un color
  de fondo distinto en tonos suaves y pastel para que sea mas facil reconocerlo.En Edilicia permitiría
  editar una reparacion siempre y cuando aún no se haya comenzado a trabajar sobre ella o que no este
  bloqueada.Pregunta cualquir duda que tengas"
- L2 (2026-10-17, dueño), cuestionario: orden → "Toda la Actividad, lo más nuevo arriba"; "no se haya
  comenzado a trabajar" → "Nuevo o Asignado, sin tareas completadas"; campos → "Título, descripción,
  ubicación, prioridad y sector".
- 2026-10-17, T1 (`c5c5ca8f`): `EditarReparacionUseCase` (12 tests), `ReparacionNoEditableError` (422),
  `EditarReparacionHttpDto`, `PATCH /reparaciones/:id` con `EDILICIA:MODIFICACION`, módulo; controller
  spec (44) con el catálogo cerrado de errores en 5; e2e: edita con permiso y deja de poder al completar
  una tarea; 403 sin permiso. `TicketEdiliciaEntity.actualizarUbicacion`.
- 2026-10-17, T2 (`eff6f3bb`): tokens `--seccion-acciones/tareas/actividad` (pastel en `:root`, `--card`
  en `.dark`), tarjetas Tareas y Actividad, formulario y adjunto arriba de la línea de tiempo, orden
  inverso en `TicketTimeline` (ordena por `createdAt`). 2 tests RED→GREEN. Frontend: lint 0, tsc 0.
- 2026-10-17, T3 (`f59c8da4`): el listado trae `descripcion` y `prioridadId` (aditivo, para precargar);
  `puedeEditarReparacionUi` (7 tests), `useEditarReparacion`, `editarReparacionSchema`,
  `ReparacionEditDialog`, columna "Editar" gateada por `Can`. 4 tests en el listado, uno hace el PATCH
  completo y verifica el refresco.
- 2026-10-17, T4: roadmap (decisión + deuda de Ayuda). Ningún artículo de Ayuda quedó falso: el de
  reparaciones no afirmaba que no se pudiera editar; la columna nueva queda como deuda anotada.
- 2026-10-17, cierre (sobre `09bd799c`, tras un cuelgue de Pi que interrumpió la verificación): las seis
  compuertas en verde. Backend: lint 0, typecheck 0, tests 747 archivos / 8967 pasan. Frontend: lint 0,
  type-check 0, tests 274 archivos / 2323 pasan. Los `CORREO_CLIENTE_ERROR` en el log son el adapter
  de correo fallando a propósito en sus specs, no un fallo. Pendiente del dueño: push, PR y merge.
- 2026-10-17, merge y deploy: merge local `42459def` (sin PR, como las tres features anteriores). CI:
  `gates` y `gates-frontend` verdes; `gates-backend` venía rojo desde el 2026-10-16 por `@scarf/scarf`
  con pnpm 11 (fix aparte, merge `11647cf2`, CI verde). Deploy por SSH sobre `11647cf2`: dump
  verificado `utc-backfill-20261017-095230` (10 bases), `DEPLOY OK`, rollback `ad8d3854`. Sin
  migraciones ni cambios de deps. Smoke: front 307, `PATCH /api/reparaciones/:id` 401 sin token y 404
  en ruta inventada, cero errores en los logs de servicio tras el arranque.
