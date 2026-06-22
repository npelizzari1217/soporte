# Spec: Reparaciones Edilicias

> Módulo: `reparaciones`  
> Schema: **TENANT** (una DB por cliente; sin columna `cliente_id`)  
> Flujos afectados: EDILICIA  
> Campos de auditoría y patrón de IDs: ver `specs/_shared-audit-pattern.md`  
> Máquina de estados base: ver `specs/tickets-core/spec.md`

## Contexto

Extensión del ticket unificado para el flujo de reparaciones edilicias (mantenimiento de
infraestructura física). El ticket edilicio incorpora:

- **Ubicación física** (jerarquía edificio → piso → sector/sala) donde ocurre la reparación.
- **Personal de mantenimiento asignado** (campo específico del flujo, distinto del `asignado_id`
  general del ticket que puede ser el supervisor).
- **Subtareas** que modelan los pasos concretos de la reparación.
- **Porcentaje de avance derivado** de las subtareas: la app lo recalcula en cada mutación
  de subtarea y lo persiste en columna `porcentaje_avance` (no trigger, no vista para operaciones).

**Guard de transición:** `EN_PROGRESO → RESUELTO` solo es válido cuando `porcentaje_avance = 100`
(todas las subtareas completadas). La máquina de estados consulta este valor como guarda.

---

## Modelo de datos

### Tabla `ubicaciones` (TENANT)

Jerarquía de locaciones físicas. Soporta árbol N niveles mediante self-reference `padre_id`.
Ejemplos: Edificio Central → Piso 3 → Sala de Servidores.

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `id` | `uuid` | NOT NULL | PK, UUIDv7 | — |
| `nombre` | `varchar(255)` | NOT NULL | — | Nombre del espacio físico |
| `descripcion` | `text` | NULL | — | Detalle adicional |
| `padre_id` | `uuid` | NULL | FK → `ubicaciones.id` | NULL = nodo raíz; NOT NULL = sub-ubicación |
| `activo` | `boolean` | NOT NULL | DEFAULT TRUE | Ubicaciones inactivas no disponibles para nuevos tickets |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `deleted_at` | `timestamptz` | NULL | — | Ver patrón compartido |

**Índices:**
- `INDEX (padre_id)` WHERE `padre_id IS NOT NULL` — hijos de un nodo
- `INDEX (activo)` WHERE `deleted_at IS NULL` — listado de ubicaciones activas

---

### Tabla `ticket_edilicia` (TENANT)

Datos específicos del flujo edilicio. Relación 1:1 con `tickets`.
`personal_asignado_id` es soft ref a `master.usuarios.id` (sin FK cross-DB); representa al
técnico de mantenimiento que ejecuta la reparación, que puede diferir del `tickets.asignado_id`
(supervisor o coordinador).

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `id` | `uuid` | NOT NULL | PK, UUIDv7 | — |
| `ticket_id` | `uuid` | NOT NULL | UNIQUE, FK → `tickets.id` | Relación 1:1 con ticket base |
| `ubicacion_id` | `uuid` | NOT NULL | FK → `ubicaciones.id` | Dónde ocurre la reparación |
| `personal_asignado_id` | `uuid` | NULL | — | Soft ref → `master.usuarios.id`; técnico ejecutor |
| `porcentaje_avance` | `numeric(5,2)` | NOT NULL | DEFAULT 0.00, CHECK (`porcentaje_avance >= 0 AND porcentaje_avance <= 100`) | Derivado de subtareas; recalculado por la app |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `deleted_at` | `timestamptz` | NULL | — | Ver patrón compartido |

**Índices:**
- `UNIQUE (ticket_id)` — garantiza relación 1:1
- `INDEX (ubicacion_id)` — tickets por ubicación
- `INDEX (porcentaje_avance)` — filtrado/orden por avance

---

### Tabla `subtareas_edilicia` (TENANT)

Pasos concretos de la reparación. El avance del ticket es una función de estas subtareas.
Cada cambio de subtarea (creación, completado, baja) dispara el recálculo de `porcentaje_avance`.

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `id` | `uuid` | NOT NULL | PK, UUIDv7 | — |
| `ticket_edilicia_id` | `uuid` | NOT NULL | FK → `ticket_edilicia.id` | Ticket edilicio al que pertenece |
| `descripcion` | `varchar(255)` | NOT NULL | — | Descripción de la subtarea |
| `completada` | `boolean` | NOT NULL | DEFAULT FALSE | FALSE = pendiente; TRUE = completada |
| `completada_en` | `timestamptz` | NULL | — | NULL si no completada; timestamp cuando se completó |
| `completada_por_id` | `uuid` | NULL | — | Soft ref → `master.usuarios.id`; quien la completó |
| `orden` | `integer` | NOT NULL | DEFAULT 0 | Orden de visualización en UI |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `deleted_at` | `timestamptz` | NULL | — | Ver patrón compartido |

