"use client";

/**
 * usePermisosPorTipo — permisos por tipo de ticket de la sesión (odd/permisos-por-tipo-ticket,
 * S6, T6), de `GET /tickets/permisos-por-tipo`. Reemplaza a las celdas `TICKETS:*`/`EDILICIA:*` del
 * JWT en los gates de UI de tickets: el backend decide cada operación por la acción sobre el tipo
 * del ticket, y estas celdas ya no deciden nada. Ocultar un botón es comodidad, no control.
 *
 * - ROOT y ADMINISTRADOR no consultan: el backend nunca los restringe por tipo.
 * - La clave lleva cliente y usuario: un cambio de cliente (`TenantSwitcher`) o de identidad
 *   (login, con recarga completa) pide los permisos de nuevo, nunca reusa los de otra sesión.
 * - Los permisos que el layout ya leyó en el servidor hidratan la consulta, sin parpadeo.
 *
 * Mientras no hay datos (cargando o con error) toda acción da `false`: no se ofrece lo que no se
 * sabe si se puede.
 */
import { useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { SessionContext } from "@/shared/providers/session-provider";
import {
  PERMISOS_SIN_RESTRICCION,
  permisosPorTipoSchema,
  puedeEnAlgunTipo,
  puedeEnModulo,
  puedeEnTipo,
  tiposCon,
  type AccionTipoTicket,
  type PermisosPorTipo,
} from "@/shared/auth/permisos-por-tipo";

/** Lo que devuelve `usePermisosPorTipo`. */
export interface PermisosPorTipoSesion {
  /** Permisos de la sesión; `null` mientras no se conocen. */
  permisos: PermisosPorTipo | null;
  /** `true` mientras la primera lectura está en curso. */
  isPending: boolean;
  /** ¿Tiene `accion` sobre el tipo `tipoId`? */
  puedeEnTipo: (tipoId: string, accion: AccionTipoTicket) => boolean;
  /** ¿Tiene `accion` sobre algún tipo del módulo? */
  puedeEnModulo: (modulo: string, accion: AccionTipoTicket) => boolean;
  /** ¿Tiene `accion` sobre algún tipo, de cualquier módulo? */
  puedeEnAlgunTipo: (accion: AccionTipoTicket) => boolean;
  /** Los tipos del catálogo con `accion`, en el orden recibido. */
  tiposCon: <T extends { id: string }>(tipos: readonly T[], accion: AccionTipoTicket) => T[];
}

/**
 * Lee los permisos por tipo de la sesión y expone los predicados para los gates de UI.
 *
 * @returns Los permisos y sus predicados; todos dan `false` mientras no se conocen.
 */
export function usePermisosPorTipo(): PermisosPorTipoSesion {
  const { user, permisosPorTipoIniciales } = useContext(SessionContext);
  const sinRestriccion = !!user && (user.is_global_admin || user.rol === "ADMINISTRADOR");
  // Solo valen para el usuario con el que llegaron del servidor (ver `SessionProvider`).
  const iniciales =
    permisosPorTipoIniciales && permisosPorTipoIniciales.user === user
      ? permisosPorTipoIniciales.permisos
      : undefined;

  const query = useQuery({
    queryKey: ["sesion", "permisos-por-tipo", user?.cliente_id ?? null, user?.sub ?? null],
    queryFn: async () =>
      permisosPorTipoSchema.parse(await apiFetch<unknown>("tickets/permisos-por-tipo")),
    enabled: !!user && !sinRestriccion,
    initialData: iniciales,
  });

  const permisos: PermisosPorTipo | null = !user
    ? null
    : sinRestriccion
      ? PERMISOS_SIN_RESTRICCION
      : (query.data ?? null);

  return {
    permisos,
    isPending: !!user && !sinRestriccion && query.isPending,
    puedeEnTipo: (tipoId, accion) => puedeEnTipo(permisos, tipoId, accion),
    puedeEnModulo: (modulo, accion) => puedeEnModulo(permisos, modulo, accion),
    puedeEnAlgunTipo: (accion) => puedeEnAlgunTipo(permisos, accion),
    tiposCon: (tipos, accion) => tiposCon(permisos, tipos, accion),
  };
}
