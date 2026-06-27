# Spec Delta: auth-rbac — Claim `cliente_nombre` en JWT

> Delta sobre: `openspec/specs/auth-rbac/spec.md`
> Capability: `auth-rbac`
> Change: `auth-cliente-nombre`
> Archivos afectados (backend): `backend/src/auth/domain/ports/i-token.service.ts`,
>   `backend/src/auth/application/use-cases/login.use-case.ts`,
>   `backend/src/auth/application/use-cases/refresh-token.use-case.ts`
> Archivo afectado (frontend — contrato de tipo): `frontend/src/shared/api/types.ts`

## Contexto del delta

El spec canónico `auth-rbac` define el payload del JWT en el scenario
"Login exitoso genera JWT y refresh token" como:
`{ sub: usuario.id, cliente_id, email, roles: [codigo], permisos: [codigo] }`

Este delta EXTIENDE ese payload con el claim `cliente_nombre`. El claim
transporta el campo `nombre` del `ClienteEntity` del tenant al que pertenece el
usuario autenticado. En `LoginUseCase`, la entidad cliente ya es cargada para
validar `cliente.activo` (línea 100 del archivo actual) — el claim se obtiene de
esa carga existente sin queries adicionales.

**Opción A confirmada para refresh:** el `RefreshTokenUseCase` TAMBIÉN incluye
`cliente_nombre`, cargando `IClienteRepository` durante la renovación (refresh
ocurre ~cada 15 min; 1 `findById` adicional de costo bajo). Esto garantiza que el
nombre del tenant persiste sin parpadeos entre ciclos de token.

**Contrato de tipo en frontend:** el tipo `JwtPayload` en
`frontend/src/shared/api/types.ts` MUST declarar `cliente_nombre` como campo
opcional (`cliente_nombre?: string`) para soportar tokens emitidos antes de este
change que no contienen el claim (degradación elegante obligatoria).

---

## Requirement: Contrato `JwtPayload` extendido con `cliente_nombre`

La interfaz `JwtPayload` del puerto `ITokenService`
(`backend/src/auth/domain/ports/i-token.service.ts`) MUST incluir el campo
`cliente_nombre: string` (tipo `string`, no opcional, no nullable en el contrato
backend — el backend siempre lo emite cuando firma un JWT).

La copia frontend de `JwtPayload` en `frontend/src/shared/api/types.ts` MUST
declarar el campo como `cliente_nombre?: string` (opcional) para tolerar tokens
legados sin el claim.

### Scenario: JwtPayload backend incluye `cliente_nombre` como campo requerido

**Given** la interfaz `JwtPayload` exportada desde `i-token.service.ts`
**When** se audita su definición de tipos
**Then** MUST existir la propiedad `cliente_nombre` de tipo `string` (no opcional, no nullable)
**And** MUST NOT existir ningún alias alternativo (`n`, `tenant_name`, `tenantName`, etc.)
  para el nombre del cliente
**And** el campo `cliente_id` MUST seguir presente e inalterado (no se reemplaza)
**And** los campos `sub`, `email`, `roles`, `permisos` MUST seguir presentes sin modificación

### Scenario: JwtPayload frontend refleja el campo como opcional

**Given** el tipo `JwtPayload` en `frontend/src/shared/api/types.ts`
**When** se audita su definición de tipos
**Then** MUST existir la propiedad `cliente_nombre?: string` (string, campo opcional)
**And** la ausencia del claim en un token decodificado MUST producir `undefined`
  (no un error de tipo ni runtime)
**And** los campos `sub`, `cliente_id`, `email`, `roles`, `permisos` MUST seguir
  presentes sin modificación

---

## Requirement: Login emite JWT con `cliente_nombre` del cliente del usuario

El JWT de acceso emitido por `LoginUseCase` tras un login exitoso MUST incluir
`cliente_nombre` con el valor exacto del campo `nombre` de `ClienteEntity` del
cliente al que pertenece el usuario. El valor se toma de la entidad ya cargada
durante el paso de verificación de `cliente.activo`. No se introduce ninguna
query adicional al camino de login.

