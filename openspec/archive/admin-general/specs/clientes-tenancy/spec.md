# Spec: Clientes y Tenancy — Delta (change `admin-general`)

> Capability: `clientes-tenancy` (MODIFIED)
> Base spec: `openspec/specs/clientes-tenancy/spec.md`
> Schema: MASTER (clientes, ciclos_vigentes, usuarios) + TENANT (ciclos_cliente)
> Introducido en change: `admin-general` (2026-06-30)

## Contexto

Este delta extiende `openspec/specs/clientes-tenancy/spec.md` sin reemplazarlo. Todos los
requirements de la base permanecen vigentes.

Adiciones en este delta:

| Endpoint | Guard | Nivel de acceso |
|----------|-------|----------------|
| `GET /clientes` | `JwtAuthGuard` + `GlobalAdminGuard` | Solo operador |
| `POST /clientes` | `JwtAuthGuard` + `GlobalAdminGuard` | Solo operador |
| `GET /ciclos` | `JwtAuthGuard` + `PermissionsGuard(ciclo:gestionar)` | ADMINISTRADOR (propio tenant) + operador (via X-Tenant-Id) |
| `POST /ciclos` | `JwtAuthGuard` + `PermissionsGuard(ciclo:gestionar)` | ADMINISTRADOR + operador |
| `PATCH /ciclos/:id/activar` | `JwtAuthGuard` + `PermissionsGuard(ciclo:gestionar)` | ADMINISTRADOR + operador |
| `GET /usuarios` | `JwtAuthGuard` + `PermissionsGuard(usuario:gestionar)` | ADMINISTRADOR (propio tenant) + operador |
| `POST /usuarios` | `JwtAuthGuard` + `PermissionsGuard(usuario:gestionar)` | ADMINISTRADOR + operador |
| `PATCH /usuarios/:id/baja` | `JwtAuthGuard` + `PermissionsGuard(usuario:gestionar)` | ADMINISTRADOR + operador |

**Aislamiento de tenant (no negociable):** Todos los endpoints de ciclos y usuarios resuelven
el tenant via `TenantGuard` (desde JWT `cliente_id` o header `X-Tenant-Id` cuando `is_global_admin = true`).
Ninguna query cruza múltiples tenant DBs.

**Migración inicial:** una migración idempotente designa a `nestor@sesitec.com.ar` como
`is_global_admin = true` en `master.usuarios`.

---

## Requirements

### Requirement: GET /clientes — listar todos los tenants (solo operador)

`GET /clientes` devuelve el listado de todos los clientes en `master.clientes`. Solo usuarios
con `is_global_admin = true` pueden acceder a este endpoint.

#### Scenario: Operador obtiene la lista de todos los clientes

**Given** un usuario con `is_global_admin = true`
**When** llama a `GET /clientes`
**Then** MUST devolver HTTP 200 con un array de clientes de `master.clientes`
**And** MUST incluir clientes con `deleted_at IS NULL` (activos y suspendidos)
**And** MUST NOT incluir clientes con `deleted_at IS NOT NULL`
**And** cada ítem MUST incluir como mínimo: `id`, `nombre`, `activo`, `db_name`, `created_at`
**And** MUST NOT exponer contraseñas, tokens ni datos sensibles de usuarios

#### Scenario: ADMINISTRADOR sin is_global_admin es rechazado con 403

**Given** un usuario con rol `ADMINISTRADOR` y `is_global_admin = false`
**When** llama a `GET /clientes`
**Then** MUST devolver HTTP 403
**And** MUST NOT devolver ningún dato de clientes

#### Scenario: Request sin autenticación es rechazada con 401

**Given** una request a `GET /clientes` sin header Authorization
**When** `JwtAuthGuard` evalúa la request
**Then** MUST devolver HTTP 401

#### Scenario: Lista vacía devuelve array vacío, no 404

**Given** `master.clientes` no tiene registros con `deleted_at IS NULL`
**When** el operador llama a `GET /clientes`
**Then** MUST devolver HTTP 200 con `{ "data": [] }`
**And** MUST NOT devolver HTTP 404

---

### Requirement: POST /clientes — provisioning de nuevo tenant (solo operador)

`POST /clientes` provisiona un nuevo tenant usando el `CrearClienteUseCase` existente. El contrato
de provisioning (DB → migraciones → seed → master.clientes → usuario ADMINISTRADOR inicial) está
especificado en la base spec bajo "Provisioning de tenant nuevo". Este requirement agrega solo
la interfaz HTTP y las validaciones de input.

