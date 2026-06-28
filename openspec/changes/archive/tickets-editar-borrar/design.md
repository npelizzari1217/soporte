# Design: tickets-editar-borrar (Change A — BACKEND)

> ADR-style technical design. Decisiones de arquitectura para `PATCH /tickets/:id`
> (editar datos) y `DELETE /tickets/:id` (soft-delete). NO contiene tasks: el HOW
> arquitectónico, no el paso a paso.
>
> Verificado contra el código real (no asumido). Patrón de referencia:
> `transicionar-estado.use-case.ts` y `asignar-ticket.use-case.ts`.

## 0. Contexto arquitectónico verificado

Clean / Hexagonal por capas, ya consolidado en el módulo `tickets`:

- **Dominio puro** (`domain/`): `TicketEntity extends BaseEntity` (provee `softDelete()`,
  `isDeleted()`, `deletedAt`). `TERMINAL_STATES = {CERRADO, CANCELADO}`. La entidad
  NO guarda el código del estado, solo `estadoId` (UUID). Errores tipados via
  `DomainError` + `Result<T,E>` (sin throw para fallos esperados).
- **Aplicación** (`application/use-cases/`): use cases como clases planas, instanciadas
  por `useFactory` en `tickets.module.ts`. Persistencia ticket+operación en la MISMA
  transacción vía `ITenantTransactionRunner.run()`.
- **Interface** (`interface/controllers/`): `TicketsController` traduce HTTP↔use case,
  mapea `DomainError → HttpException`. DTOs son interfaces planas SIN class-validator
  (patrón `tickets.dto.ts`). Guard chain de clase: `JwtAuthGuard → RolesGuard →
  PermissionsGuard → TenantGuard`. `@RequirePermissions(...)` por endpoint.
- **Multi-tenant FÍSICO**: cada tenant es una DB separada (`buildTenantUrl`,
  `DATABASE_URL_TENANT`). `TenantGuard` bindea `TenantContext` → los repos tenant
  reciben el `PrismaClient` de la DB del tenant. El aislamiento es físico, no por filtro.

### Hallazgo crítico (corrige el supuesto del proposal)

El proposal habla de "una migración master con permisos + tipo_operacion". **Eso es
imposible en una sola migración**: los datos viven en DOS bases distintas y dos
mecanismos distintos:

| Dato | DB | Cómo llega a tenants EXISTENTES | Cómo llega a tenants NUEVOS |
|------|----|--------------------------------|-----------------------------|
| `permisos` + `roles_permisos` | **master** (`prisma_master`) | migración master | migración master |
| `tipo_operacion` (EDICION/ELIMINACION) | **tenant** (`prisma_tenant`, 1 por cliente) | **migración tenant** (la corre `scripts/migrate-tenants.ts` sobre todas las DBs) | **seeder** (`tenant-seed.ts` + `tenant-seeder.adapter.ts`) |

Las migraciones son inmutables ⇒ se crean archivos NUEVOS. El catálogo `tipo_operacion`
se siembra hoy por seeder (solo cubre tenants nuevos), así que para los tenants
existentes hace falta ADEMÁS una migración tenant data-only idempotente. Detalle en §5.

---

## 1. Dominio — `TicketEntity`

### 1.1 `updateDatos(datos)` — mutación de campos de datos

Firma propuesta (dominio puro, sin imports de infra):

```ts
/** Campos editables del ticket. `undefined` = no tocar; `null` = setear a null. */
export interface ActualizarDatosTicket {
  titulo?: string;
  descripcion?: string | null;
  prioridadId?: string;
  tipoId?: string;
  cicloId?: string | null;
  fechaVencimiento?: Date | null;
}

updateDatos(datos: ActualizarDatosTicket): void
```

Semántica e invariantes (dentro de la entidad):

- **Partial update real**: se aplica SOLO cada campo con `!== undefined`. Distinguir
  `undefined` (no enviar) de `null` (limpiar) es obligatorio para `descripcion`,
  `cicloId`, `fechaVencimiento` que son nullable. Implementación: chequear
  `datos.x !== undefined` campo por campo, no `Object.assign` ciego.
