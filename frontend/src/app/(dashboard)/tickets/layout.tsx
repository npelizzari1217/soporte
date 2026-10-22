/**
 * TicketsLayout — Server Component: gate REAL del área `/tickets/*`, listado y detalle por id
 * incluidos. Entra quien tiene `LECTURA` sobre algún tipo de cualquier módulo
 * (odd/permisos-por-tipo-ticket, S5, T6), el mismo predicado que el ítem "Tickets" del menú; el sidebar lo oculta, pero eso es solo
 * UI y esta capa impide el acceso por URL directa. Ver `tiposLayoutGate` para el refresh tolerante.
 */
import { tiposLayoutGate } from "@/shared/auth/tipos-layout-gate";

export default async function TicketsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await tiposLayoutGate();
  return <>{children}</>;
}
