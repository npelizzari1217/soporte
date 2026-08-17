"use client";

/**
 * use-compra-mutations — CONTAINER hooks para los 10 comandos de
 * `ComprasController` (backend `compras.controller.ts`, PR-21). Nace acá
 * (PR-26/27) porque ambos PRs mutan `ItemCompra`/`Compra` y comparten el
 * mismo criterio de invalidación de cache.
 *
 * **`numero`/`solicitanteId`/`cicloId` NUNCA viajan en ningún body** (mismo
 * criterio que `types.ts`/`schemas.ts`, PR-23): los payloads de este archivo
 * son EXACTAMENTE los `*Dto` de `../types`, que ya excluyen esos tres campos
 * por diseño — no se agregan acá.
 *
 * Invalidación (mismo criterio que `use-ticket-mutations.ts`, ADR-2): toda
 * mutación sobre una compra existente puede cambiar tres cosas a la vez —
 * el detalle (`["compra", id]`, S35 agrega 1 operación por mutación), la
 * bitácora (`["compra-operaciones", id]`, mismo query key que
 * `useOperacionesCompra` de PR-25) y el listado (`["compras"]`, porque
 * `estado`/`comprado`/`cerrado`/`totalesPorMoneda` de la fila son derivados
 * que pueden cambiar con cualquier mutación de ítem). Por eso
 * `invalidateCompraQueries` invalida las tres SIEMPRE — más simple y más
 * seguro que decidir caso por caso cuál de las tres cambió, y evita el
 * riesgo de un bug de "invalidación insuficiente" (dato stale silencioso).
 * `useCrearCompra` es la única excepción: no existe compra previa, así que
 * solo invalida `["compras"]`.
 *
 * Errores → toast sonner vía `notifyError` (ADR-8, mismo criterio que el
 * resto de los hooks de mutación del repo): `ApiError.messages` trae el/los
 * mensaje(s) de dominio reales del backend (422/404/409) — nunca un "algo
 * salió mal" genérico. El caller no repite el manejo de error.
 */
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type {
  AgregarItemCompraDto,
  CancelarCompraDto,
  CerrarItemConFaltanteDto,
  CompraDetalle,
  CrearCompraDto,
  EditarFechaEtapaDto,
  EditarItemCompraDto,
  ItemCompra,
  RegistrarOrdenDeItemDto,
  RegistrarRecepcionDeItemDto,
  RegistrarEntregaDeItemDto,
} from "../types";

/** Invalida detalle + bitácora + listado de UNA compra (ver docblock del archivo). */
function invalidateCompraQueries(queryClient: QueryClient, compraId: string): void {
  queryClient.invalidateQueries({ queryKey: ["compra", compraId] });
  queryClient.invalidateQueries({ queryKey: ["compra-operaciones", compraId] });
  queryClient.invalidateQueries({ queryKey: ["compras"] });
}

/** `POST /compras` (§4.1, S1/S2). Solo invalida el listado — no hay detalle/bitácora previos de una compra nueva. */
export function useCrearCompra() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CrearCompraDto) => apiFetch<CompraDetalle>("compras", { method: "POST", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compras"] });
      notifySuccess("Compra creada.");
    },
    onError: notifyError,
  });
}

/** `POST /compras/:id/items` (§4.2, S4/S5). Devuelve la `CompraDetalle` completa (el ítem nace y la cabecera puede recalcular, T2). */
export function useAgregarItemCompra(compraId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: AgregarItemCompraDto) =>
      apiFetch<CompraDetalle>(`compras/${compraId}/items`, { method: "POST", json: dto }),
    onSuccess: () => {
      invalidateCompraQueries(queryClient, compraId);
      notifySuccess("Ítem agregado.");
    },
    onError: notifyError,
  });
}

/** `PATCH /compras/:id/items/:itemId` (§4.2/§4.4, S12-S14). PATCH semántico — `undefined` no toca el campo. */
export function useEditarItemCompra(compraId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, dto }: { itemId: string; dto: EditarItemCompraDto }) =>
      apiFetch<ItemCompra>(`compras/${compraId}/items/${itemId}`, { method: "PATCH", json: dto }),
    onSuccess: () => {
      invalidateCompraQueries(queryClient, compraId);
      notifySuccess("Ítem actualizado.");
    },
    onError: notifyError,
  });
}

