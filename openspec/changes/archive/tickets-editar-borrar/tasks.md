# Tasks: tickets-editar-borrar

> Checklist TDD RED→GREEN. Runner: **Jest** (`strict_tdd: true`).  
> Cada par TEST/IMPL es una unidad de entrega atomica en verde antes de avanzar.  
> Generado desde spec + design + decisiones lockeadas (las decisiones lockeadas MANDAN
> sobre el spec/design cuando difieren — ver sección de overrides abajo).

---

## Decisiones lockeadas — overrides sobre spec/design

| # | Locked decision | Spec/design original | Ganador |
|---|----------------|---------------------|---------|
| L1 | `tipoId` EXCLUIDO de PATCH | spec lo incluye como campo editable | **locked** |
| L2 | DELETE idempotente — 2° borrado → 204 no-op SIN 2ª OperacionTicket | spec dice 409 + TicketYaEliminadoError | **locked** |
| L3 | DELETE éxito → **204 No Content** (sin body) | spec dice 200 + TicketResponseDto | **locked** |
| L4 | `prioridadId` y `cicloId` validados vs catálogo → 422 | design R-4 los dejaba caer en 500 | **locked** |
| L5 | `TicketYaEliminadoError` y 409 → **NO se crean** | design los mencionaba como R-1 | **locked** |

---

## Dependency graph

```
S1 (permisos + catálogo + tipo_operacion)
  └──► S2 (editar)      ← independiente de S3
  └──► S3 (eliminar)    ← independiente de S2
```

S1 debe estar completamente verde antes de iniciar S2 o S3.  
S2 y S3 pueden ejecutarse en paralelo una vez S1 está verde.

---

## S1 — Permisos + catálogo + tipo_operacion

> Sin deps de código existente. Habilita que los guards reconozcan `ticket:editar`/`ticket:eliminar`
> y que los use cases resuelvan `EDICION`/`ELIMINACION` en `tipo_operacion`.

### S1-T1 [TEST] Migración master — integration

**Archivo**: test de integración sobre DB master de test  
**Capa**: infra/migración  
**Mocks**: ninguno (DB real de test)  
**Spec ref**: auth-rbac §"Permisos sembrados", §"UUID determinista", §"Rol ADMIN", §"Rol SOPORTE_IT", §"Re-ejecución no duplica"

Escenarios que deben estar RED antes de crear el archivo SQL:

- [ ] `master.permisos` contiene fila `codigo='ticket:editar'` con `id='b0000000-0000-4000-b000-000000000012'`
- [ ] `master.permisos` contiene fila `codigo='ticket:eliminar'` con `id='b0000000-0000-4000-b000-000000000013'`
- [ ] `master.roles_permisos` asocia ADMIN con `ticket:editar` y `ticket:eliminar`
- [ ] `master.roles_permisos` asocia SOPORTE_IT con `ticket:editar` y NO con `ticket:eliminar`
- [ ] Roles MANTENIMIENTO / APROBADOR_COMPRAS / SOLICITANTE NO tienen ninguno de los dos permisos
- [ ] 2ª ejecución de la migración completa sin error y sin duplicar filas

### S1-T2 [IMPL] Migración master

**Archivo**: `prisma_master/migrations/<ts>_seed_rbac_ticket_editar_eliminar/migration.sql`  
**Capa**: infra/migración

```sql
-- 2 permisos (UUIDs deterministas serie b0...)
INSERT INTO permisos (id, codigo, descripcion) VALUES
  ('b0000000-0000-4000-b000-000000000012', 'ticket:editar',   'Editar campos de datos de un ticket'),
  ('b0000000-0000-4000-b000-000000000013', 'ticket:eliminar', 'Dar de baja (soft-delete) un ticket')
ON CONFLICT (codigo) DO NOTHING;

-- roles_permisos via SELECT JOIN por codigo (no hardcodear UUIDs de roles)
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE (r.codigo = 'ADMIN'      AND p.codigo IN ('ticket:editar','ticket:eliminar'))
   OR (r.codigo = 'SOPORTE_IT' AND p.codigo IN ('ticket:editar'))
ON CONFLICT (rol_id, permiso_id) DO NOTHING;
```

---

### S1-T3 [TEST] Migración tenant — integration

