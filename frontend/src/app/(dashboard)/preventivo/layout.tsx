/**
 * PreventivoLayout — Server Component: gate REAL del área `/preventivo/*` por
 * MÓDULO. El sidebar ya oculta el ítem "Preventivo" a quien no tiene el
 * módulo, pero eso es solo UI; esta capa impide el acceso por URL directa.
 * Ver `moduloLayoutGate` para el detalle del patrón (refresh tolerante R26).
 */
import { moduloLayoutGate } from "@/shared/auth/modulo-layout-gate";

export default async function PreventivoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await moduloLayoutGate("PREVENTIVO");
  return <>{children}</>;
}
