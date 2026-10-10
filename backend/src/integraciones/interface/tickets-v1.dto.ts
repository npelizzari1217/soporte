/**
 * Contrato publico `v1` de tickets (sdd/api-publica, T5). Son DTOs PROPIOS de la API: no reusan los
 * de la API interna para que un cambio interno no rompa a los integradores. No exponen ids de
 * usuarios de master, ciclos, solicitantes externos, telefonos ni datos de CSAT.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TICKET_TITULO_MAX_LENGTH } from '../../tickets/domain/entities/ticket.entity';
import { TicketResponseDto } from '../../tickets/interface/dtos/ticket.dto';

/** Query de `GET /v1/tickets`: filtros combinables (AND) y paginacion. */
export class ListarTicketsV1QueryDto {
  /** Id del estado. */
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Id del estado (ver `GET /api/v1/catalogos`).',
  })
  @IsOptional()
  @IsUUID()
  estado?: string;

  /** Id del tipo de ticket. */
  @ApiPropertyOptional({ format: 'uuid', description: 'Id del tipo de ticket.' })
  @IsOptional()
  @IsUUID()
  tipo?: string;

  /** Id de la prioridad. */
  @ApiPropertyOptional({ format: 'uuid', description: 'Id de la prioridad.' })
  @IsOptional()
  @IsUUID()
  prioridad?: string;

  /** Creados desde esta fecha (ISO-8601). */
  @ApiPropertyOptional({ format: 'date-time', description: 'Creados desde esta fecha (ISO-8601).' })
  @IsOptional()
  @IsDateString()
  fechaDesde?: string;

  /** Creados hasta esta fecha (ISO-8601). */
  @ApiPropertyOptional({ format: 'date-time', description: 'Creados hasta esta fecha (ISO-8601).' })
  @IsOptional()
  @IsDateString()
  fechaHasta?: string;

  /** Texto libre sobre titulo y descripcion. */
  @ApiPropertyOptional({ minLength: 1, description: 'Texto libre sobre título y descripción.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  busqueda?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, default: 1, description: 'Página, desde 1.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 20,
    description: 'Tickets por página.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  porPagina?: number;
}

/** Body de `POST /v1/tickets`. */
export class CrearTicketV1Dto {
  @ApiProperty({ minLength: 1, maxLength: TICKET_TITULO_MAX_LENGTH })
  @IsString()
  @MinLength(1)
  @MaxLength(TICKET_TITULO_MAX_LENGTH)
  titulo!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  descripcion?: string | null;

  @ApiProperty({
    format: 'uuid',
    description:
      'Id de un tipo publicado en `GET /api/v1/catalogos`. Otro valor responde 422 sin crear el ticket.',
  })
  @IsUUID()
  tipoId!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Id de una prioridad publicada en `GET /api/v1/catalogos`.',
  })
  @IsUUID()
  prioridadId!: string;

  /** "Continua de #X": id de un ticket existente del mismo cliente. */
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Id de un ticket existente del mismo cliente del que este continúa.',
  })
  @IsOptional()
  @IsUUID()
  ticketReferenciaId?: string | null;
}

/** Body de `POST /v1/tickets/:id/comentarios`. Siempre es un comentario publico. */
export class CrearComentarioV1Dto {
  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  texto!: string;
}

/** Nombre de quien pidio el ticket. */
export class SolicitanteV1 {
  @ApiProperty()
  nombre!: string;

  @ApiProperty({ type: String, nullable: true })
  apellido!: string | null;
}

/** Nombre del tecnico asignado. */
export class AsignadoV1 {
  @ApiProperty()
  nombre!: string;

  @ApiProperty()
  apellido!: string;
}

/** Estado del SLA del ticket. */
export class SlaV1 {
  @ApiProperty({ description: 'Estado del SLA calculado por el sistema.' })
  estado!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  venceAt!: string | null;
}

/** Ticket del contrato `v1`. Es una clase solo para que OpenAPI lo describa: el presentador arma literales. */
export class TicketV1 {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Número visible del ticket.' })
  numero!: string;

  @ApiProperty()
  titulo!: string;

  @ApiProperty({ type: String, nullable: true })
  descripcion!: string | null;

  @ApiProperty({ format: 'uuid' })
  tipoId!: string;

  /** Id del estado y su codigo (`NUEVO`, `ASIGNADO`, ...). */
  @ApiProperty({ format: 'uuid' })
  estadoId!: string;

  @ApiProperty({
    description:
      'Código del estado (`NUEVO`, `ASIGNADO`, ...), el mismo de `GET /api/v1/catalogos`.',
  })
  estado!: string;

  @ApiProperty({ format: 'uuid' })
  prioridadId!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  ticketReferenciaId!: string | null;

  /** Nombre de quien lo pidio. Un ticket creado por la API figura a nombre de la integracion. */
  @ApiProperty({
    type: SolicitanteV1,
    nullable: true,
    description: 'Quién lo pidió. Un ticket creado por la API figura a nombre de la integración.',
  })
  solicitante!: SolicitanteV1 | null;

  @ApiProperty({ type: AsignadoV1, nullable: true })
  asignado!: AsignadoV1 | null;

  @ApiProperty({ type: SlaV1 })
  sla!: SlaV1;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  fechaCierre!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

/** Pagina de tickets de `GET /v1/tickets`. */
export class ListaTicketsV1 {
  @ApiProperty({ type: [TicketV1] })
  items!: TicketV1[];

  @ApiProperty({ type: 'integer' })
  total!: number;

  @ApiProperty({ type: 'integer' })
  pagina!: number;

  @ApiProperty({ type: 'integer' })
  porPagina!: number;
}

/** Comentario creado por `POST /v1/tickets/:id/comentarios`. */
export class ComentarioV1 {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  ticketId!: string;

  @ApiProperty()
  texto!: string;

  /** Siempre `false`: la API no crea ni muestra comentarios internos. */
  @ApiProperty({
    type: Boolean,
    enum: [false],
    description: 'Siempre `false`: la API no crea ni muestra comentarios internos.',
  })
  esInterno!: false;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
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
