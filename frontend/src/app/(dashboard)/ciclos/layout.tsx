/**
 * CiclosLayout — Server Component: gate REAL de `/ciclos` (catálogo MASTER,
 * sdd/ciclos-abm-root) por ROOT (`is_global_admin`). El sidebar ya oculta
 * este ítem a quien no es ROOT (nav-config.ts, sección "ROOT"), y
 * `CiclosVigentesAdminView` también gatea client-side — pero ninguno de los
 * dos impide el acceso por URL directa. Ver `rootLayoutGate` para el detalle
 * del patrón (refresh tolerante R26).
 *
 * Distinto de `/admin/ciclos` (adopción/activación del ciclo por el admin
 * del cliente — gateado por `ciclo:gestionar` dentro del gate de
 * `/admin/layout.tsx`, NO tocado por este cambio).
 */
import { rootLayoutGate } from "@/shared/auth/root-layout-gate";

export default async function CiclosLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await rootLayoutGate();
  return <>{children}</>;
}
