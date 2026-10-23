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
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  TICKET_TITULO_MAX_LENGTH,
  TICKET_UBICACION_MAX_LENGTH,
  TicketEntity,
} from '../../../tickets/domain/entities/ticket.entity';
import { COMENTARIO_TEXTO_MAX_LENGTH } from '../../domain/entities/comentario-reparacion.entity';
import {
  FILTROS_BLOQUEO,
  FiltroBloqueo,
  ReparacionConTicket,
} from '../../application/use-cases/listar-reparaciones.use-case';
import { CompraDeTicket } from '../../application/use-cases/listar-compras-de-ticket.use-case';
import { GrupoEstadoCompra } from '../../../compras/domain/services/estado-compra';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import { TareaTicketEntity } from '../../../tickets/domain/entities/tarea-ticket.entity';

// ─── Input DTOs ───────────────────────────────────────────────────────────────

/**
 * Body de `POST /reparaciones` (F3-E1). `solicitanteId`/`autorId` vienen del JWT.
 *
 * `titulo` crea un `Ticket` vía `TicketEntity.create()` — el `@MaxLength`
 * importa `TICKET_TITULO_MAX_LENGTH` de esa entidad, que es la autoridad
 * (fix defecto "límite de largo de titulo").
 */
export class CreateTicketEdilicioHttpDto {
  @IsString()
  @MinLength(1)
  @MaxLength(TICKET_TITULO_MAX_LENGTH)
  titulo!: string;

  @IsOptional()
  @IsString()
  descripcion?: string | null;

  @IsUUID()
  prioridadId!: string;

  /**
   * Tipo de ticket elegido (odd/tasks/ticket-unificado.md, S2). Ausente = EDILICIA. El caso de uso
   * valida que sea un tipo activo con alta manual (cualquiera salvo PREVENTIVO).
   */
  @IsOptional()
  @IsUUID()
  tipoId?: string | null;

  /**
   * Ubicación física, texto libre (opcional). Es la del ticket (odd/ticket-unificado, S1): mismo
   * tope que `tickets.ubicacion`.
   */
  @IsOptional()
  @IsString()
  @MaxLength(TICKET_UBICACION_MAX_LENGTH)
  ubicacion?: string | null;

  /** Sector del cliente (odd/ubicacion-sector-ticket). Tiene que existir; no se exige activo. */
  @IsOptional()
  @IsUUID()
  sectorId?: string | null;
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
 * Body de `PATCH /reparaciones/:reparacionId` (odd/detalle-ticket-legible, S4). Todo opcional: un
 * campo ausente no se toca y `null` limpia. `ubicacion` es la del ticket (odd/ticket-unificado, S1).
 * Mismos topes que el alta: `@MaxLength` espeja la columna y la precondición de la entidad.
 */
export class EditarReparacionHttpDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(TICKET_TITULO_MAX_LENGTH)
  titulo?: string;

  @IsOptional()
  @IsString()
  descripcion?: string | null;

  @IsOptional()
  @IsUUID()
  prioridadId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(TICKET_UBICACION_MAX_LENGTH)
  ubicacion?: string | null;

  @IsOptional()
  @IsUUID()
  sectorId?: string | null;
}

/**
 * Body de `POST /tickets/:ticketId/compras` y de su alias `POST /reparaciones/:reparacionId/compras`
 * (WU5, sdd/reparacion-bloqueada-por-compra; odd/ticket-unificado). Vincula una compra existente
 * del mismo tenant al ticket de la ruta.
 */
