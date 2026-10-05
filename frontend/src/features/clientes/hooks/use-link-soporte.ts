"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/shared/api/client";

/** Espejo de `GET /clientes/actual/link-soporte`: `url` es `null` si el cliente no tiene link vigente. */
export const linkSoporteSchema = z.object({ url: z.string().nullable() });
export type LinkSoporte = z.infer<typeof linkSoporteSchema>;

/**
 * `GET /clientes/actual/link-soporte` — link genérico del formulario público del cliente de la
 * sesión (sin equipo). Lo ve cualquier usuario del cliente, sin permiso adicional. La clave
 * incluye el cliente: al cambiar de tenant no se reusa el link del anterior. Sin cliente en la
 * sesión (ROOT fuera de un cliente) no se pide nada.
 */
export function useLinkSoporte(clienteId: string | null) {
  return useQuery({
    queryKey: ["link-soporte", clienteId],
    queryFn: async (): Promise<LinkSoporte> =>
      linkSoporteSchema.parse(await apiFetch<unknown>("clientes/actual/link-soporte")),
    staleTime: 60_000,
    enabled: clienteId !== null,
  });
}
