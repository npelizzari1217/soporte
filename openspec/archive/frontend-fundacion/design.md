# Diseño técnico: frontend-fundacion

> El CÓMO arquitectónico de la fundación del frontend. No incluye specs (qué) ni código.
> Decisiones base ya confirmadas (engram `sdd/frontend-fundacion/decisions`): BFF catch-all proxy + cookies httpOnly · front normaliza (backend INTACTO) · TanStack Query v5 + apiFetch · Next.js servidor Node · middleware con `jose`.

---

## 0. Principio rector

El navegador **nunca posee material de token**. `accessToken` y `refreshToken` viven SOLO en cookies `httpOnly` server-side. Todo request del cliente va **same-origin** a `/api/...` y un único catch-all de Next inyecta el `Authorization: Bearer` leyendo la cookie del lado del servidor. Esto elimina CORS (no se mitiga: se elimina) y vuelve el token inmune a robo por XSS.

Consecuencia de diseño clave: como el browser no tiene el token, el **single-flight de refresh vive en el browser pero solo serializa la LLAMADA `/api/auth/refresh`**, no almacena tokens. El intercambio y la rotación de cookies ocurren server-side en el route handler dedicado.

---

## 1. Estructura de carpetas (Screaming + Atomic + Container/Presentational)

Aplico la **Scope Rule** de la constitución: usado en 1 feature → vive en la feature; usado en 2+ → se promueve a `components/ui` o `shared/`.

```
frontend/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/
│   │   │       └── page.tsx              # presentational; usa features/auth
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx                # DashboardLayout: nav + <SessionProvider> guard suave
│   │   │   ├── page.tsx                  # home del dashboard (placeholder)
│   │   │   ├── tickets/      page.tsx · [id]/page.tsx · nueva/page.tsx   (placeholders)
│   │   │   ├── compras/      page.tsx · [id]/page.tsx                    (placeholders)
│   │   │   ├── reparaciones/ page.tsx · [id]/page.tsx                    (placeholders)
│   │   │   └── equipos/      page.tsx · [id]/page.tsx                    (placeholders)
│   │   ├── api/
│   │   │   ├── [...path]/
│   │   │   │   └── route.ts              # BFF CATCH-ALL: proxy autenticado a NestJS
│   │   │   └── auth/                     # route handlers dedicados (más específicos → ganan al catch-all)
│   │   │       ├── login/route.ts        # login → set-cookies httpOnly
│   │   │       ├── refresh/route.ts      # refresh → rota cookies (single endpoint del single-flight)
│   │   │       └── logout/route.ts       # logout → clear cookies
│   │   ├── layout.tsx                    # RootLayout: <Providers> + <html className="dark">
│   │   └── not-found.tsx
│   │
│   ├── features/                         # Screaming Architecture: grita el dominio
│   │   ├── auth/
│   │   │   ├── components/LoginForm.tsx   # PRESENTACIONAL (props puras + estados)
│   │   │   └── hooks/use-login.ts         # CONTAINER (useMutation → /api/auth/login)
│   │   ├── tickets/      { components/ · hooks/ }   (placeholders por dominio)
│   │   ├── compras/      { components/ · hooks/ }
│   │   ├── reparaciones/ { components/ · hooks/ }
│   │   └── equipos/      { components/ · hooks/ }
│   │
│   ├── components/
│   │   ├── ui/                            # ATOMS (Scope Rule: usados por 2+ features)
│   │   │   ├── button.tsx                 # Shadcn; variante loading (disabled + spinner interno)
│   │   │   ├── input.tsx · card.tsx · badge.tsx · skeleton.tsx
│   │   │   └── empty-state.tsx            # atom propio (ilustración + acción)
│   │   └── shell/                         # MOLECULES compartidas del layout
│   │       ├── app-nav.tsx · page-header.tsx · user-menu.tsx
│   │
│   ├── shared/
│   │   ├── api/
│   │   │   ├── client.ts                  # apiFetch (cliente) + single-flight refresh
│   │   │   ├── server.ts                  # serverFetch (RSC): lee cookies(), va directo al backend
│   │   │   ├── normalize.ts               # raw DTO / {statusCode,message} → T | ApiError
│   │   │   ├── query-keys.ts              # factory de keys de TanStack
│   │   │   └── types.ts                   # ApiError, ApiFetchInit, JwtPayload
│   │   ├── auth/
│   │   │   ├── cookies.ts                 # nombres + atributos canónicos (set/clear)
│   │   │   └── verify.ts                  # verifyAccessToken (jose) — usado por middleware
│   │   ├── hooks/
│   │   │   └── use-session.ts             # consume SessionContext → { user, can(permiso) }
│   │   └── providers/
│   │       ├── providers.tsx              # compone Query + Session
│   │       ├── query-provider.tsx         # QueryClientProvider + defaults
│   │       └── session-provider.tsx       # SessionContext (user hidratado server-side)
│   │
│   └── styles/
│       └── globals.css                    # Tailwind v4 @theme (dark, radii, tokens Shadcn)
│
├── middleware.ts                          # gate de rutas (jose, Edge)
├── test/
│   ├── msw/handlers.ts · server.ts        # mocks de /api y del backend
│   └── helpers/jwt.ts                     # mint de tokens de prueba (jose)
├── vitest.config.ts · vitest.setup.ts
├── playwright.config.ts
├── components.json                        # Shadcn
└── package.json
```

