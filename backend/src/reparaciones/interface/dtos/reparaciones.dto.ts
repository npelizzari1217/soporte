/**
 * DTOs de entrada/salida para `ReparacionesController`
 * (F3-E1..E5, PR8/PR9).
 *
 * Mismo patrón que `compras/interface/dtos/compras.dto.ts`: `class-validator`
 * valida el body en `POST`/`PATCH`; el `ValidationPipe({whitelist:true,transform:true})`
 * global (`AppModule`) lo aplica automáticamente.
 *
 * Tarea: T8.6, T9.6.
 */
import { IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { SubtareaEdiliciaEntity } from '../../domain/entities/subtarea-edilicia.entity';
import { ReparacionConTicket } from '../../application/use-cases/listar-reparaciones.use-case';

// ─── Input DTOs ───────────────────────────────────────────────────────────────

/** Body de `POST /reparaciones` (F3-E1). `solicitanteId`/`autorId` vienen del JWT. */
export class CreateTicketEdilicioHttpDto {
  @IsString()
  @MinLength(1)
  titulo!: string;

  @IsOptional()
  @IsString()
  descripcion?: string | null;

  @IsUUID()
  prioridadId!: string;

  /** Ubicación física de la reparación, texto libre (opcional). */
  @IsOptional()
  @IsString()
  ubicacion?: string | null;
}

/** Body de `POST /reparaciones/:reparacionId/subtareas` (F3-E3). `autorId` viene del JWT. */
export class CreateSubtareaHttpDto {
  @IsString()
  @MinLength(1)
  descripcion!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

/**
 * Shape de respuesta unificado para un ticket edilicio (F3-E1).
 * `id` = `ticketEdilicia.id` (satélite); `ticketId` = id del `Ticket` base.
 */
export interface TicketEdiliciaConTicketResponseDto {
  id: string;
  ticketId: string;
  numero: string;
  titulo: string;
  estadoId: string;
  ubicacion: string | null;
  personalAsignadoId: string | null;
  porcentajeAvance: number;
  createdAt: string;
  updatedAt: string;
}

/** Convierte `{ticket, ticketEdilicia}` al shape de respuesta unificado. */
export function toTicketEdiliciaResponseDto(
  ticket: TicketEntity,
  ticketEdilicia: TicketEdiliciaEntity,
): TicketEdiliciaConTicketResponseDto {
  return {
    id: ticketEdilicia.id,
    ticketId: ticket.id,
    numero: ticket.numero,
    titulo: ticket.titulo,
    estadoId: ticket.estadoId,
    ubicacion: ticketEdilicia.ubicacion,
    personalAsignadoId: ticketEdilicia.personalAsignadoId,
    porcentajeAvance: ticketEdilicia.porcentajeAvance,
    createdAt: ticketEdilicia.createdAt.toISOString(),
    updatedAt: ticketEdilicia.updatedAt.toISOString(),
  };
}

/**
 * Shape de respuesta de un ítem del listado de reparaciones (F3-E1), incluye
 * las `subtareas` EMBEBIDAS (sdd/beta-frontend item 1 — G7: antes no había
 * forma de recargarlas tras un refresh de página; el frontend dependía solo
 * del cache de sesión de las mutaciones).
 */
export interface ReparacionListItemResponseDto extends TicketEdiliciaConTicketResponseDto {
  subtareas: SubtareaEdiliciaResponseDto[];
}

/** Convierte un `ReparacionConTicket` (join en memoria) al shape de respuesta HTTP. */
export function toReparacionListItemResponseDto(
  item: ReparacionConTicket,
): ReparacionListItemResponseDto {
  return {
    ...toTicketEdiliciaResponseDto(item.ticket, item.ticketEdilicia),
    subtareas: item.subtareas.map(toSubtareaEdiliciaResponseDto),
  };
}

/** Shape de respuesta de una subtarea edilicia. */
export interface SubtareaEdiliciaResponseDto {
  id: string;
  ticketEdiliciaId: string;
  descripcion: string;
  completada: boolean;
  completadaEn: string | null;
  completadaPorId: string | null;
  orden: number;
  createdAt: string;
  updatedAt: string;
}

/** Convierte `SubtareaEdiliciaEntity` al shape de respuesta HTTP. */
export function toSubtareaEdiliciaResponseDto(
  subtarea: SubtareaEdiliciaEntity,
): SubtareaEdiliciaResponseDto {
  return {
    id: subtarea.id,
    ticketEdiliciaId: subtarea.ticketEdiliciaId,
    descripcion: subtarea.descripcion,
    completada: subtarea.completada,
    completadaEn: subtarea.completadaEn ? subtarea.completadaEn.toISOString() : null,
    completadaPorId: subtarea.completadaPorId,
    orden: subtarea.orden,
    createdAt: subtarea.createdAt.toISOString(),
    updatedAt: subtarea.updatedAt.toISOString(),
  };
}
