# Spec: Clientes y Tenancy

> Módulo: `clientes`  
> Schema: **MASTER** (DB global única)  
> Flujos afectados: CORE (todos)  
> Campos de auditoría y patrón de IDs: ver `specs/_shared-audit-pattern.md`

## Contexto

La separación de tenants es **física**: cada cliente tiene su propia base de datos Postgres.
La DB master centraliza el catálogo de clientes (tenants), los ciclos vigentes globales y la
identidad/autorización. Las tablas de este módulo NUNCA se replican en DBs tenant.

---

## Modelo de datos

### Tabla `clientes` (MASTER)

Catálogo de tenants. Cada fila representa una organización cliente con su propia DB operativa.

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `id` | `uuid` | NOT NULL | PK, UUIDv7 | Identificador técnico |
| `nombre` | `varchar(255)` | NOT NULL | — | Nombre comercial del cliente |
| `razon_social` | `varchar(255)` | NULL | — | Razón social legal (opcional) |
| `cuit` | `varchar(13)` | NULL | UNIQUE | CUIT sin guiones (11 dígitos) |
| `db_name` | `varchar(100)` | NOT NULL | UNIQUE | Nombre de la DB Postgres del tenant |
| `activo` | `boolean` | NOT NULL | DEFAULT TRUE | FALSE = tenant suspendido (no puede loguear) |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `deleted_at` | `timestamptz` | NULL | — | Ver patrón compartido (soft delete) |

**Índices:**
- `UNIQUE (db_name)` — routing de tenants en runtime
- `UNIQUE (cuit)` WHERE `cuit IS NOT NULL` — integridad de CUIT sin bloquear nulls
- `INDEX (activo)` — filtro rápido en TenantGuard

---

### Tabla `ciclos_vigentes` (MASTER)

Catálogo global de ciclos de gestión (ej. año fiscal, cuatrimestre). Los tenants referencian
estos ciclos mediante soft ref en `tenant.ciclos_cliente.ciclo_vigente_id`.

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `id` | `uuid` | NOT NULL | PK, UUIDv7 | Identificador técnico |
| `nombre` | `varchar(100)` | NOT NULL | — | Ej. "Ejercicio 2026" |
| `fecha_inicio` | `date` | NOT NULL | — | Inicio del ciclo (sin hora, zona local) |
| `fecha_fin` | `date` | NOT NULL | — | Fin del ciclo (inclusive) |
| `activo` | `boolean` | NOT NULL | DEFAULT TRUE | Solo un ciclo activo vigente a la vez (validado en app) |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `deleted_at` | `timestamptz` | NULL | — | Ver patrón compartido |

**Índices:**
- `INDEX (activo)` — búsqueda del ciclo vigente corriente
- `INDEX (fecha_inicio, fecha_fin)` — rango para validación de solapamiento

**Constraint de negocio (en app, no en DB):** Los rangos de fecha de ciclos activos NO deben
solaparse. Validado en `CicloVigenteUseCase` antes de la inserción.

---

## Requirements

### Requirement: Identificación única del tenant por db_name

#### Scenario: db_name debe ser único en el sistema
**Given** existe un cliente con `db_name = 'soporte_acme'` en master  
**When** se intenta crear otro cliente con el mismo `db_name`  
**Then** la DB MUST rechazar la inserción con violación de constraint UNIQUE  
**And** el caso de uso MUST devolver error de conflicto (HTTP 409) sin llegar a la DB

#### Scenario: db_name es el puntero de routing en runtime
**Given** un usuario autenticado cuyo JWT contiene `cliente_id`  
**When** el TenantGuard procesa la request  
**Then** MUST resolver `db_name` consultando `master.clientes` WHERE `id = cliente_id`  
**And** MUST verificar que `activo = TRUE` y `deleted_at IS NULL`  
**And** MUST obtener `TenantPrismaClient` usando `db_name` como discriminador de conexión

---

### Requirement: Suspensión de tenant

