# Tasks: idle-session-timeout

> Fase TASKS. Desglose ejecutable para `sdd-apply`. Strict TDD (RED→GREEN) por unidad atómica.
> Test runner: `pnpm test` (vitest run, jsdom, `@testing-library/react`, fake timers).
> Convención del repo: cada test referencia su Txx en el header del archivo (ver `session-provider.test.tsx`).
> Reusados SIN TOCAR: `api/auth/logout/route.ts`, `client.ts`, `cookies.ts`, `use-session.ts`, `confirm-dialog.tsx` (patrón).

## Fase 1 — Constantes + storage (base, sin dependencias)

- [x] **T1** [RED] Crear `frontend/src/shared/auth/idle-config.test.ts`
  - Asserts: `IDLE_TIMEOUT_MS === 900_000`, `WARNING_BEFORE_MS === 60_000`, `ACTIVITY_THROTTLE_MS === 1_000`, `IDLE_ACTIVITY_EVENTS` contiene exactamente `["mousemove","mousedown","keydown","scroll","touchstart"]`.
  - Done: test corre y falla (módulo no existe).
  - Spec: Requirement "Constantes de configuración del idle-timeout".
  - Depende de: nada. Paralelizable con T3.

- [x] **T2** [GREEN] Crear `frontend/src/shared/auth/idle-config.ts`
  - Constantes puras exportadas exactamente como en ADR-7 (sin acceso a `window`, sin lógica).
  - Done: T1 pasa. No agrega literales fuera de este archivo.
  - Depende de: T1.

- [x] **T3** [RED] Crear `frontend/src/shared/auth/idle-storage.test.ts`
  - Casos: `writeLastActivity(ts)` + `readLastActivity()` roundtrip; `readLastActivity()` retorna `null` si la key no existe o el valor es ilegible (no numérico); `signalLogout()` escribe en `IDLE_LOGOUT_KEY` un valor string cambiante; simular `localStorage.setItem` lanzando (modo privado) → no debe crashear (try/catch, retorno seguro).
  - Usa jsdom `localStorage` real (no mock pesado) + `vi.spyOn` puntual solo para el caso de excepción.
  - Done: test corre y falla (módulo no existe).
  - Spec: soporta Requirement "Persistencia de última actividad" y "Sincronización cross-tab" (infraestructura de ambos).
  - Depende de: nada. Paralelizable con T1.

- [x] **T4** [GREEN] Crear `frontend/src/shared/auth/idle-storage.ts`
  - Exporta `IDLE_LAST_ACTIVITY_KEY`, `IDLE_LOGOUT_KEY`, `readLastActivity()`, `writeLastActivity(ts)`, `signalLogout()` (ADR-7). Guards `typeof window !== "undefined"` + try/catch en cada acceso a `localStorage` (ADR-2, edge case "localStorage no disponible").
  - Done: T3 pasa.
  - Depende de: T3.

**Checkpoint Fase 1**: `pnpm test idle-config idle-storage` en verde antes de avanzar a Fase 2.

## Fase 2 — Hook `useIdleTimeout` (unidad central, ADR-1/2/3/8)