/** `DELETE /compras/:id/items/:itemId` (§4.2, S6/S7). Baja lógica — 204 sin body. */
export function useEliminarItemCompra(compraId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => apiFetch<void>(`compras/${compraId}/items/${itemId}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateCompraQueries(queryClient, compraId);
      notifySuccess("Ítem eliminado.");
    },
    onError: notifyError,
  });
}

/** `POST .../aprobar` (§4.3, S8/S10/S11). Requiere `COMPRAS:APROBACION` (gateo en el caller, ver componentes). */
export function useAprobarItemCompra(compraId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      apiFetch<ItemCompra>(`compras/${compraId}/items/${itemId}/aprobar`, { method: "POST" }),
    onSuccess: () => {
      invalidateCompraQueries(queryClient, compraId);
      notifySuccess("Ítem aprobado.");
    },
    onError: notifyError,
  });
}

/** `POST .../rechazar` (§4.3, S9/S10/S11). Mismo criterio que `useAprobarItemCompra`. */
export function useRechazarItemCompra(compraId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      apiFetch<ItemCompra>(`compras/${compraId}/items/${itemId}/rechazar`, { method: "POST" }),
    onSuccess: () => {
      invalidateCompraQueries(queryClient, compraId);
      notifySuccess("Ítem rechazado.");
    },
    onError: notifyError,
  });
}

/** `POST .../registrar-orden` (R1, S42/S45-S47) — PRIMERA de las tres etapas. `cantidadOrdenada` es ACUMULADO, no delta. */
export function useRegistrarOrdenDeItem(compraId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, dto }: { itemId: string; dto: RegistrarOrdenDeItemDto }) =>
      apiFetch<ItemCompra>(`compras/${compraId}/items/${itemId}/registrar-orden`, {
        method: "POST",
        json: dto,
      }),
    onSuccess: () => {
      invalidateCompraQueries(queryClient, compraId);
      notifySuccess("Orden registrada.");
    },
    onError: notifyError,
  });
}

/**
 * `POST .../registrar-recepcion` (R1, S42-S43/S46) — SEGUNDA de las tres
 * etapas. **Rename de ruta** (WU-26): reemplaza a `useRegistrarCompraDeItem`
 * / `registrar-compra`. `cantidadRecibida` es ACUMULADO, no delta.
 */
export function useRegistrarRecepcionDeItem(compraId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, dto }: { itemId: string; dto: RegistrarRecepcionDeItemDto }) =>
      apiFetch<ItemCompra>(`compras/${compraId}/items/${itemId}/registrar-recepcion`, {
        method: "POST",
        json: dto,
      }),
    onSuccess: () => {
      invalidateCompraQueries(queryClient, compraId);
      notifySuccess("Recepción registrada.");
    },
    onError: notifyError,
  });
}

/** `POST .../registrar-entrega` (R1, S42/S44/S46) — TERCERA etapa. `cantidadEntregada` es ACUMULADO, no delta. */
export function useRegistrarEntregaDeItem(compraId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, dto }: { itemId: string; dto: RegistrarEntregaDeItemDto }) =>
      apiFetch<ItemCompra>(`compras/${compraId}/items/${itemId}/registrar-entrega`, {
        method: "POST",
        json: dto,
      }),
    onSuccess: () => {
      invalidateCompraQueries(queryClient, compraId);
      notifySuccess("Entrega registrada.");
    },
    onError: notifyError,
  });
}

/** `PATCH .../fecha-etapa` (R4/S55) — edita la fecha de una etapa ya registrada, independiente de su cantidad. */
export function useEditarFechaEtapaDeItem(compraId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, dto }: { itemId: string; dto: EditarFechaEtapaDto }) =>
      apiFetch<ItemCompra>(`compras/${compraId}/items/${itemId}/fecha-etapa`, {
        method: "PATCH",
        json: dto,
      }),
    onSuccess: () => {
      invalidateCompraQueries(queryClient, compraId);
      notifySuccess("Fecha actualizada.");
    },
    onError: notifyError,
  });
}

/** `POST .../cerrar-con-faltante` (§4.7, S22-S25). Estado TERMINAL del ítem — irreversible. */
export function useCerrarItemConFaltante(compraId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, dto }: { itemId: string; dto: CerrarItemConFaltanteDto }) =>
      apiFetch<ItemCompra>(`compras/${compraId}/items/${itemId}/cerrar-con-faltante`, {
        method: "POST",
        json: dto,
      }),
    onSuccess: () => {
      invalidateCompraQueries(queryClient, compraId);
      notifySuccess("Ítem cerrado con faltante.");
    },
    onError: notifyError,
  });
}

/** `POST /compras/:id/cancelar` (§4.8, S27-S31). Irreversible — el caller debe confirmar (`ConfirmDialog`/motivo). */
export function useCancelarCompra(compraId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CancelarCompraDto) =>
      apiFetch<CompraDetalle>(`compras/${compraId}/cancelar`, { method: "POST", json: dto }),
    onSuccess: () => {
      invalidateCompraQueries(queryClient, compraId);
      notifySuccess("Compra cancelada.");
    },
    onError: notifyError,
  });
}
