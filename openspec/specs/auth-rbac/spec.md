# Spec: Autenticación y RBAC

> Módulo: `auth`  
> Schema: **MASTER** (DB global única)  
> Flujos afectados: CORE (todos)  
> Campos de auditoría y patrón de IDs: ver `specs/_shared-audit-pattern.md`

## Contexto

Autenticación y autorización son **globales**: una única superficie de login, centralizada en
master, que enruta al tenant correcto vía JWT. El modelo de permisos es **RBAC con permisos
granulares**: roles reutilizables + permisos atómicos `recurso:accion` + tabla de elegibilidad
de ticket por usuario (`usuario_tipos_ticket` en cada DB tenant).

`usuario_tipos_ticket` vive en la DB **tenant** porque es operativo (qué tipos atiende un
usuario en ese cliente). Los datos de identidad y RBAC son exclusivamente de master.

---

## Modelo de datos

### Tabla `usuarios` (MASTER)

Identidad global de todos los usuarios del sistema. Un usuario pertenece a exactamente un
cliente (tenant de origen). El login siempre se valida contra esta tabla.

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `id` | `uuid` | NOT NULL | PK, UUIDv7 | Identificador técnico (viaja en JWTs y soft refs tenant) |
| `email` | `varchar(255)` | NOT NULL | UNIQUE | Email de acceso; login identifier |
| `nombre` | `varchar(100)` | NOT NULL | — | Nombre de pila |
| `apellido` | `varchar(100)` | NOT NULL | — | Apellido |
| `password_hash` | `text` | NOT NULL | — | Hash argon2id; NUNCA plaintext ni MD5 |
| `cliente_id` | `uuid` | NOT NULL | FK → `clientes.id` | Tenant de origen del usuario |
| `activo` | `boolean` | NOT NULL | DEFAULT TRUE | FALSE = cuenta suspendida |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `deleted_at` | `timestamptz` | NULL | — | Ver patrón compartido |

**Índices:**
- `UNIQUE (email)` — login lookup
- `INDEX (cliente_id)` — listado de usuarios por tenant
- `INDEX (activo)` WHERE `deleted_at IS NULL` — filtro de usuarios activos

---

### Tabla `refresh_tokens` (MASTER)

Tokens de renovación de sesión. Almacena el hash del token (nunca el valor crudo).

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `id` | `uuid` | NOT NULL | PK, UUIDv7 | Identificador técnico |
| `usuario_id` | `uuid` | NOT NULL | FK → `usuarios.id` | Propietario del token |
| `token_hash` | `text` | NOT NULL | UNIQUE | SHA-256 del refresh token crudo |
| `expires_at` | `timestamptz` | NOT NULL | — | Expiración del token |
| `revoked_at` | `timestamptz` | NULL | — | NULL = activo; NOT NULL = revocado explícitamente |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `deleted_at` | `timestamptz` | NULL | — | Ver patrón compartido |

**Índices:**
- `UNIQUE (token_hash)` — lookup de renovación O(1)
- `INDEX (usuario_id)` — revocación de todos los tokens de un usuario

---

### Tabla `roles` (MASTER)

Catálogo de roles del sistema. Roles iniciales seeds: `ADMIN`, `SOPORTE_IT`,
`MANTENIMIENTO`, `APROBADOR_COMPRAS`, `SOLICITANTE`.

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `id` | `uuid` | NOT NULL | PK, UUIDv7 | Identificador técnico |
| `codigo` | `varchar(50)` | NOT NULL | UNIQUE | Identificador snake_case en mayúsculas (ej. `APROBADOR_COMPRAS`) |
| `nombre` | `varchar(100)` | NOT NULL | — | Label human-readable |
| `descripcion` | `text` | NULL | — | Descripción del alcance del rol |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `deleted_at` | `timestamptz` | NULL | — | Ver patrón compartido |

---

### Tabla `permisos` (MASTER)

Catálogo de permisos atómicos con convención `recurso:accion`.

Permisos mínimos seeds:

