/**
 * DTOs de entrada/salida para `EquiposController` (F3-Q1..Q3, PR12).
 *
 * Mismo patrón que `compras/interface/dtos/compras.dto.ts`: `class-validator`
 * valida el body en `POST`/`PATCH`; el `ValidationPipe({whitelist:true,transform:true})`
 * global (`AppModule`) lo aplica automáticamente.
 *
 * `@MaxLength`/`@Min`/`@Max` de equipo y componente NO declaran el límite: lo
 * importan de `EquipoInformaticoEntity`/`ComponenteEquipoEntity`, que son la
 * autoridad (fix defecto "límites de equipos", sdd/limites-db). El
 * `VarChar`/`Decimal` de Postgres queda como último backstop, y
 * `PrismaExceptionFilter` (sdd/filtro-prisma) lo traduce a 4xx si algún
 * caller futuro esquivara las dos capas de arriba.
 *
 * Tarea: T12.6.
 */
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  CONDICIONES_STOCK,
  CondicionStock,
} from '../../../insumos/domain/entities/tipo-movimiento-insumo';
import { transformarMotivo } from '../../../insumos/interface/dtos/movimientos-insumo.dto';
import { MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH } from '../../../insumos/domain/entities/movimiento-insumo.entity';
import { EsNumeroConDecimales } from '../../../shared/interface/validators/es-numero-con-decimales';
import {
  TICKET_TITULO_MAX_LENGTH,
  TicketEntity,
} from '../../../tickets/domain/entities/ticket.entity';
import {
  EquipoInformaticoEntity,
  EQUIPO_NOMBRE_MAX_LENGTH,
  EQUIPO_NUMERO_SERIE_MAX_LENGTH,
  EQUIPO_MARCA_MAX_LENGTH,
  EQUIPO_MODELO_MAX_LENGTH,
  EQUIPO_UBICACION_MAX_LENGTH,
  EQUIPO_VALOR_MONETARIO_MAXIMO,
  EQUIPO_VALOR_MONETARIO_MINIMO,
  normalizarUbicacion,
} from '../../domain/entities/equipo-informatico.entity';
import {
  ComponenteEquipoEntity,
  COMPONENTE_DESCRIPCION_MAX_LENGTH,
  COMPONENTE_NUMERO_SERIE_MAX_LENGTH,
  COMPONENTE_CAPACIDAD_MAX_LENGTH,
  DESTINOS_RETIRO_COMPONENTE,
  DestinoRetiroComponente,
} from '../../domain/entities/componente-equipo.entity';
import { TicketSoporteEntity } from '../../domain/entities/ticket-soporte.entity';
import { ComponenteEquipoConTipo } from '../../application/use-cases/obtener-equipo.use-case';
import { EquipoDeTicketResultado } from '../../application/use-cases/obtener-equipo-de-ticket.use-case';

// ─── Input DTOs ───────────────────────────────────────────────────────────────

/** Body de `POST /equipos` (F3-Q1). */
export class CreateEquipoHttpDto {
  @IsString()
  @MinLength(1)
  @MaxLength(EQUIPO_NOMBRE_MAX_LENGTH)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(EQUIPO_NUMERO_SERIE_MAX_LENGTH)
  numeroSerie?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(EQUIPO_MARCA_MAX_LENGTH)
  marca?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(EQUIPO_MODELO_MAX_LENGTH)
  modelo?: string | null;

  @IsOptional()
  @IsDateString()
  fechaAdquisicion?: string | null;

