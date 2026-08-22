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
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { SubtareaEdiliciaEntity } from '../../domain/entities/subtarea-edilicia.entity';
import {
  COMENTARIO_TEXTO_MAX_LENGTH,
  ComentarioReparacionEntity,
} from '../../domain/entities/comentario-reparacion.entity';
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

/**
 * Body de `POST /reparaciones/:reparacionId/comentarios`. `autorId` viene del
 * JWT, nunca del cliente HTTP.
 *
 * El `@Transform` que recorta corre ANTES de los validadores, así que un
 * texto de puro whitespace queda en `''` y lo rechaza `@MinLength(1)` con un
 * 400 — sin él, `'   '` pasaría el `MinLength` y moriría como 500 en el
 * `throw` de precondición de la entidad. `@MaxLength` espeja el CHECK de DB.
 */
export class CreateComentarioReparacionHttpDto {
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(COMENTARIO_TEXTO_MAX_LENGTH)
  texto!: string;
}

/**
 * Body de `POST /reparaciones/:reparacionId/compras` (WU5,
 * sdd/reparacion-bloqueada-por-compra). Vincula una compra existente del
 * mismo tenant a la reparación de la ruta.
 */
export class VincularCompraHttpDto {
  @IsUUID()
  compraId!: string;
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
 *
 * Los comentarios NO viajan embebidos (tienen su propio `GET`): del listado
 * sale sólo `cantidadComentarios`, lo justo para el indicador de la fila.
 *
 * `bloqueada`/`comprasQueBloquean` (WU3, sdd/reparacion-bloqueada-por-compra):
 * expone `id`+`numero` de las compras que frenan la reparación — el dato
 * mínimo para el chip. No requiere `COMPRAS:LECTURA`: no es una consulta al
 * universo de compras, es un identificador acotado ya resuelto por el propio
 * listado de reparaciones (revisado a propósito en design/tasks, no una
 * fuga).
 */
export interface ReparacionListItemResponseDto extends TicketEdiliciaConTicketResponseDto {
  subtareas: SubtareaEdiliciaResponseDto[];
  /** Cantidad de comentarios de la reparación; `0` cuando no tiene ninguno. */
  cantidadComentarios: number;
  /** `true` si tiene al menos una compra vinculada que la frena HOY. */
  bloqueada: boolean;
  /** Compras que frenan la reparación. `[]` cuando no está bloqueada. */
  comprasQueBloquean: CompraQueBloqueaResponseDto[];
}

/** Identidad mínima de una compra que bloquea, para el chip del listado. */
export interface CompraQueBloqueaResponseDto {
  id: string;
  numero: string;
}

/** Convierte un `ReparacionConTicket` (join en memoria) al shape de respuesta HTTP. */
export function toReparacionListItemResponseDto(
  item: ReparacionConTicket,
): ReparacionListItemResponseDto {
  return {
    ...toTicketEdiliciaResponseDto(item.ticket, item.ticketEdilicia),
    subtareas: item.subtareas.map(toSubtareaEdiliciaResponseDto),
    cantidadComentarios: item.cantidadComentarios,
    bloqueada: item.bloqueada,
    comprasQueBloquean: item.comprasQueBloquean.map((compra) => ({
      id: compra.compraId,
      numero: compra.numero,
    })),
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

/**
 * Shape de respuesta de un comentario de reparación.
 *
 * Sin `updatedAt` ni `deletedAt`: la tabla es append-only y no los guarda —
 * exponerlos sería inventar un dato. `autorNombre`/`autorApellido` viajan
 * `null` cuando el usuario no pudo resolverse (dado de baja de master, o
 * batch no solicitado), mismo contrato que `TicketResponseDto`.
 */
export interface ComentarioReparacionResponseDto {
  id: string;
  ticketEdiliciaId: string;
  texto: string;
  autorId: string;
  autorNombre: string | null;
  autorApellido: string | null;
  createdAt: string;
}

/**
 * Convierte `ComentarioReparacionEntity` al shape de respuesta HTTP.
 *
 * `autor` es OPCIONAL y se resuelve cross-DB en el controller vía
 * `IUsuarioMasterChecker.resolverNombres` (master y tenant son bases
 * distintas: no hay JOIN posible, `autorId` es una soft ref). Mismo criterio
 * que `toTicketResponseDto(ticket, nombres?)` — el mapper no se acopla a un
 * puerto de infraestructura, solo recibe la proyección ya resuelta.
 */
export function toComentarioReparacionResponseDto(
  comentario: ComentarioReparacionEntity,
  autor?: { nombre: string; apellido: string },
): ComentarioReparacionResponseDto {
  return {
    id: comentario.id,
    ticketEdiliciaId: comentario.ticketEdiliciaId,
    texto: comentario.texto,
    autorId: comentario.autorId,
    autorNombre: autor?.nombre ?? null,
    autorApellido: autor?.apellido ?? null,
    createdAt: comentario.createdAt.toISOString(),
  };
}
