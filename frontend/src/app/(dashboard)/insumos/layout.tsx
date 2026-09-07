/**
 * InsumosLayout — Server Component: gate REAL del área `/insumos/*` por MÓDULO
 * (5.2 CAPA 3). El sidebar ya oculta el ítem "Insumos" a quien no tiene el
 * módulo, pero eso es solo UI; esta capa impide el acceso por URL directa.
 * Ver `moduloLayoutGate` para el detalle del patrón (refresh tolerante R26).
 */
import { moduloLayoutGate } from "@/shared/auth/modulo-layout-gate";

export default async function InsumosLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await moduloLayoutGate("INSUMOS");
  return <>{children}</>;
}
