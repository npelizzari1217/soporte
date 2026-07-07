/**
 * Ticket detail — /tickets/:id (server wrapper)
 *
 * Server Component: unwraps Next 15's `params: Promise<{ id }>` and delegates
 * all rendering/state to the client container, keeping `use()` out of the
 * container itself.
 *
 * Design: design.md §"Estructura Container/Presentational" (1. page.tsx)
 * Spec: [SPEC:ticket-detail/*]
 */

import { TicketDetailContainer } from "@/features/tickets/components/TicketDetailContainer";

interface TicketDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TicketDetailPage({
  params,
}: TicketDetailPageProps) {
  const { id } = await params;
  return <TicketDetailContainer id={id} />;
}
