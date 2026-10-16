# Las escrituras manuales del ticket bloquean y releen (2026-10-17)

Cierra la advertencia A1 de `odd/tasks/estado-por-tareas.md`: transicionar, editar, asignar y
"asignar y poner en proceso" cargaban el ticket fuera de la transacción y guardaban la fila entera,
así que una lectura vieja podía pisar un estado recién escrito por otro actor (ahora también por las
tareas). Rama apilada sobre `feat/estado-por-tareas` (usa `ITicketRepository.bloquear`).

## Specs
- S1. `TransicionarEstadoUseCase`: la carga del ticket, la resolución del estado actual, la validación
  del arco (entidad + máquina + salto correctivo), la mutación y el guardado corren dentro de una sola
  transacción, con `bloquear(ticketId)` antes de la carga. Lo que no depende del ticket (resolver el
  estado destino por código) puede quedar antes. Un ticket inexistente o borrado sigue dando 404.
- S2. `EditarTicketUseCase`: igual que S1; hoy no tiene transacción, se le inyecta
  `ITenantTransactionRunner`. La regla "fuera de NUEVO/ASIGNADO solo edita ROOT" se evalúa sobre el
  ticket releído. Las validaciones de catálogo (prioridad, sector) quedan antes.
- S3. `AsignarTicketUseCase`: las consultas a master (usuario activo, elegibilidad por módulo) quedan
  fuera de la transacción, con la primera carga del ticket (404 y `tipoId`). Dentro: lock, relectura,
  terminal (`TicketCerradoNoReasignableError`), "era NUEVO" y la escritura, todo sobre el releído.
- S4. `AsignarYPonerEnProcesoUseCase`: igual que S3; el camino de arcos hasta EN_PROCESO se resuelve y
  valida sobre el ticket releído, dentro de la transacción.
- S5. Integración en tenant efímero, para cada uno de los cuatro, con una lectura vieja: entre la
  primera carga y la transacción, por debajo, se completa la última tarea del ticket (queda RESUELTO
  por `odd/estado-por-tareas`). Resultado esperado, sobre la base real:
  - transicionar EN_PROCESO → ESPERANDO_CLIENTE: `TransicionInvalidaError` (RESUELTO → ESPERANDO_CLIENTE
    no es arco) y el ticket sigue RESUELTO con su `fecha_cierre`;
  - editar como no ROOT: `TicketBloqueadoParaEdicionError` (RESUELTO) y el título no cambia;
  - asignar: aplica (RESUELTO no es terminal), cambia el responsable y el ticket sigue RESUELTO, sin
    CAMBIO_ESTADO a ASIGNADO;
  - asignar y poner en proceso: `TransicionInvalidaError` y el ticket sigue RESUELTO.
- S6. Los tests unitarios que afirmaban "sin tocar la tx" ante un rechazo pasan a afirmar "sin
  escribir" (`save` y `operacionRepo.save` no llamados): con el lock primero, la transacción se abre
  antes de validar. El resto de su cobertura no cambia.

## Tasks
- [ ] T1 (S1, S6): `TransicionarEstadoUseCase` + spec.
- [ ] T2 (S2, S6): `EditarTicketUseCase` + spec + módulo.
- [ ] T3 (S3, S4, S6): `AsignarTicketUseCase`, `AsignarYPonerEnProcesoUseCase` + specs.
- [ ] T4 (S5): `escrituras-manuales-con-lock.integration.spec.ts`.

## Log
- L1 (2026-10-17, dueño), ante las tres opciones (A: bloquear y releer en las escrituras manuales;
  B: guardado condicional con 409; C: deuda): "hagamos A".
