# Spec: Frontend Auth

> Change: `frontend-fundacion`
> Capability: `frontend-auth`
> Stack: Next.js App Router, BFF Route Handlers, httpOnly cookies
> Backend spec relacionada: `openspec/specs/auth-rbac/spec.md`

## Context

El frontend autentica contra el backend NestJS a través de una capa BFF (Backend For Frontend)
implementada como Route Handlers de Next.js. El browser NUNCA tiene los tokens en crudo — tanto
`accessToken` como `refreshToken` viajan exclusivamente como cookies `httpOnly` seteadas por los
Route Handlers. El proxy catch-all en `/api/[...path]` lee la cookie `accessToken` server-side
e inyecta `Authorization: Bearer` antes de reenviar a NestJS.

Flujo de login:
1. Browser → POST `/api/auth/login` (Next.js Route Handler)
2. Route Handler → POST `/api/auth/login` a NestJS → recibe `{ accessToken, refreshToken }` en body
3. Route Handler setea ambas cookies httpOnly en la respuesta y retorna `{ ok: true }` al browser
4. Browser redirige a `/dashboard`

Flujo de logout:
1. Browser → POST `/api/auth/logout` (Route Handler)
2. Route Handler lee `refreshToken` de cookie, llama a NestJS con `Authorization: Bearer <accessToken>` y `{ refreshToken }` en body
3. Route Handler elimina ambas cookies (Set-Cookie maxAge=0) y retorna 200
4. Browser redirige a `/login`

---

## Requirements

### Requirement: Login exitoso establece sesión mediante cookies httpOnly

#### Scenario: Credenciales válidas → cookies seteadas + redirect a dashboard
**Given** un usuario con `activo = TRUE` y `cliente.activo = TRUE` existe en el backend  
**When** el usuario envía `{ email, password }` correctos al Route Handler `/api/auth/login`  
**Then** el Route Handler MUST llamar a NestJS `POST /api/auth/login` y obtener `{ accessToken, refreshToken }`  
**And** MUST setear una cookie `accessToken` con flags `httpOnly; SameSite=Strict; Path=/; Secure` y `maxAge = 900` (15 min)  
**And** MUST setear una cookie `refreshToken` con flags `httpOnly; SameSite=Strict; Path=/api/auth/refresh; Secure` y `maxAge = 604800` (7 días)  
**And** MUST retornar HTTP 200 con `{ ok: true }` al cliente  
**And** el cliente MUST navegar a `/dashboard` tras recibir la respuesta exitosa

#### Scenario: Cookie accessToken no es accesible desde JavaScript del browser
**Given** el login fue exitoso y las cookies fueron seteadas  
**When** un script del browser llama a `document.cookie`  
**Then** la cookie `accessToken` MUST NOT aparecer en el resultado (garantizado por el flag `httpOnly`)  
**And** la cookie `refreshToken` MUST NOT aparecer en el resultado

#### Scenario: Requests a /api/* incluyen el accessToken sin intervención del cliente
**Given** el usuario tiene una cookie `accessToken` httpOnly válida  
**When** `apiFetch` hace un request a cualquier `/api/[...path]`  
**Then** el BFF proxy MUST leer la cookie `accessToken` server-side y adjuntarlo como `Authorization: Bearer <accessToken>` antes de reenviar a NestJS  
**And** el browser MUST NOT haber incluido el token manualmente en el request

---

### Requirement: Login con credenciales inválidas muestra error en UI

#### Scenario: Password incorrecto → error visible en el formulario de login
**Given** el usuario existe y está activo  
**When** el usuario envía una password incorrecta  
**Then** NestJS responde HTTP 401  
**And** el Route Handler MUST retornar HTTP 401 con `{ statusCode: 401, message: string }` al cliente  
**And** el formulario de login MUST mostrar el mensaje de error debajo del campo de password  
**And** MUST NOT redirigir al dashboard  
**And** MUST NOT setear ninguna cookie de sesión

#### Scenario: Email inexistente → error genérico sin revelar existencia
**Given** no existe ningún usuario con el email enviado  
**When** el usuario envía el formulario de login  
**Then** NestJS responde HTTP 401  
**And** el formulario MUST mostrar un mensaje de error genérico que NO revele si el email existe o no  
**And** MUST NOT setear ninguna cookie de sesión

---

### Requirement: Login de usuario inactivo es rechazado con 401

#### Scenario: Usuario con activo=FALSE → 401 mostrado en UI
**Given** el usuario existe con `activo = FALSE` en el backend  
**When** envía credenciales correctas  
**Then** NestJS responde HTTP 401  
**And** el formulario de login MUST mostrar un mensaje de error genérico  
**And** MUST NOT otorgar sesión  
**And** MUST NOT setear cookies de sesión

---

### Requirement: Login con tenant inactivo es rechazado con 403

#### Scenario: cliente.activo=FALSE → 403 mostrado en UI con mensaje específico
**Given** el usuario tiene credenciales válidas pero su `cliente.activo = FALSE`  
**When** envía el formulario de login  
**Then** NestJS responde HTTP 403  
**And** el formulario de login MUST mostrar un mensaje indicando que el acceso del tenant está suspendido  
**And** MUST NOT otorgar sesión  
**And** MUST NOT setear cookies de sesión

---

### Requirement: Logout limpia la sesión y redirige a /login

#### Scenario: Logout exitoso → cookies eliminadas + redirect a /login
**Given** el usuario tiene una sesión activa (cookies httpOnly presentes)  
**When** invoca la acción de logout (ej. click en "Cerrar sesión")  
**Then** el cliente MUST hacer POST `/api/auth/logout`  
**And** el Route Handler MUST llamar a NestJS `POST /api/auth/logout` con `Authorization: Bearer <accessToken>` y `{ refreshToken }` en body  
**And** el Route Handler MUST eliminar las cookies `accessToken` y `refreshToken` seteando `maxAge=0` en la respuesta  
**And** MUST retornar HTTP 200 al cliente  
**And** el cliente MUST redirigir a `/login`  
**And** tras la redirección, el middleware MUST tratar al usuario como no autenticado

#### Scenario: Logout con accessToken expirado sigue eliminando las cookies
**Given** el accessToken expiró pero el refreshToken aún es válido  
**When** el usuario invoca logout  
**Then** las cookies MUST ser eliminadas igualmente  
**And** el usuario MUST ser redirigido a `/login`  
**And** MUST NOT quedar en estado de sesión parcial ni en bucle de redirect

---

### Requirement: Logout-all revoca todos los dispositivos del usuario

#### Scenario: Logout-all → todos los refresh tokens del usuario revocados en backend
**Given** el usuario tiene sesiones activas en múltiples dispositivos  
**When** invoca la acción "Cerrar todas las sesiones"  
**Then** el cliente MUST hacer POST `/api/auth/logout-all`  
**And** el Route Handler MUST llamar a NestJS `POST /api/auth/logout-all` con `Authorization: Bearer <accessToken>`  
**And** NestJS MUST revocar TODOS los refresh tokens del usuario (`revoked_at = now()` en cada fila de `refresh_tokens`)  
**And** el Route Handler MUST eliminar las cookies `accessToken` y `refreshToken` del dispositivo actual  
**And** el cliente MUST redirigir a `/login`
