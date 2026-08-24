"use client";

/**
 * useEncuestaPublica / useResponderEncuesta — hooks CONTAINER de la página
 * pública de la encuesta (WU8, tarea 8.2).
 *
 * `fetch` CRUDO al proxy BFF, NO `apiFetch` (`shared/api/client.ts`): el
 * destinatario del link NUNCA tiene sesión, y `apiFetch` dispara el refresh
 * single-flight ante cualquier 401 — lógica de sesión que acá no aplica y que
 * terminaría lanzando `SessionExpiredError` sobre un actor anónimo. El proxy
 * genérico (`app/api/[...path]/route.ts`) ya reenvía sin `Authorization`
 * cuando no hay cookie `at`, así que alcanza con `fetch("/api/publico/...")`.
 *
 * Ref design: ADR-C7 (corolario). Tarea: 8.2.
 */
import { useMutation, useQuery, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import type { EncuestaPublicaResponse } from "../types";

/** Body de `POST /publico/encuesta/:token`. */
export interface RespuestaEncuestaDto {
  puntaje: number;
  comentario?: string;
}

/**
 * Parsea la respuesta del endpoint público. Ante un error HTTP no distingue
 * motivo (mismo criterio anti-enumeración del backend, ver
 * `encuesta-publica.controller.ts`): solo importa que falló.
 */
async function parseRespuestaEncuesta(res: Response): Promise<EncuestaPublicaResponse> {
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error("El link de la encuesta no es válido.");
  }
  return body as EncuestaPublicaResponse;
}

/** `GET /publico/encuesta/:token` — consulta el estado del link, sin efectos. */
export function useEncuestaPublica(token: string): UseQueryResult<EncuestaPublicaResponse, Error> {
  return useQuery({
    queryKey: ["encuesta-publica", token],
    queryFn: async () => parseRespuestaEncuesta(await fetch(`/api/publico/encuesta/${token}`)),
    retry: false,
  });
}

/** `POST /publico/encuesta/:token` — registra la respuesta (uso único). */
export function useResponderEncuesta(
  token: string,
): UseMutationResult<EncuestaPublicaResponse, Error, RespuestaEncuestaDto> {
  return useMutation({
    mutationFn: async (dto: RespuestaEncuestaDto) =>
      parseRespuestaEncuesta(
        await fetch(`/api/publico/encuesta/${token}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(dto),
        }),
      ),
  });
}
