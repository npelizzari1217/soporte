/**
 * Ticket detail — /tickets/:id (stub)
 *
 * Spec: [SPEC:frontend-design-system/atomos in routing context]
 */

import { PageHeader } from "@/components/shell/page-header";

interface TicketDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TicketDetailPage({
  params,
}: TicketDetailPageProps) {
  const { id } = await params;
  return (
    <div>
      <PageHeader title={`Ticket #${id}`} />
      <p className="text-sm text-muted-foreground">
        Detalle del ticket — próximamente.
      </p>
    </div>
  );
}
