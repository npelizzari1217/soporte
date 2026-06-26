# Spec: Compras

> Módulo: `compras`  
> Schema: **TENANT** (una DB por cliente; sin columna `cliente_id`)  
> Flujos afectados: COMPRAS  
> Campos de auditoría y patrón de IDs: ver `specs/_shared-audit-pattern.md`  
> Máquina de estados base: ver `specs/tickets-core/spec.md`

## Contexto

Extensión del ticket unificado para el flujo de compras. El ticket de compras incorpora
un ciclo de aprobación obligatorio antes de poder ejecutarse. La tabla `ticket_compra` es
satélite 1:1 de `tickets` (solo existe para tickets con `tipo.codigo = 'COMPRAS'`).
Los items de la compra y los presupuestos de proveedores son entidades propias de este módulo.

El binario de los presupuestos adjuntos (PDFs de cotizaciones) vive en `IFileStorage`;
solo la metadata se almacena en DB, mediante `archivos` + `archivos_presupuesto`.

---

## Modelo de datos

### Tabla `ticket_compra` (TENANT)

Datos específicos del flujo de compras. Relación 1:1 con `tickets`.
El campo `aprobado_por_id` es soft ref a `master.usuarios.id` (sin FK cross-DB).

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `id` | `uuid` | NOT NULL | PK, UUIDv7 | — |
| `ticket_id` | `uuid` | NOT NULL | UNIQUE, FK → `tickets.id` | Relación 1:1 con el ticket base |
| `aprobado_por_id` | `uuid` | NULL | — | Soft ref → `master.usuarios.id`; se setea al aprobar o rechazar |
| `aprobado_en` | `timestamptz` | NULL | — | Timestamp de la decisión de aprobación/rechazo |
| `motivo_rechazo` | `text` | NULL | — | Obligatorio cuando la decisión es RECHAZADO |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `deleted_at` | `timestamptz` | NULL | — | Ver patrón compartido |

**Índices:**
- `UNIQUE (ticket_id)` — garantiza relación 1:1

---

### Tabla `items_compra` (TENANT)

Ítems individuales que se desean adquirir dentro del ticket de compra. Un ticket de compra
puede tener uno o más ítems.

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `id` | `uuid` | NOT NULL | PK, UUIDv7 | — |
| `ticket_compra_id` | `uuid` | NOT NULL | FK → `ticket_compra.id` | Compra a la que pertenece |
| `descripcion` | `varchar(255)` | NOT NULL | — | Qué se quiere comprar |
| `cantidad` | `numeric(10,2)` | NOT NULL | CHECK (`cantidad > 0`) | Cantidad requerida |
| `unidad` | `varchar(50)` | NULL | — | Unidad de medida: unidad, kg, litro, etc. |
| `precio_unitario_ref` | `numeric(14,2)` | NULL | — | Precio de referencia (estimado, no cotizado) |
| `observaciones` | `text` | NULL | — | Detalle adicional del ítem |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `deleted_at` | `timestamptz` | NULL | — | Ver patrón compartido |

**Índices:**
- `INDEX (ticket_compra_id)` — ítems de una compra

---

### Tabla `presupuestos` (TENANT)

Cotizaciones de proveedores para los ítems del ticket de compra. Un ticket de compra
puede tener múltiples presupuestos; solo uno puede ser seleccionado como ganador.

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `id` | `uuid` | NOT NULL | PK, UUIDv7 | — |
| `ticket_compra_id` | `uuid` | NOT NULL | FK → `ticket_compra.id` | Compra a la que pertenece |
| `proveedor` | `varchar(255)` | NOT NULL | — | Nombre o razón social del proveedor |
| `monto_total` | `numeric(14,2)` | NOT NULL | CHECK (`monto_total >= 0`) | Monto total cotizado |
| `moneda` | `varchar(10)` | NOT NULL | DEFAULT 'ARS' | ISO 4217: ARS, USD, EUR |
| `fecha_cotizacion` | `date` | NOT NULL | — | Fecha de la cotización del proveedor |
| `seleccionado` | `boolean` | NOT NULL | DEFAULT FALSE | TRUE = este presupuesto fue elegido |
| `observaciones` | `text` | NULL | — | Notas sobre la cotización |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `deleted_at` | `timestamptz` | NULL | — | Ver patrón compartido |

**Índices:**
- `INDEX (ticket_compra_id)` — presupuestos de una compra

