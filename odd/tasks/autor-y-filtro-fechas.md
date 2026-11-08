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

- [x] T1 — S1 — inline — commit: 96badc9a
- [x] T2 — S2 — inline — commit: ea7f353d
- [x] T3 — S2 (L7) — inline — commit: 8296ad4f
- [x] T4 — S1 (L8) — inline — commit: e2d95688
- [x] T5 — S1 (L10) — inline — commit: 978d16ab
- [x] T6 — S2 (L10) — inline — commit: 8a90f69e

## Log

- **L1 (usuario):** "Quiero Que modifiques un par de cosas: 1) Cuando se realizan cambios en cualquier ticket queda registrada la hora y que se hizo, pero esta faltando quien lo hizo, quiero que lo agregues. 2) Quiero que exista para los ticket un filtro de fechas, Desde Hasta, en princio debe tener valores por default del año activo (Desde=Primer dia del año, Hasta= Ultimo dia del año)."
- **L2 (usuario, decisiones):** fechas y ciclo → "Se suman (recomendado)"; qué fecha → "Fecha de creación (recomendado)".
- **L3 (exploración):** `OperacionResponseDto` trae solo `autorId` (`backend/src/tickets/interface/dtos/ticket.dto.ts:474`) y `ticket-timeline.tsx` no lo muestra. `GET /tickets` ya acepta `fechaDesde`/`fechaHasta` sobre `createdAt` (`prisma-ticket.repository.ts:145`), con `lte` sobre un instante: «Hasta» en formato `YYYY-MM-DD` cortaría a la medianoche UTC y dejaría afuera el último día.
- **L4 (evidencia T1):** `OperacionResponseDto` suma `autorNombre`/`autorApellido`; `GET /tickets/:id/timeline` los resuelve en un solo lote (`resolverNombres` con los ids únicos) y `POST .../comentarios` con el del autor. La línea de tiempo muestra «fecha · por Nombre Apellido» y cae a «por Usuario» si el autor ya no está en master (sin mostrar su id). Tests: controller (nombre por entrada, un solo lote, comentario creado) y componente (con nombre y sin nombre). Feature, sin RED exigido. Backend interface 285/285, frontend tickets 367/367; typecheck, type-check y lint en 0. Ayuda `tickets-detalle.md` actualizada.
- **L5 (evidencia T2):** backend: `tickets/interface/filtro-fechas.ts` convierte una fecha sola en el día argentino entero (Desde a las 00:00 ART; Hasta hasta las 23:59:59.999 ART) y respeta un instante ISO completo; lo usan el listado y la exportación del controller interno. La API v1 (`integraciones/`) no cambia: es un contrato de terceros. Frontend: `TicketsListView` lee `fechaDesde`/`fechaHasta` de la URL y, sin ellas, usa el año en curso en Argentina (`hoyFechaCalendario`); el listado y la exportación reciben los mismos `filtrosEfectivos`; borrar una fecha vuelve al default (`updateFiltros` borra el parámetro vacío). Tests: bordes del día (unit), cableado del controller en listado y exportación (mutante «new Date» en rojo), default del año, año argentino el 31/12 a las 23:30 ART, URL con fechas y ciclo, cambio de Desde y exportación (mutante sin default: 2 en rojo). Backend tickets + integraciones 156/156 archivos, 1924 tests; frontend tickets + shared 68/68, 741 tests; typecheck, type-check y lint en 0. Ayuda `tickets-listado.md` actualizada.
- **L6 (verificación independiente):** PASS de S1 y S2, sin blockers. `toOperacionResponseDto` lo usan solo el timeline y el alta de comentario; el único consumidor de `OperacionTicket` en el front es la línea de tiempo; el PDF del ticket ya mostraba el autor. Ninguna pantalla enlaza a `/tickets` con parámetros, así que el año por defecto no acota en silencio otro enlace. La API v1 no cambió (diff vacío en `integraciones/`). Mutantes en rojo: Hasta no inclusivo, Desde a medianoche UTC, exportación sin fechas, sin default de Desde o de Hasta, sin el lote de nombres, fallback al id. Tomados: tests de exportación sin fechas en la URL (M8 sobrevivía; ahora en rojo) y de fecha en la URL como filtro activo (M9; ahora en rojo), 43/43. No tomados: M10 (`getFullYear` local) sobrevive porque vitest fija `TZ=America/Argentina/Buenos_Aires`; separar un proyecto con otra TZ no vale el costo. Preexistentes, fuera de alcance: `fechaHasta=2026-02-30` pasa `@IsDateString` y se corre al 2/3 (solo con URL tipeada); los comentarios de Edilicia caen al `autorId` crudo (otro DTO). Advisory de producto para el dueño: elegir un ciclo anterior con el año por defecto deja el listado vacío hasta cambiar las fechas, y un ciclo que cruza el año esconde por defecto lo del año anterior.
- **L7 (usuario, sobre el advisory de L6):** "LAs fechas se ajustan solas al elegir un ciclo cualquiera que no sea el que se esta usando. Arregla las advertencias, y luego hace el push y el PR. luego deployalo"
- **L8 (revisión nativa, advertencia R3-resolver-nombres-fallo):** el alta de comentario consultaba master después de guardar: si esa base fallaba, respondía error con el comentario ya guardado y el reintento lo duplicaba. Fix: el nombre sale del JWT (`user.nombre`/`user.apellido`), que es el del autor. RED: test con `resolverNombres` rechazado, en rojo con «master caída»; GREEN 97/97. El timeline sigue dependiendo de master, como las tareas (sin cambio).
- **L9 (evidencia T3):** `elegirCiclo` en `TicketsListView`: un ciclo distinto del de la URL lleva `fechaDesde`/`fechaHasta` a `fechaInicio`/`fechaFin` del ciclo (`GET /ciclos` las da como `YYYY-MM-DD`); «Ciclo activo» toma las del ciclo por defecto; el mismo ciclo no toca las fechas. Mutante con el `onChange` anterior: 3 en rojo. Frontend tickets + shared 68/68, 746 tests; type-check y lint en 0. Ayuda `tickets-listado.md` actualizada.
- **L10 (usuario, sobre las advertencias de la segunda revisión nativa):** "si, con la correccion de las advertencias". (a) R3/R4: el timeline fallaba entero si master no respondía; ahora `nombresDeAutores` devuelve las entradas sin nombre («por Usuario») y deja la falla en el log con el ticket. RED: test con master caída en rojo con «master caída»; GREEN 98/98. (b) R3: un link con `?ciclo=` y sin fechas aplicaba el año en curso; ahora toma las fechas de ese ciclo. RED: pedía `2026-01-01` en vez de `2024-01-01`; GREEN, frontend tickets + shared 747/747. Typecheck, type-check y lint en 0.
