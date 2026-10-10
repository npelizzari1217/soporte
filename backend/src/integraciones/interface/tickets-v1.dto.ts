/**
 * Contrato publico `v1` de tickets (sdd/api-publica, T5). Son DTOs PROPIOS de la API: no reusan los
 * de la API interna para que un cambio interno no rompa a los integradores. No exponen ids de
 * usuarios de master, ciclos, solicitantes externos, telefonos ni datos de CSAT.
 */
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { TicketResponseDto } from '../../tickets/interface/dtos/ticket.dto';

/** Query de `GET /v1/tickets`: filtros combinables (AND) y paginacion. */
export class ListarTicketsV1QueryDto {
  /** Id del estado. */
  @IsOptional()
  @IsUUID()
  estado?: string;

  /** Id del tipo de ticket. */
  @IsOptional()
  @IsUUID()
  tipo?: string;

  /** Id de la prioridad. */
  @IsOptional()
  @IsUUID()
  prioridad?: string;

  /** Creados desde esta fecha (ISO-8601). */
  @IsOptional()
  @IsDateString()
  fechaDesde?: string;

  /** Creados hasta esta fecha (ISO-8601). */
  @IsOptional()
  @IsDateString()
  fechaHasta?: string;

  /** Texto libre sobre titulo y descripcion. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  busqueda?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  porPagina?: number;
}

export interface TicketV1 {
  id: string;
  numero: string;
  titulo: string;
  descripcion: string | null;
  tipoId: string;
  /** Id del estado y su codigo (`NUEVO`, `ASIGNADO`, ...). */
  estadoId: string;
  estado: string;
  prioridadId: string;
  ticketReferenciaId: string | null;
  /** Nombre de quien lo pidio. Un ticket creado por la API figura a nombre de la integracion. */
  solicitante: { nombre: string; apellido: string | null } | null;
  asignado: { nombre: string; apellido: string } | null;
  sla: { estado: string; venceAt: string | null };
  fechaCierre: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListaTicketsV1 {
  items: TicketV1[];
  total: number;
  pagina: number;
  porPagina: number;
}

/** Proyeccion `v1` de un ticket ya armado por la API interna (lista blanca de campos). */
export function aTicketV1(dto: TicketResponseDto, estadoCodigo: string): TicketV1 {
  return {
    id: dto.id,
    numero: dto.numero,
    titulo: dto.titulo,
    descripcion: dto.descripcion,
    tipoId: dto.tipoId,
    estadoId: dto.estadoId,
    estado: estadoCodigo,
    prioridadId: dto.prioridadId,
    ticketReferenciaId: dto.ticketReferenciaId,
    solicitante:
      dto.solicitanteNombre === null
        ? null
        : { nombre: dto.solicitanteNombre, apellido: dto.solicitanteApellido },
    asignado:
      dto.asignadoNombre === null || dto.asignadoApellido === null
        ? null
        : { nombre: dto.asignadoNombre, apellido: dto.asignadoApellido },
    sla: { estado: dto.sla.estado, venceAt: dto.sla.venceAt },
    fechaCierre: dto.fechaCierre,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}
