# Tasks — tickets-list-filtros-resolucion

**Change**: tickets-list-filtros-resolucion  
**Stack**: NestJS + Prisma (backend) · Next.js + Radix (frontend)  
**TDD**: ESTRICTO — RED antes de IMPL. Contrato antes que andamiaje (CONSTITUTION §5).  
**Delivery**: auto-chain — 5 PRs encadenados, cada uno ≤ 400 líneas diff.  
**Fecha**: 2026-06-28

> **Spec refs**: `openspec/changes/tickets-list-filtros-resolucion/specs/tickets-core/spec.md`
> y `specs/tickets-ui/spec.md`.
> **Design ref**: `design.md` (ADR-1 … ADR-9).
> **Decisiones canónicas**: engram `sdd/tickets-list-filtros-resolucion/decisions` (#1532).

---

## DAG de PRs

```
PR1 (backend filtros + ciclo-activo)
  │
  └──► PR2 (rename fechaVencimiento→fechaResolucion + migración multi-tenant)
          │
          └──► PR3 (flujo técnico: resolución obligatoria + fechaCreacion en alta)
                    │
                    └──► PR4 (frontend: filtros + ciclo activo + popup)
                              │
                              └──► PR5 (frontend: form mejoras)
```

PR4 puede DESARROLLARSE en paralelo con PR2/PR3 en rama separada desde PR1, pero
solo puede MERGEARSE después de PR3 (por el rename `Ticket.fechaResolucion` en
`types.ts` que PR2 introduce y PR4 consume).

---

> ⚠️ **DISCREPANCIA SPEC vs DESIGN — `GET /tickets/ciclo-activo`**  
> Spec (tickets-core/spec.md): 200 si hay ciclo, **404** si no hay ciclo.  
> Design (ADR-2 `toCicloActivoResponse`): 200 con `null` si no hay ciclo.  
> **Resolución: seguir el SPEC (404)**. La spec es el contrato verificable.  
> El frontend `useCicloActivo` captura 404 → `{ data: null, error: null }`.  
> Impacta T1.4, T1.7, T1.8, T4.5, T4.6.

---

## PR1 — Backend: filtros + orden compuesto + `GET /tickets/ciclo-activo`

> **Spec refs**: "Listado filtrable con orden compuesto", "GET /tickets/ciclo-activo expone el ciclo activo"  
> **ADRs**: ADR-1, ADR-2, ADR-6  
> **Estimación**: ~300 líneas | **Risk**: BAJO

---

### T1.1 — Puerto `ITicketRepository` + tipo `TicketFiltros` [DOMAIN CONTRACT]

- **Archivos**: `backend/src/tickets/domain/ports/i-ticket.repository.ts`
- **Spec**: "GET /tickets MUST aceptar `tiposIds[]`, `fechaDesde`, `fechaHasta`"
- **Paralelo con**: — (gate de T1.2–T1.6)

**Acción**:
1. Agregar interfaz `TicketFiltros` en el mismo archivo (o en `ticket-filtros.ts` al lado):
   ```ts
   export interface TicketFiltros {
     tiposIds?: string[];   // UUIDs; vacío/undefined = todos
     fechaDesde?: Date;     // inclusive, sobre created_at (startOfDay)
     fechaHasta?: Date;     // inclusive, sobre created_at (endOfDay)
   }
   ```
2. Extender la firma: `findAll(filtros?: TicketFiltros): Promise<TicketEntity[]>`.
3. Mantener la implementación `PrismaTicketRepository.findAll` compatible (sin parámetro
   = comportamiento actual, sin ruptura de los usos existentes hasta T1.6).

**Criterio de done**: compila sin errores. Los tests existentes de `findAll` sin parámetro siguen en verde.

---

### T1.2 — [RED] `listar-tickets.use-case.spec.ts` — filtros pass-through

- **Archivos**: `backend/src/tickets/application/use-cases/listar-tickets.use-case.spec.ts`
- **Spec**: use case permanece PURO (ADR-2), solo delega filtros al repo
- **Paralelo con**: T1.4 (independiente)

**RED — qué asertar**:
1. `execute({ tiposIds: ['<uuid>'] })` llama `ticketRepo.findAll({ tiposIds: ['<uuid>'] })`.
2. `execute({})` llama `ticketRepo.findAll({})`.
3. `execute()` (sin args) llama `ticketRepo.findAll(undefined)` o `findAll({})` — cualquiera es aceptable.
4. El use case NO inyecta ni usa `ICicloClienteRepository` (permanece puro, sin acoplamiento al ciclo).

**Cómo**: mockear `ITicketRepository` con `vi.fn()` y asertar `toHaveBeenCalledWith`.

---

### T1.3 — [GREEN] `ListarTicketsUseCase.execute(filtros?)`

- **Archivos**: `backend/src/tickets/application/use-cases/listar-tickets.use-case.ts`
- **Dep**: T1.2 en RED

**Acción**:
1. Extender `execute(filtros?: TicketFiltros)`.
2. Pasar `filtros` al `ticketRepo.findAll(filtros)`.
3. Sin lógica adicional — thin wrapper sigue siendo thin.

**Criterio de done**: T1.2 pasa a GREEN.

---

### T1.4 — DTOs + mapper de respuesta del ciclo

- **Archivos**: `backend/src/tickets/interface/dtos/tickets.dto.ts`
- **Paralelo con**: T1.2, T1.3

**Acción**:
1. Agregar `ListarTicketsQueryDto`:
   ```ts
   export interface ListarTicketsQueryDto {
     tiposIds?: string | string[];
     fechaDesde?: string;  // 'YYYY-MM-DD'
     fechaHasta?: string;  // 'YYYY-MM-DD'
   }
   ```
2. Agregar `CicloActivoResponseDto`:
   ```ts
   export interface CicloActivoResponseDto {
     id: string;
     nombre: string;
     fechaInicio: string;  // 'YYYY-MM-DD'
     fechaFin: string;     // 'YYYY-MM-DD'
     activo: boolean;
   }
   ```
3. Agregar helper `toCicloActivoResponse(ciclo: CicloClienteEntity): CicloActivoResponseDto`
   (formatea `fechaInicio`/`fechaFin` a `YYYY-MM-DD` via `.toISOString().slice(0,10)`).

---

### T1.5 — [RED] `prisma-tickets.integration.spec.ts` — findAll con filtros + orden

- **Archivos**: `backend/src/tickets/infrastructure/persistence/prisma/prisma-tickets.integration.spec.ts`
- **Spec**: orden `created_at DESC, tipos_ticket.nombre ASC`; filtro `tiposIds[]`; filtro rango `fechaDesde/fechaHasta`
- **Dep**: T1.1 (TicketFiltros type), T1.4 (DTOs)

**RED — qué asertar** (tests de integración contra DB real):
1. `findAll()` sin filtros retorna todos los tickets activos del tenant ordenados `createdAt DESC`.
2. `findAll({ tiposIds: [idTipoA] })` retorna solo tickets de tipo A.
3. `findAll({ fechaDesde, fechaHasta })` retorna solo tickets dentro del rango.
4. Orden secundario: dos tickets con mismo `createdAt` se ordenan por `tipos_ticket.nombre ASC`.
5. `findAll({ tiposIds: ['<uuid-inexistente>'] })` retorna `[]` sin error.
6. Tickets de otro tenant NO aparecen (TenantContext aísla por DB).

---

### T1.6 — [GREEN] `PrismaTicketRepository.findAll(filtros?)`

- **Archivos**: `backend/src/tickets/infrastructure/persistence/prisma/prisma-ticket.repository.ts`
- **Dep**: T1.5 en RED

**Acción** (ver contrato exacto en ADR-1):
```ts
async findAll(filtros?: TicketFiltros): Promise<TicketEntity[]> {
  const where: Prisma.TicketWhereInput = { deletedAt: null };
  if (filtros?.tiposIds?.length) where.tipoId = { in: filtros.tiposIds };
  if (filtros?.fechaDesde || filtros?.fechaHasta) {
    where.createdAt = {
      ...(filtros.fechaDesde && { gte: filtros.fechaDesde }),
      ...(filtros.fechaHasta && { lte: filtros.fechaHasta }),
    };
  }
  const rows = await this.client.ticket.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { tipo: { nombre: 'asc' } }],
    include: { tipo: false },  // el orderBy relacional no requiere include
  });
  return rows.map(TicketMapper.toDomain);
}
```
Nota: `orderBy: { tipo: { nombre: 'asc' } }` genera el JOIN automático a `tipos_ticket` via
la relación `tipo TipoTicket @relation` (schema L175). NO SQL crudo.

**Criterio de done**: T1.5 pasa a GREEN.

---

### T1.7 — [RED] `tickets.controller.spec.ts` — filtros + cicloActivo + orden de rutas

- **Archivos**: `backend/src/tickets/interface/controllers/tickets.controller.spec.ts`
- **Spec**: coerción query params, 422 en rango inválido, GET /ciclo-activo retorna ciclo o 404, ruta estática antes de `:id`
- **ADR**: ADR-6 (orden de rutas)
- **Dep**: T1.1–T1.4

**RED — qué asertar**:

*GET /tickets con filtros*:
1. `?tiposIds=uuid-a` (string único) → use case recibe `tiposIds: ['uuid-a']` (coerción a array).
2. `?tiposIds[]=uuid-a&tiposIds[]=uuid-b` → `tiposIds: ['uuid-a', 'uuid-b']`.
3. `?fechaDesde=2026-01-01&fechaHasta=2026-06-30` → `fechaDesde: startOfDay('2026-01-01')`, `fechaHasta: endOfDay('2026-06-30')`.
4. `?fechaDesde=2026-12-31&fechaHasta=2026-01-01` (rango inválido) → HTTP 422.
5. `?fechaDesde=no-es-fecha` (formato inválido) → filtro ignorado (no 422), use case recibe `fechaDesde: undefined`.

*GET /tickets/ciclo-activo*:
6. Ciclo activo existe → HTTP 200, body con `id, nombre, fechaInicio, fechaFin, activo: true`.
7. Sin ciclo activo (`findActive()` retorna null) ��� HTTP 404.
8. Ruta `/tickets/ciclo-activo` NO cae en el handler `obtenerTicket` (ADR-6: orden declaración).

*Inyección*:
9. `TicketsController` inyecta `ICicloClienteRepository` en el constructor.

---

### T1.8 — [GREEN] Cambios en `TicketsController` — `@Get('ciclo-activo')` + `@Get()` con filtros

- **Archivos**:
  - `backend/src/tickets/interface/controllers/tickets.controller.ts`
  - `backend/src/tickets/interface/dtos/tickets.dto.ts` (ya actualizado en T1.4)
- **Dep**: T1.7 en RED

**Acción**:

1. Inyectar `@Inject(CICLO_CLIENTE_REPOSITORY) private readonly cicloClienteRepo: ICicloClienteRepository`
   en el constructor (token ya provisto en `TicketsModule`).

2. Declarar `@Get('ciclo-activo')` **ANTES** de `@Get(':id')` (ADR-6 — colisión estática vs param):
   ```ts
   @Get('ciclo-activo')
   @HttpCode(HttpStatus.OK)
   async cicloActivo(): Promise<CicloActivoResponseDto> {
     const ciclo = await this.cicloClienteRepo.findActive();
     if (!ciclo) throw new NotFoundException('No hay ciclo activo para este tenant');
     return toCicloActivoResponse(ciclo);
   }
   ```
   (HTTP 404 vía `NotFoundException` — spec toma precedencia sobre ADR-2 que decía 200 null)

3. Actualizar `@Get()` con coerción de `ListarTicketsQueryDto`:
   ```ts
   @Get()
   async listarTickets(@Query() q: ListarTicketsQueryDto, @CurrentUser() user: JwtPayload) {
     // Validación de rango
     const desde = q.fechaDesde && !isNaN(new Date(q.fechaDesde).getTime())
       ? startOfDay(new Date(q.fechaDesde)) : undefined;
     const hasta = q.fechaHasta && !isNaN(new Date(q.fechaHasta).getTime())
       ? endOfDay(new Date(q.fechaHasta)) : undefined;
     if (desde && hasta && desde > hasta)
       throw new UnprocessableEntityException('fechaDesde no puede ser mayor que fechaHasta');
     const tiposIds = q.tiposIds
       ? (Array.isArray(q.tiposIds) ? q.tiposIds : [q.tiposIds])
       : undefined;
     const result = await this.listarTicketsUseCase.execute({ tiposIds, fechaDesde: desde, fechaHasta: hasta });
     return result.getValue().map(toTicketResponse);
   }
   ```
   Nota: `date-fns` (`startOfDay`, `endOfDay`) ya es dep del proyecto; verificar o agregar si falta.

**Criterio de done**: T1.7 pasa a GREEN. TS compila. Tests existentes del controller siguen en verde.

---

## PR2 — Rename `fechaVencimiento` → `fechaResolucion` + migración multi-tenant

> **Spec refs**: "Migración multi-tenant rename idempotente y verificable", "Enmienda: Campos editables vía PATCH /tickets/:id"  
> **ADRs**: ADR-3  
> **Estimación**: ~160 líneas (18 impl + 28 test fixtures) | **Risk**: MEDIO (wide but shallow)  
> **PR2a/PR2b no necesario** — estimación muy por debajo de 400 líneas.
>
> **Regla de release**: migrar TODOS los tenants → verificar 0 errores → deploy del código.
> NO deployar el código renombrado antes de que TODAS las DBs estén migradas.

---

### T2.1 — Schema Prisma + migración SQL

- **Archivos**:
  - `backend/prisma_tenant/schema.prisma`
  - `backend/prisma_tenant/migrations/<ts>_rename_fecha_vencimiento_resolucion/migration.sql` (NUEVO)
- **Spec**: "ALTER TABLE tickets RENAME COLUMN fecha_vencimiento TO fecha_resolucion"

**Acción**:
1. En `schema.prisma`, modelo `Ticket`, cambiar:
   ```prisma
   fechaVencimiento DateTime? @db.Date @map("fecha_vencimiento")
   ```
   por:
   ```prisma
   fechaResolucion  DateTime? @db.Date @map("fecha_resolucion")
   ```
2. Crear el directorio de migración y el archivo SQL:
   ```sql
   -- backend/prisma_tenant/migrations/<ts>_rename_fecha_vencimiento_resolucion/migration.sql
   ALTER TABLE tickets RENAME COLUMN fecha_vencimiento TO fecha_resolucion;
   ```
   Nota de idempotencia: `prisma migrate deploy` NO re-ejecuta migraciones ya registradas
   en `_prisma_migrations` → idempotencia garantizada por el ORM.

---

### T2.2 — `prisma generate` [BUILD STEP]

- **Archivos**: `.prisma/tenant` (regenerado automáticamente)

**Acción**: `cd backend && npx prisma generate --schema=prisma_tenant/schema.prisma`

Después de este paso el tipo `Ticket` del client generado tiene `fechaResolucion` (ya NO `fechaVencimiento`).
El build de TS **empieza a fallar** en todos los archivos que referencian `row.fechaVencimiento` o
`entity.fechaVencimiento`. Esto es el gate del RED compile.

---

### T2.3 — [RED-COMPILE] Rename `TicketProps.fechaVencimiento` → `fechaResolucion` en dominio

- **Archivos**: `backend/src/tickets/domain/entities/ticket.entity.ts`
- **Spec**: entidad refleja el campo renombrado; `PATCH /tickets/:id` ya no acepta `fechaResolucion`
- **Dep**: T2.2 (client generado tiene `fechaResolucion`)

**Acción**:
1. `TicketProps.fechaVencimiento: Date | null` → `fechaResolucion: Date | null`.
2. Getter `get fechaVencimiento()` → `get fechaResolucion()`.
3. `ActualizarDatosTicket.fechaVencimiento?: Date | null` → **ELIMINAR** el campo
   (ya no se puede editar vía `PATCH /tickets/:id` per spec).
4. `updateDatos()`: eliminar la línea `if (datos.fechaVencimiento !== undefined) ...`.

Después de este paso: **40–50 errores de compilación TS** en specs y módulos que usan el campo.
Esos errores guían las tareas T2.4–T2.8.

---

### T2.4 — [GREEN] Capa de aplicación — `crear-ticket.use-case.ts` + sus specs

- **Archivos**:
  - `backend/src/tickets/application/use-cases/crear-ticket.use-case.ts`
  - `backend/src/tickets/application/use-cases/crear-ticket.use-case.spec.ts`
  - `backend/src/tickets/application/use-cases/listar-tickets.use-case.spec.ts`
  - `backend/src/tickets/application/use-cases/obtener-ticket.use-case.spec.ts`
  - `backend/src/tickets/application/use-cases/asignar-ticket.use-case.spec.ts`
  - `backend/src/tickets/application/use-cases/adjuntar-archivo.use-case.spec.ts`
  - `backend/src/tickets/application/use-cases/editar-ticket.use-case.spec.ts`
  - `backend/src/tickets/application/use-cases/eliminar-ticket.use-case.spec.ts`
  - `backend/src/tickets/application/use-cases/transicionar-estado.use-case.spec.ts`
  - `backend/src/tickets/domain/entities/ticket.entity.spec.ts`

**Acción**:
1. `crear-ticket.use-case.ts`: en `CrearTicketDto`, el campo `fechaVencimiento?: Date | null` se
   **ELIMINA** (no se renombra; será `fechaCreacion` en PR3). En la llamada a `TicketEntity.create`,
   reemplazar `fechaVencimiento: dto.fechaVencimiento ?? null` por `fechaResolucion: null`.
2. En TODOS los spec files listados: renombrar `fechaVencimiento: null` → `fechaResolucion: null`
   en todos los objetos fixture de tipo `TicketProps` / `TicketEntity`.
3. En `ticket.entity.spec.ts`: actualizar los tests de `updateDatos({ fechaVencimiento: ... })`
   → eliminarlos (el campo ya no existe en `ActualizarDatosTicket`).

---

### T2.5 — [GREEN] Capa de infraestructura — `ticket.mapper.ts` + integration spec

- **Archivos**:
  - `backend/src/tickets/infrastructure/persistence/prisma/ticket.mapper.ts`
  - `backend/src/tickets/infrastructure/persistence/prisma/prisma-tickets.integration.spec.ts`

**Acción**:
1. `toDomain`: `fechaVencimiento: row.fechaVencimiento ?? null` → `fechaResolucion: row.fechaResolucion ?? null`.
2. `toPersistence`: `fechaVencimiento: entity.fechaVencimiento` → `fechaResolucion: entity.fechaResolucion`.
3. Integration spec: renombrar fixtures y assertions que referencien `fechaVencimiento`.

---

### T2.6 — [GREEN] Capa de interfaz tickets — DTOs + controller + sus specs

- **Archivos**:
  - `backend/src/tickets/interface/dtos/tickets.dto.ts`
  - `backend/src/tickets/interface/controllers/tickets.controller.ts`
  - `backend/src/tickets/interface/controllers/tickets.controller.spec.ts`

**Acción**:
1. `CreateTicketHttpDto`: **ELIMINAR** `fechaVencimiento` (no es `fechaResolucion` — eso va en PR3).
2. `UpdateTicketHttpDto`: **ELIMINAR** `fechaVencimiento`.
3. `TicketResponseDto`: `fechaVencimiento: string | null` → `fechaResolucion: string | null`.
4. `toTicketResponse()`: `fechaVencimiento: ticket.fechaVencimiento?.toISOString() ?? null`
   → `fechaResolucion: ticket.fechaResolucion?.toISOString() ?? null`.
5. `controller.ts` handler `crearTicket`: eliminar `fechaVencimiento: dto.fechaVencimiento ? ...`.
6. `controller.ts` handler `editarTicket`: eliminar el bloque de conversión `fechaVencimiento` (L329–342).
7. `tickets.controller.spec.ts`: renombrar todas las ocurrencias.

---

### T2.7 — [GREEN] Otros módulos — compras, equipos, reparaciones

- **Archivos**:
  - `backend/src/compras/interface/dtos/compras.dto.ts`
  - `backend/src/compras/interface/controllers/compras.controller.ts`
  - `backend/src/compras/application/use-cases/crear-ticket-compra.use-case.ts`
  - `backend/src/compras/interface/controllers/compras.controller.spec.ts`
  - `backend/src/compras/application/use-cases/{listar,rechazar,enviar,aprobar,crear}-*.use-case.spec.ts`
  - `backend/src/equipos/interface/dtos/equipos.dto.ts`
  - `backend/src/equipos/interface/controllers/ticket-soporte.controller.ts`
  - `backend/src/equipos/application/use-cases/crear-ticket-soporte.use-case.ts`
  - `backend/src/equipos/interface/controllers/ticket-soporte.controller.spec.ts`
  - `backend/src/equipos/application/use-cases/crear-ticket-soporte.use-case.spec.ts`
  - `backend/src/reparaciones/interface/dtos/reparaciones.dto.ts`
  - `backend/src/reparaciones/interface/controllers/tickets-edilicio.controller.ts`
  - `backend/src/reparaciones/application/use-cases/crear-ticket-edilicio.use-case.ts`
  - `backend/src/reparaciones/interface/controllers/tickets-edilicio.controller.spec.ts`
  - `backend/src/reparaciones/application/use-cases/{listar,crear}-*.use-case.spec.ts`
  - `backend/src/clientes/interface/smoke.e2e.spec.ts`

**Acción**: rename literal `fechaVencimiento` → `fechaResolucion` en implementaciones e fixtures.
Los DTOs HTTP de estos módulos también renombran el campo (el backend acepta `fechaResolucion`
en el JSON de alta de compras/soporte/edilicia a partir de este PR).

---

### T2.8 — [GREEN] Frontend rename (path de LECTURA solamente)

- **Archivos**:
  - `frontend/src/features/tickets/types.ts`
  - `frontend/src/features/tickets/hooks/use-ticket-form.ts`
  - `frontend/src/features/tickets/hooks/use-update-ticket.test.ts`
  - `frontend/src/features/tickets/hooks/use-create-ticket.test.ts`
  - `frontend/src/features/tickets/components/TicketsPage.test.tsx`
  - `frontend/src/features/tickets/components/TicketFormModal.test.tsx`
  - `frontend/src/features/tickets/components/TicketsList.test.tsx`

**Acción**:
1. `types.ts`: `fechaVencimiento: string | null` → `fechaResolucion: string | null` en tipo `Ticket`.
2. `use-ticket-form.ts` L60 (`mapTicketToForm`): `fechaVencimiento: t.fechaVencimiento ?? undefined`
   → `fechaResolucion: t.fechaResolucion ?? undefined` (read del Ticket existente; el campo
   del form `TicketFormValues.fechaVencimiento` se elimina recién en PR5).
   Nota: este es un "rename intermedio" del mapeador. PR5 lo elimina completamente.
3. Fixtures en test files: renombrar `fechaVencimiento: null/string` → `fechaResolucion: null/string`
   en todos los objetos de tipo `Ticket` (los que usan la interfaz de `types.ts`).
   NO tocar `schemas.test.ts` (los tests del schema usan `fechaVencimiento` del schema Zod,
   que cambia recién en PR5).

---

### T2.9 — [VERIFY] TypeScript compile limpio

- **Archivos**: build completo

**Acción**: `cd backend && npx tsc --noEmit` + `cd frontend && npx tsc --noEmit`.
Cero ocurrencias de `fechaVencimiento` fuera de `openspec/`, archivos de archivo y comentarios.

**Criterio de done**: build verde. Todos los tests existentes pasan.

---

## PR3 — Flujo técnico: `fechaResolucion` OBLIGATORIA en RESUELTO + limpieza en reapertura + alta acepta `fechaCreacion`

> **Spec refs**: "fechaResolucion seteada por técnico al transicionar a RESUELTO", "POST /tickets acepta fechaCreacion"  
> **ADRs**: ADR-4, ADR-5  
> **Estimación**: ~300 líneas | **Risk**: MEDIO (lógica de dominio nueva, invariantes de transición)

---

### T3.1 — [RED] `ticket.entity.spec.ts` — `setFechaResolucion` + `create` con `fechaCreacion`

- **Archivos**: `backend/src/tickets/domain/entities/ticket.entity.spec.ts`
- **Spec**: "setFechaResolucion(Date | null)", "create acepta fechaCreacion override de _createdAt"
- **Paralelo con**: T3.3

**RED — qué asertar**:
1. `ticket.setFechaResolucion(new Date('2026-06-28'))` → `ticket.fechaResolucion` es ese Date.
2. `ticket.setFechaResolucion(null)` → `ticket.fechaResolucion` es `null`.
3. `setFechaResolucion` llama `this.touch()` → `ticket.updatedAt` se actualiza.
4. `TicketEntity.create(props, id, fechaCreacion)` con `fechaCreacion = new Date('2025-06-15')`
   → `ticket.createdAt.toISOString()` contiene `'2025-06-15'`.
5. `TicketEntity.create(props)` sin `fechaCreacion` → `ticket.createdAt` ≈ `new Date()` (margen 5s).
6. `TicketEntity.create(props, id, new Date('2030-12-31'))` (fecha futura) → acepta sin error.

---

### T3.2 — [GREEN] Domain: `TicketEntity.setFechaResolucion` + `create` con `fechaCreacion` override

- **Archivos**: `backend/src/tickets/domain/entities/ticket.entity.ts`
- **Dep**: T3.1 en RED

**Acción** (ver ADR-4 y ADR-5):
```ts
// Nuevo método mutador
setFechaResolucion(fecha: Date | null): void {
  this.props.fechaResolucion = fecha;
  this.touch();
}

// Factory method extendido (mismo patrón que reconstitute())
static create(props: TicketProps, id?: string, fechaCreacion?: Date): TicketEntity {
  const entity = new TicketEntity(props, id);
  if (fechaCreacion) (entity as any)._createdAt = fechaCreacion;
  return entity;
}
```

**Criterio de done**: T3.1 pasa a GREEN.

---

### T3.3 — `FechaResolucionRequeridaError` [ERROR CLASS]

- **Archivos**: `backend/src/tickets/domain/errors/tickets.errors.ts`
- **Paralelo con**: T3.1, T3.2

**Acción**: agregar al final del archivo:
```ts
export class FechaResolucionRequeridaError extends DomainError {
  readonly code = 'FECHA_RESOLUCION_REQUERIDA';
  constructor() {
    super('fechaResolucion es requerida para transicionar a estado RESUELTO.');
  }
}
```

---

### T3.4 — [RED] `transicionar-estado.use-case.spec.ts` — 4 escenarios de `fechaResolucion`

- **Archivos**: `backend/src/tickets/application/use-cases/transicionar-estado.use-case.spec.ts`
- **Spec**: "Transición a RESUELTO sin fechaResolucion → 422", "Reapertura desde RESUELTO limpia fechaResolucion"
- **ADR**: ADR-4
- **Dep**: T3.2, T3.3

**RED — qué asertar**:
1. Destino `RESUELTO` SIN `fechaResolucion` en DTO → `Result.fail(FechaResolucionRequeridaError)`.
   El ticket NO debe haber sido mutado. `ticketRepo.save` NO debe haber sido llamado.
2. Destino `RESUELTO` CON `fechaResolucion: new Date('2026-06-28')` → `Result.ok()`.
   `ticket.setFechaResolucion` llamado con ese Date. `ticketRepo.save` y `operacionRepo.save` llamados.
3. Destino `EN_PROGRESO` y `estadoActual.codigo === 'RESUELTO'` (reapertura) →
   `ticket.setFechaResolucion(null)` llamado. `Result.ok()`.
4. Destino `EN_PROGRESO` y `estadoActual.codigo !== 'RESUELTO'` (transición normal) →
   `ticket.setFechaResolucion` NO llamado. Comportamiento inalterado.

---

### T3.5 — [GREEN] `TransicionarEstadoUseCase` — guard + set/clear

- **Archivos**: `backend/src/tickets/application/use-cases/transicionar-estado.use-case.ts`
- **Dep**: T3.4 en RED

**Acción** (ver ADR-4 para pseudocódigo exacto):
1. Extender `TransicionarEstadoDto` con `fechaResolucion?: Date`.
2. Después del paso 5 (puedeTransicionar) y ANTES de `ticket.updateEstado`:
   ```ts
   if (estadoNuevo.codigo === 'RESUELTO' && !dto.fechaResolucion) {
     return Result.fail(new FechaResolucionRequeridaError());
   }
   ticket.updateEstado(estadoNuevo.id);
   if (estadoNuevo.codigo === 'RESUELTO') {
     ticket.setFechaResolucion(dto.fechaResolucion!);
   } else if (estadoActual.codigo === 'RESUELTO') {
     ticket.setFechaResolucion(null);  // reapertura: limpia
   }
   ```
3. La transacción (`txRunner.run`) ya incluye `ticketRepo.save(ticket)` → la fecha se persiste
   automáticamente (sin cambios en el runner).

**Criterio de done**: T3.4 pasa a GREEN.

---

### T3.6 — [RED] `crear-ticket.use-case.spec.ts` — `fechaCreacion` en DTO

- **Archivos**: `backend/src/tickets/application/use-cases/crear-ticket.use-case.spec.ts`
- **Spec**: "POST /tickets acepta fechaCreacion explícita", "permite fechas futuras"
- **ADR**: ADR-5

**RED — qué asertar**:
1. DTO con `fechaCreacion: new Date('2025-06-15')` → entidad resultante `createdAt` es esa fecha.
2. DTO con `fechaCreacion: new Date('2030-12-31')` (futura) → se acepta sin error.
3. DTO SIN `fechaCreacion` → `ticket.createdAt` ≈ `new Date()` (margen 5s).

---

### T3.7 — [GREEN] `CrearTicketUseCase` — acepta `fechaCreacion`

- **Archivos**: `backend/src/tickets/application/use-cases/crear-ticket.use-case.ts`
- **Dep**: T3.6 en RED

**Acción**:
1. `CrearTicketDto` gana `fechaCreacion?: Date`.
2. `TicketEntity.create(props, undefined, dto.fechaCreacion)`.

---

### T3.8 — [GREEN] Infra: `TicketMapper.toPersistence` incluye `createdAt` + `PrismaTicketRepository.save` lo excluye del update

- **Archivos**:
  - `backend/src/tickets/infrastructure/persistence/prisma/ticket.mapper.ts`
  - `backend/src/tickets/infrastructure/persistence/prisma/prisma-ticket.repository.ts`
- **Spec**: "tickets.created_at MUST aceptar un valor explícito provisto por el use case"
- **ADR**: ADR-5

**Acción**:
1. `TicketMapper.toPersistence`: cambiar el tipo de retorno a `Omit<PrismaTicket, 'updatedAt'>` e
   incluir `createdAt: entity.createdAt`. (Actualmente excluye tanto `createdAt` como `updatedAt`.)
2. `PrismaTicketRepository.save(ticket)`:
   ```ts
   const data = TicketMapper.toPersistence(ticket);
   const { id, createdAt, ...updateData } = data;  // createdAt NO va en update
   await this.client.ticket.upsert({
     where: { id },
     create: data,          // incluye createdAt explícito
     update: updateData,    // NO pisa createdAt en updates
   });
   ```
   Nota: Prisma permite pasar `createdAt` explícito en create aunque tenga `@default(now())`.

---

### T3.9 — [RED] `tickets.controller.spec.ts` — `PATCH /:id/estado` + `POST /tickets` con fechas

- **Archivos**: `backend/src/tickets/interface/controllers/tickets.controller.spec.ts`
- **Spec**: "PATCH estado requiere fechaResolucion para RESUELTO", "POST acepta fechaCreacion"
- **Dep**: T3.2–T3.8

**RED — qué asertar**:

*PATCH /tickets/:id/estado*:
1. Body `{ nuevoEstadoCodigo: 'RESUELTO', fechaResolucion: '2026-06-28' }` → use case recibe `fechaResolucion: Date`.
2. Body `{ nuevoEstadoCodigo: 'RESUELTO' }` sin `fechaResolucion` → `422` (validación en controller).
3. Body `{ nuevoEstadoCodigo: 'RESUELTO', fechaResolucion: 'no-es-fecha' }` → `422`.
4. `FechaResolucionRequeridaError` del use case → mapeado a `422`.
5. Body `{ nuevoEstadoCodigo: 'EN_PROGRESO', fechaResolucion: '2026-06-28' }` → `fechaResolucion` ignorada.

*POST /tickets*:
6. Body con `fechaCreacion: '2026-06-15'` → use case recibe `fechaCreacion: Date('2026-06-15')`.
7. Body con `fechaCreacion: 'no-es-fecha'` → `422`.
8. Body sin `fechaCreacion` → use case recibe `fechaCreacion: undefined`.

---

### T3.10 — [GREEN] `tickets.dto.ts` + `TicketsController` handlers para fechas

- **Archivos**:
  - `backend/src/tickets/interface/dtos/tickets.dto.ts`
  - `backend/src/tickets/interface/controllers/tickets.controller.ts`
- **Dep**: T3.9 en RED

**Acción**:
1. `TransicionarEstadoHttpDto` gana `fechaResolucion?: string` (ISO 'YYYY-MM-DD').
2. `CreateTicketHttpDto` gana `fechaCreacion?: string` (ISO 'YYYY-MM-DD').
3. Handler `transicionarEstado`: parsear y validar `fechaResolucion` (requerida si destino RESUELTO;
   formato ISO; inválida → 422); pasar `Date | undefined` al DTO.
4. Handler `crearTicket`: parsear `fechaCreacion` (formato ISO, inválido → 422); pasar `Date | undefined`.
5. Mapear `FechaResolucionRequeridaError` → `UnprocessableEntityException`.

---

### T3.11 — [RED+GREEN] Integration spec — `createdAt` override + `fechaResolucion` en DB

- **Archivos**: `backend/src/tickets/infrastructure/persistence/prisma/prisma-tickets.integration.spec.ts`
- **Spec**: "tickets.created_at MUST reflejar fechaCreacion", "tickets.fecha_resolucion seteada en RESUELTO, NULL en reapertura"
- **ADR**: ADR-4, ADR-5

**Acción** (RED primero, luego GREEN con la impl de T3.7/T3.8):
1. Test: crear ticket con `fechaCreacion: new Date('2025-06-15')` → `row.createdAt` = esa fecha en DB.
2. Test: transición a RESUELTO con `fechaResolucion: Date('2026-06-28')` → `row.fechaResolucion` = esa fecha.
3. Test: reapertura (RESUELTO → EN_PROGRESO) → `row.fechaResolucion = null`.

---

## PR4 — Frontend: filtros + ciclo activo + popup "sin ciclo"

> **Spec refs**: "useTickets acepta filtros", "useCicloActivo", "Panel de filtros", "Aviso cuando no hay ciclo activo"  
> **ADRs**: ADR-7, ADR-8  
> **Estimación**: ~403 líneas | **Risk**: ALTO (borderline en presupuesto)
>
> ⚠️ **Si el diff supera 400 líneas, cortar en PR4a → PR4b automáticamente (auto-chain):**
> - **PR4a**: T4.1–T4.4 (infra: query-keys + hooks) ~150 líneas
> - **PR4b**: T4.5–T4.11 (UI: FiltrosBar + TicketsPage) ~253 líneas

---

### T4.1 — Tipos `TicketFiltros` + `CicloActivo` en `types.ts`

- **Archivos**: `frontend/src/features/tickets/types.ts`
- **Paralelo con**: T4.2 en adelante

**Acción**:
```ts
export type TicketFiltros = {
  tiposIds?: string[];
  fechaDesde?: string;  // 'YYYY-MM-DD'
  fechaHasta?: string;  // 'YYYY-MM-DD'
};

export type CicloActivo = {
  id: string;
  nombre: string;
  fechaInicio: string;  // 'YYYY-MM-DD'
  fechaFin: string;     // 'YYYY-MM-DD'
  activo: boolean;
};
```

---

### T4.2 — `query-keys.ts` — agregar `list(filtros)` y `cicloActivo`

- **Archivos**: `frontend/src/shared/api/query-keys.ts`
- **ADR**: ADR-7

**Acción**:
```ts
tickets: {
  all: ["tickets"] as const,                                           // raíz para invalidación
  list: (filtros: TicketFiltros) => ["tickets", "list", filtros] as const,
  cicloActivo: ["tickets", "ciclo-activo"] as const,
  detail: (id: string) => ["tickets", id] as const,
},
```
`all` permanece `["tickets"]` — prefijo de toda `list(...)` → las mutaciones existentes
con `invalidateQueries({ queryKey: queryKeys.tickets.all })` invalidan TODAS las listas filtradas.

---

### T4.3 — [RED] `use-tickets.test.ts` (CREAR)

- **Archivos**: `frontend/src/features/tickets/hooks/use-tickets.test.ts` (NUEVO)
- **Spec**: "useTickets pasa filtros como query params", "Cambio de filtros produce query key distinta"
- **ADR**: ADR-7

**RED — qué asertar**:
1. `useTickets({ tiposIds: ['<uuid>'], fechaDesde: '2026-01-01', fechaHasta: '2026-06-30' })`
   → `apiFetch` llamado con URL que incluye esos params.
2. `useTickets({})` → `apiFetch` llamado con URL `'tickets'` sin params.
3. Filtros A vs filtros B → `queryKey` distintos (ref T4.2).
4. `useTickets(filtros, false)` → `apiFetch` NO llamado (`enabled: false`).

---

### T4.4 — [GREEN] Reescribir `use-tickets.ts`

- **Archivos**: `frontend/src/features/tickets/hooks/use-tickets.ts`
- **Dep**: T4.3 en RED

**Acción**:
```ts
function toQueryString(filtros: TicketFiltros): string {
  const params = new URLSearchParams();
  filtros.tiposIds?.forEach(id => params.append('tiposIds[]', id));
  if (filtros.fechaDesde) params.set('fechaDesde', filtros.fechaDesde);
  if (filtros.fechaHasta) params.set('fechaHasta', filtros.fechaHasta);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useTickets(filtros: TicketFiltros = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.tickets.list(filtros),
    queryFn: () => apiFetch<Ticket[]>(`tickets${toQueryString(filtros)}`),
    enabled,
  });
}
```
Nota ADR-7: el objeto `filtros` debe ser estable (no crear un objeto nuevo en cada render
en el container — usar `useState` o `useMemo`).

---

### T4.5 — [AUDIT] Verificar `invalidateQueries` apunta a raíz `queryKeys.tickets.all`

- **Archivos**:
  - `frontend/src/features/tickets/hooks/use-ticket-form.ts` (L127)
  - `frontend/src/features/tickets/hooks/use-delete-ticket.ts`
  - `frontend/src/features/tickets/hooks/use-update-ticket.ts`
- **ADR**: ADR-7

**Acción**: verificar que todos los `invalidateQueries` usan `{ queryKey: queryKeys.tickets.all }`
(la raíz `["tickets"]`, NO una key con filtros). Si alguno usa `queryKeys.tickets.list(...)`,
corregirlo a `.all`. Tests existentes de esos hooks validan el comportamiento; si falla alguno,
ajustar el test también.

---

### T4.6 — [RED] `use-ciclo-activo.test.ts` (CREAR)

- **Archivos**: `frontend/src/features/tickets/hooks/use-ciclo-activo.test.ts` (NUEVO)
- **Spec**: "useCicloActivo devuelve null cuando no hay ciclo activo (HTTP 404)"
- **ADR**: ADR-8

**RED — qué asertar** (MSW para interceptar):
1. Backend responde 200 con ciclo → `data = { id, nombre, fechaInicio, fechaFin, activo: true }`, `error = null`.
2. Backend responde 404 → `data = null`, `error = null` (tratado como estado válido, no como error).
3. Backend responde 500 → `error` es instancia de `ApiError` con `statusCode = 500`.

---

### T4.7 — [GREEN] `use-ciclo-activo.ts` (CREAR)

- **Archivos**: `frontend/src/features/tickets/hooks/use-ciclo-activo.ts` (NUEVO)
- **Dep**: T4.6 en RED

**Acción**:
```ts
export function useCicloActivo() {
  return useQuery<CicloActivo | null, ApiError>({
    queryKey: queryKeys.tickets.cicloActivo,
    queryFn: async () => {
      try {
        return await apiFetch<CicloActivo>('tickets/ciclo-activo');
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 404) return null;
        throw err;
      }
    },
  });
}
```

---

### T4.8 — [RED] `FiltrosBar.test.tsx` (CREAR)

- **Archivos**: `frontend/src/features/tickets/components/FiltrosBar.test.tsx` (NUEVO)
- **Spec**: "Panel de filtros renderiza con los 3 tipos", "Skeleton en inputs de fecha durante carga del ciclo activo"
- **ADR**: ADR-7, ADR-8

**RED — qué asertar**:
1. Renderiza exactamente 3 controles de tipo (SOPORTE, COMPRAS, EDILICIA).
2. `isLoadingCiclo = true` → inputs de fecha muestran skeleton (no son interactivos).
3. `isLoadingCiclo = false` → inputs de fecha son interactivos.
4. Controles de tipo son interactivos independientemente del estado de carga del ciclo.
5. Click en un tipo → `onChange` llamado con filtros actualizados (tipo desseleccionado).
6. `ciclo = { fechaInicio: '2026-01-01', fechaFin: '2026-12-31' }` y `isLoadingCiclo = false`
   → input fechaDesde tiene valor `'2026-01-01'`, fechaHasta `'2026-12-31'`.
7. `ciclo = null` → inputs de fecha sin valor por defecto.

---

### T4.9 — [GREEN] `FiltrosBar.tsx` (CREAR) — componente presentacional

- **Archivos**: `frontend/src/features/tickets/components/FiltrosBar.tsx` (NUEVO)
- **Dep**: T4.8 en RED

**Contrato de props**:
```ts
interface FiltrosBarProps {
  filtros: TicketFiltros;
  onChange: (f: TicketFiltros) => void;
  ciclo: CicloActivo | null;
  isLoadingCiclo: boolean;
  tiposDisponibles: Array<{ id: string; nombre: string }>;
}
```
Container le pasa `tiposDisponibles = Object.entries(TIPOS).map(([id, nombre]) => ({ id, nombre }))`.

Diseño: glassmorphism dual (CONSTITUTION §3), inputs `rounded-xl`, skeleton tenue durante carga
del ciclo (solo los date inputs; los checkboxes de tipo no esperan el ciclo).

---

### T4.10 — [RED] `TicketsPage.test.tsx` (actualizar)

- **Archivos**: `frontend/src/features/tickets/components/TicketsPage.test.tsx`
- **Spec**: "Sin ciclo activo — lista vacía con aviso y sin fetch", "Ciclo activo cargando — skeleton"
- **ADR**: ADR-8

**RED — qué asertar** (mockear `useCicloActivo` + `useTickets`):
1. `useCicloActivo` retorna `{ data: null, isLoading: false }` → elemento con `role="alert"` visible;
   `useTickets` NOT llamado con `enabled: true` (o no disparó fetch).
2. `useCicloActivo` retorna `{ data: ciclo, isLoading: false }` → aviso NO está en el DOM;
   `FilterPanel`/`FiltrosBar` renderiza con `fechaDesde = ciclo.fechaInicio`.
3. `useCicloActivo` retorna `{ isLoading: true }` → skeleton global; aviso NO visible.
4. Estado `filtros` en el container: cambiar tipo en `FiltrosBar` → `useTickets` recibe filtros actualizados.

---

### T4.11 — [GREEN] `app/(dashboard)/tickets/page.tsx` — container reescrito

- **Archivos**: `frontend/src/app/(dashboard)/tickets/page.tsx`
- **Dep**: T4.10 en RED

**Responsabilidades del container** (ADR-7, ADR-8):
1. `const { data: ciclo, isLoading: loadingCiclo } = useCicloActivo()`.
2. `const [filtros, setFiltros] = useState<TicketFiltros>(() => ciclo ? { fechaDesde: ciclo.fechaInicio, fechaHasta: ciclo.fechaFin } : {})`.
   Nota: inicializar con `useEffect` cuando `ciclo` cambia de undefined a valor real
   (primer load), para evitar state race.
3. `const { data, isLoading: loadingTickets } = useTickets(filtros, !!ciclo && !loadingCiclo)`.
4. Si `loadingCiclo` → renderizar skeleton completo (FilterPanel + lista en skeleton).
5. Si `ciclo === null` → renderizar `FiltrosBar` deshabilitado + banner `role="alert"` con mensaje;
   lista vacía; `useTickets` deshabilitado.
6. Si `ciclo` presente → renderizar `FiltrosBar` + `TicketsList` con datos.
7. `TicketFormModal` recibe `defaultTipoId` en PR5 — en este PR se pasa vacío (string "").

---

## PR5 — Frontend: form mejoras (tipo pre-carga + `fechaCreacion` + quita campo de resolución)

> **Spec refs**: "Pre-población de tipoId", "fechaCreacion editable", "Campo fechaResolucion eliminado de los formularios"  
> **ADRs**: ADR-9  
> **Estimación**: ~135 líneas | **Risk**: BAJO (tocar form schema es el punto más frágil → TDD primero)

---

### T5.1 — [RED] `schemas.test.ts` — nuevo contrato de `CreateTicketSchema` + `UpdateTicketSchema`

- **Archivos**: `frontend/src/features/tickets/schemas.test.ts`
- **Spec**: "CreateTicketSchema acepta fechaCreacion con formato válido", "no tiene campos fechaVencimiento ni fechaResolucion"
- **ADR**: ADR-9

**RED — qué asertar**:
1. `CreateTicketSchema` con `fechaCreacion: '2026-01-15'` → `success: true`.
2. `CreateTicketSchema` con `fechaCreacion: 'no-es-fecha'` → `success: false`, error en campo `fechaCreacion`.
3. `CreateTicketSchema` sin `fechaCreacion` → `success: true`, `result.data.fechaCreacion === undefined`.
4. `CreateTicketSchema` NO contiene keys `fechaVencimiento` ni `fechaResolucion`.
5. `UpdateTicketSchema` NO contiene keys `fechaVencimiento` ni `fechaResolucion`.

---

### T5.2 — [GREEN] `schemas.ts` — actualizar schemas + `TicketFormValues`

- **Archivos**: `frontend/src/features/tickets/schemas.ts`
- **Dep**: T5.1 en RED

**Acción**:
1. `CreateTicketSchema`: quitar `fechaVencimiento`; agregar
   `fechaCreacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido (YYYY-MM-DD)').optional()`.
   Sin `.refine("no futura")` — permite fechas futuras (ADR-5).
2. `UpdateTicketSchema`: quitar `fechaVencimiento`.
3. `TicketFormValues`: quitar `fechaVencimiento?: string | null`; agregar `fechaCreacion?: string`.

---

### T5.3 — [RED] `use-ticket-form.ts` tests — `defaultTipoId` + `fechaCreacion` + sin `fechaVencimiento`

- **Archivos**: `frontend/src/features/tickets/hooks/use-ticket-form.test.ts` (CREAR o actualizar)
- **Spec**: "un solo tipo activo en filtros → tipoId pre-poblado", "formulario muestra fechaCreacion con default hoy"
- **ADR**: ADR-9

**RED — qué asertar**:
1. `mapTicketToForm(ticket)` NO incluye `fechaVencimiento` ni `fechaResolucion` en el resultado.
2. Create mode con `defaultTipoId: '<uuid-soporte>'` → `form.getValues('tipoId') === '<uuid-soporte>'`.
3. Create mode sin `defaultTipoId` o con `""` → `form.getValues('tipoId') === ''`.
4. Create mode → `form.getValues('fechaCreacion') === <hoy en 'YYYY-MM-DD'>`.
5. Submit de create → body enviado incluye `fechaCreacion` (la fecha del form).

---

### T5.4 — [GREEN] `use-ticket-form.ts` — `defaultTipoId` + `fechaCreacion` + quitar `fechaVencimiento`

- **Archivos**: `frontend/src/features/tickets/hooks/use-ticket-form.ts`
- **Dep**: T5.3 en RED

**Acción**:
1. Extender `UseTicketFormOpts` con `defaultTipoId?: string`.
2. `mapTicketToForm`: quitar `fechaVencimiento`; limpiar campo `fechaResolucion` también (no es un form field).
3. `defaultValues` para create mode:
   ```ts
   {
     titulo: "",
     descripcion: undefined,
     tipoId: opts.defaultTipoId ?? "",
     prioridadId: "",
     cicloId: undefined,
     fechaCreacion: new Date().toISOString().slice(0, 10),
   }
   ```
4. Gotcha (ADR-5): `<input type="date">` envía `'YYYY-MM-DD'`; `new Date('2026-06-28')` = medianoche UTC.
   Es aceptable para este caso (fecha sin hora). Documentar en JSDoc.

---

### T5.5 — [RED] `TicketFormModal.test.tsx` — form sin campo de resolución + con `fechaCreacion` + `defaultTipoId`

- **Archivos**: `frontend/src/features/tickets/components/TicketFormModal.test.tsx`
- **Spec**: "Formulario de alta no incluye campo de resolución", "Formulario muestra fechaCreacion"
- **ADR**: ADR-9

**RED — qué asertar**:
1. DOM NO tiene input con `name="fechaVencimiento"` ni `name="fechaResolucion"`.
2. DOM TIENE input con `name="fechaCreacion"` (o `id="fechaCreacion"`).
3. `fechaCreacion` input tiene valor = fecha de hoy.
4. Con `defaultTipoId='<uuid-soporte>'` → select de tipo tiene ese valor seleccionado.
5. Sin `defaultTipoId` → select de tipo arranca sin selección.
6. Submit envía body con `fechaCreacion` y sin `fechaVencimiento`/`fechaResolucion`.

---

### T5.6 — [GREEN] `TicketFormModal.tsx` — quitar `fechaVencimiento`, agregar `fechaCreacion`, `defaultTipoId` prop

- **Archivos**: `frontend/src/features/tickets/components/TicketFormModal.tsx`
- **Dep**: T5.5 en RED

**Acción**:
1. Eliminar el `FormField` completo de "Fecha de vencimiento" (L172–183 aprox.).
2. Agregar `FormField` para `fechaCreacion`:
   ```tsx
   <FormField
     htmlFor="fechaCreacion"
     label="Fecha de creación"
     error={errors.fechaCreacion?.message}
   >
     <input id="fechaCreacion" type="date" {...register("fechaCreacion")} />
   </FormField>
   ```
3. Agregar `defaultTipoId?: string` a las props del componente; pasarlo a `useTicketForm`.
4. El select de `tipoId` ya usa `register("tipoId")` con `defaultValues` — el pre-llenado
   viene de `defaultValues.tipoId = defaultTipoId` (en `useTicketForm`).

---

### T5.7 — [GREEN] `app/(dashboard)/tickets/page.tsx` — `defaultTipoId` + pasar a `TicketFormModal`

- **Archivos**: `frontend/src/app/(dashboard)/tickets/page.tsx`
- **Spec**: "Pre-población de tipoId: exactamente 1 tipo seleccionado"
- **ADR**: ADR-9

**Acción**:
1. Agregar cómputo:
   ```ts
   const defaultTipoId =
     filtros.tiposIds?.length === 1 ? filtros.tiposIds[0] : "";
   ```
2. Pasar `defaultTipoId` a `<TicketFormModal mode="create" ...>`.
   (En modo "edit", `mapTicketToForm` toma precedencia — el prop puede pasarse igualmente sin efecto.)

**Criterio de done**: T5.5 pasa a GREEN. Build limpio. Ningún spec menciona `fechaVencimiento`.

---

## Review Workload Forecast

| PR | Archivos tocados (aprox.) | Líneas diff (est.) | Budget risk | Decision needed |
|----|--------------------------|---------------------|-------------|-----------------|
| PR1 | 8 impl + 3 spec | ~300 | BAJO | No |
| PR2 | 18 impl + 28 spec/fixtures | ~160 | BAJO | No — PR2a/PR2b NO necesario |
| PR3 | 8 impl + 5 spec | ~300 | BAJO | No |
| PR4 | 7 impl + 4 spec | ~403 | **ALTO** | **Sí** — ver corte PR4a/PR4b |
| PR5 | 5 impl + 3 spec | ~135 | BAJO | No |

**Chained PRs recommended**: Sí (ya definido en el slicing PR1→PR5).

**PR4 — decisión sobre corte**:
Con `delivery: auto-chain`, el executor puede partir PR4 en:
- **PR4a** (T4.1–T4.5): infra/hooks (~150 líneas)
- **PR4b** (T4.6–T4.11): UI/componentes (~253 líneas)
Si el diff real de PR4a+PR4b combinado supera 400 líneas → PR4a y PR4b como PRs independientes encadenados.

**PR2 — riesgo operativo especial**: aunque las líneas son pocas, este PR toca 46 archivos (impl +
fixtures). Risk principal: drift DB↔código. Orden de release: migrar tenants → 0 errores → deploy.

**400-line budget risk por PR**: PR4 ALTO, resto BAJO.
