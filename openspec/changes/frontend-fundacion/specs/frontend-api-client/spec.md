# Spec: Frontend API Client

> Change: `frontend-fundacion`
> Capability: `frontend-api-client`
> Stack: TypeScript (browser + server), TanStack Query v5

## Context

`apiFetch` es la función central de comunicación HTTP del frontend. Llama exclusivamente a rutas
same-origin `/api/*` (BFF proxy de Next.js) — nunca directamente al backend NestJS. El BFF proxy
(`/api/[...path]`) inyecta el `accessToken` desde la cookie httpOnly server-side antes de reenviar
a NestJS. El browser no tiene acceso al token.

Responsabilidades de `apiFetch`:
1. **Normalización de respuestas**: NestJS devuelve DTOs crudos (sin wrapper). `apiFetch` retorna
   la respuesta tipeada como `T` sin modificarla.
2. **Normalización de errores**: NestJS emite `{ statusCode: number, message: string | string[] }`.
   `apiFetch` transforma esto en un tipo propio `ApiError` discriminable por los callers.
3. **Manejo de 401**: Dispara refresh y reintenta el request original UNA sola vez. Si el refresh
   falla, propaga `ApiError { statusCode: 401 }` sin más reintentos.
4. **Single-flight de refresh**: Si múltiples requests concurrentes reciben 401, exactamente un
   solo request de refresh se dispara. Las demás requests esperan en una cola y se reintentan
   automáticamente cuando el refresh resuelve (el nuevo token queda en la cookie httpOnly; el BFF
   lo lee automáticamente en el retry).

Contexto de uso:
- **Client Components**: dentro de `queryFn`/`mutationFn` de TanStack Query
- **Server Components**: llamado directamente con `cache: 'no-store'`, con forwarding manual de
  la cookie del request entrante

---

## Requirements

### Requirement: Normalización de respuestas exitosas

#### Scenario: Respuesta 2xx devuelve el DTO tipeado sin modificación
**Given** NestJS responde HTTP 200 con body `{ id: "uuid", nombre: "Ticket #1", ... }` (DTO crudo)  
**When** `apiFetch<T>(path, options)` recibe la respuesta  
**Then** MUST parsear el body como JSON y retornarlo como `T`  
**And** MUST NOT envolver en `{ success, data }` ni alterar la estructura del DTO  
**And** MUST NOT agregar propiedades adicionales al objeto retornado

#### Scenario: Respuesta 204 No Content retorna undefined sin error
**Given** NestJS responde HTTP 204 sin body (ej. logout, delete, logout-all)  
**When** `apiFetch<void>(path, options)` recibe la respuesta  
**Then** MUST retornar `undefined`  
**And** MUST NOT intentar parsear el body (evitar error de JSON vacío)  
**And** MUST NOT lanzar ningún error

---

### Requirement: Normalización de errores de NestJS a ApiError

#### Scenario: Error con message string se normaliza a ApiError con código HTTP
**Given** NestJS responde HTTP 400 con body `{ statusCode: 400, message: "Descripción del error" }`  
**When** `apiFetch` recibe la respuesta con `response.ok === false`  
**Then** MUST lanzar un objeto `ApiError` con `{ statusCode: 400, message: "Descripción del error" }`  
**And** el caller MUST poder discriminar el error por `error instanceof ApiError` y leer `error.statusCode`

#### Scenario: Error con message array (validación) se normaliza a string único
**Given** NestJS responde HTTP 422 con `{ statusCode: 422, message: ["campo requerido", "email inválido"] }`  
**When** `apiFetch` recibe la respuesta  
**Then** MUST normalizar `message[]` a un único string (ej. `"campo requerido; email inválido"` o el primer elemento)  
**And** MUST setear `statusCode: 422` en el `ApiError` resultante

