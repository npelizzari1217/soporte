# Apply Progress: tickets-editar-borrar

> Generado por sdd-apply — S1 + S2a + S2b + S3 completados. BACKEND COMPLETO.
> Fecha: 2026-06-27. Suite base: 1470 tests → S1: 1496 tests → S2a: 1520 tests → S2b: 1543 tests → S3: 1554 tests (11 nuevos de S3).

---

## Estado por task

### S1 — Permisos + catálogo + tipo_operacion ✅ COMPLETO

- [x] S1-T1 [TEST] Migración master — integration
  - Archivo: `src/shared/infrastructure/persistence/seed-rbac-ticket-editar-eliminar.spec.ts`
  - 13 tests: permisos, roles_permisos ADMIN/SOPORTE_IT, otros roles, idempotencia
  - Nota: movido de `prisma_master/migrations/__tests__/` a `src/shared/` porque Prisma trata subdirectorios de migrations/ como migraciones (error P3015)

- [x] S1-T2 [IMPL] Migración master
  - Archivo: `backend/prisma_master/migrations/20260627000000_seed_rbac_ticket_editar_eliminar/migration.sql`
  - Inserta `ticket:editar` (b0...012) y `ticket:eliminar` (b0...013) con ON CONFLICT DO NOTHING
  - roles_permisos via CROSS JOIN por codigo: ADMIN→ambos, SOPORTE_IT→solo ticket:editar

- [x] S1-T3 [TEST] Migración tenant — integration
  - Archivo: `src/shared/infrastructure/persistence/seed-tipo-operacion-edicion-eliminacion.spec.ts`
  - 4 tests: EDICION (f0...007), ELIMINACION (f0...008), idempotencia
  - Nota: mismo gotcha de Prisma — movido a src/shared/

- [x] S1-T4 [IMPL] Migración tenant data-only
  - Archivo: `backend/prisma_tenant/migrations/20260627010000_seed_tipo_operacion_edicion_eliminacion/migration.sql`
  - Inserta EDICION y ELIMINACION con ON CONFLICT DO NOTHING
  - Aplica a tenants EXISTENTES vía scripts/migrate-tenants.ts

- [x] S1-T5 [TEST] Seeders tenant — contenido y idempotencia (unit snapshot)
  - Archivo: `src/clientes/infrastructure/tenant-seed-tipo-operacion.spec.ts`
  - 10 tests: 5 por tenant-seed.ts + 5 por tenant-seeder.adapter.ts
  - Verifica UUID f0...007/f0...008, codigos EDICION/ELIMINACION, ON CONFLICT DO NOTHING

- [x] S1-T6 [IMPL] Actualizar los 2 seeders
  - `backend/prisma_tenant/seeds/tenant-seed.ts` → SEED_TIPO_OPERACION_SQL ahora tiene 8 filas
  - `backend/src/clientes/infrastructure/tenant-seeder.adapter.ts` → SEED_TIPO_OPERACION_SQL ahora tiene 8 filas
  - Log actualizado: "8 tipos de evento, incluye UBICACION_ELIMINADA, EDICION, ELIMINACION"

### Tests existentes actualizados (evitar regresiones)

- `src/shared/infrastructure/persistence/tenant-seed.integration.spec.ts`:
  - EXPECTED_TIPO_OPERACION ahora incluye 'EDICION' y 'ELIMINACION'
  - Conteo actualizado de 6 → 8 en 2 assertions

- `src/clientes/infrastructure/crear-cliente.e2e.spec.ts`:
  - "tipo_operacion: 6 tipos de evento sembrados" → "8 tipos de evento sembrados"

---

### S2a — Editar (dominio + infra repos) ✅ COMPLETO

- [x] S2-T1 [IMPL] Nuevos errores de dominio
  - Archivo: `backend/src/tickets/domain/errors/tickets.errors.ts` (añadido al final)
  - `TicketNoEditableError` (TICKET_NO_EDITABLE, HTTP 422)
  - `TituloInvalidoError` (TITULO_INVALIDO, HTTP 422)
  - `PrioridadNoEncontradaError` (PRIORIDAD_NO_ENCONTRADA, HTTP 422)
  - `CicloNoEncontradoError` (CICLO_NO_ENCONTRADO, HTTP 422)
  - Nota: creados antes de T2/T4 porque los specs los importan en tiempo de compilación

- [x] S2-T2 [TEST] `ticket.entity.spec.ts` — canEdit()
  - Archivo: `backend/src/tickets/domain/entities/ticket.entity.spec.ts` (añadido describe)
  - 6 tests: ABIERTO→true, EN_PROGRESO→true, CERRADO→false, CANCELADO→false, deleted+ABIERTO→false, deleted+CERRADO→false

