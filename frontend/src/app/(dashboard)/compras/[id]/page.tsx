/**
 * `/compras/[id]` — Server Component fino (ADR-1). `id` = id de la `Compra`
 * (sdd/redisenio-modulo-compras — dominio nuevo, ya NO id del `Ticket`
 * base). Gate `compra:gestionar` vive dentro de `CompraDetailView` (`<Can>`).
 */
import { CompraDetailView } from "@/features/compras/components/compra-detail-view";

export default async function CompraDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CompraDetailView compraId={id} />;
}
