# Design — tickets-list-filtros-resolucion

> Fase DESIGN (el HOW arquitectónico). Las decisiones de NEGOCIO están cerradas
> (ver engram `sdd/tickets-list-filtros-resolucion/decisions` #1532 y `proposal` #1533).
> Este documento fija arquitectura, contratos de puertos/tipos y plan de migración.
> Las tareas concretas las produce la fase `sdd-tasks`.

## Resumen ejecutivo

Filtros y orden de tickets se resuelven en BACKEND ampliando el puerto
`ITicketRepository.findAll(filtros?)` (los índices `tipoId`/`createdAt` ya existen),
manteniendo el caso de uso de listado PURO y agnóstico del ciclo: el "default = ciclo
activo" y el bloqueo con popup son responsabilidad del FRONTEND, que consume un nuevo
`GET /tickets/ciclo-activo` (reusa `CicloCliente.findActive`, ya wired en
`TicketsModule`). El rename `fechaVencimiento → fechaResolucion` se hace como rename
físico de columna (`ALTER ... RENAME COLUMN`) en una migración Prisma aislada,
propagada a todas las tenant DBs por el runner fan-out existente
(`scripts/migrate-tenants.ts`, `prisma migrate deploy` idempotente). La carga de la
fecha de resolución pasa a `PATCH /tickets/:id/estado`: es OBLIGATORIA al transicionar a
`RESUELTO` (rechaza la transición si falta) y se LIMPIA (null) en la reapertura, todo dentro
de la transacción atómica ya existente. El listado ordena `created_at DESC, NOMBRE de tipo
ASC` (JOIN relacional a `tipos_ticket`). El alta acepta una `fechaCreacion` editable —
permite fechas futuras, sin validación de rango — que override el `@default(now())` vía un
override explícito de `_createdAt` en `TicketEntity.create`. El slicing PR1–PR5 de la propuesta se mantiene,
con PR2 aislando exclusivamente el rename + migración.

---

## Mapa de componentes y flujo de datos

```
FRONTEND (Next.js App Router, Container/Presentational)
  tickets/page.tsx (CONTAINER)
    ├─ use-ciclo-activo ──► GET /tickets/ciclo-activo ─┐
    │     └─ null  → bloquea lista + popup "sin ciclo"  │
    │     └─ ciclo → deriva rango default (fechaDesde/Hasta)
    ├─ estado de filtros: { tiposIds[], fechaDesde, fechaHasta }  (useState en container)
    ├─ use-tickets(filtros) ──► GET /tickets?tiposIds=&fechaDesde=&fechaHasta=
    │     queryKey: queryKeys.tickets.list(filtros)   ← parametrizado (anti-stale)
    └─ TicketsList / FiltrosBar / TicketFormModal (PRESENTATIONAL)

BACKEND (NestJS, Hexagonal)
  TicketsController
    GET  /tickets/ciclo-activo  → ICicloClienteRepository.findActive()      [autenticado]
    GET  /tickets?<filtros>     → ListarTicketsUseCase.execute(filtros)     [autenticado]
    POST /tickets               → CrearTicketUseCase (acepta fechaCreacion) [ticket:crear]
    PATCH /tickets/:id/estado   → TransicionarEstadoUseCase (setea fechaResolucion@RESUELTO)

  ListarTicketsUseCase.execute(filtros?) → ITicketRepository.findAll(filtros?)
    PrismaTicketRepository.findAll(filtros?)  → WHERE deleted_at IS NULL [+ tipoId IN][+ created_at BETWEEN]
                                                JOIN tipos_ticket  ORDER BY created_at DESC, tipos_ticket.nombre ASC
```

Integration points tocados: dominio (`TicketEntity`, puertos), aplicación
(`ListarTicketsUseCase`, `CrearTicketUseCase`, `TransicionarEstadoUseCase`),
infraestructura (`PrismaTicketRepository`, `TicketMapper`, schema + migración),
interfaz (`TicketsController`, `tickets.dto.ts`), frontend (`use-tickets`,
`use-ciclo-activo`, `query-keys`, `schemas`, `types`, `TicketsPage`, `TicketsList`,
`TicketFormModal`, `use-ticket-form`).

---

## ADR-1 — Filtros y orden en el BACKEND vía ampliación del puerto

**Contexto.** `findAll()` hoy es `WHERE deleted_at IS NULL ORDER BY created_at DESC`
sin parámetros. Los índices `@@index([tipoId])` y `@@index([createdAt])` ya existen.

**Decisión.** Ampliar el puerto, manteniendo el filtro OPCIONAL (sin filtros = comportamiento actual):

```ts
// i-ticket.repository.ts
export interface TicketFiltros {
  tiposIds?: string[];     // UUIDs; vacío/undefined = todos
  fechaDesde?: Date;       // inclusive, sobre created_at
  fechaHasta?: Date;       // inclusive (fin de día), sobre created_at
}
findAll(filtros?: TicketFiltros): Promise<TicketEntity[]>;
```

Implementación Prisma (compone `where` dinámico, no SQL crudo):

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
  });
  return rows.map(TicketMapper.toDomain);
}
```

**Orden `created_at DESC, NOMBRE de tipo ASC` (alfabético).** Decisión CERRADA por el
usuario: el desempate secundario es por NOMBRE del tipo, alfabético, NO por `tipoId` (UUID).
`tickets` solo tiene `tipo_id` (FK → `tipos_ticket`), así que ordenar por nombre requiere
resolver la relación.

**Approach concreto en `PrismaTicketRepository.findAll`.** Se usa el order-by RELACIONAL
nativo de Prisma `orderBy: { tipo: { nombre: 'asc' } }`. Prisma genera automáticamente el
JOIN a `tipos_ticket` y emite `ORDER BY tipos_ticket.nombre ASC` — NO se escribe SQL crudo.
La relación `tipo TipoTicket @relation(fields: [tipoId], references: [id])` ya existe en el
modelo `Ticket` (schema L175), por lo que el order-by relacional está disponible sin cambios
de schema. El SQL efectivo resultante es equivalente a:

```sql
SELECT t.* FROM tickets t
JOIN tipos_ticket tt ON tt.id = t.tipo_id
WHERE t.deleted_at IS NULL [AND t.tipo_id IN (...)] [AND t.created_at BETWEEN ... ]
ORDER BY t.created_at DESC, tt.nombre ASC;
```

**Costo.** El JOIN es contra `tipos_ticket`, un catálogo MINÚSCULO (3 filas:
Soporte/Compras/Edilicia) con PK indexada → el planner resuelve un hash/nested-loop join
trivial; el costo es despreciable frente al scan/sort de `tickets`. El filtro y el orden
primario siguen apoyándose en `@@index([createdAt])` y `@@index([tipoId])`; el sort
secundario por `tt.nombre` opera sobre el set ya filtrado. NO se requiere índice adicional
para el volumen esperado. Si en el futuro el volumen fuera masivo, se evaluaría desnormalizar
el nombre del tipo en `tickets` o un índice de cobertura, pero NO es necesario hoy.

**Parsing/validación en el controller.** DTO de query dedicado + coerción explícita en
el controller (el proyecto NO usa class-validator; sigue el patrón de interfaces planas
de `tickets.dto.ts`):

```ts
// tickets.dto.ts
export interface ListarTicketsQueryDto {
  tiposIds?: string | string[];  // ?tiposIds=a&tiposIds=b → array; ?tiposIds=a → string
  fechaDesde?: string;           // 'YYYY-MM-DD'
  fechaHasta?: string;           // 'YYYY-MM-DD'
}
```

```ts
@Get()
async listarTickets(@Query() q: ListarTicketsQueryDto): Promise<TicketResponseDto[]> {
  const filtros: TicketFiltros = {
    tiposIds: q.tiposIds ? (Array.isArray(q.tiposIds) ? q.tiposIds : [q.tiposIds]) : undefined,
    fechaDesde: q.fechaDesde ? startOfDay(new Date(q.fechaDesde)) : undefined,
    fechaHasta: q.fechaHasta ? endOfDay(new Date(q.fechaHasta)) : undefined,
  };
  const result = await this.listarTicketsUseCase.execute(filtros);
  return result.getValue().map(toTicketResponse);
}
```

- Coerción de un único valor a array (NestJS/qs entrega string si viene una sola vez).
- `fechaHasta` se extiende a fin de día (created_at es `Timestamptz`; el filtro es por fecha).
- Fechas inválidas (`isNaN(date)`) → ignorar el filtro o `400` (ver Riesgos; elegimos
  ignorar el filtro inválido para no romper el listado, decisión a confirmar en tasks).
- **Tenant**: SIN cambios. `TenantGuard` ya bindea `TenantContext` antes del repo; el
  repo obtiene el client del tenant activo. Los filtros NO cruzan tenant.

**Alternativas rechazadas.**
- Filtrar en el frontend: viola hexagonal, desperdicia índices, imposibilita paginación futura.
- `findByEstado`-style methods nuevos por combinación: explosión combinatoria; un único
  `findAll(filtros)` compone.

---

## ADR-2 — El "default = ciclo activo" y el bloqueo lo orquesta el FRONTEND; `ListarTicketsUseCase` permanece PURO

**Contexto.** La regla de negocio: por defecto la lista se acota al ciclo activo; si no
hay ciclo activo, la lista NO muestra nada + popup. Hay dos lugares donde implementarlo.

**Decisión.** El backend `ListarTicketsUseCase` NO consulta ciclos. El FRONTEND:
1. Llama `use-ciclo-activo` (GET `/tickets/ciclo-activo`).
2. Si retorna `null` → no llama a `use-tickets` (o la deja deshabilitada), muestra popup
   "No hay un ciclo activo" y un empty/blocked state. Lista vacía.
3. Si retorna ciclo → deriva el rango default `{ fechaDesde: ciclo.fechaInicio,
   fechaHasta: ciclo.fechaFin }` como estado inicial de filtros y lo pasa a `use-tickets`.

**Rationale.** Mantener el caso de uso de listado como un filtro puro respeta SRP/hexagonal:
no acopla el listado al repositorio de ciclos ni esconde comportamiento implícito ("¿por qué
la API no me devuelve todo?"). El "ciclo activo" es una preferencia de presentación + UX
(popup), no una invariante de dominio del listado. El endpoint de ciclo expone el dato; el
container decide la política.

**Alternativa rechazada.** Auto-scoping en el backend (`ListarTicketsUseCase` inyecta
`ICicloClienteRepository`, y sin ciclo retorna `[]`): acopla dos agregados, vuelve el
endpoint mágico/no-predecible para otros consumidores (reportes, exports), y duplica la
señal de "no hay ciclo" (el frontend igual necesita el endpoint para el popup). Se descarta.

**Contrato `GET /tickets/ciclo-activo`** (`200 OK`, body nullable):

```ts
// tickets.dto.ts
export interface CicloActivoResponseDto {
  id: string;
  nombre: string;
  fechaInicio: string;  // ISO 'YYYY-MM-DD'
  fechaFin: string;
}
// Response: CicloActivoResponseDto | null   (200 con null si no hay ciclo activo)
```

```ts
@Get('ciclo-activo')   // ⚠ DEBE declararse ANTES de @Get(':id') (ver ADR-6)
@HttpCode(HttpStatus.OK)
async cicloActivo(): Promise<CicloActivoResponseDto | null> {
  const ciclo = await this.cicloClienteRepo.findActive();
  return ciclo ? toCicloActivoResponse(ciclo) : null;
}
```

`TicketsController` inyecta `@Inject(CICLO_CLIENTE_REPOSITORY) cicloClienteRepo:
ICicloClienteRepository` (el token ya está provisto en `TicketsModule`). Se usa el repo
directo (no se crea use case) porque es una consulta read-only trivial sin lógica; si en
el futuro hay reglas, se promueve a `ObtenerCicloActivoUseCase`.

---

## ADR-3 — Rename `fechaVencimiento → fechaResolucion`: rename físico de columna + migración tenant aislada

**Contexto.** `fecha_vencimiento DateTime? @db.Date` se renombra a `fecha_resolucion`.
Semántica corregida: es la fecha que carga el técnico al resolver, no un SLA. ~20 touch
points en 12 archivos. Multi-tenant: N DBs tenant, cada una con su propia copia del schema.

**Decisión.** Rename FÍSICO de columna (preserva datos existentes), NO drop+add.

Migración Prisma nueva y AISLADA (PR2), aplicada por el runner fan-out existente:

```sql
-- prisma_tenant/migrations/<ts>_rename_fecha_vencimiento_to_resolucion/migration.sql
ALTER TABLE tickets RENAME COLUMN fecha_vencimiento TO fecha_resolucion;
```

- **Idempotencia.** `prisma migrate deploy` (usado por `scripts/migrate-tenants.ts` y
  `MigrateTenantsRunner`) registra cada migración en `_prisma_migrations` por DB y NO la
  re-aplica. El fan-out es non-aborting: un tenant fallido NO aborta los demás y se reporta
  agregado (`TenantMigrationResult[]`). Re-correr el runner reintenta solo los pendientes.
  `ALTER ... RENAME COLUMN` NO es idempotente a nivel SQL crudo (falla si ya se renombró),
  pero el registro de Prisma garantiza ejecución única por DB → idempotencia efectiva.
- **`@db.Date`** se preserva (no hay cambio de tipo). La data histórica sobrevive.

**Orden seguro dominio ↔ DB.** El cliente Prisma se genera del `schema.prisma`; el dominio
mapea vía `TicketMapper` que lee `row.fechaVencimiento` (campo del client generado). Si se
cambia el schema sin migrar la DB, o se migra sin regenerar el client, hay drift. Secuencia
ATÓMICA dentro de PR2 (un solo commit/PR, NO parcial):

1. Editar `schema.prisma`: `fechaVencimiento → fechaResolucion @map("fecha_resolucion")`.
2. Crear la migración SQL de rename.
3. `prisma generate` (client tenant) → regenera tipos `Ticket.fechaResolucion`.
4. Rename en TODO el código en el MISMO PR (dominio → app → infra → interfaz → frontend),
   guiado por el compilador de TS (cada touch point rompe el build hasta renombrarse).
5. Aplicar migración: `prisma migrate deploy` local + `scripts/migrate-tenants.ts` fan-out
   en deploy a todas las tenant DBs activas.

El build de TS es la red de seguridad: tras (3), todos los ~20 sitios fallan a compilar
hasta corregirse. NO se hace un rename "a medias" que deje dominio y DB desincronizados.

**Touch points (rename literal `fechaVencimiento`/`fecha_vencimiento` → `fechaResolucion`/`fecha_resolucion`):**

| # | Archivo | Líneas (aprox.) | Nota |
|---|---------|-----------------|------|
| 1 | `prisma_tenant/schema.prisma` | L170 | `@map("fecha_resolucion")` |
| 2 | migración nueva | — | `RENAME COLUMN` |
| 3 | `domain/entities/ticket.entity.ts` | L20 (`ActualizarDatosTicket`), L56 (prop), L141 (getter), L179 (updateDatos) | rename prop + getter |
| 4 | `application/use-cases/crear-ticket.use-case.ts` | L41 (DTO), L122 (create) | ver ADR-5 |
| 5 | `interface/dtos/tickets.dto.ts` | L28 (Create), L64 (Update), L79 (Response) | ver nota* |
| 6 | `interface/controllers/tickets.controller.ts` | L99 (response map), L156 (create), L330-342 (editar) | |
| 7 | `infrastructure/.../ticket.mapper.ts` | L29 (toDomain), L54 (toPersistence) | |
| 8 | `frontend/features/tickets/types.ts` | L19 | `fechaResolucion` |
| 9 | `frontend/features/tickets/schemas.ts` | L30, L66, L82 | ver ADR-9 (se ELIMINA del form, no solo rename) |
| 10 | `frontend/.../TicketFormModal.tsx` | L172-185 | ver ADR-9 (se QUITA el campo) |
| 11 | `frontend/.../hooks/use-ticket-form.ts` | L60 (mapTicketToForm), L95 (defaultValues) | ver ADR-9 |
| 12 | specs/tests | `*.spec.ts`, `*.test.ts(x)` con la fixture | actualizar fixtures/mocks |

\* **Decisión de contrato sobre los DTOs de write.** Aunque sea un rename, en `CreateTicketHttpDto`
y `UpdateTicketHttpDto` el campo se ELIMINA (ya no se setea en alta ni en edición — ADR-4/ADR-9),
NO se renombra a `fechaResolucion`. En `TicketResponseDto` SÍ se renombra a `fechaResolucion:
string | null` (se lee/expone). En la entidad y mapper SÍ se renombra (es el dato persistido).

**Evitar romper tests.** El rename rompe a compilar todos los `.spec.ts`/`.test.tsx` que
referencian el campo o fixtures con `fechaVencimiento`. Bajo TDD ESTRICTO, el orden es:
(a) actualizar primero los tests al nuevo contrato (RED esperado donde aplique la nueva
lógica de ADR-4), (b) renombrar implementación (GREEN). El rename puro de campo es
mecánico: los tests se actualizan en el mismo PR. La integración
`prisma-tickets.integration.spec.ts` valida el rename físico contra una DB real.

**Alternativa rechazada.** Drop+add (`DROP COLUMN fecha_vencimiento; ADD COLUMN
fecha_resolucion`): PIERDE los datos históricos. Descartado.

---

## ADR-4 — `fechaResolucion` OBLIGATORIA al transicionar a `RESUELTO`; se LIMPIA en la reapertura; todo en la transacción existente

**Contexto.** `TransicionarEstadoUseCase` ya valida la transición vía state machine y
persiste ticket + operación en UNA transacción (`ITenantTransactionRunner`). El grafo de
estados (`base-ticket-state-machine.ts`) define `EN_PROGRESO → RESUELTO` y la reapertura
`RESUELTO → EN_PROGRESO`. El estado `RESUELTO` tiene `codigo = 'RESUELTO'` (seed `c0...006`).

**Decisión.** Extender el DTO de transición y el body HTTP con `fechaResolucion?`. Reglas
de dominio CERRADAS por el usuario:

1. **Obligatoria al RESOLVER.** Si el destino es `RESUELTO` y NO viene `fechaResolucion`, se
   RECHAZA la transición (`Result.fail`, sin mutar el ticket ni crear operación) → HTTP `422`.
   La fecha es parte indivisible de resolver.
2. **Se LIMPIA en la reapertura.** Si el ticket está en `RESUELTO` y transiciona a un estado
   abierto/activo (p.ej. `EN_PROGRESO`), `fechaResolucion` se setea a `null` en la MISMA
   transacción (un ticket reabierto no tiene fecha de resolución vigente).
3. **Ignorada en cualquier otra transición.** Para destinos que no son `RESUELTO` ni
   reaperturas desde `RESUELTO`, `fechaResolucion` no se toca aunque venga en el body.

```ts
// tickets.dto.ts
export interface TransicionarEstadoHttpDto {
  nuevoEstadoCodigo: string;
  fechaResolucion?: string;   // ISO 'YYYY-MM-DD'; OBLIGATORIA si destino === RESUELTO
}
// transicionar-estado.use-case.ts (DTO)
export interface TransicionarEstadoDto {
  ticketId: string;
  nuevoEstadoCodigo: string;
  autorId: string;
  fechaResolucion?: Date;
}
```

Nueva mutación de dominio en `TicketEntity` (mantiene la entidad como dueña del estado):

```ts
setFechaResolucion(fecha: Date | null): void {
  this.props.fechaResolucion = fecha;
  this.touch();
}
```

Nuevo error de dominio `FechaResolucionRequeridaError` (mapea a `422`).

En el use case, tras validar la transición (state machine, paso 6) y ANTES de persistir:

```ts
// Guard: resolver exige fecha
if (estadoNuevo.codigo === 'RESUELTO' && !dto.fechaResolucion) {
  return Result.fail(new FechaResolucionRequeridaError());
}