**Constraint de negocio (en app):** Como máximo un presupuesto con `seleccionado = TRUE`
por `ticket_compra_id`. Validado en `SeleccionarPresupuestoUseCase` con transacción
(set anterior a FALSE, set nuevo a TRUE).

---

### Tabla `archivos_presupuesto` (TENANT — join)

Adjuntos de presupuestos (ej. PDF de cotización). FK real con ON DELETE CASCADE.

| Columna | Tipo Postgres | Nullability | Restricción / Default |
|---------|--------------|-------------|----------------------|
| `archivo_id` | `uuid` | NOT NULL | FK → `archivos.id` ON DELETE CASCADE |
| `presupuesto_id` | `uuid` | NOT NULL | FK → `presupuestos.id` ON DELETE CASCADE |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() |

**PK:** `(archivo_id, presupuesto_id)`  
**Índice:** `INDEX (presupuesto_id)` — archivos de un presupuesto

---

## Máquina de estados — extensión COMPRAS

El flujo de compras extiende la máquina de estados base con un ciclo de aprobación
obligatorio antes de poder ejecutar la compra.

**Transiciones específicas de COMPRAS:**
```
ABIERTO → PENDIENTE_APROBACION  (solicitante envía a aprobación)
PENDIENTE_APROBACION → APROBADO  (requiere permiso compra:aprobar)
PENDIENTE_APROBACION → RECHAZADO (requiere permiso compra:aprobar)
APROBADO → EN_PROGRESO           (comienza ejecución)
RECHAZADO → CERRADO              (estado terminal inmediato)
EN_PROGRESO → RESUELTO
RESUELTO → CERRADO
ABIERTO → CANCELADO              (heredado de base)
PENDIENTE_APROBACION → CANCELADO (cancelación antes de decisión)
```

**NOTA:** La transición directa `ABIERTO → EN_PROGRESO` (base) está **bloqueada** para
tickets de tipo COMPRAS. El camino obligatorio pasa por `PENDIENTE_APROBACION`.

---

## Requirements

### Requirement: Satélite obligatorio para tickets de tipo COMPRAS

#### Scenario: Creación de ticket COMPRAS genera ticket_compra simultáneamente
**Given** un caso de uso crea un ticket con `tipo.codigo = 'COMPRAS'`  
**When** se ejecuta la transacción de creación  
**Then** MUST insertar la fila base en `tickets`  
**And** MUST insertar una fila en `ticket_compra` con `ticket_id` apuntando al nuevo ticket  
**And** ambas inserciones MUST ocurrir en la MISMA transacción  
**And** si cualquiera falla MUST hacer rollback completo

#### Scenario: Ticket_compra no puede existir para un ticket que no es COMPRAS
**Given** un ticket con `tipo.codigo = 'SOPORTE'`  
**When** se intenta insertar una fila en `ticket_compra` apuntando a ese ticket  
**Then** el caso de uso MUST rechazar la operación con error de validación  
**And** MUST NOT insertar la fila en la DB

---

### Requirement: Ciclo de aprobación obligatorio

#### Scenario: Ticket COMPRAS no puede pasar a EN_PROGRESO sin aprobación previa
**Given** un ticket de compra en estado `ABIERTO`  
**When** se intenta transicionar directamente a `EN_PROGRESO`  
**Then** la estrategia `ComprasStateMachine.puedeTransicionar('ABIERTO', 'EN_PROGRESO', ctx)` MUST retornar `false`  
**And** el caso de uso MUST rechazar con HTTP 422  
**And** MUST NOT modificar el estado del ticket

#### Scenario: Envío a aprobación transiciona a PENDIENTE_APROBACION
**Given** un ticket de compra en estado `ABIERTO` con al menos un ítem cargado  
**When** el solicitante envía el ticket a aprobación  
**Then** MUST transicionar `estado_id` a `PENDIENTE_APROBACION`  
**And** MUST registrar `operaciones_ticket` con tipo `CAMBIO_ESTADO` en la misma transacción

---

### Requirement: Gate de aprobación con permiso compra:aprobar

#### Scenario: Aprobación requiere permiso compra:aprobar
**Given** un ticket de compra en estado `PENDIENTE_APROBACION`  
**When** un usuario sin permiso `compra:aprobar` intenta aprobarlo  
**Then** `PermissionsGuard` MUST rechazar con HTTP 403  
**And** MUST NOT modificar el estado ni `ticket_compra`