- [x] S2-T3 [IMPL] `canEdit()` en TicketEntity
  - Archivo: `backend/src/tickets/domain/entities/ticket.entity.ts`
  - Espeja canTransitionTo, reutiliza TERMINAL_STATES

- [x] S2-T4 [TEST] `ticket.entity.spec.ts` — updateDatos()
  - Archivo: `backend/src/tickets/domain/entities/ticket.entity.spec.ts` (añadido describe)
  - 12 tests: objeto vacío, titulo actualizado, titulo vacío→error, descripcion null, cicloId null,
    fechaVencimiento null/Date, prioridadId actualizado, updatedAt avanza, undefined no toca

- [x] S2-T5 [IMPL] `ActualizarDatosTicket` + `updateDatos()` en TicketEntity
  - Archivos modificados:
    - `backend/src/tickets/domain/entities/ticket.entity.ts` — interface + método
    - `backend/src/shared/domain/base-entity.ts` — añadido método protected `touch()`
  - Semántica: undefined=no tocar, null=limpiar. tipoId excluido (locked L1).
  - Llama `this.touch()` para actualizar `_updatedAt`

- [x] S2-T6 [TEST] `prisma-ciclo-cliente.repository.spec.ts`
  - Archivo NUEVO: `backend/src/tickets/infrastructure/persistence/prisma/prisma-ciclo-cliente.repository.spec.ts`
  - 3 tests: findById null, findById→entidad con props correctas, deletedAt reconstituido

- [x] S2-T7 [IMPL] `PrismaCicloClienteRepository`
  - Archivo NUEVO: `backend/src/tickets/infrastructure/persistence/prisma/prisma-ciclo-cliente.repository.ts`
  - Implementa ICicloClienteRepository (findById, findActive, findAll, save)
  - Mapper inline, patrón idéntico a PrismaEstadoRepository

- [x] S2-T8 [TEST] `prisma-prioridad.repository.spec.ts`
  - Archivo NUEVO: `backend/src/tickets/infrastructure/persistence/prisma/prisma-prioridad.repository.spec.ts`
  - 3 tests: findById null, findById→entidad con props correctas, color null

- [x] S2-T9 [IMPL] Puerto `IPrioridadRepository` + `PrismaPrioridadRepository`
  - Archivo NUEVO: `backend/src/tickets/domain/ports/i-prioridad.repository.ts`
    - interface IPrioridadRepository { findById(id): Promise<PrioridadEntity | null> }
    - PRIORIDAD_REPOSITORY = Symbol('PRIORIDAD_REPOSITORY')
  - Archivo NUEVO: `backend/src/tickets/infrastructure/persistence/prisma/prisma-prioridad.repository.ts`
    - Implementa IPrioridadRepository. Mapper inline (PrioridadEntity.reconstitute)

### S2b — Editar (use case + controller + wiring) ✅ COMPLETO

- [x] S2-T10 [TEST] `editar-ticket.use-case.spec.ts`
  - Archivo NUEVO: `backend/src/tickets/application/use-cases/editar-ticket.use-case.spec.ts`
  - 12 tests: ticket inexistente→404, soft-deleted→404, estado catálogo null→500,
    canEdit false (CERRADO)→422, prioridadId FK inválida→422, cicloId FK inválida→422,
    cicloId null no valida FK, titulo vacío→422, EDICION no en catálogo→500,
    happy path (save+operacion+tx+metadata), happy path con múltiples campos, happy path datos vacíos

- [x] S2-T11 [IMPL] `EditarTicketDto` + `EditarTicketUseCase`
  - Archivo NUEVO: `backend/src/tickets/application/use-cases/editar-ticket.use-case.ts`
  - Flujo: findById→deleted check→estado→canEdit→prioridad FK→ciclo FK→updateDatos→tipoOperacionId→OperacionTicket+tx
  - metadata: { camposModificados: Object.keys(datos).filter(!==undefined) }
  - Mismo patrón transaccional que transicionar-estado (txRunner.run + await)

- [x] S2-T12 [TEST] `tickets.controller.spec.ts` — PATCH /tickets/:id
  - Archivo MODIFICADO: `backend/src/tickets/interface/controllers/tickets.controller.spec.ts`
  - 11 tests nuevos: happy path 200, 404, 422 (TicketNoEditable/Titulo/Prioridad/Ciclo),
    500 (EstadoCatalogo/TipoOperacion), fechaVencimiento string→Date,
    fechaVencimiento null preservado, @RequirePermissions('ticket:editar')
  - Actualizado makeUseCaseMocks + constructor a 7 args

