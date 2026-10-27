"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { RespuestaAsistente } from "../types";

/**
 * `POST /asistente/consultas`. No cachea: cada consulta es una pregunta nueva. Los errores los
 * muestra el panel dentro de la conversación, no con un aviso flotante.
 */
export function useConsultarAsistente() {
  return useMutation({
    mutationFn: (consulta: string) =>
      apiFetch<RespuestaAsistente>("asistente/consultas", { method: "POST", json: { consulta } }),
  });
}
