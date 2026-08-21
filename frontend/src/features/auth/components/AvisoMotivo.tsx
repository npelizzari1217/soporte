"use client";

/**
 * AvisoMotivo — cartel de `/login` que lee `?motivo=` de la URL (WU4).
 *
 * Único motivo soportado hoy: `password-cambiada` (redirección tras
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

export function AvisoMotivo() {
  const searchParams = useSearchParams();
  const motivo = searchParams.get("motivo");

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
