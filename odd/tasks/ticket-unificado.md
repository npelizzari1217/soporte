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
- [x] T2b — S3, S4, L19 — worker — comentarios de reparación internos (migrados y nuevos, por el caso de uso
  del ticket), GET compras con COMPRAS:LECTURA, notas de rollback en el runbook — (este commit)
- [x] T3 — S2, S6 — worker — frontend: detalle con compras, pantalla Edilicia reutilizable por tipo,
  "Nuevo ticket" con todos los tipos — (este commit)
- [x] T3b — S5, L22, L30 — worker — `bloqueada` en GET /tickets/:id para el detalle sin COMPRAS:LECTURA;
  Ayuda reparaciones-edilicias y reparaciones-listado — (este commit)
- [x] T4a — S1, L37 — worker — el código deja de tocar `ticket_edilicia`, `comentarios_reparacion` y
  `reparacion_compra` (alta de Edilicia sin satélite, rutas alias y código muerto retirados, PDF con la
  ubicación del ticket); las tablas quedan — (este commit)
- [x] T4b — S1, L37, L41 — inline — migración que borra las tres tablas con prechecks y runbook, en un deploy
  posterior a T4a — (este commit; deploy pendiente de decisión del dueño)

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
- **L20** (decisión, T2b/S3, L19) — `POST /reparaciones/:id/comentarios` llama a `CrearComentarioUseCase`
  de Tickets con `esInterno: true`, el mismo caso de uso y el mismo DTO que `POST /tickets/:id/comentarios`
  (JD-A-002, JD-B-002). Hereda sus reglas de comentario interno: exige `COMENTAR` y `OBSERVAR` sobre el
  tipo (antes `ALTAS` o `COMENTAR`), se acepta con el ticket en cualquier estado, también CERRADO,
  CANCELADO o bloqueado por una compra (antes 422), y no publica `TicketComentadoEvent` ni registra la
  primera respuesta. `CrearComentarioReparacionUseCase` sale del cableado y de los tests; su archivo y
  `ComentarioReparacionNoPermitidoError` quedan sin uso, para borrar (el primero en este commit, el
  segundo con T4). `TicketsModule` deja de exportar `VerificadorTicketEditable`: su único consumidor
  externo era ese caso de uso. Supera la regla de escritura de L10.
- **L21** (decisión, T2b/L19) — Los 11 comentarios migrados pasan a internos con una migración nueva,
  `20261024130000_comentarios_reparacion_internos`, y no editando `20261024120000`: esa ya está aplicada
  y Prisma rechaza un checksum distinto. Marca las filas de `operaciones_ticket` con el id de una de
  `comentarios_reparacion`, sin tocar `updated_at`. Su rollback las devuelve a públicas y va antes que el
  de 20261024120000. Si 20261024120000 se revierte y se vuelve a aplicar, hay que volver a aplicar
  también esta. Reproducida con su rollback en `migracion-comentarios-reparacion-internos.integration.spec.ts`.
- **L22** (decisión, T2b/S4, L19) — `GET /tickets/:ticketId/compras` exige `COMPRAS:LECTURA` en la ruta
  (`@RequiereAcciones`), además de ver el ticket (JD-A-004, JD-B-005). Sin ese permiso, el bloqueo se
  conoce por `bloqueada` en la fila de `GET /reparaciones`, que no cambia. Esa fila sigue mostrando
  `comprasQueBloquean` (id y número) a quien ve el ticket, sin `COMPRAS:LECTURA`, como antes: L19 habla
  del detalle, y no se tocó. El detalle de Tickets no tiene hoy indicador de bloqueo: T3 tiene que
  tomarlo de un dato que no exija `COMPRAS:LECTURA`.
- **L23** (pendiente para T3) — El frontend todavía decide con las reglas viejas: `ComentariosDialog`
  ofrece comentar con `ALTAS` o `COMENTAR` (`reparaciones-list.tsx`) y esconde el formulario con el
  ticket cerrado o bloqueado; `VincularCompraDialog` ofrece vincular con `ALTAS` y desvincular con
  `EDILICIA:BORRADO`. Con el backend de T2 y T2b, esos caminos responden 403 a quien no tiene los
  permisos nuevos: T2, T2b y T3 salen en el mismo deploy (runbook, "Ticket unificado"). La Ayuda no dice
  que se puede comentar con el ticket cerrado mientras el frontend lo esconda.
