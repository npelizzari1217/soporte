# Archive Report: tickets-editar-borrar

> Archivado: 2026-06-28  
> Modelo: claude-sonnet-4-6  
> Store: hybrid (openspec + engram)

---

## Resumen ejecutivo

Change A del CRUD de tickets. Habilita `PATCH /tickets/:id` (edición parcial de campos
de datos) y `DELETE /tickets/:id` (soft-delete idempotente) en el backend NestJS.
Implementado en TDD estricto (RED→GREEN). Suite final: **1554 tests, 0 fallos**.
Verificación: PASS WITH WARNINGS — 0 CRITICAL, 4 WARNING (reconciliación spec, corregidos
en este archive antes de promover a canónico). Specs canónicas actualizadas y el change
está cerrado.

---

## Slices implementados

| Slice | Descripción | Tests nuevos | Resultado |
|-------|-------------|--------------|-----------|
| S1 — Permisos + catálogo | Migración master (ticket:editar/eliminar), migración tenant (EDICION/ELIMINACION), seeders actualizados | +26 | VERDE |
| S2a — Editar (dominio + infra) | canEdit(), updateDatos(), PrismaCicloClienteRepository, IPrioridadRepository + PrismaPrioridadRepository, 4 errores dominio nuevos | +24 | VERDE |
| S2b — Editar (use case + controller + wiring) | EditarTicketUseCase, PATCH handler, UpdateTicketHttpDto, module wiring | +23 | VERDE |
| S3 — Eliminar | EliminarTicketUseCase, DELETE handler, module wiring, fix flaky test | +11 | VERDE |

Suite base antes del change: 1470 → 1554 (+84 tests nuevos).

---

## Locked decisions aplicadas

| # | Decisión | Descripción |
|---|----------|-------------|
| L1 | `tipoId` EXCLUIDO de PATCH | El número legible `numero` se derivó del tipo original; cambiar tipoId lo dejaría inconsistente |
| L2 | DELETE idempotente — 2° borrado → 204 no-op | Sin 2ª OperacionTicket; retry-safe para clientes de red |
| L3 | DELETE éxito → 204 No Content (void) | Sin body en respuesta |
| L4 | `prioridadId` y `cicloId` validados vs catálogo → 422 | Evita 500 por violación de FK silenciosa |
| L5 | `TicketYaEliminadoError` y 409 → NO se crean | Descartados por la semántica idempotente |

---

## Spec corrections aplicadas antes de promover a canónico (4 reconciliaciones)

| # | Warning | Spec delta original | Corregido en canónico |
|---|---------|--------------------|-----------------------|
| W1 | DELETE exitoso → 204, no 200 | "HTTP 200 con TicketResponseDto" | "HTTP 204 No Content (sin body)" |
| W2 | Doble borrado → 204 no-op, no 409 | "HTTP 409 Conflict; TicketYaEliminadoError" | "HTTP 204 No Content (no-op idempotente)" |
| W3 | tipoId excluido de campos PATCH | tipoId listado como campo editable | Eliminado de campos permitidos; agregado a inmutables |
| W4 | DELETE en terminal → 204, no 200 | "HTTP 200" en scenario de terminal | "HTTP 204 No Content" |

---

## Specs canónicas promovidas

### `openspec/specs/tickets-core/spec.md`
- Tabla `tipo_operacion` seeds: agregados EDICION (f0...007) y ELIMINACION (f0...008)
- Scenario "Nuevo tenant tiene catálogos operativos pre-poblados": 5 tipos → 7 tipos
- Nuevos requirements agregados:
  - **Edición de campos de datos del ticket** (con W3 aplicado: sin tipoId)
  - **Soft delete de tickets** (con W1, W2, W4 aplicados: 204 en todos los casos, doble borrado = 204 no-op)
  - **Exclusión de tickets soft-deleted en listados**
  - **Auditoría transaccional de edición y eliminación**

### `openspec/specs/auth-rbac/spec.md`
- Tabla `permisos` seeds: agregados ticket:editar (b0...012) y ticket:eliminar (b0...013)
- Nuevos requirements agregados:
  - **Nuevos permisos ticket:editar y ticket:eliminar en catálogo master**
  - **Asignación de permisos ticket:editar y ticket:eliminar a roles** (ADMIN→ambos, SOPORTE_IT→solo editar)
  - **Permisos ticket:editar y ticket:eliminar reflejados en el JWT**
  - **Enforcement de ticket:editar y ticket:eliminar en endpoints**

---

## Evidencia de verificación

