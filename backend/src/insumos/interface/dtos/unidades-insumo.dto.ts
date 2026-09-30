/**
 * DTOs del borde de unidades por número de serie (repuestos-numero-de-serie,
 * ADR-8 y ADR-9): listado e historial.
 */
import { IsIn, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  ESTADOS_UNIDAD_INSUMO,
  EstadoUnidadInsumo,
  TipoEventoUnidad,
} from '../../domain/entities/unidad-insumo.entity';
import { CondicionStock } from '../../domain/entities/tipo-movimiento-insumo';
import { UnidadListada } from '../../application/use-cases/listar-unidades-insumo.use-case';
import { EventoDeHistorial } from '../../application/use-cases/consultar-historial-unidad.use-case';

/** Query de `GET /insumos/:id/unidades`. */
export class ListarUnidadesInsumoQueryDto {
  @IsOptional()
  @IsIn(ESTADOS_UNIDAD_INSUMO)
  estado?: EstadoUnidadInsumo;

  /** `?disponibles=true`; cualquier otro valor se lee como `false`. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  disponibles?: boolean;
}

export interface UnidadInsumoResponseDto {
  id: string;
  insumoId: string;
  /** `null` = serie pendiente. */
  numeroSerie: string | null;
  condicion: CondicionStock;
  estado: EstadoUnidadInsumo;
  equipoId: string | null;
  equipoNombre: string | null;
}

export interface EventoUnidadResponseDto {
  id: string;
  tipo: TipoEventoUnidad;
  createdAt: string;
  usuarioId: string;
  movimientoId: string | null;
  componenteId: string | null;
  serialAnterior: string | null;
  serialNuevo: string | null;
  motivo: string | null;
  equipoId: string | null;
  equipoNombre: string | null;
  sectorId: string | null;
  sectorNombre: string | null;
}

export function toUnidadInsumoResponseDto(item: UnidadListada): UnidadInsumoResponseDto {
  const { unidad, equipoNombre } = item;
  return {
    id: unidad.id,
    insumoId: unidad.insumoId,
    numeroSerie: unidad.numeroSerie,
    condicion: unidad.condicion,
    estado: unidad.estado,
    equipoId: unidad.equipoId,
    equipoNombre,
  };
}

export function toEventoUnidadResponseDto(item: EventoDeHistorial): EventoUnidadResponseDto {
  const { evento } = item;
  return {
    id: evento.id,
    tipo: evento.tipo,
    createdAt: evento.createdAt.toISOString(),
    usuarioId: evento.usuarioId,
    movimientoId: evento.movimientoId,
    componenteId: evento.componenteId,
    serialAnterior: evento.serialAnterior,
    serialNuevo: evento.serialNuevo,
    motivo: item.motivo,
    equipoId: item.equipoId,
    equipoNombre: item.equipoNombre,
    sectorId: item.sectorId,
    sectorNombre: item.sectorNombre,
  };
}
