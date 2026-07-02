/**
 * Route: /admin/clientes — pantalla de administración de clientes (solo operador).
 *
 * Server Component delgado — delega toda la lógica al feature component.
 * Protección de ruta: middleware.ts (T5.14/T5.15, PR5) redirige a `/tickets` si
 * el usuario no tiene is_global_admin=true.
 *
 * Spec: [SPEC:admin-ui/Pantalla Clientes]
 */
import { ClientesPage } from "@/features/admin/components/ClientesPage";

export default function Page() {
  return <ClientesPage />;
}