**Archivo**: test de integración sobre DB tenant de test  
**Capa**: infra/migración  
**Mocks**: ninguno (DB real de test)  
**Spec ref**: tickets-core §"Seed de tipo_operacion EDICION y ELIMINACION presente en todo tenant"

Escenarios RED:

- [ ] `tipo_operacion` contiene fila `codigo='EDICION'` con `id='f0000000-0000-4000-f000-000000000007'`
- [ ] `tipo_operacion` contiene fila `codigo='ELIMINACION'` con `id='f0000000-0000-4000-f000-000000000008'`
- [ ] 2ª ejecución idempotente (sin duplicados, sin error)

### S1-T4 [IMPL] Migración tenant data-only

**Archivo**: `prisma_tenant/migrations/<ts>_seed_tipo_operacion_edicion_eliminacion/migration.sql`  
**Capa**: infra/migración

```sql
INSERT INTO tipo_operacion (id, codigo, nombre) VALUES
  ('f0000000-0000-4000-f000-000000000007', 'EDICION',     'Edición'),
  ('f0000000-0000-4000-f000-000000000008', 'ELIMINACION', 'Eliminación')
ON CONFLICT (codigo) DO NOTHING;
```

Nota: esta migración la aplica `scripts/migrate-tenants.ts` sobre todos los tenants existentes.

---

### S1-T5 [TEST] Seeders tenant — contenido y idempotencia

**Archivos**: test que ejecuta el SQL de seed sobre DB tenant vacía (integration) o que
verifica el string SQL del seeder (unit snapshot)  
**Capa**: infra/seed  
**Mocks**: ninguno si integration; ninguno si snapshot

Escenarios RED:

- [ ] `prisma_tenant/seeds/tenant-seed.ts` → `SEED_TIPO_OPERACION_SQL` contiene fila EDICION (`f0...007`)
- [ ] `prisma_tenant/seeds/tenant-seed.ts` → contiene fila ELIMINACION (`f0...008`)
- [ ] `src/clientes/infrastructure/tenant-seeder.adapter.ts` → mismas 2 filas
- [ ] Ambos seeders tienen `ON CONFLICT (codigo) DO NOTHING` (idempotente)
- [ ] Re-ejecución sobre DB que ya tiene las filas no genera error ni duplicados

### S1-T6 [IMPL] Actualizar los 2 seeders

**Archivos**:
- `prisma_tenant/seeds/tenant-seed.ts` — añadir EDICION y ELIMINACION a `SEED_TIPO_OPERACION_SQL`
- `src/clientes/infrastructure/tenant-seeder.adapter.ts` — añadir ídem

Actualizar comentario/log de conteo ("(6 tipos)" → "(8 tipos)") en ambos archivos.

---

## S2 — Editar (dep: S1 completado)

> Habilita `PATCH /tickets/:id`. Capa por capa en TDD: domain → infra (repos nuevos) →
> application → interface → module wiring.

### S2-T1 [IMPL] Nuevos errores de dominio

**Archivo**: `backend/src/tickets/domain/errors/tickets.errors.ts` (añadir al final)  
**Capa**: dominio

Errores a agregar:

```ts
/** TICKET_NO_EDITABLE — ticket en estado terminal (CERRADO/CANCELADO). HTTP 422. */
export class TicketNoEditableError extends DomainError {
  readonly code = 'TICKET_NO_EDITABLE';
  constructor(estadoCodigo: string) { /* ... */ }
}

/** TITULO_INVALIDO — titulo vacío o solo blancos. HTTP 422. */
export class TituloInvalidoError extends DomainError {
  readonly code = 'TITULO_INVALIDO';
  constructor() { /* ... */ }
}

/** PRIORIDAD_NO_ENCONTRADA — prioridadId enviado por el usuario no existe. HTTP 422. */
export class PrioridadNoEncontradaError extends DomainError {
  readonly code = 'PRIORIDAD_NO_ENCONTRADA';
  constructor(prioridadId: string) { /* ... */ }
}

/** CICLO_NO_ENCONTRADO — cicloId enviado por el usuario no existe. HTTP 422. */
export class CicloNoEncontradoError extends DomainError {
  readonly code = 'CICLO_NO_ENCONTRADO';
  constructor(cicloId: string) { /* ... */ }
}
```

Nota TDD: estos errores se crean ANTES de los tests S2-T2/T4/T10 porque los archivos
spec los importan en tiempo de compilación. La fase RED es que los tests los referencian
y el archivo no existe → error de compilación (ts-jest).

