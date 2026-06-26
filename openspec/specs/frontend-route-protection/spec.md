# Spec: Frontend Route Protection

> Capability: `frontend-route-protection`
> Stack: Next.js Middleware (Edge Runtime), jose
> Archivado desde: `frontend-fundacion` (2026-06-26)

## Context

El middleware de Next.js (`middleware.ts`) intercepta cada request a rutas protegidas —
todas excepto `/login`, `/api/*`, y assets estáticos — y verifica el JWT contenido en la
cookie `at` usando `jose`. `jose` es obligatorio porque el Edge Runtime de Next.js no admite
el paquete `jsonwebtoken` (Node.js-only).

El middleware distingue tres estados:
1. Sin cookies válidas (`at` ausente/inválido y `rt` ausente) → redirect inmediato a `/login`
2. `at` ausente o expirado pero `rt` presente → `next()` (ADR-4 tolerante; el cliente single-flight refrescará en el primer 401)
3. `at` presente y JWT válido → `next()` sin intervención

> **ADR-4 — Middleware tolerante a access expirado** (aceptado, no es deuda):
> La spec original (`refresh-silencioso`) requería que el middleware llamara internamente a
> `/api/auth/refresh` server-side cuando `at` estaba expirado. Esto fue rechazado porque:
> (a) en despliegues multi-instancia Node el estado de módulo del route handler de refresh
> no se comparte entre instancias, causando rotaciones de token en paralelo; (b) el browser
> es la única frontera donde todos los requests del usuario coinciden con certeza.
> Solución: el middleware es tolerante si `rt` existe (el usuario tiene sesión, aunque `at`
> esté expirado). El `apiFetch` del cliente tiene un single-flight de refresh que resuelve el
> nuevo `at` de forma transparente en el primer 401. El usuario no experimenta ningún redirect.

El matcher excluye: `_next/static`, `_next/image`, `favicon.ico`, `/api/*`, y archivos con
extensión (`.*\\.\\w+$`). Cubre rutas de app (`/`, `/tickets`, …) y `/login`.

---

## Requirements

### Requirement: Acceso sin sesión redirige a /login

#### Scenario: Request a ruta protegida sin cookies de sesión → redirect a /login
**Given** el usuario no está autenticado (no hay cookie `at` ni cookie `rt`)
**When** navega a cualquier ruta dentro del grupo `(dashboard)` (ej. `/`, `/tickets`, `/compras`, `/reparaciones`, `/equipos`)
**Then** el middleware MUST interceptar el request antes de que el page handler ejecute
**And** MUST responder con un redirect HTTP 307 a `/login`
**And** MUST NOT renderizar ningún fragmento de la página protegida

#### Scenario: Request a /login sin sesión pasa sin redirect
**Given** el usuario no está autenticado
**When** navega a `/login`
**Then** el middleware MUST dejar pasar el request sin intervención
**And** MUST NOT redirigir a `/`

#### Scenario: Usuario autenticado que navega a /login es redirigido a /
**Given** el usuario tiene una cookie `at` con JWT válido y no expirado, o tiene `rt` presente
**When** navega a `/login`
**Then** el middleware MUST redirigir a `/` (dashboard home)
**And** MUST NOT renderizar el formulario de login

---

### Requirement: Verificación del JWT usa jose (Edge Runtime)

#### Scenario: JWT válido pasa la verificación y el request continúa
**Given** la cookie `at` contiene un JWT firmado con el secreto correcto y no expirado
**When** el middleware ejecuta `jose.jwtVerify(token, secret)`
**Then** MUST verificar la firma y la expiración correctamente
**And** MUST dejar pasar el request al page handler
**And** MUST NOT modificar el request ni la respuesta

#### Scenario: JWT con firma inválida → redirect a /login + limpiar cookie
**Given** la cookie `at` contiene un JWT con firma corrupta o firmado con secreto incorrecto
**When** `jose.jwtVerify` evalúa el token
**Then** MUST detectar error de verificación de firma
**And** el middleware MUST redirigir a `/login`
**And** MUST eliminar la cookie `at` inválida (Set-Cookie maxAge=0 en la respuesta del redirect)

#### Scenario: El middleware no importa jsonwebtoken
**Given** el runtime del middleware es Edge
**When** se analiza el árbol de dependencias del middleware
**Then** MUST usar `jose` para la verificación de JWT
**And** MUST NOT importar `jsonwebtoken` ni ningún otro paquete incompatible con Edge Runtime

---

### Requirement: Tolerancia a access expirado cuando refreshToken está presente (ADR-4)

> Esta sección reemplaza el requisito "refresh-silencioso" del spec original, que requería que
> el middleware llamara server-side a `/api/auth/refresh`. Ese diseño fue rechazado (ADR-4).
> La experiencia de usuario resultante es idéntica: sin redirect, sin parpadeo.

#### Scenario: accessToken expirado + refreshToken presente → middleware pasa, cliente refresca
**Given** la cookie `at` contiene un JWT expirado (error `JWTExpired` de jose)
**And** la cookie `rt` existe (no ha expirado desde el punto de vista del browser)
**When** el usuario navega a cualquier ruta protegida
**Then** el middleware MUST detectar la expiración del `at` via la excepción `JWTExpired`
**And** MUST verificar que la cookie `rt` existe
**And** MUST llamar a `next()` (dejar pasar el request) SIN llamar a `/api/auth/refresh`
**And** el primer request del cliente que reciba 401 del backend MUST disparar el single-flight de refresh en `apiFetch`
**And** el usuario MUST NOT experimentar ningún redirect, parpadeo, ni pantalla de login

#### Scenario: accessToken expirado + refreshToken ausente → redirect a /login
**Given** la cookie `at` expiró
**And** la cookie `rt` no existe (sesión completamente expirada)
**When** el usuario navega a cualquier ruta protegida
**Then** el middleware MUST redirigir a `/login`
**And** MUST NOT dejar pasar el request al page handler

#### Scenario: accessToken ausente + refreshToken presente → middleware pasa, cliente refresca
**Given** no hay cookie `at` (ej. fue expirada o limpiada)
**And** la cookie `rt` existe
**When** el usuario navega a cualquier ruta protegida
**Then** el middleware MUST verificar que `rt` existe y llamar a `next()`
**And** el cliente single-flight resolverá el refresh en el primer 401

---

### Requirement: Rutas de auth y assets excluidas del middleware

#### Scenario: /api/* no es interceptado por el middleware de protección
**Given** el middleware tiene configurado un `matcher` que excluye `/api`
**When** el browser llama a `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout` o cualquier `/api/[...path]`
**Then** el middleware MUST NOT interceptar esos requests
**And** MUST NOT exigir que exista una cookie `at` para esos paths

#### Scenario: Assets estáticos (/_next/*, /favicon.ico, archivos con extensión) no son interceptados
**Given** el browser solicita un asset estático
**When** Next.js procesa el request
**Then** el middleware MUST NOT ejecutarse para esos paths
**And** MUST NOT redirigir a `/login` al cargar imágenes, fuentes o JS del bundle
