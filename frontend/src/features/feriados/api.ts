/**
 * Funciones de acceso a datos de la feature `feriados` — capa `Remote`
 * (skill `data-access`: SPA, nunca accede directo a DB). Envuelven
 * `apiFetch` (`@/shared/api/client`) para los dos recursos HTTP del
 * dominio: `/feriados` (global, master, escritura ROOT) y
 * `/feriados-cliente` (tenant, escritura ADMINISTRADOR de cliente).
 *
 * Funciones planas, sin `useQuery`/`useMutation`: los hooks de React Query
 * llegan recién con las pantallas (WU7 ABM global, WU8 ABM de cliente +
 * lista combinada), siguiendo `frontend/src/features/ciclos-master/hooks/`.
 * Se extraen acá, antes que esos hooks, porque WU8's `combinarFeriados()`
 * (D8, design.md) necesita leer AMBAS listas fuera del ciclo de vida de un
 * único hook — `ciclos-master` nunca tuvo ese caso, ahí `apiFetch` va
 * inline en cada `queryFn`/`mutationFn`. Los hooks de WU7/WU8 llaman a
 * estas funciones en vez de repetir `apiFetch` inline.
 */
import { apiFetch } from "@/shared/api/client";
import type {
  CreateFeriadoClienteDto,
  CreateFeriadoDto,
  Feriado,
  FeriadoCliente,
  UpdateFeriadoClienteDto,
  UpdateFeriadoDto,
} from "./types";

// --- /feriados (global, master) ---

export function listarFeriados(): Promise<Feriado[]> {
  return apiFetch<Feriado[]>("feriados");
}

export function crearFeriado(dto: CreateFeriadoDto): Promise<Feriado> {
  return apiFetch<Feriado>("feriados", { method: "POST", json: dto });
}

export function editarFeriado(id: string, dto: UpdateFeriadoDto): Promise<Feriado> {
  return apiFetch<Feriado>(`feriados/${id}`, { method: "PATCH", json: dto });
}

export function eliminarFeriado(id: string): Promise<void> {
  return apiFetch<void>(`feriados/${id}`, { method: "DELETE" });
}

// --- /feriados-cliente (tenant) ---

export function listarFeriadosCliente(): Promise<FeriadoCliente[]> {
  return apiFetch<FeriadoCliente[]>("feriados-cliente");
}

export function crearFeriadoCliente(dto: CreateFeriadoClienteDto): Promise<FeriadoCliente> {
  return apiFetch<FeriadoCliente>("feriados-cliente", { method: "POST", json: dto });
}

export function editarFeriadoCliente(
  id: string,
  dto: UpdateFeriadoClienteDto,
): Promise<FeriadoCliente> {
  return apiFetch<FeriadoCliente>(`feriados-cliente/${id}`, { method: "PATCH", json: dto });
}

export function eliminarFeriadoCliente(id: string): Promise<void> {
  return apiFetch<void>(`feriados-cliente/${id}`, { method: "DELETE" });
}