---

### S2-T2 [TEST] `ticket.entity.spec.ts` — canEdit()

**Archivo**: `backend/src/tickets/domain/entities/ticket.entity.spec.ts` (añadir describe)  
**Capa**: dominio / unit puro  
**Mocks**: ninguno  
**Spec ref**: tickets-core §"Edición rechazada — ticket en estado terminal", §"Edición rechazada — ticket soft-deleted"

Escenarios RED (antes de S2-T3):

- [ ] `ticket.canEdit('ABIERTO')` → `true`
- [ ] `ticket.canEdit('EN_PROGRESO')` → `true`
- [ ] `ticket.canEdit('CERRADO')` → `false`
- [ ] `ticket.canEdit('CANCELADO')` → `false`
- [ ] Ticket con `deletedAt` seteado: `ticket.canEdit('ABIERTO')` → `false`
- [ ] Ticket con `deletedAt` seteado: `ticket.canEdit('CERRADO')` → `false` (deleted tiene precedencia)

### S2-T3 [IMPL] `canEdit()` en TicketEntity

**Archivo**: `backend/src/tickets/domain/entities/ticket.entity.ts`

```ts
/** Invariante de editabilidad: deleted o terminal → false; activo no-terminal → true. */
canEdit(estadoActualCodigo: string): boolean {
  if (this.isDeleted()) return false;
  if (TERMINAL_STATES.has(estadoActualCodigo)) return false;
  return true;
}
```

Patrón: espejo de `canTransitionTo`. Reutiliza `TERMINAL_STATES` ya existente.

---

### S2-T4 [TEST] `ticket.entity.spec.ts` — updateDatos()

**Archivo**: `backend/src/tickets/domain/entities/ticket.entity.spec.ts` (añadir describe)  
**Capa**: dominio / unit puro  
**Mocks**: ninguno  
**Spec ref**: tickets-core §"Edición exitosa de campos de datos", §"Campo prohibido incluido en body es ignorado"

Escenarios RED (antes de S2-T5):

- [ ] `updateDatos({})` → ninguna prop cambia
- [ ] `updateDatos({ titulo: 'Nuevo título' })` → `ticket.titulo === 'Nuevo título'`; `descripcion` sin cambios
- [ ] `updateDatos({ titulo: '   ' })` → throws `TituloInvalidoError`
- [ ] `updateDatos({ titulo: '' })` → throws `TituloInvalidoError`
- [ ] `updateDatos({ descripcion: null })` → `ticket.descripcion === null`
- [ ] `updateDatos({ descripcion: 'Texto' })` → `ticket.descripcion === 'Texto'`
- [ ] `updateDatos({ cicloId: null })` → `ticket.cicloId === null`
- [ ] `updateDatos({ fechaVencimiento: null })` → `ticket.fechaVencimiento === null`
- [ ] `updateDatos({ fechaVencimiento: new Date('2027-01-01') })` → prop actualizada
- [ ] `updateDatos({ prioridadId: 'uuid-x' })` → `ticket.prioridadId === 'uuid-x'`
- [ ] `ticket.updatedAt` avanza después de updateDatos (no igual al valor inicial)
- [ ] `updateDatos({ descripcion: undefined })` → `descripcion` sin cambios (undefined no toca)

### S2-T5 [IMPL] `ActualizarDatosTicket` + `updateDatos()` en TicketEntity

**Archivo**: `backend/src/tickets/domain/entities/ticket.entity.ts`

Agregar ANTES de la clase:

```ts
/**
 * Campos editables del ticket vía PATCH.
 * `undefined` = no tocar; `null` = limpiar (solo campos nullable).
 * NOTA: `tipoId` está EXCLUIDO (locked decision — numero derivado del tipo original).
 */
export interface ActualizarDatosTicket {
  titulo?: string;
  descripcion?: string | null;
  prioridadId?: string;
  cicloId?: string | null;
  fechaVencimiento?: Date | null;
}
```

Método en la clase:

