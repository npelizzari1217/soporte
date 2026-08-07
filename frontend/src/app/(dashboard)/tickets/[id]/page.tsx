/**
 * `/tickets/:id` — Server Component fino (ADR-1). Next.js 15: `params` es
 * una Promise (mismo criterio que `app/api/[...path]/route.ts`).
 */
import { TicketDetailView } from "@/features/tickets/components/ticket-detail-view";

interface TicketDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TicketDetailPage({ params }: TicketDetailPageProps) {
  const { id } = await params;
  return <TicketDetailView ticketId={id} />;
}
