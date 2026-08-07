"use client";

/**
 * TenantSwitcher — dropdown to jump between the memberships (`membresias[]`)
 * embedded in the current JWT. A root user (`is_global_admin: true`) is not
 * restricted to a subset — the token already carries every membership it can
 * switch into, so the same list applies to root and non-root users alike.
 *
 * Flow (R28):
 *   1. User picks a membership from the dropdown.
 *   2. POST /api/auth/switch { clienteId } — the BFF re-emits the `at` cookie
 *      scoped to that cliente (does NOT rotate `rt` — ADR-4).
 *   3. `router.refresh()` re-runs the Server Component tree (DashboardLayout),
 *      which re-decodes the now-updated `at` cookie and hydrates a fresh
 *      SessionProvider — no client-side state duplication of the session.
 *
 * Spec: [R28] Switcher en el shell.
 */

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/shared/api/client";
import { useSession } from "@/shared/hooks/use-session";
import type { JwtPayload } from "@/shared/api/types";

export function TenantSwitcher() {
  const { user } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: (clienteId: string) =>
      apiFetch<{ user: JwtPayload }>("auth/switch", { method: "POST", json: { clienteId } }),
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
    onError: () => {
      toast.error("No se pudo cambiar de cliente. Intentá de nuevo.");
    },
  });

  if (!user) return null;

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={mutation.isPending}
          className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <span className="max-w-[180px] truncate">{user.cliente_nombre ?? "Elegí un cliente"}</span>
          <ChevronDown className="h-4 w-4 opacity-60 shrink-0" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="rounded-md border border-border bg-popover shadow-lg z-50 w-56 p-1"
          align="start"
          sideOffset={4}
        >
          {user.membresias.map((m) => (
            <DropdownMenu.Item
              key={m.cliente_id}
              disabled={mutation.isPending || m.cliente_id === user.cliente_id}
              onSelect={(e) => {
                e.preventDefault();
                mutation.mutate(m.cliente_id);
              }}
              className="flex items-center justify-between rounded-sm px-3 py-2 text-sm cursor-pointer select-none outline-none hover:bg-muted focus:bg-muted data-[highlighted]:bg-muted data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed"
            >
              <span>{m.nombre}</span>
              <span className="text-xs text-muted-foreground">{m.rol}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
