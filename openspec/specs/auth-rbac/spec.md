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
| `is_global_admin` | `boolean` | NOT NULL | DEFAULT FALSE | TRUE = puede operar en cualquier tenant vía `TenantGuard` + header `X-Tenant-Id`. Independiente del rol: ADMINISTRADOR NO implica `is_global_admin = TRUE`. Agregado en change `tickets-rbac-4-roles` (2026-06-29). |
| `created_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `updated_at` | `timestamptz` | NOT NULL | DEFAULT now() | Ver patrón compartido |
| `deleted_at` | `timestamptz` | NULL | — | Ver patrón compartido |

> `is_global_admin`: migración idempotente `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_global_admin BOOLEAN NOT NULL DEFAULT FALSE`. Todos los usuarios existentes quedan con `FALSE` por defecto. La designación del primer admin global es operacional (UPDATE por email conocido), fuera de la auto-siembra.

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

Catálogo de roles del sistema.

**Roles activos (Change B — `tickets-rbac-4-roles`, 2026-06-29):**

| codigo | nombre | UUID determinista | Nota |
|--------|--------|-------------------|------|
| `USUARIO` | Usuario solicitante | `a0000000-0000-4000-a000-000000000006` | Rol base |
| `COLABORADOR` | Colaborador aprobador | `a0000000-0000-4000-a000-000000000007` | Acumula USUARIO |
| `TECNICO` | Técnico de soporte | `a0000000-0000-4000-a000-000000000008` | Acumula COLABORADOR |
| `ADMINISTRADOR` | Administrador del sistema | `a0000000-0000-4000-a000-000000000009` | Acumula TECNICO |

> Jerarquía acumulativa: USUARIO ⊂ COLABORADOR ⊂ TECNICO ⊂ ADMINISTRADOR. La jerarquía se
> implementa con permisos acumulados en el seed de `roles_permisos` — el código de `PermissionsGuard`
> no se toca. Seed idempotente: `INSERT INTO roles ... ON CONFLICT (codigo) DO NOTHING`.

**Roles legacy (deprecados — Change B los congeló con `deleted_at = now()`):**

Los 5 roles originales (`ADMIN`, `SOPORTE_IT`, `MANTENIMIENTO`, `APROBADOR_COMPRAS`, `SOLICITANTE`)
fueron migrados a los 4 nuevos en la migración `20260629110000_remap_usuarios_roles`. Sus UUIDs
originales (a0..001–005) se conservan en la DB como soft-delete. MUST NOT asignarse a nuevos usuarios
ni recibir permisos adicionales. Sus filas en `roles_permisos` quedaron obsoletas al congelarse.

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
| `ticket:editar` | Editar campos de datos de un ticket (titulo, descripcion, prioridad, ciclo, fechaVencimiento) |
| `ticket:eliminar` | Dar de baja lógica (soft delete) un ticket |
| `ticket:observar` | Crear observaciones técnicas sobre tickets |
| `ticket:transicionar` | Transicionar tickets en arcos técnicos (APROBADO, EN_PROGRESO, SUSPENDIDO) |
| `ticket:aprobar` | Aprobar un ticket (transición ABIERTO → APROBADO) |
| `ticket:rechazar` | Rechazar un ticket (transición ABIERTO → RECHAZADO) |
| `ciclo:gestionar` | Crear y administrar ciclos de trabajo |
| `ticket:comentar` | Crear comentarios aclaratorios en un ticket, sin efecto de transición |

> `ticket:editar` y `ticket:eliminar` agregados en change `tickets-editar-borrar` (2026-06-28).
> UUIDs deterministas: `ticket:editar` → `b0000000-0000-4000-b000-000000000012`,
> `ticket:eliminar` → `b0000000-0000-4000-b000-000000000013`.
> Asignación de roles: `ticket:editar` → ADMIN + SOPORTE_IT; `ticket:eliminar` → ADMIN (exclusivo).
>
> `ticket:observar`, `ticket:transicionar`, `ticket:aprobar`, `ticket:rechazar` agregados en
> change `tickets-maquina-estados-observaciones` (2026-06-29).
> UUIDs deterministas:
> - `ticket:observar`    → `b0000000-0000-4000-b000-000000000014`
> - `ticket:transicionar` → `b0000000-0000-4000-b000-000000000015`
> - `ticket:aprobar`    → `b0000000-0000-4000-b000-000000000016`
> - `ticket:rechazar`   → `b0000000-0000-4000-b000-000000000017`
>
> **CONTRATO INTER-CHANGE (permanente):** los 4 códigos y UUIDs anteriores son FIJOS. Los nuevos
> roles (USUARIO, COLABORADOR, TECNICO, ADMINISTRADOR) los referencian por código exacto en la
> matriz acumulativa. NO renombrar ni crear variantes alternativas.
>
> `ciclo:gestionar` y `ticket:comentar` agregados en change `tickets-rbac-4-roles` (2026-06-29).
> UUIDs deterministas:
> - `ciclo:gestionar`  → `b0000000-0000-4000-b000-000000000018`
> - `ticket:comentar`  → `b0000000-0000-4000-b000-000000000019`
>
> `ticket:comentar` es conceptualmente distinto de `ticket:observar`: NO dispara ninguna
> transición de estado. `ticket:observar` dispara APROBADO → EN_PROGRESO (Change A, contrato fijo).
> MUST NOT confundirlos.
>
> **Siembra provisional de Change A — REEMPLAZADA por Change B (`tickets-rbac-4-roles`, 2026-06-29):**
>
> La siembra mínima provisional de Change A sobre roles legacy quedó obsoleta al ejecutarse la
> migración `20260629100000_seed_rbac_4_roles`. La distribución de permisos activa es la
> **matriz acumulativa permanente** definida en el Requirement de 4 roles jerárquicos más abajo.
> Migración original provisional: `20260629040000_seed_rbac_ticket_estados` (conservada en historial).

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

---

### Requirement: Nuevos permisos ticket:editar y ticket:eliminar en catálogo master

> Introducido en change `tickets-editar-borrar` (2026-06-28).

#### Scenario: Permisos sembrados en migración master

**Given** la migración de seeds RBAC `20260627000000_seed_rbac_ticket_editar_eliminar` se ejecuta sobre la DB master  
**When** la migración completa  
**Then** `master.permisos` MUST contener una fila con `codigo = 'ticket:editar'`  
**And** `master.permisos` MUST contener una fila con `codigo = 'ticket:eliminar'`  
**And** ambas filas MUST tener `deleted_at IS NULL`  
**And** el seed MUST ser idempotente (`INSERT ... ON CONFLICT (codigo) DO NOTHING`)

#### Scenario: UUID determinista de permisos nuevos

**Given** la migración se ejecuta sobre cualquier instancia de la DB master  
**When** se consulta `master.permisos WHERE codigo IN ('ticket:editar', 'ticket:eliminar')`  
**Then** la fila de `ticket:editar` MUST tener `id = 'b0000000-0000-4000-b000-000000000012'`  
**And** la fila de `ticket:eliminar` MUST tener `id = 'b0000000-0000-4000-b000-000000000013'`

---

### Requirement: Asignación de permisos ticket:editar y ticket:eliminar a roles

> Introducido en change `tickets-editar-borrar` (2026-06-28).

#### Scenario: Rol ADMIN tiene ambos permisos nuevos

**Given** la migración de este change se aplica  
**When** se consulta `master.roles_permisos` para el rol con `codigo = 'ADMIN'`  
**Then** MUST existir una fila asociando ADMIN con `ticket:editar`  
**And** MUST existir una fila asociando ADMIN con `ticket:eliminar`

#### Scenario: Rol SOPORTE_IT tiene ticket:editar pero NO ticket:eliminar

**Given** la migración de este change se aplica  
**When** se consulta `master.roles_permisos` para el rol con `codigo = 'SOPORTE_IT'`  
**Then** MUST existir una fila asociando SOPORTE_IT con `ticket:editar`  
**And** MUST NOT existir una fila asociando SOPORTE_IT con `ticket:eliminar`

#### Scenario: Otros roles no reciben los permisos nuevos por defecto

**Given** la migración de este change se aplica  
**When** se consultan los roles `MANTENIMIENTO`, `APROBADOR_COMPRAS`, `SOLICITANTE` en `master.roles_permisos`  
**Then** MUST NOT existir filas que asocien ninguno de esos roles con `ticket:editar`  
**And** MUST NOT existir filas que asocien ninguno de esos roles con `ticket:eliminar`

#### Scenario: Re-ejecución de la migración no duplica permisos ni asignaciones

**Given** la migración de seeds RBAC de este change ya fue ejecutada  
**When** la migración se ejecuta por segunda vez  
**Then** `master.permisos` MUST NOT contener filas duplicadas con `codigo = 'ticket:editar'` ni `'ticket:eliminar'`  
**And** `master.roles_permisos` MUST NOT contener filas duplicadas para las asignaciones nuevas  
**And** la migración MUST completar sin error

---

### Requirement: Permisos ticket:editar y ticket:eliminar reflejados en el JWT

> Introducido en change `tickets-editar-borrar` (2026-06-28). Extiende "Permisos efectivos como unión de roles".

#### Scenario: Usuario con rol SOPORTE_IT incluye ticket:editar en JWT

**Given** un usuario con rol `SOPORTE_IT` y sin rol `ADMIN`  
**When** el usuario hace login exitosamente  
**Then** el payload del JWT MUST contener `'ticket:editar'` en el claim `permisos`  
**And** el claim `permisos` MUST NOT contener `'ticket:eliminar'`

#### Scenario: Usuario con rol ADMIN incluye ambos permisos nuevos en JWT

**Given** un usuario con rol `ADMIN`  
**When** el usuario hace login exitosamente  
**Then** el payload del JWT MUST contener `'ticket:editar'` en el claim `permisos`  
**And** el payload del JWT MUST contener `'ticket:eliminar'` en el claim `permisos`

---

### Requirement: Enforcement de ticket:editar y ticket:eliminar en endpoints

> Introducido en change `tickets-editar-borrar` (2026-06-28).

#### Scenario: Usuario sin ticket:editar recibe 403 en PATCH /tickets/:id

**Given** un usuario autenticado cuyo JWT no contiene `'ticket:editar'` en `permisos`  
**When** envía `PATCH /tickets/{id}` con un body válido  
**Then** `PermissionsGuard` MUST rechazar la request con `HTTP 403`  
**And** MUST NOT ejecutar el caso de uso de edición  
**And** MUST NOT modificar ningún dato en la DB

#### Scenario: Usuario sin ticket:eliminar recibe 403 en DELETE /tickets/:id

**Given** un usuario autenticado cuyo JWT no contiene `'ticket:eliminar'` en `permisos`  
**When** envía `DELETE /tickets/{id}`  
**Then** `PermissionsGuard` MUST rechazar la request con `HTTP 403`  
**And** MUST NOT ejecutar el caso de uso de eliminación  
**And** MUST NOT modificar ningún dato en la DB

#### Scenario: Usuario SOPORTE_IT puede editar pero NO puede eliminar

**Given** un usuario con rol `SOPORTE_IT` y sin rol `ADMIN`  
**And** existe un ticket activo del mismo tenant  
**When** envía `PATCH /tickets/{id}` → la respuesta MUST ser `HTTP 200` (o 422/404 por reglas de dominio, nunca 403)  
**When** envía `DELETE /tickets/{id}` → la respuesta MUST ser `HTTP 403`

---

### Requirement: Catálogo de permisos de transición de tickets

> Introducido en change `tickets-maquina-estados-observaciones` (2026-06-29).

Los 4 permisos granulares MUST existir en `master.permisos` con sus códigos y UUIDs exactos
antes de desplegar cualquier código que referencie `@RequirePermissions('ticket:aprobar')`
o cualquiera de los otros 3. La presencia y forma exacta de los códigos es contrato con Change B.

#### Scenario: Los 4 permisos granulares existen en master con códigos y UUIDs exactos

**Given** la DB master del sistema con el seed de Change A aplicado
**When** se consulta `SELECT codigo, id FROM permisos WHERE codigo IN ('ticket:aprobar','ticket:rechazar','ticket:transicionar','ticket:observar')`
**Then** MUST retornar exactamente 4 filas con esos códigos
**And** cada fila MUST tener el UUID determinista definido en este spec
**And** `deleted_at IS NULL` para cada una
**And** MUST NOT existir variantes de nombres distintas (ej. `ticket:approve`, `ticket:transition`)

#### Scenario: Seed de permisos de transición es idempotente

**Given** una DB master donde los 4 permisos ya existen
**When** el seed de master corre nuevamente (ej. re-deploy)
**Then** MUST NOT crear filas duplicadas en `permisos`
**And** MUST NOT modificar los UUIDs ni los códigos existentes

---

### Requirement: Siembra mínima provisional de roles_permisos (Change A)

> Introducido en change `tickets-maquina-estados-observaciones` (2026-06-29).
> Esta siembra es provisional. Change B (`tickets-rbac-4-roles`) SHOULD redistribuirla.

La siembra mínima garantiza que al desplegar Change A el sistema sea funcional sin esperar
Change B. ADMIN obtiene todos los permisos; APROBADOR_COMPRAS obtiene los de aprobación/rechazo;
SOPORTE_IT, MANTENIMIENTO y SOLICITANTE obtienen los correspondientes a su rol.

#### Scenario: ADMIN tiene los 4 permisos de transición

**Given** la DB master con la siembra mínima de Change A aplicada
**And** un usuario con rol `ADMIN` hace login
**Then** su JWT MUST incluir `ticket:aprobar`, `ticket:rechazar`, `ticket:transicionar`,
  `ticket:observar` en el claim `permisos`

#### Scenario: APROBADOR_COMPRAS tiene permisos de aprobación y rechazo

**Given** la DB master con la siembra mínima de Change A aplicada
**And** un usuario con rol `APROBADOR_COMPRAS` hace login
**Then** su JWT MUST incluir `ticket:aprobar` y `ticket:rechazar` en el claim `permisos`
**And** su JWT MUST NOT incluir `ticket:transicionar` ni `ticket:observar`

#### Scenario: SOPORTE_IT tiene permisos técnicos

**Given** la DB master con la siembra mínima de Change A aplicada
**And** un usuario con rol `SOPORTE_IT` hace login
**Then** su JWT MUST incluir `ticket:transicionar` y `ticket:observar` en el claim `permisos`
**And** su JWT MUST NOT incluir `ticket:aprobar` ni `ticket:rechazar`

#### Scenario: SOLICITANTE tiene ticket:observar

**Given** la DB master con la siembra mínima de Change A aplicada
**And** un usuario con rol `SOLICITANTE` hace login
**Then** su JWT MUST incluir `ticket:observar` en el claim `permisos`
**And** su JWT MUST NOT incluir `ticket:aprobar`, `ticket:rechazar`, ni `ticket:transicionar`

#### Scenario: Siembra de roles_permisos es idempotente

**Given** una DB master donde las asociaciones roles_permisos de esta siembra ya existen
**When** el seed corre nuevamente
**Then** MUST NOT crear filas duplicadas en `roles_permisos`
**And** MUST NOT producir errores de conflicto de PK

#### Scenario: Contrato de códigos — permisos de Change A referenciados por código exacto

**Given** la DB master con la migración acumulativa de Change B aplicada
**When** se consultan las asociaciones de `TECNICO` en `roles_permisos`
**Then** MUST existir asociación con `ticket:observar` cuyo UUID es `b0000000-0000-4000-b000-000000000014`
**And** MUST existir asociación con `ticket:transicionar` cuyo UUID es `b0000000-0000-4000-b000-000000000015`
**And** MUST NOT existir filas con códigos alternativos (`ticket:observe`, `ticket:transition`, etc.)

---

### Requirement: 4 roles jerárquicos con permisos acumulativos en seed

> Introducido en change `tickets-rbac-4-roles` (2026-06-29).
> Reemplaza la siembra provisional de Change A sobre roles legacy.

Los 4 roles MUST existir en `master.roles` con sus UUIDs deterministas tras la migración seed de PR1.
La tabla `master.roles_permisos` MUST reflejar exactamente la matriz acumulativa a continuación.

**Matriz acumulativa (19 permisos × 4 roles):**

| Permiso | USUARIO | COLABORADOR | TECNICO | ADMINISTRADOR |
|---------|:-------:|:-----------:|:-------:|:-------------:|
| `ticket:crear` | ✅ | ✅ | ✅ | ✅ |
| `ticket:comentar` (b0..019) | ✅ | ✅ | ✅ | ✅ |
| `ticket:ver_todos` | — | ✅ | ✅ | ✅ |
| `compra:gestionar` | — | ✅ | ✅ | ✅ |
| `compra:aprobar` | — | ✅ | ✅ | ✅ |
| `ticket:aprobar` (b0..016) | — | ✅ | ✅ | ✅ |
| `ticket:rechazar` (b0..017) | — | ✅ | ✅ | ✅ |
| `ticket:editar` (b0..012) | — | — | ✅ | ✅ |
| `ticket:transicionar` (b0..015) | — | — | ✅ | ✅ |
| `ticket:observar` (b0..014) | — | — | ✅ | ✅ |
| `ticket:asignar` | — | — | ✅ | ✅ |
| `ticket:cerrar` | — | — | ✅ | ✅ |
| `equipo:gestionar` | — | — | ✅ | ✅ |
| `subtarea:actualizar` | — | — | ✅ | ✅ |
| `ticket:eliminar` (b0..013) | — | — | — | ✅ |
| `usuario:gestionar` | — | — | — | ✅ |
| `rol:asignar` | — | — | — | ✅ |
| `cliente:gestionar` | — | — | — | ✅ |
| `ciclo:gestionar` (b0..018) | — | — | — | ✅ |

> `is_global_admin` NO es un permiso y NO aparece en esta tabla. Es una columna en `usuarios`,
> evaluada exclusivamente por `TenantGuard`. Tener rol ADMINISTRADOR NO implica `is_global_admin = TRUE`.

#### Scenario: Los 4 roles existen con UUIDs deterministas

**Given** la DB master con la migración de PR1 (seed de 4 roles) aplicada
**When** se consulta `SELECT codigo, id FROM roles WHERE codigo IN ('USUARIO','COLABORADOR','TECNICO','ADMINISTRADOR')`
**Then** MUST retornar exactamente 4 filas
**And** cada fila MUST tener el UUID determinista definido en este spec
**And** `deleted_at IS NULL` para cada una

#### Scenario: USUARIO obtiene exactamente sus 2 permisos base

**Given** un usuario con rol `USUARIO` hace login exitosamente
**When** se inspecciona el claim `permisos` del JWT emitido
**Then** MUST contener `ticket:crear` y `ticket:comentar`
**And** MUST NOT contener `ticket:observar`, `ticket:transicionar`
**And** MUST NOT contener `ticket:aprobar`, `ticket:rechazar`, `ticket:ver_todos`
**And** MUST NOT contener ningún permiso de niveles COLABORADOR, TECNICO ni ADMINISTRADOR

#### Scenario: COLABORADOR acumula permisos de USUARIO más los propios

**Given** un usuario con rol `COLABORADOR` hace login
**When** se inspecciona el claim `permisos` del JWT
**Then** MUST contener `ticket:crear`, `ticket:comentar` (heredados de USUARIO)
**And** MUST contener `ticket:ver_todos`, `compra:gestionar`, `compra:aprobar`
**And** MUST contener `ticket:aprobar` (b0..016) y `ticket:rechazar` (b0..017)
**And** MUST NOT contener `ticket:editar`, `ticket:transicionar`, `ticket:observar`
**And** MUST NOT contener `usuario:gestionar`, `ciclo:gestionar` ni `ticket:eliminar`

#### Scenario: TECNICO acumula permisos hasta su nivel

**Given** un usuario con rol `TECNICO` hace login
**When** se inspecciona el claim `permisos` del JWT
**Then** MUST contener todos los permisos de COLABORADOR
**And** MUST contener `ticket:editar`, `ticket:transicionar`, `ticket:observar`
**And** MUST contener `ticket:asignar`, `ticket:cerrar`, `equipo:gestionar`, `subtarea:actualizar`
**And** MUST NOT contener `ticket:eliminar`, `usuario:gestionar`, `rol:asignar`
**And** MUST NOT contener `cliente:gestionar`, `ciclo:gestionar`

#### Scenario: ADMINISTRADOR obtiene todos los permisos del sistema

**Given** un usuario con rol `ADMINISTRADOR` hace login
**When** se inspecciona el claim `permisos` del JWT
**Then** MUST contener todos los permisos de TECNICO
**And** MUST contener `ticket:eliminar`, `usuario:gestionar`, `rol:asignar`
**And** MUST contener `cliente:gestionar`, `ciclo:gestionar`

#### Scenario: Seed de roles_permisos es idempotente

**Given** la migración de PR1 ya fue ejecutada sobre la DB master
**When** la migración se ejecuta nuevamente (ej. re-deploy)
**Then** MUST NOT crear filas duplicadas en `roles`
**And** MUST NOT crear filas duplicadas en `roles_permisos`
**And** la migración MUST completar sin error
**And** los UUIDs MUST NOT modificarse

#### Scenario: USUARIO no recibe ticket:observar (invariante "solo Técnico cambia estado")

**Given** la DB master con la migración de PR1 aplicada
**When** se consultan las asociaciones de `USUARIO` en `roles_permisos`
**Then** MUST NOT existir ninguna fila que asocie `USUARIO` con `ticket:observar`
**And** MUST NOT existir ninguna fila que asocie `USUARIO` con `ticket:transicionar`
**And** MUST NOT existir ninguna fila que asocie `USUARIO` con `ticket:aprobar` ni `ticket:rechazar`

---

### Requirement: Nuevos permisos ticket:comentar y ciclo:gestionar en catálogo master

> Introducido en change `tickets-rbac-4-roles` (2026-06-29).

#### Scenario: ticket:comentar sembrado con UUID determinista

**Given** la DB master con la migración de PR1 aplicada
**When** se consulta `SELECT id FROM permisos WHERE codigo = 'ticket:comentar'`
**Then** MUST retornar exactamente 1 fila con `id = 'b0000000-0000-4000-b000-000000000019'`
**And** `deleted_at IS NULL`

#### Scenario: ciclo:gestionar sembrado con UUID determinista

**Given** la DB master con la migración de PR1 aplicada
**When** se consulta `SELECT id FROM permisos WHERE codigo = 'ciclo:gestionar'`
**Then** MUST retornar exactamente 1 fila con `id = 'b0000000-0000-4000-b000-000000000018'`
**And** `deleted_at IS NULL`

#### Scenario: Seed de nuevos permisos es idempotente

**Given** los permisos `ticket:comentar` y `ciclo:gestionar` ya existen
**When** el seed corre nuevamente
**Then** MUST NOT crear filas duplicadas en `permisos`
**And** MUST NOT producir errores de conflicto de PK ni cambiar los UUIDs existentes

---

### Requirement: Migración de usuarios_roles (5 roles legacy → 4 roles nuevos)

> Introducido en change `tickets-rbac-4-roles` (2026-06-29).
> Migración: `20260629110000_remap_usuarios_roles`.

La migración de datos MUST mapear cada usuario desde sus roles legacy al rol nuevo
correspondiente, sin pérdida de capacidades. La migración MUST ser idempotente.

**Mapeo autoritativo:**

| Rol legacy | Rol nuevo | Razón |
|-----------|-----------|-------|
| `ADMIN` | `ADMINISTRADOR` | acceso total preservado |
| `SOLICITANTE` | `USUARIO` | rol base preservado |
| `SOPORTE_IT` | `TECNICO` | preserva equipo:gestionar, asignar, cerrar |
| `MANTENIMIENTO` | `TECNICO` | preserva subtarea:actualizar |
| `APROBADOR_COMPRAS` | `COLABORADOR` | preserva compra:aprobar/gestionar + ticket:aprobar/rechazar |

#### Scenario: Usuario con rol ADMIN migra a ADMINISTRADOR

**Given** un usuario con fila `(usuario_id, rol_ADMIN_id)` en `usuarios_roles`
**When** la migración de PR2 se ejecuta
**Then** MUST existir una fila `(usuario_id, rol_ADMINISTRADOR_id)` en `usuarios_roles`
**And** el usuario MUST poder hacer login y recibir todos los permisos de ADMINISTRADOR en su JWT

#### Scenario: Usuario con rol SOLICITANTE migra a USUARIO

**Given** un usuario con rol `SOLICITANTE`
**When** la migración de PR2 se ejecuta
**Then** MUST existir una fila `(usuario_id, rol_USUARIO_id)` en `usuarios_roles`
**And** el JWT del usuario MUST contener `ticket:crear` y `ticket:comentar`

#### Scenario: Usuario con rol SOPORTE_IT migra a TECNICO y conserva capacidades técnicas

**Given** un usuario con rol `SOPORTE_IT`
**When** la migración de PR2 se ejecuta
**Then** MUST existir una fila `(usuario_id, rol_TECNICO_id)` en `usuarios_roles`
**And** el JWT del usuario MUST contener `ticket:editar`, `ticket:transicionar`, `ticket:observar`
**And** el JWT MUST contener `equipo:gestionar`, `ticket:asignar`, `ticket:cerrar`

#### Scenario: Usuario con rol MANTENIMIENTO migra a TECNICO y conserva subtarea:actualizar

**Given** un usuario con rol `MANTENIMIENTO`
**When** la migración de PR2 se ejecuta
**Then** MUST existir una fila `(usuario_id, rol_TECNICO_id)` en `usuarios_roles`
**And** el JWT del usuario MUST contener `subtarea:actualizar`

#### Scenario: Usuario con rol APROBADOR_COMPRAS migra a COLABORADOR y conserva capacidades

**Given** un usuario con rol `APROBADOR_COMPRAS`
**When** la migración de PR2 se ejecuta
**Then** MUST existir una fila `(usuario_id, rol_COLABORADOR_id)` en `usuarios_roles`
**And** el JWT del usuario MUST contener `compra:aprobar`, `compra:gestionar`
**And** el JWT del usuario MUST contener `ticket:aprobar`, `ticket:rechazar`

#### Scenario: Migración de usuarios_roles es idempotente

**Given** la migración de PR2 ya fue ejecutada
**When** se ejecuta nuevamente (ej. re-deploy o rollback-redo)
**Then** MUST NOT crear filas duplicadas en `usuarios_roles`
**And** MUST NOT producir errores de conflicto de PK
**And** la migración MUST completar sin error

#### Scenario: Usuario migrado conserva sus capacidades operativas

**Given** un usuario ex-APROBADOR_COMPRAS migrado a COLABORADOR
**When** hace re-login y obtiene un JWT con los nuevos permisos
**Then** MUST poder invocar endpoints protegidos por `ticket:aprobar` (ej. aprobar un ticket)
**And** MUST poder invocar endpoints protegidos por `compra:gestionar`
**And** MUST NOT poder invocar endpoints protegidos por `ticket:observar` (exclusivo de TECNICO)

---

### Requirement: Admin global multi-tenant (is_global_admin + TenantGuard)

> Introducido en change `tickets-rbac-4-roles` (2026-06-29).

El flag `is_global_admin` en `master.usuarios` permite a usuarios específicos resolver el tenant
de operación hacia cualquier tenant del sistema, no solo su `cliente_id` propio. El `TenantGuard`
MUST evaluar este flag desde el claim del JWT (sin query a DB por request). El tenant objetivo se
indica vía header `X-Tenant-Id`.

El JWT MUST incluir el claim `is_global_admin: boolean` en todo token emitido.
- Backend (`JwtPayload`): `is_global_admin: boolean` (requerido, no nullable).
- Frontend (`JwtPayload`): `is_global_admin?: boolean` (opcional, backward-compatible).

#### Scenario: JWT incluye claim is_global_admin correctamente

**Given** un usuario con `is_global_admin = TRUE` en `master.usuarios` hace login
**When** se decodifica el JWT de acceso emitido
**Then** el payload MUST contener `is_global_admin: true`
**And** los claims existentes (`sub`, `cliente_id`, `email`, `roles`, `permisos`, `cliente_nombre`) MUST seguir presentes sin regresión

**Given** un usuario con `is_global_admin = FALSE` hace login
**When** se decodifica el JWT de acceso emitido
**Then** el payload MUST contener `is_global_admin: false`

#### Scenario: Admin global accede a tenant ajeno indicando el tenant objetivo

**Given** un usuario con `is_global_admin = TRUE` y `cliente_id = TenantA`
**And** la request lleva el header `X-Tenant-Id` apuntando a `TenantB` (tenant ajeno existente)
**When** el `TenantGuard` evalúa la request
**Then** MUST resolver el contexto de tenant a `TenantB` (no a `TenantA`)
**And** el handler MUST ejecutarse con el contexto del tenant objetivo

#### Scenario: Admin global sin tenant objetivo indicado opera sobre su propio tenant

**Given** un usuario con `is_global_admin = TRUE`
**And** la request NO lleva el header `X-Tenant-Id`
**When** el `TenantGuard` evalúa la request
**Then** MUST resolver el tenant al `cliente_id` propio del usuario (sin regresión al comportamiento base)

#### Scenario: ADMINISTRADOR sin is_global_admin recibe 403 al indicar tenant ajeno

**Given** un usuario con rol `ADMINISTRADOR` pero `is_global_admin = FALSE`
**And** la request lleva `X-Tenant-Id` apuntando a un tenant distinto al `cliente_id` del usuario
**When** el `TenantGuard` evalúa la request
**Then** MUST rechazar con HTTP 403 (ForbiddenException)
**And** MUST NOT ejecutar el handler
**And** MUST NOT acceder a ningún dato del tenant ajeno

#### Scenario: Usuario con is_global_admin=false nunca puede operar cross-tenant

**Given** un usuario con `is_global_admin = FALSE` (cualquier rol)
**And** la request lleva un `X-Tenant-Id` diferente al propio
**When** el `TenantGuard` evalúa la request
**Then** MUST rechazar con HTTP 403 independientemente del rol del usuario

#### Scenario: Tenant objetivo inexistente rechazado con 404

**Given** un usuario con `is_global_admin = TRUE`
**And** la request lleva `X-Tenant-Id` con un `cliente_id` que no existe en `master.clientes`
**When** el `TenantGuard` evalúa la request
**Then** MUST rechazar con HTTP 404
**And** MUST NOT ejecutar el handler

---

### Requirement: Invalidación de JWT y force re-login en deploy de Change B

> Introducido en change `tickets-rbac-4-roles` (2026-06-29).
> Migración: `20260629120000_add_is_global_admin` (incluye revocación masiva).

Los permisos están embebidos en el JWT. Al reemplazar los roles legacy por los 4 nuevos
y migrar los `usuarios_roles`, los JWTs activos contienen permisos del sistema viejo y DEBEN
invalidarse forzando re-login. La revocación MUST ocurrir como parte del deploy.

#### Scenario: Revocación masiva de refresh tokens al desplegar PR1 o PR2

**Given** el operador despliega PR1 (seed de 4 roles) o PR2 (migración de usuarios_roles)
**When** se ejecuta el script de deploy
**Then** MUST ejecutarse `UPDATE refresh_tokens SET revoked_at = now() WHERE revoked_at IS NULL`
**And** todos los usuarios activos MUST quedar sin refresh tokens válidos

#### Scenario: Refresh token revocado masivamente rechaza renovación con 401

**Given** un refresh token cuyo `revoked_at` fue seteado por la revocación masiva del deploy
**When** un cliente intenta renovar el JWT usando ese refresh token
**Then** MUST devolver HTTP 401
**And** MUST NOT emitir ningún nuevo JWT de acceso

#### Scenario: Usuario re-loguea tras revocación y recibe permisos del nuevo rol

**Given** un usuario ex-SOPORTE_IT migrado a TECNICO cuyos refresh tokens fueron revocados
**When** el usuario hace login con sus credenciales
**Then** el JWT MUST contener los permisos de TECNICO según la matriz acumulativa de este spec
**And** MUST NOT contener permisos de `SOPORTE_IT` ni de roles legacy que ya no existen en `usuarios_roles`