- [x] S2-T13 [IMPL] `UpdateTicketHttpDto` + PATCH handler
  - Archivo MODIFICADO: `backend/src/tickets/interface/dtos/tickets.dto.ts`
    - Añadido UpdateTicketHttpDto (interface plana, todos opcionales, SIN tipoId/estado)
  - Archivo MODIFICADO: `backend/src/tickets/interface/controllers/tickets.controller.ts`
    - Añadido PATCH ':id' handler: @RequirePermissions('ticket:editar'), @HttpCode(200)
    - Conversión fechaVencimiento: string ISO → Date; null → null; undefined → undefined
    - Mapeo errores: 404/422/500 según el patrón existente
    - Constructor ampliado a 7 deps (+ EditarTicketUseCase)

- [x] S2-T14 [IMPL] Module wiring S2
  - Archivo MODIFICADO: `backend/src/tickets/tickets.module.ts`
    - +imports: IPrioridadRepository/PRIORIDAD_REPOSITORY, ICicloClienteRepository/CICLO_CLIENTE_REPOSITORY
    - +imports infra: PrismaPrioridadRepository, PrismaCicloClienteRepository
    - +imports use-case: EditarTicketUseCase
    - +providers: PRIORIDAD_REPOSITORY → PrismaPrioridadRepository
    - +providers: CICLO_CLIENTE_REPOSITORY → PrismaCicloClienteRepository
    - +providers: EditarTicketUseCase via useFactory (inject 7 deps)

### S3 — Eliminar ✅ COMPLETO

- [x] S3-T1 [TEST] `eliminar-ticket.use-case.spec.ts`
  - Archivo NUEVO: `backend/src/tickets/application/use-cases/eliminar-ticket.use-case.spec.ts`
  - 5 tests: ticket inexistente→404, ya-borrado→no-op (sin operacion/save/tx), ELIMINACION null→500,
    happy path activo (softDelete+save+operacion ELIMINACION en tx, metadata:null),
    happy path terminal CERRADO (borrado permitido sin chequeo canEdit)
  - Idempotencia confirmada: operacionRepo.save, ticketRepo.save, txRunner.run — NINGUNO llamado en no-op

- [x] S3-T2 [IMPL] `EliminarTicketUseCase`
  - Archivo NUEVO: `backend/src/tickets/application/use-cases/eliminar-ticket.use-case.ts`
  - Flujo: findById→null check→isDeleted no-op→tipoOperacion→softDelete→OperacionTicket→tx
  - metadata: null (ELIMINACION mínima, igual que ASIGNACION)
  - NO carga estadoRepo (borrado permitido en terminal)
  - Usa ticketRepo.save(ticket) con deletedAt seteado (NO repo.delete) — mantiene atomicidad tx

- [x] S3-T3 [TEST] `tickets.controller.spec.ts` — DELETE /tickets/:id
  - Archivo MODIFICADO: `backend/src/tickets/interface/controllers/tickets.controller.spec.ts`
  - 6 tests nuevos: happy path void 204, idempotente void 204, 404, 500 TipoOperacion,
    @RequirePermissions ticket:eliminar, @HttpCode 204
  - Actualizado makeUseCaseMocks + constructor a 8 args

- [x] S3-T4 [IMPL] DELETE handler en controller
  - Archivo MODIFICADO: `backend/src/tickets/interface/controllers/tickets.controller.ts`
  - +import Delete de @nestjs/common
  - +import EliminarTicketUseCase
  - +8th constructor dep: eliminarTicketUseCase
  - +DELETE ':id' handler: @RequirePermissions('ticket:eliminar'), @HttpCode(204), retorna void
  - Mapeo: TicketNoEncontrado→404, TipoOperacion→500

- [x] S3-T5 [IMPL] Module wiring S3
  - Archivo MODIFICADO: `backend/src/tickets/tickets.module.ts`
  - +import EliminarTicketUseCase
  - +provider: EliminarTicketUseCase via useFactory (inject 4 deps: TICKET, OPERACION, TIPO_OPERACION, TX)

### Fix higiene — test flaky ✅

- [x] `backend/src/tickets/domain/entities/ticket.entity.spec.ts` (línea 254)
  - setTimeout timeout: 1ms → 10ms en test "updatedAt avanza"
  - Confirmado verde en suite completa bajo carga

---

## Resultado de tests

- Suite S3 final: **1554 tests, 0 failed** (108 suites)
- Suite S2b: 1543 tests (107 suites)
- Tests nuevos de S3: 11 tests (5 use-case + 6 controller DELETE)
- Suite S2a: 1520 tests (106 suites)
- Tests nuevos de S2b: 23 tests (12 use-case + 11 controller PATCH)
- Suite base anterior: 1496 tests (104 suites, 1 fallando compilación)
- Tests nuevos de S2a: 24 tests (2 suites ticket.entity.spec + 2 nuevas suites repos)

---

## Archivos creados / modificados

### S2b — Nuevos
- `backend/src/tickets/application/use-cases/editar-ticket.use-case.ts`
- `backend/src/tickets/application/use-cases/editar-ticket.use-case.spec.ts`

