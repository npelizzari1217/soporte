import { cn } from "@/lib/utils";

/**
 * Skeleton primitive — pulsing placeholder block. NEVER use spinners for
 * loading states (sistema visual premium, contrato no negociable).
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

export { Skeleton };
