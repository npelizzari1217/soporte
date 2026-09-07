/**
 * `/insumos/[id]` — Server Component fino (ADR-1). El gate de permiso
 * (`INSUMOS:LECTURA`) vive dentro de `InsumoDetailView` (`<Can>`); el del
 * módulo, en el `layout.tsx` de la sección.
 */
import { InsumoDetailView } from "@/features/insumos/components/insumo-detail-view";

export default async function InsumoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InsumoDetailView insumoId={id} />;
}