**Campos requeridos en el body:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `nombre` | string | Nombre comercial del cliente |
| `db_name` | string | Identificador único de DB (slug) |
| `adminEmail` | string (email válido) | Email del usuario ADMINISTRADOR inicial |
| `adminNombre` | string | Nombre del admin inicial |
| `adminApellido` | string | Apellido del admin inicial |
| `adminPassword` | string | Contraseña del admin inicial (se hashea en server) |

#### Scenario: Operador provisiona un cliente nuevo exitosamente

**Given** un usuario con `is_global_admin = true`
**And** el body contiene `nombre`, `db_name` únicos, `adminEmail` no registrado, y los campos de admin
**When** llama a `POST /clientes`
**Then** MUST devolver HTTP 201
**And** `CrearClienteUseCase` MUST ejecutar la secuencia de provisioning completa:
  DB → migraciones → seed → `master.clientes` → `master.usuarios` admin con rol `ADMINISTRADOR`
**And** la respuesta MUST incluir: `id`, `nombre`, `db_name`, `activo: true` del cliente creado
**And** `adminPassword` MUST NOT aparecer en ningún campo de la respuesta

#### Scenario: db_name duplicado es rechazado con 409

**Given** un usuario con `is_global_admin = true`
**And** ya existe un cliente con `db_name = 'soporte_acme'`
**When** llama a `POST /clientes` con `db_name = 'soporte_acme'`
**Then** MUST devolver HTTP 409
**And** MUST NOT crear ninguna DB ni insertar ningún registro
**And** el error MUST indicar que el conflicto es en `db_name`

#### Scenario: adminEmail ya registrado es rechazado con 409

**Given** ya existe un usuario con `email = 'admin@empresa.com'` en `master.usuarios`
**When** el operador llama a `POST /clientes` con `adminEmail = 'admin@empresa.com'`
**Then** MUST devolver HTTP 409
**And** MUST NOT ejecutar ningún paso de provisioning
**And** el error MUST indicar el conflicto en `adminEmail`

#### Scenario: Fallo de provisioning activa rollback compensatorio

**Given** el proceso de provisioning falla en cualquier paso intermedio (ej. error de migración)
**When** `CrearClienteUseCase` detecta el error
**Then** MUST ejecutar la compensación: drop de la DB tenant si fue creada
**And** MUST NOT dejar el registro en `master.clientes` si el provisioning no completó
**And** MUST devolver HTTP 500 con detalle del paso fallido
**And** el sistema MUST quedar en estado consistente (sin tenant a medio provisionar)

#### Scenario: Provisioning es idempotente ante re-ejecución con los mismos datos (no duplica)

**Given** el provisioning de un cliente ya fue completado con `db_name = 'soporte_acme'`
**When** el operador intenta provisionarlo de nuevo con el mismo `db_name`
**Then** MUST devolver HTTP 409 (conflict en db_name)
**And** MUST NOT crear un segundo tenant ni duplicar datos

#### Scenario: No-operador es rechazado con 403

**Given** un usuario con rol `ADMINISTRADOR` y `is_global_admin = false`
**When** llama a `POST /clientes`
**Then** MUST devolver HTTP 403
**And** MUST NOT ejecutar `CrearClienteUseCase`

---

### Requirement: GET /ciclos — listar ciclos del tenant resuelto

`GET /ciclos` devuelve los ciclos del tenant resuelto por `TenantGuard`. El tenant se resuelve
desde el JWT `cliente_id` (para ADMINISTRADOR) o desde el header `X-Tenant-Id` (para operador).

#### Scenario: ADMINISTRADOR lista ciclos de su propio tenant

**Given** un usuario con rol `ADMINISTRADOR` (tiene `ciclo:gestionar`) y `is_global_admin = false`
**When** llama a `GET /ciclos`
**Then** `TenantGuard` MUST resolver el tenant al `cliente_id` propio del usuario
**And** MUST devolver HTTP 200 con los ciclos de ese tenant únicamente
**And** MUST NOT incluir ciclos de otros tenants
**And** cada ítem MUST incluir: `id`, `nombre`, `fecha_inicio`, `fecha_fin`, `activo`

#### Scenario: Operador lista ciclos de un tenant objetivo via X-Tenant-Id

**Given** un usuario con `is_global_admin = true`
**And** la request incluye `X-Tenant-Id: {tenantB_cliente_id}`
**When** llama a `GET /ciclos`
**Then** `TenantGuard` MUST resolver el tenant a `tenantB`
**And** MUST devolver HTTP 200 con los ciclos de `tenantB` únicamente
**And** MUST NOT incluir ciclos de ningún otro tenant

#### Scenario: Usuario sin ciclo:gestionar es rechazado con 403

