# Tasks: tickets-maquina-estados-observaciones (Change A)

> **Change:** `tickets-maquina-estados-observaciones`
> **Fecha:** 2026-06-29
> **Store:** hybrid (engram + openspec)
> **Delivery strategy:** auto-chain — 3 PRs encadenados, <400 líneas c/u
> **Runner de tests:** `pnpm test` (Vitest backend) · `pnpm vitest run` (frontend)
> **Modo TDD:** ESTRICTO (RED precede a cada GREEN sin excepción)
>
> **Corrección del orquestador aplicada (override al spec):**
> `fechaCierre` para RESUELTO es INPUT REQUERIDO del caller (igual que `fechaResolucion`
> en la implementación actual). Para SIN_SOLUCION y RECHAZADO el default es `now()::date`.
> El spec dice "auto-now para los 3" — esto es INCORRECTO para RESUELTO. Ver P3.T1 (SYNC).

---

## Diagrama de dependencias entre PRs

```
main
 └─► PR1 (máquina + catálogo + bloqueo)
       └─► PR2 (OBSERVACION + CrearObservacionUseCase + endpoint)
              └─► PR3 (guard authz + seed permisos + fechaCierre rename + dead code)
```

---

## PR1 — Máquina 7 estados + catálogo + bloqueo por estado

**Base branch:** `main`
**Target:** `main`
**Líneas estimadas:** ~300–360 (riesgo: Medio)

### Riesgos de PR1

- **R2 (crítico):** `base-ticket-state-machine.spec.ts` va a RED desde el primer momento.
  La suite existente cubre el flujo legacy (4 estados con reapertura). REESCRIBIR, no borrar.
- **R3 (vigilar):** COMPRAS y EDILICIA tienen `Strategy` propio registrado en `TicketStateMachineFactory`.
  Solo se toca la clase base; `factory.register()` no se modifica. Verificar que los
  tests de COMPRAS/EDILICIA no rompen después de PR1.
- La adición de `estadoRepo` a `EliminarTicketUseCase` es una nueva dependencia de inyección.
  Hay que actualizar el wiring en `tickets.module.ts`.

---

### [x] P1.T1 · RED · Reescribir spec de la máquina de estados base

**Tipo:** RED (test-first, máquina de estados)
**Secuencia:** primer paso del slice — hace los tests existentes pasar a RED

| Archivo | Acción |
|---------|--------|
| `backend/src/tickets/domain/state-machine/base-ticket-state-machine.spec.ts` | Reescribir |

**Qué debe cubrir la nueva spec:**

- Los 10 arcos del nuevo grafo son válidos (table-driven: `it.each`)
- El arco legacy `ABIERTO → EN_PROGRESO` es **inválido** (422 semántico)
- Los 3 terminales (RESUELTO, SIN_SOLUCION, RECHAZADO) no tienen arcos de salida
- Los 3 congelados (CERRADO, CANCELADO, PENDIENTE_APROBACION) no tienen arcos de entrada ni salida
- Arco `SUSPENDIDO → EN_PROGRESO` (válido)
- Arco `ABIERTO → RECHAZADO` (nuevo, válido)

**Ref spec:** Enmienda "Máquina de estados base" (tickets-core/spec.md)
**Ref design:** ADR-1

---

### [x] P1.T2 · GREEN · Reemplazar VALID_TRANSITIONS en BaseTicketStateMachine

**Tipo:** GREEN
**Depende de:** P1.T1

| Archivo | Acción |
|---------|--------|
| `backend/src/tickets/domain/state-machine/base-ticket-state-machine.ts` | Modificar |

**Cambios:**

```ts
const VALID_TRANSITIONS = new Map<string, ReadonlySet<string>>([
  ['ABIERTO',     new Set(['APROBADO', 'RECHAZADO'])],
  ['APROBADO',    new Set(['EN_PROGRESO', 'RESUELTO', 'SUSPENDIDO', 'SIN_SOLUCION'])],
  ['EN_PROGRESO', new Set(['RESUELTO', 'SUSPENDIDO', 'SIN_SOLUCION'])],
  ['SUSPENDIDO',  new Set(['EN_PROGRESO'])],
  // RESUELTO, SIN_SOLUCION, RECHAZADO: terminales — sin arcos de salida
  // CERRADO, CANCELADO, PENDIENTE_APROBACION: congelados — sin arcos
]);
```

Actualizar JSDoc del mapa y de la clase con el nuevo diagrama.

**Nota:** `TicketStateMachineFactory` no cambia. COMPRAS/EDILICIA con Strategy propio
no se ven afectados — su `register()` sobreescribe la base localmente.

**Ref spec:** ADR-1

---

### [x] P1.T3 · RED · Agregar tests de canDelete() y TERMINAL_STATES actualizado

**Tipo:** RED
**Puede paralelo con:** P1.T1 (archivos distintos)

| Archivo | Acción |
|---------|--------|
| `backend/src/tickets/domain/entities/ticket.entity.spec.ts` | Agregar tests |

**Nuevos scenarios a cubrir:**

