/**
 * DTOs de entrada/salida de `InsumosController`.
 *
 * Ningún `@MaxLength` declara su número: todos lo IMPORTAN de las entidades de
 * dominio, que son la autoridad del límite. Acá el tope solo se adelanta al
 * borde HTTP para devolver un 400 que nombra el campo, en vez del `throw` de
 * precondición del dominio; el `VarChar` de Postgres queda como último
 * backstop.
 *
 * Los `@Transform` aplican las MISMAS funciones de normalización del dominio.
 * Eso no es cosmético: `class-transformer` corre la transformación ANTES de
 * que `class-validator` mida nada, y `toUpperCase()` puede AGRANDAR el string
 * (`'ß'` → `'SS'`), así que medir el valor crudo dejaría pasar valores que se
 * expanden recién al persistir. Es el defecto que ya mordió a
 * `tipos-componente` en este repo.
 */
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { EsNumeroConDecimales } from '../../../shared/interface/validators/es-numero-con-decimales';
import {
  InsumoEntity,
  INSUMO_CODIGOS_ALTERNATIVOS_MAX,
  INSUMO_CODIGO_MAX_LENGTH,
  INSUMO_COMPATIBILIDAD_MAX,
  INSUMO_NOMBRE_MAX_LENGTH,
  INSUMO_STOCK_MINIMO_DECIMALES,
  INSUMO_STOCK_MINIMO_MAXIMO,
  INSUMO_STOCK_MINIMO_MINIMO,
  normalizarCodigoInsumo,
  normalizarNombreInsumo,
} from '../../domain/entities/insumo.entity';
import {
  InsumoCodigoAlternativoEntity,
  INSUMO_CODIGO_ALTERNATIVO_CODIGO_MAX_LENGTH,
  INSUMO_CODIGO_ALTERNATIVO_FABRICANTE_MAX_LENGTH,
  normalizarCodigoAlternativo,
  normalizarFabricanteCodigoAlternativo,
} from '../../domain/entities/insumo-codigo-alternativo.entity';
import {
  CompatibilidadModelo,
  COMPATIBILIDAD_ROL_MAX_LENGTH,
  normalizarRolCompatibilidad,
} from '../../domain/entities/compatibilidad-modelo';

/**
 * Normaliza el código del insumo con la función del dominio. Deja pasar
 * intacto lo que no es un string para que `@IsString` sea quien reporte el
 * error de tipo.
 *
 * @param value Valor crudo del campo `codigo`, tal como llega del body.
 * @returns El código recortado y en mayúscula, o el valor intacto.
 */
