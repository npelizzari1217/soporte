/**
 * DTOs de entrada/salida de `FamiliasInsumoController`.
 *
 * `@MaxLength` de `codigo`/`nombre` NO declara el límite: lo importa de
 * `FamiliaInsumoEntity`, que es la autoridad. Acá el tope solo se adelanta al
 * borde HTTP para devolver un 400 que nombra el campo, en vez del `throw` de
 * precondición del dominio.
 *
 * El `VarChar(30)`/`VarChar(100)` de Postgres queda como último backstop, y
 * `PrismaExceptionFilter` lo traduce a 4xx si algún caller futuro esquivara las
 * dos capas de arriba.
 */
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  FamiliaInsumoEntity,
  FAMILIA_INSUMO_CODIGO_MAX_LENGTH,
  FAMILIA_INSUMO_NOMBRE_MAX_LENGTH,
  normalizarCodigoFamiliaInsumo,
  normalizarNombreFamiliaInsumo,
} from '../../domain/entities/familia-insumo.entity';

/** `codigo` de catálogo: mayúsculas/números/guion bajo, sin espacios (consistente con sectores/tipos_ticket). */
const CODIGO_PATTERN = /^[A-Z0-9_]+$/;

/**
 * El `@Transform` NO es cosmético: normaliza con la MISMA función del dominio
 * para que `@MaxLength` mida el string que realmente va a la columna.
 * `toUpperCase()` puede agrandar (`'ß'` → `'SS'`), así que medir el crudo
 * dejaría pasar valores que se expanden recién al persistir.
 *
 * @param value Valor crudo del campo `codigo`, tal como llega del body.
 * @returns El código normalizado, o el valor intacto si no es un string (para
 *   que `@IsString` sea quien reporte el error de tipo).
 */
function transformarCodigo({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? normalizarCodigoFamiliaInsumo(value) : value;
}

/**
 * El `@Transform` del `nombre` corre en la fase de transformación de
 * `class-transformer`, o sea ANTES de que `class-validator` mida nada. Ese
 * orden es el punto: un `'   '` sin recortar cumple el `@MinLength(1)` —mide 3
 * caracteres— y se persiste como una familia sin nombre visible. Recortado
 * primero, queda en cadena vacía y el mínimo lo rechaza con un 400 que nombra
 * el campo.
 *
 * @param value Valor crudo del campo `nombre`, tal como llega del body.
 * @returns El nombre sin espacios de borde, o el valor intacto si no es un
 *   string (para que `@IsString` sea quien reporte el error de tipo).
 */
function transformarNombre({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? normalizarNombreFamiliaInsumo(value) : value;
}

/** Body de `POST /familias-insumo`. */
export class CreateFamiliaInsumoDto {
  @IsString()
  @MinLength(1)
  @Transform(transformarCodigo)
  @MaxLength(FAMILIA_INSUMO_CODIGO_MAX_LENGTH)
  @Matches(CODIGO_PATTERN, {
    message: 'codigo debe ser mayúsculas/números/guion bajo, sin espacios',
  })
  codigo!: string;

  @IsString()
  @MinLength(1)
  @Transform(transformarNombre)
  @MaxLength(FAMILIA_INSUMO_NOMBRE_MAX_LENGTH)
  nombre!: string;
}

/** Body de `PATCH /familias-insumo/:id` — PATCH parcial. */
export class EditFamiliaInsumoDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @Transform(transformarCodigo)
  @MaxLength(FAMILIA_INSUMO_CODIGO_MAX_LENGTH)
  @Matches(CODIGO_PATTERN, {
    message: 'codigo debe ser mayúsculas/números/guion bajo, sin espacios',
  })
  codigo?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @Transform(transformarNombre)
  @MaxLength(FAMILIA_INSUMO_NOMBRE_MAX_LENGTH)
  nombre?: string;
}

/** Body de `PATCH /familias-insumo/:id/estado` — activar/desactivar. */
export class CambiarEstadoActivoFamiliaInsumoDto {
  @IsBoolean()
  activo!: boolean;
}

/** Response shape de una familia de insumo. */
export interface FamiliaInsumoResponseDto {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Convierte una `FamiliaInsumoEntity` de dominio al shape de respuesta HTTP.
 *
 * @param familia Entidad de dominio.
 * @returns El DTO de respuesta, con timestamps en ISO-8601.
 */
export function toFamiliaInsumoResponseDto(familia: FamiliaInsumoEntity): FamiliaInsumoResponseDto {
  return {
    id: familia.id,
    codigo: familia.codigo,
    nombre: familia.nombre,
    activo: familia.activo,
    createdAt: familia.createdAt.toISOString(),
    updatedAt: familia.updatedAt.toISOString(),
  };
}
