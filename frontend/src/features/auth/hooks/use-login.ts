"use client";

/**
 * use-login — CONTAINER hook for the login mutation.
 *
 * Calls the BFF POST /api/auth/login. Máquina de pasos (`paso`):
 *   credenciales → codigo (2FA activo) | enrolamiento (2FA obligatorio) → codigos (recuperación, una vez)
 *                → seleccion (varias membresías) → sesión.
 *   1. POST { email, password } → `{ user }` (cookies, listo) | `{ needs2fa, desafio }` | `{ needsEnrolamiento2fa, desafio }` | `{ needsClienteSelection,
 *      membresias, ticket }`.
 *   2. `verificarCodigo` → POST 2fa/verificar `{ desafio, codigo }` → `{ ticket }` y de
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
 * Login con proveedor externo (SSO): el callback del BFF deja a la persona en `/login?sso=1`. Al
 * montar, un efecto llama UNA vez a `POST /api/auth/sso/paso` (guarda `useRef`: StrictMode corre
 * los efectos dos veces y la segunda lectura da 404 porque la cookie ya se consumió). `ticket`
 * sigue por `continuarMutation`; los desafíos 2FA, por `alResponder`. Un fallo muestra el mensaje
 * genérico único. Después `history.replaceState` quita `sso` y conserva `siguiente`.
 *
 * Errores como toasts, ver `mensajeDeErrorDeLogin`: 403 → tenant suspendido;
 * 5xx/red → problema de infraestructura, dicho como tal; el resto → mensaje
 * genérico e idéntico entre sí, sin enumeración de usuarios.
 *
 * Spec: [R23] BFF login route. Design: Container/Presentational pattern.
 */

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/shared/api/client";
import { ApiError } from "@/shared/api/types";
import type { JwtPayload } from "@/shared/api/types";
import { writeLastActivity } from "@/shared/auth/idle-storage";
import { destinoPosLogin } from "@/shared/auth/destino-pos-login";
import { MENSAJE_SSO_ERROR } from "../components/AvisoMotivo";
import type { Membresia } from "../components/ClienteSelection";

interface LoginDto {
  email: string;
  password: string;
}

interface VerificarDto {
  desafio: string;
  codigo: string;
}

interface SeleccionarDto {
  ticket: string;
  clienteId: string;
}

type Seleccion = { needsClienteSelection: true; membresias: Membresia[]; ticket: string };

interface ConfirmarEnrolamientoDto {
  desafio: string;
  codigo: string;
}

interface DatosEnrolamiento {
  otpauthUri: string;
  claveManual: string;
}

/** El desafío o el ticket ya no sirven: el servidor los rechazó (401) en un paso que los consume. */
type Vencido = { vencido: true };

/** Duración del desafío VERIFICAR (design D2): pasado ese plazo un rechazo es un vencimiento. */
const DESAFIO_VERIFICAR_MS = 5 * 60_000;

/** Duración del desafío ENROLAR (design D2): 15 minutos para escanear el QR y confirmar. */
const DESAFIO_ENROLAR_MS = 15 * 60_000;

export const MENSAJE_VENCIDO = "La verificación venció. Volvé a iniciar sesión.";

type Respuesta =
  | Vencido
  | { user: JwtPayload }
  | { needs2fa: true; desafio: string }
  | { needsEnrolamiento2fa: true; desafio: string }
  | Seleccion;

/** Lo que entrega `POST /api/auth/sso/paso` (una sola vez) tras volver del proveedor externo. */
type PasoSso = Extract<Respuesta, { needs2fa: true } | { needsEnrolamiento2fa: true }> | { ticket: string };

