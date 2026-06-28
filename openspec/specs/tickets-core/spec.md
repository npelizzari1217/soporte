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

**Seeds:** `CAMBIO_ESTADO`, `COMENTARIO`, `ASIGNACION`, `ADJUNTO`, `AVANCE_EDILICIO`, `EDICION`, `ELIMINACION`.

> `EDICION` y `ELIMINACION` agregados en change `tickets-editar-borrar` (2026-06-28).
> UUIDs deterministas: `EDICION` → `f0000000-0000-4000-f000-000000000007`,
> `ELIMINACION` → `f0000000-0000-4000-f000-000000000008`.
> Para tenants existentes antes de este change: aplicar vía `scripts/migrate-tenants.ts`
> (migración tenant `20260627010000_seed_tipo_operacion_edicion_eliminacion`).
> Para tenants nuevos: incluido en el seeder estándar (`tenant-seed.ts` + `tenant-seeder.adapter.ts`).

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
**And** `tipo_operacion` MUST contener los 7 tipos base (incluye `EDICION` y `ELIMINACION` desde change `tickets-editar-borrar`)  
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

---

### Requirement: Edición de campos de datos del ticket

> Introducido en change `tickets-editar-borrar` (2026-06-28).

`PATCH /tickets/:id` permite modificar el subconjunto de campos de datos
del ticket. Los campos que identifican ciclo de vida, identidad del
solicitante o número de registro son INMUTABLES por este endpoint.

**Campos permitidos en el body:** `titulo`, `descripcion`, `prioridadId`,
`cicloId`, `fechaVencimiento`. Todos opcionales (PATCH parcial).

**Campos inmutables** (nunca modificables por este endpoint):
`estadoId`, `tipoId`, `solicitanteId`, `asignadoId`, `numero`, `autorId`, `clienteId`, `anio`.
`tipoId` es inmutable porque el número legible (`numero`) se derivó del tipo original;
cambiar el tipo dejaría `numero` inconsistente. Los campos inmutables incluidos en el body
MUST ser ignorados silenciosamente (no error de validación).

**Validación de FK:** Si `prioridadId` viene definido, MUST verificarse que existe en
`prioridades` — si no existe → 422. Si `cicloId` viene definido y no es `null`, MUST
verificarse que existe en `ciclos_cliente` — si no existe → 422. `cicloId: null` limpia
la FK sin validar (semántica "desvincular del ciclo").

#### Scenario: Edición exitosa de campos de datos

**Given** un ticket activo (`deleted_at IS NULL`) en estado no terminal  
**And** el usuario autenticado tiene permiso `ticket:editar`  
**And** el ticket pertenece al tenant del usuario  
**When** el usuario envía `PATCH /tickets/{id}` con al menos un campo permitido  
**Then** la respuesta MUST ser `HTTP 200` con el `TicketResponseDto` reflejando los valores actualizados  
**And** `tickets.updated_at` MUST ser actualizado a `now()`  
**And** los campos no incluidos en el body MUST permanecer sin cambios  
**And** dentro de la MISMA transacción Postgres MUST registrarse una fila en `operaciones_ticket`
con `tipo_operacion.codigo = 'EDICION'`, `autor_id` del usuario autenticado,
y `metadata` que incluya al menos `{ camposModificados: [lista de claves modificadas] }`

#### Scenario: Campo prohibido incluido en el body es ignorado

**Given** un ticket activo en estado no terminal  
**And** el usuario tiene permiso `ticket:editar`  
**When** el body de `PATCH /tickets/{id}` incluye `estadoId`, `tipoId`, `solicitanteId` u otro campo inmutable  
**Then** la respuesta MUST ser `HTTP 200` (no error de validación)  
**And** los valores de los campos inmutables en la DB MUST NOT haber cambiado  
**And** solo los campos permitidos presentes en el body MUST ser actualizados

#### Scenario: Edición rechazada — ticket en estado terminal CERRADO

