# Spec: Reportes

> Capability: `reportes` (NEW)
> Schema: TENANT (lectura sobre `tickets`, `estados`, `tipos_ticket`, `ciclos_cliente`)
> Stack: NestJS backend (Clean Architecture) — solo lectura, sin mutations
> Introducido en change: `admin-general` (2026-06-30)

## Contexto

La capability `reportes` provee 4 agregaciones de solo lectura sobre la tabla `tickets` del tenant
DB. Las agregaciones siempre están acotadas a un par `cliente + ciclo`. En v1 la salida es
on-screen únicamente — no hay export PDF/XLSX (out of scope).

**Niveles de acceso:**
- Operador (`is_global_admin = true`): accede a reportes de cualquier tenant via `X-Tenant-Id`.
- Admin-cliente (rol `ADMINISTRADOR`): accede solo a reportes de su propio tenant.
- Cualquier otro rol: HTTP 403.

**Aislamiento de tenant (invariante absoluta):**
- Toda query de agregación MUST ejecutarse exclusivamente contra la DB tenant resuelta por
  `TenantContext` (via `TenantGuard`).
- MUST NOT realizar ninguna query que involucre datos de múltiples tenants simultáneamente.
- MUST NOT hacer JOIN a `master.usuarios` dentro de la query tenant (cross-DB imposible en
  Postgres): los nombres de usuario se enriquecen en la capa de aplicación con queries
  separadas, o se retornan solo los UUIDs con el frontend resolviendo el display.

**Ciclo default:** cuando no se provee el query param `cicloId`, el reporte MUST usar el ciclo
activo del tenant resuelto (`ciclos_cliente.activo = TRUE`). Si no existe ciclo activo,
MUST devolver HTTP 422.

**Tickets excluidos siempre:** tickets con `deleted_at IS NOT NULL` (soft-deleted) MUST ser
excluidos de todas las agregaciones.

## API Endpoints

| Método | Path | Descripción |
|--------|------|-------------|
| `GET` | `/reportes/tickets-por-usuario` | Tickets agrupados por asignado |
| `GET` | `/reportes/tickets-por-tipo` | Tickets agrupados por tipo de flujo |
| `GET` | `/reportes/tickets-por-estado` | Tickets agrupados por estado (incl. terminales) |
| `GET` | `/reportes/tiempo-resolucion` | Tiempo de resolución promedio |

**Query param compartido:** `cicloId` (UUID, opcional). Omitir = ciclo activo del tenant.

**Guards compartidos:** `JwtAuthGuard` + rol `ADMINISTRADOR` o `is_global_admin = true`.

---

## Requirements

### Requirement: ReporteTicketsPorUsuario — tickets agrupados por asignado

`GET /reportes/tickets-por-usuario` cuenta los tickets del tenant+ciclo agrupados por `asignado_id`.
Incluye tickets en cualquier estado que no estén soft-deleted.

#### Scenario: Admin-cliente obtiene conteo de tickets por asignado de su tenant

**Given** un usuario con rol `ADMINISTRADOR` para tenant A
**And** tenant A tiene en el ciclo activo C1: 4 tickets asignados a usuario X, 3 a usuario Y, 3 a usuario Z
**And** ningún cicloId es provisto (usa ciclo activo)
**When** llama a `GET /reportes/tickets-por-usuario`
**Then** MUST devolver HTTP 200
**And** la respuesta MUST contener una entrada por asignado con `{ asignadoId, totalTickets }`
**And** los totales MUST sumar 10
**And** MUST solo incluir tickets WHERE `ciclo_id = C1.id AND deleted_at IS NULL`

#### Scenario: cicloId filtra a ese ciclo específico

**Given** un usuario autorizado para tenant A
**And** tenant A tiene ciclos C1 (activo) y C2 (inactivo), cada uno con distribuciones distintas
**When** llama a `GET /reportes/tickets-por-usuario?cicloId={C2.id}`
**Then** MUST devolver agregaciones acotadas exclusivamente al ciclo C2
**And** MUST NOT incluir tickets de C1 ni de ningún otro ciclo

