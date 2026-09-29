"use client";

/**
 * use-equipo-mutations — CONTAINER hooks para el CRUD de equipos + gestión
 * de componentes (T5.12-T5.15). Gate `equipo:gestionar` en todos los
 * endpoints de escritura (espejo exacto de `EquiposController`).
 * Componentes SIN `GET` de listado (gap de backend, ver `types.ts`) —
 * cache de sesión `["componentes", equipoId]`.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type {
  Componente,
  CreateComponenteDto,
  CreateEquipoDto,
  EditarComponenteDto,
  EditarEquipoDto,
  Equipo,
} from "../types";

export function useCrearEquipo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateEquipoDto) => apiFetch<Equipo>("equipos", { method: "POST", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipos"] });
      notifySuccess("Equipo creado.");
    },
    onError: notifyError,
  });
}

export function useEditarEquipo(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: EditarEquipoDto) => apiFetch<Equipo>(`equipos/${id}`, { method: "PATCH", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipos"] });
      queryClient.invalidateQueries({ queryKey: ["equipo", id] });
      notifySuccess("Equipo actualizado.");
    },
    onError: notifyError,
  });
}

export function useEliminarEquipo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`equipos/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipos"] });
      notifySuccess("Equipo dado de baja.");
    },
    onError: notifyError,
  });
}

/**
 * `POST /equipos/:id/componentes` (endpoint único de alta): crea el componente
 * vinculado a un repuesto y, con `descontarStock`, descuenta 1 unidad del
 * depósito en la misma transacción del backend. Invalida `["equipo", equipoId]`
 * para re-traer el detalle fresco y, como el alta puede mover stock, las
 * mismas claves que un movimiento de insumo (`useRegistrarMovimientoInsumo`):
 * stock y movimientos del repuesto, más el listado `["insumos"]` del que
 * cuelgan las secciones Insumos y Repuestos. Se invalida siempre, también con
 * `descontarStock: false`: es más barato que decidir acá cuándo hubo movimiento.
 */
export function useAgregarComponente(equipoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateComponenteDto) =>
      apiFetch<Componente>(`equipos/${equipoId}/componentes`, { method: "POST", json: dto }),
    onSuccess: (_componente, dto) => {
      queryClient.invalidateQueries({ queryKey: ["equipo", equipoId] });
      queryClient.invalidateQueries({ queryKey: ["insumo", dto.insumoId, "stock"] });
      queryClient.invalidateQueries({ queryKey: ["insumo", dto.insumoId, "movimientos"] });
      queryClient.invalidateQueries({ queryKey: ["insumos"] });
      notifySuccess("Componente agregado.");
    },
    onError: notifyError,
  });
}

/**
 * `DELETE` es baja LÓGICA (soft delete) — el componente sigue apareciendo en
 * el listado enriquecido (tachado, con "Reactivar"), NO se saca de la
 * lista. Por eso ya no actualiza `["componentes", equipoId]` de forma
 * optimista (eso lo sacaría de la vista): invalida `["equipo", equipoId]`
 * para re-traer el detalle fresco (que ya incluye activos + dados de
 * baja) — el `useEffect` de `EquipoComponentesSection` sincroniza el cache
 * local por props. Mismo criterio en `useEditarComponente`/`useReactivarComponente`.
 */
export function useEliminarComponente(equipoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (componenteId: string) =>
      apiFetch<void>(`equipos/${equipoId}/componentes/${componenteId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipo", equipoId] });
      notifySuccess("Componente dado de baja.");
    },
    onError: notifyError,
  });
}

/** Edita un componente ACTIVO (PATCH semántico). Ver nota de cache en `useEliminarComponente`. */
export function useEditarComponente(equipoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ componenteId, dto }: { componenteId: string; dto: EditarComponenteDto }) =>
      apiFetch<Componente>(`equipos/${equipoId}/componentes/${componenteId}`, {
        method: "PATCH",
        json: dto,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipo", equipoId] });
      notifySuccess("Componente actualizado.");
    },
    onError: notifyError,
  });
}

/** Reactiva un componente dado de baja (limpia `deletedAt`). Ver nota de cache en `useEliminarComponente`. */
export function useReactivarComponente(equipoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (componenteId: string) =>
      apiFetch<Componente>(`equipos/${equipoId}/componentes/${componenteId}/reactivar`, {
        method: "PATCH",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipo", equipoId] });
      notifySuccess("Componente reactivado.");
    },
    onError: notifyError,
  });
}
