/**
 * `/equipos/[id]` — Server Component fino (ADR-1). Gate `equipo:gestionar`
 * vive dentro de `EquipoDetailView` (`<Can>`).
 */
import { EquipoDetailView } from "@/features/equipos/components/equipo-detail-view";

export default async function EquipoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EquipoDetailView equipoId={id} />;
}
