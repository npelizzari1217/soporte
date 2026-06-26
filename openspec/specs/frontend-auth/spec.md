# Spec: Frontend Auth

> Capability: `frontend-auth`
> Stack: Next.js App Router, BFF Route Handlers, httpOnly cookies
> Backend spec relacionada: `openspec/specs/auth-rbac/spec.md`
> Archivado desde: `frontend-fundacion` (2026-06-26)

## Context

El frontend autentica contra el backend NestJS a través de una capa BFF (Backend For Frontend)
implementada como Route Handlers de Next.js. El browser NUNCA tiene los tokens en crudo — tanto
`accessToken` como `refreshToken` viajan exclusivamente como cookies `httpOnly` seteadas por los
Route Handlers. El proxy catch-all en `/api/[...path]` lee la cookie `at` server-side e inyecta
`Authorization: Bearer` antes de reenviar a NestJS.

### Atributos de cookies (AS-BUILT)

| Cookie | Nombre | httpOnly | SameSite | Secure | Path | Max-Age | Prod prefix |
|--------|--------|----------|----------|--------|------|---------|-------------|
| Access Token | `at` | true | Lax | true (prod) | `/` | 900 (15 min) | `__Host-at` |
| Refresh Token | `rt` | true | Lax | true (prod) | `/` | 604800 (7 días) | `__Host-rt` |

**Decisiones de diseño (ADR-3, ADR-5):**
- **SameSite=Lax** (no Strict): bloquea POST/fetch cross-site (defensa CSRF para mutaciones) pero
  permite navegación top-level GET (Strict rompería links entrantes). Defensa extra: el catch-all
  valida `Origin`/`Referer` same-origin en métodos mutantes.
- **Path=/ en ambas cookies** (ADR-5): el middleware necesita leer `rt` en TODAS las rutas para
  detectar sesión viva cuando `at` expiró (tolerancia ADR-4). `Path=/api/auth/refresh` haría
  invisible `rt` al middleware. Adicionalmente, el prefijo `__Host-` en producción exige `Path=/`
  por especificación del estándar de prefijos de cookie.
- **`__Host-` en producción**: endurecimiento de seguridad activado por `NODE_ENV === 'production'`.
  Los nombres lógicos son siempre `at`/`rt`; la función `cookieName()` en `shared/auth/cookies.ts`
  agrega el prefijo en producción. TODOS los lectores de cookies (route handlers, layouts, middleware)
  DEBEN usar `cookieName(COOKIE_AT)` / `cookieName(COOKIE_RT)` como clave en `.get()`.

> **Nota sobre spec original**: el delta spec usaba nombres `accessToken`/`refreshToken`,
> `SameSite=Strict` y `Path=/api/auth/refresh` para RT. La implementación AS-BUILT desvía
> en los tres puntos por las razones documentadas como ADR-3 y ADR-5 (también W2 del verify-report).

Flujo de login:
1. Browser → POST `/api/auth/login` (Next.js Route Handler)
2. Route Handler → POST `/api/auth/login` a NestJS → recibe `{ accessToken, refreshToken }` en body
3. Route Handler setea ambas cookies httpOnly y retorna `{ user: JwtPayload }` al browser
4. Browser redirige a `/` (dashboard home)

Flujo de logout:
1. Browser → POST `/api/auth/logout` (Route Handler)
2. Route Handler lee `rt` de cookie, llama a NestJS con `Authorization: Bearer <at>` y `{ refreshToken: rt }` en body
3. Route Handler elimina ambas cookies (Set-Cookie maxAge=0) y retorna 200
4. Browser redirige a `/login`

---

## Requirements

### Requirement: Login exitoso establece sesión mediante cookies httpOnly

