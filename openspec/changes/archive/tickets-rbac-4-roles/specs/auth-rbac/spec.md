# Spec Delta: auth-rbac — Change tickets-rbac-4-roles

> Change: `tickets-rbac-4-roles` (Change B)
> Depende de: Change A `tickets-maquina-estados-observaciones` (ARCHIVED)
> Schema: **MASTER**
> Actualiza canónico: `openspec/specs/auth-rbac/spec.md`
> RFC 2119: MUST / MUST NOT / SHOULD / MAY

## Contexto

Change A dejó una siembra **provisional** de los 4 permisos de transición
(b0…014–017) sobre los roles legacy, para ser desplegable sin esperar el modelo real.
Este change reemplaza ese modelo por 4 roles jerárquicos acumulativos
(USUARIO ⊂ COLABORADOR ⊂ TECNICO ⊂ ADMINISTRADOR), redistribuye todos los permisos
del sistema, migra los usuarios existentes sin pérdida de capacidades, y añade admin root
multi-tenant vía el flag `is_global_admin` en `master.usuarios`.

Los permisos `ticket:observar` (b0..014), `ticket:transicionar` (b0..015),
`ticket:aprobar` (b0..016), `ticket:rechazar` (b0..017) son **contrato fijo de Change A**.
Este change MUST referenciarlos por código exacto. MUST NOT recrearlos ni renombrarlos.

---

## Modelo de datos — delta

### Tabla `usuarios` (MASTER) — nueva columna

| Columna | Tipo Postgres | Nullability | Default | Descripción |
|---------|--------------|-------------|---------|-------------|
| `is_global_admin` | `boolean` | NOT NULL | FALSE | TRUE = el usuario puede operar en cualquier tenant a través del `TenantGuard`. Independiente del rol: un ADMINISTRADOR NO es automáticamente global. |

> Migración idempotente: `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_global_admin BOOLEAN NOT NULL DEFAULT FALSE`.
> Todos los usuarios existentes quedan con `is_global_admin = FALSE` por defecto.

---

## Catálogo de roles — delta

Los 5 roles legacy (`ADMIN`, `SOPORTE_IT`, `MANTENIMIENTO`, `APROBADOR_COMPRAS`, `SOLICITANTE`)
quedan **deprecados** — no se eliminan físicamente mientras existan FKs, pero no deben
asignarse a nuevos usuarios ni recibir permisos adicionales. La tabla `roles_permisos` de Change A
sobre los roles legacy MUST ser reemplazada por la distribución a los 4 roles nuevos.

Los 4 nuevos roles MUST ser sembrados con UUIDs deterministas:

| codigo | nombre | UUID determinista |
|--------|--------|-------------------|
| `USUARIO` | Usuario solicitante | `a0000000-0000-4000-a000-000000000006` |
| `COLABORADOR` | Colaborador aprobador | `a0000000-0000-4000-a000-000000000007` |
| `TECNICO` | Técnico de soporte | `a0000000-0000-4000-a000-000000000008` |
| `ADMINISTRADOR` | Administrador del sistema | `a0000000-0000-4000-a000-000000000009` |

> **Corrección aplicada en archivo (2026-06-29):** los UUIDs originales del spec (a0..001-004) eran
> un placeholder de diseño. Los a0..001-005 están ocupados por los 5 roles legacy en la migración
> `20260623010000_seed_rbac_base`. La implementación real (migration PR1) usa a0..006-009.
> Verificado contra `20260629100000_seed_rbac_4_roles/migration.sql`.

> Seed idempotente: `INSERT INTO roles ... ON CONFLICT (codigo) DO NOTHING`.

---

## Catálogo de permisos — delta (2 nuevos)

| codigo | descripcion | UUID determinista |
|--------|-------------|-------------------|
| `ciclo:gestionar` | Crear y administrar ciclos de trabajo | `b0000000-0000-4000-b000-000000000018` |
| `ticket:comentar` | Crear comentarios aclaratorios en un ticket, sin efecto de transición | `b0000000-0000-4000-b000-000000000019` |

> `ticket:comentar` (b0..019) es conceptualmente distinto de `ticket:observar` (b0..014).
> `ticket:comentar` NO dispara ninguna transición de estado. `ticket:observar` dispara
> APROBADO → EN_PROGRESO (Change A, contrato fijo). MUST NOT confundirlos.

---

## Matriz rol → permisos (acumulativa, seed completo de PR1)

La jerarquía se implementa como **permisos acumulados en el seed**, sin cambios en `PermissionsGuard`.
Cada nivel superior recibe explícitamente TODOS los permisos de los niveles inferiores más los propios.

| Permiso | USUARIO | COLABORADOR | TECNICO | ADMINISTRADOR |
|---------|:-------:|:-----------:|:-------:|:-------------:|
| `ticket:crear` | ✅ | ✅ | ✅ | ✅ |
| `ticket:comentar` (NUEVO, b0..019) | ✅ | ✅ | ✅ | ✅ |
| `ticket:ver_todos` | — | ✅ | ✅ | ✅ |
| `compra:gestionar` | — | ✅ | ✅ | ✅ |
| `compra:aprobar` | — | ✅ | ✅ | ✅ |
| `ticket:aprobar` (b0..016, Change A) | — | ✅ | ✅ | ✅ |
| `ticket:rechazar` (b0..017, Change A) | — | ✅ | ✅ | ✅ |
| `ticket:editar` (b0..012) | — | — | ✅ | ✅ |
| `ticket:transicionar` (b0..015, Change A) | — | — | ✅ | ✅ |
| `ticket:observar` (b0..014, Change A) | — | — | ✅ | ✅ |
| `ticket:asignar` | — | — | ✅ | ✅ |
| `ticket:cerrar` | — | — | ✅ | ✅ |
| `equipo:gestionar` | — | — | ✅ | ✅ |
| `subtarea:actualizar` | — | — | ✅ | ✅ |
| `ticket:eliminar` (b0..013) | — | — | — | ✅ |
| `usuario:gestionar` | — | — | — | ✅ |
| `rol:asignar` | — | — | — | ✅ |
| `cliente:gestionar` | — | — | — | ✅ |
| `ciclo:gestionar` (NUEVO, b0..018) | — | — | — | ✅ |

