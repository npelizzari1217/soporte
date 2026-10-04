"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/shared/api/client";
import { ApiError } from "@/shared/api/types";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import { AVISO_QR_POR_CODIGO, qrEquipoSchema, type QrEquipo } from "../qr-equipo";

/**
 * `POST /equipos/:id/qr` (`EQUIPOS:MODIFICACION`): emite el QR o lo regenera, e invalida el
 * anterior. El token solo viaja en esta respuesta, así que NO se guarda en la cache de
 * react-query: vive en el resultado de la mutación y se pierde al salir de la pantalla.
 * Los avisos se eligen por `ApiError.code`; sin código cae al mensaje del backend.
 */
export function useEmitirQrEquipo(equipoId: string) {
  return useMutation({
    mutationFn: async (): Promise<QrEquipo> =>
      qrEquipoSchema.parse(await apiFetch<unknown>(`equipos/${equipoId}/qr`, { method: "POST" })),
    gcTime: 0,
    onSuccess: () => notifySuccess("QR generado."),
    onError: (err) => {
      const aviso = err instanceof ApiError && err.code ? AVISO_QR_POR_CODIGO[err.code] : undefined;
      if (aviso) toast.error(aviso);
      else notifyError(err);
    },
  });
}
