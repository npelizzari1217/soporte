/**
 * `/admin/sla` — Server Component fino (ADR-1). Gate `catalogo:gestionar`
 * vive dentro de `SlaAdminView` (`<Can>`).
 */
import { SlaAdminView } from "@/features/sla/components/sla-admin-view";

export default function AdminSlaPage() {
  return <SlaAdminView />;
}
