/**
 * DTOs de entrada/salida de `RespuestasPredefinidasController`.
 *
 * Los topes de largo se importan de la entidad (autoridad); acá solo se adelantan al borde
 * HTTP para devolver un 400 que nombra el campo. `titulo` y `texto` se recortan (trim) antes
 * de validar: un valor de solo espacios cae en `MinLength(1)`.
 */
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  RespuestaPredefinidaEntity,
  RESPUESTA_TEXTO_MAX_LENGTH,
  RESPUESTA_TITULO_MAX_LENGTH,
} from '../../domain/entities/respuesta-predefinida.entity';

const recortar = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Body de `POST /respuestas-predefinidas`. */
export class CreateRespuestaPredefinidaDto {
  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(RESPUESTA_TITULO_MAX_LENGTH)
  titulo!: string;

  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(RESPUESTA_TEXTO_MAX_LENGTH)
  texto!: string;
}

/** Body de `PATCH /respuestas-predefinidas/:id` — PATCH parcial. */
export class EditRespuestaPredefinidaDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(RESPUESTA_TITULO_MAX_LENGTH)
  titulo?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(RESPUESTA_TEXTO_MAX_LENGTH)
  texto?: string;
}

/** Body de `PATCH /respuestas-predefinidas/:id/estado` — activar/desactivar. */
export class CambiarEstadoActivoRespuestaPredefinidaDto {
  @IsBoolean()
  activo!: boolean;
}

/** Query de `GET /respuestas-predefinidas`. `activas=true` filtra las desactivadas. */
export class ListarRespuestasPredefinidasQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  activas?: boolean;
}

/** Response shape de una respuesta predefinida. */
export interface RespuestaPredefinidaResponseDto {
  id: string;
  titulo: string;
  texto: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Convierte la entidad de dominio al shape de respuesta HTTP. */
export function toRespuestaPredefinidaResponseDto(
  respuesta: RespuestaPredefinidaEntity,
): RespuestaPredefinidaResponseDto {
  return {
    id: respuesta.id,
    titulo: respuesta.titulo,
    texto: respuesta.texto,
    activo: respuesta.activo,
    createdAt: respuesta.createdAt.toISOString(),
    updatedAt: respuesta.updatedAt.toISOString(),
  };
}