#### Scenario: Error de red (sin respuesta HTTP) se normaliza a ApiError genérico
**Given** el request falla sin recibir respuesta HTTP (timeout, conexión rechazada)  
**When** `apiFetch` captura la excepción de red  
**Then** MUST lanzar un `ApiError` con `{ statusCode: 0, message: "Error de red" }` (o equivalente)  
**And** MUST NOT dejar que el `TypeError` de red nativo burbujee sin normalizar al caller

---

### Requirement: Retry único en 401 con refresh previo

#### Scenario: 401 → refresh exitoso → reintento exitoso del request original
**Given** el accessToken en la cookie expiró y el refreshToken aún es válido  
**When** `apiFetch` recibe HTTP 401 en un request a `/api/compras`  
**Then** MUST llamar a POST `/api/auth/refresh` (Route Handler de Next.js)  
**And** si el refresh responde 200 (nuevas cookies httpOnly seteadas por el Route Handler)  
**Then** MUST reintentar el request original a `/api/compras` UNA ÚNICA VEZ  
**And** MUST retornar la respuesta del reintento al caller  
**And** MUST NOT llamar a `/api/auth/refresh` más de una vez por este ciclo de 401

#### Scenario: 401 → refresh fallido → ApiError propagado sin reintentos adicionales
**Given** el accessToken expiró y el refreshToken también expiró o fue revocado  
**When** `apiFetch` recibe HTTP 401 y llama a `/api/auth/refresh`  
**And** el refresh responde HTTP 401  
**Then** MUST lanzar `ApiError { statusCode: 401 }` al caller  
**And** MUST NOT reintentar el request original  
**And** MUST NOT intentar un segundo refresh

#### Scenario: 401 en el propio endpoint de refresh no causa bucle infinito
**Given** el request es directamente a `/api/auth/refresh` y NestJS responde 401  
**When** `apiFetch` detecta el 401 en ese path  
**Then** MUST NOT disparar otro refresh (la ruta `/api/auth/refresh` debe estar excluida del mecanismo de retry)  
**And** MUST lanzar `ApiError { statusCode: 401 }` directamente

---

### Requirement: Single-flight de refresh (requests concurrentes con 401)

#### Scenario: 3 requests concurrentes con 401 → exactamente 1 refresh
**Given** 3 requests a `/api/tickets`, `/api/compras`, `/api/equipos` están en vuelo simultáneamente  
**And** el accessToken expiró y las 3 reciben HTTP 401  
**When** las respuestas 401 llegan (en cualquier orden)  
**Then** MUST dispararse exactamente 1 request a `/api/auth/refresh` en total (no 3)  
**And** los otros 2 requests MUST quedar encolados en espera hasta que el refresh resuelva  
**And** una vez que el refresh completa con 200, los 3 requests originales MUST reintentarse (el BFF lee el nuevo token de la cookie actualizada)  
**And** si el refresh falla con 401, los 3 requests encolados MUST fallar con `ApiError { statusCode: 401 }` sin disparar más refreshes

#### Scenario: Nuevo request que llega mientras el refresh está en curso se encola
**Given** un refresh está en progreso (iniciado por un 401 anterior, la Promise no resolvió aún)  
**When** llega un nuevo request que también recibe 401  
**Then** MUST unirse a la cola del refresh en curso (reutilizar la misma Promise)  
**And** MUST NOT disparar un segundo refresh en paralelo  
**And** MUST reintentarse con el token actualizado cuando el refresh en curso completa

---

### Requirement: apiFetch en Server Components

#### Scenario: Server Component llama apiFetch con forwarding de cookies del request
**Given** un Server Component en el App Router necesita datos del backend  
**When** llama a `apiFetch(path, { headers: { Cookie: cookiesString }, cache: 'no-store' })`  
**Then** MUST incluir la cookie `accessToken` en el header forwarded al BFF  
**And** MUST obtener los datos directamente via `await` sin TanStack Query  
**And** MUST NOT intentar el mecanismo de single-flight de refresh (no aplica en server — el middleware ya garantizó un token válido antes de que el Server Component ejecute)
