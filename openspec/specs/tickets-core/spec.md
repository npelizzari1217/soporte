# Spec: Tickets Core

> Módulo: `tickets`  
> Schema: **TENANT** (una DB por cliente; sin columna `cliente_id`)  
> Flujos afectados: SOPORTE | COMPRAS | EDILICIA (todos)  
> Campos de auditoría y patrón de IDs: ver `specs/_shared-audit-pattern.md`

## Contexto

El ticket es la entidad central del sistema. Un ticket unificado con discriminador
`tipo_id` más tablas satélite 1:1 por flujo (`ticket_compra`, `ticket_edilicia`).
Este módulo define la estructura base, los catálogos operativos sembrados por tenant,
la numeración legible, la máquina de estados base, el timeline de operaciones y
la gestión de adjuntos (metadata + join tables, binario vía `IFileStorage`).

**Cross-DB soft refs:** los campos `solicitante_id`, `asignado_id`, `autor_id`, etc. son
UUIDs que referencian `master.usuarios.id`. NO tienen FK (FK cross-DB es imposible en
Postgres). Su integridad DEBE ser validada en la capa de aplicación (caso de uso).

---

## Modelo de datos

### Tabla `estados` (TENANT — catálogo, sembrado en provisioning)

Estados del ciclo de vida del ticket. Los valores base son semilla inicial; el administrador
del tenant PUEDE agregar estados propios si el modelo de negocio lo requiere.

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `id` | `uuid` | NOT NULL | PK, UUIDv7 | Identificador técnico |
| `codigo` | `varchar(50)` | NOT NULL | UNIQUE, CHECK ver abajo | Identificador semántico en mayúsculas |
| `nombre` | `varchar(100)` | NOT NULL | — | Label human-readable (i18n futuro) |
| `color` | `varchar(20)` | NULL | — | Código hex o nombre CSS para UI |
| `orden` | `integer` | NOT NULL | DEFAULT 0 | Orden de visualización en UI |
| `activo` | `boolean` | NOT NULL | DEFAULT TRUE | Estados inactivos no aparecen en UI |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `deleted_at` | `timestamptz` | NULL | — | Ver patrón compartido |

**Seeds obligatorios (por orden de inserción):**

| codigo | nombre | orden |
|--------|--------|-------|
| `ABIERTO` | Abierto | 10 |
| `PENDIENTE_APROBACION` | Pendiente de aprobación | 20 |
| `APROBADO` | Aprobado | 30 |
| `RECHAZADO` | Rechazado | 35 |
| `EN_PROGRESO` | En progreso | 40 |
| `RESUELTO` | Resuelto | 50 |
| `CERRADO` | Cerrado | 60 |
| `CANCELADO` | Cancelado | 70 |

---

### Tabla `prioridades` (TENANT — catálogo, sembrado en provisioning)

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `id` | `uuid` | NOT NULL | PK, UUIDv7 | — |
| `codigo` | `varchar(50)` | NOT NULL | UNIQUE | Ej. `BAJA`, `MEDIA`, `ALTA`, `CRITICA` |
| `nombre` | `varchar(100)` | NOT NULL | — | — |
| `color` | `varchar(20)` | NULL | — | — |
| `orden` | `integer` | NOT NULL | DEFAULT 0 | — |
| `activo` | `boolean` | NOT NULL | DEFAULT TRUE | — |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | — |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | — |
| `deleted_at` | `timestamptz` | NULL | — | — |

**Seeds:** `BAJA` (orden 10), `MEDIA` (20), `ALTA` (30), `CRITICA` (40).

---

### Tabla `tipos_ticket` (TENANT — catálogo, sembrado en provisioning)

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `id` | `uuid` | NOT NULL | PK, UUIDv7 | — |
| `codigo` | `varchar(50)` | NOT NULL | UNIQUE, CHECK (`codigo` IN ('SOPORTE', 'COMPRAS', 'EDILICIA')) | Discriminador de flujo |
| `nombre` | `varchar(100)` | NOT NULL | — | — |
| `activo` | `boolean` | NOT NULL | DEFAULT TRUE | — |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | — |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | — |
| `deleted_at` | `timestamptz` | NULL | — | — |

**Seeds:** `SOPORTE`, `COMPRAS`, `EDILICIA`.

