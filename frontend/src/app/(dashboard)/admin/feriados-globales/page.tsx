/**
 * `/admin/feriados-globales` — Server Component fino (ADR-1). Catálogo
 * MASTER de feriados nacionales, ABM exclusivo de ROOT
 * (sdd/feriados-configurables, D8 design.md). Gate `isGlobalAdmin` vive
 * dentro de `FeriadosGlobalesAdminView`, mismo criterio que
 * `/admin/clientes` y `/admin/tipos-componente`.
 *
 * Distinto de `/admin/feriados` (WU8, `features/feriados`, lista combinada
 * global+cliente para el admin del tenant — NO tocado por WU7a).
 */
import { FeriadosGlobalesAdminView } from "@/features/feriados/components/feriados-globales-admin-view";

export default function AdminFeriadosGlobalesPage() {
  return <FeriadosGlobalesAdminView />;
}