**Given** un ticket cuyo estado actual tiene `codigo = 'CERRADO'`  
**And** el usuario tiene permiso `ticket:editar`  
**When** el usuario envía `PATCH /tickets/{id}` con cualquier campo válido  
**Then** la respuesta MUST ser `HTTP 422`  
**And** el body de error MUST comunicar que el ticket no es editable en su estado actual  
**And** MUST NOT modificar ningún campo de la fila `tickets`  
**And** MUST NOT registrar ninguna `operaciones_ticket`

#### Scenario: Edición rechazada — ticket en estado terminal CANCELADO

**Given** un ticket cuyo estado actual tiene `codigo = 'CANCELADO'`  
**And** el usuario tiene permiso `ticket:editar`  
**When** el usuario envía `PATCH /tickets/{id}`  
**Then** la respuesta MUST ser `HTTP 422`  
**And** MUST NOT modificar la fila en `tickets`

#### Scenario: Edición rechazada — ticket soft-deleted

**Given** un ticket con `deleted_at IS NOT NULL`  
**When** el usuario envía `PATCH /tickets/{id}` (independientemente del permiso)  
**Then** la respuesta MUST ser `HTTP 404`  
**And** MUST NOT modificar la fila en `tickets`

#### Scenario: Edición rechazada — ticket de otro tenant

**Given** un ticket que existe en la DB del tenant B  
**And** el usuario autenticado pertenece al tenant A  
**When** el usuario envía `PATCH /tickets/{id}` con el ID de ese ticket  
**Then** la respuesta MUST ser `HTTP 404` (no 403; la existencia del ticket no se revela)  
**And** MUST NOT modificar ningún dato del tenant B

#### Scenario: Edición rechazada — sin permiso ticket:editar

**Given** un usuario autenticado sin el permiso `ticket:editar` en su JWT  
**When** envía `PATCH /tickets/{id}`  
**Then** la respuesta MUST ser `HTTP 403`  
**And** MUST NOT ejecutar ningún caso de uso ni modificar datos

---

### Requirement: Soft delete de tickets

> Introducido en change `tickets-editar-borrar` (2026-06-28).

`DELETE /tickets/:id` da de baja lógica un ticket seteando `deleted_at`.
A diferencia de la edición, el soft delete es permitido incluso en estados
terminales (CERRADO/CANCELADO). La operación es **idempotente**: un segundo
DELETE sobre un ticket ya eliminado retorna `204 No Content` sin error y sin
registrar una segunda `OperacionTicket` de tipo ELIMINACION.

#### Scenario: Soft delete exitoso de ticket activo

**Given** un ticket con `deleted_at IS NULL`  
**And** el usuario autenticado tiene permiso `ticket:eliminar`  
**And** el ticket pertenece al tenant del usuario  
**When** el usuario envía `DELETE /tickets/{id}`  
**Then** la respuesta MUST ser `HTTP 204 No Content` (sin body)  
**And** `tickets.deleted_at` MUST ser seteado a `now()`  
**And** dentro de la MISMA transacción MUST registrarse una fila en `operaciones_ticket`
con `tipo_operacion.codigo = 'ELIMINACION'` y `autor_id` del usuario autenticado  
**And** MUST NOT eliminar físicamente la fila de `tickets`

#### Scenario: Soft delete de ticket en estado terminal (CERRADO / CANCELADO) — permitido

**Given** un ticket con `deleted_at IS NULL` cuyo estado tiene `codigo = 'CERRADO'` o `codigo = 'CANCELADO'`  
**And** el usuario tiene permiso `ticket:eliminar`  
**When** el usuario envía `DELETE /tickets/{id}`  
**Then** la respuesta MUST ser `HTTP 204 No Content` (sin body)  
**And** `tickets.deleted_at` MUST ser seteado a `now()`  
**And** MUST NOT rechazar la operación por estar en estado terminal

#### Scenario: Doble borrado — no-op idempotente

