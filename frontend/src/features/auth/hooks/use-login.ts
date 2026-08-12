"use client";

/**
 * use-login — CONTAINER hook for the login mutation.
 *
 * Calls the BFF POST /api/auth/login. Two-step flow for multi-membership
 * users (R4/R5):
 *   1. POST { email, password } → either `{ user }` (single membership,
 *      cookies set) or `{ needsClienteSelection: true, membresias }` (no
 *      cookies — the UI must re-post with a chosen `clienteId`).
 *   2. `selectCliente(clienteId)` re-posts `{ email, password, clienteId }`
 *      using the credentials captured from step 1.
 *
 * On success: hace una navegación de PÁGINA COMPLETA a `/` (`window.location`,
 * NO `router.push`). Un login es un cambio de identidad: con navegación cliente
 * el Router Cache de Next sirve el RSC de la sesión anterior y el
 * `SessionProvider` (que hidrata `user` una sola vez desde la cookie decodificada
 * server-side) queda con el usuario viejo → el menú/datos no se actualizan hasta
 * un F5. La recarga completa fuerza server-render fresco con la cookie nueva y
 * limpia TODA la caché cliente (Router Cache, React Query, SessionProvider).
 * El (dashboard) route group mapea a `/`, NO `/dashboard`.
 *
 * Errores como toasts (403 → tenant suspendido; otro → mensaje genérico, sin
 * enumeración de usuarios).
 *
 * Spec: [R23] BFF login route. Design: Container/Presentational pattern.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/shared/api/client";
import { ApiError } from "@/shared/api/types";
import type { JwtPayload } from "@/shared/api/types";
import { writeLastActivity } from "@/shared/auth/idle-storage";
import type { Membresia } from "../components/ClienteSelection";

interface LoginDto {
  email: string;
  password: string;
  clienteId?: string;
}

type LoginResponse =
  | { user: JwtPayload }
  | { needsClienteSelection: true; membresias: Membresia[] };

function isNeedsClienteSelection(
  result: LoginResponse,
): result is { needsClienteSelection: true; membresias: Membresia[] } {
  return "needsClienteSelection" in result && result.needsClienteSelection === true;
}

export function useLogin() {
  const [membresias, setMembresias] = useState<Membresia[] | null>(null);
  const [pendingCredentials, setPendingCredentials] = useState<{
    email: string;
    password: string;
  } | null>(null);

  const mutation = useMutation<LoginResponse, ApiError, LoginDto>({
    mutationFn: (dto) => apiFetch<LoginResponse>("auth/login", { method: "POST", json: dto }),

    onSuccess: (result, variables) => {
      if (isNeedsClienteSelection(result)) {
        setMembresias(result.membresias);
        setPendingCredentials({ email: variables.email, password: variables.password });
        return;
      }
      // Reset del reloj de inactividad: una sesión NUEVA arranca limpia. La
      // persistencia de `last-activity` está pensada para sobrevivir un F5 (no
      // dejar bypassear el idle-timeout recargando), NO un login nuevo — sin
      // esto, un timestamp añejo (>15min) de una sesión previa dispara el corte
      // inmediato apenas entrás y te rebota a /login.
      writeLastActivity(Date.now());
      // Navegación de página completa (ver JSDoc): resetea toda la caché cliente
      // para que el nuevo usuario no herede sesión/menú/datos del anterior.
      window.location.assign("/");
    },

    onError: (err) => {
      if (err.statusCode === 403) {
        toast.error("El acceso de tu organización está suspendido");
      } else {
        toast.error("Credenciales incorrectas. Intentá de nuevo.");
      }
    },
  });

  function login(email: string, password: string) {
    setMembresias(null);
    setPendingCredentials(null);
    mutation.mutate({ email, password });
  }

  function selectCliente(clienteId: string) {
    if (!pendingCredentials) return;
    mutation.mutate({ ...pendingCredentials, clienteId });
  }

  return {
    login,
    selectCliente,
    membresias,
    isPending: mutation.isPending,
  };
}