#### Scenario: Aprobación exitosa setea aprobado_por_id y aprobado_en
**Given** un ticket de compra en estado `PENDIENTE_APROBACION`  
**When** un usuario con permiso `compra:aprobar` ejecuta la aprobación  
**Then** dentro de la MISMA transacción MUST:
  - transicionar `tickets.estado_id` a `APROBADO`
  - setear `ticket_compra.aprobado_por_id` al UUID del usuario aprobador
  - setear `ticket_compra.aprobado_en` a `now()`
  - insertar `operaciones_ticket` tipo `CAMBIO_ESTADO` (PENDIENTE_APROBACION → APROBADO)

#### Scenario: Rechazo requiere motivo y setea campos de decisión
**Given** un ticket de compra en estado `PENDIENTE_APROBACION`  
**When** un usuario con permiso `compra:aprobar` rechaza la compra sin proporcionar motivo_rechazo  
**Then** el caso de uso MUST rechazar con error de validación (HTTP 422, `motivo_rechazo` requerido)  
**And** MUST NOT modificar el estado

**Given** el mismo escenario con `motivo_rechazo` provisto  
**When** el usuario con permiso `compra:aprobar` rechaza la compra  
**Then** dentro de la MISMA transacción MUST:
  - transicionar `tickets.estado_id` a `RECHAZADO`
  - setear `ticket_compra.aprobado_por_id`, `aprobado_en`, `motivo_rechazo`
  - insertar `operaciones_ticket` tipo `CAMBIO_ESTADO` (PENDIENTE_APROBACION → RECHAZADO)

#### Scenario: Ticket rechazado avanza automáticamente a CERRADO
**Given** un ticket de compra que acaba de transicionar a `RECHAZADO`  
**When** la misma transacción de rechazo completa  
**Then** MUST transicionar inmediatamente a `CERRADO` dentro de la misma transacción  
**And** MUST registrar una segunda `operaciones_ticket` tipo `CAMBIO_ESTADO` (RECHAZADO → CERRADO)  
**And** `RECHAZADO` MUST ser un estado de tránsito registrado en el timeline, no invisible

---

### Requirement: Gestión de ítems de compra

#### Scenario: Ticket COMPRAS DEBE tener al menos un ítem para ser enviado a aprobación
**Given** un ticket de compra en estado `ABIERTO` sin ítems cargados  
**When** se intenta transicionar a `PENDIENTE_APROBACION`  
**Then** `EnviarAAprobacionUseCase` MUST verificar que exista al menos una fila en `items_compra` para ese `ticket_compra_id` con `deleted_at IS NULL`  
**And** si no hay ítems MUST rechazar con HTTP 422

#### Scenario: Soft delete de ítem no elimina físicamente
**Given** un ítem de compra  
**When** se solicita eliminarlo  
**Then** MUST setear `deleted_at = now()`  
**And** MUST NOT ejecutar `DELETE` físico  
**And** los ítems soft-deleted MUST ser excluidos del conteo de ítems para validación de aprobación

---

### Requirement: Selección única de presupuesto

#### Scenario: Solo un presupuesto puede estar seleccionado por compra
**Given** un ticket de compra con dos presupuestos, el primero marcado como `seleccionado = TRUE`  
**When** se selecciona el segundo presupuesto  
**Then** `SeleccionarPresupuestoUseCase` MUST en una sola transacción:
  - setear `seleccionado = FALSE` en el presupuesto anteriormente seleccionado
  - setear `seleccionado = TRUE` en el nuevo presupuesto  
**And** MUST NOT existir dos filas con `seleccionado = TRUE` para el mismo `ticket_compra_id` y `deleted_at IS NULL`

---

### Requirement: Adjuntos de presupuestos vía IFileStorage

#### Scenario: Adjunto de cotización guarda solo metadata en DB
**Given** un usuario adjunta un PDF de cotización a un presupuesto  
**When** el caso de uso procesa el upload  
**Then** MUST subir el binario a `IFileStorage`  
**And** MUST insertar fila en `archivos` con la metadata  
**And** MUST insertar fila en `archivos_presupuesto` asociando el archivo al presupuesto  
**And** MUST NOT almacenar contenido binario en ninguna columna

---

### Requirement: Soft delete en entidades de compras

#### Scenario: Soft delete en ticket_compra es coherente con ticket base
**Given** un ticket de compra  
**When** se aplica soft delete al ticket base (`tickets.deleted_at`)  
**Then** el ticket base MUST tener `deleted_at` seteado  
**And** `ticket_compra` SHOULD tener `deleted_at` seteado en la misma operación  
**And** MUST NOT eliminar físicamente ninguna fila
