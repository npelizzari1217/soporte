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

---

## Idle Session Timeout

> Agregado por el change `idle-session-timeout` (archivado 2026-07-15). Capa 100% de presentación
> client-side; reusa `POST /api/auth/logout` (ya documentado arriba) sin cambios de backend. Ver
> `openspec/changes/archive/idle-session-timeout/design.md` (ADR-1 a ADR-8) para el detalle arquitectónico.

### Requirement: Auto-logout por inactividad tras 15 minutos

El sistema MUST cerrar la sesión automáticamente cuando no detecta actividad (mousemove, keydown, click, scroll) durante `IDLE_TIMEOUT_MS` (900000 ms), con debounce para no reiniciar el timer por cada evento individual.

#### Scenario: Sin interacción durante 15 minutos dispara el flujo de corte
- GIVEN un usuario autenticado sin interacción de mouse/teclado/scroll
- WHEN transcurren 15 minutos consecutivos sin ningún evento de actividad
- THEN el sistema MUST iniciar el flujo de corte de sesión (aviso + logout)

#### Scenario: Actividad durante la fase activa (aviso NO visible) reinicia el conteo
- GIVEN un usuario autenticado con el timer corriendo y el modal de aviso NO visible
- WHEN ocurre un evento de mousemove, keydown, click o scroll
- THEN el sistema MUST reiniciar el contador de inactividad a 0 (sujeto a debounce/throttle)

#### Scenario: Durante el aviso, la actividad pasiva NO reinicia el conteo (ADR-8 — seguridad)
- GIVEN el modal de aviso está visible (últimos `WARNING_BEFORE_MS` antes del corte)
- WHEN ocurre actividad pasiva (mousemove, scroll, keydown) SIN clic en "Seguir conectado"
- THEN el sistema MUST NOT reiniciar el contador ni cerrar el modal
- AND el corte MUST proceder salvo que el usuario haga clic explícito en "Seguir conectado"
- Rationale: durante el aviso, solo la intención explícita mantiene la sesión. Evita que el jitter del mouse o una vibración mantengan viva una estación desatendida, que es el propósito mismo de la feature. Decisión ratificada por el usuario (2026-07-15) y coherente con `design.md` ADR-8.

---

### Requirement: Aviso de cuenta regresiva antes del corte

El sistema MUST mostrar un modal con countdown visible `WARNING_BEFORE_MS` (60000 ms) antes del corte —a los 14 minutos de inactividad— decrementando cada segundo.

#### Scenario: A los 14 minutos de inactividad aparece el modal con countdown
- GIVEN un usuario autenticado sin actividad desde hace 14 minutos
- WHEN se cumple el umbral `IDLE_TIMEOUT_MS - WARNING_BEFORE_MS`
- THEN el sistema MUST mostrar un modal de aviso con countdown inicial de 60 segundos

#### Scenario: El countdown decrementa cada segundo
- GIVEN el modal de aviso está visible con countdown en 60
- WHEN transcurre 1 segundo sin interacción
- THEN el countdown MUST mostrar 59
- AND MUST seguir decrementando cada segundo hasta 0 o hasta interacción del usuario

---

### Requirement: "Seguir conectado" reinicia la sesión sin re-login

El sistema MUST permitir cancelar el corte mediante un clic en "Seguir conectado" dentro del modal de aviso.

#### Scenario: Clic en "Seguir conectado" reinicia el timer y cierra el modal
- GIVEN el modal de aviso está visible con countdown activo
- WHEN el usuario hace clic en "Seguir conectado"
- THEN el sistema MUST reiniciar el timer de inactividad a 0
- AND el modal MUST cerrarse
- AND la sesión MUST continuar sin pedir credenciales nuevamente

---

### Requirement: Corte real de sesión al agotarse el countdown

El sistema MUST ejecutar un logout real y verificable cuando el countdown llega a 0 sin interacción.