- `canEdit('ABIERTO')` → `true` (ticket activo)
- `canEdit('APROBADO')` → `false` ← CAMBIO respecto al comportamiento anterior
- `canEdit('EN_PROGRESO')` → `false` ← CAMBIO
- `canEdit('SUSPENDIDO')` → `false` ← NUEVO estado
- `canEdit('RESUELTO')` → `false` (ahora en TERMINAL_STATES)
- `canEdit('SIN_SOLUCION')` → `false` ← NUEVO estado
- `canEdit('CERRADO')` → `false` (congelado)
- `canDelete('ABIERTO')` → `true` ← NUEVO método
- `canDelete('APROBADO')` → `false` ← NUEVO
- `canDelete('RESUELTO')` → `false` ← NUEVO
- `canDelete` en soft-deleted ticket → `false`

**Ref spec:** Enmienda Bloqueo edición/borrado (tickets-core), ADR-3

---

### [x] P1.T4 · GREEN · TicketEntity: TERMINAL_STATES whitelist + canEdit ABIERTO-only + canDelete()

**Tipo:** GREEN
**Depende de:** P1.T3

| Archivo | Acción |
|---------|--------|
| `backend/src/tickets/domain/entities/ticket.entity.ts` | Modificar |

**Cambios:**

1. `TERMINAL_STATES` — ampliar a 6 estados (invariante de `canTransitionTo`):
   ```ts
   const TERMINAL_STATES = new Set<string>([
     'RESUELTO', 'SIN_SOLUCION', 'RECHAZADO',      // terminales activos
     'CERRADO', 'CANCELADO', 'PENDIENTE_APROBACION', // congelados legacy
   ]);
   ```
2. `canEdit()` — whitelist estricta:
   ```ts
   canEdit(estadoActualCodigo: string): boolean {
     return !this.isDeleted() && estadoActualCodigo === 'ABIERTO';
   }
   ```
3. Nuevo método `canDelete()` con misma lógica que `canEdit`:
   ```ts
   canDelete(estadoActualCodigo: string): boolean {
     return !this.isDeleted() && estadoActualCodigo === 'ABIERTO';
   }
   ```
4. JSDoc actualizado en ambos métodos.

**Nota:** `EditarTicketUseCase` ya llama `ticket.canEdit(estado.codigo)` — funciona sin tocar
el use case. El comportamiento correcto emerge del cambio en la entidad.

**Ref spec:** ADR-3

---

### [x] P1.T5 · INFRA · Agregar TicketNoBorrableError en tickets.errors.ts

**Tipo:** INFRA (preparar dominio)
**Puede paralelo con:** P1.T3, P1.T4 (archivo distinto, sin dependencias directas)

| Archivo | Acción |
|---------|--------|
| `backend/src/tickets/domain/errors/tickets.errors.ts` | Agregar error + actualizar mensaje |

**Cambios:**

1. Nuevo error (HTTP 422):
   ```ts
   export class TicketNoBorrableError extends DomainError {
     readonly code = 'TICKET_NO_BORRABLE';
     constructor(estadoCodigo: string) {
       super(`El ticket no puede eliminarse porque se encuentra en estado "${estadoCodigo}". Solo tickets en estado ABIERTO pueden eliminarse.`);
     }
   }
   ```
2. Actualizar mensaje de `TicketNoEditableError`: el mensaje actual dice "estado terminal
   (CERRADO/CANCELADO)" — corregir a "estado no es ABIERTO" para reflejar la nueva regla.

**Ref spec:** ADR-3, Req Bloqueo de borrado

---

### [x] P1.T6 · RED · Tests de bloqueo por estado en EliminarTicketUseCase

**Tipo:** RED
**Depende de:** P1.T5

| Archivo | Acción |
|---------|--------|
| `backend/src/tickets/application/use-cases/eliminar-ticket.use-case.spec.ts` | Agregar tests |

**Nuevos scenarios (los tests deben fallar en RED porque el use case aún no carga estado):**

- Ticket en `APROBADO` → `Result.fail(TicketNoBorrableError)`, no soft-delete, no operacion
- Ticket en `RESUELTO` → `Result.fail(TicketNoBorrableError)`
- Ticket en `EN_PROGRESO` → `Result.fail(TicketNoBorrableError)`
- Ticket en `ABIERTO` → `Result.ok(ticket)` (path verde)
- Estado no encontrado (estadoRepo retorna null) → `EstadoCatalogoNoEncontradoError` (500)

**Mocking:** agregar mock de `IEstadoRepository` al setup del test.

**Ref spec:** Req Bloqueo de borrado por estado, ADR-3

---

### [x] P1.T7 · GREEN · EliminarTicketUseCase: cargar estado + validar canDelete()

**Tipo:** GREEN
**Depende de:** P1.T4, P1.T5, P1.T6

| Archivo | Acción |
|---------|--------|
| `backend/src/tickets/application/use-cases/eliminar-ticket.use-case.ts` | Modificar |
| `backend/src/tickets/tickets.module.ts` | Modificar (wiring) |

**Cambios en el use case:**

1. Agregar `IEstadoRepository` al constructor.
2. Después del check de `isDeleted()` (paso 2), insertar:
   ```ts
   const estado = await this.estadoRepo.findById(ticket.estadoId);
   if (!estado) return Result.fail(new EstadoCatalogoNoEncontradoError(ticket.estadoId));
   if (!ticket.canDelete(estado.codigo)) return Result.fail(new TicketNoBorrableError(estado.codigo));
   ```
