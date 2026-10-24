# Ticket unificado: mismos campos para todos los tipos

Todo ticket, existente o nuevo y de cualquier tipo, tiene subtareas, compras vinculadas, ubicación y
sector. Las compras y la ubicación pasan del satélite `ticket_edilicia` al ticket (opción B del mapeo).

## Specs

- **S1** — "quiero que todos los ticket existentes o los que vengan tengan los mismos campos, subtareas,
  compras y ubicacion tambien. pues un tiket comun tambien puede tenerlo".
- **S2** — Pantalla Edilicia: "queda como hasta ahora se puede tambien generar el ticket, y puedo re
  utilizar esa pantalla para los demas tipos de ticket". Interpretación confirmada (L7, opción a): la
  pantalla Edilicia suma un selector de tipo y permite ver y crear tickets de cualquier tipo habilitado,
  con su grilla (compras, bloqueo, subtareas, ubicación, sector); "Tickets" sigue como hoy.
- **S3** — Comentarios: los comentarios de reparación se unifican en el ticket (un solo lugar).
- **S4** — Vincular o desvincular compras en cualquier ticket: Modificar sobre el tipo del ticket y
  `COMPRAS:LECTURA`; deja de usarse `EDILICIA:BORRADO`.
- **S5** — Bloqueo: cualquier ticket con compras activas vinculadas queda bloqueado (frena sus tareas).
- **S6** — "Nuevo ticket" ofrece todos los tipos donde el usuario tiene Crear (L1).

## Tasks

- [x] T0 — S1-S6 — explore — confirmar interpretación de S2 y recuentos de producción — (este commit)
- [x] T1 — S1, S3 — worker — esquema y backfill: vínculo compra→ticket, ubicación única, comentarios al
  timeline (migración reversible, verificada contra una base efímera; falta contra un dump) — (este commit)
- [x] T2 — S1, S4, S5 — worker — backend: compras, bloqueo y ubicación sobre el ticket; altas de todo
  tipo sin satélite — (este commit)
- [ ] T2b — S3, S4, L19 — worker — comentarios de reparación internos (migrados y nuevos, por el caso de uso
  del ticket), GET compras con COMPRAS:LECTURA, notas de rollback en el runbook — (pendiente)
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
- **L7** (dueño, 2026-10-24) — "a" a: "La pantalla Edilicia suma un selector de tipo. Con ella podés ver y
  crear tickets de cualquier tipo que tengas habilitado (Soporte, Compras, etc.), con la misma grilla:
  compras, bloqueo, subtareas, ubicación y sector. "Tickets" sigue existiendo como hoy."
- **L8** (evidencia, producción 2026-10-24, solo lectura) — 9 tenants activos: 1025 satélites
  `ticket_edilicia` (Santa Cruz 888, Guadalupe 118, ISTIC 12, Prueba 6, San Vicente 1), 4 vínculos
  `reparacion_compra` (todos en Prueba), 11 `comentarios_reparacion` (Guadalupe 7, Prueba 4), 17
  satélites con ubicación propia y ticket sin ubicación, 0 con ambas ubicaciones (sin conflicto), 0
  tickets de módulo EDILICIA sin satélite.
- **L9** (decisión, T1) — Vínculo en una tabla nueva, `ticket_compra` (UNIQUE ticket+compra, FKs
  RESTRICT), y no una columna en `reparacion_compra`: la migración `20261024120000_ticket_unificado`
  copia los vínculos con su id y su `created_at` (inicio del bloqueo). `reparacion_compra`,
  `ticket_edilicia.ubicacion` y `comentarios_reparacion` quedan congeladas, sin escrituras, para T4.
  El `rollback.sql` proyecta lo nuevo sobre lo viejo en los tickets con satélite y borra
  `ticket_compra`; pierde los vínculos de tickets sin satélite (límite documentado).
- **L10** (decisión, T1/S3) — Cada comentario de reparación pasa al timeline como COMENTARIO
  **público**, con el mismo id, autor, texto y fecha: el comentario de reparación lo veía todo el que
  veía la reparación, igual que un comentario público. La copia no toca la primera respuesta ni el
  reloj de SLA. La ruta `POST /reparaciones/:id/comentarios` escribe un COMENTARIO público y conserva
  sus reglas hasta T3 (ALTAS o COMENTAR; frena con el ticket cerrado, cancelado o bloqueado), sin
  notificar ni registrar primera respuesta, como antes. `GET .../comentarios` lee el timeline: los
  internos, solo con OBSERVAR; el conteo de la grilla sigue la misma regla.
- **L11** (decisión, T1/S1) — Ubicación: si el ticket ya tiene una (no en blanco), gana el ticket y la
  migración avisa cuántos conflictos hubo; una en blanco del satélite no se copia. El PDF
  (`src/ticket-pdf`, fuera del alcance de T2) sigue leyendo la ubicación desde el satélite: su
  repositorio ahora devuelve la del ticket, así que los tickets con satélite imprimen la correcta.
  **Pendiente**: imprimir la ubicación de cualquier ticket requiere tocar `src/ticket-pdf`.
