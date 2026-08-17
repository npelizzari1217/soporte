"use client";

/**
 * EdiliciaView — CONTAINER montado por `/edilicia` (T5.7-T5.10, migrado en
 * WU-7.6). Solo Reparaciones (ex-tab "Ubicaciones" removido junto con el
 * catálogo Ubicacion — ver refactor/remover-ubicaciones). Gate de acceso a
 * la vista = `EDILICIA:LECTURA`, mismo predicado que el ítem "Edilicia" en
 * `nav-config.ts` — las acciones dentro de la vista tienen su propio gate
 * más específico (`EDILICIA:ALTAS`, `EDILICIA:MODIFICACION`, `EDILICIA:BORRADO`).
 */
import { Can } from "@/components/shared/can";
import { ErrorState } from "@/components/shared/error-state";
import { ReparacionesList } from "./reparaciones-list";

export function EdiliciaView() {
  return (
    <Can permiso="EDILICIA:LECTURA" fallback={<ErrorState message="No tenés permiso para ver Edilicia." />}>
      <ReparacionesList />
    </Can>
  );
}