3. Actualizar JSDoc del flujo (pasos 2→3 se desplazan, renumerar).

**Cambios en tickets.module.ts:**

- `EliminarTicketUseCase` ya tiene acceso a `ESTADO_REPOSITORY` (lo usan otros use cases).
  Solo agregar el token en el `useFactory` del provider de `EliminarTicketUseCase`.

**Ref spec:** ADR-3

---

### [x] P1.T8 · INFRA · Migración tenant: INSERT SUSPENDIDO + SIN_SOLUCION (idempotente)

**Tipo:** INFRA
**Puede paralelo con:** P1.T1–P1.T7

| Archivo | Acción |
|---------|--------|
| `backend/prisma_tenant/migrations/20260629010000_add_estados_suspendido_sin_solucion/migration.sql` | Crear |

```sql
INSERT INTO estados (id, codigo, nombre, orden) VALUES
  ('c0000000-0000-4000-c000-000000000009', 'SUSPENDIDO',   'Suspendido',    45),
  ('c0000000-0000-4000-c000-00000000000a', 'SIN_SOLUCION', 'Sin solución',  55)
ON CONFLICT (codigo) DO NOTHING;
```

**Ref spec:** Delta Tabla estados (tickets-core), ADR-7

---

### [x] P1.T9 · INFRA · tenant-seed.ts: agregar SUSPENDIDO + SIN_SOLUCION

**Tipo:** INFRA
**Puede paralelo con:** P1.T8

| Archivo | Acción |
|---------|--------|
| `backend/prisma_tenant/seeds/tenant-seed.ts` | Modificar |

Agregar las 2 filas a `SEED_ESTADOS_SQL`. Orden por `orden` ascendente para legibilidad.
Idempotencia ya garantizada por `ON CONFLICT (codigo) DO NOTHING`.

**Ref spec:** Req Catálogo de estados actualizado en provisioning de tenant

---

## PR2 — OBSERVACION + CrearObservacionUseCase + endpoint + auto-transición

**Base branch:** `pr1` (target de PR1)
**Target:** `pr1`
**Líneas estimadas:** ~280–340 (riesgo: Medio)

### Riesgos de PR2

- **ADR-2:** `CrearObservacionUseCase` NO puede anidar un `txRunner.run()` llamando a
  `TransicionarEstadoUseCase`. Debe clonar la lógica de transición dentro de su propia
  transacción (misma instancia de runner, un solo `$transaction`).
- **Provisional naming:** en PR2 el método del entity aún es `setFechaResolucion()`.
  En PR3 se renombra a `setFechaCierre()`. Documentar con comentario `// TODO-PR3: rename`.
- **fechaCierre para RESUELTO:** cuando `nuevoEstadoCodigo === 'RESUELTO'` via observación,
  `fechaCierre` es REQUERIDA del caller (campo `fechaCierre` en el body). Para SIN_SOLUCION
  se setea `now()::date` internamente; SUSPENDIDO no es terminal.

---

### [x] P2.T1 · INFRA · Migración tenant: INSERT tipo_operacion OBSERVACION (idempotente)

**Tipo:** INFRA
**Puede paralelo con:** resto de P2

| Archivo | Acción |
|---------|--------|
| `backend/prisma_tenant/migrations/20260629020000_add_tipo_operacion_observacion/migration.sql` | Crear |

```sql
INSERT INTO tipo_operacion (id, codigo, nombre) VALUES
  ('f0000000-0000-4000-f000-000000000009', 'OBSERVACION', 'Observación técnica')
ON CONFLICT (codigo) DO NOTHING;
```

**Ref spec:** Delta Tabla tipo_operacion (tickets-core), ADR-7

---

### [x] P2.T2 · INFRA · tenant-seed.ts: agregar tipo_operacion OBSERVACION

**Tipo:** INFRA
**Puede paralelo con:** P2.T1

| Archivo | Acción |
|---------|--------|
| `backend/prisma_tenant/seeds/tenant-seed.ts` | Modificar |

Agregar fila `f0..009 OBSERVACION` al bloque `SEED_TIPO_OPERACION_SQL`.

**Ref spec:** Req tipo_operacion OBSERVACION presente en todo tenant

---

### [x] P2.T3 · INFRA · DTOs HTTP: CrearObservacionHttpDto + respuesta

**Tipo:** INFRA (preparar interfaz)
**Puede paralelo con:** P2.T1–P2.T2

| Archivo | Acción |
|---------|--------|
| `backend/src/tickets/interface/dtos/tickets.dto.ts` | Agregar interfaces |

**Agregar:**

```ts
/** Cuerpo HTTP para POST /tickets/:id/observaciones */
export interface CrearObservacionHttpDto {
  contenido: string;
  nuevoEstadoCodigo?: 'EN_PROGRESO' | 'RESUELTO' | 'SUSPENDIDO' | 'SIN_SOLUCION';
  /**
   * REQUERIDO cuando nuevoEstadoCodigo === 'RESUELTO'.
   * Formato ISO 'YYYY-MM-DD'.
   * Ignorado para otros destinos.
   */
  fechaCierre?: string;
}

/** Respuesta del endpoint POST /tickets/:id/observaciones (201) */
export interface CrearObservacionResponseDto {
  ticket: TicketResponseDto;
}
```