---

### Tabla `tipo_operacion` (TENANT — catálogo, sembrado en provisioning)

Tipos de evento registrables en el timeline de un ticket.

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `id` | `uuid` | NOT NULL | PK, UUIDv7 | — |
| `codigo` | `varchar(50)` | NOT NULL | UNIQUE | Ej. `CAMBIO_ESTADO`, `COMENTARIO`, `ASIGNACION`, `ADJUNTO`, `AVANCE_EDILICIO` |
| `nombre` | `varchar(100)` | NOT NULL | — | — |
| `activo` | `boolean` | NOT NULL | DEFAULT TRUE | — |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | — |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | — |
| `deleted_at` | `timestamptz` | NULL | — | — |

**Seeds:** `CAMBIO_ESTADO`, `COMENTARIO`, `ASIGNACION`, `ADJUNTO`, `AVANCE_EDILICIO`.

---

### Tabla `ciclos_cliente` (TENANT)

Períodos de gestión activos en este tenant. Referencia al catálogo global `master.ciclos_vigentes`
mediante soft ref (UUID sin FK cross-DB).

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `id` | `uuid` | NOT NULL | PK, UUIDv7 | — |
| `ciclo_vigente_id` | `uuid` | NOT NULL | — | Soft ref → `master.ciclos_vigentes.id` (sin FK) |
| `nombre` | `varchar(100)` | NOT NULL | — | Puede diferir del nombre del ciclo vigente global |
| `fecha_inicio` | `date` | NOT NULL | — | Inicio efectivo para este tenant |
| `fecha_fin` | `date` | NOT NULL | — | Fin efectivo para este tenant |
| `activo` | `boolean` | NOT NULL | DEFAULT TRUE | — |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | — |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | — |
| `deleted_at` | `timestamptz` | NULL | — | — |

**Índices:** `INDEX (ciclo_vigente_id)`, `INDEX (activo)`.

---

### Tabla `tickets` (TENANT)

Entidad central. Un ticket agrupa toda la gestión de un incidente, compra o reparación.

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `id` | `uuid` | NOT NULL | PK, UUIDv7 | ID técnico para URLs y relaciones |
| `numero` | `varchar(20)` | NOT NULL | UNIQUE | Número legible: ej. `SOP-2026-00042`. Generado por la app con secuencia local |
| `titulo` | `varchar(255)` | NOT NULL | — | Resumen del ticket |
| `descripcion` | `text` | NULL | — | Descripción detallada |
| `tipo_id` | `uuid` | NOT NULL | FK → `tipos_ticket.id` | Discriminador SOPORTE / COMPRAS / EDILICIA |
| `estado_id` | `uuid` | NOT NULL | FK → `estados.id` | Estado actual del ciclo de vida |
| `prioridad_id` | `uuid` | NOT NULL | FK → `prioridades.id` | Prioridad operativa |
| `ciclo_id` | `uuid` | NULL | FK → `ciclos_cliente.id` | Ciclo de gestión al que pertenece |
| `solicitante_id` | `uuid` | NOT NULL | — | Soft ref → `master.usuarios.id` |
| `asignado_id` | `uuid` | NULL | — | Soft ref → `master.usuarios.id`; NULL = sin asignar |
| `fecha_vencimiento` | `date` | NULL | — | SLA objetivo, manejado por la app |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | — |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | — |
| `deleted_at` | `timestamptz` | NULL | — | — |

**Índices:**
- `UNIQUE (numero)` — búsqueda y deduplicación de número legible
- `INDEX (tipo_id)`
- `INDEX (estado_id)`
- `INDEX (prioridad_id)`
- `INDEX (ciclo_id)` WHERE `ciclo_id IS NOT NULL`
- `INDEX (solicitante_id)` — "mis tickets"
- `INDEX (asignado_id)` WHERE `asignado_id IS NOT NULL` — "tickets asignados a mí"
- `INDEX (created_at)` — ordenamiento por fecha de creación

---

### Tabla `operaciones_ticket` (TENANT)

