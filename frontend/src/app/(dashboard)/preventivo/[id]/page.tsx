/**
 * `/preventivo/[id]` — Server Component fino (ADR-1). El layout de
 * `/preventivo` solo gatea por MÓDULO (`moduloLayoutGate("PREVENTIVO")`), no
 * por permiso. El gate real por permiso (`PREVENTIVO:LECTURA` para ver los
 * datos, `PREVENTIVO:BORRADO` para la baja) vive DENTRO de
 * `PlanPreventivoDetailView` (`<Can>`).
 */
import { PlanPreventivoDetailView } from "@/features/preventivo/components/plan-preventivo-detail-view";

export default async function PlanPreventivoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlanPreventivoDetailView planId={id} />;
}
