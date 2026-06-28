# Verify Report: tickets-editar-borrar

> Ejecutado: 2026-06-28  
> Modelo: claude-sonnet-4-6  
> Scope: S1 + S2a + S2b + S3 (BACKEND COMPLETO)

---

## Veredicto: PASS WITH WARNINGS

**0 CRITICAL · 4 WARNING (reconciliación spec) · 0 SUGGESTION**

Los WARNINGs son todos puntos de reconciliación spec↔decisión: el comportamiento implementado es CORRECTO según las locked decisions confirmadas. El spec delta tiene 4 escenarios cuyo texto debe actualizarse en archive antes de promover a canónico.

---

## Suite de tests

| Métrica | Resultado |
|---------|-----------|
| Tests totales | **1554 passed, 0 failed** |
| Test suites | **108 passed** |
| `tsc --noEmit` | **0 errores** |
| Duración | ~68s |

Conteo esperado según apply-progress: 1554. Confirmado exacto.

---

## Seguridad (§7 — adversarial)

### Aislamiento multi-tenant

`PrismaTicketRepository` obtiene su cliente vía `TenantContext.getClient()` — aislamiento FÍSICO (cada tenant tiene su propia DB). Un `findById` sobre un ticket de otro tenant retorna `null` → 404 sin revelar existencia.

Evidencia: `src/tickets/infrastructure/persistence/prisma/prisma-ticket.repository.ts:34` — `this.client.ticket.findUnique({ where: { id } })` donde `this.client` es el tenant activo.

Tests que cubren aislamiento:
- `eliminar-ticket.use-case.spec.ts:125` — "retorna TicketNoEncontradoError cuando el ticket no existe (incluye otro tenant)"
- `editar-ticket.use-case.spec.ts:178` — "retorna TicketNoEncontradoError cuando el ticket no existe"

**AISLAMIENTO: CONFIRMADO**

### Enforcement de permisos

| Endpoint | Permiso requerido | Evidencia |
|----------|-------------------|-----------|
| PATCH /tickets/:id | `ticket:editar` | `tickets.controller.ts:323` — `@RequirePermissions('ticket:editar')` |
| DELETE /tickets/:id | `ticket:eliminar` | `tickets.controller.ts:427` — `@RequirePermissions('ticket:eliminar')` |

Guard chain a nivel de clase: `JwtAuthGuard → RolesGuard → PermissionsGuard → TenantGuard` (`tickets.controller.ts:120`).

Tests que verifican permisos por metadata reflection:
- `tickets.controller.spec.ts:558` — `@RequirePermissions ticket:editar`
- `tickets.controller.spec.ts:618` — `@RequirePermissions ticket:eliminar`
- `tickets.controller.spec.ts:636-673` — guard chain completo

**PERMISOS: CONFIRMADOS**

---

## Idempotencia, terminal, FK

### Idempotencia DELETE (locked decision L2)

2do DELETE sobre ticket ya-borrado → `Result.ok(ticket)` sin:
- 2da OperacionTicket (`mockOperacionRepo.save` NOT called)
- 2do `ticketRepo.save` (NOT called)  
- transacción (`txRunner.run` NOT called)
- consulta de tipoOperacion (NOT called)

El controller devuelve `void` → 204.

Evidencia: `eliminar-ticket.use-case.ts:65-67` + `eliminar-ticket.use-case.spec.ts:141-158`.

**IDEMPOTENCIA: CONFIRMADA**

### Edición en estado terminal

- CERRADO → `TicketNoEditableError` → 422. Evidencia: `editar-ticket.use-case.spec.ts:216`
- CANCELADO → mismo path (TERMINAL_STATES includes 'CANCELADO'). Evidencia: `ticket.entity.ts:8`
- DELETE en terminal CERRADO → PERMITIDO (no llama canEdit). Evidencia: `eliminar-ticket.use-case.spec.ts:215`

**TERMINAL STATES: CONFIRMADOS**

### Validación FK prioridad/ciclo (locked decision L4)

- `prioridadId` inválido → `PrioridadNoEncontradaError` → 422. Evidencia: `editar-ticket.use-case.spec.ts:231`
- `cicloId` inválido (definido y no-null) → `CicloNoEncontradoError` → 422. Evidencia: `editar-ticket.use-case.spec.ts:249`
- `cicloId: null` → NO valida FK (semántica "limpiar"). Evidencia: `editar-ticket.use-case.spec.ts:267`

**FK VALIDATION: CONFIRMADA**

---

## Auditoría

| Operación | tipo_operacion | metadata | Transacción |
|-----------|----------------|----------|-------------|
| PATCH /tickets/:id | EDICION | `{ camposModificados: [...claves] }` | txRunner.run ✓ |
| DELETE /tickets/:id | ELIMINACION | `null` | txRunner.run ✓ |

