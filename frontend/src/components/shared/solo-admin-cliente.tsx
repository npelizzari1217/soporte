"use client";

/**
 * <SoloAdminCliente> — declarative render-guard para UI reservada a
 * ADMINISTRADOR-o-ROOT (ADR-P5, `sdd/matriz-permisos-por-usuario`).
 *
 * `<Can permiso="...">` (`components/shared/can.tsx`) NO puede expresar
 * "admin o root": gatea sobre una celda `MODULO:ACCION` de la matriz, y la
 * configuración (usuarios/ciclos/catálogos, R4) dejó de tener celda propia —
 * es un chequeo de IDENTIDAD (`useSession().esAdminCliente`), no de permiso.
 * Este componente es el hermano de `<Can>` para ese caso.
 *
 * Renders `children` only when `useSession().esAdminCliente` is true;
 * otherwise renders `fallback` (default: nothing). Esto NUNCA reemplaza la
 * autorización del backend (`AdminClienteGuard`) — todo consumidor gateado
 * acá debe seguir manejando un 403 de la API.
 */
import type { ReactNode } from "react";
import { useSession } from "@/shared/hooks/use-session";

export interface SoloAdminClienteProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function SoloAdminCliente({ children, fallback = null }: SoloAdminClienteProps) {
  const { esAdminCliente } = useSession();
  return <>{esAdminCliente ? children : fallback}</>;
}