- **Invariante de datos**: si `titulo` viene definido, debe ser no-vacío tras `trim()`.
  Vacío ⇒ lanzar/retornar error de dominio `TituloInvalidoError`. (Decisión: el título
  es el único campo con regla de no-vacuidad; el resto son FKs/fechas opcionales.)
- **NO chequea estado terminal ni soft-delete acá**: la entidad no tiene el código del
  estado (solo `estadoId`). Igual que `canTransitionTo`, la editabilidad por estado se
  resuelve con `canEdit(codigo)` que el use case invoca tras cargar el estado. Mantiene
  el dominio puro y consistente con el patrón existente.
- `updateDatos` actualiza `_updatedAt` (vía un toque interno o por el mapper en `save`).
  Decisión: agregar un `touch()` mínimo o setear `_updatedAt = new Date()` dentro de
  `updateDatos`, igual que `softDelete()` ya lo hace. Mantiene auditoría coherente.

### 1.2 `canEdit(estadoActualCodigo)` — invariante de editabilidad

Espejo exacto de `canTransitionTo`, separado por responsabilidad:

```ts
/**
 * Invariante de entidad para edición de datos:
 * - Ticket soft-deleted NO es editable.
 * - Ticket en estado terminal (CERRADO/CANCELADO) NO es editable.
 * El use case carga el código del estado actual vía IEstadoRepository y lo pasa aquí.
 */
canEdit(estadoActualCodigo: string): boolean {
  if (this.isDeleted()) return false;
  if (TERMINAL_STATES.has(estadoActualCodigo)) return false;
  return true;
}
```

Reutiliza la constante `TERMINAL_STATES` ya existente. **Borrado NO usa `canEdit`**:
borrado permitido en terminal (decisión confirmada) ⇒ delete no carga el estado.

### 1.3 Decisión: chequeo de estado terminal

- **Elegido**: el use case carga el código del estado vía `IEstadoRepository.findById(estadoId)`
  (mismo patrón que `transicionar-estado` paso 2) y llama `ticket.canEdit(codigo)`.
- **Rechazado**: guardar el código del estado en la entidad. Rompería la normalización
  ("una sola fuente de verdad = `estadoId`") ya establecida en `TicketProps`.
- **Rechazado**: pasar un boolean `esTerminal` desde el controller. Filtraría lógica de
  dominio a la capa de presentación.

---

## 2. Casos de uso (capa aplicación)

### 2.1 `EditarTicketUseCase`

DTO de entrada (tenant aislado físicamente ⇒ no hace falta `clienteId`):

```ts
export interface EditarTicketDto {
  ticketId: string;
  datos: ActualizarDatosTicket;
  autorId: string; // user.sub del JWT — se registra en la OperacionTicket
}
```

Dependencias: `ticketRepo`, `estadoRepo`, `tipoTicketRepo`, `operacionRepo`,
`tipoOperacionRepo`, `txRunner`.

Flujo:

1. `ticket = ticketRepo.findById(ticketId)`. Si `!ticket || ticket.isDeleted()` →
   `Result.fail(TicketNoEncontradoError)` (404). **Mismo criterio que `obtener`/`asignar`**:
   un ticket soft-deleted se trata como inexistente, no como "editar un borrado".
2. `estadoActual = estadoRepo.findById(ticket.estadoId)`. Si null →
   `EstadoCatalogoNoEncontradoError` (500, corrupción de catálogo).
3. Si `!ticket.canEdit(estadoActual.codigo)` → `TicketNoEditableError` (422). El estado
   es terminal (deleted ya filtrado en paso 1).
4. Si `datos.tipoId` está definido: validar existencia vía
   `tipoTicketRepo.findCodigoById(datos.tipoId)`; null → `TipoTicketNoEncontradoError`
   (422). Evita un 500 por violación de FK. (Ver riesgo R-2 sobre `numero`.)
5. `ticket.updateDatos(datos)` → puede fallar con `TituloInvalidoError` (422).
6. Resolver `tipoOperacionId = tipoOperacionRepo.findIdByCodigo('EDICION')`; null →
   `TipoOperacionNoEncontradoError` (500, seed no aplicado).