Notas Scope Rule: `LoginForm` queda en `features/auth` (1 feature). `empty-state`, `skeleton`, `button` están en `components/ui` porque los consumen TODAS las listas de dominio. `app-nav` en `components/shell` porque lo usa el `(dashboard)/layout`.

---

## 2. Flujo de auth y cookies (el punto delicado)

### 2.1 Atributos EXACTOS de las cookies

| Cookie | httpOnly | SameSite | Secure | Path | Max-Age | Notas |
|--------|----------|----------|--------|------|---------|-------|
| `at` (access) | **true** | **Lax** | true en prod | `/` | **900** (15 min) | Lo lee el catch-all, los RSC y el middleware. `Path=/` para que el middleware lo vea. |
| `rt` (refresh) | **true** | **Lax** | true en prod | `/` | **604800** (7 días) | `Path=/` para que el middleware detecte sesión viva pese a `at` expirado. Solo lo leen `/api/auth/refresh` y `/api/auth/logout` y el middleware. |

Decisiones de atributos:
- **httpOnly en AMBOS**: el browser jamás los lee desde JS. Inmune a exfiltración por XSS.
- **SameSite=Lax** (no Strict): bloquea el envío de cookies en POST/fetch cross-site (defensa CSRF para métodos que mutan) pero permite la navegación top-level GET (no rompe el redirect externo → `/login`). Strict rompería links entrantes; Lax es el balance correcto para un BFF same-origin.
- **Secure**: `process.env.NODE_ENV === 'production'`. En `localhost` http queda false para dev.
- **Prefijo `__Host-`** en producción (`__Host-at`, `__Host-rt`): exige Secure + Path=/ + sin Domain. Hardening recomendado, activado por env junto con Secure.
- **Defensa CSRF extra**: el catch-all valida `Origin`/`Referer` same-origin en métodos mutantes (POST/PUT/PATCH/DELETE), porque las cookies se envían automáticamente.

### 2.2 Login (paso a paso)

```
Browser LoginForm
  └─ POST /api/auth/login  { email, password }        (same-origin, sin token)
        │
        ▼  app/api/auth/login/route.ts (server)
        ├─ fetch BACKEND POST /api/auth/login { email, password }
        ├─ ← 200 { accessToken, refreshToken }         (tokens en BODY del backend)
        ├─ cookies().set('at', accessToken,  {httpOnly, Lax, Secure?, Path:/,        Max-Age:900})
        ├─ cookies().set('rt', refreshToken, {httpOnly, Lax, Secure?, Path:/,        Max-Age:604800})
        ├─ decode(accessToken) → JwtPayload  (sin verificar firma; viene del backend confiable)
        └─ ← 200 { user: JwtPayload }   ⟶  NINGÚN token cruza al browser
  └─ SessionProvider hidrata { user }; router.push('/')  (dashboard)
```

### 2.3 Request autenticado (vía BFF catch-all)

