# Spec: Auth RBAC — Delta (change `admin-general`)

> Capability: `auth-rbac` (MODIFIED)
> Base spec: `openspec/specs/auth-rbac/spec.md`
> Schema: MASTER
> Introducido en change: `admin-general` (2026-06-30)

## Contexto

Este delta extiende `openspec/specs/auth-rbac/spec.md` sin reemplazarlo. Todos los requirements
de la base permanecen vigentes.

Tres adiciones:

1. **`GlobalAdminGuard`** — guard NestJS que permite únicamente usuarios con `is_global_admin = true`
   en su JWT. Composable con `JwtAuthGuard` (se aplica DESPUÉS de la autenticación). Sin queries
   a DB — evalúa el claim del JWT ya decodificado.

2. **Fix de seguridad crítico** — `ClientesController` y `CiclosVigentesController` reciben
   `JwtAuthGuard` a nivel de controlador. Hoy están ABIERTOS sin ningún guard.

3. **`is_global_admin` en JWT del frontend** — el claim `is_global_admin: boolean` ya fue
   especificado en el change `tickets-rbac-4-roles` para el backend. Este delta especifica su
   contrato en el tipo `JwtPayload` del frontend para que los componentes de admin-ui puedan
   consumirlo sin queries adicionales.

> `is_global_admin = true` NO implica rol ADMINISTRADOR y viceversa. Un ADMINISTRADOR con
> `is_global_admin = false` NO pasa `GlobalAdminGuard`. Esta invariante viene de la base spec
> y NO cambia en este delta.

---

## Requirements

### Requirement: GlobalAdminGuard — acceso exclusivo para is_global_admin = true

`GlobalAdminGuard` MUST evaluar el claim `is_global_admin` del `JwtPayload` decodificado por
`JwtAuthGuard`. MUST aplicarse únicamente después de que `JwtAuthGuard` ya haya validado el token.
MUST NOT realizar ninguna query a la base de datos.

El guard MUST ser aplicable a nivel de controlador o de método mediante el patrón
`@UseGuards(JwtAuthGuard, GlobalAdminGuard)`.

#### Scenario: Request sin autenticación a endpoint con GlobalAdminGuard es rechazada con 401

**Given** un endpoint decorado con `@UseGuards(JwtAuthGuard, GlobalAdminGuard)`
**And** la request llega sin header `Authorization: Bearer {token}`
**When** la cadena de guards evalúa la request
**Then** `JwtAuthGuard` MUST rechazar con HTTP 401
**And** `GlobalAdminGuard` MUST NOT evaluarse (la cadena se detiene en 401)
**And** ningún use case MUST ejecutarse

#### Scenario: ADMINISTRADOR con is_global_admin = false es rechazado con 403

**Given** un endpoint decorado con `@UseGuards(JwtAuthGuard, GlobalAdminGuard)`
**And** el usuario tiene un JWT válido con rol `ADMINISTRADOR` y `is_global_admin: false`
**When** la cadena de guards evalúa la request
**Then** `JwtAuthGuard` MUST pasar (token válido)
**And** `GlobalAdminGuard` MUST rechazar con HTTP 403
**And** el handler MUST NOT ejecutarse
**And** MUST NOT accederse a ninguna base de datos

#### Scenario: Usuario con is_global_admin = true pasa GlobalAdminGuard

**Given** un endpoint decorado con `@UseGuards(JwtAuthGuard, GlobalAdminGuard)`
**And** el JWT del usuario contiene `is_global_admin: true`
**When** la cadena de guards evalúa la request
**Then** `JwtAuthGuard` MUST pasar
**And** `GlobalAdminGuard` MUST pasar
**And** el handler MUST ejecutarse normalmente

#### Scenario: GlobalAdminGuard no realiza queries a la base de datos

**Given** `GlobalAdminGuard` está evaluando una request con `is_global_admin: true` en el JWT
**When** el guard verifica el claim
**Then** MUST leer exclusivamente del payload del JWT ya disponible en el request context
**And** MUST NOT emitir ningún SELECT a `master.usuarios` ni a ninguna otra tabla
**And** la evaluación MUST ser O(1) sin I/O

---

### Requirement: ClientesController protegido con JwtAuthGuard

