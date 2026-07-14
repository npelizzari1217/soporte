# Design: idle-session-timeout

> Fase DESIGN (el HOW arquitectónico). Los pasos concretos van en `tasks.md`.
> Approach A de la exploración/propuesta: timer client-side puro + reuso de `/api/auth/logout`.
> Restricción dura: CERO cambios de backend. La detección de inactividad es **capa de presentación**;
> el límite de seguridad real (revocación de `rt` + clear de cookies) queda intacto en la ruta BFF existente.

## 1. Enfoque arquitectónico

### 1.1 Ubicación en Clean / Screaming Architecture

La inactividad NO es dominio ni aplicación: es una preocupación de UX/presentación. Por eso NO se
crea ningún use-case, entidad ni value-object. El único "efecto de autoridad" (revocar token) se
delega al primitivo de infraestructura ya existente (`POST /api/auth/logout`), que la exploración
verificó correcto y probado.

Mapa por skill `auth-access`:

| Concepto | Qué | Dónde (este change) |
|----------|-----|---------------------|
| Detección de inactividad | ¿Sigue presente el usuario? | Presentación (hook + provider) — NUEVO |
| Revocación de sesión | Invalidar `rt` server-side + limpiar cookies | Infra existente `api/auth/logout/route.ts` — REUSO SIN TOCAR |
| Identidad actual | `user` del JWT decodificado | `useSession()` existente — REUSO |
| UI del aviso | Modal countdown | Presentación (`IdleWarningDialog`) — NUEVO |

`clean-arch`: no se viola ninguna regla de dependencia porque todo lo nuevo vive en `presentation`
(hooks/providers/components) y solo consume infra a través de `fetch` al BFF (igual que el resto del
frontend). Cero lógica de negocio en la UI: el hook expone estado + callbacks, el provider hace el
side-effect de red, el diálogo es puramente presentacional.

### 1.2 Componentes y responsabilidades (SRP)

```
frontend/src/shared/auth/idle-config.ts        (NUEVO)  constantes puras, sin acceso a window
frontend/src/shared/auth/idle-storage.ts       (NUEVO)  read/write localStorage + keys + signalLogout (guards typeof window)
frontend/src/shared/hooks/use-idle-timeout.ts  (NUEVO)  máquina de estados testeable (core)
frontend/src/shared/providers/idle-timeout-provider.tsx (NUEVO)  guard de sesión + wiring logout/redirect + render modal
frontend/src/components/shell/idle-warning-dialog.tsx   (NUEVO)  Radix AlertDialog presentacional
frontend/src/shared/providers/providers.tsx    (EDIT)   monta IdleTimeoutProvider dentro de SessionProvider
```

Reusados sin cambios: `api/auth/logout/route.ts`, `middleware.ts`, `cookies.ts`, `confirm-dialog.tsx` (patrón), `use-session.ts`.

### 1.3 Data flow

```
 eventos DOM (mousemove/keydown/scroll/touchstart/mousedown)
        │  (throttle 1s)
        ▼
 use-idle-timeout ──► escribe lastActivity en localStorage ──► storage event ──► otras pestañas (reset)
        │
        │ deadline = lastActivity + IDLE_TIMEOUT_MS
        │
   [active] ──setTimeout(warning)──► [warning] ──setInterval(1s): secondsLeft──► 0 ──► onCutoff()
        ▲                                  │
        └────── stayConnected() ───────────┘
                                           │
                              provider.handleCutoff():
                                signalLogout() (localStorage) ─► otras pestañas: redirect sin re-logout
                                await fetch(/api/auth/logout)  ─► revoca rt + clear cookies
                                window.location.assign('/login')  (hard nav)
```

## 2. Máquina de estados del hook

Estados internos mientras el provider está `enabled`:

- **`active`**: sesión viva, contando hacia el umbral de warning. Un solo `setTimeout` agendado.
- **`warning`**: modal abierto, `setInterval(1000)` actualizando `secondsLeft` y chequeando corte.
- **`cutoff`**: transitorio; `onCutoff()` disparado una sola vez (guard `cuttingOffRef`), timers limpiados.

Cuando el provider está `!enabled` (user null / isLoading / ruta /login) el hook está en un
**no-op total**: no registra listeners, no agenda timers, no toca localStorage.

Transiciones:

