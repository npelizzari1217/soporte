import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Badge primitive — radius-md (6px) per token contract §3. Generic variants;
 * domain-specific mappings (estado/prioridad) live in `status-badge.tsx` /
 * `priority-badge.tsx`, which compose this primitive.
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-border text-foreground",
        success: "border-transparent bg-success text-success-foreground",
        warning: "border-transparent bg-warning text-warning-foreground",
        // Variantes "light": fondo pastel + texto del color base (NO el
        // `-foreground` del par sólido — en dark ese `-foreground` coincide
        // con el propio `-light` y el texto quedaría invisible; ver
        // globals.css). D8, sdd/feriados-configurables.
        "success-light": "border-transparent bg-success-light text-success",
        info: "border-transparent bg-info-light text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