- **L24** (evidencia, T2b) — Migración aplicada a `soporte_tenant_test` (`pnpm migrate:tenant` con
  `DATABASE_URL_TENANT` apuntando a esa base) y a los 2 tenants locales (`pnpm migrate:tenants`). El
  runbook suma la sección "Ticket unificado": deploy conjunto, precheck de conflictos de ubicación
  (JD-A-005), no re-aplicar 20261024120000 sin su rollback (JD-A-003), adjuntos que el rollback
  desvincula (JD-A-006, JD-B-003) y dump obligatorio.
- **L25** (decisión, T3/S2, L7) — La pantalla Edilicia suma el selector **Tipo**: ofrece los tipos con
  `LECTURA` de cualquier módulo (otro tipo sería una grilla siempre vacía, L13) y, por defecto, «Todos
  los de Edilicia», que no manda `tipo` y lista lo de siempre. El tipo vive en la URL (`?tipo=`), cuenta
  como filtro activo y viaja también a la exportación: decide qué listado se ve. Un tipo de la URL que
  no está entre las opciones se muestra como «Tipo no disponible» con el catálogo resuelto y «Cargando
  tipos…» mientras no resolvió, para que el `<select>` no caiga en otra opción. El acceso a la pantalla
  no cambia: sigue pidiendo `LECTURA` sobre algún tipo de EDILICIA (menú y ruta), y los rótulos
  «Reparaciones» y «Nueva reparación» quedan como están.
- **L26** (decisión, T3/S2, S6) — «Nuevo ticket» y «Nueva reparación» ofrecen el mismo conjunto: los
  tipos con alta manual (`admiteAltaManual`, espejado en `features/tickets/lib/alta-manual.ts`: TICKETS
  y EDILICIA, salvo PREVENTIVO) con `ALTAS`. Los dos piden el catálogo entero y su botón se muestra con
  `ALTAS` en algún módulo con alta de tipo; con el catálogo cargado y ningún tipo elegible, se esconde.
  Cambio de conducta: quien tiene `ALTAS` solo en tipos de EDILICIA ahora ve «Nuevo ticket». Ubicación y
  sector ya estaban en los dos formularios para cualquier tipo.
- **L27** (decisión, T3/S4) — Las compras de un ticket se gestionan con un solo panel, `TicketCompras`
  (`features/tickets`), sobre `GET|POST|DELETE /tickets/:id/compras`; lo montan el detalle y el diálogo
  de la grilla. Lista todas las vinculadas (también las completadas o canceladas, que ya no bloquean y
  antes no se podían desvincular desde la grilla) y no ofrece en el selector las ya vinculadas. Sin
  `COMPRAS:LECTURA` no hay panel; con ella y sin `MODIFICACION` sobre el tipo, el botón de la fila dice
  «Ver compras» y no hay acciones. `ALTAS` y `EDILICIA:BORRADO` dejan de habilitar nada en el frontend
  (JD-A-001, JD-B-004). Se borró `edilicia/hooks/use-reparacion-compra-mutations.ts`: el frontend ya no
  usa los alias `/reparaciones/:id/compras` (L12), que T4 puede retirar.
- **L28** (decisión, T3/S1, S5, L19, L22) — El detalle del ticket muestra y edita la ubicación en
  cualquier tipo: se retiró `mostrarUbicacion` de la cabecera, el formulario y el diálogo de edición, y
  el PATCH la manda siempre. La sección «Compras vinculadas» se muestra solo con `COMPRAS:LECTURA` (sin
  ella no se pide nada), y el bloqueo sale de esa lista: con una compra que bloquea, marca «Bloqueado por
  una compra en curso» y congela las tareas. **Pendiente de backend**: sin `COMPRAS:LECTURA` el detalle
  no tiene de dónde saber el bloqueo (`GET /tickets/:id` no lo trae; L22 pedía un dato que no exija esa
  celda), así que sus tareas solo se congelan por estado y el backend rechaza la escritura con el toast
  de error. Hace falta un `bloqueada` en la respuesta de `GET /tickets/:id`, o equivalente.
