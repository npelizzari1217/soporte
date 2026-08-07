/**
 * DTOs de entrada/salida de `KbController` (K1-K4).
 *
 * Tarea: K8.
 */
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { KbArticuloEntity } from '../../domain/entities/kb-articulo.entity';

/** Body de `POST /kb` (K1). */
export class CreateKbArticuloDto {
  @IsString()
  titulo!: string;

  @IsString()
  contenido!: string;

  @IsOptional()
  @IsUUID()
  tipoTicketId?: string | null;
}

/** Body de `PATCH /kb/:id` (K1) — PATCH parcial. */
export class EditKbArticuloDto {
  @IsOptional()
  @IsString()
  titulo?: string;

  @IsOptional()
  @IsString()
  contenido?: string;

  @IsOptional()
  @IsUUID()
  tipoTicketId?: string | null;
}

/** Body de `PATCH /kb/:id/visibilidad` (K2). */
export class CambiarVisibilidadKbArticuloDto {
  @IsBoolean()
  visible!: boolean;
}

/** Query params de `GET /kb` (K3). */
export class ListKbArticulosQueryDto {
  @IsOptional()
  @IsUUID()
  tipoTicketId?: string;

  @IsOptional()
  @IsString()
  busqueda?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

/** Response shape de un artículo de KB (K1-K3). */
export interface KbArticuloResponseDto {
  id: string;
  titulo: string;
  contenido: string;
  tipoTicketId: string | null;
  autorId: string | null;
  visibleParaSolicitante: boolean;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Response shape del listado paginado de artículos de KB (K3). */
export interface ListKbArticulosResponseDto {
  items: KbArticuloResponseDto[];
  total: number;
  page: number;
  pageSize: number;
}

/** Convierte una `KbArticuloEntity` de dominio al shape de respuesta HTTP. */
export function toKbArticuloResponseDto(articulo: KbArticuloEntity): KbArticuloResponseDto {
  return {
    id: articulo.id,
    titulo: articulo.titulo,
    contenido: articulo.contenido,
    tipoTicketId: articulo.tipoTicketId,
    autorId: articulo.autorId,
    visibleParaSolicitante: articulo.visibleParaSolicitante,
    activo: articulo.activo,
    createdAt: articulo.createdAt.toISOString(),
    updatedAt: articulo.updatedAt.toISOString(),
  };
}
