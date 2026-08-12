"use client";

/**
 * EdiliciaView — CONTAINER montado por `/edilicia` (T5.7-T5.10). Solo
 * Reparaciones (ex-tab "Ubicaciones" removido junto con el catálogo
 * Ubicacion — ver refactor/remover-ubicaciones). Gate de acceso a la vista =
 * predicado del ítem "Edilicia" en `nav-config.ts` (`subtarea:actualizar`) —
 * las acciones dentro de la vista tienen su propio gate más específico
 * (`ticket:crear`, `subtarea:actualizar`).
 */
import { Can } from "@/components/shared/can";
import { ErrorState } from "@/components/shared/error-state";
import { ReparacionesList } from "./reparaciones-list";

export function EdiliciaView() {
  return (
    <Can permiso="subtarea:actualizar" fallback={<ErrorState message="No tenés permiso para ver Edilicia." />}>
      <ReparacionesList />
    </Can>
  );
}