**Ref spec:** Req Observaciones del técnico, orquestador correction (RESUELTO requiere fechaCierre)

---

### [x] P2.T4 · INFRA · Agregar ObservacionNoPermitidaError en tickets.errors.ts

**Tipo:** INFRA
**Puede paralelo con:** P2.T1–P2.T3

| Archivo | Acción |
|---------|--------|
| `backend/src/tickets/domain/errors/tickets.errors.ts` | Agregar error |

```ts
export class ObservacionNoPermitidaError extends DomainError {
  readonly code = 'OBSERVACION_NO_PERMITIDA';
  constructor(estadoCodigo: string) {
    super(`El ticket está en estado terminal "${estadoCodigo}" y no acepta observaciones.`);
  }
}
```

**Ref spec:** Scenario "Observación bloqueada en estado terminal"

---

### [x] P2.T5 · RED · Crear spec completa de CrearObservacionUseCase (archivo nuevo)

**Tipo:** RED
**Depende de:** P2.T3, P2.T4

| Archivo | Acción |
|---------|--------|
| `backend/src/tickets/application/use-cases/crear-observacion.use-case.spec.ts` | Crear (NUEVO) |

**Scenarios mínimos a cubrir:**

1. Observación en ticket `APROBADO` sin `nuevoEstadoCodigo` → auto-transición a `EN_PROGRESO`
   (2 rows en operaciones_ticket: OBSERVACION + CAMBIO_ESTADO)
2. Observación en `APROBADO` con `nuevoEstadoCodigo: 'EN_PROGRESO'` → equivalente al 1
3. Observación en `APROBADO` con `nuevoEstadoCodigo: 'RESUELTO'` + `fechaCierre` provista
   → `ticket.setFechaResolucion(fechaCierre)` llamado (provisional hasta PR3)
4. Observación en `APROBADO` con `nuevoEstadoCodigo: 'RESUELTO'` SIN `fechaCierre` → fail 422
5. Observación en `APROBADO` con `nuevoEstadoCodigo: 'SUSPENDIDO'` → no setea fechaResolucion
6. Observación en `APROBADO` con `nuevoEstadoCodigo: 'SIN_SOLUCION'` → setea fechaResolucion=now
7. `nuevoEstadoCodigo: 'ABIERTO'` desde `APROBADO` → `TransicionInvalidaError` 422
8. Ticket en `EN_PROGRESO` → registra OBSERVACION, no cambia estado, no setea fecha
9. `nuevoEstadoCodigo` ignorado cuando ticket no está en `APROBADO`
10. Ticket en estado terminal → `ObservacionNoPermitidaError` 422
11. Rollback: si falla inserción CAMBIO_ESTADO → no persiste OBSERVACION, ticket permanece en APROBADO
12. Ticket de otro tenant → `TicketNoEncontradoError` 404

**Mocking:** `ITicketRepository`, `IEstadoRepository`, `IOperacionTicketRepository`,
`ITipoOperacionRepository`, `ITenantTransactionRunner` (spy en `run()`).

**Ref spec:** Req Observaciones del técnico (todos los scenarios), ADR-2

---

### [x] P2.T6 · GREEN · Crear CrearObservacionUseCase (archivo nuevo)

**Tipo:** GREEN
**Depende de:** P2.T5

| Archivo | Acción |
|---------|--------|
| `backend/src/tickets/application/use-cases/crear-observacion.use-case.ts` | Crear (NUEVO) |

**Contrato:**

```ts
export interface CrearObservacionDto {
  ticketId: string;
  texto: string;
  autorId: string;
  estadoDestinoCodigo?: 'EN_PROGRESO' | 'RESUELTO' | 'SUSPENDIDO' | 'SIN_SOLUCION';
  /** Requerido solo cuando estadoDestinoCodigo === 'RESUELTO'. */
  fechaCierre?: Date;
}

export class CrearObservacionUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly estadoRepo: IEstadoRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}
  async execute(dto: CrearObservacionDto): Promise<Result<TicketEntity, DomainError>>
}
```

**Flujo interno (dentro de `txRunner.run()`):**

1. Cargar ticket → 404 si no existe.
2. Cargar estado actual del ticket.
3. Validar no-terminal → `ObservacionNoPermitidaError` 422.
4. Resolver `tipoOperacionId` de `OBSERVACION` → 500 si no existe en catálogo.
5. Crear `OperacionTicketEntity` tipo `OBSERVACION` (`estadoAnteriorId=null`, `estadoNuevoId=null`,
   `descripcion=dto.texto`).
6. Si estado actual es `APROBADO`:
   - Resolver estado destino: `dto.estadoDestinoCodigo ?? 'EN_PROGRESO'`.
   - Validar arco via `BaseTicketStateMachine` → `TransicionInvalidaError` 422 si inválido.
   - Si destino es `RESUELTO`: validar `dto.fechaCierre` presente → `FechaResolucionRequeridaError` si falta.
     Llamar `ticket.setFechaResolucion(dto.fechaCierre)`. // TODO-PR3: rename a setFechaCierre
   - Si destino es `SIN_SOLUCION`: `ticket.setFechaResolucion(new Date())`. // TODO-PR3: rename
   - `ticket.updateEstado(estadoDestino.id)`.
   - Resolver `tipoOperacionId` de `CAMBIO_ESTADO`.
   - Crear segunda `OperacionTicketEntity` tipo `CAMBIO_ESTADO` con `estadoAnteriorId/estadoNuevoId`.