- [ ] **T5** [RED] Crear `frontend/src/shared/hooks/use-idle-timeout.test.ts`
  - Setup: `vi.useFakeTimers()`, mock de `now()` inyectado (no `Date.now()` real), spy de `readLastActivity`/`writeLastActivity`/`signalLogout` desde `idle-storage` (`vi.mock`).
  - Casos (todos con `enabled: true` salvo el explícito):
    1. Sin actividad ni storage previo: agenda warning en `IDLE_TIMEOUT_MS - WARNING_BEFORE_MS`; `isWarning` pasa a `true` en ese instante con `secondsLeft === 60`.
    2. Avanzando el fake clock hasta `IDLE_TIMEOUT_MS`: `onCutoff` se llama exactamente 1 vez.
    3. `stayConnected()` durante warning: resetea el deadline (nuevo `writeLastActivity` con timestamp actual), `isWarning` vuelve a `false`, cancela el corte pendiente.
    4. Evento de actividad (simulado invocando el handler interno vía `act`) respeta `ACTIVITY_THROTTLE_MS`: dos disparos dentro de 1s solo reprograman una vez.
    5. Actividad pasiva durante `isWarning === true` es IGNORADA (ADR-8): el countdown NO se resetea salvo `stayConnected()`.
    6. Init con `readLastActivity()` retornando timestamp que ya supera `IDLE_TIMEOUT_MS` → `onCutoff` se dispara inmediatamente en el primer efecto, sin esperar timers.
    7. Init con `readLastActivity()` dentro de la ventana de warning (ej. 14.5 min) → al montar, `isWarning === true` con `secondsLeft` calculado correctamente (`ceil((base+IDLE-now)/1000)`), sin flash.
    8. `enabled: false` → no se registran listeners de DOM ni se agenda ningún timer (assert con `vi.spyOn(window, "addEventListener")` sin llamadas relevantes y `vi.getTimerCount() === 0`).
    9. Evento `storage` sintético (`new StorageEvent("storage", { key: IDLE_LAST_ACTIVITY_KEY, newValue })`) reprograma el timer sin volver a escribir en localStorage (handler read-only, ADR-3).
  - Done: test corre y falla (módulo no existe).
  - Spec: Requirements "Auto-logout 15 min", "Aviso countdown", "Seguir conectado", "Corte real", "No-op sin sesión", "Sync cross-tab", "Persistencia ante refresh".
  - Depende de: T2, T4 (importa constantes y storage).

- [ ] **T6** [GREEN] Crear `frontend/src/shared/hooks/use-idle-timeout.ts`
  - Firma exacta de ADR-1 (`UseIdleTimeoutParams`/`UseIdleTimeoutResult`, `now` inyectable con default `Date.now`).
  - Máquina de estados `active → warning → cutoff` vía `scheduleTimers()` centralizado (ADR-1/ADR-2): `setTimeout` para warning, `setInterval(1000)` solo durante warning.
  - Init desde `readLastActivity()` en `useEffect` (nunca en render) con la lógica de ADR-2 (`elapsed >= IDLE` → cutoff inmediato; en ventana → warning con `secondsLeft` correcto; si no hay stored, `writeLastActivity(now())`).
  - Listener `storage` read-only (ADR-3); actividad pasiva ignorada durante warning (ADR-8); throttle de `ACTIVITY_THROTTLE_MS` en el handler de actividad.
  - `enabled=false` → cleanup total, cero listeners/timers.
  - Guard `cuttingOffRef`-equivalente para no invocar `onCutoff` más de una vez por ciclo.
  - Done: T5 pasa completo (9 casos verdes).
  - Depende de: T5.

**Checkpoint Fase 2**: `pnpm test use-idle-timeout` en verde. Este es el gate crítico — no avanzar a Fase 3 sin los 9 casos verdes.

## Fase 3 — Dialog + Provider (presentación, ADR-4/5/6)

- [ ] **T7** [RED] Crear `frontend/src/components/shell/idle-warning-dialog.test.tsx`
  - Casos (espejo de `confirm-dialog.test.tsx`): renderiza con `open=true` y `secondsLeft=45` → el texto "45" visible en el DOM; click en "Seguir conectado" invoca `onStayConnected` exactamente 1 vez; `open=false` → contenido no está en el DOM (Radix Portal); simular `keydown` ESC → `preventDefault` se invoca / el diálogo sigue abierto (no se desmonta); contenedor del contador tiene `role="timer"` y `aria-live="polite"`.
  - Done: test corre y falla (componente no existe).
  - Spec: Requirement "Aviso de cuenta regresiva antes del corte", "Seguir conectado reinicia la sesión".
  - Depende de: nada estructural, pero conviene después de Fase 2 (paralelizable con T9 en la práctica).