```ts
/**
 * Partial update de campos de datos. Semántica: undefined=no tocar, null=limpiar.
 * Throws TituloInvalidoError si titulo viene definido pero es vacío tras trim().
 */
updateDatos(datos: ActualizarDatosTicket): void {
  if (datos.titulo !== undefined) {
    if (datos.titulo.trim() === '') throw new TituloInvalidoError();
    this.props.titulo = datos.titulo;
  }
  if (datos.descripcion !== undefined) this.props.descripcion = datos.descripcion;
  if (datos.prioridadId !== undefined) this.props.prioridadId = datos.prioridadId;
  if (datos.cicloId !== undefined) this.props.cicloId = datos.cicloId;
  if (datos.fechaVencimiento !== undefined) this.props.fechaVencimiento = datos.fechaVencimiento;
  this._updatedAt = new Date();
}
```

---

### S2-T6 [TEST] `prisma-ciclo-cliente.repository.spec.ts`

**Archivo**: `backend/src/tickets/infrastructure/persistence/prisma/prisma-ciclo-cliente.repository.spec.ts`  
**Capa**: infra / unit  
**Mocks**: `PrismaClient` tenant mock (`jest.fn()` sobre métodos de `ciclos_cliente`)

Escenarios RED (antes de S2-T7):

- [ ] `findById('non-existent-uuid')` → `null`
- [ ] `findById('valid-uuid')` → `CicloClienteEntity` con props correctas (reconstitución)

### S2-T7 [IMPL] `PrismaCicloClienteRepository`

**Archivos**:
- `backend/src/tickets/infrastructure/persistence/prisma/prisma-ciclo-cliente.repository.ts`
  Implementa `ICicloClienteRepository` (findById, findActive, findAll, save).
  Mapper inline igual al patrón de `estado.mapper.ts` (`CicloClienteEntity.reconstitute(...)`).

---

### S2-T8 [TEST] `prisma-prioridad.repository.spec.ts`

**Archivo**: `backend/src/tickets/infrastructure/persistence/prisma/prisma-prioridad.repository.spec.ts`  
**Capa**: infra / unit  
**Mocks**: `PrismaClient` tenant mock

Escenarios RED (antes de S2-T9):

- [ ] `findById('non-existent-uuid')` → `null`
- [ ] `findById('valid-uuid')` → `PrioridadEntity` con props correctas

### S2-T9 [IMPL] Puerto `IPrioridadRepository` + `PrismaPrioridadRepository`

**Archivos**:
- `backend/src/tickets/domain/ports/i-prioridad.repository.ts`
  ```ts
  export interface IPrioridadRepository {
    findById(id: string): Promise<PrioridadEntity | null>;
  }
  export const PRIORIDAD_REPOSITORY = Symbol('PRIORIDAD_REPOSITORY');
  ```
- `backend/src/tickets/infrastructure/persistence/prisma/prisma-prioridad.repository.ts`
  Implementa `IPrioridadRepository`. Mapper inline (`PrioridadEntity.reconstitute(...)`).

---

### S2-T10 [TEST] `editar-ticket.use-case.spec.ts`

**Archivo**: `backend/src/tickets/application/use-cases/editar-ticket.use-case.spec.ts`  
**Capa**: aplicación / unit  
**Mocks**:
- `ticketRepo: jest.Mocked<ITicketRepository>` — `findById`, `save`
- `estadoRepo: jest.Mocked<IEstadoRepository>` — `findById`
- `prioridadRepo: jest.Mocked<IPrioridadRepository>` — `findById`
- `cicloRepo: jest.Mocked<ICicloClienteRepository>` — `findById`
- `operacionRepo: jest.Mocked<IOperacionTicketRepository>` — `save`
- `tipoOperacionRepo: jest.Mocked<ITipoOperacionRepository>` — `findIdByCodigo`
- `txRunner: { run: jest.fn().mockImplementation(async (cb) => cb()) }`

Escenarios RED (todos deben fallar antes de S2-T11):

- [ ] Ticket no existe (`ticketRepo.findById → null`) → `Result.fail(TicketNoEncontradoError)`
- [ ] Ticket soft-deleted (`ticket.isDeleted() === true`) → `Result.fail(TicketNoEncontradoError)`
  Spec ref: tickets-core §"Edición rechazada — ticket soft-deleted"
- [ ] Estado catálogo null (`estadoRepo.findById → null`) → `Result.fail(EstadoCatalogoNoEncontradoError)`
  Spec ref: tickets-core §"Rollback si falla registro de auditoría" (catálogo corrupto → 500)