**Índices:**
- `INDEX (ticket_edilicia_id)` — subtareas de un ticket (orden por `orden ASC, created_at ASC`)

---

## Fórmula de porcentaje de avance

```
porcentaje_avance = ROUND(
  (COUNT(*) FILTER (WHERE completada = TRUE AND deleted_at IS NULL) * 100.0)
  / NULLIF(COUNT(*) FILTER (WHERE deleted_at IS NULL), 0),
  2
)
```

**Casos especiales:**
- Sin subtareas activas (`deleted_at IS NULL`): `porcentaje_avance = 0.00`
- Todas completadas: `porcentaje_avance = 100.00`
- El valor MUST ser `numeric(5,2)` con dos decimales

---

## Máquina de estados — extensión EDILICIA

El flujo edilicio hereda las transiciones base más una restricción de guarda en `EN_PROGRESO → RESUELTO`.

**Modificación respecto a la base:**
```
EN_PROGRESO → RESUELTO  (solo cuando porcentaje_avance = 100.00)
                          bloqueada cuando porcentaje_avance < 100.00
```

Todas las demás transiciones de la base son válidas sin restricción adicional.

---

## Requirements

### Requirement: Satélite obligatorio para tickets de tipo EDILICIA

#### Scenario: Creación de ticket EDILICIA genera ticket_edilicia simultáneamente
**Given** un caso de uso crea un ticket con `tipo.codigo = 'EDILICIA'`  
**When** se ejecuta la transacción de creación  
**Then** MUST insertar la fila base en `tickets`  
**And** MUST insertar una fila en `ticket_edilicia` con `ticket_id`, `ubicacion_id` provisto, y `porcentaje_avance = 0.00`  
**And** ambas inserciones MUST ocurrir en la MISMA transacción  
**And** si cualquiera falla MUST hacer rollback completo

#### Scenario: ticket_edilicia requiere ubicacion_id válida
**Given** un caso de uso intenta crear un ticket edilicio con `ubicacion_id` apuntando a una ubicación con `deleted_at IS NOT NULL` o `activo = FALSE`  
**When** el caso de uso valida los datos  
**Then** MUST rechazar con HTTP 422 indicando que la ubicación no está disponible

---

### Requirement: Ubicaciones jerárquicas

#### Scenario: Ubicación puede tener padre (jerarquía)
**Given** existe una ubicación "Edificio Central" (raíz, `padre_id = NULL`)  
**When** se crea "Piso 3" con `padre_id` apuntando al ID de "Edificio Central"  
**Then** la inserción MUST ser exitosa  
**And** al consultar los hijos de "Edificio Central" MUST aparecer "Piso 3"

#### Scenario: No se puede referenciar ubicación eliminada como padre
**Given** una ubicación con `deleted_at IS NOT NULL` (soft-deleted)  
**When** se intenta crear una sub-ubicación con `padre_id` apuntando a ella  
**Then** el caso de uso MUST rechazar con HTTP 422  
**And** MUST NOT insertar la fila

#### Scenario: Soft delete en cascada lógica de ubicaciones
**Given** una ubicación con sub-ubicaciones activas  
**When** se aplica soft delete a la ubicación padre  
**Then** la app MUST aplicar soft delete a todas las sub-ubicaciones en la misma operación  
**And** todos los tickets edilicios que referencian esas ubicaciones SHOULD ser marcados como afectados (ej. via operaciones_ticket)

---

### Requirement: Avance derivado de subtareas

#### Scenario: porcentaje_avance recalculado tras crear subtarea
**Given** un ticket edilicio con 2 subtareas activas, ambas incompletas (`porcentaje_avance = 0.00`)  
**When** se crea una tercera subtarea  
**Then** el `porcentaje_avance` MUST permanecer `0.00` (0/3 completadas)  
**And** el recálculo MUST ocurrir en la MISMA transacción que la creación de la subtarea  
**And** MUST registrar una `operaciones_ticket` tipo `AVANCE_EDILICIO` con metadata `{ porcentaje_anterior: 0.00, porcentaje_nuevo: 0.00 }`