#### Scenario: Cliente inactivo es rechazado en autenticación
**Given** un cliente con `activo = FALSE` en master  
**When** un usuario de ese cliente intenta hacer login  
**Then** el sistema MUST rechazar el intento con error de autenticación (HTTP 401/403)  
**And** MUST NOT generar JWT ni refresh token

#### Scenario: Cliente suspendido en mid-sesión
**Given** un usuario tiene un JWT válido de un cliente que se acaba de desactivar (`activo = FALSE`)  
**When** el usuario realiza una request a un endpoint tenant  
**Then** el TenantGuard MUST detectar `activo = FALSE` al resolver el cliente  
**And** MUST rechazar la request con HTTP 403  
**And** MUST NOT acceder a la DB tenant

---

### Requirement: Soft delete de clientes

#### Scenario: Baja de cliente no destruye datos
**Given** un cliente activo con su DB tenant conteniendo tickets y operaciones  
**When** el administrador ejecuta la baja del cliente  
**Then** `master.clientes.deleted_at` MUST ser seteado a `now()`  
**And** `activo` MUST ser seteado a `FALSE` en la misma operación  
**And** la DB tenant del cliente MUST permanecer intacta (no se dropea automáticamente)  
**And** la DB tenant MUST ser dada de baja de forma explícita y manual por un proceso separado

---

### Requirement: Provisioning de tenant nuevo

#### Scenario: Alta de cliente provisiona DB, migraciones y seed de catálogos
**Given** un administrador solicita crear un nuevo cliente con nombre y db_name únicos  
**When** `CrearClienteUseCase` orquesta el provisioning  
**Then** MUST crear la DB Postgres `{db_name}` vía `PostgresAdminService`  
**And** MUST aplicar todas las migraciones del schema tenant (`migrate:tenant`) sobre la nueva DB  
**And** MUST sembrar los catálogos operativos: `estados`, `prioridades`, `tipos_ticket`, `tipos_componente`, `tipo_operacion`  
**And** MUST crear el registro en `master.clientes` con `activo = TRUE`  
**And** MUST crear el usuario administrador inicial en `master.usuarios` con `cliente_id` apuntando al nuevo cliente  
**And** cada paso MUST ejecutarse en orden estricto: crear DB → migraciones → seed → alta en master

#### Scenario: Provisioning fallido dispara rollback compensatorio
**Given** el provisioning de un nuevo cliente falla en cualquier paso intermedio  
**When** el `CrearClienteUseCase` detecta el error  
**Then** MUST ejecutar compensación: drop de la DB tenant si fue creada  
**And** MUST NOT dejar el registro en `master.clientes` si el provisioning no completó  
**And** MUST reportar el error con detalle del paso fallido  
**And** el sistema MUST quedar en un estado consistente (sin tenant a medio provisionar)

#### Scenario: Seed de catálogos por tenant es idempotente
**Given** el proceso de seed de catálogos se ejecuta sobre una DB tenant  
**When** se ejecuta un segundo seed sobre la misma DB (ej. re-run de migración)  
**Then** MUST NOT duplicar filas en las tablas de catálogo  
**And** SHOULD usar `INSERT ... ON CONFLICT DO NOTHING` o `upsert` por código único

---

### Requirement: Ciclos vigentes sin solapamiento

#### Scenario: No se permite crear ciclos con fechas solapadas
**Given** existe un `ciclo_vigente` con fecha_inicio=2026-01-01 y fecha_fin=2026-12-31 y activo=TRUE  
**When** se intenta crear otro ciclo con fecha_inicio=2026-06-01 y fecha_fin=2027-06-30  
**Then** `CicloVigenteUseCase` MUST detectar el solapamiento de rangos  
**And** MUST rechazar la creación con error de validación de negocio (HTTP 422)  
**And** MUST NOT insertar la fila en la DB

#### Scenario: Ciclo vigente soft-deleted es ignorado en validación de solapamiento
**Given** un ciclo vigente con `deleted_at IS NOT NULL` (soft-deleted)  
**When** se valida solapamiento de fechas para un nuevo ciclo  
**Then** el ciclo eliminado MUST NOT ser considerado en la validación  
**And** el nuevo ciclo MUST poder crearse si solo solapa con ciclos soft-deleted