Evidencia EDICION: `editar-ticket.use-case.spec.ts:347` — `expect(operacion.metadata).toEqual({ camposModificados: ['titulo'] })`  
Evidencia ELIMINACION: `eliminar-ticket.use-case.spec.ts:203` — `expect(operacion.metadata).toBeNull()`

**AUDITORÍA: CONFIRMADA**

---

## Migraciones y seeds

### Master (RBAC)

`backend/prisma_master/migrations/20260627000000_seed_rbac_ticket_editar_eliminar/migration.sql`

- `ticket:editar` → UUID `b0000000-0000-4000-b000-000000000012` ✓
- `ticket:eliminar` → UUID `b0000000-0000-4000-b000-000000000013` ✓
- `ON CONFLICT (codigo) DO NOTHING` → idempotente ✓
- `roles_permisos`: ADMIN→ambos, SOPORTE_IT→solo ticket:editar vía CROSS JOIN por codigo ✓
- `ON CONFLICT (rol_id, permiso_id) DO NOTHING` ✓

### Tenant (tipo_operacion)

`backend/prisma_tenant/migrations/20260627010000_seed_tipo_operacion_edicion_eliminacion/migration.sql`

- `EDICION` → UUID `f0000000-0000-4000-f000-000000000007` ✓
- `ELIMINACION` → UUID `f0000000-0000-4000-f000-000000000008` ✓
- `ON CONFLICT (codigo) DO NOTHING` ✓

### Seeders

- `prisma_tenant/seeds/tenant-seed.ts`: SEED_TIPO_OPERACION_SQL actualizado a 8 filas ✓
- `src/clientes/infrastructure/tenant-seeder.adapter.ts`: ídem ✓

**MIGRACIONES/SEEDS: CONFIRMADOS**

---

## Cobertura de requirements (mapeado scenario → evidencia)

### Delta tickets-core

| Scenario | Status | Evidencia principal |
|----------|--------|---------------------|
| Edición exitosa de campos de datos | SATISFECHO | `editar-ticket.use-case.spec.ts:316` |
| Campo prohibido incluido en body es ignorado | SATISFECHO | `UpdateTicketHttpDto` no incluye campos inmutables; controller no los pasa |
| Edición rechazada — estado terminal CERRADO | SATISFECHO | `editar-ticket.use-case.spec.ts:216` |
| Edición rechazada — estado terminal CANCELADO | SATISFECHO | `ticket.entity.ts:8` TERMINAL_STATES |
| Edición rechazada — ticket soft-deleted | SATISFECHO | `editar-ticket.use-case.spec.ts:190` |
| Edición rechazada — ticket de otro tenant | SATISFECHO | Aislamiento físico → null → 404 |
| Edición rechazada — sin permiso ticket:editar | SATISFECHO | `tickets.controller.spec.ts:558` |
| Soft delete exitoso de ticket activo | SATISFECHO* | `eliminar-ticket.use-case.spec.ts:177` (*204, no 200) |
| Soft delete en estado terminal — permitido | SATISFECHO* | `eliminar-ticket.use-case.spec.ts:215` (*204, no 200) |
| Doble borrado rechazado — ticket ya soft-deleted | SATISFECHO† | `eliminar-ticket.use-case.spec.ts:141` (†204 no-op, no 409) |
| Soft delete rechazado — ticket de otro tenant | SATISFECHO | Aislamiento físico → null → 404 |
| Soft delete rechazado — sin permiso ticket:eliminar | SATISFECHO | `tickets.controller.spec.ts:618` |
| Ticket recién eliminado no aparece en listado | SATISFECHO | `prisma-ticket.repository.ts:67` — `where: { deletedAt: null }` |
| GET /tickets/:id retorna 404 para soft-deleted | SATISFECHO | `obtener-ticket.use-case.ts:26` — `ticket.isDeleted()` check |
| Rollback si falla auditoría en edición | SATISFECHO | `editar-ticket.use-case.spec.ts:301` |
| Rollback si falla auditoría en eliminación | SATISFECHO | `eliminar-ticket.use-case.spec.ts:162` |
| Seed tipo_operacion presente en todo tenant | SATISFECHO | migración + seeders ✓ |

(*) y (†) = comportamiento correcto según locked decisions; spec texto desactualizado (ver reconciliación)

### Delta auth-rbac