#### Scenario: porcentaje_avance recalculado tras completar subtarea
**Given** un ticket edilicio con 3 subtareas activas, 1 completada (`porcentaje_avance = 33.33`)  
**When** se completa la segunda subtarea  
**Then** `ticket_edilicia.porcentaje_avance` MUST ser actualizado a `66.67`  
**And** la subtarea MUST tener `completada = TRUE`, `completada_en = now()`, `completada_por_id` = UUID del usuario  
**And** todo MUST ocurrir en la MISMA transacción  
**And** MUST registrar `operaciones_ticket` tipo `AVANCE_EDILICIO` con metadata `{ porcentaje_anterior: 33.33, porcentaje_nuevo: 66.67 }`

#### Scenario: porcentaje_avance recalculado tras soft delete de subtarea
**Given** un ticket edilicio con 2 subtareas activas, 1 completada (`porcentaje_avance = 50.00`)  
**When** se aplica soft delete a la subtarea completada  
**Then** el recálculo MUST excluir filas con `deleted_at IS NOT NULL`  
**And** `porcentaje_avance` MUST actualizarse a `0.00` (0 completadas de 1 activa restante)  
**And** todo MUST ocurrir en la MISMA transacción

#### Scenario: Sin subtareas activas el avance es 0
**Given** un ticket edilicio sin subtareas (o todas soft-deleted)  
**When** se consulta `porcentaje_avance`  
**Then** MUST ser `0.00`  
**And** MUST NOT producir división por cero

#### Scenario: Todas las subtareas completadas resultan en 100
**Given** un ticket edilicio con N subtareas activas, todas con `completada = TRUE`  
**When** se consulta `porcentaje_avance`  
**Then** MUST ser `100.00` exacto

---

### Requirement: Guard de avance en transición a RESUELTO

#### Scenario: No se puede resolver un ticket edilicio con avance < 100
**Given** un ticket edilicio en estado `EN_PROGRESO` con `porcentaje_avance = 66.67`  
**When** se intenta transicionar a `RESUELTO`  
**Then** `EdiliciaStateMachine.puedeTransicionar('EN_PROGRESO', 'RESUELTO', ctx)` MUST retornar `false` porque `ctx.porcentaje_avance < 100`  
**And** el caso de uso MUST rechazar con HTTP 422 con mensaje que indique el avance insuficiente  
**And** MUST NOT modificar el estado del ticket

#### Scenario: Ticket edilicio puede resolverse solo con avance = 100
**Given** un ticket edilicio en estado `EN_PROGRESO` con `porcentaje_avance = 100.00`  
**When** se intenta transicionar a `RESUELTO`  
**Then** `EdiliciaStateMachine.puedeTransicionar('EN_PROGRESO', 'RESUELTO', ctx)` MUST retornar `true`  
**And** la transición MUST proceder normalmente con registro en `operaciones_ticket`

#### Scenario: Completar la última subtarea NO transiciona automáticamente el ticket
**Given** un ticket edilicio en estado `EN_PROGRESO` con 1 subtarea pendiente  
**When** se completa esa última subtarea (`porcentaje_avance` pasa a 100.00)  
**Then** `ticket_edilicia.porcentaje_avance` MUST ser `100.00`  
**And** `tickets.estado_id` MUST permanecer en `EN_PROGRESO`  
**And** la transición a `RESUELTO` MUST ser iniciada explícitamente por un usuario autorizado en una llamada separada  
**And** el sistema MUST NOT transicionar el estado automáticamente

---

### Requirement: Personal de mantenimiento como soft ref

#### Scenario: personal_asignado_id validado como usuario existente en master
**Given** `AsignarPersonalEdilicioUseCase` recibe `personal_asignado_id = {uuid}`  
**When** valida los datos  
**Then** MUST verificar que `{uuid}` existe en `master.usuarios` con `activo = TRUE` y `deleted_at IS NULL`  
**And** MUST verificar que el usuario pertenece al mismo cliente (tenant)  
**And** SHOULD verificar que el usuario tiene rol `MANTENIMIENTO` o elegibilidad equivalente  
**And** si no existe MUST rechazar con HTTP 422

---

### Requirement: Soft delete en entidades edilicias

#### Scenario: Soft delete en ticket_edilicia coherente con ticket base
**Given** un ticket edilicio con subtareas activas  
**When** se aplica soft delete al ticket base  
**Then** `tickets.deleted_at` MUST ser seteado  
**And** `ticket_edilicia.deleted_at` MUST ser seteado en la misma operación  
**And** las subtareas MUST permanecer con sus valores actuales (no se eliminan en cascada automáticamente)  
**And** MUST NOT eliminar físicamente ninguna fila

#### Scenario: Soft delete de subtarea no cuenta en el avance
**Given** una subtarea con `deleted_at IS NOT NULL`  
**When** se recalcula `porcentaje_avance`  
**Then** esa subtarea MUST NOT ser incluida ni en el numerador ni en el denominador del cálculo
