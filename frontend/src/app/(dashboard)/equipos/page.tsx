/**
 * Equipos list — /equipos
 *
 * EmptyState placeholder (empty-state demo).
 *
 * Spec: [SPEC:frontend-design-system/atomos EmptyState]
 */

import { Monitor } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function EquiposPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Equipos" />
      <EmptyState
        title="No hay equipos registrados"
        description="Los equipos e inventario aparecerán aquí una vez que se registren."
        icon={<Monitor className="h-8 w-8" />}
      />
    </div>
  );
}