7. Persistir dentro de la misma transacción: `ticketRepo.save(ticket)` + `operacionRepo.save(obs)`
   + (si aplica) `operacionRepo.save(cambioEstado)`.
8. `Result.ok(ticket)`.

**Nota importante ADR-2:** NO llamar a `TransicionarEstadoUseCase` desde aquí (evitar `txRunner`
anidado). La lógica de transición se reproduce inline dentro del mismo `txRunner.run()`.

**Ref spec:** ADR-2, Req Observaciones

---

### [x] P2.T7 · RED · Tests del endpoint POST /tickets/:id/observaciones

**Tipo:** RED
**Depende de:** P2.T3

| Archivo | Acción |
|---------|--------|
| `backend/src/tickets/interface/controllers/tickets.controller.spec.ts` | Agregar tests |

**Scenarios:**

- `POST /tickets/:id/observaciones` sin JWT → 401
- Sin permiso `ticket:observar` → 403
- `contenido` vacío → 422
- Caso feliz (ticket APROBADO) → 201 + `TicketResponseDto`
- Estado terminal → 422 (propagado desde use case)

---

### [x] P2.T8 · GREEN · Agregar endpoint POST /tickets/:id/observaciones al controller

**Tipo:** GREEN
**Depende de:** P2.T6, P2.T7

| Archivo | Acción |
|---------|--------|
| `backend/src/tickets/interface/controllers/tickets.controller.ts` | Modificar |

**Cambios:**

```ts
@Post(':id/observaciones')
@HttpCode(HttpStatus.CREATED)
@RequirePermissions('ticket:observar')
async crearObservacion(
  @Param('id') id: string,
  @Body() dto: CrearObservacionHttpDto,
  @CurrentUser() user: JwtPayload,
): Promise<CrearObservacionResponseDto>
```

Mapeo del body → `CrearObservacionDto`. Validar `contenido` no vacío (422 si lo está).
Parsear `dto.fechaCierre` → `Date` si viene; pasar a use case como `fechaCierre`.
Mapear errores: `TicketNoEncontradoError` → 404; `ObservacionNoPermitidaError` → 422;
`TransicionInvalidaError` → 422; `FechaResolucionRequeridaError` → 422 (hasta PR3).

**Ref spec:** ADR-7, Req Observaciones

---

### [x] P2.T9 · CONFIG · Registrar CrearObservacionUseCase en tickets.module.ts

**Tipo:** CONFIG
**Depende de:** P2.T6, P2.T8

| Archivo | Acción |
|---------|--------|
| `backend/src/tickets/tickets.module.ts` | Modificar |

Provider de `CrearObservacionUseCase` inyectando:
`TICKET_REPOSITORY`, `ESTADO_REPOSITORY`, `OPERACION_TICKET_REPOSITORY`,
`TIPO_OPERACION_REPOSITORY`, `TENANT_TRANSACTION_RUNNER`.
Agregar al array `exports` del módulo si se usa en otros módulos.

---

## PR3 — Guard authz + seed permisos master + fechaCierre rename + dead code

**Base branch:** `pr2` (target de PR2)
**Target:** `pr2`
**Líneas estimadas:** ~290–350 (riesgo: Medio)

### Riesgos de PR3

- **R1 (contrato inter-change):** los códigos de permiso `b0..014-017` deben coincidir
  EXACTO con los que Change B referenciará. No renombrar.
- **R4 (bug activo):** `PATCH /tickets/:id/estado` en línea 336 no tiene `@RequirePermissions`
  — este PR cierra el fallo de menor privilegio (CONSTITUCIÓN §7).
- **R5 (propagación):** `TicketResponseDto` expone `fechaResolucion` → el frontend lo consume.
  Coordinar el rename con el equipo frontend antes de desplegar.
- El rename de `setFechaResolucion` → `setFechaCierre` propaga a `crear-observacion.use-case.ts`
  (introducido en PR2) y a `transicionar-estado.use-case.ts`.

---

### P3.T1 · SYNC · Sincronizar spec: fechaCierre RESUELTO es input requerido

**Tipo:** SYNC (corrección de spec)
**Secuencia:** primero — sirve de referencia para el resto del slice

| Archivo | Acción |
|---------|--------|
| `openspec/changes/tickets-maquina-estados-observaciones/specs/tickets-core/spec.md` | Corregir |

**Correcciones:**

1. Línea ~65–67 (sección "Delta: Tabla tickets"): reemplazar "es seteada automáticamente
   a `now()::date` ... No es un campo aceptado en ningún body" por:
   - RESUELTO: `fechaCierre` es REQUERIDA del caller en `PATCH /tickets/:id/estado`
     (campo `fechaCierre` en body, formato ISO). Faltante → 422.
   - SIN_SOLUCION y RECHAZADO: `fechaCierre` es seteada a `now()::date` por el use case.
     El caller NO la provee; si llega en el body es ignorada silenciosamente.
