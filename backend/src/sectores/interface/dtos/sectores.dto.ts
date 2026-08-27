/**
 * DTOs de entrada/salida de `SectoresController` (WU-07,
 * sdd/compras-tres-etapas-y-sectores).
 *
 * `@MaxLength` de `codigo`/`nombre` NO declara el límite: lo importa de
 * `SectorEntity`, que es la autoridad. Acá el tope solo se adelanta al borde
 * HTTP para devolver un 400 que nombra el campo, en vez del `throw` de
 * precondición del dominio.
 *
 * El `VarChar(50)`/`VarChar(100)` de Postgres queda como último backstop, y
 * `PrismaExceptionFilter` (sdd/filtro-prisma) lo traduce a 4xx si algún caller
 * futuro esquivara las dos capas de arriba.
 */
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  SectorEntity,
  SECTOR_CODIGO_MAX_LENGTH,
  SECTOR_NOMBRE_MAX_LENGTH,
} from '../../domain/entities/sector.entity';

/** `codigo` de catálogo: mayúsculas/números/guion bajo, sin espacios (consistente con tipos_ticket/prioridades). */
const CODIGO_PATTERN = /^[A-Z0-9_]+$/;

/** Body de `POST /sectores`. */
export class CreateSectorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(SECTOR_CODIGO_MAX_LENGTH)
  @Matches(CODIGO_PATTERN, {
    message: 'codigo debe ser mayúsculas/números/guion bajo, sin espacios',
  })
  codigo!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(SECTOR_NOMBRE_MAX_LENGTH)
  nombre!: string;
}

/** Body de `PATCH /sectores/:id` — PATCH parcial. */
export class EditSectorDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(SECTOR_CODIGO_MAX_LENGTH)
  @Matches(CODIGO_PATTERN, {
    message: 'codigo debe ser mayúsculas/números/guion bajo, sin espacios',
  })
  codigo?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(SECTOR_NOMBRE_MAX_LENGTH)
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