Solo `cliente.nombre` viaja en el claim. `razonSocial`, `cuit` u otros campos
del cliente quedan FUERA del claim (scope OUT confirmado en proposal).

### Scenario: Login exitoso incluye `cliente_nombre` correcto en el JWT

**Given** un usuario con `activo = TRUE` y `deleted_at IS NULL`
**And** su cliente tiene `activo = TRUE` y `nombre = "Acme Corp"`
**When** el usuario envía credenciales correctas (email + password) al endpoint de login
**Then** el JWT de acceso emitido MUST contener `cliente_nombre: "Acme Corp"` en su payload
**And** `cliente_nombre` MUST ser igual a `cliente.nombre` (no `razonSocial`, no `cuit`)
**And** los claims `sub`, `cliente_id`, `email`, `roles`, `permisos` MUST seguir presentes
  y correctos (sin regresión)

### Scenario: `cliente_nombre` corresponde exclusivamente al cliente del usuario autenticado

**Given** existen dos clientes activos: `ClienteA` con `nombre = "Acme Corp"`
  y `ClienteB` con `nombre = "Beta SA"`
**And** `usuarioA` tiene `cliente_id` apuntando a `ClienteA`
**When** `usuarioA` hace login exitosamente
**Then** el JWT emitido MUST contener `cliente_nombre: "Acme Corp"`
**And** MUST NOT contener ningún dato de `ClienteB` en ningún claim
**And** `cliente_id` en el JWT MUST corresponder al id de `ClienteA` (consistencia interna)

### Scenario: Login con cliente inactivo sigue siendo rechazado sin emitir token (regresión)

**Given** un usuario con credenciales válidas cuyo cliente tiene `activo = FALSE`
**When** intenta hacer login
**Then** el sistema MUST devolver HTTP 403
**And** MUST NOT emitir ningún JWT ni refresh token
**And** MUST NOT exponer `cliente_nombre` ni ningún dato del cliente en la respuesta

---

## Requirement: Refresh emite JWT con `cliente_nombre` persistido (Opción A)

El `RefreshTokenUseCase` MUST cargar `ClienteEntity` via `IClienteRepository`
durante la renovación del token e incluir `cliente_nombre` en el JWT re-firmado.

El claim `cliente_nombre` en el JWT renovado MUST ser igual al que hubiera emitido
el login para ese mismo usuario en ese mismo momento. El nombre del tenant no debe
ser diferente entre el JWT de login y los JWT emitidos en renovaciones posteriores.

### Scenario: Refresh exitoso mantiene `cliente_nombre` en el nuevo JWT

**Given** un refresh token válido (no expirado, `revoked_at IS NULL`) perteneciente
  a un usuario cuyo cliente tiene `nombre = "Acme Corp"`
**When** el cliente envía el refresh token al endpoint de renovación
**Then** el nuevo JWT de acceso MUST contener `cliente_nombre: "Acme Corp"`
**And** `cliente_nombre` MUST ser el mismo que el login hubiera emitido para ese usuario
**And** la rotación del refresh token MUST ocurrir normalmente (el token anterior es
  revocado; uno nuevo es emitido)
**And** los claims `sub`, `cliente_id`, `email`, `roles`, `permisos` MUST seguir presentes

### Scenario: `cliente_nombre` del JWT renovado corresponde al cliente del usuario (no cross-tenant)

**Given** un refresh token válido de `usuarioA` cuyo cliente tiene `nombre = "Acme Corp"`
**And** existe un `usuarioB` cuyo cliente tiene `nombre = "Beta SA"`
**When** `usuarioA` renueva su token
**Then** el nuevo JWT de `usuarioA` MUST contener `cliente_nombre: "Acme Corp"`
**And** MUST NOT contener datos del cliente de `usuarioB` ni de ningún otro tenant

### Scenario: Refresh expirado o revocado sigue siendo rechazado (regresión)

**Given** un refresh token con `expires_at < now()` o con `revoked_at IS NOT NULL`
**When** se envía al endpoint de renovación
**Then** MUST devolver HTTP 401
**And** MUST NOT emitir ningún nuevo JWT (con o sin `cliente_nombre`)

---
