/**
 * `/admin/insumos` — Server Component fino (ADR-1). Gate `esAdminCliente`
 * vive dentro de `InsumosCatalogosAdminView` (`<SoloAdminCliente>`).
 */
import { InsumosCatalogosAdminView } from "@/features/insumos/components/insumos-catalogos-admin-view";

export default function AdminInsumosPage() {
  return <InsumosCatalogosAdminView />;
}
