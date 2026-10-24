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

- [ ] T1 — S1-S6 — worker — guards de backend y gating de frontend — (pendiente)

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