2. Sección "Enmienda: fechaResolucion supersedida por fechaCierre" (ítem 2 y 3): aclarar
   que para RESUELTO el body SÍ acepta `fechaCierre` (requerido); para los otros dos no.
3. Scenario "Campo fechaCierre en body es ignorado silenciosamente": acotar que aplica
   solo cuando el destino es SIN_SOLUCION o RECHAZADO (no RESUELTO).
4. Scenarios de auto-transición via observación: cuando destino es RESUELTO, `fechaCierre`
   es requerida en el body de `POST /observaciones`.

**Origen de la corrección:** override del orquestador, coherente con ADR-6 del design.

---

### P3.T2 · RED · Actualizar ticket.entity.spec.ts: rename fechaResolucion → fechaCierre

**Tipo:** RED
**Depende de:** P3.T1

| Archivo | Acción |
|---------|--------|
| `backend/src/tickets/domain/entities/ticket.entity.spec.ts` | Modificar |

- Renombrar referencias a `fechaResolucion` → `fechaCierre` en todos los tests.
- Agregar tests para `setFechaCierre(fecha)` y el getter `fechaCierre`.
- Los tests van a RED porque la entidad todavía usa `fechaResolucion`.

---

### P3.T3 · GREEN · TicketEntity: rename fechaResolucion → fechaCierre

**Tipo:** GREEN
**Depende de:** P3.T2

| Archivo | Acción |
|---------|--------|
| `backend/src/tickets/domain/entities/ticket.entity.ts` | Modificar |

**Cambios:**

1. `TicketProps.fechaResolucion` → `TicketProps.fechaCierre: Date | null`
2. Getter `get fechaResolucion()` → `get fechaCierre(): Date | null`
3. `setFechaResolucion(fecha)` → `setFechaCierre(fecha: Date | null): void`
4. Actualizar JSDoc en `TicketProps` y en el método.

**Nota:** este cambio cascadea a `transicionar-estado.use-case.ts`, `crear-observacion.use-case.ts`
y `ticket.mapper.ts` — cubiertos en tareas siguientes.

---

### P3.T4 · RED · Actualizar transicionar-estado.use-case.spec.ts

**Tipo:** RED
**Depende de:** P3.T3

| Archivo | Acción |
|---------|--------|
| `backend/src/tickets/application/use-cases/transicionar-estado.use-case.spec.ts` | Modificar |

**Cambios:**

- Renombrar `fechaResolucion` → `fechaCierre` en DTO y assertions.
- Agregar test: transición a `SIN_SOLUCION` → `ticket.setFechaCierre` llamado con `now()`.
- Agregar test: transición a `RECHAZADO` → `ticket.setFechaCierre` llamado con `now()`.
- Eliminar test de reapertura `RESUELTO → EN_PROGRESO` (ya no existe ese arco).
- Renombrar referencia a `FechaResolucionRequeridaError` → `FechaCierreRequeridaError`.

---

### P3.T5 · GREEN · Actualizar TransicionarEstadoUseCase: fechaCierre + auto-now + dead code

**Tipo:** GREEN
**Depende de:** P3.T4

| Archivo | Acción |
|---------|--------|
| `backend/src/tickets/application/use-cases/transicionar-estado.use-case.ts` | Modificar |

**Cambios:**

1. `TransicionarEstadoDto.fechaResolucion` → `TransicionarEstadoDto.fechaCierre?: Date`.
2. Bloque auto-set: reemplazar el bloque existente (líneas ~142–157):
   ```ts
   const TERMINAL_STATES_AUTO_NOW = new Set(['SIN_SOLUCION', 'RECHAZADO']);
   if (estadoNuevo.codigo === 'RESUELTO') {
     if (!dto.fechaCierre) return Result.fail(new FechaCierreRequeridaError());
     ticket.setFechaCierre(dto.fechaCierre);
   } else if (TERMINAL_STATES_AUTO_NOW.has(estadoNuevo.codigo)) {
     ticket.setFechaCierre(new Date()); // now()::date servidor
   }
   // RESUELTO como ORIGEN ya no existe → rama de reapertura ELIMINADA (dead code)
   ```
3. Eliminar el check de `estadoActual.codigo === 'RESUELTO' → setFechaCierre(null)` (dead code).
4. Actualizar imports: `FechaResolucionRequeridaError` → `FechaCierreRequeridaError`.
5. Actualizar JSDoc del DTO y del método.

**Ref spec:** Req fechaCierre en los 3 terminales, ADR-6

---

### P3.T6 · GREEN · Actualizar tickets.errors.ts: FechaCierreRequeridaError + mensaje TicketNoEditable

**Tipo:** GREEN
**Depende de:** P3.T5

| Archivo | Acción |
|---------|--------|
| `backend/src/tickets/domain/errors/tickets.errors.ts` | Modificar |

1. Renombrar `FechaResolucionRequeridaError` → `FechaCierreRequeridaError` (clase + código).
2. `FechaResolucionRequeridaError` puede quedarse como alias deprecado o eliminarse
   (si no hay referencias externas fuera del módulo de tickets — verificar).

---

### P3.T7 · GREEN · Propagación del rename: DTOs + mapper + crear-observacion + frontend

