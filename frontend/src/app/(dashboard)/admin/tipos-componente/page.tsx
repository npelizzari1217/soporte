/**
 * `/admin/tipos-componente` — Server Component fino (ADR-1). Catálogo MASTER
 * de tipos de componente, ABM exclusivo de ROOT (PR5,
 * sdd/tipos-componente-master). Gate `isGlobalAdmin` vive dentro de
 * `TiposComponenteAdminView`, mismo criterio que `/admin/clientes`.
 */
import { TiposComponenteAdminView } from "@/features/tipos-componente/components/tipos-componente-admin-view";

export default function AdminTiposComponentePage() {
  return <TiposComponenteAdminView />;
}