```
            enabled=true (mount / init desde localStorage)
                       │
            ┌──────────┴───────────┐
   elapsed>=IDLE      warning-window       resto
   → cutoff()      → warning(secsRest)   → active
        │                  │                 │
        │        stayConnected/activity-cross-tab
        │                  └────────► active ┘
   active ──timeout──► warning ──interval→0──► cutoff()
   warning ──stayConnected()──► active
   (cualquier estado) ──storage 'logout' event──► cleanup + redirect (sin re-logout)
```

## 3. ADRs

### ADR-1 — API del hook `useIdleTimeout`

**Decisión.** Firma con inyección de reloj para testeo y callback de corte (el hook NO hace red):

```ts
interface UseIdleTimeoutParams {
  enabled: boolean;               // provider: user != null && !isLoading
  onCutoff: () => void;           // provider hace logout+redirect; el hook solo lo dispara 1 vez
  idleTimeoutMs?: number;         // default IDLE_TIMEOUT_MS
  warningBeforeMs?: number;       // default WARNING_BEFORE_MS
  now?: () => number;             // default Date.now — inyectable para fake timers/determinismo
}

interface UseIdleTimeoutResult {
  isWarning: boolean;             // controla `open` del modal
  secondsLeft: number;            // segundos hasta el corte (válido en warning)
  stayConnected: () => void;      // resetea actividad y cierra el modal
}
```

**Rationale.** El hook es la unidad central testeable. Separar `onCutoff` (efecto de red, lo hace el
provider) de la detección (lo hace el hook) mantiene el hook PURO respecto de I/O: en tests se asserta
"onCutoff fue llamado" con fake timers, sin mockear `fetch` ni router. `now` inyectable evita depender
del reloj real y hace el cálculo de `secondsLeft` determinista.

**Debounce/throttle de eventos.** Un solo guard por timestamp dentro del handler:
`if (now() - lastActivityRef.current < ACTIVITY_THROTTLE_MS) return;`. Evita churn de timers en cada
`mousemove`. Durante `warning` los eventos pasivos se IGNORAN (ver ADR-8): solo `stayConnected()`
resetea. Los timers se reprograman una sola vez por ventana de throttle.

**Mecanismo de timers (elegido).** Deadlines como timestamps + `setTimeout` para la transición a
warning + `setInterval(1000)` SOLO durante warning para el countdown y el chequeo de corte. Un único
`scheduleTimers()` centraliza el cálculo `msUntilWarning`/`msUntilCutoff` y unifica el arranque normal
con la inicialización desde localStorage (ADR-2). Rechazado: `setInterval` global de 1s en estado
active (desperdicia ticks y batería sin necesidad).

**Rechazado — hook que hace su propio `fetch`/redirect.** Acoplaría red + navegación al core testeable,
forzando mocks pesados y violando SRP. El hook decide *cuándo* cortar; el provider decide *cómo*.

**Testeo (vitest fake timers).**
- agenda warning en `IDLE - WARNING_BEFORE`; entra en warning; `onCutoff` en `IDLE`.
- `stayConnected()` resetea el deadline y cierra.
- evento de actividad respeta el throttle.
- `enabled=false` → cero timers/listeners (assert de no-op).

### ADR-2 — Inicialización desde localStorage (anti-bypass, OBLIGATORIO)

**Decisión.** En mount (dentro de `useEffect`, nunca en render), si `enabled`, leer `lastActivity` de
localStorage y reconstruir el deadline en vez de arrancar siempre en `Date.now()`.

- **Key:** `soporte:idle:last-activity` — formato: epoch ms como string (`String(Date.now())`).
- **Guards:** todo acceso a `window`/`localStorage` detrás de `typeof window !== "undefined"` y solo
  dentro de `useEffect`/handlers (el provider es `"use client"`). Lecturas envueltas en try/catch
  (localStorage puede lanzar en modo privado/quota).

Lógica de arranque (`scheduleTimers()` con `stored`):

```
stored = readLastActivity()  // null si ausente/ilegible
base   = stored ?? now();  if (!stored) writeLastActivity(base)
elapsed = now() - base
if (elapsed >= IDLE_TIMEOUT_MS)                     → onCutoff() inmediato (sesión ya vencida por política)
else if (elapsed >= IDLE_TIMEOUT_MS - WARNING_BEFORE) → warning ya: secondsLeft = ceil((base+IDLE - now())/1000)
else                                                → active: setTimeout hasta el umbral de warning
```

