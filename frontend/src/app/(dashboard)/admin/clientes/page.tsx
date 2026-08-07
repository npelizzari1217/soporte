/**
 * `/admin/clientes` — Server Component fino (ADR-1). Gate `isGlobalAdmin`
 * (ROOT) vive dentro de `ClientesAdminView`.
 */
import { ClientesAdminView } from "@/features/clientes/components/clientes-admin-view";

export default function AdminClientesPage() {
  return <ClientesAdminView />;
}
