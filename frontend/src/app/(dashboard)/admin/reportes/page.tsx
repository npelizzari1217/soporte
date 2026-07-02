/**
 * Reportes — /admin/reportes (route, thin wrapper)
 *
 * Delega el renderizado completo al componente ReportesPage (features/admin) —
 * este archivo solo cablea la ruta App Router al feature (Scope Rule, CLAUDE.md §2).
 *
 * Spec: [SPEC:admin-ui/Pantalla Reportes]
 */

import { ReportesPage } from "@/features/admin/components/ReportesPage";

export default function Page() {
  return <ReportesPage />;
}
