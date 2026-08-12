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
 * `POST /equipos/:id/componentes` devuelve el shape BÁSICO (`Componente`,
 * sin `tipoNombre`/`tipoActivo` — el use case de alta solo verifica
 * `activo`, no enriquece). Enriquecer el item para la cache local
 * (`["componentes", equipoId]`, tipada `ComponenteConTipo[]`) queda a cargo
 * del caller, que SÍ conoce el catálogo de tipos activos elegido en el
 * selector (`EquipoComponentesSection`).
 */
export function useAgregarComponente(equipoId: string) {
  return useMutation({
    mutationFn: (dto: CreateComponenteDto) =>
      apiFetch<Componente>(`equipos/${equipoId}/componentes`, { method: "POST", json: dto }),
    onSuccess: () => notifySuccess("Componente agregado."),
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
