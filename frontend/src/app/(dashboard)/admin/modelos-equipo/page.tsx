/**
 * `/admin/modelos-equipo` — Server Component fino (ADR-1). Gate
 * `esAdminCliente` vive dentro de `ModelosEquipoAdminView` (`<SoloAdminCliente>`).
 * Molde exacto de `admin/unidades/page.tsx`.
 */
import { ModelosEquipoAdminView } from "@/features/modelos-equipo/components/modelos-equipo-admin-view";

export default function AdminModelosEquipoPage() {
  return <ModelosEquipoAdminView />;
}
