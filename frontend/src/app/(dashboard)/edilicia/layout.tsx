/**
 * EdiliciaLayout — Server Component: gate REAL del área `/edilicia/*`. Entra quien tiene `LECTURA`
 * sobre algún tipo de EDILICIA (odd/permisos-por-tipo-ticket, S5, T6), el mismo predicado que el
 * ítem "Edilicia" del menú; el sidebar lo oculta, pero eso es solo UI y esta capa impide el acceso
 * por URL directa. Ver `tiposLayoutGate` para el refresh tolerante.
 */
import { tiposLayoutGate } from "@/shared/auth/tipos-layout-gate";

export default async function EdiliciaLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await tiposLayoutGate("EDILICIA");
  return <>{children}</>;
}