export type PasoLogin =
  | { paso: "credenciales" }
  | { paso: "codigo"; desafio: string; emitidoAt: number }
  | { paso: "enrolamiento"; desafio: string; datos: DatosEnrolamiento | null; emitidoAt: number }
  | { paso: "codigos"; codigos: string[]; ticket: string }
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
    if ("vencido" in result) {
      toast.error(MENSAJE_VENCIDO);
      setFase({ paso: "credenciales" });
      return;
    }
    if ("needs2fa" in result) {
      setFase({
        paso: "codigo",
        desafio: result.desafio,
        emitidoAt: Date.now(),
      });
      return;
    }
    if ("needsEnrolamiento2fa" in result) {
      setFase({ paso: "enrolamiento", desafio: result.desafio, datos: null, emitidoAt: Date.now() });
      iniciarMutation.mutate(result.desafio);
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

  const pasoSsoLeido = useRef(false);

  const alFallar = (err: ApiError) => {
    toast.error(mensajeDeErrorDeLogin(err.statusCode));
  };

  /** Un 401 del paso que consume el ticket significa ticket muerto; el resto sube como error. */
  async function continuar(ticket: string): Promise<Respuesta> {
    try {
      return await apiFetch<Respuesta>("auth/login/continuar", { method: "POST", json: { ticket } });
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) return { vencido: true };
      throw err;
    }
  }

  const iniciarMutation = useMutation<DatosEnrolamiento, ApiError, string>({
    mutationFn: (desafio) =>
      apiFetch<DatosEnrolamiento>("auth/2fa/enrolamiento/iniciar", { method: "POST", json: { desafio } }),
    onSuccess: (datos) => setFase((f) => (f.paso === "enrolamiento" ? { ...f, datos } : f)),
    onError: (err) => {
      if (err.statusCode === 401) alResponder({ vencido: true });
      else alFallar(err);
    },
  });

  const confirmarMutation = useMutation<{ codigosRecuperacion: string[]; ticket: string }, ApiError, ConfirmarEnrolamientoDto>({
    mutationFn: (dto) =>
      apiFetch<{ codigosRecuperacion: string[]; ticket: string }>("auth/2fa/enrolamiento/confirmar", {
        method: "POST",
        json: dto,
      }),
    onSuccess: (r) => setFase({ paso: "codigos", codigos: r.codigosRecuperacion, ticket: r.ticket }),
    onError: (err) => {
      // Como en verificar: pasado el plazo del desafío ENROLAR, un rechazo es un vencimiento.
      if (err.statusCode === 401 && fase.paso === "enrolamiento" && Date.now() - fase.emitidoAt > DESAFIO_ENROLAR_MS) {
        alResponder({ vencido: true });
        return;
      }
      toast.error(
        err.statusCode === 0 || err.statusCode >= 500
          ? mensajeDeErrorDeLogin(err.statusCode)
          : "Código incorrecto. Intentá de nuevo.",
      );
    },
  });

  const continuarMutation = useMutation<Respuesta, ApiError, string>({
    mutationFn: continuar,
    onSuccess: alResponder,
    onError: alFallar,
  });

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
      return continuar(ticket);
    },
    onSuccess: alResponder,
    onError: (err) => {
      // Un rechazo pasado el plazo del desafío es un vencimiento, no un código equivocado.
      if (err.statusCode === 401 && fase.paso === "codigo" && Date.now() - fase.emitidoAt > DESAFIO_VERIFICAR_MS) {
        alResponder({ vencido: true });
        return;
      }
      // Un código equivocado dice lo mismo que cualquier rechazo del segundo paso.
      toast.error(
        err.statusCode === 0 || err.statusCode >= 500
          ? mensajeDeErrorDeLogin(err.statusCode)
          : "Código incorrecto. Intentá de nuevo.",
      );
    },
  });

  const seleccionarMutation = useMutation<Respuesta, ApiError, SeleccionarDto>({
    mutationFn: async (dto) => {
      try {
        return await apiFetch<Respuesta>("auth/login/seleccionar", { method: "POST", json: dto });
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 401) return { vencido: true };
        throw err;
      }
    },
    onSuccess: alResponder,
    onError: alFallar,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("sso") !== "1" || pasoSsoLeido.current) return;
    pasoSsoLeido.current = true;

    void (async () => {
      let resultado: PasoSso | null = null;
      try {
        resultado = await apiFetch<PasoSso>("auth/sso/paso", { method: "POST" });
      } catch {
        toast.error(MENSAJE_SSO_ERROR);
      }
      params.delete("sso");
      const query = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : ""));
      if (resultado === null) return;
      if ("ticket" in resultado) continuarMutation.mutate(resultado.ticket);
      else alResponder(resultado);
    })();
    // Solo al montar: la guarda impide releer la cookie de un solo uso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function login(email: string, password: string) {
    setFase({ paso: "credenciales" });
    loginMutation.mutate({ email, password });
  }

  function verificarCodigo(codigo: string) {
    if (fase.paso !== "codigo") return;
    verificarMutation.mutate({ desafio: fase.desafio, codigo });
  }

  function selectCliente(clienteId: string) {
    if (fase.paso !== "seleccion") return;
    seleccionarMutation.mutate({ ticket: fase.ticket, clienteId });
  }

  function confirmarEnrolamiento(codigo: string) {
    if (fase.paso !== "enrolamiento") return;
    confirmarMutation.mutate({ desafio: fase.desafio, codigo });
  }

  function continuarTrasCodigos() {
    if (fase.paso !== "codigos") return;
    continuarMutation.mutate(fase.ticket);
  }

  /** Descarta desafío y ticket y vuelve a pedir credenciales. */
  function volver() {
    setFase({ paso: "credenciales" });
  }

  return {
    login,
    volver,
    confirmarEnrolamiento,
    continuarTrasCodigos,
    datosEnrolamiento: fase.paso === "enrolamiento" ? fase.datos : null,
    codigosRecuperacion: fase.paso === "codigos" ? fase.codigos : null,
    verificarCodigo,
    selectCliente,
    paso: fase.paso,
    membresias: fase.paso === "seleccion" ? fase.membresias : null,
    isPending:
      loginMutation.isPending ||
      verificarMutation.isPending ||
      seleccionarMutation.isPending ||
      confirmarMutation.isPending ||
      continuarMutation.isPending,
  };
}