**Rationale.** `DashboardLayout` remonta `Providers`/`IdleTimeoutProvider` en cada navegación/refresh
(verificado). Sin este paso, un usuario refresca cada 14 min y burla el logout para siempre. Reconstruir
desde el timestamp persistido cierra el bypass y además rehidrata el modal con el countdown correcto si
el refresh cae dentro de la ventana de warning (sin flash del modal en mount para sesiones frescas).

**Rechazado — arrancar siempre en `Date.now()`.** Bug de seguridad reproducible (refresh-para-evadir).
**Rechazado — validación server-side de última actividad (Approach B).** Fuera de scope (requiere endpoint/columna nuevos); el backstop real sigue siendo el expiry de `at`/`rt`.

### ADR-3 — Sync cross-tab vía `storage` event (no BroadcastChannel)

**Decisión.** Sincronizar con el evento nativo `window.addEventListener("storage", ...)` sobre keys de
localStorage. Dos señales:

- **Actividad:** key `soporte:idle:last-activity`. Al haber actividad real, la pestaña escribe el
  timestamp. Las OTRAS pestañas reciben el `storage` event, adoptan el nuevo `lastActivity` y
  **reprograman** sus timers (esto propaga tanto la actividad como el "Seguir conectado").
- **Corte:** key `soporte:idle:logout`. La pestaña que corta escribe `String(Date.now())` (valor
  siempre-cambiante para forzar el evento). Las otras, al recibirlo, hacen SOLO su cleanup local +
  redirect a `/login`, **sin volver a llamar** a `/api/auth/logout` (las cookies ya se limpiaron global).

**Anti-loop (regla dura).** El handler de `storage` es **read-only**: reacciona pero NUNCA escribe en
localStorage. Como el evento `storage` solo dispara en OTRAS pestañas (nunca en la que escribió), no hay
eco ni loop. Escribir solo ocurre ante actividad real del usuario o en el corte.

**BroadcastChannel vs storage — elegido storage.** Rationale: (1) YA necesitamos persistir el timestamp
en localStorage para el anti-bypass (ADR-2), así que el `storage` event es su compañero natural sin
escritura extra; (2) cero dependencias y soporte universal en los navegadores objetivo, sin ramas de
feature-detection; (3) BroadcastChannel exigiría igual una escritura de persistencia separada. Menos
superficie, misma garantía.

**Testeo.** `idle-storage.ts` es un módulo atómico: se testea despachando un `StorageEvent` sintético en
jsdom y verificando read/write. El reset por cross-tab se testea disparando `new StorageEvent("storage",
{ key, newValue })`.

### ADR-4 — Montaje del provider y el quirk del doble `Providers` anidado

**Decisión.** Montar `IdleTimeoutProvider` DENTRO de `SessionProvider` (necesita `useSession()`),
envolviendo a `TenantContextProvider`:

```tsx
<SessionProvider initialUser={initialUser}>
  <IdleTimeoutProvider>
    <TenantContextProvider>{children}</TenantContextProvider>
  </IdleTimeoutProvider>
</SessionProvider>
```

**El quirk (documentado, preexistente).** Rutas del dashboard tienen un árbol `Providers`/`SessionProvider`
DOBLE-anidado: el externo viene de `RootLayout` (`app/layout.tsx`) SIN `initialUser` → su `SessionProvider`
tiene `user=null, isLoading=true`; el interno viene de `DashboardLayout` (`app/(dashboard)/layout.tsx`) que
decodifica el `at` server-side y pasa `initialUser` real. El `IdleTimeoutProvider` lee `useSession()` y
computa `enabled = user != null && !isLoading`:

- Instancia EXTERNA (RootLayout, y también en `/login`): `user=null` → `enabled=false` → **no-op total**.
- Instancia INTERNA (DashboardLayout): `user` real → `enabled=true` → **única activa**.

Así un solo guard desactiva correctamente el provider en `/login` y durante el loading, sin ramas por
ruta. El no-op de la externa es lo que evita dos timers compitiendo.

**Rationale.** El provider debe asumir `user` vivo solo cuando `enabled`. Colocarlo fuera de
`SessionProvider` rompería `useSession()`. Dentro de `TenantContextProvider` no aporta y agregaría acoplamiento.

**SSR/hydration.** `IdleTimeoutProvider` es `"use client"` (como `SessionProvider`/`AppShell`). Nada de
`window`/`localStorage` en render — solo en `useEffect`/handlers.

### ADR-5 — Flujo de corte y defeat del refresh silencioso

**Decisión.** `handleCutoff()` en el provider, en este orden:

