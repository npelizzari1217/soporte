# Autor en el historial y filtro de fechas en tickets

Dos mejoras pedidas por el dueño el 2026-11-08: mostrar quién hizo cada cambio en la línea de tiempo
del ticket, y un filtro Desde/Hasta en el listado de tickets.

## Specs

- **S1:** "Cuando se realizan cambios en cualquier ticket queda registrada la hora y que se hizo, pero
  esta faltando quien lo hizo, quiero que lo agregues." Cada entrada de la línea de tiempo muestra el
  nombre y apellido de su autor.
- **S2:** "Quiero que exista para los ticket un filtro de fechas, Desde Hasta, en princio debe tener
  valores por default del año activo (Desde=Primer dia del año, Hasta= Ultimo dia del año)."
  Decisiones (L2): filtra sobre la fecha de creación del ticket y se suma al filtro de ciclo. «Hasta»
  incluye el día entero.

## Tasks

- [ ] T1 — S1 — inline — commit: —
- [ ] T2 — S2 — inline — commit: —

## Log

- **L1 (usuario):** "Quiero Que modifiques un par de cosas: 1) Cuando se realizan cambios en cualquier ticket queda registrada la hora y que se hizo, pero esta faltando quien lo hizo, quiero que lo agregues. 2) Quiero que exista para los ticket un filtro de fechas, Desde Hasta, en princio debe tener valores por default del año activo (Desde=Primer dia del año, Hasta= Ultimo dia del año)."
- **L2 (usuario, decisiones):** fechas y ciclo → "Se suman (recomendado)"; qué fecha → "Fecha de creación (recomendado)".
- **L3 (exploración):** `OperacionResponseDto` trae solo `autorId` (`backend/src/tickets/interface/dtos/ticket.dto.ts:474`) y `ticket-timeline.tsx` no lo muestra. `GET /tickets` ya acepta `fechaDesde`/`fechaHasta` sobre `createdAt` (`prisma-ticket.repository.ts:145`), con `lte` sobre un instante: «Hasta» en formato `YYYY-MM-DD` cortaría a la medianoche UTC y dejaría afuera el último día.
