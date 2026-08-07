/**
 * Composed loading skeletons by layout (ADR-8: Loading = Skeleton específico,
 * NUNCA spinner). Each variant wraps its blocks in `role="status"
 * aria-busy="true"` so assistive tech announces the loading region once,
 * instead of reading every pulsing `<div>`.
 */
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 5, columns = 4 }: TableSkeletonProps) {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando tabla" className="space-y-2">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} data-testid="skeleton-row" className="flex gap-3">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export interface CardKpiSkeletonProps {
  count?: number;
}

export function CardKpiSkeleton({ count = 4 }: CardKpiSkeletonProps) {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando indicadores" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} data-testid="kpi-skeleton">
          <CardHeader>
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando detalle" className="space-y-4">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-1/2" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}
