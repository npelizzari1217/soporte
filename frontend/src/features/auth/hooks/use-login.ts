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
 * On success: hace una navegación de PÁGINA COMPLETA a `destinoPosLogin(?siguiente=)` —
 * `/` salvo que `siguiente` sea el landing `/pedido-qr` (allowlist, sdd/formulario-publico-qr
 * D3); el selector multi-cliente comparte el mismo `onSuccess` (`window.location`,
 * NO `router.push`). Un login es un cambio de identidad: con navegación cliente
 * el Router Cache de Next sirve el RSC de la sesión anterior y el
 * `SessionProvider` (que hidrata `user` una sola vez desde la cookie decodificada
 * server-side) queda con el usuario viejo → el menú/datos no se actualizan hasta
 * un F5. La recarga completa fuerza server-render fresco con la cookie nueva y
 * limpia TODA la caché cliente (Router Cache, React Query, SessionProvider).
 * El (dashboard) route group mapea a `/`, NO `/dashboard`.
 *
 * Errores como toasts, ver `mensajeDeErrorDeLogin`: 403 → tenant suspendido;
 * 5xx/red → problema de infraestructura, dicho como tal; el resto → mensaje
 * genérico e idéntico entre sí, sin enumeración de usuarios.
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
import { destinoPosLogin } from "@/shared/auth/destino-pos-login";
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

/**
 * Elige el toast de error del login según el `statusCode` de `ApiError`.
 *
 * **La anti-enumeración aplica al RESULTADO DE AUTENTICAR, no a todo fallo.**
 * Un 401 (contraseña equivocada) y un 404 (la cuenta no existe) tienen que
 * decir exactamente lo mismo: si difieren, el formulario se vuelve un oráculo
 * para averiguar qué cuentas existen. Por eso el mensaje genérico es el
 * DEFAULT y cubre todo el rango 4xx que no sea 403.
 *
 * Pero un 5xx o una caída de red NO son un resultado de autenticar — son
 * infraestructura, y no revelan absolutamente nada sobre la cuenta. Meterlos
 * en la misma bolsa no agregaba seguridad y sí mandaba al usuario a arreglar
 * lo que no estaba roto: re-tipear una contraseña correcta una y otra vez
 * mientras el backend estaba caído. Pasó de verdad durante la verificación en
 * el navegador de esta misma app.
 *
 * `statusCode: 0` es la normalización de un fallo de red de `apiFetch`
 * (`ApiError(0, "Error de red")`), no un status HTTP real.
 */
export function mensajeDeErrorDeLogin(statusCode: number): string {
  if (statusCode === 403) return "El acceso de tu organización está suspendido";
  if (statusCode === 0) return "No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.";
  if (statusCode >= 500) {
    return "Hubo un problema en el servidor. No son tus credenciales — probá de nuevo en unos minutos.";
  }
  return "Credenciales incorrectas. Intentá de nuevo.";
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
      const siguiente = new URLSearchParams(window.location.search).get("siguiente");
      window.location.assign(destinoPosLogin(siguiente));
    },

    onError: (err) => {
      toast.error(mensajeDeErrorDeLogin(err.statusCode));
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
