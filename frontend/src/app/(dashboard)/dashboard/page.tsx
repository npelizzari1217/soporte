/**
 * `/dashboard` — Server Component fino (ADR-1): solo monta el feature client
 * component. Ruta ya protegida por el middleware (R26); el gating de acceso
 * real (`ticket:ver_todos`, D3) lo aplica el backend — `DashboardView`
 * maneja el 403 si se navega directo a la URL sin el permiso.
 */
import { DashboardView } from "@/features/dashboard/components/dashboard-view";

export default function DashboardPage() {
  return <DashboardView />;
}