#### Scenario: Tickets sin asignado son manejados sin error

**Given** tenant A tiene tickets con `asignado_id IS NULL` en el ciclo activo
**When** un usuario autorizado llama a `GET /reportes/tickets-por-usuario`
**Then** MUST NOT producir ningún error de runtime
**And** los tickets sin asignar MUST ser excluidos o agrupados bajo
  `{ asignadoId: null, totalTickets: N }` de forma consistente

#### Scenario: Operador obtiene reporte de tenant B via X-Tenant-Id

**Given** un usuario con `is_global_admin = true`
**And** la request incluye `X-Tenant-Id: {tenantB_cliente_id}`
**When** llama a `GET /reportes/tickets-por-usuario`
**Then** la query MUST ejecutarse exclusivamente contra la DB de tenant B
**And** MUST NOT acceder a datos de tenant A ni de ningún otro tenant

#### Scenario: Aislamiento de tenant — el reporte nunca mezcla datos de tenants distintos

**Given** tenant A tiene 5 tickets asignados al usuario M
**And** tenant B tiene 3 tickets asignados al usuario N
**When** un admin de tenant A llama a `GET /reportes/tickets-por-usuario`
**Then** MUST devolver datos solo de tenant A (5 tickets para usuario M)
**And** MUST NOT incluir al usuario N ni datos de tenant B en ningún campo de la respuesta

#### Scenario: Usuario con rol TECNICO es rechazado con 403

**Given** un usuario con rol `TECNICO` (no es ADMINISTRADOR, no es global admin)
**When** llama a `GET /reportes/tickets-por-usuario`
**Then** MUST devolver HTTP 403
**And** MUST NOT ejecutar ninguna query de agregación

#### Scenario: Sin ciclo activo y sin cicloId → 422

**Given** el tenant resuelto no tiene ningún ciclo con `activo = TRUE`
**And** la request no incluye el param `cicloId`
**When** un admin llama a `GET /reportes/tickets-por-usuario`
**Then** MUST devolver HTTP 422
**And** el error MUST indicar que no hay ciclo activo y que debe especificarse uno via `cicloId`

#### Scenario: cicloId de otro tenant devuelve 404 o array vacío sin cruzar datos

**Given** un admin de tenant A provee `cicloId` de un ciclo que pertenece a tenant B
**When** llama a `GET /reportes/tickets-por-usuario?cicloId={cicloB.id}`
**Then** MUST devolver HTTP 404 (ciclo no existe en el contexto de tenant A)
**Or** si el UUID no matchea en el tenant A, MUST devolver `{ "data": [] }` vacío
**And** MUST NOT devolver datos de tenant B bajo ninguna circunstancia

---

### Requirement: ReporteTicketsPorTipo — tickets agrupados por tipo de flujo

`GET /reportes/tickets-por-tipo` cuenta tickets del tenant+ciclo agrupados por `tipo_id`
(SOPORTE, COMPRAS, EDILICIA). Los tres tipos MUST estar representados en la respuesta,
incluso con conteo cero.

#### Scenario: Admin-cliente obtiene conteo por tipo de su tenant

**Given** un usuario con rol `ADMINISTRADOR` para tenant A, ciclo activo C1
**And** C1 tiene: 20 tickets SOPORTE, 5 COMPRAS, 10 EDILICIA (todos `deleted_at IS NULL`)
**When** llama a `GET /reportes/tickets-por-tipo`
**Then** MUST devolver HTTP 200
**And** la respuesta MUST contener una entrada por tipo:
  `{ tipo: 'SOPORTE', totalTickets: 20 }`,
  `{ tipo: 'COMPRAS', totalTickets: 5 }`,
  `{ tipo: 'EDILICIA', totalTickets: 10 }`
