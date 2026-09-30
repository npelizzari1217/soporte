/**
 * `/repuestos/[id]` — Server Component fino: la MISMA ficha que
 * `/insumos/[id]`, montada en la sección Repuestos. El gate de permiso
 * (`INSUMOS:LECTURA`) vive dentro de `InsumoDetailView` (`<Can>`); el del
 * módulo, en el `layout.tsx` de la sección.
 */
import { InsumoDetailView } from "@/features/insumos/components/insumo-detail-view";

export default async function RepuestoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InsumoDetailView insumoId={id} seccion="repuestos" />;
}