| codigo | Descripción |
|--------|-------------|
| `ticket:crear` | Crear ticket de cualquier tipo |
| `ticket:asignar` | Asignar o reasignar ticket |
| `ticket:cerrar` | Cerrar/cancelar ticket |
| `ticket:ver_todos` | Ver tickets de otros usuarios (no solo los propios) |
| `compra:aprobar` | Aprobar o rechazar ticket de compra |
| `compra:gestionar` | Crear/editar items y presupuestos de compra |
| `subtarea:actualizar` | Marcar subtareas edilicias como completadas |
| `equipo:gestionar` | Alta/baja/modificación de equipos informáticos |
| `usuario:gestionar` | Crear/modificar/desactivar usuarios |
| `rol:asignar` | Asignar o quitar roles a usuarios |
| `cliente:gestionar` | Crear/modificar clientes (solo ROOT/ADMIN global) |

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `id` | `uuid` | NOT NULL | PK, UUIDv7 | Identificador técnico |
| `codigo` | `varchar(100)` | NOT NULL | UNIQUE | `recurso:accion` en minúsculas |
| `descripcion` | `text` | NULL | — | Qué habilita este permiso |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `deleted_at` | `timestamptz` | NULL | — | Ver patrón compartido |

---

### Tabla `roles_permisos` (MASTER)

N:M entre `roles` y `permisos`. Define qué permisos otorga cada rol.

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `rol_id` | `uuid` | NOT NULL | FK → `roles.id` | Rol fuente |
| `permiso_id` | `uuid` | NOT NULL | FK → `permisos.id` | Permiso otorgado |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | Registro de cuándo se otorgó |

**PK:** `(rol_id, permiso_id)`  
**Índices:** `INDEX (permiso_id)` — "qué roles tienen este permiso"

> No se aplica soft delete en esta tabla join: la baja es eliminación física de la fila de asociación.

---

### Tabla `usuarios_roles` (MASTER)

N:M entre `usuarios` y `roles`. Un usuario puede tener múltiples roles simultáneamente.

| Columna | Tipo Postgres | Nullability | Restricción / Default | Descripción |
|---------|--------------|-------------|----------------------|-------------|
| `usuario_id` | `uuid` | NOT NULL | FK → `usuarios.id` | Usuario receptor |
| `rol_id` | `uuid` | NOT NULL | FK → `roles.id` | Rol asignado |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | Registro de cuándo se asignó |

**PK:** `(usuario_id, rol_id)`  
**Índices:** `INDEX (rol_id)` — "qué usuarios tienen este rol"

> No se aplica soft delete en esta tabla join: la baja es eliminación física de la fila de asociación.

---

## Requirements

### Requirement: Autenticación con contraseña segura

#### Scenario: Password almacenado como hash argon2id
**Given** se crea o actualiza la contraseña de un usuario  
**When** el dato se persiste en la DB  
**Then** `password_hash` MUST contener el hash argon2id de la contraseña  
**And** la contraseña en texto plano MUST NOT aparecer en ninguna columna, log ni respuesta API

#### Scenario: Login exitoso genera JWT y refresh token
**Given** un usuario activo con `activo = TRUE`, `deleted_at IS NULL`, y `clientes.activo = TRUE`  
**When** envía credenciales correctas (email + password)  
**Then** el sistema MUST verificar el hash argon2id  
**And** MUST generar un JWT de acceso con payload: `{ sub: usuario.id, cliente_id, email, roles: [codigo], permisos: [codigo], cliente_nombre }`  
**And** MUST generar un refresh token aleatorio y almacenar su `token_hash` (SHA-256) en `refresh_tokens`  
**And** MUST devolver ambos tokens en la respuesta (access token en body; refresh token SHOULD ser httpOnly cookie)

#### Scenario: Login de usuario inactivo es rechazado
**Given** un usuario con `activo = FALSE` o `deleted_at IS NOT NULL`  
**When** intenta hacer login con credenciales correctas  
**Then** el sistema MUST devolver HTTP 401  
**And** MUST NOT generar tokens  
**And** MUST NOT revelar si la cuenta existe o está desactivada (mensaje genérico)

#### Scenario: Login de usuario con cliente inactivo es rechazado
**Given** un usuario con credenciales válidas cuyo `cliente_id` apunta a un cliente con `activo = FALSE`  
**When** intenta hacer login  
**Then** el sistema MUST devolver HTTP 403  
**And** MUST NOT generar tokens

---

### Requirement: Renovación y revocación de refresh tokens

#### Scenario: Refresh token válido renueva el JWT
**Given** un refresh token no expirado, no revocado y no soft-deleted  
**When** el cliente lo envía al endpoint de renovación  
**Then** el sistema MUST verificar `token_hash` en la DB  
**And** MUST verificar que `expires_at > now()` y `revoked_at IS NULL`  
**And** MUST re-validar que `cliente.activo = TRUE` antes de re-firmar (ver Requirement "Claim `cliente_nombre` en JWT")  
**And** MUST emitir un nuevo JWT de acceso con `cliente_nombre` incluido  
**And** SHOULD rotar el refresh token (revocar el anterior, emitir uno nuevo)

