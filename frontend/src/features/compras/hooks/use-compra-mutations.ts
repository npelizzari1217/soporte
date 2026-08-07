"use client";

/**
 * use-compra-mutations — CONTAINER hooks para las mutaciones de Compras
 * (T5.2-T5.6). Items/presupuestos NO tienen `GET` de listado (gap de
 * backend, ver `types.ts`) — se acumulan en un cache de sesión propio
 * (`["compra-items", id]` / `["compra-presupuestos", id]`) vía
 * `setQueryData`, poblado por la respuesta de cada mutación exitosa.
 *
 * Invariante "un solo presupuesto seleccionado" (ADR-7 backend, swap
 * atómico): al seleccionar un presupuesto, el cache local desmarca
 * `seleccionado` en todos los demás — refleja en el cliente lo que el
 * backend ya garantiza en la base.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type {
  CreateItemCompraDto,
  CreatePresupuestoDto,
  CrearTicketCompraDto,
  ItemCompra,
  Presupuesto,
  RechazarCompraDto,
  TicketCompra,
} from "../types";

export function useCrearCompra() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CrearTicketCompraDto) => apiFetch<TicketCompra>("compras", { method: "POST", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compras"] });
      notifySuccess("Ticket de compra creado.");
    },
    onError: notifyError,
  });
}

export function useAgregarItemCompra(compraId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateItemCompraDto) =>
      apiFetch<ItemCompra>(`compras/${compraId}/items`, { method: "POST", json: dto }),
    onSuccess: (item) => {
      queryClient.setQueryData<ItemCompra[]>(["compra-items", compraId], (old = []) => [...old, item]);
      notifySuccess("Ítem agregado.");
    },
    onError: notifyError,
  });
}

export function useEliminarItemCompra(compraId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      apiFetch<void>(`compras/${compraId}/items/${itemId}`, { method: "DELETE" }),
    onSuccess: (_data, itemId) => {
      queryClient.setQueryData<ItemCompra[]>(["compra-items", compraId], (old = []) =>
        old.filter((i) => i.id !== itemId),
      );
      notifySuccess("Ítem eliminado.");
    },
    onError: notifyError,
  });
}

export function useAgregarPresupuesto(compraId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreatePresupuestoDto) =>
      apiFetch<Presupuesto>(`compras/${compraId}/presupuestos`, { method: "POST", json: dto }),
    onSuccess: (presupuesto) => {
      queryClient.setQueryData<Presupuesto[]>(["compra-presupuestos", compraId], (old = []) => [
        ...old,
        presupuesto,
      ]);
      notifySuccess("Presupuesto agregado.");
    },
    onError: notifyError,
  });
}

export function useSeleccionarPresupuesto(compraId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (presupuestoId: string) =>
      apiFetch<Presupuesto>(`compras/${compraId}/presupuestos/${presupuestoId}/seleccionar`, {
        method: "POST",
      }),
    onSuccess: (seleccionado) => {
      queryClient.setQueryData<Presupuesto[]>(["compra-presupuestos", compraId], (old = []) =>
        old.map((p) => (p.id === seleccionado.id ? seleccionado : { ...p, seleccionado: false })),
      );
      notifySuccess("Presupuesto seleccionado.");
    },
    onError: notifyError,
  });
}

export function useAdjuntarPresupuesto(compraId: string, presupuestoId: string) {
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.set("archivo", file);
      return apiFetch(`compras/${compraId}/presupuestos/${presupuestoId}/adjuntos`, {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: () => notifySuccess("Adjunto subido."),
    onError: notifyError,
  });
}

/** `:id` = id del `Ticket` BASE (ver header de `compras.dto.ts`). */
export function useAprobarCompra() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) => apiFetch<TicketCompra>(`compras/${ticketId}/aprobar`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compras"] });
      notifySuccess("Compra aprobada.");
    },
    onError: notifyError,
  });
}

export function useRechazarCompra() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, dto }: { ticketId: string; dto: RechazarCompraDto }) =>
      apiFetch<TicketCompra>(`compras/${ticketId}/rechazar`, { method: "POST", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compras"] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      notifySuccess("Compra rechazada.");
    },
    onError: notifyError,
  });
}
