"use client";

/**
 * use-login — CONTAINER hook for the login mutation.
 *
 * Calls the BFF POST /api/auth/login endpoint via apiFetch.
 * Maps API errors to user-friendly messages:
 *   - 403: specific tenant-suspended message
 *   - other: generic message (no user enumeration)
 * On success: navigates to / (the dashboard home — the (dashboard) route group
 * maps to /, NOT /dashboard, which would 404). Middleware also lands authed users on /.
 *
 * Design: Container/Presentational — all mutation logic lives here, not in LoginForm.
 * Spec: [SPEC:frontend-auth/login-exitoso], [SPEC:frontend-auth/creds-invalidas],
 *        [SPEC:frontend-auth/tenant-inactivo]
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/shared/api/client";
import { ApiError } from "@/shared/api/types";
import type { JwtPayload } from "@/shared/api/types";

interface LoginDto {
  email: string;
  password: string;
}

interface LoginResult {
  user: JwtPayload;
}

export function useLogin() {
  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mutation = useMutation<LoginResult, ApiError, LoginDto>({
    mutationFn: (dto) =>
      apiFetch<LoginResult>("auth/login", { method: "POST", json: dto }),

    onMutate: () => {
      // Clear previous error before each attempt
      setErrorMsg(null);
    },

    onSuccess: () => {
      router.push("/");
    },

    onError: (err) => {
      if (err.statusCode === 403) {
        // Tenant suspended — specific, non-enumerable message
        setErrorMsg("El acceso de tu organización está suspendido");
      } else {
        // Generic message — do NOT reveal whether email exists
        setErrorMsg("Credenciales incorrectas. Intentá de nuevo.");
      }
    },
  });

  function login(email: string, password: string) {
    mutation.mutate({ email, password });
  }

  return {
    login,
    isPending: mutation.isPending,
    error: errorMsg,
  };
}
