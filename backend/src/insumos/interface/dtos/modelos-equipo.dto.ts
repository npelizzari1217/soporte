/**
 * DTOs de entrada/salida de `ModelosEquipoController`.
 *
 * `@MaxLength` de `marca`/`modelo` NO declara el límite: lo importa de
 * `ModeloEquipoEntity`, que es la autoridad. Acá el tope solo se adelanta al
 * borde HTTP para devolver un 400 que nombra el campo, en vez del `throw` de
 * precondición del dominio.
 *
 * El `VarChar(100)`/`VarChar(150)` de Postgres queda como último backstop, y
 * `PrismaExceptionFilter` lo traduce a 4xx si algún caller futuro esquivara las
 * dos capas de arriba.
 *
 * A diferencia de `familias-insumo.dto.ts` y `unidades-medida.dto.ts`, acá NO
 * hay `@Matches` de código: `marca` es texto libre en mayúscula, y
 * "HEWLETT PACKARD" lleva un espacio interno que un patrón de código
 * rechazaría.
 */
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  ModeloEquipoEntity,
  MODELO_EQUIPO_MARCA_MAX_LENGTH,
  MODELO_EQUIPO_MODELO_MAX_LENGTH,
  normalizarMarcaModeloEquipo,
  normalizarModeloModeloEquipo,
} from '../../domain/entities/modelo-equipo.entity';

/**
 * El `@Transform` NO es cosmético: normaliza con la MISMA función del dominio
 * para que `@MaxLength` mida el string que realmente va a la columna.
 * `toUpperCase()` puede agrandar (`'ß'` → `'SS'`), así que medir el crudo
 * dejaría pasar valores que se expanden recién al persistir.
 *
 * @param value Valor crudo del campo `marca`, tal como llega del body.
 * @returns La marca normalizada, o el valor intacto si no es un string (para
 *   que `@IsString` sea quien reporte el error de tipo).
 */
function transformarMarca({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? normalizarMarcaModeloEquipo(value) : value;
}

/**
 * El `@Transform` del `modelo` corre en la fase de transformación de
 * `class-transformer`, o sea ANTES de que `class-validator` mida nada. Ese
 * orden es el punto: un `'   '` sin recortar cumple el `@MinLength(1)` —mide 3
 * caracteres— y se persiste como un modelo sin designación visible. Recortado
 * primero, queda en cadena vacía y el mínimo lo rechaza con un 400 que nombra
 * el campo.
 *
 * Recorta pero NO grita: la designación comercial se lee tal como la escribió
 * el fabricante ("LaserJet Pro M404", no "LASERJET PRO M404").
 *
 * @param value Valor crudo del campo `modelo`, tal como llega del body.
 * @returns El modelo sin espacios de borde, o el valor intacto si no es un
 *   string (para que `@IsString` sea quien reporte el error de tipo).
 */
function transformarModelo({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? normalizarModeloModeloEquipo(value) : value;
}

/** Body de `POST /modelos-equipo`. */
export class CreateModeloEquipoDto {
  @IsString()
  @MinLength(1)
  @Transform(transformarMarca)
  @MaxLength(MODELO_EQUIPO_MARCA_MAX_LENGTH)
  marca!: string;

  @IsString()
  @MinLength(1)
  @Transform(transformarModelo)
  @MaxLength(MODELO_EQUIPO_MODELO_MAX_LENGTH)
  modelo!: string;
}

/** Body de `PATCH /modelos-equipo/:id` — PATCH parcial. */
export class EditModeloEquipoDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @Transform(transformarMarca)
  @MaxLength(MODELO_EQUIPO_MARCA_MAX_LENGTH)
  marca?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @Transform(transformarModelo)
  @MaxLength(MODELO_EQUIPO_MODELO_MAX_LENGTH)
  modelo?: string;
}

/** Body de `PATCH /modelos-equipo/:id/estado` — activar/desactivar. */
export class CambiarEstadoActivoModeloEquipoDto {
  @IsBoolean()
  activo!: boolean;
}

/** Response shape de un modelo de equipo. */
export interface ModeloEquipoResponseDto {
  id: string;
  marca: string;
  modelo: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Convierte una `ModeloEquipoEntity` de dominio al shape de respuesta HTTP.
 *
 * @param entidad Entidad de dominio.
 * @returns El DTO de respuesta, con timestamps en ISO-8601.
 */
export function toModeloEquipoResponseDto(entidad: ModeloEquipoEntity): ModeloEquipoResponseDto {
  return {
    id: entidad.id,
    marca: entidad.marca,
    modelo: entidad.modelo,
    activo: entidad.activo,
    createdAt: entidad.createdAt.toISOString(),
    updatedAt: entidad.updatedAt.toISOString(),
  };
}
