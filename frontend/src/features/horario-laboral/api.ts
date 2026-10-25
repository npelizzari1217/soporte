/**
 * Funciones de acceso a datos de la feature `horario-laboral` — capa
 * `Remote` (skill `data-access`: SPA, nunca accede directo a DB). Envuelven
 * `apiFetch` (`@/shared/api/client`) para los dos recursos HTTP del
 * dominio: `/horario-laboral` (tenant, lectura abierta, escritura
 * `esAdminCliente`, D9/D10 design.md) y `/horario-laboral/usuarios/:usuarioId`
 * (horario propio de un técnico, mismas reglas de acceso,
 * odd/tasks/tiempo-tecnico.md T1).
 *
 * Funciones planas, sin `useQuery`/`useMutation` — mismo criterio que
 * `features/feriados/api.ts`: los hooks de React Query (WU-7 hooks) llaman
 * a estas funciones en vez de repetir `apiFetch` inline.
 */
import { apiFetch } from "@/shared/api/client";
import type { HorarioLaboral, HorarioLaboralDto, HorarioLaboralUsuario } from "./types";

export function obtenerHorarioLaboral(): Promise<HorarioLaboral> {
  return apiFetch<HorarioLaboral>("horario-laboral");
}

export function guardarHorarioLaboral(dto: HorarioLaboralDto): Promise<HorarioLaboral> {
  return apiFetch<HorarioLaboral>("horario-laboral", { method: "PUT", json: dto });
}

function rutaUsuario(usuarioId: string): string {
  return `horario-laboral/usuarios/${encodeURIComponent(usuarioId)}`;
}

/** Horario del técnico: el propio, o el del cliente si no tiene (`origen`). */
export function obtenerHorarioLaboralUsuario(usuarioId: string): Promise<HorarioLaboralUsuario> {
  return apiFetch<HorarioLaboralUsuario>(rutaUsuario(usuarioId));
}

/** Reemplaza las 7 filas del horario propio del técnico; responde con `origen: "USUARIO"`. */
export function guardarHorarioLaboralUsuario(
  usuarioId: string,
  dto: HorarioLaboralDto,
): Promise<HorarioLaboralUsuario> {
  return apiFetch<HorarioLaboralUsuario>(rutaUsuario(usuarioId), { method: "PUT", json: dto });
}

/** Borra el horario propio; el backend responde el del cliente, con `origen: "CLIENTE"`. */
export function borrarHorarioLaboralUsuario(usuarioId: string): Promise<HorarioLaboralUsuario> {
  return apiFetch<HorarioLaboralUsuario>(rutaUsuario(usuarioId), { method: "DELETE" });
}
