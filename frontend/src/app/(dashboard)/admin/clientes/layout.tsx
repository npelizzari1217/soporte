/**
 * ClientesLayout — Server Component: gate REAL de `/admin/clientes` por ROOT
 * (`is_global_admin`). El sidebar ya oculta este ítem a quien no es ROOT
 * (nav-config.ts, sección "ROOT"), y `ClientesAdminView` también gatea
 * client-side — pero ninguno de los dos impide el acceso por URL directa.
 * Ver `rootLayoutGate` para el detalle del patrón (refresh tolerante R26).
 */
import { rootLayoutGate } from "@/shared/auth/root-layout-gate";

export default async function ClientesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await rootLayoutGate();
  return <>{children}</>;
}
