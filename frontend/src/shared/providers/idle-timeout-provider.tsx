"use client";

/**
 * IdleTimeoutProvider — guard de sesión + wiring de logout/redirect por inactividad.
 *
 * Deriva `enabled = user != null && !isLoading` desde `useSession()`: la app
 * tiene una instancia de SessionProvider en RootLayout (`user=null`, sin
 * initialUser) y otra dentro de DashboardLayout (`initialUser` real), así que
 * este guard se auto-desactiva correctamente fuera del dashboard (p. ej. /login)
 * sin ramificar por ruta.
 *
 * El corte lo hace `cortarSesion("inactividad")` (`shared/auth/cortar-sesion`), el mismo
 * helper que usa `apiFetch` cuando la sesión vence: avisa a otras pestañas, revoca `rt` y
 * limpia cookies (`POST /api/auth/logout`), y navega a `/login?motivo=inactividad`. Su guard
 * de módulo es el que evita el doble corte (countdown local + evento `storage`, o inactividad
 * + sesión vencida a la vez): una sola redirección.
 *
 * Un listener `storage` sobre `IDLE_LOGOUT_KEY` detecta cuando OTRA pestaña
 * originó el corte y, en esta pestaña, SOLO navega al login con el mismo motivo
 * (`seguirCorteDeOtraPestana`) — sin volver a llamar a `/api/auth/logout` (las
 * cookies ya se limpiaron globalmente vía la pestaña originante).
 *
 * Spec: PR11 — idle-timeout (corte real de sesión, sincronización cross-tab).
 */

import { useCallback, useEffect } from "react";
import { useSession } from "@/shared/hooks/use-session";
import { useIdleTimeout } from "@/shared/hooks/use-idle-timeout";
import { IdleWarningDialog } from "@/components/shell/idle-warning-dialog";
import { IDLE_LOGOUT_KEY } from "@/shared/auth/idle-storage";
import { cortarSesion, motivoDeSenal, seguirCorteDeOtraPestana } from "@/shared/auth/cortar-sesion";

interface IdleTimeoutProviderProps {
  children: React.ReactNode;
}

export function IdleTimeoutProvider({ children }: IdleTimeoutProviderProps) {
  const { user, isLoading } = useSession();
  const enabled = user != null && !isLoading;

  const handleCutoff = useCallback(() => {
    void cortarSesion("inactividad");
  }, []);

  const { isWarning, secondsLeft, stayConnected } = useIdleTimeout({
    enabled,
    onCutoff: handleCutoff,
  });

  useEffect(() => {
    if (!enabled) return;

    function onStorage(event: StorageEvent) {
      if (event.key !== IDLE_LOGOUT_KEY || event.newValue === null) return;
      seguirCorteDeOtraPestana(motivoDeSenal(event.newValue));
    }

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [enabled]);

  return (
    <>
      <IdleWarningDialog open={isWarning} secondsLeft={secondsLeft} onStayConnected={stayConnected} />
      {children}
    </>
  );
}
