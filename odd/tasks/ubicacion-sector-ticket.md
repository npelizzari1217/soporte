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
- [x] **T1 — Backend: modelo, alta y edición** (CA1, CA2, CA3). Migración tenant
  (`tickets.ubicacion` VarChar(255) y `tickets.sector_id` con FK y índice parcial, con
  `rollback.sql` idempotente), entidad, mapper, `CrearTicketUseCase` + `POST /tickets`,
  `EditarTicketUseCase` + `PATCH /tickets/:id`, `CrearTicketEdilicioUseCase` (solo sector), validación
  del sector, tests; v1 y formulario público sin los campos. Ruta: delegada (escritor único).
  Commit `d1183d52`.
  - Migración `20261015200000_ubicacion_sector_tickets` (FK `ON DELETE RESTRICT`, como compras);
    spec de integración con el rollback corrido dos veces. Ubicación: tope de 255 en la entidad, sin
    normalizar blancos (igual que la de Edilicia).
  - Sector inexistente → `SectorTicketInexistenteError` (422). En la edición `null` limpia y omitido
    no cambia. Edilicia acepta solo `sectorId`.
  - API v1: un test prueba que el `ValidationPipe` (whitelist) descarta los dos campos y que el
    controller no los pasa; otro, que la salida v1 no los expone.
  - Precisión aceptada: en `CrearTicketUseCase` el repositorio de sectores es el último parámetro y
    opcional (specs de integración lo arman a mano sin él); el módulo siempre lo inyecta y, si llega
    un `sectorId` sin repositorio, falla cerrado con `throw`.
  - Precisión aceptada: `PATCH /tickets/:id` no rechaza `ubicacion` en un ticket de Edilicia; la
    regla de CA2 (no se carga) la cumple el frontend, que no muestra el campo para EDILICIA.
- [x] **T2 — Backend: lectura** (CA1, CA4). `TicketResponseDto` y la respuesta de reparaciones con
  `ubicacion`, `sectorId` y `sectorNombre` resueltos en lote; tests. Ruta: delegada (mismo
  escritor). Commit `619415df`.
  - `ISectorRepository.findNombres` (un lote, incluye sectores desactivados o borrados).
    `GET /tickets` (listado y detalle) devuelve `ubicacion`, `sectorId` y `sectorNombre`; reparaciones
    devuelve `sectorId` y `sectorNombre`, sin la ubicación general. El listado de reparaciones solo
    consulta nombres si algún ticket tiene sector (el spec de exportación cuenta 5 consultas).
  - Evidencia T1+T2: `pnpm lint` 0; `pnpm typecheck` 0 (repetido por el padre); `pnpm vitest run
    src/tickets src/reparaciones src/integraciones src/sectores src/equipos/mantenimiento...` → 149
    archivos, 1469 tests pasan; otros 34 archivos (e2e de integraciones, smoke, compras, equipos,
    sla, preventivo) → 395 tests pasan; casts 594/111 (sin cambios). Suite completa: pendiente (T5).
- [x] **T3 — Frontend: tickets** (CA1, CA2, CA4). Tipos, alta y edición (Ubicación y Sector; la
  Ubicación oculta en EDILICIA), columnas del listado y detalle; tests. Ruta: delegada (escritor
  único). Commit `1a1f5715`.
  - Alta: Ubicación (hasta 255) y Sector con "Sin sector"; los vacíos no viajan. Edición: vacío →
    `null`; un sector desactivado sigue elegido como "<nombre> (dado de baja)" y se conserva al
    guardar (`conValorFueraDeCatalogo` + `useReaplicarAlResolver`, como la prioridad).
  - CA2: el encabezado del detalle y la edición ocultan Ubicación en EDILICIA (y mientras cargan los
    tipos); la edición entonces no manda `ubicacion`. `mostrarUbicacion` es `false` por defecto.
  - Listado: columnas Ubicación y Sector ("—" si falta), sin filtros nuevos.
  - Dos aserciones existentes se acotaron (contaban todas las opciones del formulario y todos los "—"
    del encabezado).
- [x] **T4 — Frontend: Edilicia** (CA2, CA4, CA5). Sector en el alta y en el listado, cantidad en el
  botón de tareas; tests. Ruta: delegada (mismo escritor). Commit `af14c519`.
  - Alta de Edilicia con Sector opcional (sin la Ubicación general). Listado con columna Sector; la
    Ubicación propia de Edilicia se mantiene.
  - CA5: `ComentariosTrigger` pasó a `ConteoTrigger`, compartido por los dos botones. "Ver subtareas"
    con badge y etiqueta accesible "(3 subtareas)" / "(1 subtarea)"; sin tareas, sin badge. Cuenta
    `row.subtareas.length` (tareas activas que ya trae el backend). Se mantiene "subtareas", que es
    como lo llama la pantalla de Edilicia (el detalle del ticket dice "Tareas").
  - Evidencia T3+T4 (frontend): `pnpm lint` sin errores ni avisos; `pnpm type-check` 0 (repetido por
    el padre); `pnpm test` → 274 archivos, 2297 tests pasan.