- [ ] **T8** [GREEN] Crear `frontend/src/components/shell/idle-warning-dialog.tsx`
  - `@radix-ui/react-alert-dialog`, props exactas de ADR-6 (`open`, `secondsLeft`, `onStayConnected`). `onEscapeKeyDown={(e) => e.preventDefault()}`, sin cierre por click en overlay, sin botón "Cancelar". Clases idénticas a `confirm-dialog.tsx` (glass, `border-white/10`, `rounded-xl`, `w-full max-w-md`, `p-6`, animaciones `data-[state=...]`). `role="timer"` + `aria-live="polite"` en el contador; foco inicial en el botón "Seguir conectado".
  - Done: T7 pasa.
  - Depende de: T7.

- [ ] **T9** [RED] Crear `frontend/src/shared/providers/idle-timeout-provider.test.tsx`
  - Casos (espejo de `session-provider.test.tsx`):
    1. `user === null` (vía mock de `useSession`) → no-op total: no se registran listeners de actividad ni se agenda timer (assert igual que T5.8, ahora a nivel provider).
    2. `isLoading === true` → mismo no-op, sin importar `user`.
    3. `user` no-nulo + `isLoading === false` → el hook se activa (`enabled=true` derivado correctamente).
    4. `handleCutoff()`: mockear `fetch` global; al dispararse el corte, se invoca `signalLogout()`, luego `fetch("/api/auth/logout", ...)` con `method: "POST"` y `credentials: "same-origin"`, y recién después `window.location.assign("/login")` (orden verificado con `vi.fn()` de cada paso y aserción de orden de llamadas).
    5. Guard de doble disparo: invocar el trigger de corte dos veces (simulando interval + evento `storage` 'logout') → `fetch`/`assign` se ejecutan una sola vez.
    6. Evento `storage` con key `IDLE_LOGOUT_KEY` recibido en una pestaña que NO originó el corte → hace cleanup + `window.location.assign("/login")` SIN volver a llamar a `/api/auth/logout`.
  - Mock de `window.location.assign` (jsdom no lo implementa por defecto — usar `Object.defineProperty` o `vi.stubGlobal`).
  - Done: test corre y falla (componente no existe).
  - Spec: Requirement "No-op sin sesión", "Corte real de sesión", "Sync cross-tab (corte)".
  - Depende de: T6 (usa el hook), T8 (renderiza el dialog).

- [ ] **T10** [GREEN] Crear `frontend/src/shared/providers/idle-timeout-provider.tsx`
  - `"use client"`. Consume `useSession()` para derivar `enabled = user != null && !isLoading` (ADR-4). Usa `useIdleTimeout` con `onCutoff = handleCutoff`. Implementa `handleCutoff()` exacto de ADR-5 (guard `cuttingOffRef`, `signalLogout()` → `await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {})` → `window.location.assign("/login")`). Escucha `storage` con key `IDLE_LOGOUT_KEY` para cleanup-only en pestañas no-originantes. Renderiza `<IdleWarningDialog open={isWarning} secondsLeft={secondsLeft} onStayConnected={stayConnected} />` + `children`.
  - Done: T9 pasa completo.
  - Depende de: T9.

**Checkpoint Fase 3**: `pnpm test idle-warning-dialog idle-timeout-provider` en verde.

## Fase 4 — Wiring + verificación manual

- [ ] **T11** Editar `frontend/src/shared/providers/providers.tsx`
  - Montar `IdleTimeoutProvider` dentro de `SessionProvider`, envolviendo `TenantContextProvider` (composición exacta de ADR-4):
    ```tsx
    <SessionProvider initialUser={initialUser}>
      <IdleTimeoutProvider>
        <TenantContextProvider>{children}</TenantContextProvider>
      </IdleTimeoutProvider>
    </SessionProvider>
    ```
  - Actualizar el comment-block de composición en el header del archivo (mismo estilo que el existente) para reflejar el nuevo nivel.
  - Done: `pnpm test providers` (si existe test de composición) o smoke visual; no rompe `session-provider.test.tsx` ni `tenant-context.test.tsx` existentes.
  - Depende de: T10.

