# Ticket unificado: mismos campos para todos los tipos

Todo ticket, existente o nuevo y de cualquier tipo, tiene subtareas, compras vinculadas, ubicación y
sector. Las compras y la ubicación pasan del satélite `ticket_edilicia` al ticket (opción B del mapeo).

## Specs

- **S1** — "quiero que todos los ticket existentes o los que vengan tengan los mismos campos, subtareas,
  compras y ubicacion tambien. pues un tiket comun tambien puede tenerlo".
- **S2** — Pantalla Edilicia: "queda como hasta ahora se puede tambien generar el ticket, y puedo re
  utilizar esa pantalla para los demas tipos de ticket".
- **S3** — Comentarios: los comentarios de reparación se unifican en el ticket (un solo lugar).
- **S4** — Vincular o desvincular compras en cualquier ticket: Modificar sobre el tipo del ticket y
  `COMPRAS:LECTURA`; deja de usarse `EDILICIA:BORRADO`.
- **S5** — Bloqueo: cualquier ticket con compras activas vinculadas queda bloqueado (frena sus tareas).
- **S6** — "Nuevo ticket" ofrece todos los tipos donde el usuario tiene Crear (L1).

## Tasks

- [ ] T0 — S1-S6 — explore — confirmar interpretación de S2 y recuentos de producción — (pendiente)
- [ ] T1 — S1, S3 — worker — esquema y backfill: vínculo compra→ticket, ubicación única, comentarios al
  timeline (migración reversible, verificada contra un dump) — (pendiente)
- [ ] T2 — S1, S4, S5 — worker — backend: compras, bloqueo y ubicación sobre el ticket; altas de todo
  tipo sin satélite — (pendiente)
- [ ] T3 — S2, S6 — worker — frontend: detalle con compras, pantalla Edilicia reutilizable por tipo,
  "Nuevo ticket" con todos los tipos — (pendiente)
- [ ] T4 — S1 — worker — retiro del satélite y de `comentarios_reparacion` — (pendiente)

## Log

- **L1** (dueño, 2026-10-23) — "Quiero que verifiques porque cuando doy de alta un ticket solo me deja
  elegir en tipo de ticke a soporte cuando debería permitirme a todos los que tenga habilitado?. Otra
  pregunta: Edilicia solo se puede generar desde Edilicia y no desde Ticket?. Lo mismo pasa con
  Mantenimiento?"
- **L2** (dueño) — "pero para hacer tareas los tickets comunes tambien lo tienen. no se puede hacer que
  cua do hagan Edilicia se cree tambien un item de Edilicia?"
- **L3** (dueño) — "no entiendo porque mantenimiento tambien entraria como edilicia". Evidencia: en
  producción MANTENIMIENTO y PREVENTIVO son tipos del módulo EDILICIA (tipos_ticket.modulo).
- **L4** (dueño) — "quiero que todos los ticket existentes o los que vengan tengan los mismos campos,
  subtareas, compras y ubicacion tambien. pues un tiket comun tambien puede tenerlo".
- **L5** (decisiones del dueño, 2026-10-24) — Pantalla Edilicia: "(custom) queda como hasta ahora se
  puede tambien generar el ticket, y puedo re utilizar esa pantalla para los demas tipos de ticket";
  comentarios: unificar en el ticket; permiso compras: Modificar + Ver compras; bloqueo: sí, todos.
- **L6** (evidencia, mapeo) — Subtareas ya comunes (`/tickets/:id/tareas`). `tickets` ya tiene
  `ubicacion` y `sector_id`. Compras (`reparacion_compra`, FK a `ticket_edilicia`), segunda ubicación y
  `comentarios_reparacion` viven en el satélite. Tickets de MANTENIMIENTO/PREVENTIVO creados fuera de
  `/reparaciones` no tienen satélite (`mantenimiento.integration.spec.ts:~211`). El bloqueo ya consulta
  por ticket (`prisma-bloqueo-ticket.repository.ts:23-39`).
