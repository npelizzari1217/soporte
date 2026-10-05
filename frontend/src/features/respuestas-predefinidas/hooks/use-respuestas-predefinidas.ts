"use client";

/**
 * useRespuestasPredefinidas — CONTAINER hook para `GET /respuestas-predefinidas`. SIN gate de
 * permiso: cualquier autenticado del tenant lo lee.
 *
 * `soloActivas` separa los dos consumidores: el selector "Insertar respuesta" del comentario
 * pide solo las activas (`?activas=true`); el ABM de Catálogos pide todas para poder
 * reactivar. La clave lleva el flag, y las mutaciones invalidan por el prefijo
 * `["respuestas-predefinidas"]` para refrescar ambas.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { RespuestaPredefinida } from "../types";

/** El catálogo cambia con poca frecuencia (admin CRUD) — staleTime más largo que el default. */
const RESPUESTAS_STALE_TIME = 5 * 60_000;

export function useRespuestasPredefinidas(soloActivas = false) {
  return useQuery({
    queryKey: ["respuestas-predefinidas", { soloActivas }],
    queryFn: () =>
      apiFetch<RespuestaPredefinida[]>(soloActivas ? "respuestas-predefinidas?activas=true" : "respuestas-predefinidas"),
    staleTime: RESPUESTAS_STALE_TIME,
  });
}
