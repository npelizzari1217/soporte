# Ubicación y sector en el ticket (2026-10-15)

## Objetivo
Que todo ticket pueda llevar una Ubicación (texto libre) y un Sector (de los sectores del cliente),
los dos opcionales, visibles en los listados de tickets y de Edilicia, y que el botón de tareas de
Edilicia muestre cuántas hay.

## Decisión de producto
`docs/roadmap-comercial.md`, sección "Decisiones de producto de la segunda etapa", viñeta
**Ubicación y sector en el ticket** (decisiones del dueño del 2026-10-15). Cada viñeta es un criterio
de aceptación abajo.

## Criterios de aceptación
- CA1 (viñeta 1): todo ticket admite `ubicacion` (texto libre, hasta 255, opcional) y `sectorId`
  (opcional, un sector existente del cliente). Verificación: alta y edición por `POST /tickets` y
  `PATCH /tickets/:id` con y sin los campos; un sector inexistente da error de dominio; `null` en la
  edición los limpia.
- CA2 (viñeta 2): Edilicia conserva `ticket_edilicia.ubicacion`; la Ubicación general es otra
  columna y en los tickets de Edilicia no se muestra ni se carga (alta de Edilicia sin el campo;
  edición y detalle la ocultan para el módulo EDILICIA). El Sector sí se carga y se ve en Edilicia.
- CA3 (viñeta 3): el formulario público y la API v1 no aceptan los campos. Verificación: sus DTOs y
  el mapeo explícito no los pasan (test en v1).
- CA4 (viñeta 4): el listado de tickets muestra Ubicación y Sector; el de Edilicia muestra Sector
  (y su propia ubicación, como hoy). Sin filtros nuevos.
- CA5 (viñeta 5): en Edilicia, el botón de tareas muestra la cantidad, como `ComentariosTrigger`.

## Precisiones de diseño (sin cambio de producto)
- El sector se valida como en compras: tiene que existir; no se exige que esté activo (un ticket
  viejo con un sector desactivado se puede seguir editando). El nombre lo resuelve el backend
  (`sectorNombre`), porque `GET /sectores` solo trae los activos y un sector desactivado se vería
  "—".
- Editar ubicación o sector no deja entrada en el historial, igual que hoy título, descripción y
  prioridad (`editar-ticket.use-case.ts`: no registra operación). Se edita con las mismas reglas que
  el resto de los datos del ticket.
- Alta desde la app: el diálogo de tickets y el de Edilicia (solo Sector). El diálogo de soporte desde
  un equipo (`ticket-soporte-create-dialog.tsx`) no suma los campos en esta entrega: se cargan
  después editando el ticket.
- Exportaciones CSV, PDF y webhooks no cambian (columnas fijas); no lo pide la decisión.

## Tareas
- [ ] **T1 — Backend: modelo, alta y edición** (CA1, CA2, CA3). Migración tenant
  (`tickets.ubicacion` VarChar(255) y `tickets.sector_id` con FK y índice parcial, con
  `rollback.sql` idempotente), entidad, mapper, `CrearTicketUseCase` + `POST /tickets`,
  `EditarTicketUseCase` + `PATCH /tickets/:id`, `CrearTicketEdilicioUseCase` (solo sector), validación
  del sector, tests; v1 y formulario público sin los campos.
- [ ] **T2 — Backend: lectura** (CA1, CA4). `TicketResponseDto` y la respuesta de reparaciones con
  `ubicacion`, `sectorId` y `sectorNombre` resueltos en lote; tests.
- [ ] **T3 — Frontend: tickets** (CA1, CA2, CA4). Tipos, alta y edición (Ubicación y Sector; la
  Ubicación oculta en EDILICIA), columnas del listado y detalle; tests.
- [ ] **T4 — Frontend: Edilicia** (CA2, CA4, CA5). Sector en el alta y en el listado, cantidad en el
  botón de tareas; tests.
- [ ] **T5 — Cierre**: compuertas completas, roadmap con **Cumplida** o **Desviación**, deuda de Ayuda.

## Ruta y entrega
- RDD apagada. Feature: TDD no exigido; cada tarea lleva sus tests.
- Ruta: T1 a T4 delegadas (escritor único, 2+ archivos no triviales); T5 inline.
- Previsión: ~700-900 líneas; estrategia `ask-on-risk`. GitHub en pausa: un commit por tarea y merge
  local al final. Hay migración tenant: se ofrece `judgment-day` antes del merge.

## Progreso
- 2026-10-15: decisión escrita en el roadmap y exploración hecha; documento creado.

## Próximo paso
T1.