- [ ] **T12** Verificación manual end-to-end (no automatizable con vitest, documentar evidencia en el reporte de apply)
  - Levantar `pnpm dev`, loguearse, bajar `IDLE_TIMEOUT_MS`/`WARNING_BEFORE_MS` temporalmente vía override local (NO commitear el override) o esperar el ciclo real en un entorno de prueba, confirmar: (a) aparece el modal con countdown, (b) "Seguir conectado" lo cierra y resetea, (c) countdown a 0 dispara `POST /api/auth/logout` (Network tab) + redirect a `/login`, (d) refresh a los ~10 min no resetea el conteo (revisar `localStorage` key `soporte:idle:last-activity`), (e) dos pestañas: actividad en una resetea la otra; corte en una redirige la otra sin segundo `POST /api/auth/logout`.
  - Done: evidencia (screenshots o descripción de red) documentada en el apply-progress.
  - Depende de: T11.

- [ ] **T13** Definition of Done (obligatorio, CLAUDE.md §9 — pegar salida REAL)
  - Correr en `frontend/`: `pnpm test`, `pnpm lint`, `pnpm tsc --noEmit` (o el script equivalente del `package.json`).
  - Pegar la salida completa de los 3 comandos en el reporte de `sdd-apply` (no resumir como "OK"/"verde" sin números).
  - Si algo falla, reportarlo tal cual — cero verde falso (CLAUDE.md §9).
  - Depende de: T11, T12.

## Trabajo en paralelo posible

| Grupo | Tasks | Razón |
|-------|-------|-------|
| A | T1, T3 | Ambos RED de Fase 1, sin dependencia mutua |
| B | T2 (tras T1), T4 (tras T3) | GREEN independientes entre sí |
| C | T7 (dialog RED) | Puede adelantarse en paralelo con Fase 2 (T5/T6) — no depende del hook, solo de sus propias props |
| Secuencial estricta | T5→T6→(T9 necesita T6+T8)→T10→T11→T12→T13 | El provider necesita hook y dialog terminados; el wiring necesita el provider; DoD necesita todo aplicado |

## Review Workload Forecast

- **Archivos nuevos**: 5 (`idle-config.ts` ~15 líneas, `idle-storage.ts` ~40 líneas, `use-idle-timeout.ts` ~120-150 líneas, `idle-timeout-provider.tsx` ~70-90 líneas, `idle-warning-dialog.tsx` ~60-80 líneas) + 4 archivos de test (`idle-config.test.ts` ~20, `idle-storage.test.ts` ~60, `use-idle-timeout.test.ts` ~180-220, `idle-warning-dialog.test.tsx` ~60, `idle-timeout-provider.test.tsx` ~120-150).
- **Archivos editados**: 1 (`providers.tsx`, ~10-15 líneas de diff).
- **Estimado total de líneas cambiadas**: ~750-870 líneas (código + tests), pero repartidas en 5 unidades de trabajo independientes y testeables por separado.
- **¿Supera 400 líneas en un solo PR?**: Sí, el total agregado supera holgadamente 400 líneas si se junta todo en un commit/PR único. El diseño ya lo anticipó ("< 400 líneas" en design.md §6 se refería a código de producción sin contar tests; con tests atómicos por unidad el total sube).
- **¿Requiere chained PRs?**: Recomendado. La división natural en 3 fases (Fase 1: config+storage; Fase 2: hook; Fase 3: dialog+provider+wiring) mapea 1:1 a 3 PRs encadenados de tamaño manejable (~150-200 líneas cada uno), cada uno mergeable de forma independiente y en el orden de sus dependencias.
- **Decision needed before apply**: **Yes** — antes de correr `sdd-apply`, el orquestador debe resolver `delivery_strategy` (ya seteado en `ask-on-risk` para este change) preguntando explícitamente: ¿PRs encadenados (Fase 1 / Fase 2 / Fase 3-4) o un solo PR con `size:exception` aprobado por el mantenedor?

## Referencias a spec y design

- Cada task cita el Requirement de `openspec/changes/idle-session-timeout/specs/frontend-auth/spec.md` que satisface.
- Cada decisión de implementación remite al ADR correspondiente de `openspec/changes/idle-session-timeout/design.md` (ADR-1 a ADR-8).
