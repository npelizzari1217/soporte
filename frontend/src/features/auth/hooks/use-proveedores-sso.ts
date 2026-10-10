"use client";

/**
 * use-proveedores-sso — CONTAINER hook para `GET /auth/sso/proveedores` (SC3).
 *
 * Devuelve los proveedores habilitados para pintar los botones de la pantalla de login (SC4).
 * Si la consulta falla o la forma no es la esperada, la lista queda vacía: el formulario de
 * contraseña sigue funcionando sin botones de SSO.
 *
 * Spec: sdd/login-sso — SC3, SC4.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { proveedoresSsoSchema, type SlugSso } from "../schemas";

export function useProveedoresSso(): { proveedores: SlugSso[] } {
  const { data } = useQuery({
    queryKey: ["auth", "sso", "proveedores"],
    queryFn: async () => proveedoresSsoSchema.parse(await apiFetch<unknown>("auth/sso/proveedores")).proveedores,
    staleTime: 60_000,
    retry: false,
  });
  return { proveedores: data ?? [] };
}
