"use client";

/**
 * EmptyClientState — placeholder shown to the operador global in the main
 * content area when no cliente has been selected yet (TenantContext.clienteId
 * === null). Composes the generic <EmptyState> atom (components/ui) — this
 * wrapper stays under components/shell (Scope Rule, CLAUDE.md §1) because it
 * is specific to the dashboard shell's admin flow, not reused elsewhere.
 *
 * Design (CLAUDE.md §3): friendly empty state with a clear icon and copy that
 * points the user at the primary interactive element (the Cliente selector in
 * the sidebar).
 *
 * Spec: [SPEC:admin-ui/Estado "Elegí un cliente" para operador sin cliente seleccionado]
 */
import { Building2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export function EmptyClientState() {
  return (
    <EmptyState
      icon={<Building2 className="h-10 w-10" aria-hidden="true" />}
      title="Elegí un cliente"
      description="Seleccioná un cliente en el panel lateral para ver su información operativa."
    />
  );
}