- [x] **T5 — Cierre**: compuertas completas, roadmap con **Cumplida** o **Desviación**, deuda de Ayuda.
  Ruta: inline (estado, compuertas y documentación).
  - Revisión: RDD figura encendida (global), pero el candidato desde `01b5a573` (55 archivos, 2053
    líneas) excedió el presupuesto de contexto del revisor nativo (`lens_context_budget_exceeded`,
    sin autoridad creada). Por decisión del dueño se corrió `judgment-day` sobre
    `01b5a573...a4063822` (diff sha256 `d78b1a32…`). Ronda 1: 0 CRITICAL.
    - JD-W1 (WARNING, los dos jueces): el detalle ocultaba para siempre la ubicación de un ticket
      cuyo tipo (no Edilicia) se desactivó, porque el catálogo de tipos solo trae los activos (contra
      CA1). Corregido con TDD por pedido del dueño en `9449bf9a`: RED "Unable to find an element with
      the text: Aula 3" (1 fallo, 17 pasan); GREEN con `mostrarUbicacion = tiposQuery.isSuccess &&
      modulo !== "EDILICIA"` (los tipos de Edilicia son del sistema y no se desactivan); 211 tests de
      tickets pasan, lint y type-check en 0.
    - Re-juicio acotado: los dos jueces dan JD-W1 por resuelto, sin defectos causados por el arreglo.
      **Veredicto: APPROVED.**
    - Info, sin corregir: JD-S1 (un juez) — `@MaxLength` cuenta los pares sustitutos como un carácter
      y la entidad usa `.length`: una ubicación de más de 255 unidades UTF-16 por API directa da 500
      (mismo patrón previo que el título; la interfaz lo impide). Sugerencia del re-juicio (un juez):
      con `isSuccess`, si falla un refresco en segundo plano del catálogo la ubicación se oculta hasta
      el siguiente refresco bueno (falla cerrado; el `PATCH` la omite).
  - Compuertas: backend `pnpm test` completo → 741 archivos, 8877 tests pasan (el `FAIL
    orden-de-arranque.spec.ts` es el fixture intencional; corrido sobre `619415df`, el backend no
    cambió después); frontend `pnpm test` completo → 274 archivos, 2297 tests (sobre `af14c519`) y
    `src/features/tickets` → 211 tests tras el arreglo; lint y typecheck en 0 en los dos lados;
    casts 594/111; `check-roadmap-fresco` en verde. `src/kb` → 79 tests.
  - Roadmap: la viñeta declara **Cumplida** con sus precisiones; deuda de Ayuda anotada en la sección
    "Deuda de Ayuda".
  - Ayuda: dos artículos quedaban falsos y se corrigieron en `58c3c53b` (`tickets-listado.md`: el CSV
    no trae las columnas nuevas; `reparaciones-listado.md`: la fila suma el sector). Queda como deuda
    la descripción de los campos en los formularios y la cantidad del botón de subtareas.

## Ruta y entrega
- RDD: figuraba apagada al planificar; el 2026-10-16 figura encendida (global) y no pudo revisar
  la feature por tamaño (ver T5). Feature: TDD no exigido; cada tarea lleva sus tests. El arreglo
  JD-W1 es un bugfix y llevó TDD.
- Ruta: T1 a T4 delegadas (escritor único, 2+ archivos no triviales); T5 inline.
- Previsión: ~700-900 líneas; estrategia `ask-on-risk`. GitHub en pausa: un commit por tarea y merge
  local al final. Hay migración tenant: se ofrece `judgment-day` antes del merge.

## Progreso
- 2026-10-15: decisión escrita en el roadmap y exploración hecha; documento creado.
- 2026-10-15: T1 y T2 hechas (backend).
- 2026-10-16: T3 y T4 hechas (frontend). RDD figura encendida (global); el dueño pidió revisar solo
  esta feature (`--base-ref 01b5a573 --committed-only`): el candidato desde `66865b6d` excedía el
  presupuesto de contexto del revisor.
- 2026-10-16: `judgment-day` aprobado tras corregir JD-W1; T5 hecha.
- 2026-10-16: revisión del diff completo (§4.2) limpia; merge local `ce9c337b`. Deploy autorizado por el
  dueño: `predeploy-dump` (`utc-backfill-20261015-193350`), bundle y `deploy.ps1` → prod `ce9c337b`; la
  migración quedó aplicada en los 9 tenants (verificado en `_prisma_migrations` y en las columnas).
  Smoke: `/login` 200, `/api/v1/openapi.json` 200, `/api/v1/tickets` y `/api/tickets` sin sesión 401.

## Próximo paso
Ninguno: feature cerrada y desplegada. Queda la deuda de Ayuda anotada en el roadmap.