```ts
if (cuttingOffRef.current) return;   // guard: una sola vez (evita doble corte por interval+storage)
cuttingOffRef.current = true;
signalLogout();                       // avisa a otras pestañas (localStorage 'logout')
await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
window.location.assign("/login");     // hard nav
```

**Por qué se derrota el single-flight refresh de `client.ts`.** Verificado en exploración:
`/api/auth/logout` revoca el `rt` server-side Y limpia ambas cookies (siempre, aun si el backend falla).
Cualquier `apiFetch` in-flight que reciba 401 llamará a `/api/auth/refresh`, que ya NO tiene cookie `rt`
que enviar → 401 → `SessionExpiredError`, y las cookies quedan limpias. No hace falta tocar `client.ts`
ni exportar/resetear `refreshPromise`: la ausencia del `rt` hace que el refresh no pueda resucitar la sesión.

**Orden `await` antes del nav.** Se espera a que la revocación complete ANTES del `window.location.assign`,
porque un hard-nav dispara `unload` y podría cortar un `fetch` pendiente. Await → luego navegar.

**Hard nav vs `router.push` — elegido `window.location.assign`.** Rationale: el hard-nav destruye todo el
árbol React + la caché en memoria de TanStack Query + cualquier timer/estado in-flight, garantizando que
no quede estado autenticado viejo ni un `apiFetch` a mitad de camino intentando refrescar tras el corte.
`router.push` mantiene el estado SPA y deja ventana a una carrera. El corte por inactividad exige un
"corte limpio", así que hard-nav es la opción correcta acá (no es la regla general de navegación del app).

**Guard de doble disparo.** El corte puede llegar por el interval (secondsLeft→0) o por el `storage`
'logout' event de otra pestaña; `cuttingOffRef` asegura idempotencia.

### ADR-6 — UI del modal (Radix AlertDialog, espejo de confirm-dialog)

**Decisión.** `IdleWarningDialog` construido sobre `@radix-ui/react-alert-dialog`, espejando
`confirm-dialog.tsx` (mismas clases glass, mismo patrón Portal/Overlay/Content). Contrato:

```ts
interface IdleWarningDialogProps {
  open: boolean;               // = isWarning del hook
  secondsLeft: number;
  onStayConnected: () => void; // = stayConnected del hook
}
```

**No-dismiss (ADR-2 de confirm-dialog aplica).** `onEscapeKeyDown={(e) => e.preventDefault()}` y SIN
`onClick` de cierre en el `Overlay`. El usuario NO puede descartar el aviso por accidente y quedar
deslogueado sin enterarse. Una sola acción explícita: "Seguir conectado". No hay "Cancelar" (la
alternativa es dejar vencer el countdown → corte automático, sin acción del usuario).

**Estados del countdown.** El número viene por prop `secondsLeft` (el hook es el dueño del tiempo, el
diálogo es tonto). Título: "Tu sesión está por expirar". Descripción con el contador vivo.

**Accesibilidad.** (1) `role="timer"` + `aria-live="polite"` en el contenedor del contador para que el
lector anuncie el descuento sin secuestrar el foco cada segundo; (2) foco inicial al botón "Seguir
conectado" (Radix `AlertDialog.Content` maneja focus-trap; el botón como primer focusable o vía `ref` +
`autoFocus`); (3) `AlertDialog.Title`/`Description` proveen `aria-labelledby`/`describedby` nativos de Radix.

**Modo dual + responsive.** Reusar exactamente las clases de `confirm-dialog.tsx`: `bg-card/95 backdrop-blur`,
`border-white/10`, `rounded-xl`, `w-full max-w-md`, `p-6`, animaciones `data-[state=...]`. Cumple modo
claro/oscuro y responsive del design system (CLAUDE.md §3) sin CSS nuevo.

**Rechazado — `@radix-ui/react-dialog` (Dialog común).** AlertDialog es la semántica correcta para
decisión forzada; Dialog cierra por ESC/overlay por defecto, lo contrario de lo que se necesita.

### ADR-7 — Ubicación de constantes y helpers de storage

**Decisión.**
- `frontend/src/shared/auth/idle-config.ts` — constantes puras (sin `window`):
  ```ts
  export const IDLE_TIMEOUT_MS = 900_000;   // 15 min
  export const WARNING_BEFORE_MS = 60_000;  // 60 s (warning a los 14 min)
  export const ACTIVITY_THROTTLE_MS = 1_000;
  export const IDLE_ACTIVITY_EVENTS = ["mousemove","mousedown","keydown","scroll","touchstart"] as const;
  ```
