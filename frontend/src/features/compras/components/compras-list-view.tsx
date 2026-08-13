"use client";

/**
 * ComprasListView — placeholder tras la demolición del módulo legacy
 * (sdd/redisenio-modulo-compras, PR-1). El listado real se reconstruye en
 * PR-24 sobre el nuevo dominio `Compra`/`ItemCompra`/`OperacionCompra`
 * definido en `sdd/redisenio-modulo-compras/design`.
 */
import { Construction } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";

export function ComprasListView() {
  return (
    <div className="space-y-6">
      <PageHeader title="Compras" description="Gestión de solicitudes de compra" />
      <EmptyState
        icon={Construction}
        title="Módulo en reconstrucción"
        description="El módulo de Compras está siendo rediseñado. Va a estar disponible próximamente."
      />
    </div>
  );
}
