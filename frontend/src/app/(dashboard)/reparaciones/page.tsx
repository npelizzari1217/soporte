/**
 * Reparaciones list — /reparaciones
 *
 * Skeleton placeholder (isLoading demo).
 *
 * Spec: [SPEC:frontend-design-system/atomos Skeleton]
 */

import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function ReparacionesPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Reparaciones" />
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