- [ ] `ticket.canEdit` false (estadoCodigo='CERRADO') → `Result.fail(TicketNoEditableError)`
  Spec ref: tickets-core §"Edición rechazada — ticket en estado terminal CERRADO"
- [ ] `datos.prioridadId` definido y `prioridadRepo.findById → null` → `Result.fail(PrioridadNoEncontradaError)`
- [ ] `datos.cicloId` definido y no-null y `cicloRepo.findById → null` → `Result.fail(CicloNoEncontradoError)`
- [ ] `datos.titulo = '   '` → `updateDatos` throws → `Result.fail(TituloInvalidoError)`
  Spec ref: tickets-core §"Edición exitosa de campos de datos" (campo no-vacío es invariante)
- [ ] `tipoOperacionRepo.findIdByCodigo('EDICION') → null` → `Result.fail(TipoOperacionNoEncontradoError)`
  Spec ref: tickets-core §"Rollback si falla registro de auditoría en edición"
- [ ] Happy path: `ticketRepo.findById → ticket activo ABIERTO` + datos válidos →
  - `ticketRepo.save` called with mutated ticket
  - `operacionRepo.save` called with OperacionTicket de tipo EDICION
  - `metadata.camposModificados` contiene solo las keys enviadas (`['titulo']`)
  - `txRunner.run` used (atomicidad)
  - `Result.ok(ticket)` retornado
  Spec ref: tickets-core §"Edición exitosa de campos de datos"

### S2-T11 [IMPL] `EditarTicketDto` + `EditarTicketUseCase`

**Archivo**: `backend/src/tickets/application/use-cases/editar-ticket.use-case.ts`

```ts
export interface EditarTicketDto {
  ticketId: string;
  datos: ActualizarDatosTicket;
  autorId: string; // user.sub del JWT
}
```

Flujo (sin tipoId — locked decision L1):

1. `ticketRepo.findById(ticketId)` → `!ticket || ticket.isDeleted()` → `TicketNoEncontradoError`
2. `estadoRepo.findById(ticket.estadoId)` → null → `EstadoCatalogoNoEncontradoError`
3. `!ticket.canEdit(estado.codigo)` → `TicketNoEditableError`
4. Si `datos.prioridadId !== undefined`: `prioridadRepo.findById(datos.prioridadId)` → null → `PrioridadNoEncontradaError`
5. Si `datos.cicloId !== undefined && datos.cicloId !== null`: `cicloRepo.findById(datos.cicloId)` → null → `CicloNoEncontradoError`
6. `try { ticket.updateDatos(datos) } catch (e) { if (e instanceof TituloInvalidoError) return Result.fail(e); throw e; }`
7. `tipoOperacionRepo.findIdByCodigo('EDICION')` → null → `TipoOperacionNoEncontradoError`
8. `camposModificados = Object.keys(datos).filter(k => (datos as any)[k] !== undefined)`
9. Construir `OperacionTicketEntity` EDICION con `metadata: { camposModificados }`
10. `txRunner.run(() => { ticketRepo.save(ticket); operacionRepo.save(operacion); })`
11. `Result.ok(ticket)`

Dependencias: `ticketRepo, estadoRepo, prioridadRepo, cicloRepo, operacionRepo, tipoOperacionRepo, txRunner`

---

### S2-T12 [TEST] `tickets.controller.spec.ts` — PATCH /tickets/:id

**Archivo**: `backend/src/tickets/interface/controllers/tickets.controller.spec.ts` (añadir sección)  
**Capa**: interface / unit  
**Mocks**: `editarTicketUseCase: { execute: jest.fn() }`

Escenarios RED (antes de S2-T13):

- [ ] Happy path → `HTTP 200` + `TicketResponseDto` (campos reflejan ticket mutado)
  Spec ref: tickets-core §"Edición exitosa de campos de datos"
- [ ] `TicketNoEncontradoError` → `HTTP 404 NotFoundException`
  Spec ref: tickets-core §"Edición rechazada — ticket soft-deleted"
- [ ] `TicketNoEditableError` → `HTTP 422 UnprocessableEntityException`
  Spec ref: tickets-core §"Edición rechazada — ticket en estado terminal CERRADO"
