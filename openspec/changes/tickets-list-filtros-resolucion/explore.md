# Explore: tickets-list-filtros-resolucion

**Change**: tickets-list-filtros-resolucion
**Fecha**: 2026-06-28
**Status**: done
**Engram**: `sdd/tickets-list-filtros-resolucion/explore` (id: 1531)

---

## Objetivo (requerimientos del usuario)
- **B)** Lista ordenada por fecha descendente y por tipo.
- **C)** Filtro de tipos (elegir qué tipos ver) + filtro por rango de fechas, default = ciclo de trabajo vigente.
- **D)** Al dar de alta, si hay un tipo seleccionado en el contexto de la lista/filtro, el form propone ese tipo (cambiable).
- **E)** El ticket tiene fecha de creación; esa es la fecha que el form propone por defecto.
- **F)** Rename de dominio: `fechaVencimiento` → `fechaResolucion`, completada por el técnico (sale del form de creación).

---

## 1. Esquema Ticket — `backend/prisma_tenant/schema.prisma:157–194`

| Campo | Tipo DB | Notas |
|---|---|---|
| `fechaVencimiento` | `DateTime? @map("fecha_vencimiento") @db.Date` | L170 — EXISTE, nullable |
| `createdAt` | `DateTime @default(now()) @map("created_at") @db.Timestamptz` | L171 — auto por DB, no editable |
| `tipoId` | `String @map("tipo_id") @db.Uuid` | L163 — FK a `tipos_ticket` |
| `estadoId`, `prioridadId`, `cicloId` | UUID FK | presentes |

Índices útiles para filtrado backend: `@@index([tipoId])` (L186), `@@index([createdAt])` (L192).

## 2. Dominio + capa app (HOY)
- `ListarTicketsUseCase.execute()` sin parámetros → `ticketRepo.findAll()`. `listar-tickets.use-case.ts:19`
- `ITicketRepository.findAll(): Promise<TicketEntity[]>` sin args. `i-ticket.repository.ts:37`
- `PrismaTicketRepository.findAll()` hardcoded `WHERE deleted_at IS NULL ORDER BY created_at DESC`. `prisma-ticket.repository.ts:66–72`
- `TicketsController GET /tickets` sin `@Query()`. `tickets.controller.ts:190–196`

No existe filtrado por tipo, rango de fechas ni orden secundario por tipo.

## 3. `fechaVencimiento` — impacto del rename (req F): ~20 touch points en 12 archivos + 1 migración
Domain (`ticket.entity.ts:20,56,141,179`), app (`crear-ticket.use-case.ts:41`), DTOs (`tickets.dto.ts:28,64,79`), controller (`tickets.controller.ts:99,156,331`), mapper (`ticket.mapper.ts:29,54`), schema DB (`prisma_tenant/schema.prisma:170`). Frontend: `types.ts:19`, `TicketFormModal.tsx:172–185`, `use-ticket-form.ts:60`, `schemas.ts:30,66,82`.

Hoy lo setea cualquier usuario con `ticket:crear`/`ticket:editar`. Cambio: quitarlo del create/edit form y definir flujo técnico.

## 4. Ciclo de trabajo (HOY)
- Master `CicloVigente` (`fechaInicio`, `fechaFin`, `activo`); controller solo `POST /ciclos-vigentes` (no hay GET).
- Tenant `CicloCliente` (`fechaInicio`, `fechaFin`, `activo`); `ICicloClienteRepository.findActive()` YA implementado (`prisma-ciclo-cliente.repository.ts:51`). **No hay endpoint HTTP** que exponga el ciclo activo. `CICLO_CLIENTE_REPOSITORY` ya está en `TicketsModule`.

## 5. Frontend (HOY)
- `useTickets()` → `apiFetch<Ticket[]>('tickets')` sin params; TQ key `["tickets"]` (hay que ampliarla con filtros).
- `TicketsList` renderiza CardRow (número, tipo, fecha de creación). Sin filtros/sort visible.
- `TicketFormModal` campo `<input type="date">` label "Fecha de vencimiento". Sin pre-populación de tipo.
- `TIPOS` (`shared/lib/catalogos.ts:38–42`): 3 entradas hardcodeadas.
- `TicketsPage` contenedor puro, sin estado de filtro.

## 6. Gaps por requerimiento
| Req | Gap |
|---|---|
| B | Orden `created_at DESC` ya existe; falta orden secundario por tipo. |
| C | Cero filtros; no hay endpoint del ciclo activo. |
| D | `useForm` default `tipoId:""`; `TicketsPage` no tiene estado de filtro ni lo pasa al modal. |
| E | `createdAt` auto-set por DB; no hay campo editable. (Ambiguo — ver preguntas.) |
| F | ~20 touch points con nombre viejo; hoy lo setea el creador; no hay flujo técnico. |

## 7. Decisiones recomendadas (con tradeoffs)
- **Filtros/orden: BACKEND** (índices listos, escalable a paginación, hexagonal). Port ampliado: `findAll(filtros?: { tiposIds?, fechaDesde?, fechaHasta? })`.
- **Ciclo activo: `GET /tickets/ciclo-activo`** (reusa wiring existente, costo mínimo).
- **Rename: directo** (`ALTER TABLE ... RENAME COLUMN`), columna nullable, sin datos críticos; `prisma migrate deploy` multi-tenant.
- **fechaResolucion: extender `PATCH /tickets/:id/estado`** — la setea el técnico al transicionar a RESUELTO (una llamada, una transacción).

## 8. Preguntas abiertas
1. **B**: ¿orden por tipo es secundario dentro del mismo día? ¿orden de tipos alfabético o de negocio?
2. **C**: ¿default de fecha desde `ciclos_cliente` (tenant) o `ciclos_vigentes` (master)? Si no hay ciclo activo, ¿default "desde hoy" o "sin filtro"?
3. **E**: ¿significa que el default del rango del FILTRO es "hoy", o hay un campo de fecha manual en el form distinto de `createdAt`/`fechaResolucion`?
4. **F**: ¿el técnico setea `fechaResolucion` solo al pasar a RESUELTO, o también editable luego? ¿aplica a CERRADO?
5. **C**: ¿el selector muestra los 3 tipos siempre o según `usuario_tipos_ticket`?
6. **Paginación**: ¿esta PR incluye `limit`/`offset` o solo filtro+orden?

## 9. Archivos a tocar (preliminar)
**Backend**: prisma_tenant/schema.prisma + migration, ticket.entity.ts, i-ticket.repository.ts, listar-tickets.use-case.ts, transicionar-estado.use-case.ts, tickets.controller.ts, tickets.dto.ts, prisma-ticket.repository.ts, ticket.mapper.ts + specs.
**Frontend**: types.ts, schemas.ts, TicketFormModal.tsx, use-ticket-form.ts, use-tickets.ts, tickets/page.tsx, query-keys.ts, nuevo componente de filtro, nuevo `use-ciclo-activo.ts`.

## Riesgos
- Rename corre en TODAS las tenant DBs; seguro (preserva datos) pero confirmar que no haya SQL raw/seeds con el nombre viejo.
- Req E ambiguo: bloquea el alcance del form.
- Quitar el campo de resolución del create/edit elimina capacidad de planning para quien lo usara.
- `queryKeys.tickets.all=["tickets"]` sin params → incluir filtros en la key o habrá cache stale.

## next_recommended: sdd-propose (tras resolver preguntas abiertas)
