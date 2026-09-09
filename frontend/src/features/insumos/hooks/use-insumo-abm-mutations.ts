"use client";

/**
 * use-insumo-abm-mutations — CONTAINER hooks para el ABM del insumo del
 * catálogo: crear (`POST /insumos`), editar (`PATCH /insumos/:id`) y
 * activar/desactivar (`PATCH /insumos/:id/estado`), los tres gateados por
 * `AdminClienteGuard` en el backend (`InsumosController`). Mismo patrón que
 * `use-familia-insumo-mutations.ts`/`use-unidad-medida-mutations.ts`.
 *
 * Nombre DISTINTO de `use-insumo-mutations.ts` a propósito: ese archivo ya
 * existe y es la BITÁCORA de movimientos (entrada/salida/ajuste,
 * `POST /insumos/:insumoId/movimientos/*`, gates `INSUMOS:ALTAS`/`AJUSTAR`)
 * — comparte el prefijo del nombre pero es un dominio de escritura
 * completamente distinto del ABM del catálogo.
 *
 * `codigosAlternativos`/`compatibilidad` NUNCA viajan en el body de
 * `crear`/`editar`: quedan fuera del scope de esta entrega (se gestionan
 * desde la ficha en una entrega posterior) y `CreateInsumoDto`/`EditInsumoDto`
 * (`types.ts`) ni siquiera declaran esos dos campos — no hay forma de que se
 * cuelen. Es la decisión de fondo de esta entrega: el backend trata "ausente"
 * como "lista vacía" para las dos, así que omitirlas nunca vacía nada que el
 * usuario no haya pedido vaciar; mandar `[]` en cambio SÍ reemplazaría
 * cualquier compatibilidad ya cargada por otro lado.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { CambiarEstadoActivoInsumoDto, CreateInsumoDto, EditInsumoDto, Insumo } from "../types";

export function useCrearInsumo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateInsumoDto) => apiFetch<Insumo>("insumos", { method: "POST", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insumos"] });
      notifySuccess("Insumo creado.");
    },
    onError: notifyError,
  });
}

export function useEditarInsumo(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: EditInsumoDto) => apiFetch<Insumo>(`insumos/${id}`, { method: "PATCH", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insumos"] });
      notifySuccess("Insumo actualizado.");
    },
    onError: notifyError,
  });
}

export function useCambiarEstadoActivoInsumo(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CambiarEstadoActivoInsumoDto) =>
      apiFetch<Insumo>(`insumos/${id}/estado`, { method: "PATCH", json: dto }),
    onSuccess: (insumo) => {
      queryClient.invalidateQueries({ queryKey: ["insumos"] });
      notifySuccess(insumo.activo ? "Insumo habilitado." : "Insumo deshabilitado.");
    },
    onError: notifyError,
  });
}
