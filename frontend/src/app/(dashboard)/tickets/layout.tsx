/**
 * TicketsLayout — Server Component: gate REAL del área `/tickets/*` por MÓDULO (5.2 CAPA 3),
 * listado y detalle por id incluidos. El sidebar ya oculta el ítem "Tickets" a quien no tiene
 * `TICKETS:LECTURA`, pero eso es solo UI; esta capa impide el acceso por URL directa
 * (odd/permisos-por-tipo-ticket, S0). Ver `moduloLayoutGate` para el refresh tolerante (R26).
 */
import { moduloLayoutGate } from "@/shared/auth/modulo-layout-gate";

export default async function TicketsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await moduloLayoutGate("TICKETS");
  return <>{children}</>;
}