| Artefacto | Resultado |
|-----------|-----------|
| Tests totales | 1554 passed, 0 failed |
| Test suites | 108 passed |
| `tsc --noEmit` | 0 errores |
| Aislamiento multi-tenant | CONFIRMADO (aislamiento físico por DB) |
| Enforcement de permisos | CONFIRMADO (@RequirePermissions + guard chain) |
| Idempotencia DELETE | CONFIRMADA (2° DELETE → Result.ok → 204 sin 2ª OperacionTicket) |
| Terminal states | CONFIRMADO (CERRADO/CANCELADO → 422 en edición; 204 en borrado) |
| Validación FK prioridad/ciclo | CONFIRMADA (422 en ambos; cicloId:null limpia sin validar) |
| Auditoría transaccional | CONFIRMADA (metadata.camposModificados en EDICION; null en ELIMINACION) |
| Migraciones/seeds | CONFIRMADOS (ON CONFLICT DO NOTHING en todos) |

Observación engram verify-report: ID #1516

---

## Observaciones engram (traceabilidad)

| Artefacto | ID engram | topic_key |
|-----------|-----------|-----------|
| proposal | #1511 | sdd/tickets-editar-borrar/proposal |
| spec (delta) | #1512 | sdd/tickets-editar-borrar/spec |
| design | #1513 | sdd/tickets-editar-borrar/design |
| tasks | #1514 | sdd/tickets-editar-borrar/tasks |
| apply-progress | #1515 | sdd/tickets-editar-borrar/apply-progress |
| verify-report | #1516 | sdd/tickets-editar-borrar/verify-report |
| archive-report | (este change — ver engram sdd/tickets-editar-borrar/archive-report) | sdd/tickets-editar-borrar/archive-report |

---

## Follow-ups registrados

### tickets-crud (frontend, Change B — PRÓXIMO)
La UI de CRUD que consume estos endpoints backend. Explore ya existe en
`openspec/changes/tickets-crud/explore.md`. Incluye:
- Infra de formularios: react-hook-form + zod + sonner + radix
- Componentes: Create/Edit ticket (formulario), Delete (confirmación), acciones en listado
- Transición/asignación (ya existen como endpoints; la UI los integra)
- Diseño "Super Premium" conforme al design system (spec frontend-design-system)

### Operación: migración tenant para producción
`tipo_operacion` (EDICION/ELIMINACION) se agrega a tenants NUEVOS automáticamente via
seeder. Para tenants EXISTENTES en producción: correr
`scripts/migrate-tenants.ts` (aplica `20260627010000_seed_tipo_operacion_edicion_eliminacion`
sobre todas las DBs de tenant existentes). Esta migración NO se aplica sola en el deploy.

### Deuda R-3: `tipo_operacion` mantenido a mano en 3 lugares
- `prisma_tenant/seeds/tenant-seed.ts`
- `src/clientes/infrastructure/tenant-seeder.adapter.ts`
- `prisma_tenant/migrations/...`
Olvidar uno deja tenants sin el catálogo → use cases fallan con 500.
Mitigado por idempotencia, pero es deuda estructural conocida.

### Replicar patrón CRUD a Equipos/Compras/Reparaciones
Verificar primero qué soporta el backend de cada entidad (igual que con tickets,
puede no ser CRUD completo). Crear un change dedicado por entidad.

---

## Archivos de implementación clave

### Nuevos
- `backend/src/tickets/application/use-cases/editar-ticket.use-case.ts`
- `backend/src/tickets/application/use-cases/editar-ticket.use-case.spec.ts`
- `backend/src/tickets/application/use-cases/eliminar-ticket.use-case.ts`
- `backend/src/tickets/application/use-cases/eliminar-ticket.use-case.spec.ts`
- `backend/src/tickets/domain/ports/i-prioridad.repository.ts`
- `backend/src/tickets/infrastructure/persistence/prisma/prisma-ciclo-cliente.repository.ts`
- `backend/src/tickets/infrastructure/persistence/prisma/prisma-prioridad.repository.ts`
- `backend/prisma_master/migrations/20260627000000_seed_rbac_ticket_editar_eliminar/migration.sql`
- `backend/prisma_tenant/migrations/20260627010000_seed_tipo_operacion_edicion_eliminacion/migration.sql`

### Modificados
- `backend/src/tickets/domain/entities/ticket.entity.ts` (+canEdit, +updateDatos, +ActualizarDatosTicket)
- `backend/src/tickets/domain/errors/tickets.errors.ts` (+4 errores de dominio)
- `backend/src/tickets/interface/controllers/tickets.controller.ts` (+PATCH, +DELETE handlers)
- `backend/src/tickets/interface/dtos/tickets.dto.ts` (+UpdateTicketHttpDto)
- `backend/src/tickets/tickets.module.ts` (+PrismaPrioridadRepository, +PrismaCicloClienteRepository, +EditarTicketUseCase, +EliminarTicketUseCase)
- `backend/src/shared/domain/base-entity.ts` (+touch() protected)
- `backend/prisma_tenant/seeds/tenant-seed.ts` (+EDICION, +ELIMINACION)
- `backend/src/clientes/infrastructure/tenant-seeder.adapter.ts` (+EDICION, +ELIMINACION)