**Tipo:** GREEN
**Depende de:** P3.T3, P3.T6
**Puede paralelo con:** P3.T8 (archivos distintos)

| Archivo | Acción |
|---------|--------|
| `backend/src/tickets/interface/dtos/tickets.dto.ts` | Modificar |
| `backend/src/tickets/infrastructure/persistence/prisma/ticket.mapper.ts` | Modificar |
| `backend/src/tickets/application/use-cases/crear-observacion.use-case.ts` | Modificar |
| `frontend/src/` (tipos de Ticket, mappers de respuesta) | Modificar |

**Cambios:**

1. `TransicionarEstadoHttpDto.fechaResolucion` → `fechaCierre`; actualizar validación en el controller.
2. `TicketResponseDto.fechaResolucion` → `fechaCierre: string | null`.
3. `ticket.mapper.ts`: `mapper.fechaResolucion` → `mapper.fechaCierre` (campo Prisma → DTO).
4. `crear-observacion.use-case.ts`: reemplazar `ticket.setFechaResolucion(...)` →
   `ticket.setFechaCierre(...)` (eliminar comentarios `// TODO-PR3`).
5. Frontend: renombrar campo `fechaResolucion` en las interfaces TypeScript de respuesta de
   tickets y en los componentes de display que lo referencien.

---

### P3.T8 · RED · Crear spec de TransicionEstadoPermisosGuard

**Tipo:** RED
**Puede paralelo con:** P3.T3–P3.T7

| Archivo | Acción |
|---------|--------|
| `backend/src/auth/infrastructure/guards/transicion-estado-permisos.guard.spec.ts` | Crear (NUEVO) |

**Scenarios mínimos:**

- `nuevoEstadoCodigo: 'APROBADO'` → requiere `ticket:aprobar`; sin él → 403
- `nuevoEstadoCodigo: 'RECHAZADO'` → requiere `ticket:rechazar`; sin él → 403
- `nuevoEstadoCodigo: 'EN_PROGRESO'` → requiere `ticket:transicionar`; sin él → 403
- `nuevoEstadoCodigo: 'SUSPENDIDO'` → requiere `ticket:transicionar`
- Usuario con el permiso correcto → `canActivate()` retorna `true`
- Body vacío o sin `nuevoEstadoCodigo` → `canActivate()` retorna `false` (no ejecuta use case)

**Ref spec:** Req Autorización granular por arco (tickets-core), ADR-4

---

### P3.T9 · GREEN · Crear TransicionEstadoPermisosGuard

**Tipo:** GREEN
**Depende de:** P3.T8

| Archivo | Acción |
|---------|--------|
| `backend/src/auth/infrastructure/guards/transicion-estado-permisos.guard.ts` | Crear (NUEVO) |

**Lógica:**

```ts
@Injectable()
export class TransicionEstadoPermisosGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: JwtPayload = request.user;
    const nuevoEstadoCodigo: string = request.body?.nuevoEstadoCodigo;

    const permiso = nuevoEstadoCodigo === 'APROBADO'  ? 'ticket:aprobar'
                  : nuevoEstadoCodigo === 'RECHAZADO' ? 'ticket:rechazar'
                  :                                     'ticket:transicionar';

    return user?.permisos?.includes(permiso) ?? false;
  }
}
```

Añadir al barrel de guards (`backend/src/auth/infrastructure/guards/index.ts` si existe).

**Ref spec:** ADR-4

---

### P3.T10 · GREEN · tickets.controller.ts: wiring del guard + cleanup de fechaResolucion

**Tipo:** GREEN
**Depende de:** P3.T7, P3.T9

| Archivo | Acción |
|---------|--------|
| `backend/src/tickets/interface/controllers/tickets.controller.ts` | Modificar |

**Cambios:**

1. `PATCH :id/estado`: agregar `@UseGuards(TransicionEstadoPermisosGuard)` ANTES del handler
   (el guard se ejecuta después de `JwtAuthGuard` y `TenantGuard`).
2. Reemplazar el bloque de validación de `fechaResolucion` (líneas ~344–359) por validación
   de `fechaCierre` para destino `RESUELTO`:
   ```ts
   let fechaCierre: Date | undefined;
   if (dto.nuevoEstadoCodigo === 'RESUELTO') {
     if (!dto.fechaCierre) throw new UnprocessableEntityException('fechaCierre es requerida al transicionar a RESUELTO.');
     const parsed = new Date(dto.fechaCierre);
     if (isNaN(parsed.getTime())) throw new UnprocessableEntityException('fechaCierre: formato inválido (ISO YYYY-MM-DD esperado).');
     fechaCierre = parsed;
   }
   ```
3. Actualizar mapeo del error `FechaResolucionRequeridaError` → `FechaCierreRequeridaError`.
4. Agregar `tickets.controller.spec.ts` tests para 403 con y sin `TransicionEstadoPermisosGuard`.

**Cierra:** bug activo en línea 336 (CONSTITUCIÓN §7 — menor privilegio).

---

### P3.T11 · INFRA · Migración tenant: RENAME fecha_resolucion → fecha_cierre (idempotente)

**Tipo:** INFRA
**Puede paralelo con:** P3.T8–P3.T10