- [ ] `TituloInvalidoError` → `HTTP 422 UnprocessableEntityException`
- [ ] `PrioridadNoEncontradaError` → `HTTP 422 UnprocessableEntityException`
- [ ] `CicloNoEncontradoError` → `HTTP 422 UnprocessableEntityException`
- [ ] `EstadoCatalogoNoEncontradoError` → `HTTP 500 InternalServerErrorException`
- [ ] `TipoOperacionNoEncontradoError` → `HTTP 500 InternalServerErrorException`
- [ ] `fechaVencimiento: '2027-06-01'` (string) → use case recibe `Date` (conversión verificada con spy)
- [ ] `fechaVencimiento: null` → use case recibe `null` (null preservado, no convertido a string)
- [ ] `@RequirePermissions('ticket:editar')` configurado en el handler (Reflector metadata)
  Spec ref: auth-rbac §"Usuario sin ticket:editar recibe 403"

### S2-T13 [IMPL] `UpdateTicketHttpDto` + PATCH handler

**Archivos**:
- `backend/src/tickets/interface/dtos/tickets.dto.ts` — añadir:
  ```ts
  /** Cuerpo HTTP para PATCH /tickets/:id. Sin tipoId (locked decision). */
  export interface UpdateTicketHttpDto {
    titulo?: string;
    descripcion?: string | null;
    prioridadId?: string;
    cicloId?: string | null;
    fechaVencimiento?: string | null; // ISO; controller convierte a Date
  }
  ```

- `backend/src/tickets/interface/controllers/tickets.controller.ts` — añadir:
  ```ts
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ticket:editar')
  async editarTicket(
    @Param('id') id: string,
    @Body() dto: UpdateTicketHttpDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TicketResponseDto> { ... }
  ```
  Mapeo de errores al patrón del controller (ver design §3.3). Conversión `fechaVencimiento`:
  `dto.fechaVencimiento !== undefined && dto.fechaVencimiento !== null ? new Date(dto.fechaVencimiento) : dto.fechaVencimiento`.

---

### S2-T14 [IMPL] Module wiring S2

**Archivo**: `backend/src/tickets/tickets.module.ts`

Agregar providers:
```ts
{ provide: PRIORIDAD_REPOSITORY, useClass: PrismaPrioridadRepository },
{ provide: CICLO_CLIENTE_REPOSITORY, useClass: PrismaCicloClienteRepository },
{
  provide: EditarTicketUseCase,
  useFactory: (ticketRepo, estadoRepo, prioridadRepo, cicloRepo, operacionRepo, tipoOpRepo, txRunner) =>
    new EditarTicketUseCase(ticketRepo, estadoRepo, prioridadRepo, cicloRepo, operacionRepo, tipoOpRepo, txRunner),
  inject: [
    TICKET_REPOSITORY, ESTADO_REPOSITORY, PRIORIDAD_REPOSITORY,
    CICLO_CLIENTE_REPOSITORY, OPERACION_TICKET_REPOSITORY,
    TIPO_OPERACION_REPOSITORY, TENANT_TRANSACTION_RUNNER,
  ],
},
```

Inyectar `EditarTicketUseCase` en el constructor de `TicketsController`.

---

## S3 — Eliminar (dep: S1, paralelo con S2)

> Habilita `DELETE /tickets/:id`. Más simple que S2: no carga estado, no valida FKs.
> Idempotencia como no-op 204 (locked decision L2/L3).

### S3-T1 [TEST] `eliminar-ticket.use-case.spec.ts`

**Archivo**: `backend/src/tickets/application/use-cases/eliminar-ticket.use-case.spec.ts`  
**Capa**: aplicación / unit  
**Mocks**:
- `ticketRepo: jest.Mocked<ITicketRepository>` — `findById`, `save`
- `operacionRepo: jest.Mocked<IOperacionTicketRepository>` — `save`
- `tipoOperacionRepo: jest.Mocked<ITipoOperacionRepository>` — `findIdByCodigo`
- `txRunner: { run: jest.fn().mockImplementation(async (cb) => cb()) }`

Nota: NO se mockea `estadoRepo` — el use case NO carga el estado (borrado permitido en terminal).

Escenarios RED (antes de S3-T2):

- [ ] `ticketRepo.findById → null` → `Result.fail(TicketNoEncontradoError)`
  Spec ref: tickets-core §"Soft delete rechazado — ticket de otro tenant" (→ 404)
- [ ] `ticket.isDeleted() === true` → `Result.ok(ticket)` (no-op idempotente)
  `operacionRepo.save` NO debe ser llamado
  `ticketRepo.save` NO debe ser llamado
  `txRunner.run` NO debe ser llamado
  Spec ref: locked decision L2 (override sobre spec §"Doble borrado rechazado")
