"use client";

/**
 * use-solicitar-reset — CONTAINER hook para `POST /auth/forgot-password`
 * (proxy genérico — ADR-8, sin ruta dedicada: no toca cookies).
 *
 * Anti-enumeración (Req 1, Req 14): el backend responde 204 SIEMPRE. Éxito y
 * cualquier rechazo que no sea infraestructura (429, red, 5xx) muestran el
 * MISMO mensaje genérico. Un 400/429 nunca dispara el refresh de sesión ni
 * una redirección a `/login`: `apiFetch` solo reacciona al 401.
 *
 * Spec: sdd/reseteo-contrasena-olvidada, Requirement "La solicitud de reset
 * devuelve una respuesta uniforme". Design ADR-8, "Hooks".
 */
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { ApiError } from "@/shared/api/types";

interface SolicitarResetDto {
  email: string;
}

/** Mensaje genérico tras la solicitud — el mismo exista o no el email. */
export const MENSAJE_SOLICITUD_RESET =
  "Si el email existe en nuestro sistema, vas a recibir un link para restablecer tu contraseña.";

/**
 * Solo 429 (límite propio) y la infraestructura (red, 5xx) se distinguen del
 * mensaje genérico — mismo criterio que `mensajeDeErrorDeLogin`
 * (`use-login.ts`). Cualquier otro código, incluido un 400 inesperado,
 * conserva el genérico a propósito.
 */
export function mensajeDeSolicitudReset(error: ApiError | null): string {
  if (!error) return MENSAJE_SOLICITUD_RESET;
  if (error.statusCode === 429) return "Hiciste demasiados pedidos. Esperá unos minutos y volvé a intentar.";
  if (error.statusCode === 0) return "No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.";
  if (error.statusCode >= 500) return "Hubo un problema en el servidor. Probá de nuevo en unos minutos.";
  return MENSAJE_SOLICITUD_RESET;
}

/**
 * [S3] `true` para 429/red/5xx: son fallas de infraestructura, no un
 * resultado de la solicitud en sí — la UI mantiene el formulario visible
 * para reintentar, mismo criterio que `errorDeRestablecerPassword`
 * (`use-restablecer-password.ts`).
 */
export function esErrorTransitorioSolicitud(error: ApiError | null): boolean {
  if (!error) return false;
  return error.statusCode === 429 || error.statusCode === 0 || error.statusCode >= 500;
}

export function useSolicitarReset() {
  const mutation = useMutation<void, ApiError, SolicitarResetDto>({
    mutationFn: (dto) => apiFetch<void>("auth/forgot-password", { method: "POST", json: dto }),
  });

  const terminado = mutation.isSuccess || mutation.isError;

  return {
    solicitar: (email: string) => mutation.mutate({ email }),
    isPending: mutation.isPending,
    /** `null` mientras no se envió nada todavía. */
    mensaje: terminado ? mensajeDeSolicitudReset(mutation.error) : null,
    /** [S3] `true` solo ante 429/red/5xx — el resultado real sigue oculto. */
    esTransitorio: esErrorTransitorioSolicitud(mutation.error),
  };
}
