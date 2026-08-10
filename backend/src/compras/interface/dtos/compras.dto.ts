/**
 * DTOs de entrada/salida para `ComprasController` (F3-C1..C6, PR4/PR5).
 *
 * Mismo patrón que `tickets/interface/dtos/ticket.dto.ts`: `class-validator`
 * valida el body en `POST`; el `ValidationPipe({whitelist:true,transform:true})`
 * global (`AppModule`) lo aplica automáticamente.
 *
 * Convención de identificadores de esta API (decisión explícita, no
 * silenciosa): las rutas anidadas de ítems/presupuestos (`/compras/:compraId/...`)
 * usan el id del SATÉLITE `ticket_compra` (`:compraId`), que también es el
 * `id` primario expuesto en las respuestas — mismo criterio que la
 * referencia probada (soporte1 `ComprasController`). Las rutas de
 * aprobar/rechazar (`/compras/:id/aprobar|rechazar`) usan el id del
 * `Ticket` BASE (`:id`), porque `AprobarCompraDto`/`RechazarCompraDto`
 * (design "Firmas TS clave") reciben `ticketId`, no `ticketCompraId`.
 *
 * Tarea: T4.6, T5.7.
 */
import {
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import { PresupuestoEntity } from '../../domain/entities/presupuesto.entity';
import { TicketCompraEntity } from '../../domain/entities/ticket-compra.entity';

// ─── Input DTOs ───────────────────────────────────────────────────────────────

/** Body de `POST /compras` (F3-C1). `solicitanteId`/`autorId` vienen del JWT. */
export class CreateTicketCompraHttpDto {
  @IsString()
  @MinLength(1)
  titulo!: string;

  @IsOptional()
  @IsString()
  descripcion?: string | null;

  /** Tipo de compra elegido por el usuario (B1). Debe existir en el tenant. */
  @IsUUID()
  tipoId!: string;

  @IsUUID()
  prioridadId!: string;
}

/** Body de `POST /compras/:compraId/items` (F3-C2). */
export class CreateItemCompraHttpDto {
  @IsString()
  @MinLength(1)
  descripcion!: string;

  @IsNumber()
  cantidad!: number;

  @IsOptional()
  @IsString()
  unidad?: string | null;

  @IsOptional()
  @IsNumber()
  precioUnitarioRef?: number | null;

  @IsOptional()
  @IsString()
  observaciones?: string | null;
}

/** Body de `POST /compras/:compraId/presupuestos` (F3-C3). */
export class CreatePresupuestoHttpDto {
  @IsString()
  @MinLength(1)
  proveedor!: string;

  @IsNumber()
  @Min(0)
  montoTotal!: number;

  /** Código ISO 4217: ARS, USD, EUR. */
  @IsIn(['ARS', 'USD', 'EUR'])
  moneda!: string;

  /** Fecha de cotización en formato ISO (YYYY-MM-DD). */
  @IsISO8601()
  fechaCotizacion!: string;

  @IsOptional()
  @IsString()
  observaciones?: string | null;
}

/** Body de `POST /compras/:id/rechazar` (F3-C5). `aprobadoPorId` viene del JWT. */
export class RechazarCompraHttpDto {
  @IsString()
  @MinLength(1)
  motivoRechazo!: string;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

/**
 * Shape de respuesta unificado para un ticket de compra (F3-C1..C6).
 *
 * `id` = `ticketCompra.id` (satélite); `ticketId` = id del `Ticket` base.
 * Ver convención de identificadores en el header del archivo.
 */
export interface TicketCompraConTicketResponseDto {
  id: string;
  ticketId: string;
  numero: string;
  titulo: string;
  estadoId: string;
  aprobadoPorId: string | null;
  aprobadoEn: string | null;
  motivoRechazo: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Convierte `{ticket, ticketCompra}` al shape de respuesta unificado. */
export function toTicketCompraResponseDto(
  ticket: TicketEntity,
  ticketCompra: TicketCompraEntity,
): TicketCompraConTicketResponseDto {
  return {
    id: ticketCompra.id,
    ticketId: ticket.id,
    numero: ticket.numero,
    titulo: ticket.titulo,
    estadoId: ticket.estadoId,
    aprobadoPorId: ticketCompra.aprobadoPorId,
    aprobadoEn: ticketCompra.aprobadoEn ? ticketCompra.aprobadoEn.toISOString() : null,
    motivoRechazo: ticketCompra.motivoRechazo,
    createdAt: ticketCompra.createdAt.toISOString(),
    updatedAt: ticketCompra.updatedAt.toISOString(),
  };
}

/** Shape de respuesta de un ítem de compra. */
export interface ItemCompraResponseDto {
  id: string;
  ticketCompraId: string;
  descripcion: string;
  cantidad: number;
  unidad: string | null;
  precioUnitarioRef: number | null;
  observaciones: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Convierte `ItemCompraEntity` al shape de respuesta HTTP. */
export function toItemCompraResponseDto(item: ItemCompraEntity): ItemCompraResponseDto {
  return {
    id: item.id,
    ticketCompraId: item.ticketCompraId,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    unidad: item.unidad,
    precioUnitarioRef: item.precioUnitarioRef,
    observaciones: item.observaciones,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

/** Shape de respuesta de un presupuesto de proveedor. */
export interface PresupuestoResponseDto {
  id: string;
  ticketCompraId: string;
  proveedor: string;
  montoTotal: number;
  moneda: string;
  fechaCotizacion: string;
  seleccionado: boolean;
  observaciones: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Convierte `PresupuestoEntity` al shape de respuesta HTTP. */
export function toPresupuestoResponseDto(presupuesto: PresupuestoEntity): PresupuestoResponseDto {
  return {
    id: presupuesto.id,
    ticketCompraId: presupuesto.ticketCompraId,
    proveedor: presupuesto.proveedor,
    montoTotal: presupuesto.montoTotal,
    moneda: presupuesto.moneda,
    fechaCotizacion: presupuesto.fechaCotizacion.toISOString().split('T')[0],
    seleccionado: presupuesto.seleccionado,
    observaciones: presupuesto.observaciones,
    createdAt: presupuesto.createdAt.toISOString(),
    updatedAt: presupuesto.updatedAt.toISOString(),
  };
}

/**
 * Shape de respuesta de `GET /compras/:id` (sdd/beta-frontend item 1 — G7):
 * detalle completo con items+presupuestos EMBEBIDOS (evita el problema de
 * "sin GET de listado de hijos" documentado en apply-progress — el
 * frontend ya no depende SOLO del cache de sesión poblado por mutaciones).
 */
export interface CompraDetalleResponseDto extends TicketCompraConTicketResponseDto {
  items: ItemCompraResponseDto[];
  presupuestos: PresupuestoResponseDto[];
}

/** Convierte un `CompraDetalle` (ticket + satélite + hijos) al shape de respuesta HTTP. */
export function toCompraDetalleResponseDto(detalle: {
  ticket: TicketEntity;
  ticketCompra: TicketCompraEntity;
  items: ItemCompraEntity[];
  presupuestos: PresupuestoEntity[];
}): CompraDetalleResponseDto {
  return {
    ...toTicketCompraResponseDto(detalle.ticket, detalle.ticketCompra),
    items: detalle.items.map(toItemCompraResponseDto),
    presupuestos: detalle.presupuestos.map(toPresupuestoResponseDto),
  };
}
