"use client";

/**
 * AvisoMotivo — cartel de `/login` que lee `?motivo=` de la URL (WU4).
 *
 * Motivos soportados: `sso-error` (falla del login con proveedor externo, mensaje genérico
 * único, SL13) y `password-cambiada` (redirección tras
 * `CambiarPasswordDialog`, 204 → BFF limpia cookies → acá). Es un mensaje
 * de ÉXITO, no de error: la sesión anterior se cerró a propósito porque el
 * usuario lo pidió.
 *
 * A propósito NO prellena el email: hacerlo pondría un dato personal en la
 * URL (visible en historial/logs), y este componente no lo necesita para
 * cumplir su función.
 *
 * `useSearchParams()` exige un boundary `<Suspense>` en el padre
 * (`app/(auth)/login/page.tsx`) — sin él, el prerender del build de Next
 * falla (no los tests: `pnpm build`).
 *
 * Spec: sdd/cambio-de-contrasena — WU4, design §"Frontend — detalle".
 */
import { useSearchParams } from "next/navigation";

/**
 * Único mensaje de falla del SSO, idéntico para cualquier motivo de rechazo (SL13): el motivo
 * real queda solo en los logs del servidor y nunca llega a la URL ni a la pantalla.
 */
export const MENSAJE_SSO_ERROR =
  "No pudimos iniciar sesión con ese proveedor. Probá de nuevo o ingresá con tu email y contraseña.";

export function AvisoMotivo() {
  const searchParams = useSearchParams();
  const motivo = searchParams.get("motivo");

  if (motivo === "sso-error") {
    return (
      <div
        role="alert"
        className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground"
      >
        {MENSAJE_SSO_ERROR}
      </div>
    );
  }

  if (motivo !== "password-cambiada") return null;

  return (
    <div
      role="status"
      className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-foreground"
    >
      Listo, cambiaste tu contraseña. Entrá de nuevo con la nueva.
    </div>
  );
}
