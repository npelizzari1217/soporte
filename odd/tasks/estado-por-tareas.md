# El estado del ticket sigue a sus tareas (2026-10-16)

Completar una tarea pone el ticket EN_PROCESO (y lo asigna a quien completa si estaba NUEVO sin
responsable); completar la última lo pone RESUELTO; descompletar una tarea de un ticket RESUELTO lo
devuelve a EN_PROCESO. Aplica a todo ticket con tareas (las tareas son genéricas desde el punto 12).
Revierte la decisión ADR-2 / CA5 del punto 12 ("completar la última tarea NO resuelve el ticket").

## Specs
- S1. Alcance: todos los tipos de ticket con tareas (decisión del dueño, L2: "Todos los tipos con
  tareas"). No hay excepción por tipo.
- S2. Al completar una tarea con tareas activas pendientes: si el ticket está NUEVO pasa a EN_PROCESO
  por los arcos normales (NUEVO → ASIGNADO → EN_PROCESO); si está ASIGNADO pasa a EN_PROCESO. En
  cualquier otro estado no cambia. Si el ticket está NUEVO y no tiene responsable, quien completa pasa a
  ser el responsable (L2: "Quien completa pasa a ser responsable"), con operación ASIGNACION y evento
  `ticket.asignado` (origen `MANUAL`, autor = quien completa). Si ya tiene responsable, no se reasigna.
- S3. Al completar la última tarea activa pendiente (avance 100 %): el ticket pasa a RESUELTO por los
  arcos normales desde NUEVO, ASIGNADO, EN_PROCESO o ESPERANDO_CLIENTE (recorriendo ASIGNADO y
  EN_PROCESO si hace falta, con la misma asignación de S2 si estaba NUEVO sin responsable). En RESUELTO,
  CERRADO o CANCELADO no cambia nada. La transición a RESUELTO hace lo mismo que la manual: `fecha_cierre`,
  operación CAMBIO_ESTADO por arco, reloj de SLA y notificación de RESUELTO.
- S4. Al descompletar una tarea de un ticket RESUELTO: el ticket vuelve a EN_PROCESO (L2: "Vuelve a
  EN_PROCESO"), como salto correctivo del sistema (RESUELTO → EN_PROCESO no es un arco normal), con
  `fecha_cierre` en null, operación CAMBIO_ESTADO, reloj de SLA y evento de transición. En cualquier otro
  estado descompletar no cambia el estado. Supuesto declarado: aplica a cualquier ticket RESUELTO, haya
  sido resuelto por tareas o a mano; no se guarda de dónde vino la resolución.
- S5. Todo ocurre en la misma transacción que la tarea y su historial: si falla el cambio de estado, la
  tarea no queda completada. El autor de las operaciones es quien completó o descompletó. Las
  transiciones automáticas no exigen `TICKETS:TRANSICIONAR` ni `TICKETS:ASIGNAR` al actor: la
  autorización es la de completar la tarea (CA4).
- S6. Concurrencia: dos completados simultáneos de las dos últimas tareas dejan el ticket RESUELTO una
  sola vez (un solo CAMBIO_ESTADO a RESUELTO). Se serializa con un lock de la fila del ticket tomado
  antes de escribir la tarea.
- S7. Frontend: tras completar o descompletar, el detalle del ticket refresca estado y responsable sin
  recargar. La sección "Tareas" avisa en una línea que completar tareas mueve el estado del ticket.
- S8. Documentación: `docs/roadmap-comercial.md` registra la decisión como desviación acordada del
  punto 12 (CA5/ADR-2) con fecha; el comentario de `TicketEdiliciaEntity` que afirma lo contrario se
  corrige; deuda de Ayuda anotada.

## Tasks
- [x] T1 (S1-S4): política pura `tickets/domain/policies/estado-por-tareas.policy.ts`: dado estado
  actual, evento (completar/descompletar) y si quedan pendientes, devuelve los arcos a recorrer y si hay
  que asignar. Tests unitarios.
- [x] T2 (S2-S5): `ITicketRepository.bloquear(id)` (Prisma, `SELECT ... FOR UPDATE`), servicio de
  aplicación `AvanzarEstadoPorTareasService` que recorre los arcos dentro de la tx (asignación,
  CAMBIO_ESTADO, fecha_cierre, reloj, eventos post-commit), cableado en `CompletarTareaUseCase` y
  `DescompletarTareaUseCase`, módulo y fixtures. Tests unitarios.
- [x] T3 (S5-S6): integración en tenant efímero: últimas dos tareas en carrera → un solo RESUELTO;
  descompletar en RESUELTO → EN_PROCESO; fallo del cambio de estado deshace la tarea.
- [x] T4 (S7-S8): frontend (invalidación del ticket, aviso en "Tareas", tests), roadmap, comentario de
  la entidad, deuda de Ayuda.

## Log
- L1 (2026-10-16, dueño): "quiero que al cumplir todas las subtareas que se cargaron en edilicia
  automáticamente ponga el ticket en resuelto, y al hacer una de las subtareas que lo coloque al ticket
  en en proceso si es que aun esta en nuevo."
- L2 (2026-10-16, dueño), respuestas al cuestionario: alcance → "Todos los tipos con tareas"; en NUEVO
  sin responsable → "Quien completa pasa a ser responsable"; descompletar en RESUELTO → "Vuelve a
  EN_PROCESO".
- 2026-10-16, T1 (`09899d5f`): `estado-por-tareas.policy.ts`, 25 tests, RED→GREEN.
- 2026-10-16, T2 (`b88f8270`): `ITicketRepository.bloquear` (`FOR NO KEY UPDATE`),
  `AvanzarEstadoPorTareasService` (19 tests), cableado en completar/descompletar (4 tests nuevos: lock
  antes de escribir, servicio dentro de la tx, no corre si la escritura no aplica), módulo, fixtures de
  11 specs (`bloquear` en los dobles de `ITicketRepository`), comentario de `TicketEdiliciaEntity`.
  Backend: lint 0, typecheck 0, 762 tests unitarios de tickets.
- 2026-10-16, T3 (`f3f699ef`): `estado-por-tareas.integration.spec.ts`, 4 tests en tenant efímero; la
  carrera de las dos últimas tareas corre con `Promise.all` real y deja un solo CAMBIO_ESTADO a RESUELTO.
- 2026-10-16, T4: `useCompletarTarea`/`useDescompletarTarea` invalidan `["ticket", id]` y `["tickets"]`;
  aviso al pie de "Tareas"; 2 tests nuevos (RED→GREEN con el código de producción stasheado). Roadmap:
  decisión registrada como desviación acordada de CA5 del punto 12, `check-roadmap-fresco` pasa; deuda
  de Ayuda anotada. Frontend: lint 0, tsc 0, 214 tests de tickets.
- 2026-10-16, T4 commit `8de5da47`.
- 2026-10-16, verificación independiente (`gentle-ai-verify`, S1-S8): S1-S7 PASS con evidencia por
  línea; S8 FAIL por `backend/ayuda/reparaciones-edilicias.md`, que afirmaba "llegar al 100% no cierra
  la reparación". Corregido en `35f8d29d` (un artículo que un cambio vuelve falso se corrige aunque la
  Ayuda esté en pausa). Sin casts, `any`, `!` ni catch vacíos en el diff.
- Advertencias del verificador, no causadas por este cambio y sin resolver (decisión del dueño):
  - A1: `TransicionarEstadoUseCase`, editar y asignar cargan el ticket fuera de la transacción y no
    toman el lock; una escritura manual con lectura vieja puede pisar un estado que las tareas acaban
    de poner. Ya pasaba entre dos escrituras manuales; ahora es más probable. Arreglo posible:
    bloquear y releer dentro de la transacción en esas tres escrituras.
  - A2: agregar o borrar tareas no mueve el estado (fuera del alcance pedido).
- 2026-10-16, suite completa backend: 745 archivos, 8935 tests; el único rojo era el e2e
  `tareas-ticket.e2e.spec.ts` "completa su tarea, pero no ... transiciona el ticket", que consagraba la
  conducta vieja. Ajustado a la regla nueva (RESUELTO con fecha de cierre, responsable intacto, PATCH
  manual sigue en 403); 22/22 en verde aislado.
- 2026-10-17, revisión nativa RDD (`review-35c2ed2c1bea26d8`, riesgo medio, lentes risk + reliability,
  rango `main..HEAD` commiteado): aprobada y acusada. Tres observaciones informativas, ninguna abre
  corrección: la misma A1 (escrituras manuales sin lock), y que la guarda `if (!permitido) break` del
  servicio no tiene test (hoy inalcanzable con el grafo base). Pendiente del dueño: decidir sobre A1,
  merge y deploy.

- 2026-10-17, en producción: merge --no-ff a `main` (`ad8d3854`), push y deploy en el VPS (DEPLOY OK, 9 tenants
  sin migraciones pendientes, smoke externo 200). Rollback documentado por el script: `b4f09ecb`.
