"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/shared/api/client";
import { ApiError } from "@/shared/api/types";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import { AVISO_QR_POR_CODIGO, qrEquipoSchema, type QrEquipo, type QrEquipoLeido } from "../qr-equipo";
import { qrEquipoKey } from "./use-qr-equipo";

/**
 * `POST /equipos/:id/qr` (`EQUIPOS:MODIFICACION`): emite el QR o lo regenera, e invalida el
 * anterior. Al terminar deja el QR nuevo en la cache de `useQrEquipo`: el panel lo muestra y
 * el anterior (ya invalidado en el backend) desaparece. Los avisos se eligen por `ApiError.code`; sin código cae al mensaje del backend.
 */
export function useEmitirQrEquipo(equipoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<QrEquipo> =>
      qrEquipoSchema.parse(await apiFetch<unknown>(`equipos/${equipoId}/qr`, { method: "POST" })),
    onSuccess: (qr) => {
      queryClient.setQueryData<QrEquipoLeido>(qrEquipoKey(equipoId), {
        estado: "VIGENTE",
        url: qr.url,
        emitidoAt: qr.emitidoAt,
      });
      notifySuccess("QR generado.");
    },
    onError: (err) => {
      const aviso = err instanceof ApiError && err.code ? AVISO_QR_POR_CODIGO[err.code] : undefined;
      if (aviso) toast.error(aviso);
      else notifyError(err);
    },
  });
}