| Scenario | Status | Evidencia principal |
|----------|--------|---------------------|
| Permisos sembrados en migración master | SATISFECHO | migration.sql:19-22 |
| UUID determinista de permisos | SATISFECHO | migration.sql: UUIDs ...012 y ...013 |
| Rol ADMIN tiene ambos permisos | SATISFECHO | migration.sql:31 |
| Rol SOPORTE_IT tiene ticket:editar, NO ticket:eliminar | SATISFECHO | migration.sql:32 |
| Otros roles no reciben permisos | SATISFECHO | migration solo menciona ADMIN y SOPORTE_IT |
| SOPORTE_IT incluye ticket:editar en JWT | SATISFECHO | Permisos en master.roles_permisos → claim permisos en JWT |
| ADMIN incluye ambos en JWT | SATISFECHO | ídem |
| Sin ticket:editar → 403 en PATCH | SATISFECHO | `@RequirePermissions('ticket:editar')` |
| Sin ticket:eliminar → 403 en DELETE | SATISFECHO | `@RequirePermissions('ticket:eliminar')` |
| Re-ejecución migración no duplica | SATISFECHO | ON CONFLICT DO NOTHING en ambas tablas |

---

## Reconciliación de spec (para archive)

Estos son los 4 puntos donde el spec delta escrito diverge de las locked decisions implementadas. El spec debe ser corregido en archive ANTES de promover a canónico.

### WARNING-1: DELETE exitoso → 204, no 200

**En spec:** `tickets-core §"Soft delete exitoso de ticket activo"` → `HTTP 200 con TicketResponseDto`  
**Locked decision L3:** DELETE exitoso → `204 No Content (void)`  
**Implementado:** 204, retorno void (sin body)  
**Archivos a corregir en spec:** líneas 122-128 y 131-137 de `specs/tickets-core/spec.md`

### WARNING-2: Doble borrado → 204 no-op, no 409 Conflict

**En spec:** `tickets-core §"Doble borrado rechazado — ticket ya soft-deleted"` → `HTTP 409 Conflict` con body de error  
**Locked decision L2:** 2do DELETE → `204 no-op idempotente` (sin 2da OperacionTicket)  
**Implementado:** Result.ok → 204 (mismo código que borrado exitoso)  
**Archivos a corregir en spec:** líneas 139-147 de `specs/tickets-core/spec.md`  
**Nota:** La sección describe la operación como "NO idempotente" y menciona TicketYaEliminadoError → debe eliminarse o reconvertirse para reflejar la semántica idempotente.

### WARNING-3: tipoId incluido en campos permitidos de PATCH

**En spec:** `tickets-core §"Requirement: Edición de campos de datos"` → body permitido incluye `tipoId`  
**Locked decision L1:** `tipoId` EXCLUIDO (campo derivado del tipo original)  
**Implementado:** `ActualizarDatosTicket` interface NO incluye `tipoId`; controller tampoco lo pasa  
**Archivos a corregir en spec:** línea 42 de `specs/tickets-core/spec.md`

### WARNING-4: Soft delete en terminal → 204, no 200

**En spec:** `tickets-core §"Soft delete de ticket en estado terminal — permitido"` → `HTTP 200`  
**Locked decision L3:** DELETE siempre → 204  
**Implementado:** 204 (mismo handler, sin distinción de estado)  
**Archivos a corregir en spec:** líneas 131-137 de `specs/tickets-core/spec.md`

---

## Archivos verificados (key)

| Archivo | Rol |
|---------|-----|
| `src/tickets/application/use-cases/editar-ticket.use-case.ts` | Caso de uso editar |
| `src/tickets/application/use-cases/eliminar-ticket.use-case.ts` | Caso de uso eliminar |
| `src/tickets/application/use-cases/editar-ticket.use-case.spec.ts` | 12 tests editar |
| `src/tickets/application/use-cases/eliminar-ticket.use-case.spec.ts` | 5 tests eliminar |
| `src/tickets/interface/controllers/tickets.controller.ts` | PATCH + DELETE handlers |
| `src/tickets/interface/controllers/tickets.controller.spec.ts` | 11+6 tests controller |
| `src/tickets/domain/entities/ticket.entity.ts` | canEdit(), updateDatos() |
| `src/tickets/domain/errors/tickets.errors.ts` | 4 errores de dominio nuevos |
| `src/tickets/tickets.module.ts` | Wiring completo |
| `prisma_master/migrations/20260627000000_seed_rbac_ticket_editar_eliminar/migration.sql` | Permisos RBAC |
| `prisma_tenant/migrations/20260627010000_seed_tipo_operacion_edicion_eliminacion/migration.sql` | tipo_operacion seeds |

---

## Próximo paso recomendado

`sdd-archive` — el change está listo para promoverse. El archive debe corregir los 4 puntos de reconciliación en el spec delta antes de copiarlo al spec canónico.