> `is_global_admin` NO es un permiso y NO aparece en esta tabla. Es una columna en `usuarios`,
> evaluada exclusivamente por `TenantGuard`. Tener rol ADMINISTRADOR NO implica `is_global_admin = true`.

---

## Requirements

### Requirement: 4 roles jerárquicos con permisos acumulativos en seed

Los 4 roles MUST existir en `master.roles` con sus UUIDs deterministas tras la migración seed de PR1.
La tabla `master.roles_permisos` MUST reflejar exactamente la matriz acumulativa anterior.
Las asociaciones `roles_permisos` de la siembra provisional de Change A sobre roles legacy
MUST ser reemplazadas por las asociaciones de los 4 nuevos roles.

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

#### Scenario: Contrato con Change A — UUIDs exactos de los 4 permisos de transición

**Given** la DB master con la migración de PR1 aplicada
**When** se consultan las asociaciones de `TECNICO` en `roles_permisos`
**Then** MUST existir asociación con `ticket:observar` cuyo UUID es `b0000000-0000-4000-b000-000000000014`
**And** MUST existir asociación con `ticket:transicionar` cuyo UUID es `b0000000-0000-4000-b000-000000000015`
**And** MUST NOT existir filas con códigos alternativos (`ticket:observe`, `ticket:transition`, etc.)

#### Scenario: USUARIO no recibe ticket:observar (invariante "solo Técnico cambia estado")

**Given** la DB master con la migración de PR1 aplicada
**When** se consultan las asociaciones de `USUARIO` en `roles_permisos`
**Then** MUST NOT existir ninguna fila que asocie `USUARIO` con `ticket:observar`
**And** MUST NOT existir ninguna fila que asocie `USUARIO` con `ticket:transicionar`
**And** MUST NOT existir ninguna fila que asocie `USUARIO` con `ticket:aprobar` ni `ticket:rechazar`

---

### Requirement: Nuevos permisos ticket:comentar y ciclo:gestionar en catálogo master

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

### Requirement: Migración de usuarios_roles (5 roles legacy → 4 roles)

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

El flag `is_global_admin` en `master.usuarios` permite a usuarios específicos resolver el
tenant de operación hacia cualquier tenant del sistema, no solo su `cliente_id` propio.
El `TenantGuard` MUST evaluar este flag desde el claim del JWT (sin query a DB por request).
El mecanismo concreto para indicar el tenant objetivo (header HTTP vs parámetro de URL) es
decisión del design; esta spec define el comportamiento esperado.

El JWT MUST incluir el claim `is_global_admin: boolean` en todo token emitido.
En `JwtPayload` backend: `is_global_admin: boolean` (requerido, no nullable).
En `JwtPayload` frontend: `is_global_admin?: boolean` (opcional, backward-compatible).

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
**And** la request indica como tenant objetivo `TenantB` (tenant ajeno existente)
**When** el `TenantGuard` evalúa la request
**Then** MUST resolver el contexto de tenant a `TenantB` (no a `TenantA`)
**And** el handler MUST ejecutarse con el contexto del tenant objetivo

#### Scenario: Admin global sin tenant objetivo indicado opera sobre su propio tenant

**Given** un usuario con `is_global_admin = TRUE`
**And** la request NO indica ningún tenant objetivo (flujo normal sin cross-tenant)
**When** el `TenantGuard` evalúa la request
**Then** MUST resolver el tenant al `cliente_id` propio del usuario (sin regresión al comportamiento base)

#### Scenario: ADMINISTRADOR sin is_global_admin NO puede acceder a tenant ajeno

**Given** un usuario con rol `ADMINISTRADOR` pero `is_global_admin = FALSE`
**And** la request indica como tenant objetivo un tenant distinto al `cliente_id` del usuario
**When** el `TenantGuard` evalúa la request
**Then** MUST rechazar con HTTP 403
**And** MUST NOT ejecutar el handler
**And** MUST NOT acceder a ningún dato del tenant ajeno

#### Scenario: Usuario con is_global_admin=false nunca puede operar cross-tenant

**Given** un usuario con `is_global_admin = FALSE` (cualquier rol)
**And** la request indica un tenant objetivo diferente al propio
**When** el `TenantGuard` evalúa la request
**Then** MUST rechazar con HTTP 403 independientemente del rol del usuario

#### Scenario: Tenant objetivo inexistente rechazado con 404

**Given** un usuario con `is_global_admin = TRUE`
**And** la request indica como tenant objetivo un `cliente_id` que no existe en `master.clientes`
**When** el `TenantGuard` evalúa la request
**Then** MUST rechazar con HTTP 404
**And** MUST NOT ejecutar el handler

---

### Requirement: Invalidación de JWT y force re-login en deploy de Change B

Los permisos están embebidos en el JWT. Al reemplazar los roles legacy por los 4 nuevos
y migrar los `usuarios_roles`, los JWTs activos contienen permisos del sistema viejo
y DEBEN invalidarse forzando re-login. La revocación MUST ocurrir antes o durante el deploy.

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