```
Client useQuery → apiFetch('tickets')
  └─ GET /api/tickets   (cookies 'at'/'rt' viajan automáticamente, same-origin)
        ▼  app/api/[...path]/route.ts
        ├─ path = 'tickets';  at = cookies().get('at')
        ├─ fetch BACKEND GET /api/tickets  con  Authorization: Bearer <at>
        ├─ propaga método, query (?...), body, headers filtrados
        └─ ← copia status + body + content-type del backend  → al cliente
```

### 2.4 Refresh en 401 (transparente)

```
apiFetch('tickets') → GET /api/tickets → catch-all → backend 401 (access expirado)
  └─ catch-all PROPAGA 401 tal cual al cliente   (NO refresca; el single-flight vive en el browser)
        ▼  apiFetch detecta 401
        ├─ await refreshSession()                 ← SINGLE-FLIGHT (ver §3)
        │     └─ POST /api/auth/refresh  (1 sola vez para N requests)
        │           ▼ app/api/auth/refresh/route.ts
        │           ├─ rt = cookies().get('rt')
        │           ├─ fetch BACKEND POST /api/auth/refresh { refreshToken: rt }
        │           ├─ ← 200 { accessToken, refreshToken }   (PAR NUEVO — rotación)
        │           ├─ set-cookie 'at' nuevo · set-cookie 'rt' nuevo
        │           └─ ← 200   (cookies ya rotadas; nada vuelve al browser)
        ├─ retry GET /api/tickets   (browser ya manda el 'at' rotado)
        └─ si 2º 401 → SessionExpired → redirect /login
```

Si `/api/auth/refresh` devuelve 401 (refresh expirado/revocado): el route handler **limpia** ambas cookies y responde 401 → `apiFetch` lanza `SessionExpiredError` → redirect único a `/login`.

---

## 3. Cola de refresh single-flight

### Mecanismo: promesa única a nivel módulo (mutex implícito)

El estado compartido es **una sola promesa en el contexto JS de la pestaña**. No almacena tokens — solo responde "¿hay un refresh en curso?". Awaitear la misma promesa ES la cola: todos los llamadores concurrentes se encolan sobre el mismo `await`.

```ts
// shared/api/client.ts  (módulo singleton del browser)
let refreshPromise: Promise<void> | null = null;

function refreshSession(): Promise<void> {
  // Si ya hay un refresh en vuelo, todos reusan ESA promesa (single-flight).
  refreshPromise ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then((res) => { if (!res.ok) throw new SessionExpiredError(); })
    .finally(() => { refreshPromise = null; });   // permite un refresh futuro
  return refreshPromise;
}

export async function apiFetch<T>(path: string, init?: ApiFetchInit): Promise<T> {
  let res = await rawFetch(path, init);
  if (res.status === 401) {
    try { await refreshSession(); }               // N×401 → 1 sola llamada /refresh
    catch { redirectToLogin(); throw new ApiError(401, 'Session expired'); }
    res = await rawFetch(path, init);             // retry UNA vez con cookie rotada
    if (res.status === 401) { redirectToLogin(); throw new ApiError(401, 'Session expired'); }
  }
  return normalize<T>(res);
}
```

Garantías:
1. **Una sola rotación**: como el backend rota el refresh token en cada `/refresh`, N requests con 401 concurrente que disparen N refreshes causarían que el 2º use un refresh ya revocado. Con la promesa única, el **primer** 401 crea el `fetch('/api/auth/refresh')`; los demás reusan la misma promesa → **exactamente UNA** rotación.
2. **Reintento idempotente del lado del cliente**: tras resolverse el refresh, cada request espera y reintenta; el browser envía automáticamente la cookie `at` rotada (no maneja el valor).
3. **Un solo reintento**: un segundo 401 ⇒ la sesión murió de verdad ⇒ redirect.
4. **Reset con `.finally`**: un 401 futuro (otros 15 min después) puede iniciar un refresh nuevo.

Alternativa rechazada: cola explícita `Array<{resolve,reject}>` + flag `isRefreshing`. Es funcionalmente equivalente pero más verbosa y con más superficie de bug (olvidar drenar la cola en el error path). La promesa-reutilizada es la misma cola, declarativa y atómica.

