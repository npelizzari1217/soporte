"use client";

/**
 * use-kb-articulo — CONTAINER hook para `GET /kb/:id` (R-M3 / T3.1). Sin
 * `ticket:ver_todos`, el backend devuelve 404 si el artículo no está
 * publicado (K3, no revela existencia) — el front no re-filtra, solo
 * propaga el error a `KbDetailView`/`KbArticleEditDialog`.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { KbArticulo } from "../types";

export function useKbArticulo(id: string) {
  return useQuery({
    queryKey: ["kb", id],
    queryFn: () => apiFetch<KbArticulo>(`kb/${id}`),
    enabled: !!id,
  });
}
