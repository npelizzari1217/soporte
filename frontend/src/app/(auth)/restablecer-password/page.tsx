"use client";

/**
 * RestablecerPasswordPage — página pública de confirmación de reset
 * (`/restablecer-password#token=<hex>`). Wires RestablecerPasswordForm
 * (presentational) con use-restablecer-password (container).
 *
 * El token viaja en el FRAGMENTO, nunca en el query string: el fragmento no
 * sale del navegador — no llega a los access logs ni al `Referer` (design
 * ADR-7). Se lee una sola vez en un `useEffect` y se lo saca de la barra de
 * direcciones con `history.replaceState`, para que no quede ahí: un
 * screenshot, un historial compartido o el hombro de otra persona no lo
 * exponen.
 *
 * Sin token, o con un 400 del backend (vencido/usado/revocado/inexistente,
 * Req 6), se muestra el mismo mensaje genérico con un link a
 * `/olvide-password` (WU-11) — la causa exacta no se distingue nunca.
 *
 * Un 429 o un error de red/5xx NO es terminal: el formulario sigue visible
 * con el mensaje arriba, para reintentar. El token ya salió de la URL, así
 * que ocultar el formulario dejaría al usuario sin salida (mismo criterio
 * que `mensajeDeErrorDeLogin`).
 *
 * Spec: sdd/reseteo-contrasena-olvidada — Requirement "El frontend ofrece el
 * flujo completo de self-service", escenario "La confirmación valida antes
 * de enviar". Design ADR-7, ADR-8.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { RestablecerPasswordForm } from "@/features/auth/components/RestablecerPasswordForm";
import {
  useRestablecerPassword,
  type ErrorRestablecerPassword,
} from "@/features/auth/hooks/use-restablecer-password";
import type { RestablecerPasswordFormValues } from "@/features/auth/schemas";

const ERROR_SIN_TOKEN: ErrorRestablecerPassword = {
  mensaje: "El link no es válido o venció.",
  mostrarLinkSolicitud: true,
};

/** Lee `#token=<hex>` del fragmento y lo saca de la URL. `null` si no hay. */
function leerYLimpiarToken(): string | null {
  const match = /^#token=(.+)$/.exec(window.location.hash);
  if (!match) return null;

  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return decodeURIComponent(match[1]);
}

export default function RestablecerPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [tokenListo, setTokenListo] = useState(false);
  const { restablecer, isPending, isSuccess, error } = useRestablecerPassword();

  useEffect(() => {
    setToken(leerYLimpiarToken());
    setTokenListo(true);
  }, []);

  function submit(values: RestablecerPasswordFormValues) {
    if (!token) return;
    restablecer(token, values.passwordNueva);
  }

  const sinToken = tokenListo && token === null;
  const errorTerminal = sinToken ? ERROR_SIN_TOKEN : error?.mostrarLinkSolicitud ? error : null;
  const errorTransitorio = error && !error.mostrarLinkSolicitud ? error : null;
  const mostrarForm = !isSuccess && !errorTerminal && tokenListo && !!token;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,var(--background)_0%,var(--login-gradient-accent)_100%)] p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card/80 p-8 shadow-xl backdrop-blur">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Restablecer contraseña
          </h1>
          {mostrarForm && (
            <p className="mt-1 text-sm text-muted-foreground">Ingresá tu nueva contraseña</p>
          )}
        </div>

        {isSuccess ? (
          <div className="flex flex-col gap-4 text-center">
            <p role="status" className="text-sm text-foreground">
              Listo, restableciste tu contraseña. Entrá con la nueva.
            </p>
            <Link
              href="/login"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Ir a iniciar sesión
            </Link>
          </div>
        ) : errorTerminal ? (
          <div className="flex flex-col gap-4 text-center">
            <p role="alert" className="text-sm text-destructive">
              {errorTerminal.mensaje}
            </p>
            <Link
              href="/olvide-password"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Pedí un link nuevo
            </Link>
          </div>
        ) : (
          mostrarForm && (
            <div className="flex flex-col gap-4">
              {errorTransitorio && (
                <p role="alert" className="text-center text-sm text-destructive">
                  {errorTransitorio.mensaje}
                </p>
              )}
              <RestablecerPasswordForm onSubmit={submit} isLoading={isPending} />
            </div>
          )
        )}
      </div>
    </div>
  );
}
