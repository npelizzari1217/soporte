/**
 * Tipos del dominio Admin > SLA — espejo de
 * `backend/src/sla/interface/dtos/sla-config.dto.ts` (S1/SA9).
 */

export interface SlaConfig {
  id: string;
  prioridadId: string;
  horas: number;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EditSlaConfigDto {
  horas?: number;
  activo?: boolean;
}
