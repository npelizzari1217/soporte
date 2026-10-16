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
- [ ] T1 (S1-S4): política pura `tickets/domain/policies/estado-por-tareas.policy.ts`: dado estado
  actual, evento (completar/descompletar) y si quedan pendientes, devuelve los arcos a recorrer y si hay
  que asignar. Tests unitarios.
- [ ] T2 (S2-S5): `ITicketRepository.bloquear(id)` (Prisma, `SELECT ... FOR UPDATE`), servicio de
  aplicación `AvanzarEstadoPorTareasService` que recorre los arcos dentro de la tx (asignación,
  CAMBIO_ESTADO, fecha_cierre, reloj, eventos post-commit), cableado en `CompletarTareaUseCase` y
  `DescompletarTareaUseCase`, módulo y fixtures. Tests unitarios.
- [ ] T3 (S5-S6): integración en tenant efímero: últimas dos tareas en carrera → un solo RESUELTO;
  descompletar en RESUELTO → EN_PROCESO; fallo del cambio de estado deshace la tarea.
- [ ] T4 (S7-S8): frontend (invalidación del ticket, aviso en "Tareas", tests), roadmap, comentario de
  la entidad, deuda de Ayuda.

## Log
- L1 (2026-10-16, dueño): "quiero que al cumplir todas las subtareas que se cargaron en edilicia
  automáticamente ponga el ticket en resuelto, y al hacer una de las subtareas que lo coloque al ticket
  en en proceso si es que aun esta en nuevo."
- L2 (2026-10-16, dueño), respuestas al cuestionario: alcance → "Todos los tipos con tareas"; en NUEVO
  sin responsable → "Quien completa pasa a ser responsable"; descompletar en RESUELTO → "Vuelve a
  EN_PROCESO".