**And** MUST NOT incluir tickets soft-deleted

#### Scenario: Tipos con cero tickets están presentes en la respuesta

**Given** tenant A tiene 0 tickets EDILICIA en el ciclo activo
**When** un usuario autorizado llama a `GET /reportes/tickets-por-tipo`
**Then** la respuesta MUST incluir `{ tipo: 'EDILICIA', totalTickets: 0 }`
**And** MUST NOT omitir el tipo por tener conteo cero

#### Scenario: cicloId filtra la agregación por tipo

**Given** tenant A tiene distribuciones distintas en ciclos C1 y C2
**When** un usuario autorizado llama a `GET /reportes/tickets-por-tipo?cicloId={C2.id}`
**Then** MUST agregar solo los tickets del ciclo C2

#### Scenario: Aislamiento de tenant — conteo de tipos no mezcla tenants

**Given** tenant A tiene 20 SOPORTE tickets y tenant B tiene 50 SOPORTE tickets
**When** el admin de tenant A llama a `GET /reportes/tickets-por-tipo`
**Then** MUST devolver `{ tipo: 'SOPORTE', totalTickets: 20 }` (no 70)
**And** MUST NOT acceder a la DB de tenant B

---

### Requirement: ReporteTicketsPorEstado — tickets agrupados por estado (incl. terminales)

`GET /reportes/tickets-por-estado` cuenta tickets del tenant+ciclo agrupados por `estado_id`.
MUST incluir estados terminales (RESUELTO, SIN_SOLUCION, RECHAZADO). Soft-deleted excluidos.
Los 10 estados del catálogo MUST estar representados en la respuesta (con cero si no hay tickets).

#### Scenario: Admin-cliente obtiene conteo por estado incluyendo terminales

**Given** un usuario con rol `ADMINISTRADOR`, ciclo activo C1
**And** C1 tiene: ABIERTO (3), EN_PROGRESO (2), RESUELTO (5), RECHAZADO (1), demás en 0
**When** llama a `GET /reportes/tickets-por-estado`
**Then** MUST devolver HTTP 200
**And** MUST incluir todos los estados con su conteo:
  `RESUELTO: 5`, `RECHAZADO: 1`, `EN_PROGRESO: 2`, `ABIERTO: 3`, y los demás en 0
**And** MUST NOT excluir los estados terminales (RESUELTO, SIN_SOLUCION, RECHAZADO)

#### Scenario: Estados con cero tickets están presentes en la respuesta

**Given** el ciclo activo no tiene tickets en estado `SUSPENDIDO`
**When** un usuario autorizado llama a `GET /reportes/tickets-por-estado`
**Then** MUST incluir `{ estado: 'SUSPENDIDO', totalTickets: 0 }` en la respuesta
**And** MUST NOT omitir ningún estado del catálogo

#### Scenario: Tickets soft-deleted son excluidos del conteo por estado

**Given** tenant A tiene 5 tickets ABIERTO en ciclo C1, 2 de los cuales tienen `deleted_at IS NOT NULL`
**When** un admin llama a `GET /reportes/tickets-por-estado`
**Then** MUST devolver `{ estado: 'ABIERTO', totalTickets: 3 }` (soft-deleted excluidos)

#### Scenario: cicloId filtra la agregación por estado

**Given** diferentes distribuciones de estado entre ciclos C1 y C2
**When** un usuario autorizado llama a `GET /reportes/tickets-por-estado?cicloId={C2.id}`
**Then** MUST agregar solo los tickets del ciclo C2

#### Scenario: Aislamiento de tenant — conteo de estados no mezcla tenants

**Given** tenant A tiene 10 ABIERTO y tenant B tiene 100 ABIERTO
**When** admin de tenant A llama a `GET /reportes/tickets-por-estado`
**Then** MUST devolver `{ estado: 'ABIERTO', totalTickets: 10 }`
**And** MUST NOT acceder a la DB de tenant B