7. Construir `OperacionTicketEntity` EDICION (ver §6).
8. `txRunner.run(() => { ticketRepo.save(ticket); operacionRepo.save(operacion); })`.
9. `Result.ok(ticket)`.

### 2.2 `EliminarTicketUseCase`

DTO:

```ts
export interface EliminarTicketDto {
  ticketId: string;
  autorId: string;
}
```

Dependencias: `ticketRepo`, `operacionRepo`, `tipoOperacionRepo`, `txRunner`.
(NO necesita `estadoRepo`: borrado permitido en terminal.)

Flujo:

1. `ticket = ticketRepo.findById(ticketId)`. Si `!ticket` → `TicketNoEncontradoError` (404).
2. **Idempotencia** (decisión §2.3): si `ticket.isDeleted()` → `Result.ok(ticket)`
   SIN volver a borrar y SIN registrar nueva OperacionTicket. No-op silencioso.
3. `ticket.softDelete()`.
4. `tipoOperacionId = tipoOperacionRepo.findIdByCodigo('ELIMINACION')`; null →
   `TipoOperacionNoEncontradoError` (500).
5. Construir `OperacionTicketEntity` ELIMINACION (ver §6).
6. `txRunner.run(() => { ticketRepo.save(ticket); operacionRepo.save(operacion); })`.
   (Se usa `save(ticket)` con `deletedAt` ya seteado, no `repo.delete(id)`, para mantener
   ticket+operación en una sola transacción atómica, igual que el resto de use cases.)
7. `Result.ok(ticket)`.

### 2.3 Decisión: idempotencia del DELETE (no-op success, NO 409)

- **Elegido**: segundo DELETE sobre un ticket ya borrado → **204 No Content** (éxito),
  sin error, sin segunda OperacionTicket ELIMINACION.
- **Razón**: "DELETE soft idempotente" es decisión CONFIRMADA. La idempotencia HTTP
  significa que repetir la operación produce el mismo estado observable. Un no-op
  evita ruido en el trail (evita N entradas ELIMINACION por reintentos de red) y es lo
  menos sorprendente para clientes con retry.
- **Rechazado**: `TicketYaEliminadoError → 409 Conflict`. Contradice "idempotente":
  un cliente que reintenta un DELETE que sí se aplicó recibiría un error espurio. Se
  descarta; por eso este diseño NO introduce `TicketYaEliminadoError`.
- **Riesgo/desalineación a confirmar en spec**: el brief mencionaba `TicketYaEliminadoError`.
  Este diseño lo reemplaza por no-op idempotente. Marcado en §9 (R-1) para que la spec
  ratifique.

### 2.4 Errores de dominio nuevos

| Error | code | HTTP | Uso |
|-------|------|------|-----|
| `TicketNoEditableError` | `TICKET_NO_EDITABLE` | 422 | edición sobre estado terminal |
| `TituloInvalidoError` | `TITULO_INVALIDO` | 422 | `titulo` vacío tras trim en `updateDatos` |

Reutilizados (ya existen): `TicketNoEncontradoError` (404), `EstadoCatalogoNoEncontradoError`
(500), `TipoTicketNoEncontradoError` (422 en este contexto), `TipoOperacionNoEncontradoError`
(500). Definidos en `tickets.errors.ts`, mismo formato `extends DomainError`.

---

## 3. Interface (controller + DTOs)

### 3.1 Endpoints en `TicketsController`

```
PATCH  /tickets/:id   @RequirePermissions('ticket:editar')    → 200 + TicketResponseDto
DELETE /tickets/:id   @RequirePermissions('ticket:eliminar')  → 204 No Content
```

Ambos bajo el guard chain de clase ya existente (incluye `TenantGuard`). `autorId` y el
tenant salen del JWT vía `@CurrentUser() user: JwtPayload` (`user.sub`); el aislamiento
de tenant lo da `TenantGuard`/`TenantContext` — **no se pasa `cliente_id` a estos use
cases** porque el ticket se carga de la DB del tenant activo.

### 3.2 DTO de entrada (interface plana, sin class-validator)