Todos los endpoints de `ClientesController` MUST requerir un JWT válido. Este requisito cierra
un agujero de seguridad crítico: el controlador es actualmente accesible sin autenticación.

#### Scenario: Request sin autenticación a GET /clientes es rechazada con 401

**Given** `ClientesController` tiene `JwtAuthGuard` aplicado a nivel de controlador
**When** una request llega a `GET /clientes` sin header Authorization
**Then** MUST devolver HTTP 401
**And** MUST NOT invocar ningún use case
**And** MUST NOT consultar la base de datos

#### Scenario: Request sin autenticación a POST /clientes es rechazada con 401

**Given** `ClientesController` tiene `JwtAuthGuard` aplicado a nivel de controlador
**When** una request llega a `POST /clientes` sin header Authorization
**Then** MUST devolver HTTP 401
**And** MUST NOT invocar `CrearClienteUseCase` ni ningún otro use case

#### Scenario: Token expirado o malformado es rechazado con 401 en ClientesController

**Given** una request llega a cualquier endpoint de `ClientesController` con
  `Authorization: Bearer {token_expirado_o_invalido}`
**When** `JwtAuthGuard` evalúa el token
**Then** MUST devolver HTTP 401
**And** MUST NOT invocar ningún use case

#### Scenario: JWT válido no es bloqueado por JwtAuthGuard en ClientesController

**Given** un usuario con JWT válido y no expirado
**And** la request incluye `Authorization: Bearer {token_valido}`
**When** `JwtAuthGuard` evalúa la request
**Then** MUST pasar y permitir que los guards subsiguientes evalúen (GlobalAdminGuard, etc.)

---

### Requirement: CiclosVigentesController protegido con JwtAuthGuard

Todos los endpoints de `CiclosVigentesController` MUST requerir un JWT válido. Mismo gap
de seguridad crítico que `ClientesController`.

#### Scenario: Request sin autenticación a cualquier endpoint de CiclosVigentesController es rechazada con 401

**Given** `CiclosVigentesController` tiene `JwtAuthGuard` aplicado a nivel de controlador
**When** una request llega a cualquier endpoint (ej. `GET /ciclos-vigentes`) sin header Authorization
**Then** MUST devolver HTTP 401
**And** MUST NOT invocar ningún use case
**And** MUST NOT consultar la base de datos

#### Scenario: Token expirado es rechazado con 401 en CiclosVigentesController

**Given** una request llega con `Authorization: Bearer {token_expirado}`
**When** `JwtAuthGuard` evalúa la request
**Then** MUST devolver HTTP 401
**And** MUST NOT invocar ningún use case

---

### Requirement: Claim is_global_admin disponible en JwtPayload del frontend

El tipo `JwtPayload` en `frontend/src/shared/api/types.ts` MUST incluir `is_global_admin` como
campo opcional. Retrocompatibilidad obligatoria: tokens emitidos antes del change
`tickets-rbac-4-roles` que no tienen el claim MUST producir `undefined`, no un error.

> El backend ya emite `is_global_admin: boolean` en todo JWT desde el change `tickets-rbac-4-roles`.
> Este requirement especifica el contrato del tipo frontend para que los componentes de admin-ui
> puedan derivar la visibilidad de secciones sin queries adicionales.

#### Scenario: JwtPayload frontend incluye is_global_admin como campo opcional

**Given** el tipo `JwtPayload` en `frontend/src/shared/api/types.ts`
**When** se audita su definición de tipos
**Then** MUST existir la propiedad `is_global_admin?: boolean` (opcional, retrocompatible)
**And** la ausencia del claim en un token decodificado MUST producir `undefined` (no error de tipo)
**And** el claim `cliente_nombre?: string` MUST seguir presente sin regresión (introducido en
  `auth-cliente-nombre`)

#### Scenario: Componente sidebar consume is_global_admin sin query adicional

**Given** el usuario está autenticado con un JWT que contiene `is_global_admin: true`
**When** el sidebar evalúa qué sección ADMINISTRACIÓN mostrar
**Then** MUST derivar la visibilidad del claim `is_global_admin` del JWT decodificado (ya en memoria)
**And** MUST NOT realizar ningún fetch adicional para determinar el nivel de acceso del usuario
