/**
 * DTOs de entrada/salida de `SlaConfigController` (S1 — CRUD de
 * lectura/edición de `sla_config`, sin alta/baja libre).
 *
 * Tarea: SA9.
 */
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';
import { SlaConfigEntity } from '../../domain/entities/sla-config.entity';

/** Body de `PATCH /sla/config/:id` (S1) — PATCH parcial. */
export class EditSlaConfigDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  horas?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

/** Response shape de una config de SLA (S1). */
export interface SlaConfigResponseDto {
  id: string;
  prioridadId: string;
  horas: number;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Convierte una `SlaConfigEntity` de dominio al shape de respuesta HTTP. */
export function toSlaConfigResponseDto(config: SlaConfigEntity): SlaConfigResponseDto {
  return {
    id: config.id,
    prioridadId: config.prioridadId,
    horas: config.horas,
    activo: config.activo,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  };
}
