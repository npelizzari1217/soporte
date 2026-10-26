"use client";

/**
 * EdiliciaView — CONTAINER montado por `/edilicia` (T5.7-T5.10, migrado en
 * WU-7.6). Solo Reparaciones (ex-tab "Ubicaciones" removido junto con el
 * catálogo Ubicacion — ver refactor/remover-ubicaciones). Gate de acceso a
 * la vista = `LECTURA` sobre algún tipo de EDILICIA (odd/permisos-por-tipo-ticket,
 * S5), mismo predicado que el ítem "Edilicia" en `nav-config.ts` y que el gate
 * de ruta — las acciones dentro de la vista se gatean por el tipo de cada fila.
 *
 * Mientras los permisos cargan no se afirma nada: ni la lista ni el "sin
 * permiso". Este gate nunca redirige, para no entrar en ciclo con el inicio.
 */
import { ErrorState } from "@/components/shared/error-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { usePermisosPorTipo } from "@/shared/hooks/use-permisos-por-tipo";
import { ReparacionesList } from "./reparaciones-list";

export function EdiliciaView() {
  const { isPending, puedeEnModulo } = usePermisosPorTipo();
  if (isPending) return <TableSkeleton />;
  if (!puedeEnModulo("EDILICIA", "LECTURA")) {
    return <ErrorState message="No tiene permiso para ver Edilicia." />;
  }
  return <ReparacionesList />;
}
