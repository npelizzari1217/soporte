"use client";

/**
 * CompraDetailView — placeholder tras la demolición del módulo legacy
 * (sdd/redisenio-modulo-compras, PR-1). El detalle real se reconstruye en
 * PR-25 sobre el nuevo dominio `Compra`/`ItemCompra`/`OperacionCompra`.
 *
 * La prop nace directamente como `compraId` (NO `ticketId`, como en el
 * módulo legacy): el nuevo dominio identifica la compra por su propio id
 * agregado, no por el id del `Ticket` base.
 */
import { Construction } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";

export interface CompraDetailViewProps {
  compraId: string;
}

export function CompraDetailView({ compraId }: CompraDetailViewProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Detalle de compra"
        description={`Gestión de la solicitud de compra ${compraId}`}
      />
      <EmptyState
        icon={Construction}
        title="Módulo en reconstrucción"
        description="El módulo de Compras está siendo rediseñado. Va a estar disponible próximamente."
      />
    </div>
  );
}
