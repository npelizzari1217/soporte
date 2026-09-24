/**
 * `/feriados` — Server Component fino (ADR-1): solo monta el feature client
 * component. Sin `layout.tsx` propio y a propósito: la lectura de esta
 * pantalla está abierta a CUALQUIER actor autenticado del tenant
 * (`spec.md`, "Per-client admin manages its own holidays; other roles
 * read"), mismo criterio que `/tickets` y `/kb` (`nav-config.ts`,
 * `DEFAULT_SECTION_ITEMS`, `visible: () => true`) — a diferencia de
 * `/admin/*`, que gatea por `esAdminCliente` en `admin/layout.tsx` y
 * bloquearía a un actor sin ese rol.
 *
 * Distinto de `/admin/feriados-globales` (WU7, catálogo MASTER exclusivo de
 * ROOT). Este es el combinado (global + propio) del tenant, task 8.1, WU8a.
 */
import { FeriadosListView } from "@/features/feriados/components/feriados-list-view";

export default function FeriadosPage() {
  return <FeriadosListView />;
}
