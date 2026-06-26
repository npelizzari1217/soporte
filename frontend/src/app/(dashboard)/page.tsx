"use client";

/**
 * Dashboard home — / (within DashboardLayout)
 *
 * Shows a personalized greeting using the session user's email.
 * Skeleton placeholder while isLoading (prevents FOUC of unauthenticated content).
 *
 * Spec: [SPEC:frontend-design-system/atomos Skeleton], [SPEC:frontend-ui-states/authz-ui no FOUC]
 */

import { useSession } from "@/shared/hooks/use-session";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const { user, isLoading } = useSession();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
    );
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
