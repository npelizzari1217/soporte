/**
 * `/equipos` — Server Component fino (ADR-1). Gates viven dentro de
 * `EquiposListView` (`<Can>`).
 */
import { EquiposListView } from "@/features/equipos/components/equipos-list-view";

export default function EquiposPage() {
  return <EquiposListView />;
}
