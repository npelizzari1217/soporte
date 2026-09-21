"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import { validarLogoClienteCliente } from "../lib/validar-logo-cliente-cliente";
import type {
  Cliente,
  ClienteCorreo,
  ClienteLogoDto,
  ConfigurarCorreoDto,
  ConfigurarCsatDto,
  CreateClienteDto,
  UpdateClienteDto,
} from "../types";

export function useCrearCliente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateClienteDto) => apiFetch<Cliente>("clientes", { method: "POST", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      notifySuccess("Cliente creado.");
    },
    onError: notifyError,
  });
}

/** Edita datos comerciales de un cliente (`PATCH /clientes/:id`). Solo ROOT. */
export function useEditarCliente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateClienteDto }) =>
      apiFetch<Cliente>(`clientes/${id}`, { method: "PATCH", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      notifySuccess("Cliente actualizado.");
    },
    onError: notifyError,
  });
}

/** Baja lógica de un cliente (`PATCH /clientes/:id/desactivar`). La DB física NO se elimina. Solo ROOT. */
export function useDesactivarCliente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<Cliente>(`clientes/${id}/desactivar`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      notifySuccess("Cliente desactivado.");
    },
    onError: notifyError,
  });
}

/** Revierte la baja lógica de un cliente (`PATCH /clientes/:id/activar`). Solo ROOT. */
export function useActivarCliente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<Cliente>(`clientes/${id}/activar`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      notifySuccess("Cliente activado.");
    },
    onError: notifyError,
  });
}

/**
 * Configura (alta o edición) el correo SMTP de un cliente
 * (`PATCH /clientes/:id/correo`, D7). Solo ROOT. Invalida tanto el detalle
 * de correo (`["cliente-correo", id]`) como el listado (`["clientes"]`,
 * que trae el resumen `correo.configurado` usado en la tabla).
 */
export function useConfigurarCorreoCliente(clienteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: ConfigurarCorreoDto) =>
      apiFetch<ClienteCorreo>(`clientes/${clienteId}/correo`, { method: "PATCH", json: dto }),
    onSuccess: (data) => {
      queryClient.setQueryData(["cliente-correo", clienteId], data);
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      notifySuccess("Configuración de correo guardada.");
    },
    onError: notifyError,
  });
}

/**
 * Quita la configuración de correo de un cliente (`DELETE /clientes/:id/correo`,
 * D7). Acción EXPLÍCITA y separada de guardar — vaciar el campo de
 * contraseña en el form NUNCA dispara esto. Solo ROOT.
 */
export function useQuitarCorreoCliente(clienteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<ClienteCorreo>(`clientes/${clienteId}/correo`, { method: "DELETE" }),
    onSuccess: (data) => {
      queryClient.setQueryData(["cliente-correo", clienteId], data);
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      notifySuccess("Configuración de correo eliminada.");
    },
    onError: notifyError,
  });
}

/**
 * Prende/apaga la emisión de encuestas CSAT del cliente (`PATCH /clientes/:id/csat`,
 * sdd/csat WU10.2). Solo ROOT. A diferencia de correo, `csatHabilitado` viaja
 * en `Cliente` directo — no necesita invalidar un detalle aparte.
 */
export function useConfigurarCsatCliente(clienteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: ConfigurarCsatDto) =>
      apiFetch<Cliente>(`clientes/${clienteId}/csat`, { method: "PATCH", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      notifySuccess("Configuración de encuesta de satisfacción guardada.");
    },
    onError: notifyError,
  });
}

/**
 * Prueba la conexión SMTP con la config YA guardada
 * (`POST /clientes/:id/correo/probar`, D6/D7) — no la modifica, solo
 * persiste y devuelve el resultado saneado del handshake. Solo ROOT.
 */
export function useProbarCorreoCliente(clienteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<ClienteCorreo>(`clientes/${clienteId}/correo/probar`, { method: "POST" }),
    onSuccess: (data) => {
      queryClient.setQueryData(["cliente-correo", clienteId], data);
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      notifySuccess("Prueba de conexión ejecutada.");
    },
    onError: notifyError,
  });
}

/**
 * Sube o reemplaza el logo de un cliente (`POST /clientes/:id/logo`,
 * design.md D5/D8, sdd/logo-por-cliente WU4). Solo ROOT. Reusa el patrón
 * multipart de `useSubirAdjunto` (H3, tickets): `FormData` + `apiFetch` con
 * `body`, sin estrenar nada.
 *
 * Valida el archivo (`validarLogoClienteCliente`, espejo de
 * `validarLogoCliente` del backend) ANTES de armar el `FormData` — defensa
 * en profundidad DENTRO de la mutación. En el flujo normal el diálogo ya
 * deshabilita "Subir" con un archivo inválido; esto cubre cualquier otro
 * caller que invoque la mutación directo.
 *
 * El logo nuevo NO se ve en el sidebar de quien lo sube hasta su próximo
 * login/switch/refresh (design.md, pregunta abierta "Refresco inmediato") —
 * este hook no toca `SessionContext`.
 */
export function useSubirLogoCliente(clienteId: string) {
  const queryClient = useQueryClient();
  return useMutation<ClienteLogoDto, Error, File>({
    mutationFn: (file: File) => {
      const error = validarLogoClienteCliente(file);
      if (error) return Promise.reject(new Error(error));
      const formData = new FormData();
      formData.set("logo", file);
      return apiFetch<ClienteLogoDto>(`clientes/${clienteId}/logo`, { method: "POST", body: formData });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      notifySuccess("Logo actualizado. Los usuarios lo verán en su próximo inicio de sesión.");
    },
    onError: notifyError,
  });
}

/**
 * Quita el logo de un cliente (`DELETE /clientes/:id/logo`). Idempotente
 * (spec, regla 11): responde 204 exista o no un logo previo. Solo ROOT.
 */
export function useQuitarLogoCliente(clienteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>(`clientes/${clienteId}/logo`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      notifySuccess("Logo eliminado.");
    },
    onError: notifyError,
  });
}
