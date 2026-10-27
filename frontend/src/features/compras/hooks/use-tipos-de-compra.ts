"use client";

/**
 * useTiposDeCompra — los tipos de ticket que la sesión puede usar en compras para una acción
 * (odd/compras-por-tipo, opción A: el permiso sale de la matriz por tipo de ticket). El alta y la
 * edición piden `ALTAS` (S3); el filtro del listado, `LECTURA` (S5). ROOT y ADMINISTRADOR ven todos
 * los tipos activos, porque `usePermisosPorTipo` no los restringe.
 *
 * Distingue "todavía cargando" de "no hay ninguno" y de "no se pudo saber": una lista vacía sola no
 * alcanza para decirle a la persona que no tiene permiso, porque con el catálogo o los permisos
 * pendientes también es vacía. Ocultar un tipo es comodidad: el backend vuelve a decidir (403).
 */
import { useTiposTicket } from "@/features/tickets/hooks/use-catalogos";
import { usePermisosPorTipo } from "@/shared/hooks/use-permisos-por-tipo";
import type { AccionTipoTicket } from "@/shared/auth/permisos-por-tipo";
import type { TipoTicket } from "@/features/tickets/types";

/** Lo que devuelve `useTiposDeCompra`. */
export interface TiposDeCompra {
  /** Tipos activos con la acción, en el orden del catálogo; vacío salvo con `estado: "listo"`. */
  tipos: TipoTicket[];
  /** `listo` solo cuando el catálogo y los permisos resolvieron con éxito. */
  estado: "cargando" | "listo" | "error";
}

/**
 * @param accion Acción que la sesión necesita sobre el tipo.
 * @returns Los tipos elegibles y el estado de la consulta.
 */
export function useTiposDeCompra(accion: AccionTipoTicket): TiposDeCompra {
  const tiposQuery = useTiposTicket();
  const { permisos, isPending, tiposCon } = usePermisosPorTipo();

  if (tiposQuery.isError || (!isPending && permisos === null)) {
    return { tipos: [], estado: "error" };
  }
  if (!tiposQuery.isSuccess || permisos === null) {
    return { tipos: [], estado: "cargando" };
  }
  // El catálogo ya trae solo los activos; el filtro deja explícito que el backend rechaza (400) un
  // tipo inactivo en el alta y en el cambio de tipo.
  const activos = tiposQuery.data.filter((tipo) => tipo.activo);
  return { tipos: tiposCon(activos, accion), estado: "listo" };
}