Por qué browser-side y no dentro del catch-all: en un servidor Node único el estado de módulo del catch-all se comparte, pero detrás de un balanceador (múltiples instancias) el single-flight server-side se rompe; el contexto JS de la pestaña es la única frontera donde TODOS los requests de ese usuario coinciden con certeza. Por eso el single-flight vive en el browser y el route handler de refresh es stateless.

---

## 4. BFF catch-all `app/api/[...path]/route.ts`

Exporta `GET/POST/PUT/PATCH/DELETE` → un único `handler(req, { params })`:

1. `path = params.path.join('/')`; `target = ${BACKEND_URL}/api/${path}${req.nextUrl.search}` (propaga query string).
2. Lee `at` vía `cookies()` (next/headers, server-side); si existe agrega `Authorization: Bearer <at>`.
3. **Headers**: copia `content-type`/`accept`; **descarta** `host`, `cookie`, `content-length`, `connection`. Nunca reenvía las cookies del browser al backend (el backend usa Bearer, no cookies).
4. **Body**: para no-GET/HEAD reenvía `req.body` con `duplex: 'half'` (streaming) o `await req.arrayBuffer()`.
5. **CSRF**: en métodos mutantes valida `Origin`/`Referer` same-origin; si no coincide → 403.
6. `fetch(target, { method, headers, body, redirect: 'manual', cache: 'no-store' })`.
7. **Propaga**: copia `status`, `content-type` y el body (stream) del backend tal cual → `new NextResponse(body, { status, headers })`. El **401 se propaga sin tocar** (lo maneja el single-flight del cliente).

NO proxia `/api/auth/*`: en App Router el segmento estático `app/api/auth/login/route.ts` es más específico que el dinámico `[...path]` y **gana** la resolución. Login/refresh/logout son route handlers dedicados que hacen el intercambio de tokens y el manejo de cookies.

---

## 5. Contrato de `apiFetch`

```ts
// shared/api/types.ts
export interface JwtPayload { sub: string; cliente_id: string; email: string; roles: string[]; permisos: string[]; }

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly messages: string[] = [message],  // NestJS a veces manda message: string[]
    public readonly raw?: unknown,
  ) { super(message); this.name = 'ApiError'; }
}

export type ApiFetchInit = Omit<RequestInit, 'body'> & { json?: unknown; body?: BodyInit };

// shared/api/normalize.ts
export async function normalize<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : await res.text();
  if (!res.ok) {                                   // NestJS: { statusCode, message, error }
    const msg = Array.isArray(body?.message) ? body.message : [body?.message ?? res.statusText];
    throw new ApiError(res.status, msg[0], msg, body);
  }
  return body as T;                                // DTO crudo: backend INTACTO, sin wrapper {success,data}
}
```

Firma: `apiFetch<T>(path: string, init?: ApiFetchInit): Promise<T>`. `json` se serializa y agrega `content-type: application/json`. Devuelve `T` tipado o lanza `ApiError`.

Integración TanStack Query v5:
- `queryFn: () => apiFetch<Ticket[]>('tickets')`
- `mutationFn: (dto: CreateTicketDto) => apiFetch<Ticket>('tickets', { method: 'POST', json: dto })`
- Defaults del QueryClient: `retry: (n, e) => e instanceof ApiError && e.statusCode >= 500 && n < 2` (NO reintenta 401 — ya lo resolvió apiFetch — ni otros 4xx); `refetchOnWindowFocus: false`; `staleTime: 30_000`.

Estados obligatorios de la constitución (mapeo directo, sin código extra):
- `useQuery().isPending` → **Skeleton** (`<Skeleton/>`, nunca spinner full-screen).
- `data?.length === 0` → **EmptyState** (`<EmptyState/>` con ilustración + acción).
- `useMutation().isPending` → **Button loading** (disabled + spinner interno + "Loading…").

RSC: `serverFetch<T>(path)` en `shared/api/server.ts` lee `cookies()` y va **directo al backend** con Bearer (`cache: 'no-store'`), evitando el hop de proxy; sin single-flight (los RSC no comparten el ciclo de vida del browser). La fundación usa principalmente `apiFetch` (login → dashboard interactivo).

