"use client";

/**
 * /unauthorized — shown when a feature page detects the user lacks the required permiso.
 *
 * Usage: feature pages call `redirect('/unauthorized')` when `!can('permiso:requerido')`.
 * The middleware does NOT check roles — role-based gating is UI-layer only.
 *
 * Design: rounded-lg (8px) for the card container per the constitution.
 *         rounded-md (6px) for the back button (interactive element).
 *         <ShieldX> from lucide-react as the access-denied icon.
 *
 * Spec: [SPEC:frontend-ui-states/authz-ui ruta protegida por rol → /unauthorized]
 * Tasks: T19 — resolves Pending 1 (rol insuficiente con sesión válida)
 */

import { useRouter } from "next/navigation";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function UnauthorizedPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-6 rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <ShieldX className="h-12 w-12 text-muted-foreground" aria-hidden />
        <div className="flex flex-col gap-2">
          <h1 className="text-lg font-semibold">Sin permiso de acceso</h1>
          <p className="text-sm text-muted-foreground">
            No tenés permiso para acceder a esta sección. Contactá al
            administrador si creés que esto es un error.
          </p>
        </div>
        <Button
          className="rounded-md"
          onClick={() => router.push("/")}
        >
          Volver al inicio
        </Button>
      </div>
    </div>
  );
}
