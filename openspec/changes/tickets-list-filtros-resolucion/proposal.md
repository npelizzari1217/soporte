# Proposal: tickets-list-filtros-resolucion

## Intent & Why

Hoy la lista de tickets (`GET /tickets`) devuelve todo con un único `ORDER BY created_at DESC`, sin orden secundario y sin filtros: no se puede acotar por tipo ni por rango temporal, y el operador ve ruido de períodos viejos. Además el modelo arrastra `fechaVencimiento`, semántica incorrecta: el negocio no maneja "vencimiento" sino **fecha de resolución** que carga el técnico al cerrar el trabajo. Por último, el form de alta no ayuda al usuario (no propone el tipo del contexto y no permite fijar la fecha de creación, que queda atada al `@default(now())` de la DB).

Este change resuelve tres problemas: (1) listado **ordenado y filtrable en backend** acotado por defecto al ciclo de trabajo activo del tenant; (2) renombrar el dominio a `fechaResolucion` con su flujo correcto (la setea el técnico al pasar a RESUELTO); (3) defaults inteligentes en el form de alta (tipo del contexto + fecha de creación editable).

**Éxito**: la lista respeta `created_at DESC` y luego tipo alfabético, filtra por tipos y rango, arranca en el ciclo activo, y avisa con popup si no hay ciclo. El alta acepta tipo y fecha. El dominio habla de `fechaResolucion`. Todo bajo Hexagonal y TDD estricto.

## Scope

### IN
- **B/C Backend**: filtros (`tiposIds[]`, `fechaDesde`, `fechaHasta`) + orden `created_at DESC, tipo ASC` en `ITicketRepository.findAll(filtros)` → use case → repo Prisma → controller `@Query`. Índices `tipoId`/`createdAt` ya existen.
- **C Endpoint**: `GET /tickets/ciclo-activo` reutilizando `CicloCliente.findActive()`.
- **C Frontend**: UI de filtros (3 tipos + rango), default = ciclo activo; si no hay ciclo → lista vacía + popup "no hay ciclo activo"; query-key con params.
- **D Frontend**: el form de alta propone el tipo seleccionado en el contexto (editable).
- **E**: `fechaCreacion` editable en el alta (default hoy); el alta la acepta (no depende de `@default(now())`).
- **F**: rename `fechaVencimiento` → `fechaResolucion` (~20 touch points + migración en TODAS las tenant DBs); la carga el técnico al transicionar a RESUELTO (extender `PATCH /tickets/:id/estado`); se quita del form de alta/edición.

### OUT
- Paginación (diferida explícitamente).
- Permisos por `usuario_tipos_ticket` (se muestran los 3 tipos siempre).

### DECISIÓN A TOMAR — Gestión de ciclos
Los ciclos tienen inicio/fin con default anual (1-ene a 31-dic) **proponible y editable desde la tabla de ciclos**. **Recomendación: change APARTE** (`gestion-ciclos-cliente`). Tradeoffs:

- **Aparte (recomendado)**: este change sólo *consume* el ciclo activo (read). La edición de ciclos es un CRUD con su propia UI, validación de solapamiento y default anual — cohesión distinta, no bloquea el listado, evita inflar el presupuesto de PRs. Riesgo: si no hay ningún ciclo creado, la lista queda vacía hasta que exista el otro change → mitigación: seed/default anual mínimo o un slice puente.
- **Adentro como slice propio**: entrega valor end-to-end (crear ciclo → ver lista). Costo: +2 PRs, mezcla concerns y dispara riesgo de presupuesto.

## Approach (alto nivel, por capa)

**Backend (Hexagonal, multi-tenant valida usuario+tenant)**
- *Dominio*: rename `fechaVencimiento`→`fechaResolucion` en `Ticket` (entity + VOs). Filtros como tipo de criterio del puerto, no detalle Prisma.
- *Aplicación*: `ListarTicketsUseCase.execute(filtros)`; `CrearTicketUseCase` acepta `fechaCreacion`; `TransicionarEstadoUseCase` setea `fechaResolucion` cuando `nuevoEstado === RESUELTO`.
- *Infra*: `PrismaTicketRepository.findAll` arma `WHERE deleted_at IS NULL [+ tipoId IN] [+ createdAt BETWEEN] ORDER BY created_at DESC, tipo ASC`; mapper renombrado; migración `RENAME COLUMN` corrida por tenant.
- *Interface*: `@Query()` en `GET /tickets`; `GET /tickets/ciclo-activo`; DTOs nuevos/renombrados; `fechaResolucion?` en el body de `PATCH estado`.

**Frontend (Super Premium, Container/Presentational)**
- Container de filtros (tipos + rango), default desde `ciclo-activo`; popup glass si no hay ciclo.
- `useTickets(filtros)` con query-key parametrizada (invalida cache stale).
- Form: pre-popula tipo del contexto, agrega `fechaCreacion` editable, quita el campo de resolución.

## Slicing (auto-chain, objetivo <400 líneas/PR)

1. **PR1 — Backend listado: filtros + orden + endpoint ciclo-activo** (B/C backend). Puerto, use case, repo Prisma, `@Query`, `GET /tickets/ciclo-activo`, DTOs + tests. ~300 líneas. Riesgo: medio.
2. **PR2 — Rename `fechaVencimiento`→`fechaResolucion`** (F dominio/app/infra + **migración multi-tenant**). ~20 touch points en 12 archivos + migración por tenant + tests. **~350–400 líneas → RIESGO DE PRESUPUESTO ALTO**; plan de corte si excede: PR2a (rename mecánico + migración) / PR2b sólo si hace falta.
3. **PR3 — Flujo técnico resolución + alta acepta fecha** (E backend + F flujo). `PATCH estado` setea `fechaResolucion` en RESUELTO; `CrearTicketUseCase`/DTO aceptan `fechaCreacion` + tests. ~180 líneas. Riesgo: bajo.
4. **PR4 — Frontend filtros + ciclo + popup** (B/C frontend). UI filtros, wiring `ciclo-activo`, popup no-cycle, query-key params. ~300 líneas. Riesgo: medio.
5. **PR5 — Frontend form** (D + E + F frontend). Pre-popula tipo, `fechaCreacion` editable, quita campo resolución. ~200 líneas. Riesgo: bajo.

Orden de dependencias: PR1 → (PR2 → PR3) → PR4 → PR5. PR2 es el cuello de botella de presupuesto.

## Risks
- **Migración multi-tenant (PR2)**: `RENAME COLUMN` debe correr en TODAS las tenant DBs; fallo parcial deja dominio y DB desincronizados. Mitigar con runner idempotente y verificación post-migración por tenant.
- **Presupuesto PR2**: ~20 touch points + migración rozan/superan 400 líneas. Plan de corte preacordado.
- **Cache stale (query-key)**: agregar params a `queryKeys.tickets` sin migrar todos los `invalidate` deja listas desactualizadas. Auditar usos de la key.
- **Quitar campo del form (F frontend)**: validar que no rompa edición/schemas (`schemas.ts`, `use-ticket-form.ts`) ni tickets ya resueltos.
- **Ambigüedad gestión de ciclos**: si no hay ciclo activo la lista queda vacía; sin el change aparte resuelto, el feature parece "roto". Definir antes de spec.
- **Sin ciclo activo (UX)**: el popup debe ser claro y ofrecer ruta a crear ciclo (depende de la decisión anterior).
