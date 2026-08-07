/**
 * `/kb/:id` — Server Component fino (ADR-1). Next.js 15: `params` es una
 * Promise (mismo criterio que `app/tickets/[id]/page.tsx`).
 */
import { KbDetailView } from "@/features/kb/components/kb-detail-view";

interface KbDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function KbDetailPage({ params }: KbDetailPageProps) {
  const { id } = await params;
  return <KbDetailView articuloId={id} />;
}
