/**
 * `/repuestos` — Server Component fino (ADR-1), mismo patrón que
 * `/insumos/page.tsx` (WU-2, sdd/repuestos-seccion). Los gates de permiso
 * viven dentro de `RepuestosListView` (`<Can>`); el del módulo, en
 * `layout.tsx`.
 */
import { RepuestosListView } from "@/features/insumos/components/repuestos-list-view";

export default function RepuestosPage() {
  return <RepuestosListView />;
}
