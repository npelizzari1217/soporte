/**
 * RepuestosLayout — gate REAL del área `/repuestos/*` por MÓDULO (5.2 CAPA 3),
 * mismo patrón que `insumos/layout.tsx`. Reusa el módulo `INSUMOS` — no
 * existe un módulo `REPUESTOS` propio (WU-2, sdd/repuestos-seccion, decisión
 * del dueño del repo): la sección de Repuestos gatea con el mismo
 * `INSUMOS:LECTURA` que la de Insumos.
 */
import { moduloLayoutGate } from "@/shared/auth/modulo-layout-gate";

export default async function RepuestosLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await moduloLayoutGate("INSUMOS");
  return <>{children}</>;
}