#### Scenario: Refresh token expirado es rechazado
**Given** un refresh token con `expires_at < now()`  
**When** se envía al endpoint de renovación  
**Then** MUST devolver HTTP 401  
**And** MUST NOT emitir nuevos tokens

#### Scenario: Revocación de refresh token individual
**Given** un refresh token activo  
**When** el usuario hace logout o se llama al endpoint de revocación  
**Then** MUST setear `revoked_at = now()` en la fila correspondiente  
**And** el token MUST ser rechazado en intentos de renovación posteriores

#### Scenario: Revocación masiva de tokens de un usuario
**Given** un administrador suspende una cuenta de usuario (o el propio usuario desde otro dispositivo)  
**When** se ejecuta la operación de revocación masiva  
**Then** MUST setear `revoked_at = now()` en TODOS los `refresh_tokens` del `usuario_id`  
**And** el usuario MUST ser forzado a re-autenticarse

---

### Requirement: Permisos efectivos como unión de roles

#### Scenario: Usuario con múltiples roles tiene unión de permisos
**Given** un usuario con roles `SOPORTE_IT` (permisos: `ticket:crear`, `ticket:ver_todos`) y `APROBADOR_COMPRAS` (permisos: `ticket:crear`, `compra:aprobar`)  
**When** el sistema calcula sus permisos efectivos para incluir en el JWT  
**Then** el payload MUST contener `permisos: ['ticket:crear', 'ticket:ver_todos', 'compra:aprobar']` (unión, sin duplicados)

#### Scenario: Permiso efectivo resuelto sin query a DB en cada request
**Given** el JWT del usuario contiene los códigos de roles y permisos  
**When** un guard evalúa si el usuario tiene `compra:aprobar`  
**Then** MUST verificar contra el claim `permisos` del JWT  
**And** MUST NOT realizar una query a la DB master para resolver permisos en cada request

---

### Requirement: Guards encadenados en NestJS

#### Scenario: Request sin JWT es rechazada en JwtAuthGuard
**Given** un endpoint protegido que requiere autenticación  
**When** llega una request sin `Authorization: Bearer {token}` o con token inválido  
**Then** `JwtAuthGuard` MUST rechazar con HTTP 401  
**And** MUST NOT continuar la cadena de guards

#### Scenario: RolesGuard verifica rol requerido
**Given** un usuario autenticado con rol `SOPORTE_IT` y un endpoint decorado con `@Roles('ADMIN')`  
**When** el request llega  
**Then** `RolesGuard` MUST rechazar con HTTP 403  
**And** MUST NOT ejecutar el handler del controlador

#### Scenario: PermissionsGuard verifica permiso granular
**Given** un usuario autenticado con permiso `ticket:crear` pero sin `compra:aprobar`  
**When** accede a un endpoint decorado con `@RequirePermissions('compra:aprobar')`  
**Then** `PermissionsGuard` MUST rechazar con HTTP 403

---

### Requirement: Seeds iniciales en migración master

#### Scenario: Roles y permisos base sembrados en migración
**Given** la migración inicial del schema master se ejecuta sobre una DB master vacía  
**When** la migración completa  
**Then** `roles` MUST contener al menos: `ADMIN`, `SOPORTE_IT`, `MANTENIMIENTO`, `APROBADOR_COMPRAS`, `SOLICITANTE`  
**And** `permisos` MUST contener todos los permisos listados en la tabla de este spec  
**And** `roles_permisos` MUST contener la asignación base (ej. `ADMIN` tiene todos los permisos)  
**And** el seed MUST ser idempotente (re-ejecución no duplica filas)

---

### Requirement: Claim `cliente_nombre` en JWT (tenant del usuario)

> Introducido en change `auth-cliente-nombre` (2026-06-27)

El JWT de acceso MUST incluir el claim `cliente_nombre` con el nombre del tenant al que pertenece el usuario. El valor se deriva server-side de `usuario.clienteId` — nunca del input del cliente. Este claim permite al frontend mostrar el nombre del tenant sin endpoints adicionales.

**Contrato de tipo:**
- Backend (`i-token.service.ts` — `JwtPayload`): `cliente_nombre: string` (obligatorio, no nullable). El emisor garantiza siempre el valor.
- Frontend (`frontend/src/shared/api/types.ts` — `JwtPayload`): `cliente_nombre?: string` (opcional). Tolera tokens emitidos antes de este change (degradación elegante obligatoria).

