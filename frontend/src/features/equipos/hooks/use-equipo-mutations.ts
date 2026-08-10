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
  ComponenteConTipo,
  CreateComponenteDto,
  CreateEquipoDto,
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

export function useEliminarComponente(equipoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (componenteId: string) =>
      apiFetch<void>(`equipos/${equipoId}/componentes/${componenteId}`, { method: "DELETE" }),
    onSuccess: (_data, componenteId) => {
      queryClient.setQueryData<ComponenteConTipo[]>(["componentes", equipoId], (old = []) =>
        old.filter((c) => c.id !== componenteId),
      );
      notifySuccess("Componente eliminado.");
    },
    onError: notifyError,
  });
}
