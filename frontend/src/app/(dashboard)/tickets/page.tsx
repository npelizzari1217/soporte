/**
 * `/tickets` — Server Component fino (ADR-1): solo monta el feature client
 * component. Ruta ya protegida por el middleware (R26); el gating de UI por
 * permiso vive dentro de `TicketsListView`.
 */
import { TicketsListView } from "@/features/tickets/components/tickets-list-view";

export default function TicketsPage() {
  return <TicketsListView />;
}
