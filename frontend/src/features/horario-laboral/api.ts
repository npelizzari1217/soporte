/**
 * Funciones de acceso a datos de la feature `horario-laboral` — capa
 * `Remote` (skill `data-access`: SPA, nunca accede directo a DB). Envuelven
 * `apiFetch` (`@/shared/api/client`) para el único recurso HTTP del
 * dominio: `/horario-laboral` (tenant, lectura abierta, escritura
 * `esAdminCliente`, D9/D10 design.md).
 *
 * Funciones planas, sin `useQuery`/`useMutation` — mismo criterio que
 * `features/feriados/api.ts`: los hooks de React Query (WU-7 hooks) llaman
 * a estas funciones en vez de repetir `apiFetch` inline.
 */
import { apiFetch } from "@/shared/api/client";
import type { HorarioLaboral, HorarioLaboralDto } from "./types";

export function obtenerHorarioLaboral(): Promise<HorarioLaboral> {
  return apiFetch<HorarioLaboral>("horario-laboral");
}

export function guardarHorarioLaboral(dto: HorarioLaboralDto): Promise<HorarioLaboral> {
  return apiFetch<HorarioLaboral>("horario-laboral", { method: "PUT", json: dto });
}
