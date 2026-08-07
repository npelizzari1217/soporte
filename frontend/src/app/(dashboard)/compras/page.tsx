/**
 * `/compras` — Server Component fino (ADR-1). Gate `compra:gestionar` vive
 * dentro de `ComprasListView` (`<Can>`).
 */
import { ComprasListView } from "@/features/compras/components/compras-list-view";

export default function ComprasPage() {
  return <ComprasListView />;
}