  /**
   * Ubicación como texto libre (el backend la normaliza a mayúscula). El
   * `@Transform` mide el valor YA normalizado con `@MaxLength`: `ubicacion`
   * se expande al normalizar (`toUpperCase()` no preserva longitud, ej. 'ß' →
   * 'SS'), así que medir el crudo dejaba pasar valores que Postgres
   * (VarChar(255)) rechazaba con un 500 sin nombrar el campo (fix
   * "precondición de dominio alcanzable → 4xx"). Molde: `reparaciones.dto.ts`.
   */
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizarUbicacion(value) : value,
  )
  @MaxLength(EQUIPO_UBICACION_MAX_LENGTH)
  ubicacion?: string | null;

  /**
   * Modelo del catálogo (`modelos_equipo`). OPCIONAL a propósito: un clon
   * armado en casa no tiene modelo y se da de alta igual — simplemente no
   * participa de la compatibilidad con insumos. `ParseUUIDPipe` no aplica acá
   * porque viaja en el body, así que lo valida `@IsUUID`: sin eso el id crudo
   * llega a Prisma contra una columna `@db.Uuid` y devuelve 500 en vez de 400.
   */
  @IsOptional()
  @IsUUID()
  modeloEquipoId?: string | null;

  /** Importe/valor del equipo (2 decimales, no negativo, techo de negocio). */
  @IsOptional()
  @EsNumeroConDecimales(2)
  @Min(EQUIPO_VALOR_MONETARIO_MINIMO)
  @Max(EQUIPO_VALOR_MONETARIO_MAXIMO)
  importe?: number | null;

  @IsOptional()
  @IsDateString()
  fechaValoracion?: string | null;

  @IsOptional()
  @IsString()
  observaciones?: string | null;

  /**
   * Valor residual (post-depreciación, 2 decimales, no negativo, techo de
   * negocio). El % de depreciación NO se persiste.
   */
  @IsOptional()
  @EsNumeroConDecimales(2)
  @Min(EQUIPO_VALOR_MONETARIO_MINIMO)
  @Max(EQUIPO_VALOR_MONETARIO_MAXIMO)
  valorResidual?: number | null;

  @IsOptional()
  @IsDateString()
  fechaValorResidual?: string | null;
}

/** Body de `PATCH /equipos/:id` (F3-Q1). Todos los campos opcionales (PATCH semántico). */
export class EditarEquipoHttpDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(EQUIPO_NOMBRE_MAX_LENGTH)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(EQUIPO_NUMERO_SERIE_MAX_LENGTH)
  numeroSerie?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(EQUIPO_MARCA_MAX_LENGTH)
  marca?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(EQUIPO_MODELO_MAX_LENGTH)
  modelo?: string | null;

  @IsOptional()
  @IsDateString()
  fechaAdquisicion?: string | null;

  /** Ver JSDoc de `CreateEquipoHttpDto.ubicacion` — mismo `@Transform`. */
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizarUbicacion(value) : value,
  )
  @MaxLength(EQUIPO_UBICACION_MAX_LENGTH)
  ubicacion?: string | null;

  /**
   * Modelo del catálogo (`modelos_equipo`). OPCIONAL a propósito: un clon
   * armado en casa no tiene modelo y se da de alta igual — simplemente no
   * participa de la compatibilidad con insumos. `ParseUUIDPipe` no aplica acá
   * porque viaja en el body, así que lo valida `@IsUUID`: sin eso el id crudo
   * llega a Prisma contra una columna `@db.Uuid` y devuelve 500 en vez de 400.
   */
  @IsOptional()
  @IsUUID()
  modeloEquipoId?: string | null;

  @IsOptional()
  @EsNumeroConDecimales(2)
  @Min(EQUIPO_VALOR_MONETARIO_MINIMO)
  @Max(EQUIPO_VALOR_MONETARIO_MAXIMO)
  importe?: number | null;

  @IsOptional()
  @IsDateString()
  fechaValoracion?: string | null;

  @IsOptional()
  @IsString()
  observaciones?: string | null;

  @IsOptional()
  @EsNumeroConDecimales(2)
  @Min(EQUIPO_VALOR_MONETARIO_MINIMO)
  @Max(EQUIPO_VALOR_MONETARIO_MAXIMO)
  valorResidual?: number | null;

  @IsOptional()
  @IsDateString()
  fechaValorResidual?: string | null;
}

/**
 * Body de `POST /soporte` (F3-Q4). `solicitanteId`/`autorId` vienen del JWT.
 * `equipoId` OPCIONAL.
 *
 * `titulo` crea un `Ticket` vía `TicketEntity.create()` — el `@MaxLength`
 * importa `TICKET_TITULO_MAX_LENGTH` de esa entidad, que es la autoridad
 * (fix defecto "límite de largo de titulo").
 */
export class CreateTicketSoporteHttpDto {
  @IsString()
  @MinLength(1)
  @MaxLength(TICKET_TITULO_MAX_LENGTH)
  titulo!: string;

