/**
 * `/preventivo` — Server Component fino (ADR-1). Gates viven dentro de
 * `PlanesPreventivoListView` (`<Can>`).
 */
import { PlanesPreventivoListView } from "@/features/preventivo/components/planes-preventivo-list-view";

export default function PreventivoPage() {
  return <PlanesPreventivoListView />;
}