export class VincularCompraHttpDto {
  @IsUUID()
  compraId!: string;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

/**
 * Shape de respuesta de un ticket en Edilicia (F3-E1).
 *
 * Desde odd/ticket-unificado `id` es el id del TICKET (igual a `ticketId`): la grilla se arma sobre
 * los tickets, y un ticket abierto desde Tickets no tiene satélite. Las rutas `/reparaciones/:id`
 * aceptan este id y también el del satélite que devolvían antes. `ubicacion`, `createdAt` y
 * `updatedAt` son los del ticket. `porcentajeAvance` se calcula sobre las tareas activas del ticket
 * (odd/tareas-con-tecnico): ya no es una columna. `personalAsignadoId` se retiró en T8 (CA9).
 */
export interface TicketEdiliciaConTicketResponseDto {
  id: string;
  ticketId: string;
  /**
   * Tipo del ticket: el frontend decide con él qué acciones ofrece en cada fila, porque los
   * permisos son por tipo (odd/permisos-por-tipo-ticket, S6, T6).
   */
  tipoId: string;
  numero: string;
  titulo: string;
  /** Descripción y prioridad del ticket: las precarga el diálogo de edición (odd/detalle-ticket-legible). */
  descripcion: string | null;
  prioridadId: string;
  estadoId: string;
  /** Ubicación del ticket (`tickets.ubicacion`), la única desde odd/ticket-unificado. */
  ubicacion: string | null;
  /** Sector del ticket (odd/ubicacion-sector-ticket). */
  sectorId: string | null;
  /** Nombre del sector, resuelto por el backend (incluso si está desactivado). */
  sectorNombre: string | null;
  porcentajeAvance: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Convierte un ticket al shape de respuesta de Edilicia. `porcentajeAvance` lo aporta quien llama;
 * el default 0 es el de un ticket recién creado, que todavía no tiene tareas. `sectorNombre`
 * también lo aporta quien llama, ya resuelto.
 *
 * @param ticket Ticket.
 * @param sectorNombre Nombre de su sector, o `null`.
 * @param porcentajeAvance Avance de sus tareas.
 * @returns El shape de respuesta.
 */
export function toTicketEdiliciaResponseDto(
  ticket: TicketEntity,
  sectorNombre: string | null,
  porcentajeAvance = 0,
): TicketEdiliciaConTicketResponseDto {
  return {
    id: ticket.id,
    ticketId: ticket.id,
    tipoId: ticket.tipoId,
    numero: ticket.numero,
    titulo: ticket.titulo,
    descripcion: ticket.descripcion,
    prioridadId: ticket.prioridadId,
    estadoId: ticket.estadoId,
    ubicacion: ticket.ubicacion,
    sectorId: ticket.sectorId,
    sectorNombre,
    porcentajeAvance,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
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

/**
 * Query params de `GET /reparaciones` (odd/reparaciones-paginadas, S1): mismos
 * topes de paginación que `GET /tickets`, más el filtro de bloqueo y el tipo.
 */
export class ListReparacionesQueryDto {
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

  @IsOptional()
  @IsIn(FILTROS_BLOQUEO)
  bloqueo?: FiltroBloqueo;

  /**
   * Tipo elegido en el selector de la pantalla (odd/ticket-unificado, S2). Ausente: los tipos del
   * módulo EDILICIA. Un tipo sin `LECTURA` no amplía nada: la página llega vacía.
   */
  @IsOptional()
  @IsUUID()
  tipo?: string;
}

/**
 * Query params de `GET /reparaciones/export`: solo el tipo, con el mismo significado que en el
 * listado. `formato` lo lee su propio pipe.
 */
export class ExportReparacionesQueryDto {
  @IsOptional()
  @IsUUID()
  tipo?: string;
}

/** Response de `GET /reparaciones`: una página y su metadata (forma de `ListTicketsResponseDto`). */
export interface ListReparacionesResponseDto {
  items: ReparacionListItemResponseDto[];
  total: number;
  pagina: number;
  porPagina: number;
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
    // Calculado al leer sobre las tareas del ticket (odd/tareas-con-tecnico, T3).
    ...toTicketEdiliciaResponseDto(item.ticket, item.sectorNombre, item.porcentajeAvance),
    subtareas: item.subtareas.map((tarea) =>
      toSubtareaEdiliciaResponseDtoDesdeTarea(tarea, item.ticket.id),
    ),
    cantidadComentarios: item.cantidadComentarios,
    bloqueada: item.bloqueada,
    comprasQueBloquean: item.comprasQueBloquean.map((compra) => ({
      id: compra.compraId,
      numero: compra.numero,
    })),
  };
}

/**
 * Shape de respuesta de una subtarea edilicia, embebida en `GET /reparaciones`. Desde
 * odd/tareas-con-tecnico es una tarea del ticket base con el id del satélite.
 */
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

/**
 * Shape de respuesta de un comentario de Edilicia: desde odd/ticket-unificado (S3), un COMENTARIO
 * del timeline del ticket.
 *
 * `ticketEdiliciaId` conserva el nombre que espera el frontend y lleva el id del ticket. Sin
 * `updatedAt` ni `deletedAt`: un comentario no se edita. `autorNombre`/`autorApellido` viajan
 * `null` cuando el usuario no pudo resolverse (dado de baja de master, o batch no solicitado),
 * mismo contrato que `TicketResponseDto`.
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
 * Convierte un COMENTARIO del timeline al shape de respuesta HTTP.
 *
 * `autor` es OPCIONAL y se resuelve cross-DB en el controller vía
 * `IUsuarioMasterChecker.resolverNombres` (master y tenant son bases
 * distintas: no hay JOIN posible, `autorId` es una soft ref).
 *
 * @param comentario Operación COMENTARIO del ticket.
 * @param autor Nombre y apellido del autor, si se resolvió.
 * @returns El shape de respuesta.
 */
export function toComentarioReparacionResponseDto(
  comentario: OperacionTicketEntity,
  autor?: { nombre: string; apellido: string },
): ComentarioReparacionResponseDto {
  return {
    id: comentario.id,
    ticketEdiliciaId: comentario.ticketId,
    texto: comentario.descripcion ?? '',
    autorId: comentario.autorId,
    autorNombre: autor?.nombre ?? null,
    autorApellido: autor?.apellido ?? null,
    createdAt: comentario.createdAt.toISOString(),
  };
}

/**
 * Una compra vinculada a un ticket (`GET /tickets/:ticketId/compras`, odd/ticket-unificado): su
 * identidad, su grupo de estado y si frena hoy al ticket.
 */
export interface CompraDeTicketResponseDto {
  id: string;
  numero: string;
  grupo: GrupoEstadoCompra;
  bloquea: boolean;
}

/**
 * Convierte una compra vinculada al shape de respuesta HTTP.
 *
 * @param compra Compra vinculada, ya derivada por el caso de uso.
 * @returns El shape de respuesta.
 */
export function toCompraDeTicketResponseDto(compra: CompraDeTicket): CompraDeTicketResponseDto {
  return {
    id: compra.compraId,
    numero: compra.numero,
    grupo: compra.grupo,
    bloquea: compra.bloquea,
  };
}

/**
 * Convierte una tarea del ticket al shape de subtarea que espera el frontend de Edilicia
 * (odd/tareas-con-tecnico, T3): la migración de T1 conservó los ids, y `ticketEdiliciaId` lo aporta
 * quien llama (desde odd/ticket-unificado, el id del ticket). Lo usa el listado: el respaldo de solo lectura del diálogo de Edilicia (T6) depende
 * de estas `subtareas` embebidas.
 */
export function toSubtareaEdiliciaResponseDtoDesdeTarea(
  tarea: TareaTicketEntity,
  ticketEdiliciaId: string,
): SubtareaEdiliciaResponseDto {
  return {
    id: tarea.id,
    ticketEdiliciaId,
    descripcion: tarea.descripcion,
    completada: tarea.completada,
    completadaEn: tarea.completadaEn ? tarea.completadaEn.toISOString() : null,
    completadaPorId: tarea.completadaPorId,
    orden: tarea.orden,
    createdAt: tarea.createdAt.toISOString(),
    updatedAt: tarea.updatedAt.toISOString(),
  };
}
