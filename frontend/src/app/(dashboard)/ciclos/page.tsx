/**
 * `/ciclos` — Server Component fino (ADR-1). Catálogo MASTER de ciclos
 * lectivos, ABM exclusivo de ROOT (sdd/ciclos-abm-root). Gate `isGlobalAdmin`
 * vive dentro de `CiclosVigentesAdminView`.
 *
 * Distinto de `/admin/ciclos` (adopción/activación del ciclo por el admin
 * del cliente, `features/ciclos` — NO tocado por este cambio).
 */
import { CiclosVigentesAdminView } from "@/features/ciclos-master/components/ciclos-vigentes-admin-view";

export default function CiclosPage() {
  return <CiclosVigentesAdminView />;
}