- [ ] `tipoOperacionRepo.findIdByCodigo('ELIMINACION') → null` → `Result.fail(TipoOperacionNoEncontradoError)`
  Spec ref: tickets-core §"Rollback si falla el registro de auditoría en eliminación"
- [ ] Happy path (ticket activo): `ticket.softDelete()` called, `ticketRepo.save` called,
  `operacionRepo.save` called con OperacionTicket ELIMINACION (`metadata: null`),
  `txRunner.run` used, `Result.ok(ticket)` retornado
  Spec ref: tickets-core §"Soft delete exitoso de ticket activo"
- [ ] Happy path (ticket en estado CERRADO, no-deleted): `Result.ok(ticket)` — no falla
  `ticket.softDelete()` called (borrado permitido en terminal)
  Spec ref: tickets-core §"Soft delete de ticket en estado terminal — permitido"

### S3-T2 [IMPL] `EliminarTicketDto` + `EliminarTicketUseCase`

**Archivo**: `backend/src/tickets/application/use-cases/eliminar-ticket.use-case.ts`

```ts
export interface EliminarTicketDto {
  ticketId: string;
  autorId: string;
}
```

Flujo:

1. `ticketRepo.findById(ticketId)` → `!ticket` → `TicketNoEncontradoError`
2. Si `ticket.isDeleted()` → `Result.ok(ticket)` ← no-op idempotente (L2)
3. `tipoOperacionRepo.findIdByCodigo('ELIMINACION')` → null → `TipoOperacionNoEncontradoError`
4. `ticket.softDelete()`
5. Construir `OperacionTicketEntity` ELIMINACION con `metadata: null`
6. `txRunner.run(() => { ticketRepo.save(ticket); operacionRepo.save(operacion); })`
7. `Result.ok(ticket)`

Dependencias: `ticketRepo, operacionRepo, tipoOperacionRepo, txRunner` (sin estadoRepo).

---

### S3-T3 [TEST] `tickets.controller.spec.ts` — DELETE /tickets/:id

**Archivo**: `backend/src/tickets/interface/controllers/tickets.controller.spec.ts` (añadir sección)  
**Capa**: interface / unit  
**Mocks**: `eliminarTicketUseCase: { execute: jest.fn() }`

Escenarios RED (antes de S3-T4):

- [ ] Happy path → `HTTP 204` + sin body (`res.body` vacío o `void`)
  Spec ref: locked decision L3 (DELETE exitoso → 204)
- [ ] Idempotente (use case devuelve `Result.ok` para ya-borrado) → también `HTTP 204` sin body
  Spec ref: locked decision L2
- [ ] `TicketNoEncontradoError` → `HTTP 404 NotFoundException`
  Spec ref: tickets-core §"Soft delete rechazado — ticket de otro tenant"
- [ ] `TipoOperacionNoEncontradoError` → `HTTP 500 InternalServerErrorException`
  Spec ref: tickets-core §"Rollback si falla el registro de auditoría en eliminación"
- [ ] `@RequirePermissions('ticket:eliminar')` configurado (Reflector metadata)
  Spec ref: auth-rbac §"Usuario sin ticket:eliminar recibe 403 en DELETE"
- [ ] `@HttpCode(204)` configurado en el handler

### S3-T4 [IMPL] DELETE handler en controller

**Archivo**: `backend/src/tickets/interface/controllers/tickets.controller.ts` — añadir:

```ts
@Delete(':id')
@HttpCode(HttpStatus.NO_CONTENT)
@RequirePermissions('ticket:eliminar')
async eliminarTicket(
  @Param('id') id: string,
  @CurrentUser() user: JwtPayload,
): Promise<void> { ... }
```

Imports adicionales: `Delete`, `ConflictException` (no se usa), `HttpStatus.NO_CONTENT`.  
Mapeo de errores: `TicketNoEncontradoError → NotFoundException`, `TipoOperacionNoEncontradoError → InternalServerErrorException`.
Retorna `void` explícito (sin body → 204).

---

### S3-T5 [IMPL] Module wiring S3

**Archivo**: `backend/src/tickets/tickets.module.ts`

