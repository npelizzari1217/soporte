"use client";

/**
 * Dashboard home — / (within DashboardLayout)
 *
 * Shows a personalized greeting using the session user's email.
 * Skeleton placeholder while isLoading (prevents FOUC of unauthenticated content).
 *
 * Estado "Elegí un cliente" (admin-general PR5b — T5.16-T5.17):
 * When the operador global (isGlobalAdmin) hasn't picked a cliente yet
 * (TenantContext.clienteId === null), this page renders <EmptyClientState>
 * instead of the operative greeting. Non-operador users never see it — the
 * gate is isGlobalAdmin, not the mere absence of clienteId (which is always
 * resolved from their own JWT before this point).
 *
 * Spec: [SPEC:frontend-design-system/atomos Skeleton], [SPEC:frontend-ui-states/authz-ui no FOUC]
 * Spec: [SPEC:admin-ui/Estado "Elegí un cliente" para operador sin cliente seleccionado]
 */

import { useContext } from "react";
import { useSession } from "@/shared/hooks/use-session";
import { TenantContext } from "@/shared/providers/tenant-context";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyClientState } from "@/components/shell/empty-client-state";

export default function DashboardPage() {
  const { user, isLoading, isGlobalAdmin } = useSession();
  const { clienteId } = useContext(TenantContext);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
    );
  }

  if (isGlobalAdmin && !clienteId) {
    return <EmptyClientState />;
  }

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Bienvenido, {user?.email}
      </h1>
      <p className="text-sm text-muted-foreground">
        Seleccioná una sección del menú para comenzar.
      </p>
    </div>
  );
}