#### Scenario: JwtPayload backend incluye `cliente_nombre` como campo requerido

**Given** la interfaz `JwtPayload` del puerto `ITokenService`
**When** se audita su definición de tipos
**Then** MUST existir la propiedad `cliente_nombre` de tipo `string` (no opcional, no nullable)
**And** MUST NOT existir ningún alias alternativo (`n`, `tenant_name`, `tenantName`, etc.) para el nombre del cliente
**And** los campos `sub`, `cliente_id`, `email`, `roles`, `permisos` MUST seguir presentes sin modificación

#### Scenario: JwtPayload frontend refleja `cliente_nombre` como campo opcional

**Given** el tipo `JwtPayload` en `frontend/src/shared/api/types.ts`
**When** se audita su definición de tipos
**Then** MUST existir la propiedad `cliente_nombre?: string` (string, campo opcional)
**And** la ausencia del claim en un token decodificado MUST producir `undefined` (no un error de tipo ni runtime)

---

#### Scenario: Login exitoso incluye `cliente_nombre` correcto en el JWT

**Given** un usuario con `activo = TRUE` y `deleted_at IS NULL`
**And** su cliente tiene `activo = TRUE` y `nombre = "Acme Corp"`
**When** el usuario envía credenciales correctas al endpoint de login
**Then** el JWT de acceso emitido MUST contener `cliente_nombre: "Acme Corp"` en su payload
**And** `cliente_nombre` MUST ser igual a `cliente.nombre` (no `razonSocial`, no `cuit`)
**And** los claims `sub`, `cliente_id`, `email`, `roles`, `permisos` MUST seguir presentes y correctos (sin regresión)

#### Scenario: `cliente_nombre` corresponde exclusivamente al cliente del usuario autenticado

**Given** existen dos clientes activos: `ClienteA` con `nombre = "Acme Corp"` y `ClienteB` con `nombre = "Beta SA"`
**And** `usuarioA` tiene `cliente_id` apuntando a `ClienteA`
**When** `usuarioA` hace login exitosamente
**Then** el JWT emitido MUST contener `cliente_nombre: "Acme Corp"`
**And** MUST NOT contener ningún dato de `ClienteB` en ningún claim

---

#### Scenario: Refresh con cliente inactivo es rechazado — seguridad de tenant suspendido

> Requisito de seguridad: sin este check, un tenant suspendido puede renovar access tokens durante hasta 7 días (duración del refresh token). El refresh DEBE espejar el check de login.

**Given** un refresh token válido de un usuario cuyo cliente tiene `activo = FALSE`
**When** el cliente envía el refresh token al endpoint de renovación
**Then** MUST devolver HTTP 403
**And** MUST NOT emitir ningún JWT ni nuevo refresh token
**And** el use case MUST retornar `ClienteInactivoError` antes de firmar el JWT

#### Scenario: Refresh exitoso mantiene `cliente_nombre` en el nuevo JWT

**Given** un refresh token válido de un usuario cuyo cliente tiene `nombre = "Acme Corp"`
**When** el cliente envía el refresh token al endpoint de renovación
**Then** el nuevo JWT de acceso MUST contener `cliente_nombre: "Acme Corp"`
**And** `cliente_nombre` MUST ser el mismo que el login hubiera emitido para ese usuario
**And** la rotación del refresh token MUST ocurrir normalmente

#### Scenario: `cliente_nombre` del JWT renovado corresponde al cliente del usuario (no cross-tenant)

**Given** un refresh token válido de `usuarioA` cuyo cliente tiene `nombre = "Acme Corp"`
**And** existe `usuarioB` cuyo cliente tiene `nombre = "Beta SA"`
**When** `usuarioA` renueva su token
**Then** el nuevo JWT de `usuarioA` MUST contener `cliente_nombre: "Acme Corp"`
**And** MUST NOT contener datos del cliente de `usuarioB` ni de ningún otro tenant

---

### Requirement: Soft delete en usuarios

#### Scenario: Baja de usuario no elimina registros físicamente
**Given** un usuario que tiene tickets asignados y operaciones registradas en DBs tenant  
**When** un administrador da de baja al usuario  
**Then** `master.usuarios.deleted_at` MUST ser seteado a `now()`  
**And** `activo` MUST ser seteado a `FALSE`  
**And** la fila MUST permanecer en la DB (las soft refs en tenant siguen apuntando a un UUID válido)  
**And** todos los `refresh_tokens` del usuario MUST ser revocados en la misma operación
