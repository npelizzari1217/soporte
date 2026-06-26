# Spec: Equipos Informáticos

> Módulo: `equipos`  
> Schema: **TENANT** (una DB por cliente; sin columna `cliente_id`)  
> Flujos afectados: SOPORTE (IT)  
> Campos de auditoría y patrón de IDs: ver `specs/_shared-audit-pattern.md`

## Contexto

Inventario de equipos informáticos del cliente y sus componentes. Asociado principalmente
al flujo de soporte/IT: cuando se abre un ticket de soporte, puede referenciarse el equipo
afectado mediante `ticket_soporte` (satélite 1:1 del ticket para el flujo SOPORTE).

Los tipos de componente son un catálogo sembrado por tenant en el provisioning.
Los equipos pueden tener adjuntos (fotos, manuales) vía `archivos` + `archivos_equipo`.

Las referencias de equipos a usuarios (`asignado_a_id`) son soft refs a `master.usuarios.id`
(sin FK cross-DB); su integridad se valida en la capa de aplicación.

---

## Modelo de datos

### Tabla `tipos_componente` (TENANT — catálogo, sembrado en provisioning)

Tipos de hardware que puede tener un equipo informático.

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `id` | `uuid` | NOT NULL | PK, UUIDv7 | — |
| `codigo` | `varchar(50)` | NOT NULL | UNIQUE | Ej. `CPU`, `RAM`, `DISCO`, `MONITOR`, `TECLADO`, `MOUSE`, `GPU`, `FUENTE` |
| `nombre` | `varchar(100)` | NOT NULL | — | Label human-readable |
| `activo` | `boolean` | NOT NULL | DEFAULT TRUE | — |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `deleted_at` | `timestamptz` | NULL | — | Ver patrón compartido |

**Seeds obligatorios:** `CPU`, `RAM`, `DISCO`, `MONITOR`, `TECLADO`, `MOUSE`, `GPU`, `FUENTE`, `IMPRESORA`, `RED`.

---

### Tabla `equipos_informaticos` (TENANT)

Inventario de equipos. Cada equipo puede ubicarse físicamente en una `ubicacion_id` (FK a la
tabla `ubicaciones` del módulo reparaciones, que vive en el mismo schema tenant).

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `id` | `uuid` | NOT NULL | PK, UUIDv7 | — |
| `nombre` | `varchar(255)` | NOT NULL | — | Nombre o identificador descriptivo (ej. "PC Contabilidad 03") |
| `numero_serie` | `varchar(100)` | NULL | UNIQUE WHERE NOT NULL AND deleted_at IS NULL | Número de serie del fabricante (único solo entre equipos activos) |
| `marca` | `varchar(100)` | NULL | — | Fabricante (ej. Dell, HP, Lenovo) |
| `modelo` | `varchar(100)` | NULL | — | Modelo comercial |
| `fecha_adquisicion` | `date` | NULL | — | Fecha de compra o incorporación al inventario |
| `ubicacion_id` | `uuid` | NULL | FK → `ubicaciones.id` | Ubicación física actual del equipo |
| `asignado_a_id` | `uuid` | NULL | — | Soft ref → `master.usuarios.id`; usuario que usa el equipo |
| `activo` | `boolean` | NOT NULL | DEFAULT TRUE | FALSE = equipo dado de baja del inventario |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `deleted_at` | `timestamptz` | NULL | — | Ver patrón compartido |

**Índices:**
- `UNIQUE (numero_serie)` WHERE `numero_serie IS NOT NULL AND deleted_at IS NULL` — unicidad solo entre equipos no eliminados (soft-delete libera el número de serie)
- `INDEX (ubicacion_id)` WHERE `ubicacion_id IS NOT NULL`
- `INDEX (asignado_a_id)` WHERE `asignado_a_id IS NOT NULL` — "equipos de este usuario"
- `INDEX (activo)` WHERE `deleted_at IS NULL`

---

### Tabla `componentes_equipo` (TENANT)