Timeline inmutable de eventos sobre un ticket. Toda acción significativa (cambio de estado,
comentario, asignación, adjunto, avance edilicio) DEBE registrarse aquí dentro de la misma
transacción que el cambio principal.

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `id` | `uuid` | NOT NULL | PK, UUIDv7 | — |
| `ticket_id` | `uuid` | NOT NULL | FK → `tickets.id` | Ticket al que pertenece |
| `tipo_operacion_id` | `uuid` | NOT NULL | FK → `tipo_operacion.id` | Tipo de evento |
| `descripcion` | `text` | NULL | — | Texto libre del comentario o descripción del evento |
| `estado_anterior_id` | `uuid` | NULL | FK → `estados.id` | NULL si no es cambio de estado |
| `estado_nuevo_id` | `uuid` | NULL | FK → `estados.id` | NULL si no es cambio de estado |
| `autor_id` | `uuid` | NOT NULL | — | Soft ref → `master.usuarios.id` |
| `metadata` | `jsonb` | NULL | — | Datos adicionales del evento (ej. `{ porcentaje_avance: 75 }`) |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | — |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | — |
| `deleted_at` | `timestamptz` | NULL | — | — |

**Índices:**
- `INDEX (ticket_id)` — timeline de un ticket (con orden `created_at`)
- `INDEX (tipo_operacion_id)` — filtro por tipo de evento
- `INDEX (autor_id)` — auditoría por actor

---

### Tabla `archivos` (TENANT)

Metadata de archivos adjuntos. El binario NUNCA se almacena en DB; vive en `IFileStorage`.
La `storage_key` es el identificador del objeto en el servicio de storage (ej. S3 key).

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `id` | `uuid` | NOT NULL | PK, UUIDv7 | — |
| `storage_key` | `text` | NOT NULL | UNIQUE | Path/key en IFileStorage. NUNCA un blob |
| `nombre_original` | `varchar(255)` | NOT NULL | — | Nombre del archivo tal como lo subió el usuario |
| `mime_type` | `varchar(100)` | NOT NULL | — | Ej. `application/pdf`, `image/png` |
| `tamano_bytes` | `bigint` | NOT NULL | CHECK (`tamano_bytes > 0`) | Tamaño en bytes |
| `subido_por_id` | `uuid` | NOT NULL | — | Soft ref → `master.usuarios.id` |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | — |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | — |
| `deleted_at` | `timestamptz` | NULL | — | — |

---

### Tabla `archivos_ticket` (TENANT — join)

Asociación N:M entre `archivos` y `tickets`. FK real con ON DELETE CASCADE en ambos extremos.

| Columna | Tipo Postgres | Nullability | Restricción / Default |
|---------|--------------|-------------|----------------------|
| `archivo_id` | `uuid` | NOT NULL | FK → `archivos.id` ON DELETE CASCADE |
| `ticket_id` | `uuid` | NOT NULL | FK → `tickets.id` ON DELETE CASCADE |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() |

**PK:** `(archivo_id, ticket_id)`  
**Índice:** `INDEX (ticket_id)` — adjuntos de un ticket

---

### Tabla `archivos_operacion` (TENANT — join)

Asociación N:M entre `archivos` y `operaciones_ticket`.

| Columna | Tipo Postgres | Nullability | Restricción / Default |
|---------|--------------|-------------|----------------------|
| `archivo_id` | `uuid` | NOT NULL | FK → `archivos.id` ON DELETE CASCADE |
| `operacion_id` | `uuid` | NOT NULL | FK → `operaciones_ticket.id` ON DELETE CASCADE |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() |

**PK:** `(archivo_id, operacion_id)`

---

### Tabla `usuario_tipos_ticket` (TENANT)

Elegibilidad de asignación: define qué tipos de ticket puede atender un usuario dentro de
este tenant. No es un permiso de RBAC; es enrutamiento de trabajo. La validación ocurre en
`AsignarTicketUseCase`.

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `usuario_id` | `uuid` | NOT NULL | — | Soft ref → `master.usuarios.id` |
| `tipo_ticket_id` | `uuid` | NOT NULL | FK → `tipos_ticket.id` | Tipo que el usuario puede atender |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | — |

**PK:** `(usuario_id, tipo_ticket_id)`  
**Índice:** `INDEX (usuario_id)` — "tipos que puede atender este usuario"

---

## Requirements

### Requirement: Aislamiento por tenant

