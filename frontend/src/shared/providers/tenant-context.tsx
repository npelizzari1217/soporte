"use client";

/**
 * TenantContext — provee { clienteId, clienteNombre, cicloId, cicloNombre } al dashboard.
 *
 * Inicialización según rol (leído desde useSession):
 * - Operador (is_global_admin: true): clienteId/cicloId = null hasta que elige un cliente
 *   (estado "Elegí un cliente" — admin-ui). NUNCA se auto-selecciona un tenant.
 * - Usuario regular (ADMINISTRADOR/USUARIO/etc.): clienteId = user.cliente_id del JWT.
 *   cicloId se resuelve automáticamente al ciclo activo del tenant propio.
 *
 * X-Tenant-Id: SOLO se envía cuando isGlobalAdmin === true y hay un clienteId
 * seleccionado. El backend (TenantGuard) responde 403 a cualquier no-operador que
 * envíe el header, así que enviarlo condicionalmente a isGlobalAdmin es obligatorio,
 * no solo una optimización (design ADR-3).
 *
 * setCliente(...) actualiza clienteId/clienteNombre y, vía el efecto de abajo, dispara
 * un re-fetch del ciclo activo del nuevo cliente (cascade descrito en admin-ui spec:
 * "Cambio de selector de Cliente actualiza el selector de Ciclo").
 * setCiclo(...) solo actualiza el ciclo seleccionado manualmente — no dispara fetch.
 *
 * Spec: [SPEC:admin-ui/TenantContext provee cliente + ciclo al dashboard completo]
 * Design: ADR-3 (admin-general)
 */

import { createContext, useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/shared/api/client";
import { useSession } from "@/shared/hooks/use-session";

export interface TenantContextValue {
  clienteId: string | null;
  clienteNombre: string | null;
  cicloId: string | null;
  cicloNombre: string | null;
  setCliente: (clienteId: string | null, clienteNombre: string | null) => void;
  setCiclo: (cicloId: string | null, cicloNombre: string | null) => void;
}

const defaultValue: TenantContextValue = {
  clienteId: null,
  clienteNombre: null,
  cicloId: null,
  cicloNombre: null,
  setCliente: () => {},
  setCiclo: () => {},
};

export const TenantContext = createContext<TenantContextValue>(defaultValue);

/** Shape mínima de GET /ciclos usada para resolver el ciclo activo por defecto. */
interface CicloApiItem {
  id: string;
  nombre: string;
  activo: boolean;
}

interface TenantContextProviderProps {
  children: React.ReactNode;
}

export function TenantContextProvider({ children }: TenantContextProviderProps) {
  const { user, isGlobalAdmin } = useSession();

  const [clienteId, setClienteId] = useState<string | null>(
    isGlobalAdmin ? null : (user?.cliente_id ?? null),
  );
  const [clienteNombre, setClienteNombre] = useState<string | null>(
    isGlobalAdmin ? null : (user?.cliente_nombre ?? null),
  );
  const [cicloId, setCicloId] = useState<string | null>(null);
  const [cicloNombre, setCicloNombre] = useState<string | null>(null);

  // Resuelve el ciclo activo del tenant resuelto cada vez que clienteId cambia.
  // Operador sin cliente seleccionado: no hay tenant que resolver, no fetch.
  useEffect(() => {
    if (isGlobalAdmin && !clienteId) {
      setCicloId(null);
      setCicloNombre(null);
      return;
    }

    let cancelled = false;

    async function fetchCicloActivo() {
      try {
        const headers =
          isGlobalAdmin && clienteId ? { "X-Tenant-Id": clienteId } : undefined;
        const ciclos = await apiFetch<CicloApiItem[]>("ciclos", { headers });
        if (cancelled) return;
        const activo = ciclos.find((c) => c.activo);
        setCicloId(activo?.id ?? null);
        setCicloNombre(activo?.nombre ?? null);
      } catch {
        if (cancelled) return;
        setCicloId(null);
        setCicloNombre(null);
      }
    }

    fetchCicloActivo();

    return () => {
      cancelled = true;
    };
  }, [clienteId, isGlobalAdmin]);

  const setCliente = useCallback(
    (id: string | null, nombre: string | null) => {
      setClienteId(id);
      setClienteNombre(nombre);
    },
    [],
  );

  const setCiclo = useCallback((id: string | null, nombre: string | null) => {
    setCicloId(id);
    setCicloNombre(nombre);
  }, []);

  return (
    <TenantContext.Provider
      value={{ clienteId, clienteNombre, cicloId, cicloNombre, setCliente, setCiclo }}
    >
      {children}
    </TenantContext.Provider>
  );
}