#### Scenario: Countdown llega a 0 → logout real + redirect
- GIVEN el modal de aviso está visible con countdown en 0
- WHEN no hubo ninguna interacción durante el countdown
- THEN el sistema MUST invocar `POST /api/auth/logout` (revoca `rt` server-side y limpia cookies `at`/`rt`)
- AND MUST redirigir a `/login`

#### Scenario: No debe quedar refresh silencioso posible tras el corte
- GIVEN el logout por inactividad se ejecutó y las cookies fueron eliminadas
- WHEN cualquier request subsiguiente llega al middleware o al proxy `/api/[...path]`
- THEN el sistema MUST tratar al usuario como no autenticado
- AND MUST NOT emitir un nuevo `at` a partir de un `rt` ya revocado

---

### Requirement: No-op del timer sin sesión autenticada

El sistema MUST NOT correr el timer de inactividad cuando no hay usuario autenticado.

#### Scenario: user es null → el timer no se inicia
- GIVEN `user === null` en el contexto de sesión
- WHEN el `IdleTimeoutProvider` se monta
- THEN el sistema MUST NOT registrar listeners de actividad ni iniciar timer alguno

#### Scenario: isLoading en true → el timer espera a resolver
- GIVEN `isLoading === true` mientras se resuelve la sesión
- WHEN el `IdleTimeoutProvider` se monta
- THEN el sistema MUST NOT iniciar el timer hasta que `isLoading` sea `false` y `user` sea no-nulo

---

### Requirement: Sincronización de inactividad entre pestañas

El sistema MUST propagar tanto la actividad como el corte de sesión a todas las pestañas abiertas del mismo navegador.

#### Scenario: Actividad en una pestaña resetea el timer en las demás
- GIVEN dos o más pestañas abiertas con la misma sesión autenticada
- WHEN se detecta actividad en una de las pestañas
- THEN el sistema MUST reiniciar el timer de inactividad en TODAS las pestañas abiertas

#### Scenario: El corte en una pestaña se propaga a todas
- GIVEN dos o más pestañas abiertas con la misma sesión
- WHEN el countdown llega a 0 y se ejecuta el logout en una pestaña
- THEN el sistema MUST propagar el estado de sesión cerrada a las demás pestañas
- AND las demás pestañas MUST redirigir a `/login`

---

### Requirement: Persistencia de última actividad ante refresh o remount

El sistema MUST inicializar el reloj de inactividad desde el timestamp de última actividad persistido, no desde `Date.now()` en cada montaje.

#### Scenario: Refresh a los 10 minutos de inactividad no resetea el conteo
- GIVEN el usuario lleva 10 minutos sin actividad y navega o refresca la página
- WHEN el componente que gestiona el idle-timeout se vuelve a montar
- THEN el sistema MUST leer el timestamp de última actividad persistido
- AND el conteo MUST continuar desde esos 10 minutos, no reiniciar a 0

#### Scenario: Timestamp persistido ya supera el umbral al montar
- GIVEN el timestamp persistido indica más de 15 minutos transcurridos
- WHEN el componente se monta
- THEN el sistema MUST disparar el flujo de corte inmediatamente, sin esperar un nuevo ciclo de 15 minutos

---

### Requirement: Constantes de configuración del idle-timeout

El sistema MUST definir los umbrales de tiempo como constantes centralizadas, no como valores hardcodeados dispersos.

#### Scenario: IDLE_TIMEOUT_MS y WARNING_BEFORE_MS están centralizados
- GIVEN el módulo de configuración de idle-timeout
- WHEN se referencian los umbrales de corte y aviso en cualquier parte del flujo
- THEN `IDLE_TIMEOUT_MS` MUST valer `900000` (15 min)
- AND `WARNING_BEFORE_MS` MUST valer `60000` (60 s)
- AND ambos valores MUST derivarse de un único punto de definición (sin literales repetidos)