```ts
/** Cuerpo HTTP para PATCH /tickets/:id. Todos los campos opcionales (partial update). */
export interface UpdateTicketHttpDto {
  titulo?: string;
  descripcion?: string | null;
  prioridadId?: string;
  tipoId?: string;
  cicloId?: string | null;
  fechaVencimiento?: string | null; // ISO; el controller lo convierte a Date
}
```

DELETE no tiene body. El controller arma `EditarTicketDto.datos` mapeando
`fechaVencimiento` `string → Date` (`new Date(...)` solo si viene definido; preservar
`null` explícito). Respuesta de PATCH reutiliza `toTicketResponse(...)`.

### 3.3 Mapeo de errores → HTTP (alineado al patrón del controller)

PATCH:

```
TicketNoEncontradoError        → NotFoundException (404)
TicketNoEditableError          → UnprocessableEntityException (422)
TituloInvalidoError            → UnprocessableEntityException (422)
TipoTicketNoEncontradoError    → UnprocessableEntityException (422)   // input del usuario
EstadoCatalogoNoEncontradoError→ InternalServerErrorException (500)   // corrupción catálogo
TipoOperacionNoEncontradoError → InternalServerErrorException (500)   // seed no aplicado
```

DELETE:

```
TicketNoEncontradoError        → NotFoundException (404)
TipoOperacionNoEncontradoError → InternalServerErrorException (500)
// éxito (incluye no-op idempotente) → 204 No Content, sin body
```

**Decisión 422 vs 409 para terminal**: se usa **422**, consistente con
`TransicionInvalidaError → 422` ya existente (violación de invariante de máquina de
estados = unprocessable). No se usa 409 en ningún camino (idempotencia es no-op, no
conflicto).

### 3.4 Wiring en `tickets.module.ts`

Dos providers nuevos vía `useFactory` + `inject` (mismo estilo que los existentes):

- `EditarTicketUseCase` ← `TICKET_REPOSITORY`, `ESTADO_REPOSITORY`, `TIPO_TICKET_REPOSITORY`,
  `OPERACION_TICKET_REPOSITORY`, `TIPO_OPERACION_REPOSITORY`, `TENANT_TRANSACTION_RUNNER`.
- `EliminarTicketUseCase` ← `TICKET_REPOSITORY`, `OPERACION_TICKET_REPOSITORY`,
  `TIPO_OPERACION_REPOSITORY`, `TENANT_TRANSACTION_RUNNER`.

Inyectarlos en el constructor de `TicketsController`. Sin cambios en puertos/repos:
`ITicketRepository.save` (upsert) y `findById` (incluye soft-deleted) ya alcanzan.

---

## 4. Auditoría — forma de la `OperacionTicket`

El trail existente es MÍNIMO (ASIGNACION usa `descripcion:null`, `metadata:null`).
Se mantiene la simplicidad, con un mínimo de valor de auditoría:

**EDICION**:

```ts
OperacionTicketEntity.create({
  ticketId: ticket.id,
  tipoOperacionId,                 // resuelto de 'EDICION'
  descripcion: null,
  estadoAnteriorId: null,          // edición de datos no cambia estado
  estadoNuevoId: null,
  autorId: dto.autorId,
  metadata: { camposModificados: string[] }, // claves realmente cambiadas
});
```

- `metadata.camposModificados` = lista de las claves de `datos` que efectivamente se
  aplicaron (las `!== undefined`). Útil para el timeline ("editó título y prioridad")
  sin almacenar valores viejos/nuevos.
- **Rechazado**: diff completo `{ antes, despues }`. Más pesado, puede guardar texto
  largo/sensible de `descripcion` en el trail, y excede el nivel del trail actual.
  Se descarta por simplicidad (alineado con "mantené simple si el trail existente lo es").

**ELIMINACION**:

```ts
{ ticketId, tipoOperacionId /* 'ELIMINACION' */, descripcion: null,
  estadoAnteriorId: null, estadoNuevoId: null, autorId, metadata: null }
```

Mínima, idéntica en forma a ASIGNACION.

---

## 5. Migraciones + seed (3 piezas, 2 DBs)

> Migraciones inmutables ⇒ archivos NUEVOS. Todo idempotente (`ON CONFLICT DO NOTHING`),
> patrón ya usado en `20260623010000_seed_rbac_base` y en los seeds tenant.

