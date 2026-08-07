/**
 * `/admin/routing` — Server Component fino (ADR-1). Gate `usuario:gestionar`
 * vive dentro de `RoutingAdminView` (`<Can>`).
 */
import { RoutingAdminView } from "@/features/routing/components/routing-admin-view";

export default function AdminRoutingPage() {
  return <RoutingAdminView />;
}
