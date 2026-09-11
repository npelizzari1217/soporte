/**
 * `/admin/unidades` — Server Component fino (ADR-1). Gate `esAdminCliente`
 * vive dentro de `UnidadesMedidaAdminView` (`<SoloAdminCliente>`). Sección
 * propia desde el issue #156 — el ABM de unidades de medida vivía antes como
 * tab dentro de `Admin -> Insumos` (`InsumosCatalogosAdminView`).
 */
import { UnidadesMedidaAdminView } from "@/features/insumos/components/unidades-medida-admin-view";

export default function AdminUnidadesPage() {
  return <UnidadesMedidaAdminView />;
}