### S3 — Nuevos
- `backend/src/tickets/application/use-cases/eliminar-ticket.use-case.ts`
- `backend/src/tickets/application/use-cases/eliminar-ticket.use-case.spec.ts`

### S3 — Modificados
- `backend/src/tickets/interface/controllers/tickets.controller.ts` — +Delete import, +EliminarTicketUseCase, +8th dep, +DELETE handler
- `backend/src/tickets/interface/controllers/tickets.controller.spec.ts` — +6 tests DELETE, +8th mock arg
- `backend/src/tickets/tickets.module.ts` — +EliminarTicketUseCase import y provider
- `backend/src/tickets/domain/entities/ticket.entity.spec.ts` — fix flaky: setTimeout 1ms→10ms

### S2b — Modificados
- `backend/src/tickets/interface/dtos/tickets.dto.ts` — +UpdateTicketHttpDto
- `backend/src/tickets/interface/controllers/tickets.controller.ts` — +PATCH handler +7th dep
- `backend/src/tickets/interface/controllers/tickets.controller.spec.ts` — +11 tests PATCH
- `backend/src/tickets/tickets.module.ts` — +PrismaPrioridadRepository +PrismaCicloClienteRepository +EditarTicketUseCase wiring

### S1 — Nuevos
- `backend/prisma_master/migrations/20260627000000_seed_rbac_ticket_editar_eliminar/migration.sql`
- `backend/prisma_tenant/migrations/20260627010000_seed_tipo_operacion_edicion_eliminacion/migration.sql`
- `backend/src/shared/infrastructure/persistence/seed-rbac-ticket-editar-eliminar.spec.ts`
- `backend/src/shared/infrastructure/persistence/seed-tipo-operacion-edicion-eliminacion.spec.ts`
- `backend/src/clientes/infrastructure/tenant-seed-tipo-operacion.spec.ts`

### S1 — Modificados
- `backend/prisma_tenant/seeds/tenant-seed.ts` — +2 filas en SEED_TIPO_OPERACION_SQL
- `backend/src/clientes/infrastructure/tenant-seeder.adapter.ts` — +2 filas en SEED_TIPO_OPERACION_SQL
- `backend/src/shared/infrastructure/persistence/tenant-seed.integration.spec.ts` — conteo 6→8
- `backend/src/clientes/infrastructure/crear-cliente.e2e.spec.ts` — conteo 6→8

### S2a — Nuevos
- `backend/src/tickets/domain/ports/i-prioridad.repository.ts`
- `backend/src/tickets/infrastructure/persistence/prisma/prisma-ciclo-cliente.repository.ts`
- `backend/src/tickets/infrastructure/persistence/prisma/prisma-ciclo-cliente.repository.spec.ts`
- `backend/src/tickets/infrastructure/persistence/prisma/prisma-prioridad.repository.ts`
- `backend/src/tickets/infrastructure/persistence/prisma/prisma-prioridad.repository.spec.ts`

### S2a — Modificados
- `backend/src/tickets/domain/errors/tickets.errors.ts` — +4 errores de dominio
- `backend/src/tickets/domain/entities/ticket.entity.ts` — +ActualizarDatosTicket, +updateDatos(), +canEdit()
- `backend/src/tickets/domain/entities/ticket.entity.spec.ts` — +6 tests canEdit, +12 tests updateDatos
- `backend/src/shared/domain/base-entity.ts` — +touch() protected method

---

## Próximos pasos

- sdd-verify: validación completa del change tickets-editar-borrar contra spec y design

---

## Gotcha crítico documentado (S1)

**Prisma migrations + __tests__**: No crear subdirectorios dentro de `prisma_master/migrations/` ni `prisma_tenant/migrations/` para tests. Prisma (`migrate deploy`) trata cada subdirectorio como una migración y falla con error P3015 si no encuentra `migration.sql`. Los tests de integración de migraciones deben vivir en `src/`.

## Env check (S2a)

- `ICicloClienteRepository` — EXISTÍA en `domain/ports/i-ciclo-cliente.repository.ts` (task S2-T7 menciona "implementa ICicloClienteRepository")
- `PrismaCicloClienteRepository` — NO existía → CREADO
- `IPrioridadRepository` — NO existía → CREADO en `domain/ports/i-prioridad.repository.ts`
- `PrismaPrioridadRepository` — NO existía → CREADO
- Tabla `prioridades` → accessor Prisma: `client.prioridad` (model Prioridad)
- Tabla `ciclos_cliente` → accessor Prisma: `client.cicloCliente` (model CicloCliente)
- `TERMINAL_STATES` — constante de módulo (no exportada), accesible desde dentro de ticket.entity.ts
- `touch()` en BaseEntity — AÑADIDO como `protected` para que subclases puedan actualizar `_updatedAt`
