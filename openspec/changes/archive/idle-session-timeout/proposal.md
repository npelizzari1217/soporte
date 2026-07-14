# Propuesta: idle-session-timeout

## Intent

Hoy una sesión abierta y sin uso permanece viva hasta el vencimiento natural del `rt` (7 días). En una app de tickets multi-tenant, una estación desatendida (mostrador, oficina compartida) es una superficie de exposición real. Necesitamos **auto-logout por inactividad a los 15 minutos** en el frontend Next.js, con **aviso de cuenta regresiva** antes del corte, cerrando sesión de verdad (revocación server-side + limpieza de cookies) para exigir contraseña de nuevo — semántica "educandow". Prioridad: mejora de seguridad/UX, no hotfix.

Éxito = tras 15 min sin actividad aparece un modal de countdown; si el usuario no reacciona, se ejecuta un logout real (no refresh silencioso posible) y redirige a `/login`; si hace clic en "Seguir conectado", el timer se reinicia. Todo cubierto por tests atómicos con fake timers (RED→GREEN).

## Scope (in)

1. Hook cliente `useIdleTimeout` (timer + detección de actividad con debounce + máquina de estados warn/cutoff). Unidad testeable central.
2. `IdleTimeoutProvider` montado dentro de `SessionProvider`; no-op total cuando `user == null || isLoading`.
3. `IdleWarningDialog` (Radix `AlertDialog`) espejando `confirm-dialog.tsx` — semántica ADR-2: NO se cierra por ESC ni click-afuera.
4. Corte real reusando `POST /api/auth/logout` (revoca `rt` + limpia cookies) → defeat del single-flight refresh. Redirect propio a `/login`.
5. **Sync entre pestañas** vía `localStorage` + evento `storage` (dentro del MVP).
6. **Lectura de última actividad de `localStorage` en mount** (defensa anti-bypass por refresh cada ~14 min).
7. Parámetros como constantes: `IDLE_TIMEOUT_MS = 15 min`, `WARNING_BEFORE_MS = 60 s` (warn a los 14 min).

## Scope (out)

- **Guardado de borrador de formularios en curso**: no existe mecanismo de draft-save en el código. El countdown ES la mitigación. Si el negocio lo requiere, es un change mayor aparte — se flaggea al usuario.
- **Validación server-side de "última actividad"** (Approach B): el backend sigue siendo fuente de authZ (expiry de `at`/`rt` intacto), pero el idle-timeout es client-side en esta iteración. Sin endpoint/columna nuevos.
- **Acortar `REFRESH_MAX_AGE`** (Approach C): rechazado — no da warning y rompe el "recordar sesión 7 días".

## Approach y rationale

**Approach A** (recomendado por la exploración). Cero cambios de backend; reusa el primitivo `/api/auth/logout` ya correcto y probado (revocación + cookie-clear), que es exactamente lo que derrota el refresh silencioso de `client.ts`. Alineado con el skill `auth-access`: la detección de inactividad es concern de **presentación**, la revocación de token sigue siendo infraestructura intacta. Fail-safe: si el timer nunca dispara por un bug, el peor caso es el expiry actual de 7 días — sin regresión de seguridad. Approach B sobre-diseña para un threat model (tampering con devtools) fuera de scope; C incumple el requisito de countdown.

## Impact

**Specs**: delta a `frontend-auth` (nueva sección "Idle session timeout" documentando timings, corte real y sync cross-tab; no altera atributos de cookies AS-BUILT).

**Archivos nuevos**:
- `frontend/src/shared/hooks/use-idle-timeout.ts`
- `frontend/src/shared/providers/idle-timeout-provider.tsx`
- `frontend/src/components/shell/idle-warning-dialog.tsx`
- Constantes en `frontend/src/shared/auth/` (idle config).

**Archivos tocados**:
- `frontend/src/shared/providers/providers.tsx` — montaje del provider.

**Reusado sin cambios**: `api/auth/logout/route.ts`, `middleware.ts`, `cookies.ts`.

## Risks

- **Page-refresh resetea el clock**: `DashboardLayout` remonta `Providers` en cada navegación. Si el hook usa solo `Date.now()`, un refresh cada 14 min burla el idle-logout. Mitigación (obligatoria en spec/design): inicializar desde el timestamp de `localStorage`.
- **Doble `Providers` anidado** en rutas dashboard (quirk preexistente): el provider externo debe no-opear (su `SessionProvider` nunca recibe `initialUser`). El guard `user == null` lo cubre, pero design debe documentarlo.
- **SSR/hydration**: el provider DEBE ser `"use client"` y todo acceso a `window`/`localStorage` va dentro de `useEffect` o tras `typeof window` guard.
- **Sin handler centralizado de `SessionExpiredError`**: el flujo de idle-logout debe dueño de su propio redirect, no asumir un listener global.
- **Tamaño de entrega**: estimado < 400 líneas (3 archivos nuevos chicos + 1 edit + tests). Bajo riesgo para `ask-on-risk`; no requiere chained PR.
