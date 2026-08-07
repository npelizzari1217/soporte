/**
 * Tipos del dominio Admin > Catálogos — espejo de los DTOs de escritura reales
 * (`backend/src/tickets/interface/dtos/catalogo.dto.ts`, T2/PR11). Los tipos
 * de LECTURA (`TipoTicket`/`Prioridad`) ya viven en `features/tickets/types.ts`
 * (G1, reusados acá — mismo criterio cross-feature que dashboard con
 * `GET /usuarios`/`GET /catalogos/*`).
 *
 * Ref spec: sdd/beta-frontend/spec R-M4. Ref design: ADR-1/ADR-2. Tarea: T4.1-T4.3.
 */

export interface CreateTipoTicketDto {
  codigo: string;
  nombre: string;
}

export interface EditTipoTicketDto {
  codigo?: string;
  nombre?: string;
}

export interface CreatePrioridadDto {
  codigo: string;
  nombre: string;
  color?: string | null;
  orden: number;
}

export interface EditPrioridadDto {
  codigo?: string;
  nombre?: string;
  color?: string | null;
  orden?: number;
}

export interface CambiarEstadoActivoDto {
  activo: boolean;
}