  @IsOptional()
  @IsString()
  descripcion?: string | null;

  @IsUUID()
  prioridadId!: string;

  @IsOptional()
  @IsUUID()
  equipoId?: string | null;

  @IsOptional()
  @IsString()
  descripcionProblema?: string | null;
}

/** Body de `POST /soporte/:id/solucion` (F3-Q5). */
export class RegistrarSolucionHttpDto {
  @IsString()
  @MinLength(1)
  solucion!: string;
}

/**
 * Body de `POST /equipos/:id/componentes`. Un solo camino de alta: `insumoId`
 * (repuesto del catálogo) es obligatorio y el tipo se deriva de su familia.
 * `tipoComponenteCodigo` NO se declara: si llega, el `ValidationPipe` global
 * (`whitelist: true`) lo descarta en silencio (ADR-2).
 */
export class CreateComponenteHttpDto {
  /** Repuesto del catálogo a instalar. */
  @IsUUID()
  insumoId!: string;

  /**
   * Descuenta 1 unidad del depósito (SALIDA) al instalar. Omitido = `true`.
   * Sin conversión implícita: un `"false"` en texto vuelve 400.
   */
  @IsOptional()
  @IsBoolean()
  descontarStock?: boolean;

  /**
   * Condición del saldo del que sale la unidad. Omitida = `NUEVO`. Solo rige
   * con `descontarStock` verdadero: con `false` el controller la ignora (ADR-7).
   */
  @IsOptional()
  @IsIn(CONDICIONES_STOCK)
  condicion?: CondicionStock;

  @IsOptional()
  @IsString()
  @MaxLength(COMPONENTE_DESCRIPCION_MAX_LENGTH)
  descripcion?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(COMPONENTE_NUMERO_SERIE_MAX_LENGTH)
  numeroSerie?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(COMPONENTE_CAPACIDAD_MAX_LENGTH)
  capacidad?: string | null;
}

/**
 * Body de `PATCH /equipos/:id/componentes/:componenteId`. PATCH semántico:
 * `undefined` = no tocar. Solo `descripcion`, `numeroSerie` y `capacidad`: el
 * tipo y el repuesto no se editan (sdd/catalogo-unico-componentes, ADR-2). Un
 * `tipoComponenteCodigo` o `insumoId` sobrante lo descarta el `whitelist`.
 */
export class EditarComponenteHttpDto {
  @IsOptional()
  @IsString()
  @MaxLength(COMPONENTE_DESCRIPCION_MAX_LENGTH)
  descripcion?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(COMPONENTE_NUMERO_SERIE_MAX_LENGTH)
  numeroSerie?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(COMPONENTE_CAPACIDAD_MAX_LENGTH)
  capacidad?: string | null;
}

/**
 * Body de `POST /equipos/:id/componentes/:componenteId/baja` (sdd/stock-usado-componentes).
 * `destino` es obligatorio: elegir entre devolver la pieza al stock usado o
 * descartarla lo decide el usuario, no el sistema. El motivo es opcional en
 * `STOCK_USADO` y obligatorio en `DESCARTE`; esa segunda regla es de dominio
 * (422), no de forma, así que no se duplica acá. El motivo se normaliza igual
 * que en los movimientos de insumo.
 */
export class RetirarComponenteHttpDto {
  @IsIn(DESTINOS_RETIRO_COMPONENTE)
  destino!: DestinoRetiroComponente;

