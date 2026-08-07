/**
 * `/kb` — Server Component fino (ADR-1): solo monta el feature client
 * component. El gating de UI (botón "Nuevo artículo") vive dentro de
 * `KbListView`.
 */
import { KbListView } from "@/features/kb/components/kb-list-view";

export default function KbPage() {
  return <KbListView />;
}
