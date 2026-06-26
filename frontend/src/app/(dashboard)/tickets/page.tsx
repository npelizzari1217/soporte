/**
 * Tickets list — /tickets
 *
 * Skeleton placeholder demonstrating the isLoading pattern.
 * 5× Skeleton rows simulate a loading table before data arrives.
 *
 * Spec: [SPEC:frontend-design-system/atomos Skeleton], [SPEC:frontend-ui-states/skeleton isLoading]
 */

import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function TicketsPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Tickets" />
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
