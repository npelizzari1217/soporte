"use client";

/**
 * use-restablecer-password — CONTAINER hook para `POST /auth/reset-password`
 * (proxy genérico `/api/reset-password` — ADR-8, sin ruta dedicada: no toca
 * cookies). Body `{ token, passwordNueva }`, mismos nombres que
 * `ConfirmarResetDto`; `repetirPassword` es solo del cliente y nunca viaja.
 *
 * Un 400 (vencido/usado/revocado/inexistente — Req 6) siempre da el MISMO
 * mensaje, con `mostrarLinkSolicitud` para que la UI (WU-10) ofrezca volver a
 * `/olvide-password`. Un 400/429 nunca dispara el refresh de sesión ni una
 * redirección a `/login`: `apiFetch` solo reacciona al 401, y esta ruta es
 * pública (sin `JwtAuthGuard`).
 *
 * Spec: sdd/reseteo-contrasena-olvidada, Requirement "Confirmar con un token
 * inválido responde igual sin importar la causa". Design ADR-8, "Hooks".
 */
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { ApiError } from "@/shared/api/types";

interface ConfirmarResetDto {
  token: string;
  passwordNueva: string;
}

export interface ErrorRestablecerPassword {
  mensaje: string;
  mostrarLinkSolicitud: boolean;
}

/** Elige el mensaje a mostrar tras `POST /auth/reset-password` fallido. */
export function errorDeRestablecerPassword(error: ApiError): ErrorRestablecerPassword {
  if (error.statusCode === 400) {
    return { mensaje: "El link no es válido o venció.", mostrarLinkSolicitud: true };
  }
  if (error.statusCode === 429) {
    return { mensaje: "Hiciste demasiados intentos. Esperá unos minutos y volvé a intentar.", mostrarLinkSolicitud: false };
  }
  if (error.statusCode === 0) {
    return { mensaje: "No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.", mostrarLinkSolicitud: false };
  }
  if (error.statusCode >= 500) {
    return { mensaje: "Hubo un problema en el servidor. Probá de nuevo en unos minutos.", mostrarLinkSolicitud: false };
  }
  return { mensaje: "No pudimos completar la operación. Intentá de nuevo.", mostrarLinkSolicitud: false };
}

export function useRestablecerPassword() {
  const mutation = useMutation<void, ApiError, ConfirmarResetDto>({
    mutationFn: (dto) => apiFetch<void>("auth/reset-password", { method: "POST", json: dto }),
  });

  return {
    restablecer: (token: string, passwordNueva: string) => mutation.mutate({ token, passwordNueva }),
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    error: mutation.error ? errorDeRestablecerPassword(mutation.error) : null,
  };
}