ticket.updateEstado(estadoNuevo.id);

if (estadoNuevo.codigo === 'RESUELTO') {
  ticket.setFechaResolucion(dto.fechaResolucion!);     // obligatoria (guard arriba)
} else if (estadoActual.codigo === 'RESUELTO') {
  ticket.setFechaResolucion(null);                     // reapertura: limpia
}

await this.txRunner.run(async () => {
  await this.ticketRepo.save(ticket);
  await this.operacionRepo.save(operacion);
});
```

- **Atomicidad**: ya garantizada — el `save` del ticket (con la fecha seteada o limpiada) y
  la operación de timeline van en la MISMA transacción. Sin cambios en el runner.
- **El guard de obligatoriedad corre DESPUÉS de validar la transición** (no se rechaza por
  fecha faltante una transición que de todos modos era inválida): primero la state machine,
  luego el requisito de fecha. El controller mapea `FechaResolucionRequeridaError → 422`.

**Rol/permiso técnico y tenant.** `PATCH /tickets/:id/estado` HOY está sólo `@UseGuards`
de clase (autenticado + tenant), SIN `@RequirePermissions`. La carga de resolución la hace
"el técnico". Opciones: (a) dejar como está (cualquier autenticado del tenant que pueda
transicionar); (b) agregar `@RequirePermissions('ticket:transicionar')` o similar. **No hay
permiso de transición definido hoy.** Decisión de diseño: NO inventar un permiso nuevo en
esta change (fuera de alcance RBAC); la autorización se mantiene como está (autenticado +
tenant + reglas de state machine). Se documenta como riesgo/decisión a validar. El tenant
ya está aislado por `TenantGuard` + `TenantContext`.

**Alternativa rechazada.** Endpoint separado `PATCH /tickets/:id/resolucion`: duplica la
escritura y rompe la atomicidad estado↔fecha (dos llamadas, dos transacciones, ventana
inconsistente). Se descarta — la fecha es un atributo de la transición a RESUELTO.

---

## ADR-5 — El alta acepta `fechaCreacion` editable como override explícito de `created_at`

**Contexto.** `created_at` es un campo de auditoría de `BaseEntity` (`@default(now())`,
`@db.Timestamptz`). `TicketMapper.toPersistence` HOY EXCLUYE `createdAt` (lo maneja Prisma).
El negocio quiere que el alta pueda fijar la fecha de creación (default hoy, editable).

**Decisión.** Permitir override explícito de `_createdAt` en `TicketEntity.create`,
SIN modelar una prop de dominio duplicada (`created_at` sigue siendo la única fuente):

```ts
// ticket.entity.ts
static create(props: TicketProps, id?: string, fechaCreacion?: Date): TicketEntity {
  const entity = new TicketEntity(props, id);
  if (fechaCreacion) (entity as any)._createdAt = fechaCreacion;  // mismo patrón que reconstitute()
  return entity;
}
```

```ts
// crear-ticket.use-case.ts — DTO
export interface CrearTicketDto { /* ... */ fechaCreacion?: Date; }
// ... en el create:
const ticket = TicketEntity.create({ /* props */ }, undefined, dto.fechaCreacion);
```

El mapper debe INCLUIR `createdAt` en el INSERT (no en el UPDATE), porque hoy lo excluye:

```ts
// ticket.mapper.ts — toPersistence incluye createdAt
static toPersistence(entity): Omit<PrismaTicket, 'updatedAt'> {
  return { id, /* ... */ fechaResolucion: entity.fechaResolucion, createdAt: entity.createdAt, deletedAt: entity.deletedAt };
}
// prisma-ticket.repository.ts — upsert: createdAt solo en create
async save(ticket) {
  const data = TicketMapper.toPersistence(ticket);
  const { id, createdAt, ...updateData } = data;   // createdAt NO va en update
  await this.client.ticket.upsert({ where: { id }, create: data, update: updateData });
}
```

Prisma permite pasar `createdAt` explícito aunque tenga `@default(now())` (el default solo
aplica si se omite). En UPDATE se excluye para no pisar la creación.

**Sin validación de fecha futura (decisión CERRADA).** El usuario decidió PERMITIR fechas
futuras: NO se agrega ninguna restricción "no futura" en este ADR. El use case acepta
`dto.fechaCreacion` tal cual (cualquier fecha válida, pasada o futura) y la aplica como
override. NO existe `FechaCreacionInvalidaError` ni guard de rango: si la fecha está bien
formada se persiste sin más. El body `CreateTicketHttpDto` gana `fechaCreacion?: string`
('YYYY-MM-DD'); el controller la convierte a `Date` (igual que hoy con las otras fechas).
La única validación es de FORMATO (fecha parseable), no de rango temporal.

**Gotcha Timestamptz vs Date-only.** El input `<input type="date">` envía `'YYYY-MM-DD'`;
`new Date('2026-06-28')` se interpreta como medianoche UTC. `created_at` es `Timestamptz`,
así que se guarda esa medianoche UTC. Aceptable para el caso (fecha sin hora). Se documenta.

**Alternativa rechazada.** Agregar `fechaCreacion` como prop de dominio en `TicketProps`
mapeada a `created_at`: duplica el campo de auditoría de `BaseEntity`, genera dos fuentes de
verdad (`createdAt` getter vs prop). Se descarta — override del audit field es más limpio.

---

## ADR-6 — Orden de rutas: `GET /tickets/ciclo-activo` ANTES de `GET /tickets/:id`

**Contexto.** NestJS/Express resuelve rutas por orden de declaración. `@Get(':id')` ya
existe (L205) y capturaría `ciclo-activo` como un `:id` si se declara después.

**Decisión.** Declarar `@Get('ciclo-activo')` ANTES de `@Get(':id')` en
`TicketsController`. Es un gotcha real de colisión de rutas estáticas vs param. Se documenta
y se cubre con un test del controller que verifique que `/tickets/ciclo-activo` no cae en
`obtenerTicket`.

---

## ADR-7 — Frontend: estado de filtros en el container + `queryKeys.tickets.list(filtros)` (anti-stale)

**Contexto.** Hoy `useTickets()` usa `queryKey: queryKeys.tickets.all` (`["tickets"]`) sin
parámetros. Si se filtra sin parametrizar la key, TanStack Query sirve cache stale entre
combinaciones de filtros.

**Decisión.**
- **Estado de filtros** vive en `TicketsPage` (CONTAINER) vía `useState<TicketFiltros>`,
  inicializado con el rango del ciclo activo (ADR-2). Container/Presentational: la barra de
  filtros (`FiltrosBar`, presentational) recibe `value` + `onChange`; no fetch-ea.
- **Parametrizar la query key**:

```ts
// query-keys.ts
tickets: {
  all: ["tickets"] as const,                                  // raíz para invalidación
  list: (filtros: TicketFiltros) => ["tickets", "list", filtros] as const,
  detail: (id: string) => ["tickets", id] as const,
}
```

```ts
// use-tickets.ts
export function useTickets(filtros: TicketFiltros, enabled = true) {
  return useQuery({
    queryKey: queryKeys.tickets.list(filtros),
    queryFn: () => apiFetch<Ticket[]>(`tickets${toQueryString(filtros)}`),
    enabled,                 // false cuando no hay ciclo activo (ADR-2)
  });
}
```

- **Invalidación**: las mutaciones (create/update/delete/transición) siguen invalidando la
  RAÍZ `queryKeys.tickets.all` (`["tickets"]`), que es PREFIJO de toda
  `["tickets","list",...]` → invalida todas las listas filtradas. **Auditar** que los
  `invalidateQueries({ queryKey: queryKeys.tickets.all })` existentes (p.ej.
  `use-ticket-form.ts` L127) sigan apuntando a la raíz, no a una key con filtros.

**Riesgo de stale**: documentado — el objeto `filtros` como parte de la key debe ser estable
(serializable, sin referencias nuevas en cada render). Usar `useMemo` para el objeto de
filtros o keys primitivas. Se cubre en tasks.

---

## ADR-8 — Frontend: `use-ciclo-activo` y bloqueo con popup

**Decisión.** Nuevo hook `use-ciclo-activo`:

```ts
// hooks/use-ciclo-activo.ts
export function useCicloActivo() {
  return useQuery({
    queryKey: queryKeys.tickets.cicloActivo,     // ["tickets","ciclo-activo"]
    queryFn: () => apiFetch<CicloActivo | null>("tickets/ciclo-activo"),
  });
}
```

Container `TicketsPage` orquesta:
- `isLoading` (ciclo o tickets) → Skeleton.
- ciclo `=== null` → render de un popup/diálogo "No hay un ciclo activo" (Radix Dialog/Alert,
  estilo glassmorphism dual) + estado bloqueado/empty; `useTickets(..., enabled=false)`.
- ciclo presente → deriva rango default, habilita `useTickets`, renderiza `FiltrosBar` +
  `TicketsList`.

El popup es presentational; la decisión de mostrarlo es del container. Respeta las fases de
interfaz de la CONSTITUTION (skeleton, empty/blocked state).

---

## ADR-9 — Frontend: form pre-popula `tipo` desde contexto, `fechaCreacion` editable, y QUITA el campo de resolución

**Contexto.** Hoy el form: `tipoId` es un `<Select>` que el usuario elige; hay un campo
"Fecha de vencimiento" (`fechaVencimiento`). Decisiones: el form PROPONE el tipo (default del
contexto, editable), agrega `fechaCreacion` (default hoy, editable) y QUITA la fecha de
resolución (la carga el técnico en la transición — ADR-4).

**Decisión.**
- **`tipoId` se propone SOLO si hay exactamente 1 tipo en el filtro (decisión CERRADA).**
  La regla de pre-carga se deriva del ESTADO DE FILTROS de la lista (ADR-7), no de una
  noción ambigua de "sección":
  - Si `filtros.tiposIds` tiene EXACTAMENTE 1 elemento → el form propone ese tipo como
    `defaultValues.tipoId` (el usuario ya está mirando un único tipo, lo más probable es que
    cree uno de ese tipo).
  - Si hay 0 tipos seleccionados (todos) o 2+ tipos → `defaultValues.tipoId = ""` (vacío,
    el usuario elige).
  - El `<Select>` de tipo SIEMPRE se mantiene EDITABLE (la propuesta no bloquea).

  El container `TicketsPage` calcula `defaultTipoId` desde su estado de filtros y lo pasa a
  `TicketFormModal` (→ `useTicketForm`):

  ```ts
  const defaultTipoId =
    filtros.tiposIds?.length === 1 ? filtros.tiposIds[0] : "";
  ```

  Esto RESUELVE la ambigüedad previa de "tipo del contexto": el contexto es el filtro activo,
  no la ruta.
- **`fechaCreacion` editable.** Nuevo campo `<input type="date">` con default = hoy
  (`new Date().toISOString().slice(0,10)`). Se agrega a `CreateTicketSchema` como
  `fechaCreacion: z.string()` (solo validación de FORMATO, SIN refine "no futura" — se
  permiten fechas futuras, espejo de ADR-5) y a `TicketFormValues`. Se envía en el POST → backend (ADR-5).
- **Quitar el campo de resolución del form (CRÍTICO — no romper schemas/use-ticket-form).**
  - `TicketFormModal.tsx`: ELIMINAR el `FormField` de "Fecha de vencimiento" (L172-185).
  - `schemas.ts`: QUITAR `fechaVencimiento` de `CreateTicketSchema` (L30) y `UpdateTicketSchema`
    (L66), y del type `TicketFormValues` (L87). NO renombrar a `fechaResolucion` en el form
    (el form ya no la maneja).
  - `use-ticket-form.ts`: `mapTicketToForm` (L60) QUITA `fechaVencimiento`; `defaultValues`
    (L95) QUITA `fechaVencimiento` y AGREGA `tipoId: defaultTipoId`, `fechaCreacion: hoy`.
  - `types.ts`: `Ticket.fechaVencimiento` → `fechaResolucion: string | null` (el READ sigue
    existiendo, se muestra en detalle/lista; solo el WRITE del form se elimina).
  - Tests `schemas.test.ts`, `TicketFormModal.test.tsx`, `use-*-ticket.test.ts`: actualizar
    (TDD: primero el test al nuevo contrato, luego el código).

**Container/Presentational** se respeta: `TicketsPage` (container) inyecta `defaultTipoId`;
`useTicketForm` (container-hook) arma defaults y maneja submit/efectos; `TicketFormModal`
(presentational) solo renderiza campos y errores.

**Alternativa rechazada.** Mantener `fechaVencimiento` en el form renombrado a
`fechaResolucion`: contradice la decisión #1532 (la carga el técnico al resolver, no en alta).

---

## Plan de migración (resumen operativo)

1. **PR2 (aislado)** ejecuta el rename:
   - Editar `schema.prisma` + crear migración `RENAME COLUMN`.
   - `prisma generate` (regenera client tenant).
   - Rename de los ~20 touch points guiado por el compilador TS (mismo PR).
   - Local: `prisma migrate deploy`. Deploy: `node scripts/migrate-tenants.ts` (fan-out a
     todas las tenant DBs activas, idempotente, non-aborting, reporte agregado).
2. **Fallo parcial multi-tenant**: si un tenant falla, los demás migran igual; el reporte
   (`TenantMigrationResult[]`) lista los `error`. Re-correr el runner reintenta solo los
   pendientes (Prisma no re-aplica los `success`). El backend NO debe deployarse con el
   código renombrado hasta que TODAS las tenant DBs estén migradas (si no, los tenants no
   migrados rompen al mapear `fecha_resolucion` inexistente). **Orden de release**: migrar
   tenants → verificar 0 errores → deploy del código. Documentado como riesgo operativo.

---

## Riesgos y decisiones a validar

1. **Migración multi-tenant con fallo parcial (ADR-3/plan).** Drift dominio↔DB si se
   deploya el código antes de migrar todos los tenants. Mitigación: migrar primero, verificar
   reporte sin errores, recién deployar. El rename físico es irreversible sin migración inversa.
2. **Cache stale TanStack Query (ADR-7).** El objeto `filtros` debe ser estable para la query
   key; invalidaciones deben apuntar a la raíz `["tickets"]`. Auditar
   `use-ticket-form.ts` L127 y cualquier otro `invalidateQueries`.
3. **Quitar el campo de resolución sin romper schemas/use-ticket-form (ADR-9).** Es el punto
   más frágil del frontend: tocar `schemas.ts`, `use-ticket-form.ts`, `TicketFormModal.tsx`,
   `types.ts` y sus tests de forma coordinada. TDD estricto: tests primero.
4. **Permiso para cargar resolución (ADR-4).** Hoy `PATCH /:id/estado` no tiene
   `@RequirePermissions`. NO se introduce RBAC nuevo en esta change. **Validar** si se requiere.
5. **Gestión de ciclos fuera de alcance (proposal).** Si no existe ningún ciclo creado, la
   lista queda bloqueada (popup) hasta el change `gestion-ciclos-cliente`. Dependencia externa.
6. **Fechas inválidas en query (ADR-1).** Elegimos ignorar el filtro inválido en vez de `400`.
   Confirmar en tasks.
7. **Costo del JOIN de orden (ADR-1).** Bajo hoy (catálogo de 3 filas). Re-evaluar solo si el
   volumen de tickets crece a un punto donde el sort por `tt.nombre` pese (improbable a corto plazo).

### Decisiones cerradas por el usuario (ya NO son riesgos abiertos)
- **Orden secundario por NOMBRE de tipo (ADR-1)** — cerrado: JOIN relacional Prisma a `tipos_ticket`.
- **`fechaResolucion` OBLIGATORIA al RESOLVER y LIMPIADA en reapertura (ADR-4)** — cerrado.
- **`fechaCreacion` permite fechas futuras, sin validación de rango (ADR-5)** — cerrado.
- **Pre-carga de tipo solo si hay exactamente 1 tipo en el filtro (ADR-9)** — cerrado; resuelve
  la ambigüedad de "tipo del contexto".

---

## Alineación con el slicing (PR1–PR5)

- **PR1** Backend listado: ADR-1 (puerto + use case + controller + DTO query) + ADR-2/ADR-6
  (endpoint `ciclo-activo` + orden de rutas).
- **PR2** AISLADO: ADR-3 (rename + migración multi-tenant). Cuello de botella de presupuesto;
  corte PR2a (rename+migración dominio/infra) / PR2b (interfaz+frontend) si excede 400 líneas.
- **PR3** ADR-4 (resolución en transición) + ADR-5 (alta acepta `fechaCreacion`).
- **PR4** ADR-7 + ADR-8 (frontend filtros + ciclo + popup + query-keys parametrizadas).
- **PR5** ADR-9 (form: pre-popula tipo + `fechaCreacion` editable + quita campo resolución).
- **Deps**: PR1 → (PR2 → PR3) → PR4 → PR5.
