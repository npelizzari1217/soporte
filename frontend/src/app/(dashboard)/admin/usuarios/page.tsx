/**
 * Usuarios admin page — /admin/usuarios (thin route wrapper)
 *
 * Toda la lógica vive en el feature component UsuariosPage — este archivo solo
 * conecta la ruta de App Router con el componente (mismo patrón que
 * admin/clientes y admin/ciclos).
 *
 * Spec: [SPEC:admin-ui/Pantalla Usuarios]
 */

import { UsuariosPage } from "@/features/admin/components/UsuariosPage";

export default function UsuariosRoute() {
  return <UsuariosPage />;
}
