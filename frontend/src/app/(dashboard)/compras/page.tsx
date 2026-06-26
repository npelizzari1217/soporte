/**
 * Compras list — /compras
 *
 * EmptyState placeholder demonstrating the empty-state pattern.
 *
 * Spec: [SPEC:frontend-design-system/atomos EmptyState], [SPEC:frontend-ui-states/empty-state]
 */

import { ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function ComprasPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Compras" />
      <EmptyState
        title="No hay compras todavía"
        description="Las solicitudes de compra aparecerán aquí una vez que se creen."
        icon={<ShoppingCart className="h-8 w-8" />}
      />
    </div>
  );
}
