"use client";

/**
 * use-planes-preventivo-mutations — CONTAINER hooks para el alta, la edición y
 * la baja de planes (WU-7.1, WU-3). Gates `PREVENTIVO:ALTAS|MODIFICACION|BORRADO`
 * en el backend (espejo exacto de `PreventivoController`, WU-4).
 */
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { CreatePlanPreventivoDto, EditarPlanPreventivoDto, PlanPreventivo } from "../types";

/**
 * `PATCH /preventivo/planes/:id` (gate `PREVENTIVO:MODIFICACION`). PATCH
 * semántico: `undefined` = no tocar (`EditarPlanPreventivoDto`, ver `types.ts`).
 * Invalida el listado en `onSuccess` — necesario incluso cuando la edición NO
 * tocó la cadencia, porque cualquier otro campo editado (título, objetivo,
 * responsable, activo) también vive del mismo listado cacheado
 * (`usePlanPreventivo`, WU-4: no hay `GET /preventivo/planes/:id`).
 *
 * La respuesta del PATCH puede traer `proximaEjecucionEn` desactualizada
 * cuando la edición cambió la cadencia (`EditarPlanUseCase` persiste el
 * puntero por el repositorio y devuelve la MISMA entidad sin mutar,
 * `editar-plan.use-case.ts:85-103`) — defecto real adyacente, fuera de
 * alcance de este change (ver "Fuera de alcance" en `tasks.md`). Por eso la
 * fecha autoritativa NUNCA sale de acá: el detalle la relee del listado
 * invalidado (ADR-7), que es la única lectura confiable.
 *
 * @param id - Id del plan a editar.
 * @returns La mutación; se invoca con el DTO de edición (`EditarPlanPreventivoDto`).
 */
export function useEditarPlanPreventivo(id: string): UseMutationResult<PlanPreventivo, Error, EditarPlanPreventivoDto> {
  const queryClient = useQueryClient();
  // Generics explícitos — mismo motivo que `useCrearPlanPreventivo`.
  return useMutation<PlanPreventivo, Error, EditarPlanPreventivoDto>({
    mutationFn: (dto: EditarPlanPreventivoDto) =>
      apiFetch<PlanPreventivo>(`preventivo/planes/${id}`, { method: "PATCH", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["preventivo", "planes"] });
      notifySuccess("Plan de mantenimiento preventivo actualizado.");
    },
    onError: notifyError,
  });
}

/**
 * `POST /preventivo/planes` (gate `PREVENTIVO:ALTAS`). Invalida el listado al crear.
 *
 * @returns La mutación; se invoca con el DTO de alta (`CreatePlanPreventivoDto`).
 */
export function useCrearPlanPreventivo(): UseMutationResult<PlanPreventivo, Error, CreatePlanPreventivoDto> {
  const queryClient = useQueryClient();
  // Generics explícitos: sin esto, TS infiere `TError` desde el parámetro de
  // `onError: notifyError` (tipado `unknown`) en vez del default de TanStack
  // Query (`Error`), y el `useMutation({...})` resultante deja de ser
  // asignable al tipo de retorno declarado arriba.
  return useMutation<PlanPreventivo, Error, CreatePlanPreventivoDto>({
    mutationFn: (dto: CreatePlanPreventivoDto) =>
      apiFetch<PlanPreventivo>("preventivo/planes", { method: "POST", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["preventivo", "planes"] });
      notifySuccess("Plan de mantenimiento preventivo creado.");
    },
    onError: notifyError,
  });
}

/**
 * `DELETE /preventivo/planes/:id` (gate `PREVENTIVO:BORRADO`) — soft delete
 * (`activo=false` + `deletedAt`, WU-4), no borrado físico. Invalida el
 * listado al confirmar.
 *
 * @returns La mutación; se invoca con el `id` del plan.
 */
export function useDarDeBajaPlanPreventivo(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  // Generics explícitos — mismo motivo que `useCrearPlanPreventivo`.
  return useMutation<void, Error, string>({
    mutationFn: (id: string) => apiFetch<void>(`preventivo/planes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["preventivo", "planes"] });
      notifySuccess("Plan dado de baja.");
    },
    onError: notifyError,
  });
}
