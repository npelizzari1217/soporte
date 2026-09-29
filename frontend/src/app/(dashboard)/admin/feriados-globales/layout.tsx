/**
 * FeriadosGlobalesLayout — Server Component: gate REAL de
 * `/admin/feriados-globales` por ROOT (`is_global_admin`). El sidebar ya
 * oculta este ítem a quien no es ROOT (nav-config.ts, sección "ROOT"), y
 * `FeriadosGlobalesAdminView` también gatea client-side — pero ninguno de
 * los dos impide el acceso por URL directa. Ver `rootLayoutGate` para el
 * detalle del patrón (refresh tolerante R26); mismo criterio que
 * `/admin/clientes`, que reutiliza el mismo gate sin lógica propia — por
 * eso este archivo no lleva un test aparte (`/admin/clientes` tampoco lo lleva): la cobertura vive en
 * `root-access.test.ts`, que ya prueba `puedeEntrarRoot`.
 */
import { rootLayoutGate } from "@/shared/auth/root-layout-gate";

export default async function FeriadosGlobalesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await rootLayoutGate();
  return <>{children}</>;
}
