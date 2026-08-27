/**
 * DTOs de entrada/salida para `PreventivoController` (WU-4).
 *
 * Mismo patrón que `equipos/interface/dtos/equipos.dto.ts`: `class-validator`
 * valida el body en `POST`/`PATCH`; el `ValidationPipe({whitelist:true,transform:true})`
 * global (`AppModule`) lo aplica automáticamente.
 *
 * SIN validación del objetivo excluyente (equipo XOR ubicación) EN EL DTO —
 * la AUTORIDAD es `PlanPreventivoEntity.create()`/`editar()` (ADR-PV1).
 * Duplicarla acá crearía dos fuentes de verdad que pueden desincronizarse.
 *
 * `@MaxLength`/`@Max` de `titulo`/`ubicacion`/`intervaloValor` SÍ espejan a
 * los techos del dominio (`TITULO_MAX_LENGTH`/`UBICACION_MAX_LENGTH`/
 * `INTERVALO_VALOR_MAXIMO` de `plan-preventivo.entity.ts`) — a diferencia
 * del XOR, este es un límite estructural de un único campo, no una regla de
 * negocio entre campos: espejarlo acá da un 422 con mensaje ANTES de tocar
 * el use case, en vez de esperar a que el dominio lo rechace igual. Es la
 * misma clase de incidente que documenta `SectorInexistenteError` en
 * `compras/domain/errors/compras.errors.ts`: sin este guard, el `INSERT`
 * revienta con un `PrismaClientKnownRequestError` sin mapear (500 crudo).
 *
 * Tarea: 4.4. Fix post-verify (WU-8, hallazgo "límites de la base más
 * estrictos que el dominio").
 */
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  INTERVALO_VALOR_MAXIMO,
  IntervaloUnidad,
  PlanPreventivoEntity,
  TITULO_MAX_LENGTH,
  UBICACION_MAX_LENGTH,
  UNIDADES_INTERVALO,
} from '../../domain/entities/plan-preventivo.entity';
import { PreventivoGeneracionProps } from '../../domain/ports/i-preventivo-generacion.repository';

// ─── Input DTOs ───────────────────────────────────────────────────────────

/** Body de `POST /preventivo/planes`. */
export class CreatePlanPreventivoHttpDto {
  @IsString()
  @MinLength(1)
  @MaxLength(TITULO_MAX_LENGTH)
  titulo!: string;

  @IsOptional()
  @IsString()
  instrucciones?: string | null;

  @IsOptional()
  @IsUUID()
  equipoId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(UBICACION_MAX_LENGTH)
  ubicacion?: string | null;

  @IsUUID()
  prioridadId!: string;

  @IsUUID()
  responsableId!: string;

  @IsInt()
  @IsPositive()
  @Max(INTERVALO_VALOR_MAXIMO)
  intervaloValor!: number;

  @IsIn(UNIDADES_INTERVALO)
  intervaloUnidad!: IntervaloUnidad;

  @IsDateString()
  fechaInicio!: string;
}

/** Body de `PATCH /preventivo/planes/:id`. PATCH semántico (`undefined` = no tocar). */
export class EditarPlanPreventivoHttpDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(TITULO_MAX_LENGTH)
  titulo?: string;

  @IsOptional()
  @IsString()
  instrucciones?: string | null;

  @IsOptional()
  @IsUUID()
  equipoId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(UBICACION_MAX_LENGTH)
  ubicacion?: string | null;

  @IsOptional()
  @IsUUID()
  prioridadId?: string;

  @IsOptional()
  @IsUUID()
  responsableId?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(INTERVALO_VALOR_MAXIMO)
  intervaloValor?: number;

  @IsOptional()
  @IsIn(UNIDADES_INTERVALO)
  intervaloUnidad?: IntervaloUnidad;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

// ─── Response DTOs ──────────────────────────────────────────────────────────

/** Shape de respuesta de un plan de mantenimiento preventivo. */
export interface PlanPreventivoResponseDto {
  id: string;
  titulo: string;
  instrucciones: string | null;
  equipoId: string | null;
  ubicacion: string | null;
  prioridadId: string;
  responsableId: string;
  intervaloValor: number;
  intervaloUnidad: IntervaloUnidad;
  fechaInicio: string;
  proximaEjecucionEn: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Convierte `PlanPreventivoEntity` al shape de respuesta HTTP. */
export function toPlanPreventivoResponseDto(plan: PlanPreventivoEntity): PlanPreventivoResponseDto {
  return {
    id: plan.id,
    titulo: plan.titulo,
    instrucciones: plan.instrucciones,
    equipoId: plan.equipoId,
    ubicacion: plan.ubicacion,
    prioridadId: plan.prioridadId,
    responsableId: plan.responsableId,
    intervaloValor: plan.intervaloValor,
    intervaloUnidad: plan.intervaloUnidad,
    fechaInicio: plan.fechaInicio.toISOString(),
    proximaEjecucionEn: plan.proximaEjecucionEn.toISOString(),
    activo: plan.activo,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

/** Shape de respuesta de una fila de auditoría de generación (WU-4/WU-7). */
export interface PreventivoGeneracionResponseDto {
  id: string;
  planId: string;
  fechaProgramada: string;
  resultado: string;
  ticketId: string | null;
  createdAt: string;
}

/** Convierte `PreventivoGeneracionProps` al shape de respuesta HTTP. */
export function toPreventivoGeneracionResponseDto(
  generacion: PreventivoGeneracionProps,
): PreventivoGeneracionResponseDto {
  return {
    id: generacion.id,
    planId: generacion.planId,
    fechaProgramada: generacion.fechaProgramada.toISOString(),
    resultado: generacion.resultado,
    ticketId: generacion.ticketId,
    createdAt: generacion.createdAt.toISOString(),
  };
}
