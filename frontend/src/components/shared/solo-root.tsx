"use client";

/**
 * <SoloRoot> — declarative render-guard para UI reservada a ROOT
 * (`is_global_admin`), el administrador global de la plataforma.
 *
 * Tercer hermano de `<Can>` y `<SoloAdminCliente>`, y el más restrictivo de
 * los tres: `<Can>` gatea sobre una celda `MODULO:ACCION` de la matriz del
 * cliente, `<SoloAdminCliente>` sobre "administro este cliente", y este sobre
 * "administro la plataforma entera". Ninguno de los dos primeros sirve para lo
 * que es global de verdad: la Ayuda es una sola para todos los clientes, así
 * que editarla no puede depender ni de una celda ni del rol dentro de un
 * cliente — sería un administrador cambiando lo que leen los demás.
 *
 * Renderiza `children` solo cuando `useSession().isGlobalAdmin` es true; si no,
 * `fallback` (default: nada). Esto NUNCA reemplaza la autorización del backend
 * (`GlobalAdminGuard`) — todo consumidor gateado acá debe seguir manejando un
 * 403 de la API.
 */
import type { ReactNode } from "react";
import { useSession } from "@/shared/hooks/use-session";

export interface SoloRootProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function SoloRoot({ children, fallback = null }: SoloRootProps) {
  const { isGlobalAdmin } = useSession();
  return <>{isGlobalAdmin ? children : fallback}</>;
}
