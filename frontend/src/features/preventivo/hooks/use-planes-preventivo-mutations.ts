"use client";

/**
 * use-planes-preventivo-mutations — CONTAINER hooks para el alta y la baja de
 * planes (WU-7.1). Gates `PREVENTIVO:ALTAS|BORRADO` en el backend (espejo
 * exacto de `PreventivoController`, WU-4). El backend también expone
 * `PATCH` bajo `PREVENTIVO:MODIFICACION`, pero este WU no construye la
 * pantalla de edición — ver hallazgo de revisión #10 (código muerto sacado:
 * el hook de editar no tenía consumidor en el frontend).
 */
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { CreatePlanPreventivoDto, PlanPreventivo } from "../types";

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