- **L29** (decisión, T3/S3, L20, L23) — El comentario de la grilla de Edilicia se ofrece con `COMENTAR` y
  `OBSERVAR` sobre el tipo (antes `ALTAS` o `COMENTAR`) y en cualquier estado del ticket, también cerrado,
  cancelado o bloqueado, como acepta el backend. El campo se rotula «Nuevo comentario interno» y una nota
  avisa que solo lo ve el personal con permiso de comentario interno. El motivo de solo lectura de
  tareas pasa a hablar del ticket («El ticket está bloqueado por una compra en curso…»). El tope de la
  ubicación sube a `shared/lib/limites-ticket` (`TICKET_UBICACION_MAX_LENGTH`): Tickets y Edilicia
  escriben la misma columna desde L11.
- **L30** (pendiente, Ayuda) — T3 vuelve falsos dos pasajes que no se corrigieron en este commit, fuera de
  su alcance: `reparaciones-edilicias.md` («Cómo se gestiona» dice que el panel lista solo las compras
  que frenan y que el botón es siempre «Gestionar compras»; el campo es *Nuevo comentario*) y
  `reparaciones-listado.md` («el archivo trae siempre todas las reparaciones del tenant»: ahora sigue al
  selector de tipo). Faltan además, como deuda de la pausa de Ayuda, el selector de tipo de la pantalla,
  la sección de compras del detalle y los tipos que ofrece «Nuevo ticket».
- **L31** (evidencia, T3) — RED observado antes de implementar: 42 tests nuevos o ajustados fallando por
  la conducta ausente (selector inexistente, catálogo pedido con `modulo=EDILICIA`, gate de ALTAS, rutas
  `/reparaciones/:id/compras`, ubicación oculta en Edilicia). GREEN: `pnpm vitest run src/features/tickets
  src/features/edilicia` 30 archivos / 357 tests. Compuertas del frontend: `pnpm lint` sin advertencias
  ni errores, `pnpm type-check` sin errores, `pnpm test` 282 archivos / 2488 tests.
- **L32** (dueño, 2026-10-24) — "edilicia es para los que ven Edilicia, mantenimiento y los otros ticket
  no": la pantalla Edilicia sigue exigiendo Ver sobre algún tipo del módulo Edilicia (opción a); el
  menú y la ruta no cambian.
- **L33** (decisión, T3b/S5, L19, L22, L28) — `GET /tickets/:id` suma `bloqueada: boolean`, con el mismo
  criterio que frena las tareas (`IBloqueoTicketRepository.estaBloqueadoPorCompra`, que usa
  `comprasQueBloquean`). Lo calcula `TicketsController.findOne` después de `ObtenerTicketUseCase`, así un
  404 no consulta nada; no cambia la firma de ese caso de uso, que también usan `ticket-pdf` y la API v1.
  Viaja solo en el detalle (opcional en `TicketResponseDto`, ausente en el listado y en las escrituras),
  a todo el que ve el ticket, sin `COMPRAS:LECTURA`, y no lleva id ni número de compra. El detalle del
  frontend toma el bloqueo de la lista de compras con `COMPRAS:LECTURA` (como en T3) y de `bloqueada` sin
  ella; en ese caso la marca «Bloqueado por una compra en curso» va junto al título de Tareas, porque la
  sección de compras no se muestra. Vincular y desvincular invalidan `["ticket", id]` (antes solo la
  lista de compras), para que `bloqueada` no quede viejo.
- **L34** (decisión, T3b/L30, L32) — Los pasajes falsos de L30 ya se habían corregido en el commit de T3.
  Este commit suma a `reparaciones-listado.md` quién entra a la pantalla (Ver sobre algún tipo del
  módulo Edilicia, L32) y el selector Tipo (L25), y actualiza la página en la URL y dónde se ve qué compra
  frena; a `reparaciones-edilicias.md`, la marca del detalle para cualquier tipo, las tareas de solo
  lectura mientras dura el bloqueo y la fila «Saber si un ticket está bloqueado» de la tabla de permisos.
  Sigue pendiente para la tanda final: la sección de compras del detalle y los tipos de «Nuevo ticket».
