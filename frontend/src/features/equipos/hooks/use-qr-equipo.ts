"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { qrEquipoLeidoSchema, type QrEquipoLeido } from "../qr-equipo";

export const qrEquipoKey = (equipoId: string) => ["equipo-qr", equipoId] as const;

/**
 * `GET /equipos/:id/qr` (`EQUIPOS:MODIFICACION`, issue #356): el QR vigente del equipo, para
 * mostrarlo, descargarlo o imprimirlo cuando haga falta. "Sin QR" no es un error: viene como
 * `estado` (`SIN_EMITIR` o `REQUIERE_REGENERAR`). Emitir o regenerar actualiza esta misma
 * cache (`useEmitirQrEquipo`), así el panel muestra el nuevo QR sin recargar.
 */
export function useQrEquipo(equipoId: string) {
  return useQuery<QrEquipoLeido>({
    queryKey: qrEquipoKey(equipoId),
    queryFn: async () => qrEquipoLeidoSchema.parse(await apiFetch<unknown>(`equipos/${equipoId}/qr`)),
    // El QR solo cambia cuando este mismo panel lo regenera (y entonces actualiza la cache).
    staleTime: Infinity,
    retry: false,
  });
}