---

### Requirement: ReporteTiempoResolucion — tiempo promedio de resolución

`GET /reportes/tiempo-resolucion` calcula el tiempo promedio en días entre `tickets.created_at` y
`tickets.fecha_cierre` para los tickets en estado terminal RESUELTO o SIN_SOLUCION del tenant+ciclo.

Los tickets en estado RECHAZADO MUST ser excluidos (nunca fueron trabajados, distorsionan el promedio).
Solo se incluyen tickets con `fecha_cierre IS NOT NULL`.

#### Scenario: Admin-cliente obtiene el tiempo promedio de resolución

**Given** un usuario con rol `ADMINISTRADOR`, ciclo activo C1
**And** C1 tiene 3 tickets RESUELTOS con tiempos de resolución: 2, 4 y 6 días
**When** llama a `GET /reportes/tiempo-resolucion`
**Then** MUST devolver HTTP 200
**And** la respuesta MUST incluir `{ promedioDias: 4.0, totalResueltos: 3 }`
**And** MUST NOT incluir tickets RECHAZADOS en el cálculo

#### Scenario: Sin tickets resueltos devuelve promedio null, no error

**Given** el ciclo activo de tenant A no tiene tickets en estado RESUELTO ni SIN_SOLUCION
**When** un admin llama a `GET /reportes/tiempo-resolucion`
**Then** MUST devolver HTTP 200
**And** la respuesta MUST incluir `{ promedioDias: null, totalResueltos: 0 }`
**And** MUST NOT devolver HTTP 404 ni HTTP 422
**And** MUST NOT producir un error de división por cero

#### Scenario: Solo se incluyen tickets con fecha_cierre no nula

**Given** 5 tickets están en estado RESUELTO pero 2 tienen `fecha_cierre IS NULL` (inconsistencia de datos)
**When** el reporte calcula el promedio
**Then** MUST incluir únicamente los 3 tickets con `fecha_cierre IS NOT NULL` en el cálculo
**And** `totalResueltos` MUST ser 3 (no 5)
**And** MUST NOT producir error de runtime por valores nulos en el promedio

#### Scenario: cicloId filtra el cálculo de tiempo promedio

**Given** diferentes distribuciones de resolución entre ciclos C1 y C2
**When** un usuario autorizado llama a `GET /reportes/tiempo-resolucion?cicloId={C2.id}`
**Then** MUST calcular el promedio solo con tickets del ciclo C2

#### Scenario: Aislamiento de tenant — el promedio nunca mezcla datos de tenants

**Given** tenant A tiene 3 tickets resueltos con promedio 2 días
**And** tenant B tiene 10 tickets resueltos con promedio 10 días
**When** admin de tenant A llama a `GET /reportes/tiempo-resolucion`
**Then** MUST devolver `{ promedioDias: 2.0, totalResueltos: 3 }`
**And** MUST NOT acceder a la DB de tenant B

---

### Requirement: Todos los endpoints de reportes son estrictamente de solo lectura

Ningún endpoint de la capability `reportes` MUST modificar ningún dato. Las queries son SELECT
puras, sin side effects.

#### Scenario: GET /reportes/* nunca escribe en ninguna tabla

**Given** cualquier usuario autorizado llama a cualquier endpoint de reportes
**When** el use case se ejecuta
**Then** MUST NOT realizar ningún INSERT, UPDATE ni DELETE en ninguna tabla (master ni tenant)
**And** MUST NOT crear ninguna fila en `operaciones_ticket`
**And** el estado de la base de datos MUST ser idéntico antes y después de la request

#### Scenario: Error en el reporte devuelve 500 sin modificar datos

**Given** un error inesperado ocurre durante la agregación (ej. timeout de DB)
**When** el use case falla
**Then** MUST devolver HTTP 500
**And** MUST NOT haber modificado ningún dato antes del error