- **L35** (evidencia, T3b) — RED observado antes de implementar: backend, 2 tests de
  `tickets.controller.spec.ts` (`bloqueada` undefined) y 2 de `reparaciones.e2e.spec.ts` (vínculo real
  activo, desvinculado y compra cancelada); frontend, 2 de `ticket-detail-view.test.tsx` (marca y
  congelado sin `COMPRAS:LECTURA`, relectura del ticket al desvincular). GREEN y compuertas: backend
  `pnpm lint` y `pnpm typecheck` sin errores, `tickets.controller.spec.ts` 87, `reparaciones.e2e.spec.ts`
  31, `tickets.e2e.spec.ts` 38, `scripts/sync-ayuda.spec.ts` 21; frontend `pnpm lint` sin advertencias
  ni errores, `pnpm type-check` sin errores, `pnpm test` 282 archivos / 2491 tests. No se corrió la suite
  completa del backend.
- **L36** (dueño, 2026-10-24) — "dejamos T4 para el deploy posterior": T4 queda bloqueada hasta después del
  deploy de T1-T3b; mientras tanto `rollback.sql` sigue disponible sin pérdida.
- **Deploy** (2026-10-25) — En produccion con `main` 6595d838 (merge de integracion/deploy-2026-10-25): DEPLOY OK, 7 migraciones tenant en los 9 tenants, verificacion posterior igual a la foto previa (4 vinculos, 11 comentarios internos, 0 planes sin tipo, 5 valoraciones MIGRACION). Dump previo C:\soporte\backups\utc-backfill-20261024-205055; rollback de codigo 3b13b320.

- **L37** (dueño, 2026-10-25) — "resuelve luego las dos cosas que quedaron abiertas El null, y T4": levanta
  L36. T4 se parte en dos deploys (decisión técnica): T4a saca el código que toca las tablas viejas, así el
  release anterior sigue pudiendo volver; T4b las borra recién con T4a en uso. El PDF pasa a mostrar la
  ubicación en cualquier ticket que la tenga (coherente con S1).