Componentes de hardware instalados en un equipo. Un equipo puede tener múltiples componentes
del mismo tipo (ej. dos módulos RAM).

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `id` | `uuid` | NOT NULL | PK, UUIDv7 | — |
| `equipo_id` | `uuid` | NOT NULL | FK → `equipos_informaticos.id` | Equipo al que pertenece |
| `tipo_componente_id` | `uuid` | NOT NULL | FK → `tipos_componente.id` | Tipo de componente |
| `descripcion` | `text` | NULL | — | Descripción adicional (modelo, especificación) |
| `numero_serie` | `varchar(100)` | NULL | — | Número de serie del componente individual |
| `capacidad` | `varchar(100)` | NULL | — | Capacidad/especificación: ej. "16GB DDR4", "1TB NVMe" |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `deleted_at` | `timestamptz` | NULL | — | Ver patrón compartido |

**Índices:**
- `INDEX (equipo_id)` — componentes de un equipo
- `INDEX (tipo_componente_id)` — "todos los discos del inventario"

---

### Tabla `archivos_equipo` (TENANT — join)

Adjuntos asociados a un equipo (fotos, manuales, facturas de compra).

| Columna | Tipo Postgres | Nullability | Restricción / Default |
|---------|--------------|-------------|----------------------|
| `archivo_id` | `uuid` | NOT NULL | FK → `archivos.id` ON DELETE CASCADE |
| `equipo_id` | `uuid` | NOT NULL | FK → `equipos_informaticos.id` ON DELETE CASCADE |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() |

**PK:** `(archivo_id, equipo_id)`  
**Índice:** `INDEX (equipo_id)` — archivos de un equipo

---

### Tabla `ticket_soporte` (TENANT)

Satélite 1:1 del ticket para el flujo SOPORTE/IT. Referencia el equipo afectado.
Puede ser NULL si el ticket de soporte no refiere a un equipo específico (ej. problema de red).

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `id` | `uuid` | NOT NULL | PK, UUIDv7 | — |
| `ticket_id` | `uuid` | NOT NULL | UNIQUE, FK → `tickets.id` | Relación 1:1 con ticket base |
| `equipo_id` | `uuid` | NULL | FK → `equipos_informaticos.id` | Equipo afectado; NULL si no aplica |
| `descripcion_problema` | `text` | NULL | — | Descripción técnica del problema en el equipo |
| `solucion_aplicada` | `text` | NULL | — | Solución técnica aplicada al cerrar |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `deleted_at` | `timestamptz` | NULL | — | Ver patrón compartido |

**Índices:**
- `UNIQUE (ticket_id)` — garantiza relación 1:1
- `INDEX (equipo_id)` WHERE `equipo_id IS NOT NULL` — historial de tickets de un equipo

---

## Requirements

### Requirement: Satélite ticket_soporte para tickets IT

#### Scenario: Creación de ticket SOPORTE genera ticket_soporte simultáneamente
**Given** un caso de uso crea un ticket con `tipo.codigo = 'SOPORTE'`  
**When** se ejecuta la transacción de creación  
**Then** MUST insertar la fila base en `tickets`  
**And** MUST insertar una fila en `ticket_soporte` con `ticket_id` apuntando al nuevo ticket  
**And** `equipo_id` SHOULD ser provisto pero es opcional (puede ser NULL)  
**And** ambas inserciones MUST ocurrir en la MISMA transacción

#### Scenario: equipo_id referenciado debe existir y estar activo
**Given** un caso de uso crea un ticket_soporte con `equipo_id` provisto  
**When** valida los datos  
**Then** MUST verificar que el equipo existe con `activo = TRUE` y `deleted_at IS NULL`  
**And** si el equipo no existe o está inactivo MUST rechazar con HTTP 422

---

### Requirement: Seeds de tipos_componente en provisioning

#### Scenario: Nuevo tenant tiene tipos de componente pre-sembrados
**Given** se completa el provisioning de un nuevo cliente  
**When** se consulta `tipos_componente` en la DB tenant  
**Then** MUST contener al menos los 10 tipos base definidos en el seed de este spec  
**And** todos con `activo = TRUE` y `deleted_at IS NULL`  
**And** el seed MUST ser idempotente (`INSERT ... ON CONFLICT (codigo) DO NOTHING`)

---

### Requirement: Inventario de equipos

