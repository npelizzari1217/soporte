/**
 * `/admin/ciclos` — Server Component fino (ADR-1). Gate `ciclo:gestionar`
 * vive dentro de `CiclosAdminView` (`<Can>`).
 */
import { CiclosAdminView } from "@/features/ciclos/components/ciclos-admin-view";

export default function AdminCiclosPage() {
  return <CiclosAdminView />;
}