### 5.1 Migración MASTER — permisos + roles_permisos

`prisma_master/migrations/<timestamp>_seed_rbac_ticket_editar_eliminar/migration.sql`

- Insertar 2 permisos, UUIDs deterministas continuando la secuencia `b0...` (próximos
  `012` y `013`):

```sql
INSERT INTO permisos (id, codigo, descripcion) VALUES
  ('b0000000-0000-4000-b000-000000000012', 'ticket:editar',   'Editar campos de datos de un ticket'),
  ('b0000000-0000-4000-b000-000000000013', 'ticket:eliminar', 'Dar de baja (soft-delete) un ticket')
ON CONFLICT (codigo) DO NOTHING;
```

- Mapear a roles vía SELECT JOIN por `codigo` (NO hardcodear UUIDs de la join), igual
  que el seed base:
  - `ticket:editar`  → **ADMIN, SOPORTE_IT**
  - `ticket:eliminar`→ **ADMIN**

```sql
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE (r.codigo = 'ADMIN'      AND p.codigo IN ('ticket:editar','ticket:eliminar'))
   OR (r.codigo = 'SOPORTE_IT' AND p.codigo IN ('ticket:editar'))
ON CONFLICT (rol_id, permiso_id) DO NOTHING;
```

Nombres reales verificados: tabla `roles` (codigos `ADMIN`, `SOPORTE_IT`, ...), tabla
`permisos` (codigo/descripcion), join `roles_permisos (rol_id, permiso_id)`.

### 5.2 Migración TENANT — tipo_operacion (cubre tenants EXISTENTES)

`prisma_tenant/migrations/<timestamp>_seed_tipo_operacion_edicion_eliminacion/migration.sql`

UUIDs deterministas continuando `f0...` (próximos `007`, `008`):

```sql
INSERT INTO tipo_operacion (id, codigo, nombre) VALUES
  ('f0000000-0000-4000-f000-000000000007', 'EDICION',     'Edición'),
  ('f0000000-0000-4000-f000-000000000008', 'ELIMINACION', 'Eliminación')
ON CONFLICT (codigo) DO NOTHING;
```

La corre `scripts/migrate-tenants.ts` (runner que aplica migraciones tenant sobre TODAS
las DBs de tenant existentes). Tabla real: `tipo_operacion (id, codigo, nombre)`, UNIQUE
en `codigo`.

### 5.3 Seeders — tipo_operacion (cubre tenants NUEVOS)

El catálogo tenant se siembra por seeder, no por migración, para tenants nuevos. Hay que
agregar las 2 filas EN AMBOS archivos (están explícitamente "en sincronía"):

- `prisma_tenant/seeds/tenant-seed.ts` → `SEED_TIPO_OPERACION_SQL`
- `src/clientes/infrastructure/tenant-seeder.adapter.ts` → `SEED_TIPO_OPERACION_SQL`

Mismas 2 filas idempotentes. Actualizar también el `console.log`/comentario "(6 tipos)"→"(8)".

> Nota: como el seeder usa `ON CONFLICT DO NOTHING` y la migración tenant también, un
> tenant nuevo que corra migración + seed no genera conflicto (doble idempotente).

---

## 6. Seguridad (§7 constitución)

- **Aislamiento de tenant**: físico (DB por cliente). `TenantGuard` bindea `TenantContext`
  antes de cualquier repo; `findById`/`save` operan SOLO sobre la DB del tenant del JWT.
  No hay query cross-tenant posible: un `ticketId` de otro tenant simplemente no existe
  en la DB activa → 404. Sin fuga cross-tenant.
- **Autorización**: `@RequirePermissions('ticket:editar' | 'ticket:eliminar')` +
  `PermissionsGuard`. Permisos nuevos asignados con menor privilegio (eliminar solo ADMIN).
- **Autoría**: `autorId = user.sub` del JWT (no del body) → trail no falsificable por input.
- **Validación de input**: `titulo` no-vacío en dominio; FKs (`tipoId`) validadas contra
  catálogo (422) antes de tocar DB. Sin hardcodeo de secretos.

---

## 7. Estrategia de tests — Test-First (RED→GREEN, Jest)

