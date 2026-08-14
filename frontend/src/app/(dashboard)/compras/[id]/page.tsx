/**
 * `/compras/[id]` — Server Component fino (ADR-1). `id` = id de la `Compra`
 * (sdd/redisenio-modulo-compras — dominio nuevo, ya NO id del `Ticket`
 * base). RBAC (decisión del maintainer, `sdd/redisenio-modulo-compras/
 * rbac-consultas`, 2026-08-14): la lectura se gatea SOLO por módulo
 * (COMPRAS), resuelto aguas arriba por el guard de navegación/layout — sin
 * `<Can>` dentro de `CompraDetailView`.
 */
import { CompraDetailView } from "@/features/compras/components/compra-detail-view";

export default async function CompraDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CompraDetailView compraId={id} />;
}