#### Scenario: Credenciales válidas → cookies seteadas + redirect a dashboard
**Given** un usuario con `activo = TRUE` y `cliente.activo = TRUE` existe en el backend
**When** el usuario envía `{ email, password }` correctos al Route Handler `/api/auth/login`
**Then** el Route Handler MUST llamar a NestJS `POST /api/auth/login` y obtener `{ accessToken, refreshToken }`
**And** MUST setear una cookie `at` (o `__Host-at` en producción) con flags `httpOnly; SameSite=Lax; Path=/; Secure` (en producción) y `maxAge = 900`
**And** MUST setear una cookie `rt` (o `__Host-rt` en producción) con flags `httpOnly; SameSite=Lax; Path=/; Secure` (en producción) y `maxAge = 604800`
**And** MUST retornar HTTP 200 con `{ user: JwtPayload }` al cliente (el token NUNCA cruza al browser)
**And** el cliente MUST navegar a `/` (dashboard home) tras recibir la respuesta exitosa

#### Scenario: Cookie at no es accesible desde JavaScript del browser
**Given** el login fue exitoso y las cookies fueron seteadas
**When** un script del browser llama a `document.cookie`
**Then** la cookie `at` MUST NOT aparecer en el resultado (garantizado por el flag `httpOnly`)
**And** la cookie `rt` MUST NOT aparecer en el resultado

#### Scenario: Requests a /api/* incluyen el accessToken sin intervención del cliente
**Given** el usuario tiene una cookie `at` httpOnly válida
**When** `apiFetch` hace un request a cualquier `/api/[...path]`
**Then** el BFF proxy MUST leer la cookie `at` server-side (usando `cookieName(COOKIE_AT)`) y adjuntarlo como `Authorization: Bearer <at>` antes de reenviar a NestJS
**And** el browser MUST NOT haber incluido el token manualmente en el request

---

### Requirement: Login con credenciales inválidas muestra error en UI

#### Scenario: Password incorrecto → error visible en el formulario de login
**Given** el usuario existe y está activo
**When** el usuario envía una password incorrecta
**Then** NestJS responde HTTP 401
**And** el Route Handler MUST retornar HTTP 401 con `{ statusCode: 401, message: string }` al cliente
**And** el formulario de login MUST mostrar un mensaje de error genérico debajo del campo de password
**And** MUST NOT redirigir al dashboard
**And** MUST NOT setear ninguna cookie de sesión

#### Scenario: Email inexistente → error genérico sin revelar existencia
**Given** no existe ningún usuario con el email enviado
**When** el usuario envía el formulario de login
**Then** NestJS responde HTTP 401
**And** el formulario MUST mostrar un mensaje de error genérico que NO revele si el email existe o no
**And** el texto de error MUST NOT contener las palabras "email" ni "existe"
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
**And** el formulario de login MUST mostrar un mensaje indicando que el acceso de la organización está suspendido
**And** MUST NOT otorgar sesión
**And** MUST NOT setear cookies de sesión

---

### Requirement: Logout limpia la sesión y redirige a /login

#### Scenario: Logout exitoso → cookies eliminadas + redirect a /login
**Given** el usuario tiene una sesión activa (cookies `at` y `rt` httpOnly presentes)
**When** invoca la acción de logout (ej. click en "Cerrar sesión")
**Then** el cliente MUST hacer POST `/api/auth/logout`
**And** el Route Handler MUST leer `rt` via `cookieName(COOKIE_RT)`, llamar a NestJS con `Authorization: Bearer <at>` y `{ refreshToken: <rt value> }` en body
**And** el Route Handler MUST eliminar las cookies `at` y `rt` seteando `maxAge=0` en la respuesta
**And** MUST retornar HTTP 200 al cliente
**And** el cliente MUST redirigir a `/login`
**And** tras la redirección, el middleware MUST tratar al usuario como no autenticado

#### Scenario: Logout con accessToken expirado sigue eliminando las cookies
**Given** el `at` expiró pero el `rt` aún es válido
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
**And** el Route Handler MUST llamar a NestJS `POST /api/auth/logout-all` con `Authorization: Bearer <at>`
**And** NestJS MUST revocar TODOS los refresh tokens del usuario (`revoked_at = now()` en cada fila de `refresh_tokens`)
**And** el Route Handler MUST eliminar las cookies `at` y `rt` del dispositivo actual
**And** el cliente MUST redirigir a `/login`
