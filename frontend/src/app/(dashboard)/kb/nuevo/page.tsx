/**
 * `/kb/nuevo` — Server Component fino (ADR-1). Gate `kb:gestionar` vive
 * dentro de `KbCreateView` (`<Can>`).
 */
import { KbCreateView } from "@/features/kb/components/kb-create-view";

export default function NuevoArticuloKbPage() {
  return <KbCreateView />;
}
