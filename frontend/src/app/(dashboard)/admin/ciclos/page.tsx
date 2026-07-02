/**
 * /admin/ciclos — ruta de administración de ciclos del tenant resuelto.
 *
 * Visible para operador global (con cliente seleccionado en TenantContext) y
 * ADMINISTRADOR. Renderiza el feature component CiclosPage (container).
 *
 * Spec: [SPEC:admin-ui/Pantalla Ciclos]
 */

import { CiclosPage } from "@/features/admin/components/CiclosPage";

export default function Page() {
  return <CiclosPage />;
}
