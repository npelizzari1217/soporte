/**
 * `/horario-laboral` — Server Component fino (ADR-1): solo monta el feature
 * client component. Sin `layout.tsx` propio y a propósito: la LECTURA de
 * esta pantalla está abierta a cualquier actor autenticado del tenant
 * (`spec.md`, "Contrato observable del frontend": la grilla es de solo
 * lectura para cualquier rol que no sea `esAdminCliente`), mismo criterio
 * que `/feriados` — a diferencia de `/admin/*`, que gatea por
 * `esAdminCliente` en `admin/layout.tsx` y bloquearía la lectura.
 *
 * `RUTAS_PUBLICAS` (`middleware.ts`) NO cambia: esta ruta exige sesión,
 * como el resto de `(dashboard)`.
 */
import { HorarioLaboralView } from "@/features/horario-laboral/components/horario-laboral-view";

export default function HorarioLaboralPage() {
  return <HorarioLaboralView />;
}