Runner: **Jest** (`strict_tdd: true`). Tests atómicos, sin over-mock (§5 constitución):
contrato primero, un input→un output, complejidad del test ≤ complejidad de la unidad.

| Pieza | Tipo | Qué se testea (RED primero) |
|-------|------|------------------------------|
| `TicketEntity.updateDatos` | unit puro (sin mocks) | partial update (undefined no toca, null limpia), título vacío→error, updatedAt cambia |
| `TicketEntity.canEdit` | unit puro | false si deleted, false si terminal, true en activo no-terminal |
| `EditarTicketUseCase` | unit, repos mockeados | 404 (inexistente/soft-deleted), 500 (estado catálogo), 422 terminal, 422 tipoId inválido, happy path: updateDatos+save+OperacionTicket EDICION en misma tx |
| `EliminarTicketUseCase` | unit, repos mockeados | 404 inexistente, **idempotencia: ya borrado → ok no-op sin 2ª operación**, happy path: softDelete+save+OperacionTicket ELIMINACION |
| `TicketsController` | unit, use cases mockeados | mapeo de cada error→HTTP, 204 en DELETE, `@RequirePermissions` correcto, mapeo DTO (fecha string→Date, null preservado) |
| Migración master + tenant + seed | integration | 2 permisos + roles_permisos correctos; 2 tipo_operacion presentes; idempotencia (correr 2x sin duplicar) |

Mock de `txRunner`: ejecutar el callback inmediatamente (`run: (cb) => cb()`), como en
los specs existentes de `transicionar`/`asignar`. No mockear la DB en la capa unitaria.

---

## 8. Plan de slices (auto-chain, < 400 líneas c/u)

```
Slice 1  (cimientos)  ──┬──> Slice 2 (editar)
                        └──> Slice 3 (eliminar)
Slice 2 y Slice 3 son independientes entre sí.
```

- **Slice 1 — Permisos + catálogo** (sin deps de código). Migración master (§5.1),
  migración tenant (§5.2), seeders (§5.3), tests de migración/seed. Habilita que los use
  cases resuelvan `EDICION`/`ELIMINACION` y que los guards reconozcan los permisos.
  Estimado ~150-200 líneas.
- **Slice 2 — Editar** (dep: Slice 1). `updateDatos` + `canEdit` en entidad, errores
  `TicketNoEditableError`/`TituloInvalidoError`, `EditarTicketUseCase`, wiring módulo,
  `UpdateTicketHttpDto`, `PATCH /tickets/:id` en controller, tests (entidad+use case+
  controller). Estimado ~300 líneas.
- **Slice 3 — Eliminar** (dep: Slice 1). `EliminarTicketUseCase`, wiring módulo,
  `DELETE /tickets/:id` en controller, tests. Estimado ~180 líneas.

Cada slice cierra en verde y entra en < 400 líneas → apto para PRs encadenados.

---

## 9. Riesgos / decisiones a validar en spec

- **R-1 (idempotencia DELETE)**: este diseño resuelve "ya borrado" como **no-op 204**,
  descartando `TicketYaEliminadoError`/409 que mencionaba el brief. La spec debe ratificar
  el contrato idempotente (204 en reintentos).
- **R-2 (`tipoId` editable vs `numero`)**: el `numero` legible (`SOP-2026-...`) se generó
  del `tipo` original. Permitir editar `tipoId` deja `numero` inconsistente con el nuevo
  tipo. El diseño valida existencia del `tipoId` pero NO regenera `numero`. Recomendación
  para spec: confirmar si `tipoId` debe ser editable o excluirse del PATCH (lo más seguro
  sería excluirlo). Decisión de producto.
- **R-3 (sincronía de seeders)**: `tipo_operacion` se mantiene a mano en 2 archivos +
  1 migración. Olvidar uno deja tenants nuevos o existentes sin el catálogo → use cases
  fallan con 500. Mitigado por idempotencia, pero es deuda estructural conocida.
- **R-4 (validación de `prioridadId`/`cicloId`)**: no se validan contra catálogo (solo
  `tipoId`). Un UUID inexistente cae en violación de FK → 500. Aceptado por simplicidad;
  si se quiere 422, agregar checks (amplía scope).
```
