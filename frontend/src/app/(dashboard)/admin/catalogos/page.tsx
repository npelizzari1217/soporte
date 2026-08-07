/**
 * `/admin/catalogos` — Server Component fino (ADR-1). Gate `catalogo:gestionar`
 * vive dentro de `CatalogosAdminView` (`<Can>`).
 */
import { CatalogosAdminView } from "@/features/catalogos/components/catalogos-admin-view";

export default function AdminCatalogosPage() {
  return <CatalogosAdminView />;
}