#### Scenario: Número de serie único entre equipos activos (cuando provisto)
**Given** existe un equipo ACTIVO (`deleted_at IS NULL`) con `numero_serie = 'SN-DELL-001'`  
**When** se intenta crear otro equipo con el mismo número de serie  
**Then** la DB MUST rechazar con violación de UNIQUE (índice WHERE NOT NULL AND deleted_at IS NULL)  
**And** el caso de uso MUST devolver HTTP 409  
**Note**: la unicidad aplica SOLO entre equipos vivos. Si el equipo con 'SN-DELL-001' fue soft-deleted, un nuevo equipo puede usar el mismo número de serie (re-alta permitida).

#### Scenario: Equipo sin número de serie es válido
**Given** no todos los equipos tienen número de serie legible  
**When** se crea un equipo con `numero_serie = NULL`  
**Then** la inserción MUST ser exitosa  
**And** MUST NOT violar el constraint UNIQUE (el UNIQUE parcial solo aplica WHERE `numero_serie IS NOT NULL`)

#### Scenario: asignado_a_id validado como usuario activo del tenant
**Given** `AsignarEquipoUseCase` recibe `asignado_a_id = {uuid}`  
**When** valida los datos  
**Then** MUST verificar que `{uuid}` existe en `master.usuarios` con `activo = TRUE` y `deleted_at IS NULL`  
**And** MUST verificar que el usuario pertenece al mismo cliente (tenant)  
**And** si no se cumple MUST rechazar con HTTP 422

#### Scenario: Soft delete de equipo no borra historial de tickets
**Given** un equipo con tickets de soporte asociados en su historial  
**When** se aplica soft delete al equipo (`activo = FALSE`, `deleted_at = now()`)  
**Then** los `ticket_soporte` que referencian ese equipo MUST permanecer intactos  
**And** `equipos_informaticos.deleted_at` MUST ser seteado  
**And** MUST NOT eliminarse físicamente ni cascadearse el delete a tickets

---

### Requirement: Componentes de equipo

#### Scenario: Múltiples componentes del mismo tipo en un equipo
**Given** un equipo informático  
**When** se agregan dos módulos RAM  
**Then** MUST existir dos filas en `componentes_equipo` con el mismo `equipo_id` y `tipo_componente_id` apuntando a `RAM`  
**And** cada fila MUST tener un `id` UUIDv7 propio

#### Scenario: Soft delete de componente no afecta el equipo
**Given** un componente de equipo  
**When** se aplica soft delete al componente  
**Then** `componentes_equipo.deleted_at` MUST ser seteado  
**And** el equipo MUST permanecer activo  
**And** los demás componentes MUST permanecer sin cambios

#### Scenario: Tipo de componente inactivo no bloquea componentes existentes
**Given** un tipo de componente con `activo = FALSE`  
**When** se consultan los componentes existentes de ese tipo  
**Then** los `componentes_equipo` existentes MUST seguir siendo accesibles  
**And** MUST NOT usarse para nuevas inserciones de componentes: el caso de uso MUST rechazar con HTTP 422 si se intenta crear un componente con un `tipo_componente_id` inactivo

---

### Requirement: Adjuntos de equipos vía IFileStorage

#### Scenario: Adjunto de equipo guarda solo metadata en DB
**Given** un técnico adjunta la foto de un equipo  
**When** el caso de uso procesa el upload  
**Then** MUST subir el binario a `IFileStorage`  
**And** MUST insertar fila en `archivos` con metadata  
**And** MUST insertar fila en `archivos_equipo` asociando `archivo_id` con `equipo_id`  
**And** MUST NOT almacenar contenido binario en ninguna columna

---

### Requirement: Relación equipo ↔ ubicación

#### Scenario: Ubicación del equipo referenciada debe existir
**Given** un caso de uso asigna o crea un equipo con `ubicacion_id = {uuid}`  
**When** valida los datos  
**Then** MUST verificar que la ubicación existe en `ubicaciones` con `deleted_at IS NULL` y `activo = TRUE`  
**And** si no existe MUST rechazar con HTTP 422

#### Scenario: Soft delete en ubicación no elimina equipos asignados
**Given** una ubicación con equipos asignados  
**When** se aplica soft delete a la ubicación  
**Then** los equipos que la referencian MUST permanecer con `ubicacion_id` apuntando al UUID de la ubicación eliminada  
**And** el caso de uso de consulta de equipos MUST indicar que la ubicación está inactiva  
**And** MUST NOT hacer cascade delete hacia los equipos
