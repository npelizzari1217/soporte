/**
 * `/insumos` — Server Component fino (ADR-1). Los gates de permiso viven
 * dentro de `InsumosListView` (`<Can>`); el del módulo, en `layout.tsx`.
 */
import { InsumosListView } from "@/features/insumos/components/insumos-list-view";

export default function InsumosPage() {
  return <InsumosListView />;
}