- **L38** (decisión, T4a/S1, L37) — Ningún código del backend usa ya `ticket_edilicia`,
  `comentarios_reparacion` ni `reparacion_compra`; las tablas, sus modelos de Prisma y sus migraciones
  quedan para T4b. Lo fija `src/reparaciones/sin-tablas-del-satelite.spec.ts`: escanea `src/`,
  `scripts/` y `prisma_master/seeds/` (specs incluidos, salvo los `migracion-*.spec.ts`) buscando los
  delegados de Prisma y SQL crudo sobre esas tablas. Qué cambió:
  - `POST /reparaciones` (`CrearTicketEdilicioUseCase`) crea solo el ticket y sus operaciones de
    apertura, como `POST /tickets`; `TicketEdilicioCreado` ya no trae el satélite. El importador legacy
    (`scripts/importacion-legacy/tenant.ts`) tampoco lo crea para EDILICIA, y el demo-seed se verifica
    por el tipo del ticket.
  - `ResolutorReparacion` se reemplazó por la función `comoReparacion`: el `:reparacionId` de las
    rutas `/reparaciones/...` es el id del ticket, sin traducción; solo el 404 se sigue nombrando como
    reparación (`Ticket edilicio con id "X" no encontrado.`). Un id de satélite en la URL es 404 (el
    listado devuelve ids de ticket desde el deploy del 2026-10-25).
  - Se retiraron los alias `POST /reparaciones/:id/compras` y `DELETE /reparaciones/:id/compras/:compraId`
    (404 de Nest; el frontend no los usa desde T3, verificado con grep sobre `frontend/src`). Sus casos
    e2e de permisos y de bloqueo en el listado pasaron a `/tickets/:ticketId/compras` sobre un ticket de
    Edilicia, para no perder esa cobertura; los dos que solo probaban el alias (el id de satélite y el
    404 que nombraba la reparación) se quitaron. `ReparacionesController` queda sin `@RequiereAcciones`.
  - PDF: `TicketPdfVista.edilicia` pasa a `ubicacion: string | null`, la del ticket de cualquier tipo
    (en blanco = `null`), y se imprime como fila «Ubicación» de la cabecera, solo si existe. La sección
    «Reparación» desaparece: era solo la ubicación. `TicketPdfModule` ya no importa
    `ReparacionesModule`, y este ya no exporta nada.
  - Código muerto borrado: `TicketEdiliciaEntity`, `ITicketEdiliciaRepository`,
    `PrismaTicketEdiliciaRepository`, `TicketEdiliciaMapper`, `ComentarioReparacionEntity` y
    `ComentarioReparacionMapper` (con sus specs), y `ComentarioReparacionNoPermitidoError` (el catálogo
    de errores de reparaciones queda en 5). `COMENTARIO_TEXTO_MAX_LENGTH` (2000) pasó a
    `reparaciones.dto.ts`, con test de borde en el DTO; el espejo del frontend no cambia.
  - Tests que solo existían para el satélite se quitaron (aislamiento de `PrismaTicketEdiliciaRepository`,
    sus 4 casos de integración, "un vínculo solo en `reparacion_compra` no bloquea" y los asserts de "la
    tabla vieja no se escribe"): los cubre el escaneo. Los que creaban un satélite como fixture ahora
    crean solo el ticket.
  - **No se renombró** `VincularCompraAReparacionUseCase`, `DesvincularCompraDeReparacionUseCase`,
    `IReparacionCompraRepository` ni `IComentarioReparacionRepository` (L16): implica mover archivos y
    sus specs, fuera de un cambio acotado; queda para T4b o una tarea propia. Los campos
    `ticketEdiliciaId` de los DTO HTTP no cambian (contrato).
  - Runbook sin cambios: ninguna sección afirma que el código escribe el satélite. Volver el código a
    6595d838 funciona (lista por ticket y acepta ids de ticket). El límite ya documentado del
    `rollback.sql` de 20261024120000 (pierde los vínculos de tickets sin satélite) cubre ahora también
    a todo ticket creado desde Edilicia después de T4a.
  - De paso, el JSDoc de `PATCH /tickets/:id/estado` (`tickets.controller.ts`) decía que el 422 era por
    "sacar al ticket" de RESUELTO/CERRADO/CANCELADO; desde odd/cerrado-solo-comentarios L14 es cualquier
    cambio de estado, también RESUELTO→CERRADO. Solo documentación.
- **L39** (evidencia, T4a) — RED observado antes de implementar: el escaneo, 22 líneas en 9 archivos;
  `reparaciones.controller.spec.ts`, los alias todavía en el prototipo y el id de satélite traducido al
  ticket; `pdfkit-generador-pdf-ticket.spec.ts`, la fila «Ubicación» ausente. Sin RED propio: el alta sin
  satélite (quitar una dependencia no tiene un test que falle antes; la cubre el escaneo) y el 404 de los
  alias por HTTP (se escribió con las rutas ya retiradas). GREEN y compuertas del backend: `pnpm lint` y
  `pnpm typecheck` sin errores; de a un archivo, `sin-tablas-del-satelite.spec.ts` 3,
  `reparaciones.controller.spec.ts` 43, `reparaciones.e2e.spec.ts` 32, `reparaciones.module.spec.ts` 6,
  `acceso-reparacion.spec.ts` 3, `crear-ticket-edilicio.use-case.spec.ts` 23, `reparaciones.dto.spec.ts`
  21, `generar-pdf-ticket.use-case.spec.ts` 21, `pdfkit-generador-pdf-ticket.spec.ts` 10,
  `prisma-reparaciones.integration.spec.ts` 2, `prisma-reparacion-compra.integration.spec.ts` 7,
  `prisma-bloqueo-ticket.repository.integration.spec.ts` 5, `asignacion-automatica.canales.integration.spec.ts`
  5, `aislamiento-satelites-fase3.integration.spec.ts` 1, `mantenimiento.integration.spec.ts` 2,
  `tickets.controller.spec.ts` 90, `demo-seed.integration.spec.ts` 1, `importacion-legacy/tenant.integration.spec.ts`
  8 y `importar-legacy.integration.spec.ts` 6, entre otros del módulo. No se corrió la suite completa del
  backend. El frontend no se tocó.
- **L40 — Ajustes del verify de T4a (2026-10-25).** El guard `sin-tablas-del-satelite.spec.ts` escanea el
  archivo entero sin comentarios (detecta usos partidos en líneas, el acceso por corchetes, las relaciones
  `ticketEdilicia`/`reparacionesVinculadas` en `include`/escrituras anidadas, `TRUNCATE` sin `TABLE` y la
  tabla en medio de una lista). `comprasVinculadas` no se busca sola: es también un método del puerto de
  bloqueo (tres falsos positivos medidos). Comentarios viejos corregidos en `schema.prisma` y
  `frontend/src/features/edilicia/types.ts`. Runbook: sección "Retiro del código del satélite de
  Edilicia (T4a)": el rollback va a `6595d838` (no a `3b13b320`, como decía el primer borrador: el
  verify lo frenó) y solo pierde la ubicación del PDF; la consulta que devuelve los tickets a la
  pantalla queda para un rollback más atrás, filtrada por `modulo` (probada en transacción revertida
  contra `soporte_tenant_test`). El guard acepta también `?.` y el delegado pasado como argumento.
  Evidencia: guard 5/5, `runbook-migraciones.spec.ts` 9/9, lint y typecheck limpios, verify
  independiente (sus sondas quedaron en el spec).
