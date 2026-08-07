/**
 * `/tickets/nuevo` — Server Component fino (ADR-1). Gate `ticket:crear`
 * vive dentro de `TicketCreateView` (`<Can>`).
 */
import { TicketCreateView } from "@/features/tickets/components/ticket-create-view";

export default function NuevoTicketPage() {
  return <TicketCreateView />;
}
