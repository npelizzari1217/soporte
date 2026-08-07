/**
 * DTOs de entrada/salida para `TicketsController` (T6.6, PR6).
 *
 * `class-validator` valida el body en `POST`/`PATCH`; los query params de
 * `GET /tickets` se validan/transforman vía `class-transformer` (ver
 * `ValidationPipe({ transform: true })` global en `AppModule`).
 *
 * Tarea: T6.6 (PR6 — TicketsController + DTOs)
 */
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { ArchivoEntity } from '../../domain/entities/archivo.entity';

/** Body de `POST /tickets` (T4). */
export class CreateTicketDto {
  @IsString()
  @MinLength(1)
  titulo!: string;

  @IsOptional()
  @IsString()
  descripcion?: string | null;

  @IsUUID()
  tipoId!: string;

  @IsUUID()
  prioridadId!: string;

  /** "Continúa de #X" (T11). Ticket cerrado del mismo tenant. */
  @IsOptional()
  @IsUUID()
  ticketReferenciaId?: string | null;
}

/** Body de `PATCH /tickets/:id` (T8) — PATCH parcial, `estado` NUNCA se edita acá. */
export class EditTicketDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  titulo?: string;

  @IsOptional()
  @IsString()
  descripcion?: string | null;

  @IsOptional()
  @IsUUID()
  prioridadId?: string;
}

/** Body de `PATCH /tickets/:id/estado` (T9, T10, T12) — transición de estado. */
export class TransitionTicketStateDto {
  @IsString()
  @MinLength(1)
  nuevoEstadoCodigo!: string;
}

/** Body de `PATCH /tickets/:id/asignar` (T14, T15) — asignación manual. */
export class AsignarTicketDto {
  @IsUUID()
  asignadoId!: string;
}

/** Body de `POST /tickets/:id/comentarios` (T16, T17) — comentario público/interno. */
export class CreateComentarioDto {
  @IsString()
  @MinLength(1)
  texto!: string;

  /** `true` = nota interna (requiere `ticket:observar`, T17). Default `false` (T16). */
  @IsOptional()
  @IsBoolean()
  esInterno?: boolean;
}

/** Query params de `GET /tickets` (T7) — filtros combinables + paginación. */
export class ListTicketsQueryDto {
  @IsOptional()
  @IsUUID()
  estado?: string;

  /** UUID de un único tipo de ticket. Filtro AND — combinar con `estado`/`prioridad`/etc. */
  @IsOptional()
  @IsUUID()
  tipo?: string;

  @IsOptional()
  @IsUUID()
  prioridad?: string;

  @IsOptional()
  @IsUUID()
  asignado?: string;

  @IsOptional()
  @IsUUID()
  ciclo?: string;

  @IsOptional()
  @IsDateString()
  fechaDesde?: string;

  @IsOptional()
  @IsDateString()
  fechaHasta?: string;