```ts
{
  provide: EliminarTicketUseCase,
  useFactory: (ticketRepo, operacionRepo, tipoOpRepo, txRunner) =>
    new EliminarTicketUseCase(ticketRepo, operacionRepo, tipoOpRepo, txRunner),
  inject: [
    TICKET_REPOSITORY, OPERACION_TICKET_REPOSITORY,
    TIPO_OPERACION_REPOSITORY, TENANT_TRANSACTION_RUNNER,
  ],
},
```

Inyectar `EliminarTicketUseCase` en el constructor de `TicketsController`.

---

## Resumen de dependencias entre tasks

```
S1-T1 → S1-T2    (test RED → migration SQL)
S1-T3 → S1-T4    (test RED → migration SQL)
S1-T5 → S1-T6    (test RED → seeder update)

S2-T1             (errores de dominio: precondición de compilación para T2/T4/T10)
S2-T2 → S2-T3    (test canEdit → impl canEdit)
S2-T4 → S2-T5    (test updateDatos → impl updateDatos + ActualizarDatosTicket)
S2-T6 → S2-T7    (test CicloRepo → impl PrismaCicloClienteRepository)
S2-T8 → S2-T9    (test PrioridadRepo → impl IPrioridadRepository + PrismaPrioridadRepository)
S2-T10 → S2-T11  (test EditarTicketUseCase → impl)   [requiere S2-T1..T9 compilando]
S2-T12 → S2-T13  (test controller PATCH → impl)       [requiere S2-T11]
S2-T14            (wiring solo, sin test propio — DI verificado por integration/e2e existente)

S3-T1 → S3-T2    (test EliminarTicketUseCase → impl)  [requiere S1 completo]
S3-T3 → S3-T4    (test controller DELETE → impl)       [requiere S3-T2]
S3-T5             (wiring solo)
```

Tasks que pueden correr en paralelo:

- `S2-T2/T3` ‖ `S2-T6/T7` ‖ `S2-T8/T9` (después de S2-T1)
- S2 y S3 completos son independientes entre sí (solo comparten dep S1)

---

## Review Workload Forecast

| Slice | Archivos nuevos | Archivos modificados | Líneas est. prod | Líneas est. test | Total |
|-------|----------------|---------------------|-----------------|-----------------|-------|
| S1 — Permisos + catálogo | 2 SQL (migration.sql ×2) | 2 seeders | ~80 | ~80 | **~160** |
| S2 — Editar | 5 (editar-uc, prioridad-port, prioridad-repo, ciclo-repo, ciclo-repo.spec, prioridad-repo.spec) | 4 (ticket.entity, tickets.errors, tickets.dto, tickets.controller, tickets.module) | ~420 | ~320 | **~740** |
| S3 — Eliminar | 1 (eliminar-uc) | 2 (tickets.controller, tickets.module) | ~120 | ~130 | **~250** |
| **Total change** | | | **~620** | **~530** | **~1150** |

### S2 > 400 líneas — división recomendada

S2 supera el budget de 400 líneas por la expansión de scope de locked decision L4
(validación de `prioridadId`/`cicloId` requiere 2 nuevas implementaciones infra sin
base previa: `PrismaCicloClienteRepository` + `PrismaPrioridadRepository` + mappers).

**Opción A — Split S2 en dos PRs encadenados (recomendado)**:

- **S2a** (dominio + infra repos): T1→T9 — ~300 líneas
  Entregables: errores, canEdit, updateDatos, PrismaCicloClienteRepository, IPrioridadRepository + PrismaPrioridadRepository
- **S2b** (use case + controller + wiring): T10→T14 — ~440 líneas
  Nota: S2b todavía supera 400. Podría dividirse en S2b (use case) y S2c (controller + wiring) si el proyecto exige límite estricto.

**Opción B — size:exception con PR único de S2 (~740 líneas)**:
Justificable por coherencia semántica (todas son piezas del mismo feature PATCH).
Requiere aprobación explícita antes de apply.

### Decisión necesaria antes de apply

**Sí.** El orquestador debe resolver la estrategia de entrega para S2 antes de invocar
`sdd-apply`. Opciones: split S2a/S2b vs size:exception.

S1 y S3 caben en un PR cada uno (< 400 líneas) y no requieren decisión.

**Chained PRs recomendados**: Sí (para S2)  
**400-line budget risk**: High (S2 ~740 líneas)  
**Decision needed before apply**: **Yes**