#### Scenario: Sin columna cliente_id en ninguna tabla tenant
**Given** cualquier tabla del schema tenant  
**When** se inspecciona su DDL  
**Then** MUST NOT existir columna `cliente_id`  
**And** el aislamiento MUST ser provisto únicamente por la separación de DB (connexión al tenant correcto)

#### Scenario: TenantContext activo antes de acceder a DB tenant
**Given** una request autenticada a un endpoint de tickets  
**When** el TenantGuard procesa la request  
**Then** MUST cargar `TenantContext` con `{ prismaClient, dbName, clienteId }` desde el JWT  
**And** cualquier repositorio tenant MUST obtener su PrismaClient desde `TenantContext`  
**And** MUST NOT aceptar requests sin TenantContext válido (HTTP 403)

---

### Requirement: Numeración legible de tickets

#### Scenario: Número de ticket generado con prefijo de tipo y secuencia local
**Given** un tenant con tickets de tipo SOPORTE existentes y el último número `SOP-2026-00041`  
**When** se crea un nuevo ticket de tipo SOPORTE en el mismo ciclo  
**Then** el campo `numero` MUST ser `SOP-2026-00042`  
**And** el prefijo MUST derivarse del `codigo` del tipo de ticket: `SOP` (SOPORTE), `COM` (COMPRAS), `EDI` (EDILICIA)  
**And** la secuencia MUST ser local al tenant (no global)  
**And** el número MUST incluir el año del ciclo vigente o año de creación

#### Scenario: Número de ticket es único dentro del tenant
**Given** un tenant con un ticket `SOP-2026-00042`  
**When** se intenta crear otro ticket que resultaría en el mismo número  
**Then** la DB MUST rechazar la inserción con violación de UNIQUE (numero)  
**And** la app MUST reintentar con el siguiente número en secuencia

---

### Requirement: Validación de soft refs cross-DB

#### Scenario: Solicitante debe existir en master antes de crear ticket
**Given** un caso de uso `CrearTicketUseCase` recibe `solicitante_id = {uuid}`  
**When** valida los parámetros antes de persistir  
**Then** MUST verificar que `{uuid}` existe en `master.usuarios` con `deleted_at IS NULL`  
**And** MUST verificar que el usuario pertenece al mismo cliente (`cliente_id` del JWT)  
**And** si no existe MUST rechazar con error de validación (HTTP 422) antes de intentar el INSERT

#### Scenario: Asignado debe ser elegible para el tipo de ticket
**Given** `AsignarTicketUseCase` recibe `asignado_id = {uuid}` para un ticket de tipo SOPORTE  
**When** valida la asignación  
**Then** MUST verificar que `{uuid}` existe en `master.usuarios` con `activo = TRUE`  
**And** MUST verificar que existe `usuario_tipos_ticket` donde `usuario_id = {uuid}` y `tipo_ticket_id` corresponde a SOPORTE  
**And** si no existe la elegibilidad MUST rechazar con HTTP 422

---

### Requirement: Máquina de estados base (todos los tipos)

**Transiciones válidas comunes:**
```
ABIERTO → EN_PROGRESO
ABIERTO → CANCELADO
EN_PROGRESO → RESUELTO (ver restricciones por tipo en specs de compras y reparaciones)
EN_PROGRESO → CANCELADO
RESUELTO → CERRADO
RESUELTO → EN_PROGRESO  (reapertura)
CERRADO → (ninguna transición — estado terminal)
CANCELADO → (ninguna transición — estado terminal)
```

#### Scenario: Transición inválida es rechazada por la máquina de estados
**Given** un ticket en estado `CERRADO`  
**When** un caso de uso intenta transicionar a `EN_PROGRESO`  
**Then** `TicketStateMachineFactory` MUST seleccionar la estrategia correcta para el tipo del ticket  
**And** `puedeTransicionar('CERRADO', 'EN_PROGRESO', ctx)` MUST retornar `false`  
**And** el caso de uso MUST rechazar la operación con HTTP 422  
**And** MUST NOT modificar `tickets.estado_id`