---

## 6. Middleware (`jose`, Edge)

`shared/auth/verify.ts` expone `verifyAccessToken(token): Promise<JwtPayload | 'expired' | 'invalid'>` usando `jose.jwtVerify` con el secreto del backend (HS256, `TextEncoder().encode(JWT_SECRET)`). Si el backend firmara RS256, se cambia a `importSPKI`/`createRemoteJWKSet` sin tocar el resto.

Qué verifica el middleware (no solo presencia: **firma + exp**, con tolerancia a access expirado):
1. Lee cookie `at`:
   - **firma válida y no expirado** → `next()`.
   - **expirado** (`JWTExpired`) → si existe cookie `rt` → `next()` (el `apiFetch` del cliente refrescará en el primer request); si no → redirect `/login`.
   - **firma inválida** (forjado) → redirect `/login`.
2. Sin cookie `at` → si hay `rt` → `next()`; si no → redirect `/login`.
3. En `/login` con sesión viva (`at` válido o `rt` presente) → redirect `/` (dashboard).

Clave: el middleware **no bloquea por access expirado**; si lo hiciera, cada 15 min el usuario sería expulsado pese a tener refresh válido. La frescura real la resuelve el single-flight del cliente.

Matcher:
```ts
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|api|.*\\.\\w+$).*)'] };
```
Excluye `_next`, assets estáticos y `/api` (los route handlers manejan su propia auth). Cubre rutas de app (`/`, `/tickets`, …) y `/login` (rama 3).

Riesgo jose/Edge — resolución: jose es isomórfico y Edge-ready (no usa APIs Node). Se aísla en `verify.ts` con la abstracción de algoritmo. El secreto va por env disponible en Edge.

---

## 7. Design system Tailwind v4 (CSS-first) + Shadcn

`styles/globals.css`:
```css
@import "tailwindcss";

@theme {
  /* radios EXACTOS de la constitución */
  --radius-md: 6px;   /* botones, inputs, dropdowns → rounded-md */
  --radius-lg: 8px;   /* cards, paneles            → rounded-lg */

  /* paleta DARK por defecto (estética Stripe/Linear, ultra limpia) */
  --color-background: oklch(0.16 0 0);
  --color-foreground: oklch(0.97 0 0);
  --color-card:       oklch(0.19 0 0);
  --color-border:     oklch(0.27 0 0);
  --color-muted:      oklch(0.24 0 0);
  --color-primary:    oklch(0.62 0.19 256);   /* acento */
  --color-primary-foreground: oklch(0.98 0 0);
  --color-destructive: oklch(0.58 0.22 27);
  /* ...tokens que consumen los componentes Shadcn como bg-background, text-foreground */
}
```

Convivencia con Shadcn:
- Shadcn v4 referencia utilidades semánticas (`bg-background`, `text-foreground`, `border-border`, `rounded-md`, `rounded-lg`). Se resuelven contra los tokens del `@theme` → un único sistema de tokens, sin duplicar.
- **Dark por defecto**: los valores dark van en `@theme`/`:root` directamente y `<html className="dark">` en RootLayout. No hace falta toggle para la fundación.
- Los radios de Shadcn se alinean a la constitución porque `button.tsx` usa `rounded-md` (6px) y `card.tsx` usa `rounded-lg` (8px), que mapean a `--radius-md`/`--radius-lg`. Se ajusta cualquier default de Shadcn que derive de `--radius` para usar estos tokens.

Organización atómica:
- **Atoms** → `components/ui/`: `button` (con variante loading), `input`, `card`, `badge`, `skeleton`, `empty-state` (propio).
- **Molecules** → `components/shell/`: `app-nav`, `page-header`, `user-menu` (compartidos por el dashboard).
- **Container/Presentational** por feature: p.ej. `LoginForm` (presentational, props + estados) + `use-login` (container con `useMutation`). Las futuras listas de dominio: container `TicketsList` (usa `useTickets`) → renderiza `TicketsListView` presentational.