| Archivo | Acción |
|---------|--------|
| `backend/prisma_tenant/migrations/20260629030000_rename_fecha_resolucion_fecha_cierre/migration.sql` | Crear |

```sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'tickets'
      AND column_name = 'fecha_resolucion'
  ) THEN
    ALTER TABLE tickets RENAME COLUMN fecha_resolucion TO fecha_cierre;
  END IF;
END
$$;
```

**IMPORTANTE:** Ejecutar ANTES de desplegar código que referencie `fecha_cierre`.
Verificar post-migración que `fecha_cierre` existe en cada tenant DB.

**Ref spec:** Req Migración rename fecha_resolucion → fecha_cierre, ADR-6

---

### P3.T12 · INFRA · Migración master: 4 permisos granulares + siembra mínima roles_permisos

**Tipo:** INFRA
**Puede paralelo con:** P3.T11

| Archivo | Acción |
|---------|--------|
| `backend/prisma_master/migrations/20260629040000_seed_rbac_ticket_estados/migration.sql` | Crear |

**Parte 1 — 4 permisos (idempotente):**

```sql
INSERT INTO permisos (id, codigo, descripcion) VALUES
  ('b0000000-0000-4000-b000-000000000014', 'ticket:aprobar',       'Aprobar un ticket (ABIERTO → APROBADO)'),
  ('b0000000-0000-4000-b000-000000000015', 'ticket:rechazar',      'Rechazar un ticket (ABIERTO → RECHAZADO)'),
  ('b0000000-0000-4000-b000-000000000016', 'ticket:transicionar',  'Transicionar tickets (arcos técnicos)'),
  ('b0000000-0000-4000-b000-000000000017', 'ticket:observar',      'Crear observaciones técnicas sobre tickets')
ON CONFLICT (codigo) DO NOTHING;
```

**Parte 2 — siembra mínima provisional roles_permisos (idempotente):**

```sql
-- Helper subquery: resolver ids por código para evitar hardcodear UUIDs de roles
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE (r.codigo, p.codigo) IN (
  ('ADMIN',              'ticket:aprobar'),
  ('ADMIN',              'ticket:rechazar'),
  ('ADMIN',              'ticket:transicionar'),
  ('ADMIN',              'ticket:observar'),
  ('APROBADOR_COMPRAS',  'ticket:aprobar'),
  ('APROBADOR_COMPRAS',  'ticket:rechazar'),
  ('SOPORTE_IT',         'ticket:transicionar'),
  ('SOPORTE_IT',         'ticket:observar'),
  ('MANTENIMIENTO',      'ticket:transicionar'),
  ('MANTENIMIENTO',      'ticket:observar')
)
ON CONFLICT (rol_id, permiso_id) DO NOTHING;
```

**Riesgo R1:** los UUIDs y códigos de permiso definidos aquí son CONTRATO FIJO con Change B.
Change B MUST referenciar `ticket:aprobar/rechazar/transicionar/observar` por estos mismos códigos.

**Ref spec:** Delta permisos (auth-rbac), ADR-5

---

## Resumen de tareas por PR

| PR | Tareas | Líneas est. | Riesgo |
|----|--------|-------------|--------|
| PR1 | 9 (T1–T9) | 300–360 | Medio (spec rewrite ~140 líneas) |
| PR2 | 9 (T1–T9) | 280–340 | Medio |
| PR3 | 12 (T1–T12) | 290–350 | Medio |
| **Total** | **30** | **~870–1050** | — |

---

## Orden global de aplicación (sdd-apply)

Las tareas dentro de cada PR son MAYORMENTE secuenciales (RED→GREEN).
Las excepciones paralelas están marcadas "Puede paralelo con" en cada tarea.

```
PR1: T1→T2→T3→T4→T5→T6→T7  (+ T8, T9 en paralelo en cualquier punto)
PR2: T1,T2 paralelo → T3,T4 paralelo → T5→T6 → T7→T8 → T9
PR3: T1→T2→T3→T4→T5→T6→T7  (+ T8→T9 en paralelo) → T10 → T11,T12 paralelo
```

---

## Review Workload Forecast

| Métrica | PR1 | PR2 | PR3 |
|---------|-----|-----|-----|
| Líneas estimadas (add+del) | 300–360 | 280–340 | 290–350 |
| 400-line budget risk | Medio | Bajo-Medio | Bajo-Medio |
| Archivos nuevos | 1 (migration SQL) | 3 (use case + spec + migration SQL) | 3 (guard + spec + 2 migrations SQL) |
| Complejidad de review | Media (spec rewrite) | Alta (use case transaccional) | Alta (guard authz + rename masivo) |
| **Chained PRs recomendado** | **Sí** | **Sí** | **Sí** |
| **Decision needed before apply** | **No** (auto-chain cached) | **No** | **No** |

**Bottleneck principal:** PR1 es la base de la cadena. No puede paralelizarse con PR2.
PR3 tiene el mayor número de archivos tocados (~12) pero los cambios son mayormente mecánicos
(rename + wiring), lo que los hace rápidos de revisar individualmente.

**Riesgo de acoplamiento inter-change:** los UUIDs de permiso en P3.T12 son contrato
fijo con Change B. Coordinar antes de desplegar Change A en prod si Change B ya está en curso.