  /** Término de búsqueda de texto libre (título/descripción, ILIKE — B1). */
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

/** Response shape unificado de un ticket (T4-T8). */
export interface TicketResponseDto {
  id: string;
  numero: string;
  titulo: string;
  descripcion: string | null;
  tipoId: string;
  estadoId: string;
  prioridadId: string;
  cicloId: string | null;
  ticketReferenciaId: string | null;
  solicitanteId: string;
  asignadoId: string | null;
  /** Resuelto batch cross-DB (sdd/beta-frontend item 2). `null` = no resuelto (ver `NombresResueltos`). */
  solicitanteNombre: string | null;
  solicitanteApellido: string | null;
  /** `null` si `asignadoId` es `null`, o si el usuario no se pudo resolver. */
  asignadoNombre: string | null;
  asignadoApellido: string | null;
  /** Calculado por el módulo SLA. `null` = sin SLA aplicable/calculado aún (sdd/beta-frontend item 2). */
  slaVenceAt: string | null;
  /** Desnormalizado, recalculado por el módulo SLA (sdd/beta-frontend item 2). */
  vencido: boolean;
  fechaCierre: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Proyección de nombres resueltos batch (cross-DB, sdd/beta-frontend item 2)
 * para enriquecer `TicketResponseDto` sin acoplar `toTicketResponseDto` a un
 * puerto de infraestructura — `undefined` = no resuelto (usuario removido o
 * batch no solicitado, campos de nombre viajan `null` en la respuesta).
 */
export interface NombresResueltos {
  solicitante?: { nombre: string; apellido: string };
  asignado?: { nombre: string; apellido: string };
}

/** Response de `GET /tickets` — envoltorio con metadata de paginación (T7). */
export interface ListTicketsResponseDto {
  items: TicketResponseDto[];
  total: number;
  pagina: number;
  porPagina: number;
}

/**
 * Convierte una `TicketEntity` de dominio al shape de respuesta HTTP
 * unificado. `nombres` es OPCIONAL (sdd/beta-frontend item 2) — si el
 * caller no resolvió el batch de nombres (o el usuario no se encontró), los
 * 4 campos de nombre viajan `null` (aditivo, retrocompatible).
 */
export function toTicketResponseDto(
  ticket: TicketEntity,
  nombres?: NombresResueltos,
): TicketResponseDto {
  return {
    id: ticket.id,
    numero: ticket.numero,
    titulo: ticket.titulo,
    descripcion: ticket.descripcion,
    tipoId: ticket.tipoId,
    estadoId: ticket.estadoId,
    prioridadId: ticket.prioridadId,
    cicloId: ticket.cicloId,
    ticketReferenciaId: ticket.ticketReferenciaId,
    solicitanteId: ticket.solicitanteId,
    asignadoId: ticket.asignadoId,
    solicitanteNombre: nombres?.solicitante?.nombre ?? null,
    solicitanteApellido: nombres?.solicitante?.apellido ?? null,
    asignadoNombre: nombres?.asignado?.nombre ?? null,
    asignadoApellido: nombres?.asignado?.apellido ?? null,
    slaVenceAt: ticket.slaVenceAt ? ticket.slaVenceAt.toISOString() : null,
    vencido: ticket.vencido,
    fechaCierre: ticket.fechaCierre ? ticket.fechaCierre.toISOString() : null,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

/** Response shape de una entrada del timeline (comentario/cambio de estado/asignación/adjunto — T16-T18). */
export interface OperacionResponseDto {
  id: string;
  ticketId: string;
  tipoOperacionId: string;
  descripcion: string | null;
  estadoAnteriorId: string | null;
  estadoNuevoId: string | null;
  autorId: string;
  esInterno: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** Convierte una `OperacionTicketEntity` de dominio al shape de respuesta HTTP unificado. */
export function toOperacionResponseDto(operacion: OperacionTicketEntity): OperacionResponseDto {
  return {
    id: operacion.id,
    ticketId: operacion.ticketId,
    tipoOperacionId: operacion.tipoOperacionId,
    descripcion: operacion.descripcion,
    estadoAnteriorId: operacion.estadoAnteriorId,
    estadoNuevoId: operacion.estadoNuevoId,
    autorId: operacion.autorId,
    esInterno: operacion.esInterno,
    metadata: operacion.metadata,
    createdAt: operacion.createdAt.toISOString(),
  };
}

/** Response shape de un adjunto subido (T20-T22, PR10). `tamanoBytes` viaja como string (JSON no soporta `bigint`). */
export interface ArchivoResponseDto {
  id: string;
  storageKey: string;
  nombreOriginal: string;
  mimeType: string;
  tamanoBytes: string;
  subidoPorId: string;
  createdAt: string;
}

/** Convierte una `ArchivoEntity` de dominio al shape de respuesta HTTP unificado. */
export function toArchivoResponseDto(archivo: ArchivoEntity): ArchivoResponseDto {
  return {
    id: archivo.id,
    storageKey: archivo.storageKey,
    nombreOriginal: archivo.nombreOriginal,
    mimeType: archivo.mimeType,
    tamanoBytes: archivo.tamanoBytes.toString(),
    subidoPorId: archivo.subidoPorId,
    createdAt: archivo.createdAt.toISOString(),
  };
}
