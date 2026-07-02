"use client";

/**
 * useReportes — orquesta las 4 agregaciones read-only de la pantalla Reportes.
 *
 * Usa `useQueries` (TanStack Query) para emitir los 4 `GET /reportes/*` en paralelo,
 * cada uno con su propio `data`/`isLoading`/`isError`/`refetch` — el fallo de UN
 * reporte NO afecta a los otros 3 (arquitectura "4 secciones independientes con
 * error boundaries individuales", design T6.8). Esto es el equivalente semántico de
 * `Promise.allSettled` (fetch paralelo, sin fallo en cascada) pero reusando el motor
 * de queries que ya gobierna el resto del módulo admin, en vez de reimplementar a
 * mano el manejo de loading/error/retry que TanStack Query ya resuelve.
 *
 * cicloId viene de TenantContext (ciclo activo por defecto, o el seleccionado
 * manualmente). X-Tenant-Id SOLO se envía si isGlobalAdmin && clienteId — mismo
 * criterio de seguridad de transporte que useCiclos (design ADR-3): un
 * ADMINISTRADOR nunca debe enviar el header, ni siquiera con su propio tenant.
 *
 * Spec: [SPEC:admin-ui/Pantalla Reportes]; [SPEC:reportes] (todos los requirements)
 * Design: ADR-3 (TenantContext + X-Tenant-Id), ADR-4 (servicio de reportes)
 */

import { useContext } from "react";
import { useQueries } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { queryKeys } from "@/shared/api/query-keys";
import { useSession } from "@/shared/hooks/use-session";
import { TenantContext } from "@/shared/providers/tenant-context";
import type {
  TicketsPorUsuarioReporte,
  TipoConTickets,
  EstadoConTickets,
  TiempoResolucionReporte,
} from "../types";

/** Agrega `?cicloId=` a la ruta solo cuando hay un ciclo resuelto en TenantContext. */
function withCicloId(path: string, cicloId: string | null): string {
  return cicloId ? `${path}?cicloId=${encodeURIComponent(cicloId)}` : path;
}

export function useReportes() {
  const { clienteId, cicloId } = useContext(TenantContext);
  const { isGlobalAdmin } = useSession();

  const headers = isGlobalAdmin && clienteId ? { "X-Tenant-Id": clienteId } : undefined;
  const enabled = !isGlobalAdmin || Boolean(clienteId);

  const [porUsuario, porTipo, porEstado, tiempoResolucion] = useQueries({
    queries: [
      {
        queryKey: queryKeys.admin.reportes.porUsuario(cicloId),
        queryFn: () =>
          apiFetch<TicketsPorUsuarioReporte>(withCicloId("reportes/tickets-por-usuario", cicloId), {
            headers,
          }),
        enabled,
      },
      {
        queryKey: queryKeys.admin.reportes.porTipo(cicloId),
        queryFn: () =>
          apiFetch<TipoConTickets[]>(withCicloId("reportes/tickets-por-tipo", cicloId), { headers }),
        enabled,
      },
      {
        queryKey: queryKeys.admin.reportes.porEstado(cicloId),
        queryFn: () =>
          apiFetch<EstadoConTickets[]>(withCicloId("reportes/tickets-por-estado", cicloId), {
            headers,
          }),
        enabled,
      },
      {
        queryKey: queryKeys.admin.reportes.tiempoResolucion(cicloId),
        queryFn: () =>
          apiFetch<TiempoResolucionReporte>(withCicloId("reportes/tiempo-resolucion", cicloId), {
            headers,
          }),
        enabled,
      },
    ],
  });

  return { porUsuario, porTipo, porEstado, tiempoResolucion };
}
