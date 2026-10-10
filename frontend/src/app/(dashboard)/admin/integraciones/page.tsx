/**
 * `/admin/integraciones` — Server Component fino (ADR-1). Gate
 * `esAdminCliente` vive dentro de `IntegracionesAdminView` (`<SoloAdminCliente>`).
 * Molde exacto de `admin/reglas-asignacion/page.tsx`.
 */
import { IntegracionesAdminView } from "@/features/integraciones/components/integraciones-admin-view";

export default function AdminIntegracionesPage() {
  return <IntegracionesAdminView />;
}
