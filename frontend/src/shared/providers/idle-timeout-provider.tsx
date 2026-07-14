"use client";

/**
 * IdleTimeoutProvider — guard de sesión + wiring de logout/redirect por inactividad.
 *
 * Deriva `enabled = user != null && !isLoading` desde `useSession()` (ADR-4): el
 * árbol dashboard tiene un `SessionProvider` doble-anidado (RootLayout externo con
 * `user=null`, DashboardLayout interno con `initialUser` real), así que este guard
 * desactiva de forma correcta la instancia externa (y `/login`) sin ramas por ruta.
 *
 * `handleCutoff` (ADR-5), en este orden estricto:
 *   1. guard `cuttingOffRef` — idempotente, evita doble corte (interval + storage event)
 *   2. `signalLogout()` — avisa a otras pestañas (localStorage `IDLE_LOGOUT_KEY`)
 *   3. `await fetch("/api/auth/logout", ...)` — revoca `rt` server-side + limpia cookies
 *   4. `window.location.assign("/login")` — hard nav (destruye árbol React + caché)
 *
 * Propagación cross-tab del corte (ADR-3): un listener `storage` sobre `IDLE_LOGOUT_KEY`
 * detecta cuando OTRA pestaña originó el corte y, en esta pestaña, hace SOLO el
 * cleanup + redirect — sin volver a llamar a `/api/auth/logout` (las cookies ya se
 * limpiaron globalmente vía la pestaña originante).
 *
 * Spec: [SPEC:frontend-auth/No-op del timer sin sesión autenticada]
 *       [SPEC:frontend-auth/Corte real de sesión al agotarse el countdown]
 *       [SPEC:frontend-auth/Sincronización de inactividad entre pestañas]
 * Design: ADR-3, ADR-4, ADR-5
 * Task: T10
 */

import { useCallback, useEffect, useRef } from "react";
import { useSession } from "@/shared/hooks/use-session";
import { useIdleTimeout } from "@/shared/hooks/use-idle-timeout";
import { IdleWarningDialog } from "@/components/shell/idle-warning-dialog";
import { IDLE_LOGOUT_KEY, signalLogout } from "@/shared/auth/idle-storage";

interface IdleTimeoutProviderProps {
  children: React.ReactNode;
}

export function IdleTimeoutProvider({ children }: IdleTimeoutProviderProps) {
  const { user, isLoading } = useSession();
  const enabled = user != null && !isLoading;

  // Guard de idempotencia: el corte puede llegar por el countdown local (interval)
  // o por el evento `storage` de otra pestaña — solo debe ejecutarse una vez.
  const cuttingOffRef = useRef(false);

  const handleCutoff = useCallback(async () => {
    if (cuttingOffRef.current) return;
    cuttingOffRef.current = true;

    signalLogout();
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => {
      // Backend inalcanzable — igual navegamos: el BFF ya limpia cookies siempre
      // que responde, y si no responde no hay peor caso que ya navegar a /login.
    });
    window.location.assign("/login");
  }, []);

  const { isWarning, secondsLeft, stayConnected } = useIdleTimeout({
    enabled,
    onCutoff: handleCutoff,
  });

  useEffect(() => {
    if (!enabled) return;

    function onStorage(event: StorageEvent) {
      if (event.key !== IDLE_LOGOUT_KEY || event.newValue === null) return;
      if (cuttingOffRef.current) return; // esta pestaña ya cortó por su cuenta
      cuttingOffRef.current = true;
      window.location.assign("/login");
    }

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [enabled]);

  return (
    <>
      <IdleWarningDialog
        open={isWarning}
        secondsLeft={secondsLeft}
        onStayConnected={stayConnected}
      />
      {children}
    </>
  );
}
