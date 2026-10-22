import { redirect } from "next/navigation";
import { usuarioDeLaCookie } from "@/shared/auth/modulo-layout-gate";
import { permisosPorTipoDelServidor } from "@/shared/auth/permisos-por-tipo-servidor";
import { puedeEnAlgunTipo, puedeEnModulo } from "@/shared/auth/permisos-por-tipo";

/**
 * Gate server-side de un área de tickets (`/tickets`, `/edilicia`) por permisos POR TIPO
 * (odd/permisos-por-tipo-ticket, S5, T6): entra quien tiene `LECTURA` sobre algún tipo del módulo,
 * el mismo predicado que el ítem del menú y que el inicio (`app/page.tsx`). Reemplaza al gate por
 * celda de módulo (`moduloLayoutGate`), que dejaba afuera a quien tiene acceso por tipo sin la
 * celda, y adentro a quien tiene la celda sin ningún tipo.
 *
 * Solo redirige cuando sabe: token legible y permisos leídos sin LECTURA en el módulo. Sin token o
 * sin respuesta del backend deja pasar (refresh tolerante, R26) y decide la vista en el cliente,
 * que nunca redirige: así el gate y el inicio no pueden entrar en ciclo.
 *
 * @param modulo Módulo de los tipos del área; sin él, alcanza con `LECTURA` sobre algún tipo de
 *   cualquier módulo (`/tickets`, que lista todos los tipos con Ver).
 */
export async function tiposLayoutGate(modulo?: string): Promise<void> {
  const user = await usuarioDeLaCookie();
  if (!user) return;
  const permisos = await permisosPorTipoDelServidor();
  if (!permisos) return;
  const lee =
    modulo === undefined
      ? puedeEnAlgunTipo(permisos, "LECTURA")
      : puedeEnModulo(permisos, modulo, "LECTURA");
  if (!lee) {
    redirect("/");
  }
}
