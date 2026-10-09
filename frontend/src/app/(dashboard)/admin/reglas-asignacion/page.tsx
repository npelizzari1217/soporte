/**
 * `/admin/reglas-asignacion` — Server Component fino (ADR-1). Gate
 * `esAdminCliente` vive dentro de `ReglasAsignacionAdminView` (`<SoloAdminCliente>`).
 * Molde exacto de `admin/modelos-equipo/page.tsx`.
 */
import { ReglasAsignacionAdminView } from "@/features/reglas-asignacion/components/reglas-asignacion-admin-view";

export default function AdminReglasAsignacionPage() {
  return <ReglasAsignacionAdminView />;
}