- `frontend/src/shared/auth/idle-storage.ts` — acceso a localStorage con guards, keys y `signalLogout()`:
  ```ts
  export const IDLE_LAST_ACTIVITY_KEY = "soporte:idle:last-activity";
  export const IDLE_LOGOUT_KEY = "soporte:idle:logout";
  export function readLastActivity(): number | null
  export function writeLastActivity(ts: number): void
  export function signalLogout(): void   // writeLogout(String(Date.now()))
  ```

**Rationale.** Separar constantes puras (config) de I/O (storage) mantiene `idle-config.ts` importable
en cualquier contexto (incluido SSR) sin tocar `window`, y aísla el I/O en un módulo atómico-testeable
con `StorageEvent` sintético. Viven en `shared/auth` porque son adyacentes a la sesión y potencialmente
reusables (Scope Rule: hoy 1 feature, pero conceptualmente de auth como `cookies.ts`).

### ADR-8 — Actividad pasiva ignorada durante `warning`

**Decisión.** Mientras `isWarning`, los listeners de actividad NO resetean el timer; solo el click
explícito en "Seguir conectado" (`stayConnected()`) lo hace.

**Rationale.** Si un `mousemove` accidental (o jitter del mouse) reseteara el countdown, un usuario
ausente cuyo cursor tiembla nunca se desloguearía — se rompe el propósito de seguridad. La decisión debe
ser deliberada. Esto también simplifica la lógica del interval (el deadline no se mueve bajo los pies).
Cross-tab SÍ resetea (actividad real en otra pestaña = usuario presente).

## 4. Edge cases (verificados contra código real)

| Caso | Manejo |
|------|--------|
| Múltiples pestañas | `storage` event (ADR-3); actividad y corte se propagan; corte re-logout evitado |
| Sesión ya vencida (rt murió a los 7 días) | `handleCutoff` es seguro: `/api/auth/logout` tolera backend caído y siempre limpia cookies |
| Usuario en formulario | Fuera de scope (no hay draft-save en el código); el countdown es la mitigación (flaggeado en propuesta) |
| Page refresh | Reconstrucción desde localStorage (ADR-2) evita el reset del clock |
| SSR/hydration | Provider `"use client"`; sin `window` en render |
| Doble corte (interval + storage) | `cuttingOffRef` idempotente (ADR-5) |
| localStorage no disponible (modo privado/quota) | try/catch en `idle-storage`; degrada a timer-en-memoria (peor caso: sin cross-tab/anti-bypass, sin crash) |

## 5. Testeo (strict TDD — unidades atómicas RED→GREEN)

Runner: `pnpm test` (vitest run, jsdom, `@testing-library/react`, fake timers). Ver §3 ADR-1/ADR-3/ADR-6.

1. **`use-idle-timeout.test.ts`** (core): warning en `IDLE-WARNING_BEFORE`; `onCutoff` en `IDLE`;
   `stayConnected` resetea; throttle de actividad; init localStorage vencido → cutoff inmediato; init en
   ventana → `isWarning` con `secondsLeft` correcto; `storage` event resetea; `enabled=false` → no-op.
2. **`idle-storage.test.ts`** (atómico): read/write roundtrip; ilegible → null; `signalLogout` escribe key.
3. **`idle-warning-dialog.test.tsx`**: renderiza `secondsLeft`; botón llama `onStayConnected`; ESC
   `preventDefault` → sigue abierto (espeja tests de confirm-dialog).
4. **`idle-timeout-provider.test.tsx`**: `user=null` → no-op (sin timers/listeners), espejando el guard
   de `session-provider.test.tsx`.

## 6. Riesgos y supuestos

- **Tamper client-side (devtools):** un usuario con devtools puede frenar el timer JS. Aceptado — el
  backstop real es el expiry de `at`(15m)/`rt`(7d) del backend, intacto. Cerrar esto = Approach B (fuera de scope).
- **localStorage deshabilitado:** degradación elegante a timer en memoria; sin cross-tab ni anti-bypass,
  pero sin crash. Supuesto: caso marginal en el entorno objetivo.
- **Precisión del countdown:** resolución de 1s vía interval; drift < 1s aceptable para UX.
- **Sin handler global de `SessionExpiredError`:** confirmado que no existe; el flujo es dueño de su propio
  redirect (hard-nav), no depende de nada global.
- **Tamaño:** ~5 archivos nuevos chicos + 1 edit + tests, < 400 líneas. Bajo riesgo, no requiere chained PR.
```
