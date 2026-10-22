"use client";

/**
 * use-permisos-por-tipo-usuario — CONTAINER hooks de la sección "Tipos de ticket" de Permisos
 * (odd/permisos-por-tipo-ticket, T7, S5): leer, reemplazar y copiar las filas (tipo, acción) de un
 * usuario del tenant del actor. Las tres rutas devuelven el mismo estado completo, así que las
 * mutaciones lo escriben directo en la caché y la grilla se resiembra con lo guardado.
 *
 * El usuario editado ve los cambios en su próximo request: el backend los lee por request, no del
 * JWT.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import { ACCIONES_TIPO_TICKET, type AccionTipoTicket } from "@/shared/auth/permisos-por-tipo";

/**
 * Espejo de la respuesta de `GET/PUT /usuarios/:id/permisos-por-tipo`. Una acción desconocida
 * invalida la respuesta entera: la grilla no adivina qué concede un código que no conoce.
 */
export const permisosPorTipoUsuarioSchema = z.object({
  /** ROOT o ADMINISTRADOR: operan todos los tipos y no tienen filas editables. */
  sinRestriccion: z.boolean(),
  rolCodigo: z.string(),
  tipos: z.array(
    z.object({
      tipoId: z.string(),
      nombre: z.string(),
      modulo: z.string(),
      activo: z.boolean(),
      acciones: z.array(z.enum(ACCIONES_TIPO_TICKET)),
      /** Lo que la plantilla del rol da sobre el tipo; `null` si el rol no tiene plantilla. */
      plantilla: z.array(z.enum(ACCIONES_TIPO_TICKET)).nullable(),
    }),
  ),
});

/** Permisos por tipo de un usuario, tal como los edita el administrador. */
export type PermisosPorTipoUsuario = z.infer<typeof permisosPorTipoUsuarioSchema>;

/** Acciones pedidas para un tipo en el reemplazo total. */
export interface FilaPermisosPorTipo {
  tipoId: string;
  acciones: AccionTipoTicket[];
}

/**
 * Clave de caché de los permisos por tipo de un usuario. La exporta para que otra escritura que
 * también los reescribe ("Reaplicar plantilla del rol") pueda invalidarla.
 *
 * @param usuarioId Usuario editado.
 * @returns La clave de la query.
 */
export const clavePermisosPorTipoUsuario = (usuarioId: string) =>
  ["usuario-permisos-por-tipo", usuarioId] as const;

const claveDe = clavePermisosPorTipoUsuario;

/**
 * `GET /usuarios/:id/permisos-por-tipo`. Se activa al abrir el diálogo de permisos. Va con
 * `staleTime: 0` a propósito, contra los 30 s por defecto de `QueryProvider`: la grilla se monta
 * en cada apertura y tiene que pedir el estado vigente, no el que quedó en caché de la anterior.
 *
 * @param usuarioId Usuario editado.
 * @param enabled `true` mientras el diálogo está abierto.
 * @returns La query con las filas del usuario.
 */
export function usePermisosPorTipoUsuario(usuarioId: string, enabled: boolean) {
  return useQuery({
    queryKey: claveDe(usuarioId),
    queryFn: async () =>
      permisosPorTipoUsuarioSchema.parse(
        await apiFetch<unknown>(`usuarios/${usuarioId}/permisos-por-tipo`),
      ),
    enabled,
    staleTime: 0,
  });
}

/**
 * `PUT /usuarios/:id/permisos-por-tipo` — reemplazo TOTAL: un tipo ausente queda sin acciones.
 *
 * @param usuarioId Usuario editado.
 * @returns La mutación; recibe las filas de todos los tipos.
 */
export function useReemplazarPermisosPorTipo(usuarioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tipos: FilaPermisosPorTipo[]) =>
      permisosPorTipoUsuarioSchema.parse(
        await apiFetch<unknown>(`usuarios/${usuarioId}/permisos-por-tipo`, {
          method: "PUT",
          json: { tipos },
        }),
      ),
    onSuccess: (guardado) => {
      queryClient.setQueryData(claveDe(usuarioId), guardado);
      notifySuccess("Permisos por tipo actualizados.");
    },
    onError: notifyError,
  });
}

/**
 * `POST /usuarios/:id/permisos-por-tipo/copiar-de/:origenId` — reemplaza todas las filas del
 * usuario por las del usuario de origen. Persiste de inmediato: quien llama confirma antes.
 *
 * @param usuarioId Usuario editado.
 * @returns La mutación; recibe el id del usuario de origen.
 */
export function useCopiarPermisosPorTipo(usuarioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (origenId: string) =>
      permisosPorTipoUsuarioSchema.parse(
        await apiFetch<unknown>(`usuarios/${usuarioId}/permisos-por-tipo/copiar-de/${origenId}`, {
          method: "POST",
        }),
      ),
    onSuccess: (guardado) => {
      queryClient.setQueryData(claveDe(usuarioId), guardado);
      notifySuccess("Permisos copiados.");
    },
    onError: notifyError,
  });
}
