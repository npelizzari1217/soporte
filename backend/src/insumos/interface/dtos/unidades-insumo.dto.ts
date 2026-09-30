/**
 * DTOs del borde de unidades por número de serie (repuestos-numero-de-serie,
 * ADR-8 y ADR-9): listado, historial, carga y corrección de serial.
 *
 * Los seriales se recortan con `@Transform` y se miden con `@EsSerialDeUnidad`
 * (largo recortado Y normalizado, 1 a 255): la entidad LANZA ante el desborde y
 * sin este espejo sería un 500. El motivo de la corrección NO es opcional para
 * el dominio, pero el borde lo deja llegar vacío para que la regla tenga un
 * solo dueño (`MotivoCorreccionSerialInvalidoError`, 422).
 */
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { EsSerialDeUnidad } from '../validators/es-serial-de-unidad';
import { MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH } from '../../domain/entities/movimiento-insumo.entity';
import {
  ESTADOS_UNIDAD_INSUMO,
  EstadoUnidadInsumo,
  TipoEventoUnidad,
} from '../../domain/entities/unidad-insumo.entity';
import { CondicionStock } from '../../domain/entities/tipo-movimiento-insumo';
import { transformarMotivo } from './movimientos-insumo.dto';
import { UnidadListada } from '../../application/use-cases/listar-unidades-insumo.use-case';
import { EventoDeHistorial } from '../../application/use-cases/consultar-historial-unidad.use-case';

/** Recorta el serial; deja intacto lo que no es un string para que el validador lo reporte. */
function recortarSerial({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

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

/** Body de `POST …/unidades/:unidadId/serial`. */
export class CargarSerialUnidadHttpDto {
  @Transform(recortarSerial)
  @EsSerialDeUnidad()
  numeroSerie!: string;
}

/** Body de `POST …/unidades/:unidadId/correccion-serial`. */
export class CorregirSerialUnidadHttpDto {
  @Transform(recortarSerial)
  @EsSerialDeUnidad()
  numeroSerie!: string;

  @IsOptional()
  @IsString()
  @Transform(transformarMotivo)
  @MaxLength(MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH)
  motivo?: string | null;
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