Riesgo Tailwind v4 docs escasas — resolución: fijar versiones exactas (`tailwindcss@4`, `@tailwindcss/postcss`), seguir la guía oficial de upgrade, dejar `globals.css` como fuente canónica comentada, e inicializar Shadcn con el flag v4. La fase tasks entrega el `globals.css` completo como artefacto para no improvisar.

---

## 8. Estrategia de testing del frontend (define el TDD de apply)

Stack recomendado:
- **Vitest + React Testing Library + jsdom** — unit y componentes. Vitest por ESM/velocidad y encaje natural con Tailwind v4; RTL para comportamiento (no implementación).
- **MSW (Mock Service Worker)** — intercepta `/api/*` y el backend. Imprescindible para: normalización a `ApiError`, **single-flight** (assert: N×401 ⇒ exactamente 1 `POST /api/auth/refresh`), y propagación del catch-all.
- **jose (helpers de test)** — mintear access tokens válidos/expirados/forjados para los tests de middleware y verify.
- **Playwright** — e2e del flujo crítico login → cookies httpOnly seteadas → dashboard protegido → logout. Playwright valida atributos de cookie vía `context.cookies()` y el redirect del no autenticado.

Capas de prueba:
1. `normalize`/`ApiError` (Vitest) — shapes 200/204/4xx/`message:string[]`.
2. **single-flight refresh** (Vitest + MSW) — el más riesgoso, se testea primero: disparar N requests con 401 concurrente y assert 1 sola rotación + reintento OK.
3. catch-all proxy (Vitest, `NextRequest` mock) — Bearer inyectado, query/body/método propagados, cookies del browser NO reenviadas, status copiado, CSRF Origin en mutaciones.
4. auth route handlers (Vitest) — atributos exactos de `Set-Cookie` (httpOnly/SameSite/Secure/Path/Max-Age) en login/refresh; clear en logout y en refresh fallido.
5. middleware (Vitest + jose) — válido→next, expirado+rt→next, expirado sin rt→redirect, forjado→redirect, `/login` con sesión→redirect.
6. `LoginForm` (RTL) — estados loading/disabled, error de credenciales.
7. login e2e (Playwright) — flujo completo + assert cookies httpOnly + guard de ruta.

Orden TDD (RED primero, según constitución §4): 1 → 2 → 3 → 4 → 5 → 6 → 7. El item 2 (single-flight) se escribe y se hace fallar ANTES de implementar el cliente, por ser el riesgo número uno.

Config: `vitest.config.ts`, `vitest.setup.ts` (matchers RTL + arranque del server MSW), `playwright.config.ts`, `test/msw/{handlers,server}.ts`, `test/helpers/jwt.ts`.

---

## 9. ADRs (decisiones con alternativa rechazada)

- **ADR-1 · Refresh server-side en route handler, single-flight client-side.** Rechazado refrescar dentro del catch-all: el single-flight in-process se rompe con múltiples instancias Node y arriesga rotación paralela del refresh token. El browser es la única frontera donde coinciden todos los requests del usuario.
- **ADR-2 · Cookies `httpOnly` ambas (full BFF).** Rechazada la Opción C del explore (access JS-readable): expone el token 15 min a XSS. La decisión confirmada prioriza XSS-safe total a costa de proxiar todo el CRUD.
- **ADR-3 · SameSite=Lax (no Strict).** Strict rompe navegación top-level entrante; Lax ya bloquea POST/fetch cross-site (CSRF de mutaciones). Defensa extra: check de Origin en el catch-all.
- **ADR-4 · Middleware tolerante a access expirado.** Rechazado bloquear por exp: expulsaría al usuario cada 15 min pese a refresh válido. Gatea por firma + presencia de `rt`; la frescura la da el single-flight.
- **ADR-5 · `rt` con Path=/ (no /api/auth).** Sacrifica scoping fino para que el middleware (en rutas `/`) detecte sesión viva. Mitigado por httpOnly + same-origin + TLS + prefijo `__Host-` en prod.
- **ADR-6 · Front normaliza, backend intacto.** Confirmado: `normalize` mapea DTOs crudos y `{statusCode,message}`; no se reabre el backend archivado (1448 tests verdes).
```
