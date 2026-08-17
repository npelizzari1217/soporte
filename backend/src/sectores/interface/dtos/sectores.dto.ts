/**
 * DTOs de entrada/salida de `SectoresController` (WU-07,
 * sdd/compras-tres-etapas-y-sectores).
 */
import { IsBoolean, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { SectorEntity } from '../../domain/entities/sector.entity';

/** `codigo` de catálogo: mayúsculas/números/guion bajo, sin espacios (consistente con tipos_ticket/prioridades). */
const CODIGO_PATTERN = /^[A-Z0-9_]+$/;

/** Body de `POST /sectores`. */
export class CreateSectorDto {
  @IsString()
  @MinLength(1)
  @Matches(CODIGO_PATTERN, {
    message: 'codigo debe ser mayúsculas/números/guion bajo, sin espacios',
  })
  codigo!: string;

  @IsString()
  @MinLength(1)
  nombre!: string;
}

/** Body de `PATCH /sectores/:id` — PATCH parcial. */
export class EditSectorDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @Matches(CODIGO_PATTERN, {
    message: 'codigo debe ser mayúsculas/números/guion bajo, sin espacios',
  })
  codigo?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  nombre?: string;
}

/** Body de `PATCH /sectores/:id/estado` — activar/desactivar. */
export class CambiarEstadoActivoSectorDto {
  @IsBoolean()
  activo!: boolean;
}

/** Response shape de un sector. */
export interface SectorResponseDto {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Convierte una `SectorEntity` de dominio al shape de respuesta HTTP. */
export function toSectorResponseDto(sector: SectorEntity): SectorResponseDto {
  return {
    id: sector.id,
    codigo: sector.codigo,
    nombre: sector.nombre,
    activo: sector.activo,
    createdAt: sector.createdAt.toISOString(),
    updatedAt: sector.updatedAt.toISOString(),
  };
}