**Given** un ticket con `deleted_at IS NOT NULL` (ya eliminado)  
**And** el usuario tiene permiso `ticket:eliminar`  
**When** el usuario envía `DELETE /tickets/{id}` por segunda vez  
**Then** la respuesta MUST ser `HTTP 204 No Content` (no-op; éxito silencioso)  
**And** MUST NOT modificar `deleted_at` ni `updated_at`  
**And** MUST NOT registrar una segunda `operaciones_ticket` de tipo ELIMINACION

#### Scenario: Soft delete rechazado — ticket de otro tenant

**Given** un ticket que existe en la DB del tenant B  
**And** el usuario autenticado pertenece al tenant A  
**When** el usuario envía `DELETE /tickets/{id}`  
**Then** la respuesta MUST ser `HTTP 404`  
**And** MUST NOT modificar ningún dato del tenant B

#### Scenario: Soft delete rechazado — sin permiso ticket:eliminar

**Given** un usuario autenticado sin el permiso `ticket:eliminar` en su JWT  
**When** envía `DELETE /tickets/{id}`  
**Then** la respuesta MUST ser `HTTP 403`  
**And** MUST NOT ejecutar ningún caso de uso ni modificar datos

---

### Requirement: Exclusión de tickets soft-deleted en listados

> Introducido en change `tickets-editar-borrar` (2026-06-28).

Este requirement confirma que el soft delete aplica el mismo patrón de exclusión
(`deletedAt: null` en `findAll`/`findByEstado`) ya existente en la capa de repositorio.

#### Scenario: Ticket recién eliminado no aparece en el listado

**Given** un ticket que existía con `deleted_at IS NULL`  
**And** el ticket fue eliminado vía `DELETE /tickets/{id}` exitosamente  
**When** cualquier usuario del mismo tenant llama `GET /tickets`  
**Then** el ticket eliminado MUST NOT aparecer en el array de respuesta  
**And** los demás tickets activos del tenant MUST seguir apareciendo normalmente

#### Scenario: GET /tickets/:id retorna 404 para ticket soft-deleted

**Given** un ticket con `deleted_at IS NOT NULL`  
**When** un usuario llama `GET /tickets/{id}`  
**Then** la respuesta MUST ser `HTTP 404`  
**And** MUST NOT devolver los datos del ticket eliminado

---

### Requirement: Auditoría transaccional de edición y eliminación

> Introducido en change `tickets-editar-borrar` (2026-06-28).

Las operaciones de edición y eliminación son eventos de negocio significativos
que DEBEN quedar reflejados en el timeline inmutable `operaciones_ticket`,
en la MISMA transacción que el cambio principal. Un fallo en el registro de
auditoría DEBE hacer rollback del cambio principal.

#### Scenario: Rollback si falla el registro de auditoría en edición

**Given** un ticket activo en estado no terminal  
**And** el registro en `operaciones_ticket` falla (ej. error de FK por seed faltante)  
**When** `EditarTicketUseCase` intenta ejecutar  
**Then** la transacción MUST hacer rollback completo  
**And** `tickets` MUST permanecer sin cambios (ni los campos de datos ni `updated_at`)  
**And** la respuesta MUST ser `HTTP 500` (error interno de catálogo no sembrado)

#### Scenario: Rollback si falla el registro de auditoría en eliminación

**Given** un ticket activo  
**And** el registro en `operaciones_ticket` falla  
**When** `EliminarTicketUseCase` intenta ejecutar  
**Then** la transacción MUST hacer rollback completo  
**And** `tickets.deleted_at` MUST permanecer `NULL`  
**And** la respuesta MUST ser `HTTP 500`

#### Scenario: Seed de tipo_operacion EDICION y ELIMINACION presente en todo tenant

**Given** se conecta a la DB de cualquier tenant existente o nuevo  
**When** se consulta `tipo_operacion`  
**Then** MUST existir una fila con `codigo = 'EDICION'` y `activo = TRUE`  
**And** MUST existir una fila con `codigo = 'ELIMINACION'` y `activo = TRUE`  
**And** el seed MUST ser idempotente (re-ejecución no duplica filas)