**Given** un usuario con rol `USUARIO` (no tiene `ciclo:gestionar`)
**When** llama a `GET /ciclos`
**Then** MUST devolver HTTP 403

#### Scenario: Sin ciclos existentes devuelve array vacío

**Given** el tenant resuelto no tiene ningún ciclo
**When** un usuario autorizado llama a `GET /ciclos`
**Then** MUST devolver HTTP 200 con `{ "data": [] }`
**And** MUST NOT devolver HTTP 404

---

### Requirement: POST /ciclos — crear ciclo en el tenant resuelto

`POST /ciclos` crea un nuevo ciclo en el tenant resuelto, reutilizando el use case
`CrearCicloVigente` existente. La validación de solapamiento de fechas especificada en la
base spec permanece vigente.

**Campos requeridos en el body:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `nombre` | string | Nombre del ciclo |
| `fecha_inicio` | date (ISO 8601) | Fecha de inicio |
| `fecha_fin` | date (ISO 8601) | Fecha de fin (debe ser > fecha_inicio) |

#### Scenario: ADMINISTRADOR crea un ciclo para su propio tenant

**Given** un usuario con rol `ADMINISTRADOR` y el body contiene `nombre`, `fecha_inicio`, `fecha_fin` válidos
**And** las fechas no solapan con ningún ciclo activo existente
**When** llama a `POST /ciclos`
**Then** MUST devolver HTTP 201
**And** el ciclo MUST crearse en el contexto del tenant propio del ADMINISTRADOR
**And** `activo` MUST ser `FALSE` por defecto (activación es acción separada)
**And** la respuesta MUST incluir el `id` del ciclo creado

#### Scenario: Fechas solapadas son rechazadas con 422

**Given** ya existe un ciclo activo con fechas que solapan con las fechas del nuevo ciclo
**When** un usuario autorizado llama a `POST /ciclos`
**Then** MUST devolver HTTP 422
**And** MUST NOT insertar ningún registro

#### Scenario: fecha_fin anterior a fecha_inicio es rechazada con 400

**Given** el body contiene `fecha_fin` anterior a `fecha_inicio`
**When** el endpoint procesa la request
**Then** MUST devolver HTTP 400
**And** MUST NOT crear ningún ciclo

---

### Requirement: PATCH /ciclos/:id/activar — marcar ciclo como activo

`PATCH /ciclos/:id/activar` activa el ciclo especificado en el tenant resuelto. Al activar un ciclo,
todos los demás ciclos del mismo tenant MUST quedar con `activo = FALSE` en la misma transacción.
Solo un ciclo puede estar activo por tenant a la vez.

#### Scenario: ADMINISTRADOR activa un ciclo de su propio tenant

**Given** un usuario con rol `ADMINISTRADOR`
**And** el tenant tiene 3 ciclos (A, B, C), con B actualmente activo
**When** llama a `PATCH /ciclos/{id_A}/activar`
**Then** MUST devolver HTTP 200
**And** el ciclo A MUST tener `activo = TRUE`
**And** los ciclos B y C MUST tener `activo = FALSE`
**And** ambas operaciones MUST ocurrir en una única transacción de Postgres
  (rollback completo si cualquiera falla)

#### Scenario: Activar ciclo de otro tenant es rechazado con 404

**Given** un usuario con rol `ADMINISTRADOR` para tenant A
**And** el ciclo X pertenece a tenant B (DB diferente)
**When** llama a `PATCH /ciclos/{id_X}/activar`
**Then** MUST devolver HTTP 404 (ciclo no encontrado en el contexto de tenant A)
**And** MUST NOT modificar ningún dato de tenant B

#### Scenario: Ciclo inexistente devuelve 404

**Given** un usuario autorizado
**When** llama a `PATCH /ciclos/{uuid_inexistente}/activar`
**Then** MUST devolver HTTP 404

#### Scenario: Operador puede activar un ciclo de cualquier tenant via X-Tenant-Id

**Given** un usuario con `is_global_admin = true`
**And** la request incluye `X-Tenant-Id: {tenantB_cliente_id}`
**And** el ciclo Y pertenece al tenant B
**When** llama a `PATCH /ciclos/{id_Y}/activar`
**Then** MUST devolver HTTP 200
**And** el ciclo Y MUST tener `activo = TRUE` en tenant B
**And** todos los demás ciclos de tenant B MUST tener `activo = FALSE`
**And** MUST NOT modificar ningún ciclo de otro tenant

---

### Requirement: POST /usuarios — crear usuario en el tenant resuelto