- **L12** (decisión, T2) — El `id` de cada fila de `GET /reparaciones` (y de la respuesta del alta y
  del PATCH) es el del ticket. Las rutas `/reparaciones/:reparacionId/...` aceptan ese id o el del
  satélite que devolvían antes (`ResolutorReparacion`), y su 404 nombra el id pedido. Rutas nuevas:
  `GET|POST /tickets/:ticketId/compras` y `DELETE /tickets/:ticketId/compras/:compraId`; las de
  `/reparaciones` quedan como alias hasta T3.
- **L13** (decisión, T2/S2) — `GET /reparaciones` (y su exportación) aceptan `?tipo=`; sin tipo listan
  todos los tipos del módulo EDILICIA, incluido PREVENTIVO y los tickets sin satélite. El alcance es el
  del listado de tickets (`alcanceDeListado` con el tipo pedido: pedir un tipo no amplía nada).
- **L14** (decisión, T2/S2-S6) — `POST /tickets` y `POST /reparaciones` admiten los mismos tipos:
  `admiteAltaManual` = un tipo de un módulo con alta de tipo (TICKETS, EDILICIA) que no sea
  PREVENTIVO; el 422 dice "El tipo de ticket "X" no admite altas manuales.". `POST /reparaciones`
  sigue creando la fila del satélite, sin ubicación, hasta T4: el listado viejo (el código al que
  vuelve un rollback) se arma sobre el satélite, y `prisma_master/seeds/demo-seed.integration.spec.ts`
  (fuera del alcance de T2) cuenta un satélite. `POST /tickets` no lo crea.
- **L15** (decisión, T2/S4) — Vincular y desvincular exigen `MODIFICACION` sobre el tipo del ticket y
  `COMPRAS:LECTURA` en la ruta. Cambio de conducta: quien vinculaba con ALTAS sin MODIFICACION, o
  desvinculaba con `EDILICIA:BORRADO` sin MODIFICACION o sin `COMPRAS:LECTURA`, ya no puede.
  `EDILICIA:BORRADO` ya no lo exige ninguna ruta, pero sigue en el catálogo, los presets, el CHECK de
  master y el frontend: retirarlo toca `prisma_master` y `frontend`, fuera de T2.
- **L16** (decisión, T2) — Se conservan los nombres heredados (`VincularCompraAReparacionUseCase`,
  `IReparacionCompraRepository`, `IComentarioReparacionRepository`) con firmas por id de ticket; T4 los
  renombra. Quedan sin uso `comentario-reparacion.mapper.ts` y `ComentarioReparacionEntity` (solo se
  usa su constante de largo): se retiran con `comentarios_reparacion` en T4. `TicketComprasController`
  vive en `ReparacionesModule`, que ya importa compras y el criterio de bloqueo.
- **L17** (evidencia, T1) — Migración aplicada a `soporte_tenant_test` (`pnpm migrate:tenant`) y a los 2
  tenants locales (`pnpm migrate:tenants`), que estaban atrasados en 8 migraciones y recibieron
  todas. Reproducida con su rollback en `migracion-ticket-unificado.integration.spec.ts`.
- **L18** (judgment-day sobre 486e4aa7..dfd7726c, 2026-10-24) — Sin filas CRITICAL: APROBADO (suite
  completa verde, 772 archivos / 9535 tests). Advertencias a resolver: (1) T2 y T3 se despliegan juntos,
  el front actual habilita vincular con ALTAS y desvincular con EDILICIA:BORRADO (JD-A-001, JD-B-004);
  (2) comentar por /reparaciones no emite TicketComentadoEvent ni primera respuesta; debe usar el caso de
  uso de comentarios del ticket (JD-A-002, JD-B-002); (3) re-correr la migración tras el deploy revive
  vínculos borrados (JD-A-003): no re-aplicar sin rollback; (4) GET /tickets/:id/compras sin
  COMPRAS:LECTURA (JD-A-004, JD-B-005) y comentarios de reparación migrados como públicos (JD-B-001):
  decisiones del dueño; (5) rollback desvincula adjuntos de comentarios migrados (JD-A-006, JD-B-003) y
  avisos de conflicto de ubicación solo por NOTICE (JD-A-005): documentar en el runbook.
- **L19** (decisiones del dueño, 2026-10-24) — Comentarios de reparación: "Internos (recomendado)" (solo
  personal con Comentario interno; aplica también a los 11 existentes). Ver compras vinculadas en el
  detalle: "Solo con permiso de Compras (rec.)" (COMPRAS:LECTURA; los demás ven solo si está bloqueado).
