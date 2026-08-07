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
 * On success: navigates to `/` (the (dashboard) route group maps to `/`, NOT
 * `/dashboard`). Errors surface as sonner toasts (403 → tenant suspended,
 * anything else → generic message, no user enumeration).
 *
 * Spec: [R23] BFF login route. Design: Container/Presentational pattern.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/shared/api/client";
import { ApiError } from "@/shared/api/types";
import type { JwtPayload } from "@/shared/api/types";
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
  const router = useRouter();
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
      router.push("/");
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
