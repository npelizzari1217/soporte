import type { JwtPayload } from "@/shared/api/types";

/**
 * ¿El usuario puede entrar a un área EXCLUSIVA de ROOT (plataforma)? Los
 * catálogos MASTER — Clientes, Ciclos (sdd/ciclos-abm-root) — son
 * ortogonales al rol/permisos del tenant: solo `is_global_admin` los habilita. Mismo
 * criterio que el gating de UI en `nav-config.ts` (sección "ROOT").
 *
 * `null` = indeterminado (token ausente/expirado en la ventana de refresh
 * tolerante, R26): NO decide acá — el llamador debe dejar pasar y delegar en
 * el gate client-side (`isGlobalAdmin` dentro de cada `*AdminView`), para no
 * expulsar a un ROOT cuyo access token venció pero tiene refresh vivo.
 */
export function puedeEntrarRoot(user: Pick<JwtPayload, "is_global_admin"> | null): boolean {
  if (!user) return false;
  return user.is_global_admin;
}