`POST /usuarios` crea un nuevo usuario en `master.usuarios` asociado al `cliente_id` del tenant
resuelto. El `cliente_id` se resuelve server-side desde el JWT o `X-Tenant-Id` — NUNCA del body.
El password se almacena como hash argon2id (invariante de la base spec `auth-rbac`).

**Campos requeridos en el body:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `email` | string (email válido) | Email de acceso |
| `nombre` | string | Nombre de pila |
| `apellido` | string | Apellido |
| `password` | string | Contraseña (se hashea server-side) |
| `rol` | `USUARIO` \| `COLABORADOR` \| `TECNICO` \| `ADMINISTRADOR` | Rol asignado |

#### Scenario: ADMINISTRADOR crea un usuario en su propio tenant

**Given** un usuario con rol `ADMINISTRADOR` y `is_global_admin = false`
**And** el body contiene campos válidos con `rol = 'TECNICO'`
**When** llama a `POST /usuarios`
**Then** MUST devolver HTTP 201
**And** MUST insertar en `master.usuarios`:
  - `cliente_id` = `{cliente_id del ADMINISTRADOR}` (no del body)
  - `activo = TRUE`
  - `is_global_admin = FALSE`
  - `password_hash` = hash argon2id de la contraseña provista
  - `deleted_at = NULL`
**And** MUST asignar el rol `TECNICO` en `master.usuarios_roles`
**And** MUST NOT permitir que `is_global_admin = TRUE` se establezca via este endpoint

#### Scenario: Operador crea un usuario para un tenant objetivo via X-Tenant-Id

**Given** un usuario con `is_global_admin = true`
**And** la request incluye `X-Tenant-Id: {tenantB_cliente_id}`
**When** llama a `POST /usuarios` con body válido
**Then** MUST crear el usuario con `cliente_id = {tenantB_cliente_id}`
**And** MUST NOT crear el usuario bajo el tenant propio del operador

#### Scenario: Email duplicado es rechazado con 409

**Given** ya existe un usuario con `email = 'user@example.com'` en `master.usuarios`
**When** un usuario autorizado llama a `POST /usuarios` con `email = 'user@example.com'`
**Then** MUST devolver HTTP 409
**And** MUST NOT insertar ninguna fila

#### Scenario: Rol inválido es rechazado con 400

**Given** el body contiene `rol = 'SUPER_ADMIN'` (valor no válido)
**When** el endpoint procesa la request
**Then** MUST devolver HTTP 400
**And** MUST NOT crear ningún usuario

#### Scenario: Usuario sin usuario:gestionar es rechazado con 403

**Given** un usuario con rol `TECNICO` (no tiene `usuario:gestionar`)
**When** llama a `POST /usuarios`
**Then** MUST devolver HTTP 403

#### Scenario: password nunca aparece en la respuesta

**Given** el body incluye `password = 'secreto123'`
**When** el endpoint devuelve HTTP 201
**Then** la respuesta MUST NOT incluir el campo `password` ni `password_hash`
**And** MUST NOT loguear el password en texto plano

---

### Requirement: GET /usuarios — listar usuarios del tenant resuelto

`GET /usuarios` devuelve los usuarios de `master.usuarios` filtrados por el `cliente_id` del
tenant resuelto.

#### Scenario: ADMINISTRADOR lista usuarios de su propio tenant

**Given** un usuario con rol `ADMINISTRADOR` y `is_global_admin = false` para tenant A
**When** llama a `GET /usuarios`
**Then** MUST devolver HTTP 200 con usuarios WHERE `master.usuarios.cliente_id = tenantA.id`
**And** MUST NOT incluir usuarios de otros tenants
**And** MUST incluir usuarios con `deleted_at IS NULL` únicamente (soft-deleted excluidos)
**And** MUST incluir tanto usuarios con `activo = TRUE` como `activo = FALSE` (administrador ve inactivos)
**And** MUST NOT incluir `password_hash` en ningún campo de la respuesta

#### Scenario: Operador lista usuarios de un tenant objetivo via X-Tenant-Id

**Given** un usuario con `is_global_admin = true`
**And** la request incluye `X-Tenant-Id: {tenantB_cliente_id}`
**When** llama a `GET /usuarios`
**Then** MUST devolver HTTP 200 con usuarios de tenant B únicamente
**And** MUST NOT incluir usuarios de ningún otro tenant

#### Scenario: La respuesta nunca expone password_hash

**Given** cualquier usuario autorizado llama a `GET /usuarios`
**When** se devuelve la respuesta
**Then** MUST NOT incluir `password_hash` en ningún objeto de usuario
**And** MUST NOT incluir ningún derivado de contraseña

---

### Requirement: PATCH /usuarios/:id/baja — baja lógica de usuario

