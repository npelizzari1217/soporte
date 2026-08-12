"use client";

/**
 * TenantSwitcher — dropdown to jump between clients.
 *
 * Two sources depending on the actor (ROOT is a flag, not a rol — it has NO
 * memberships of its own, so it needs a different source to switch tenants):
 *   - Non-ROOT: `membresias[]` embedded in the current JWT — the token
 *     already carries every membership it can switch into.
 *   - ROOT (`is_global_admin: true`): `GET /clientes` (platform-wide,
 *     `GlobalAdminGuard`-only) — lists EVERY client so root can jump into
 *     any tenant even without a membership row (backend `resolverScope`
 *     already authorizes root for any live client without membership).
 *
 * Flow (R28):
 *   1. User picks a cliente from the dropdown.
 *   2. POST /api/auth/switch { clienteId } — the BFF re-emits the `at` cookie
 *      scoped to that cliente (does NOT rotate `rt` — ADR-4).
 *   3. `router.refresh()` re-runs the Server Component tree (DashboardLayout),
 *      which re-decodes the now-updated `at` cookie and hydrates a fresh
 *      SessionProvider — no client-side state duplication of the session.
 *
 * Spec: [R28] Switcher en el shell; sdd/root-access-fix (ROOT sin membresías).
 */

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Building2, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/shared/api/client";
import { useSession } from "@/shared/hooks/use-session";
import { useClientes } from "@/features/clientes/hooks/use-clientes";
import type { JwtPayload } from "@/shared/api/types";

/** Normalized switch option — either a `membresia` (non-root) or a `Cliente` (root). */
interface SwitchOption {
  clienteId: string;
  label: string;
  sublabel?: string;
}

export function TenantSwitcher() {
  const { user, isGlobalAdmin, setUser } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const clientesQuery = useClientes(isGlobalAdmin);

  const mutation = useMutation({
    mutationFn: (clienteId: string) =>
      apiFetch<{ user: JwtPayload }>("auth/switch", { method: "POST", json: { clienteId } }),
    onSuccess: (result) => {
      // Aplicar la sesión re-emitida en el cliente: SessionProvider inicializa
      // `user` con useState(initialUser) UNA sola vez, por lo que router.refresh()
      // por sí solo NO actualiza la sesión client-side. setUser sí (el provider
      // lo expone justo para esto). Luego invalidamos la caché de datos para que
      // TODO se recargue scopeado al cliente elegido (la cookie `at` nueva ya
      // apunta a ese tenant), y refrescamos los Server Components.
      setUser(result.user);
      queryClient.invalidateQueries();
      setOpen(false);
      router.refresh();
    },
    onError: () => {
      toast.error("No se pudo cambiar de cliente. Intentá de nuevo.");
    },
  });

  if (!user) return null;

  const options: SwitchOption[] = isGlobalAdmin
    ? (clientesQuery.data ?? []).map((c) => ({ clienteId: c.id, label: c.nombre }))
    : user.membresias.map((m) => ({ clienteId: m.cliente_id, label: m.nombre, sublabel: m.rol }));

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={mutation.isPending}
          aria-label={`Cliente actual: ${user.cliente_nombre ?? "Elegí un cliente"}. Abrir selector de cliente.`}
          className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 text-foreground shadow-sm transition-all hover:shadow-md hover:bg-muted disabled:opacity-50 disabled:pointer-events-none"
        >
          <Building2 className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="flex flex-col items-start leading-tight">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Cliente
            </span>
            <span className="max-w-[240px] truncate text-base font-semibold">
              {user.cliente_nombre ?? "Elegí un cliente"}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 opacity-60 shrink-0" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="rounded-md border border-border bg-popover shadow-lg z-50 w-56 p-1"
          align="start"
          sideOffset={4}
        >
          {options.map((o) => (
            <DropdownMenu.Item
              key={o.clienteId}
              disabled={mutation.isPending || o.clienteId === user.cliente_id}
              onSelect={(e) => {
                e.preventDefault();
                mutation.mutate(o.clienteId);
              }}
              className="flex items-center justify-between rounded-sm px-3 py-2 text-sm cursor-pointer select-none outline-none hover:bg-muted focus:bg-muted data-[highlighted]:bg-muted data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed"
            >
              <span>{o.label}</span>
              {o.sublabel && <span className="text-xs text-muted-foreground">{o.sublabel}</span>}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
