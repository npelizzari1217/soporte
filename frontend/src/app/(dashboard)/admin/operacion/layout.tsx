/**
 * OperacionLayout — gate REAL de `/admin/operacion` por ROOT (`is_global_admin`), mismo patrón que
 * `/admin/feriados-globales`: el sidebar oculta el ítem, pero eso no impide entrar por URL. La
 * cobertura del gate vive en `root-access.test.ts`.
 */
import { rootLayoutGate } from "@/shared/auth/root-layout-gate";

export default async function OperacionLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await rootLayoutGate();
  return <>{children}</>;
}