function transformarCodigo({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? normalizarCodigoInsumo(value) : value;
}

/**
 * Recorta el nombre —sin gritarlo— con la función del dominio. El recorte
 * corre ANTES del `@MinLength(1)`: un `'   '` sin recortar mide 3 caracteres,
 * pasa el mínimo y se persiste como un insumo sin nombre visible.
 *
 * @param value Valor crudo del campo `nombre`, tal como llega del body.
 * @returns El nombre sin espacios de borde, o el valor intacto si no es string.
 */
function transformarNombre({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? normalizarNombreInsumo(value) : value;
}

/**
 * @param value Valor crudo del campo `codigo` de un código alternativo.
 * @returns El código recortado y en mayúscula, o el valor intacto si no es string.
 */
function transformarCodigoAlternativo({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? normalizarCodigoAlternativo(value) : value;
}

/**
 * @param value Valor crudo del campo `fabricante` de un código alternativo.
 * @returns El fabricante recortado y en mayúscula, `null` si venía vacío o de
 *   solo espacios, o el valor intacto si no es string.
 */
function transformarFabricante({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? normalizarFabricanteCodigoAlternativo(value) : value;
}

/**
 * @param value Valor crudo del campo `rol` de una compatibilidad.
 * @returns El rol recortado y en mayúscula, `null` si venía vacío o de solo
 *   espacios, o el valor intacto si no es string.
 */
function transformarRol({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? normalizarRolCompatibilidad(value) : value;
}

/** Un código alternativo dentro del body de alta o edición de un insumo. */
export class CodigoAlternativoInputDto {
  @IsString()
  @MinLength(1)
  @Transform(transformarCodigoAlternativo)
  @MaxLength(INSUMO_CODIGO_ALTERNATIVO_CODIGO_MAX_LENGTH)
  codigo!: string;

  /**
   * Ausente, vacío o `null` significan lo mismo: el código GENÉRICO. Por eso
   * va con `@IsOptional`, que también deja pasar el `null` que produce el
   * `@Transform` cuando el usuario manda espacios.
   */
  @IsOptional()
  @IsString()
  @Transform(transformarFabricante)
  @MaxLength(INSUMO_CODIGO_ALTERNATIVO_FABRICANTE_MAX_LENGTH)
  fabricante?: string | null;
}

/** Un modelo de equipo compatible dentro del body de alta o edición de un insumo. */
export class CompatibilidadInputDto {
  /**
   * Viaja en el BODY, así que `ParseUUIDPipe` no lo alcanza: mismo criterio
   * que `familiaId`, y por el mismo motivo —sin `@IsUUID` el id crudo llega a
   * Prisma contra una columna `@db.Uuid` y el 22P02 de Postgres sale como 500—.
   */
  @IsUUID()
  modeloEquipoId!: string;

  /**
   * Ausente, vacío o `null` significan lo mismo: el insumo no cumple ningún rol
   * distinguible en ese modelo. Por eso va con `@IsOptional`, que también deja
   * pasar el `null` que produce el `@Transform` cuando el usuario manda
   * espacios — mismo criterio que el `fabricante` del código alternativo.
   *
   * El `@MaxLength` importa su número del dominio y mide DESPUÉS del
   * `@Transform`: `toUpperCase()` puede AGRANDAR el string, así que 20
   * caracteres tipeados pueden ser 40 en una columna `VarChar(20)`.
   */
  @IsOptional()
  @IsString()
  @Transform(transformarRol)
  @MaxLength(COMPATIBILIDAD_ROL_MAX_LENGTH)
  rol?: string | null;
}

/** Body de `POST /insumos`. */
export class CreateInsumoDto {
  @IsString()
  @MinLength(1)
  @Transform(transformarCodigo)
  @MaxLength(INSUMO_CODIGO_MAX_LENGTH)
  codigo!: string;

  @IsString()
  @MinLength(1)
  @Transform(transformarNombre)
  @MaxLength(INSUMO_NOMBRE_MAX_LENGTH)
  nombre!: string;

  /**
   * Viaja en el BODY, así que `ParseUUIDPipe` no lo alcanza: sin `@IsUUID` el
   * id crudo llega a Prisma contra una columna `@db.Uuid`, Postgres tira
   * `22P02` —que no está en el mapa cerrado de `PrismaExceptionFilter`— y sale
   * un 500 en vez de un 400. Mismo criterio que `modeloEquipoId` en
   * `equipos.dto.ts`.
   */
  @IsUUID()
  familiaId!: string;

  /** Mismo criterio que `familiaId`. */
  @IsUUID()
  unidadMedidaId!: string;

  /**
   * Punto de reposición. Ausente o `null` es "sin punto definido", que NO es
   * cero — de ahí el `@IsOptional`, que deja pasar el `null` explícito.
   *
   * El tope de decimales no es una formalidad: Postgres NO falla ante un
   * tercer decimal en un `DECIMAL(10,2)`, lo REDONDEA en silencio, y el usuario
   * guardaría una cosa y le quedaría otra. El número lo importa del dominio, y
   * quien lo mide es `@EsNumeroConDecimales` — ver su JSDoc para por qué el
   * conteo no se delega en `@IsNumber({ maxDecimalPlaces })`.
   */
  @IsOptional()
  @EsNumeroConDecimales(INSUMO_STOCK_MINIMO_DECIMALES)
  @Min(INSUMO_STOCK_MINIMO_MINIMO)
  @Max(INSUMO_STOCK_MINIMO_MAXIMO)
  stockMinimo?: number | null;

  /**
   * Lista COMPLETA de códigos alternativos; ausente equivale a vacía.
   *
   * Va con `@ValidateIf` y no con `@IsOptional` a propósito: `@IsOptional`
   * también saltea el `null`, que llegaría intacto a la capa de aplicación y
   * reventaría al iterarse — un 500 por un body que el borde tenía que
   * rechazar con un 400.
   *
   * El `@ArrayMaxSize` importa su número del dominio, igual que los topes de
   * largo. Sin él, el guardado del agregado emite una escritura anidada por
   * código dentro de una sola transacción y la sostiene abierta sobre la base
   * del inquilino tantas idas y vueltas como códigos hayan entrado.
   */
  @ValidateIf((objeto: CreateInsumoDto) => objeto.codigosAlternativos !== undefined)
  @IsArray()
  @ArrayMaxSize(INSUMO_CODIGOS_ALTERNATIVOS_MAX)
  @ValidateNested({ each: true })
  @Type(() => CodigoAlternativoInputDto)
  codigosAlternativos?: CodigoAlternativoInputDto[];

  /**
   * Lista COMPLETA de modelos de equipo compatibles; ausente equivale a vacía.
   *
   * Va con `@ValidateIf` y no con `@IsOptional` por el mismo motivo que
   * `codigosAlternativos`: `@IsOptional` saltea el `null`, que llegaría intacto
   * a la capa de aplicación y reventaría al iterarse.
   *
   * El `@ArrayMaxSize` importa su número del dominio: el guardado del agregado
   * emite una escritura anidada por modelo dentro de una sola transacción, y
   * sin techo la sostiene abierta sobre la base del inquilino tantas idas y
   * vueltas como modelos hayan entrado.
   */
  @ValidateIf((objeto: CreateInsumoDto) => objeto.compatibilidad !== undefined)
  @IsArray()
  @ArrayMaxSize(INSUMO_COMPATIBILIDAD_MAX)
  @ValidateNested({ each: true })
  @Type(() => CompatibilidadInputDto)
  compatibilidad?: CompatibilidadInputDto[];
}

/**
 * Body de `PATCH /insumos/:id` — PATCH parcial.
 *
 * Los campos de texto y los ids van con `@ValidateIf` en vez de `@IsOptional`
 * por el mismo motivo que `codigosAlternativos` en el alta: `@IsOptional`
 * saltea la validación del `null`, y un `null` que se cuela llega a la
 * normalización del dominio como si fuera un string. `stockMinimo` es la
 * ÚNICA excepción, porque ahí el `null` sí es un valor con significado — la
 * orden de borrar el punto de reposición.
 */
export class EditInsumoDto {
  @ValidateIf((objeto: EditInsumoDto) => objeto.codigo !== undefined)
  @IsString()
  @MinLength(1)
  @Transform(transformarCodigo)
  @MaxLength(INSUMO_CODIGO_MAX_LENGTH)
  codigo?: string;

  @ValidateIf((objeto: EditInsumoDto) => objeto.nombre !== undefined)
  @IsString()
  @MinLength(1)
  @Transform(transformarNombre)
  @MaxLength(INSUMO_NOMBRE_MAX_LENGTH)
  nombre?: string;

  @ValidateIf((objeto: EditInsumoDto) => objeto.familiaId !== undefined)
  @IsUUID()
  familiaId?: string;

  @ValidateIf((objeto: EditInsumoDto) => objeto.unidadMedidaId !== undefined)
  @IsUUID()
  unidadMedidaId?: string;

  /** `undefined` deja el punto de reposición intacto; `null` lo borra. */
  @IsOptional()
  @EsNumeroConDecimales(INSUMO_STOCK_MINIMO_DECIMALES)
  @Min(INSUMO_STOCK_MINIMO_MINIMO)
  @Max(INSUMO_STOCK_MINIMO_MAXIMO)
  stockMinimo?: number | null;

  /**
   * Lista COMPLETA que REEMPLAZA a la guardada: `undefined` la deja intacta,
   * `[]` la vacía. El techo es el mismo que en el alta, y por el mismo motivo:
   * la edición reescribe el agregado entero.
   */
  @ValidateIf((objeto: EditInsumoDto) => objeto.codigosAlternativos !== undefined)
  @IsArray()
  @ArrayMaxSize(INSUMO_CODIGOS_ALTERNATIVOS_MAX)
  @ValidateNested({ each: true })
  @Type(() => CodigoAlternativoInputDto)
  codigosAlternativos?: CodigoAlternativoInputDto[];

  /**
   * Lista COMPLETA que REEMPLAZA a la guardada: `undefined` la deja intacta,
   * `[]` la vacía. El techo es el mismo que en el alta, y por el mismo motivo:
   * la edición reescribe el agregado entero.
   */
  @ValidateIf((objeto: EditInsumoDto) => objeto.compatibilidad !== undefined)
  @IsArray()
  @ArrayMaxSize(INSUMO_COMPATIBILIDAD_MAX)
  @ValidateNested({ each: true })
  @Type(() => CompatibilidadInputDto)
  compatibilidad?: CompatibilidadInputDto[];
}

/** Body de `PATCH /insumos/:id/estado` — activar/desactivar. */
export class CambiarEstadoActivoInsumoDto {
  @IsBoolean()
  activo!: boolean;
}

/**
 * Normaliza un booleano que llega como query param: Express los entrega
 * siempre como string. Vive suelto y no repetido en cada campo porque la
 * segunda copia ya había traído consigo un cast sin chequear, y la tercera
 * lo habría vuelto permanente.
 *
 * Un valor que no sea `'true'` ni `'false'` se deja pasar tal cual para que
 * el `@IsBoolean()` de cada campo lo rechace con su propio mensaje, en vez
 * de que esta función invente un default.
 */
function parsearBooleanQuery(value: unknown): unknown {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return value;
}

/**
 * Query params de `GET /insumos` (WU-2, sdd/repuestos-seccion; `soloVinculables`
 * WU-3, sdd/repuestos-vinculo-componente).
 *
 * Los dos viajan como string en la querystring (`?esRepuesto=false`);
 * `@Type(() => Boolean)` de `class-transformer` NO interpreta `'false'` como
 * `false` (cualquier string no vacío es truthy) — se parsean a mano, mismo
 * patrón que `soloEnCurso` en `ListarComprasQueryDto`.
 *
 * **`esRepuesto` AUSENTE no filtra: trae TODOS los insumos.** Ver el JSDoc de
 * `ListarInsumosUseCase.execute` para por qué ese default no es un descuido
 * y quiénes lo necesitan.
 *
 * **`soloVinculables` AUSENTE no filtra: trae habilitados y deshabilitados
 * por igual**, el mismo default de siempre. `true` restringe a los insumos
 * que `AgregarComponenteUseCase` aceptaría vincular — ver el JSDoc de
 * `IInsumoRepository.findAllActive` para los dos comportamientos completos.
 */
export class ListarInsumosQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parsearBooleanQuery(value))
  @IsBoolean()
  esRepuesto?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parsearBooleanQuery(value))
  @IsBoolean()
  soloVinculables?: boolean;
}

/** Response shape de un código alternativo dentro de la respuesta del insumo. */
export interface InsumoCodigoAlternativoResponseDto {
  id: string;
  codigo: string;
  fabricante: string | null;
}

/**
 * Response shape de un modelo compatible. NO lleva `id`: la identidad del par
 * es `(insumo, modelo)`, que es la clave primaria de la tabla.
 */
export interface CompatibilidadResponseDto {
  modeloEquipoId: string;
  rol: string | null;
}

/** Response shape de un insumo, con sus códigos alternativos y su compatibilidad. */
export interface InsumoResponseDto {
  id: string;
  codigo: string;
  nombre: string;
  familiaId: string;
  unidadMedidaId: string;
  stockMinimo: number | null;
  activo: boolean;
  codigosAlternativos: InsumoCodigoAlternativoResponseDto[];
  compatibilidad: CompatibilidadResponseDto[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Convierte un código alternativo del dominio al shape de respuesta HTTP. El
 * `id` viaja porque el formulario de edición manda la lista completa y
 * necesita distinguir un código que ya existía de uno nuevo.
 *
 * @param entidad Entidad hija del agregado.
 * @returns El DTO de respuesta del código alternativo.
 */
function toCodigoAlternativoResponseDto(
  entidad: InsumoCodigoAlternativoEntity,
): InsumoCodigoAlternativoResponseDto {
  return { id: entidad.id, codigo: entidad.codigo, fabricante: entidad.fabricante };
}

/**
 * Convierte un modelo compatible del dominio al shape de respuesta HTTP.
 *
 * @param par Value object del agregado.
 * @returns El DTO de respuesta del par compatible.
 */
function toCompatibilidadResponseDto(par: CompatibilidadModelo): CompatibilidadResponseDto {
  return { modeloEquipoId: par.modeloEquipoId, rol: par.rol };
}

/**
 * Convierte una `InsumoEntity` de dominio al shape de respuesta HTTP.
 *
 * Las DOS listas del agregado van INCLUIDAS: no se puede editar sin verlas,
 * porque el PATCH lleva la lista completa y una respuesta sin ellas obligaría a
 * reconstruirlas de memoria — y lo que el usuario no recordara se borraría en
 * la primera edición.
 *
 * @param entidad Entidad de dominio.
 * @returns El DTO de respuesta, con timestamps en ISO-8601.
 */
export function toInsumoResponseDto(entidad: InsumoEntity): InsumoResponseDto {
  return {
    id: entidad.id,
    codigo: entidad.codigo,
    nombre: entidad.nombre,
    familiaId: entidad.familiaId,
    unidadMedidaId: entidad.unidadMedidaId,
    stockMinimo: entidad.stockMinimo,
    activo: entidad.activo,
    codigosAlternativos: entidad.codigosAlternativos.map(toCodigoAlternativoResponseDto),
    compatibilidad: entidad.compatibilidad.map(toCompatibilidadResponseDto),
    createdAt: entidad.createdAt.toISOString(),
    updatedAt: entidad.updatedAt.toISOString(),
  };
}
