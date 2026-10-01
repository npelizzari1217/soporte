/**
 * DTOs de `ReporteStockInsumosController` (reporte-stock-insumos, WU-4).
 *
 * Los cuatro filtros viajan como query params y son IDENTICOS para el JSON y
 * para el CSV: ambas rutas usan el mismo DTO de query. La respuesta no lleva
 * ningun campo de dinero (R4): se arma campo por campo, sin esparcir el
 * objeto del caso de uso.
 */
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  FilaReporteStock,
  ReporteStock,
} from '../../application/use-cases/consultar-reporte-stock.use-case';
import { EstadoReposicionInsumo } from '../../domain/entities/estado-reposicion-insumo';
import { SeguimientoInsumo } from '../../domain/entities/unidad-insumo.entity';
import { parsearBooleanQuery } from './insumos.dto';

export class ReporteStockQueryDto {
  @IsOptional()
  @IsUUID()
  familiaId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parsearBooleanQuery(value))
  @IsBoolean()
  esRepuesto?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parsearBooleanQuery(value))
  @IsBoolean()
  soloBajoMinimo?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parsearBooleanQuery(value))
  @IsBoolean()
  ocultarSinStock?: boolean;
}

export interface FilaReporteStockResponseDto {
  insumoId: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  seguimiento: SeguimientoInsumo;
  familia: { id: string; nombre: string; esRepuesto: boolean };
  unidadMedida: { codigo: string; nombre: string; entera: boolean };
  saldos: { NUEVO: number; USADO: number; total: number };
  stockMinimo: number | null;
  estadoReposicion: EstadoReposicionInsumo;
}

export interface ReporteStockResponseDto {
  /** Instante de generacion en ISO 8601 (UTC). */
  generadoEn: string;
  filas: FilaReporteStockResponseDto[];
}

function toFilaResponseDto(fila: FilaReporteStock): FilaReporteStockResponseDto {
  return {
    insumoId: fila.insumoId,
    codigo: fila.codigo,
    nombre: fila.nombre,
    activo: fila.activo,
    seguimiento: fila.seguimiento,
    familia: {
      id: fila.familia.id,
      nombre: fila.familia.nombre,
      esRepuesto: fila.familia.esRepuesto,
    },
    unidadMedida: {
      codigo: fila.unidadMedida.codigo,
      nombre: fila.unidadMedida.nombre,
      entera: fila.unidadMedida.entera,
    },
    saldos: { NUEVO: fila.saldos.NUEVO, USADO: fila.saldos.USADO, total: fila.saldos.total },
    stockMinimo: fila.stockMinimo,
    estadoReposicion: fila.estadoReposicion,
  };
}

export function toReporteStockResponseDto(reporte: ReporteStock): ReporteStockResponseDto {
  return {
    generadoEn: reporte.generadoEn.toISOString(),
    filas: reporte.filas.map(toFilaResponseDto),
  };
}