- **L41 — Dueño autoriza T4b (2026-10-25), tras el deploy de T4a (main 78388820):** "la 1 podemos hacerlo
  perfectamente". Diseño: migración `20261025150000_retiro_satelite_edilicia` que borra
  `comentarios_reparacion`, `reparacion_compra` y `ticket_edilicia` con `DROP TABLE IF EXISTS` y sin
  `CASCADE` (un dependiente desconocido aborta en vez de caer en silencio). Precheck que ABORTA: un
  comentario de reparación sin su copia en `operaciones_ticket` (mismo id), porque sería el único dato que
  se pierde. Prechecks que solo AVISAN (NOTICE): vínculos de `reparacion_compra` sin par en `ticket_compra`
  (pueden ser desvinculaciones legítimas posteriores a la copia) y ubicaciones de satélite que el ticket no
  tiene (el usuario pudo vaciarla). `rollback.sql` recrea las tres tablas con su DDL vigente, un satélite
  por ticket del módulo EDILICIA y `reparacion_compra` desde `ticket_compra`; los comentarios no vuelven
  (quedan en el timeline). El guard del runbook del release del 2026-10-25 gana un tope superior
  (`20261025140000`) para no reclamar migraciones de releases posteriores.
- **L42 — T4b implementada (2026-10-25).** Migración `20261025150000_retiro_satelite_edilicia` + `rollback.sql`,
  modelos retirados de `schema.prisma`, runbook "Borrado de las tablas del satélite de Edilicia (T4b)", guard
  del runbook con tope `20261025140000`. Evidencia: `migracion-retiro-satelite-edilicia.integration.spec.ts`
  6/6 (aborta sin copia, aborta con dependiente, borra y avisa, re-ejecutable, rollback como proyección,
  re-aplicable), `runbook-migraciones.spec.ts` 10/10, typecheck y lint limpios, suite backend completa
  790 archivos / 10029 tests en verde. `prisma format` se descartó: realineaba modelos ajenos.
- **L43 — Verify independiente de T4b (2026-10-25): PASS en los 5 puntos.** Probó `prisma migrate deploy` real
  (aborta atómico con P0001 y con 2BP01 ante una vista; corre en tenants sin una o sin las tres tablas), DDL del
  rollback idéntico al catálogo previo y 7 mutaciones atrapadas por el spec. Advertencias aplicadas: runbook con
  la recuperación de `P3009` y el texto de error independiente del idioma, comentario de la migración sin la
  afirmación no probada de "dos tenants sin las tablas", comentarios vencidos en cinco archivos de
  `reparaciones/`, y dos tests nuevos (DDL del rollback contra el catálogo; tenant al que le falta una tabla).
  Guard + migración + runbook 21/21, lint y typecheck limpios.
