/**
 * DTOs de entrada/salida de `CatalogosController` (T2, PR11 — CRUD editable
 * de `tipos_ticket`/`prioridades`). `estados` es FIJO — sin DTOs de
 * escritura (spec T1: "no hay endpoint de alta/baja/edición de estados").
 *
 * Tarea: T11.3 (PR11 — CatalogosController + DTOs)
 */
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import { PrioridadEntity } from '../../domain/entities/prioridad.entity';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { TipoOperacionEntity } from '../../domain/entities/tipo-operacion.entity';
import { MODULOS } from '../../../shared/domain/modulos';

/** `codigo` de catálogo: mayúsculas/números/guion bajo, sin espacios (consistente con el seed real). */
const CODIGO_PATTERN = /^[A-Z0-9_]+$/;

/** Copia mutable de `MODULOS` para el validador `@IsIn` (class-validator exige array mutable). */
const MODULOS_VALIDOS = [...MODULOS];

/** Body de `POST /catalogos/tipos-ticket` (T2). */
export class CreateTipoTicketDto {
  @IsString()
  @MinLength(1)
  @Matches(CODIGO_PATTERN, {
    message: 'codigo debe ser mayúsculas/números/guion bajo, sin espacios',
  })
  codigo!: string;

  @IsString()
  @MinLength(1)
  nombre!: string;

  /** Módulo funcional dueño del tipo (B2, requerido — separación estricta). */
  @IsIn(MODULOS_VALIDOS, { message: 'modulo debe ser uno de: TICKETS, COMPRAS, EDILICIA, EQUIPOS' })
  modulo!: string;
}

/** Body de `PATCH /catalogos/tipos-ticket/:id` (T2) — PATCH parcial. */
export class EditTipoTicketDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @Matches(CODIGO_PATTERN, {
    message: 'codigo debe ser mayúsculas/números/guion bajo, sin espacios',
  })
  codigo?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  nombre?: string;

  /** Reasignar el módulo dueño del tipo (B2). */
  @IsOptional()
  @IsIn(MODULOS_VALIDOS, { message: 'modulo debe ser uno de: TICKETS, COMPRAS, EDILICIA, EQUIPOS' })
  modulo?: string;
}

/** Body de `POST /catalogos/prioridades` (T2). */
export class CreatePrioridadDto {
  @IsString()
  @MinLength(1)
  @Matches(CODIGO_PATTERN, {
    message: 'codigo debe ser mayúsculas/números/guion bajo, sin espacios',
  })
  codigo!: string;

  @IsString()
  @MinLength(1)
  nombre!: string;

  @IsOptional()
  @IsString()
  color?: string | null;

  @IsInt()
  orden!: number;

  /**
   * Horas objetivo de SLA (movido de `sla_config` a `prioridades`). Omitido
   * o `null` = sin SLA aplicable a esta prioridad.
   */
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @Min(1)
  slaHoras?: number | null;

  @IsOptional()
  @IsBoolean()
  slaActivo?: boolean;
}

/** Body de `PATCH /catalogos/prioridades/:id` (T2) — PATCH parcial. */
export class EditPrioridadDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @Matches(CODIGO_PATTERN, {
    message: 'codigo debe ser mayúsculas/números/guion bajo, sin espacios',
  })
  codigo?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  nombre?: string;

  @IsOptional()
  @IsString()
  color?: string | null;

  @IsOptional()
  @IsInt()
  orden?: number;

  /**
   * Horas objetivo de SLA (movido de `sla_config` a `prioridades`) — PATCH
   * parcial: `undefined` no toca el valor, `null` limpia el SLA
   * explícitamente (sin SLA aplicable).
   */
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @Min(1)
  slaHoras?: number | null;

  @IsOptional()
  @IsBoolean()
  slaActivo?: boolean;
}

/** Body de `PATCH /catalogos/{tipos-ticket|prioridades}/:id/estado` (T2) — activar/desactivar. */
export class CambiarEstadoActivoDto {
  @IsBoolean()
  activo!: boolean;
}

/** Response shape de un tipo de ticket (T2). */
export interface TipoTicketResponseDto {
  id: string;
  codigo: string;
  nombre: string;
  modulo: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Convierte una `TipoTicketEntity` de dominio al shape de respuesta HTTP. */
export function toTipoTicketResponseDto(tipo: TipoTicketEntity): TipoTicketResponseDto {
  return {
    id: tipo.id,
    codigo: tipo.codigo,
    nombre: tipo.nombre,
    modulo: tipo.modulo,
    activo: tipo.activo,
    createdAt: tipo.createdAt.toISOString(),
    updatedAt: tipo.updatedAt.toISOString(),
  };
}

/**
 * Response shape de una prioridad (T2). `slaHoras`/`slaActivo`: SLA movido
 * de la tabla separada `sla_config` a `prioridades` — mismo concepto
 * (horas objetivo de resolución), ahora editable en este mismo form.
 */
export interface PrioridadResponseDto {
  id: string;
  codigo: string;
  nombre: string;
  color: string | null;
  orden: number;
  activo: boolean;
  slaHoras: number | null;
  slaActivo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Convierte una `PrioridadEntity` de dominio al shape de respuesta HTTP. */
export function toPrioridadResponseDto(prioridad: PrioridadEntity): PrioridadResponseDto {
  return {
    id: prioridad.id,
    codigo: prioridad.codigo,
    nombre: prioridad.nombre,
    color: prioridad.color,
    orden: prioridad.orden,
    activo: prioridad.activo,
    slaHoras: prioridad.slaHoras,
    slaActivo: prioridad.slaActivo,
    createdAt: prioridad.createdAt.toISOString(),
    updatedAt: prioridad.updatedAt.toISOString(),
  };
}

/**
 * Response shape de un estado (catálogo FIJO, G1 — sdd/beta-frontend). Sin
 * `EditEstadoDto`/`CreateEstadoDto`: `estados` no tiene CRUD (spec T1).
 */
export interface EstadoResponseDto {
  id: string;
  codigo: string;
  nombre: string;
  color: string | null;
  orden: number;
  activo: boolean;
}

/** Convierte una `EstadoEntity` de dominio al shape de respuesta HTTP. */
export function toEstadoResponseDto(estado: EstadoEntity): EstadoResponseDto {
  return {
    id: estado.id,
    codigo: estado.codigo,
    nombre: estado.nombre,
    color: estado.color,
    orden: estado.orden,
    activo: estado.activo,
  };
}

/**
 * Response shape de un tipo de operación (catálogo FIJO, sdd/beta-frontend).
 * Sin CRUD — mismo criterio que `estados`.
 */
export interface TipoOperacionResponseDto {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
}

/** Convierte una `TipoOperacionEntity` de dominio al shape de respuesta HTTP. */
export function toTipoOperacionResponseDto(tipo: TipoOperacionEntity): TipoOperacionResponseDto {
  return {
    id: tipo.id,
    codigo: tipo.codigo,
    nombre: tipo.nombre,
    activo: tipo.activo,
  };
}
