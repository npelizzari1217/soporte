"use client";

/**
 * useContextoPedido / useEnviarPedido — hooks CONTAINER de la página pública `/c/:slug/pedido`
 * (sdd/formulario-publico-qr, WU-16).
 *
 * `apiFetch` por el proxy BFF (`/api/publico/...`), igual que `use-solicitar-reset`: ninguna de
 * estas rutas responde 401, así que el refresh de sesión nunca se dispara. El proxy reenvía sin
 * `Authorization` cuando no hay cookie.
 *
 * Anti-enumeración: el backend responde el MISMO 404 para slug inexistente, formulario
 * deshabilitado o cliente inactivo; la UI tampoco distingue el motivo.
 */
import { useMutation, useQuery, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { ApiError } from "@/shared/api/types";
import type { ContextoPedido } from "../types";
import type { PedidoPublicoFormValues } from "../schemas";

/** Mensaje del 202 constante: el mail con el link de confirmación sale aparte. */
export const MENSAJE_PEDIDO_ENVIADO =
  "Te enviamos un correo para confirmar tu pedido. Abrí el link que te mandamos y listo. Si no lo ves, revisá la carpeta de spam.";

export const MENSAJE_FORMULARIO_NO_DISPONIBLE =
  "Este formulario no está disponible o el link no es válido.";

/** 404 y 429 se distinguen; red y 5xx son transitorios; el resto cae a un mensaje genérico. */
export function mensajeDeErrorPedido(error: ApiError | null): string {
  if (!error) return "No pudimos enviar tu pedido. Probá de nuevo.";
  if (error.statusCode === 404) return MENSAJE_FORMULARIO_NO_DISPONIBLE;
  if (error.statusCode === 429) return "Hiciste demasiados pedidos. Esperá unos minutos y volvé a intentar.";
  if (error.statusCode === 0) return "No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.";
  if (error.statusCode >= 500) return "Hubo un problema en el servidor. Probá de nuevo en unos minutos.";
  return "Revisá los datos del formulario e intentá de nuevo.";
}

function rutaPedido(slug: string): string {
  return `publico/c/${encodeURIComponent(slug)}/pedido`;
}

/** `GET publico/c/:slug/pedido/contexto?e=` — sin efectos; `e` es el token crudo del QR. */
export function useContextoPedido(
  slug: string,
  tokenQr: string | null,
): UseQueryResult<ContextoPedido, ApiError> {
  const query = tokenQr ? `?e=${encodeURIComponent(tokenQr)}` : "";
  return useQuery<ContextoPedido, ApiError>({
    queryKey: ["pedido-publico-contexto", slug, tokenQr],
    queryFn: () => apiFetch<ContextoPedido>(`${rutaPedido(slug)}/contexto${query}`),
    retry: false,
    staleTime: Infinity,
  });
}

/** `POST publico/c/:slug/pedido/solicitud` — 202 constante; el pedido recién existe al confirmar. */
export function useEnviarPedido(
  slug: string,
  tokenQr: string | null,
): UseMutationResult<unknown, ApiError, PedidoPublicoFormValues> {
  return useMutation<unknown, ApiError, PedidoPublicoFormValues>({
    mutationFn: (values) =>
      apiFetch<unknown>(`${rutaPedido(slug)}/solicitud`, {
        method: "POST",
        json: {
          nombre: values.nombre,
          email: values.email,
          telefono: values.telefono ? values.telefono : undefined,
          titulo: values.titulo,
          descripcion: values.descripcion,
          ...(tokenQr ? { equipoToken: tokenQr } : {}),
        },
      }),
  });
}

export interface PedidoConfirmado {
  numero: string;
}

/** 409: el cliente todavía no tiene un ciclo de soporte activo; el link sigue vigente. */
export const MENSAJE_SIN_CICLO_ACTIVO =
  "Por ahora no podemos registrar tu pedido. Tu link sigue siendo válido: volvé a abrirlo más tarde.";

export const MENSAJE_LINK_NO_VALIDO = "El link no es válido o venció.";

/** Mensaje de la confirmación: el 409 es transitorio y el resto reusa `mensajeDeErrorPedido`. */
export function mensajeDeErrorConfirmacion(error: ApiError | null): string {
  if (error?.statusCode === 409) return MENSAJE_SIN_CICLO_ACTIVO;
  if (error?.statusCode === 429) return "Hiciste demasiados intentos. Esperá unos minutos y volvé a intentar.";
  if (error?.statusCode === 404) return MENSAJE_LINK_NO_VALIDO;
  return mensajeDeErrorPedido(error);
}

/**
 * `POST publico/c/:slug/pedido/confirmar` — la ÚNICA llamada que consume el token. Se dispara
 * desde un botón, nunca al cargar la página: un escáner de links que abre la URL no lo quema.
 */
export function useConfirmarPedido(
  slug: string,
): UseMutationResult<PedidoConfirmado, ApiError, string> {
  return useMutation<PedidoConfirmado, ApiError, string>({
    mutationFn: (token) =>
      apiFetch<PedidoConfirmado>(`${rutaPedido(slug)}/confirmar`, { method: "POST", json: { token } }),
  });
}
