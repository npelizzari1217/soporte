# Spec: Frontend Route Protection

> Change: `frontend-fundacion`
> Capability: `frontend-route-protection`
> Stack: Next.js Middleware (Edge Runtime), jose

## Context

El middleware de Next.js (`middleware.ts`) intercepta cada request a rutas protegidas —
todas excepto `/login`, `/api/auth/*`, y assets estáticos — y verifica el JWT contenido
en la cookie `accessToken` usando `jose`. `jose` es obligatorio porque el Edge Runtime de
Next.js no admite el paquete `jsonwebtoken` (Node.js-only).

El middleware distingue tres estados:
1. Sin cookie `accessToken` → redirect inmediato a `/login`
2. Cookie presente pero JWT expirado → intento de refresh silencioso:
   - Si el Route Handler `/api/auth/refresh` responde 200 → nuevas cookies seteadas, request continúa
   - Si falla → redirect a `/login` con cookies limpiadas
3. Cookie presente y JWT válido → request pasa sin intervención

El refresh silencioso ocurre íntegramente dentro del middleware (server-side).
El usuario nunca experimenta un redirect intermedio ni un parpadeo de pantalla.

---

## Requirements

### Requirement: Acceso sin sesión redirige a /login

#### Scenario: Request a ruta protegida sin cookie accessToken → redirect a /login
**Given** el usuario no está autenticado (no hay cookie `accessToken`)  
**When** navega a cualquier ruta dentro del grupo `(dashboard)` (ej. `/dashboard`, `/tickets`, `/compras`, `/reparaciones`, `/equipos`)  
**Then** el middleware MUST interceptar el request antes de que el page handler ejecute  
**And** MUST responder con un redirect HTTP 307 a `/login`  
**And** MUST NOT renderizar ningún fragmento de la página protegida

#### Scenario: Request a /login sin sesión pasa sin redirect
**Given** el usuario no está autenticado  
**When** navega a `/login`  
**Then** el middleware MUST dejar pasar el request sin intervención  
**And** MUST NOT redirigir a `/dashboard`

#### Scenario: Usuario autenticado que navega a /login es redirigido a /dashboard
**Given** el usuario tiene una cookie `accessToken` con JWT válido y no expirado  
**When** navega a `/login`  
**Then** el middleware MUST redirigir a `/dashboard`  
**And** MUST NOT renderizar el formulario de login

---

### Requirement: Verificación del JWT usa jose (Edge Runtime)

#### Scenario: JWT válido pasa la verificación y el request continúa
**Given** la cookie `accessToken` contiene un JWT firmado con el secreto correcto y no expirado  
**When** el middleware ejecuta `jose.jwtVerify(token, secret)`  
**Then** MUST extraer el payload `{ sub, cliente_id, email, roles, permisos }`  
**And** MUST dejar pasar el request al page handler  
**And** MUST NOT modificar el request ni la respuesta

#### Scenario: JWT con firma inválida → redirect a /login
**Given** la cookie `accessToken` contiene un JWT con firma corrupta o firmado con secreto incorrecto  
**When** `jose.jwtVerify` evalúa el token  
**Then** MUST lanzar error de verificación  
**And** el middleware MUST redirigir a `/login`  
**And** MUST eliminar la cookie `accessToken` inválida (Set-Cookie maxAge=0)

#### Scenario: El middleware no importa jsonwebtoken
**Given** el runtime del middleware es Edge  
**When** se analiza el árbol de dependencias del middleware  
**Then** MUST usar `jose` para la verificación de JWT  
**And** MUST NOT importar `jsonwebtoken` ni ningún otro paquete incompatible con Edge Runtime

---

### Requirement: Refresh silencioso cuando el accessToken expiró y el refreshToken es válido

#### Scenario: accessToken expirado + refreshToken válido → refresh transparente, request continúa
**Given** la cookie `accessToken` contiene un JWT expirado (error `JWTExpired` de jose)  
**And** la cookie `refreshToken` es válida (no expirado, no revocado en el backend)  
**When** el usuario navega a cualquier ruta protegida  
**Then** el middleware MUST detectar la expiración vía la excepción `JWTExpired` de jose  
**And** MUST llamar internamente al Route Handler `/api/auth/refresh` (server-to-server, sin redirect al browser)  
**And** MUST recibir el nuevo par `{ accessToken, refreshToken }` y setear las cookies actualizadas en la respuesta de la request original  
**And** MUST dejar pasar el request al page handler  
**And** el usuario MUST NOT experimentar ningún redirect, parpadeo, ni pantalla de login

#### Scenario: accessToken expirado + refreshToken expirado/revocado → redirect a /login
**Given** la cookie `accessToken` expiró  
**And** la cookie `refreshToken` también expiró o fue revocada en el backend (Route Handler devuelve 401)  
**When** el usuario navega a cualquier ruta protegida  
**Then** el middleware MUST intentar el refresh y recibir HTTP 401 del Route Handler  
**And** MUST limpiar ambas cookies en la respuesta del redirect (Set-Cookie maxAge=0)  
**And** MUST redirigir a `/login`

#### Scenario: Tras refresh fallido, /login no tiene cookies de sesión residuales
**Given** el refresh falló y el middleware limpió las cookies  
**When** el browser renderiza `/login`  
**Then** MUST NOT haber cookie `accessToken` ni `refreshToken` activas  
**And** el middleware MUST tratar al usuario como no autenticado en requests subsiguientes

---

### Requirement: Rutas de auth y assets excluidas del middleware

#### Scenario: /api/auth/* no es interceptado por el middleware de protección
**Given** el middleware tiene configurado un `matcher` que excluye `/api/auth/:path*`  
**When** el browser llama a `/api/auth/login` o `/api/auth/refresh` o `/api/auth/logout`  
**Then** el middleware MUST NOT interceptar esos requests  
**And** MUST NOT exigir que exista una cookie `accessToken` para esos paths

#### Scenario: Assets estáticos (/_next/*, /favicon.ico, /public/*) no son interceptados
**Given** el browser solicita un asset estático  
**When** Next.js procesa el request  
**Then** el middleware MUST NOT ejecutarse para esos paths  
**And** MUST NOT redirigir a `/login` al cargar imágenes, fuentes o JS del bundle
