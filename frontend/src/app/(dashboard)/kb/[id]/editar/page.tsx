/**
 * `/kb/:id/editar` — Server Component fino (ADR-1). Gate `kb:gestionar`
 * vive dentro de `KbEditView` (`<Can>`).
 */
import { KbEditView } from "@/features/kb/components/kb-edit-view";

interface KbEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditarArticuloKbPage({ params }: KbEditPageProps) {
  const { id } = await params;
  return <KbEditView articuloId={id} />;
}