  @IsOptional()
  @IsString()
  @Transform(transformarMotivo)
  @MaxLength(MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH)
  motivo?: string | null;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

/** Shape de respuesta de un equipo informático. */
export interface EquipoResponseDto {
  id: string;
  nombre: string;
  numeroSerie: string | null;
  marca: string | null;
  modelo: string | null;
  fechaAdquisicion: string | null;
  ubicacion: string | null;
  modeloEquipoId: string | null;
  importe: number | null;
  fechaValoracion: string | null;
  observaciones: string | null;
  valorResidual: number | null;
  fechaValorResidual: string | null;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Convierte `EquipoInformaticoEntity` al shape de respuesta HTTP. */
export function toEquipoResponseDto(equipo: EquipoInformaticoEntity): EquipoResponseDto {
  return {
    id: equipo.id,
    nombre: equipo.nombre,
    numeroSerie: equipo.numeroSerie,
    marca: equipo.marca,
    modelo: equipo.modelo,
    fechaAdquisicion: equipo.fechaAdquisicion ? equipo.fechaAdquisicion.toISOString() : null,
    ubicacion: equipo.ubicacion,
    modeloEquipoId: equipo.modeloEquipoId,
    importe: equipo.importe,
    fechaValoracion: equipo.fechaValoracion ? equipo.fechaValoracion.toISOString() : null,
    observaciones: equipo.observaciones,
    valorResidual: equipo.valorResidual,
    fechaValorResidual: equipo.fechaValorResidual ? equipo.fechaValorResidual.toISOString() : null,
    activo: equipo.activo,
    createdAt: equipo.createdAt.toISOString(),
    updatedAt: equipo.updatedAt.toISOString(),
  };
}

/**
 * Shape de respuesta de un componente de equipo (`POST /equipos/:id/componentes`,
 * `PATCH .../componentes/:id`, `PATCH .../componentes/:id/reactivar`). PR4b:
 * `tipoComponenteCodigo` reemplaza a `tipoComponenteId` — shape básico, SIN
 * enriquecer (el use case de alta no resuelve `nombre` del catálogo MASTER,
 * solo verifica `activo`).
 *
 * `activo`/`deletedAt` (listado enriquecido de componentes): derivados de
 * `deletedAt == null` — necesarios para que el frontend distinga
 * activos/dados de baja en el listado embebido de `GET /equipos/:id`.
 */
export interface ComponenteResponseDto {
  id: string;
  equipoId: string;
  /** Repuesto del catálogo vinculado; el tipo ya no viaja en esta respuesta (ADR-6). */
  insumoId: string;
  descripcion: string | null;
  /** Con unidad, el serial de la unidad (resuelto al leer); si no, el texto del componente. */
  numeroSerie: string | null;
  /** Unidad de insumo `SERIE` que lleva el componente, o `null` (legado / sin seguimiento por serie). */
  unidadId: string | null;
  capacidad: string | null;
  activo: boolean;
  deletedAt: string | null;
  /** Registro del retiro (ADR-7): `null` mientras el componente está activo. */
  bajaDestino: string | null;
  bajaMotivo: string | null;
  bajaMovimientoId: string | null;
  bajaUsuarioId: string | null;
  /** `true` si volvió al stock como usado sin una SALIDA de instalación vinculada. */
  bajaSinSalidaPrevia: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Convierte `ComponenteEquipoEntity` al shape de respuesta HTTP básico. */
export function toComponenteResponseDto(componente: ComponenteEquipoEntity): ComponenteResponseDto {
  return {
    id: componente.id,
    equipoId: componente.equipoId,
    insumoId: componente.insumoId,
    descripcion: componente.descripcion,
    numeroSerie: componente.numeroSerie,
    unidadId: componente.unidadId,
    capacidad: componente.capacidad,
    activo: componente.activo,
    deletedAt: componente.deletedAt ? componente.deletedAt.toISOString() : null,
    bajaDestino: componente.bajaDestino,
    bajaMotivo: componente.bajaMotivo,
    bajaMovimientoId: componente.bajaMovimientoId,
    bajaUsuarioId: componente.bajaUsuarioId,
    bajaSinSalidaPrevia: componente.bajaSinSalidaPrevia,
    createdAt: componente.createdAt.toISOString(),
    updatedAt: componente.updatedAt.toISOString(),
  };
}

/**
 * Shape de respuesta de un componente EMBEBIDO en el detalle de equipo
 * (`GET /equipos/:id`) — extiende el shape básico con `tipoNombre`/
 * `tipoActivo` resueltos en batch desde el catálogo MASTER
 * (`ObtenerEquipoUseCase`, PR4b).
 */
export interface ComponenteConTipoResponseDto extends ComponenteResponseDto {
  tipoNombre: string | null;
  tipoActivo: boolean;
}

/** Convierte un `ComponenteEquipoConTipo` (componente + nombre/estado MASTER) al shape de respuesta HTTP. */
export function toComponenteConTipoResponseDto(
  item: ComponenteEquipoConTipo,
): ComponenteConTipoResponseDto {
  return {
    ...toComponenteResponseDto(item.componente),
    tipoNombre: item.tipoNombre,
    tipoActivo: item.tipoActivo,
  };
}

/**
 * Shape de respuesta de `GET /equipos/:id` (sdd/beta-frontend item 1 — G7):
 * detalle con `componentes` EMBEBIDOS — antes el frontend dependía solo del
 * cache de sesión poblado por las mutaciones de agregar/eliminar componente.
 */
export interface EquipoDetalleResponseDto extends EquipoResponseDto {
  componentes: ComponenteConTipoResponseDto[];
}

/** Convierte un `EquipoDetalle` (equipo + componentes con tipo) al shape de respuesta HTTP. */
export function toEquipoDetalleResponseDto(detalle: {
  equipo: EquipoInformaticoEntity;
  componentes: ComponenteEquipoConTipo[];
}): EquipoDetalleResponseDto {
  return {
    ...toEquipoResponseDto(detalle.equipo),
    componentes: detalle.componentes.map(toComponenteConTipoResponseDto),
  };
}

/**
 * Shape de respuesta unificado para un ticket de soporte (F3-Q4).
 * `id` = `ticketSoporte.id` (satélite); `ticketId` = id del `Ticket` base.
 */
export interface TicketSoporteConTicketResponseDto {
  id: string;
  ticketId: string;
  numero: string;
  titulo: string;
  estadoId: string;
  equipoId: string | null;
  descripcionProblema: string | null;
  solucionAplicada: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Convierte `{ticket, ticketSoporte}` al shape de respuesta unificado. */
export function toTicketSoporteResponseDto(
  ticket: TicketEntity,
  ticketSoporte: TicketSoporteEntity,
): TicketSoporteConTicketResponseDto {
  return {
    id: ticketSoporte.id,
    ticketId: ticket.id,
    numero: ticket.numero,
    titulo: ticket.titulo,
    estadoId: ticket.estadoId,
    equipoId: ticketSoporte.equipoId,
    descripcionProblema: ticketSoporte.descripcionProblema,
    solucionAplicada: ticketSoporte.solucionAplicada,
    createdAt: ticketSoporte.createdAt.toISOString(),
    updatedAt: ticketSoporte.updatedAt.toISOString(),
  };
}

/**
 * Shape de respuesta de solo el satélite `ticket_soporte` (sin datos del
 * ticket base) — usado por `POST /soporte/:id/solucion`, que no vuelve a
 * cargar el `Ticket` base.
 */
export interface TicketSoporteResponseDto {
  id: string;
  ticketId: string;
  equipoId: string | null;
  descripcionProblema: string | null;
  solucionAplicada: string | null;
  updatedAt: string;
}

/** Convierte `TicketSoporteEntity` (solo satélite) al shape de respuesta HTTP. */
export function toTicketSoporteOnlyResponseDto(
  ticketSoporte: TicketSoporteEntity,
): TicketSoporteResponseDto {
  return {
    id: ticketSoporte.id,
    ticketId: ticketSoporte.ticketId,
    equipoId: ticketSoporte.equipoId,
    descripcionProblema: ticketSoporte.descripcionProblema,
    solucionAplicada: ticketSoporte.solucionAplicada,
    updatedAt: ticketSoporte.updatedAt.toISOString(),
  };
}

/**
 * Shape de respuesta de `GET /soporte/:ticketId` — equipo vinculado al
 * ticket de soporte (o `null` si el ticket no tiene satélite `ticket_soporte`
 * o no tiene equipo asociado). Usado por el frontend para resaltar el
 * "equipo en mantenimiento" en el detalle del ticket.
 */
export interface EquipoDeTicketResponseDto {
  equipo: { id: string; nombre: string; numeroSerie: string | null } | null;
}

/** Convierte `EquipoDeTicketResultado` al shape de respuesta HTTP. */
export function toEquipoDeTicketResponseDto(
  resultado: EquipoDeTicketResultado,
): EquipoDeTicketResponseDto {
  return { equipo: resultado.equipo };
}