`PATCH /usuarios/:id/baja` desactiva una cuenta de usuario. Delega en el requirement "Soft delete
en usuarios" de la base spec `auth-rbac`: setea `deleted_at = now()`, `activo = FALSE`, y revoca
todos los refresh tokens del usuario en la misma operación.

#### Scenario: ADMINISTRADOR da de baja a un usuario de su propio tenant

**Given** un usuario con rol `ADMINISTRADOR` para tenant A
**And** el usuario objetivo pertenece a tenant A con `activo = TRUE`
**When** llama a `PATCH /usuarios/{userId}/baja`
**Then** MUST devolver HTTP 200
**And** `master.usuarios.activo` MUST ser `FALSE` para el usuario objetivo
**And** `master.usuarios.deleted_at` MUST ser `now()`
**And** TODOS los `master.refresh_tokens` del `usuario_id` MUST tener `revoked_at = now()`
**And** las tres operaciones MUST ejecutarse en la misma transacción de Postgres

#### Scenario: ADMINISTRADOR no puede dar de baja a un usuario de otro tenant

**Given** un usuario con rol `ADMINISTRADOR` para tenant A
**And** el usuario objetivo pertenece a tenant B
**When** llama a `PATCH /usuarios/{userId}/baja`
**Then** MUST devolver HTTP 404 (usuario no encontrado en el contexto de tenant A)
**And** MUST NOT modificar ningún dato del usuario de tenant B

#### Scenario: ADMINISTRADOR no puede darse de baja a sí mismo

**Given** un usuario con rol `ADMINISTRADOR`
**When** llama a `PATCH /usuarios/{su_propio_userId}/baja`
**Then** MUST devolver HTTP 422 con mensaje indicando que no puede darse de baja a sí mismo
**And** MUST NOT modificar su propia cuenta

#### Scenario: Baja de usuario ya dado de baja es idempotente

**Given** el usuario objetivo ya tiene `deleted_at IS NOT NULL`
**When** un usuario autorizado llama a `PATCH /usuarios/{userId}/baja`
**Then** MUST devolver HTTP 200 (no-op, idempotente)
**And** MUST NOT modificar `deleted_at` ni `activo` nuevamente
**And** MUST NOT revocar tokens una segunda vez

#### Scenario: Usuario sin usuario:gestionar es rechazado con 403

**Given** un usuario con rol `TECNICO` (no tiene `usuario:gestionar`)
**When** llama a `PATCH /usuarios/{userId}/baja`
**Then** MUST devolver HTTP 403

---

### Requirement: Migración idempotente designa admin global inicial

Una migración idempotente MUST actualizar `is_global_admin = TRUE` para el usuario con
`email = 'nestor@sesitec.com.ar'` en `master.usuarios`. Si el email no existe, la migración
MUST ser un no-op (sin error).

Esta es una migración de datos operacional, no una migración de schema. MUST usar una sentencia
`UPDATE ... WHERE email = '...'` (sin INSERT). La migración no depende de que el usuario exista.

#### Scenario: Migración establece is_global_admin para el operador designado

**Given** `master.usuarios` tiene una fila con `email = 'nestor@sesitec.com.ar'`
**And** esa fila tiene `is_global_admin = FALSE`
**When** la migración `20260630_set_global_admin_nestor` se ejecuta
**Then** `is_global_admin` MUST ser `TRUE` para ese email
**And** todas las demás columnas de esa fila (`nombre`, `apellido`, `activo`, `cliente_id`, etc.)
  MUST permanecer sin cambios

#### Scenario: Migración es idempotente

**Given** la migración ya fue aplicada y `nestor@sesitec.com.ar` tiene `is_global_admin = TRUE`
**When** la migración se ejecuta nuevamente (ej. re-deploy)
**Then** MUST completar sin error
**And** `is_global_admin` MUST permanecer `TRUE` para ese email
**And** ninguna otra fila MUST ser modificada

#### Scenario: Migración es no-op cuando el email no existe

**Given** `master.usuarios` NO tiene ninguna fila con `email = 'nestor@sesitec.com.ar'`
**When** la migración se ejecuta
**Then** MUST completar sin error
**And** MUST NOT insertar ninguna fila
**And** todas las filas existentes MUST permanecer sin cambios

#### Scenario: Después de la migración, el operador puede autenticarse como global admin

**Given** la migración ha sido aplicada
**And** `nestor@sesitec.com.ar` tiene credenciales válidas
**When** el usuario hace login
**Then** el JWT MUST contener `is_global_admin: true`
**And** el usuario MUST poder acceder a endpoints protegidos por `GlobalAdminGuard`
