/**
 * `/edilicia` — Server Component fino (ADR-1: ruta única "(+ubicaciones)").
 * Gate vive dentro de `EdiliciaView` (`<Can>`).
 */
import { EdiliciaView } from "@/features/edilicia/components/edilicia-view";

export default function EdiliciaPage() {
  return <EdiliciaView />;
}
