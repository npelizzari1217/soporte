"use client";

/**
 * use-equipo-mutations — CONTAINER hooks para el CRUD de equipos + gestión
 * de componentes (T5.12-T5.15). Gate `equipo:gestionar` en todos los
 * endpoints de escritura (espejo exacto de `EquiposController`).
 * Componentes SIN `GET` de listado (gap de backend, ver `types.ts`) —
 * cache de sesión `["componentes", equipoId]`.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/shared/api/client";
import { ApiError } from "@/shared/api/types";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type {
  Componente,
  CreateComponenteDto,
  BajaEquipoDto,
  CreateEquipoDto,
  EditarComponenteDto,
  EditarEquipoDto,
  Equipo,
  RetirarComponenteDto,
} from "../types";

const MENSAJE_UNIDAD_NO_DISPONIBLE =
  "No se puede reactivar: la pieza de este componente ya no está disponible (se recuperó al depósito o tuvo otro movimiento). Agregá un componente nuevo eligiendo otra pieza.";

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
      notifySuccess("Equipo eliminado.");
    },
    onError: notifyError,
  });
}

/**
 * `POST /equipos/:id/baja`: baja del equipo completo (todo o nada). Devolver al
 * stock mueve saldos y movimientos de varios insumos, por eso invalida el
 * listado (todas sus variantes), el detalle y `["insumos"]`. Los errores (422
 * de piezas o de motivo, 409 de reintento) los muestra el diálogo, no un toast.
 */
export function useDarDeBajaEquipo(equipoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: BajaEquipoDto) => apiFetch<Equipo>(`equipos/${equipoId}/baja`, { method: "POST", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipos"] });
      queryClient.invalidateQueries({ queryKey: ["equipo", equipoId] });
      queryClient.invalidateQueries({ queryKey: ["insumos"] });
      notifySuccess("Equipo dado de baja.");
    },
    // 409 (el equipo cambió) y 422 (piezas, equipo ya dado de baja): el resumen y el detalle quedaron viejos.
    // Invalidar `["equipo", id]` refresca los dos; no se reintenta la baja sola.
    onError: (error) => {
      if (error instanceof ApiError && (error.statusCode === 409 || error.statusCode === 422)) {
        queryClient.invalidateQueries({ queryKey: ["equipo", equipoId] });
      }
    },
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
 * `POST /equipos/:id/componentes/:cid/baja`: retiro con destino (devolver al
 * stock como usado o descartar). Es baja LÓGICA: el componente sigue apareciendo
 * en el listado enriquecido (con su rótulo de destino), NO se saca de la lista.
 * Por eso no actualiza `["componentes", equipoId]` de forma optimista: invalida
 * `["equipo", equipoId]` para re-traer el detalle fresco — el `useEffect` de
 * `EquipoComponentesSection` sincroniza el cache local por props. Como la
 * devolución al stock mueve saldo, invalida además el stock y los movimientos
 * del repuesto. Mismo criterio de cache en `useEditarComponente`/`useReactivarComponente`.
 * El error (p. ej. el 422 de motivo faltante) lo muestra el diálogo, no un toast.
 */
export function useRetirarComponente(equipoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ componenteId, dto }: { componenteId: string; dto: RetirarComponenteDto }) =>
      apiFetch<Componente>(`equipos/${equipoId}/componentes/${componenteId}/baja`, { method: "POST", json: dto }),
    onSuccess: (componente) => {
      queryClient.invalidateQueries({ queryKey: ["equipo", equipoId] });
      queryClient.invalidateQueries({ queryKey: ["insumo", componente.insumoId, "stock"] });
      queryClient.invalidateQueries({ queryKey: ["insumo", componente.insumoId, "movimientos"] });
      notifySuccess("Componente dado de baja.");
    },
  });
}

/** Edita un componente ACTIVO (PATCH semántico). Ver nota de cache en `useRetirarComponente`. */
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

/** Reactiva un componente dado de baja (limpia `deletedAt`). Ver nota de cache en `useRetirarComponente`. */
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
    onError: (error) => {
      // El código del 422 no viaja en el cuerpo: se reconoce el mensaje del backend.
      if (error instanceof ApiError && /ya no está disponible para reinstalarla/.test(error.message)) {
        toast.error(MENSAJE_UNIDAD_NO_DISPONIBLE);
        return;
      }
      notifyError(error);
    },
  });
}