#### Scenario: Transición válida registra operacion en misma transacción
**Given** un ticket en estado `ABIERTO`  
**When** un caso de uso lo transiciona a `EN_PROGRESO`  
**Then** dentro de la MISMA transacción Postgres MUST:
  - actualizar `tickets.estado_id` al UUID del estado `EN_PROGRESO`
  - insertar una fila en `operaciones_ticket` con `tipo_operacion_id` = `CAMBIO_ESTADO`, `estado_anterior_id` = UUID de `ABIERTO`, `estado_nuevo_id` = UUID de `EN_PROGRESO`, `autor_id` del usuario autenticado
**And** si cualquiera de las dos operaciones falla MUST hacer rollback completo

#### Scenario: Estado inicial de ticket recién creado es ABIERTO
**Given** un caso de uso crea un ticket nuevo  
**When** se persiste la fila  
**Then** `tickets.estado_id` MUST apuntar al UUID del estado con `codigo = 'ABIERTO'`  
**And** MUST registrar en `operaciones_ticket` una operación `CAMBIO_ESTADO` con `estado_anterior_id = NULL` y `estado_nuevo_id` = UUID de `ABIERTO`

---

### Requirement: Adjuntos vía IFileStorage (sin blobs en DB)

#### Scenario: Upload de adjunto guarda solo metadata en DB
**Given** un usuario sube un archivo PDF de 2MB adjunto a un ticket  
**When** el caso de uso procesa el upload  
**Then** MUST subir el binario a `IFileStorage` y obtener la `storage_key`  
**And** MUST insertar una fila en `archivos` con los metadatos (`storage_key`, `nombre_original`, `mime_type`, `tamano_bytes`, `subido_por_id`)  
**And** MUST insertar una fila en `archivos_ticket` asociando `archivo_id` con `ticket_id`  
**And** MUST NOT almacenar el contenido binario en ninguna columna de la DB

#### Scenario: Borrado de adjunto no borra el binario inmediatamente
**Given** un adjunto asociado a un ticket  
**When** un usuario elimina el adjunto  
**Then** MUST aplicar soft delete (`deleted_at`) en la fila de `archivos`  
**And** MUST eliminar la fila en `archivos_ticket` (ON DELETE CASCADE o delete explícito)  
**And** la eliminación del binario en `IFileStorage` SHOULD ser un proceso asíncrono (ej. job de limpieza)  
**And** MUST NOT bloquear la respuesta esperando al storage

---

### Requirement: Seeds de catálogos en provisioning de tenant

#### Scenario: Nuevo tenant tiene catálogos operativos pre-poblados
**Given** se completa el provisioning de un nuevo cliente  
**When** se conecta a la DB tenant y consulta las tablas de catálogo  
**Then** `estados` MUST contener los 8 estados base definidos en este spec  
**And** `prioridades` MUST contener los 4 niveles base  
**And** `tipos_ticket` MUST contener `SOPORTE`, `COMPRAS`, `EDILICIA`  
**And** `tipo_operacion` MUST contener los 5 tipos base  
**And** todos los registros seed MUST tener `activo = TRUE` y `deleted_at IS NULL`

#### Scenario: Seed de catálogos es idempotente
**Given** se ejecuta el seed sobre un tenant que ya tiene los catálogos  
**When** el proceso de seed re-corre  
**Then** MUST NOT crear filas duplicadas  
**And** MUST usar la estrategia `INSERT ... ON CONFLICT (codigo) DO NOTHING`

---

### Requirement: Elegibilidad de asignación separada de permisos

#### Scenario: Usuario con permiso ticket:asignar pero sin elegibilidad no puede ser asignado
**Given** un usuario con permiso `ticket:asignar` pero sin registro en `usuario_tipos_ticket` para SOPORTE  
**When** `AsignarTicketUseCase` intenta asignarlo a un ticket de tipo SOPORTE  
**Then** MUST rechazar con HTTP 422 indicando que el usuario no está habilitado para ese tipo de ticket  
**And** MUST NOT actualizar `tickets.asignado_id`

#### Scenario: Elegibilidad no requiere guard en endpoint
**Given** la tabla `usuario_tipos_ticket` define la elegibilidad de un usuario  
**When** se evalúa si un usuario puede recibir la asignación de un ticket  
**Then** la verificación MUST ocurrir en el caso de uso (`AsignarTicketUseCase`)  
**And** MUST NOT existir un guard genérico de Nest para `usuario_tipos_ticket`
