/**
 * `/insumos/reporte-stock` — Server Component fino. El segmento estático gana
 * sobre `[id]`. El gate de módulo vive en `layout.tsx`; acá el de acción
 * `INSUMOS:LECTURA` (el mismo que exigen los endpoints del reporte).
 */
import { Can } from "@/components/shared/can";
import { ErrorState } from "@/components/shared/error-state";
import { ReporteStockView } from "@/features/insumos/components/reporte-stock-view";

export default function ReporteStockPage() {
  return (
    <Can
      permiso="INSUMOS:LECTURA"
      fallback={<ErrorState message="No tenés permiso para ver el reporte de stock." />}
    >
      <ReporteStockView />
    </Can>
  );
}
