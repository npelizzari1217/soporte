"use client";

/**
 * use-login — CONTAINER hook for the login mutation.
 *
 * Calls the BFF POST /api/auth/login. Máquina de pasos (`paso`):
 *   credenciales → codigo (2FA activo) | enrolamiento (2FA obligatorio, UI en WU-11b)
 *                → seleccion (varias membresías) → sesión.
 *   1. POST { email, password } → `{ user }` (cookies, listo) | `{ needs2fa, desafio,
 *      recordarDisponible }` | `{ needsEnrolamiento2fa, desafio }` | `{ needsClienteSelection,
 *      membresias, ticket }`.
 *   2. `verificarCodigo` → POST 2fa/verificar `{ desafio, codigo, recordar }` → `{ ticket }` y de
 *      inmediato POST login/continuar `{ ticket }` → sesión o selección.
 *   3. `selectCliente` → POST login/seleccionar `{ ticket, clienteId }`.
 * La contraseña NO se guarda: solo viven en memoria el `desafio` y el `ticket`.
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
}

interface VerificarDto {
  desafio: string;
  codigo: string;
  recordar: boolean;
}

interface SeleccionarDto {
  ticket: string;
  clienteId: string;
}

type Seleccion = { needsClienteSelection: true; membresias: Membresia[]; ticket: string };

type Respuesta =
  | { user: JwtPayload }
  | { needs2fa: true; desafio: string; recordarDisponible?: boolean }
  | { needsEnrolamiento2fa: true; desafio: string }
  | Seleccion;

export type PasoLogin =
  | { paso: "credenciales" }
  | { paso: "codigo"; desafio: string; recordarDisponible: boolean }
  | { paso: "enrolamiento"; desafio: string }
  | { paso: "seleccion"; membresias: Membresia[]; ticket: string };

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
  const [fase, setFase] = useState<PasoLogin>({ paso: "credenciales" });

  function alResponder(result: Respuesta) {
    if ("needs2fa" in result) {
      setFase({
        paso: "codigo",
        desafio: result.desafio,
        recordarDisponible: result.recordarDisponible !== false,
      });
      return;
    }
    if ("needsEnrolamiento2fa" in result) {
      setFase({ paso: "enrolamiento", desafio: result.desafio });
      return;
    }
    if ("needsClienteSelection" in result) {
      setFase({ paso: "seleccion", membresias: result.membresias, ticket: result.ticket });
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
  }

  const alFallar = (err: ApiError) => {
    toast.error(mensajeDeErrorDeLogin(err.statusCode));
  };

  const loginMutation = useMutation<Respuesta, ApiError, LoginDto>({
    mutationFn: (dto) => apiFetch<Respuesta>("auth/login", { method: "POST", json: dto }),
    onSuccess: alResponder,
    onError: alFallar,
  });

  const verificarMutation = useMutation<Respuesta, ApiError, VerificarDto>({
    mutationFn: async (dto) => {
      const { ticket } = await apiFetch<{ ticket: string }>("auth/2fa/verificar", {
        method: "POST",
        json: dto,
      });
      return apiFetch<Respuesta>("auth/login/continuar", { method: "POST", json: { ticket } });
    },
    onSuccess: alResponder,
    onError: (err) => {
      // Un código equivocado dice lo mismo que cualquier rechazo del segundo paso.
      toast.error(
        err.statusCode === 0 || err.statusCode >= 500
          ? mensajeDeErrorDeLogin(err.statusCode)
          : "Código incorrecto. Intentá de nuevo.",
      );
    },
  });

  const seleccionarMutation = useMutation<Respuesta, ApiError, SeleccionarDto>({
    mutationFn: (dto) => apiFetch<Respuesta>("auth/login/seleccionar", { method: "POST", json: dto }),
    onSuccess: alResponder,
    onError: alFallar,
  });

  function login(email: string, password: string) {
    setFase({ paso: "credenciales" });
    loginMutation.mutate({ email, password });
  }

  function verificarCodigo(codigo: string, recordar: boolean) {
    if (fase.paso !== "codigo") return;
    verificarMutation.mutate({ desafio: fase.desafio, codigo, recordar });
  }

  function selectCliente(clienteId: string) {
    if (fase.paso !== "seleccion") return;
    seleccionarMutation.mutate({ ticket: fase.ticket, clienteId });
  }

  return {
    login,
    verificarCodigo,
    selectCliente,
    paso: fase.paso,
    membresias: fase.paso === "seleccion" ? fase.membresias : null,
    recordarDisponible: fase.paso === "codigo" ? fase.recordarDisponible : false,
    isPending:
      loginMutation.isPending || verificarMutation.isPending || seleccionarMutation.isPending,
  };
}
