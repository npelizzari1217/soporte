import { BaseEntity } from '../../../shared/domain/base-entity';
import { Result } from '../../../shared/domain/result';
import { CodigoTipoComponenteInvalidoError } from '../errors/tipos-componente.errors';

/**
 * Topes de largo, espejando `tiposComponente.codigo VarChar(50)` y
 * `tiposComponente.nombre VarChar(100)` (`prisma_master/schema.prisma`).
 *
 * Viven ACÁ y no en el DTO porque el dominio es la autoridad del límite: el
 * `VARCHAR` de Postgres es backstop, nunca al revés. `tipos-componente.dto.ts`
 * los importa para que el 400 amable del borde y la precondición del dominio no
 * puedan divergir.
 */
export const TIPO_COMPONENTE_CODIGO_MAX_LENGTH = 50;
export const TIPO_COMPONENTE_NOMBRE_MAX_LENGTH = 100;

/**
 * Normalización de `codigo`, exportada para que el BORDE pueda aplicar la misma
 * antes de medir.
 *
 * Esto no es una comodidad: `toUpperCase()` puede AGRANDAR el string —`'ß'` se
 * convierte en `'SS'`, 1 carácter en 2—, así que el largo crudo no es cota del
 * largo persistido. Es la rama 3 de la "regla de tres ramas" documentada en
 * `equipo-informatico.entity.ts`: medir el crudo en el borde deja pasar valores
 * que se expanden recién al persistir, que es el bug real que motivó esa regla.
 */
export function normalizarCodigoTipoComponente(valor: string): string {
  return valor.trim().toUpperCase();
}

/**
 * Precondición de largo. Va como `throw` y no como `Result` aunque `create()`
 * devuelva `Result`: el `Result.fail` de acá es para una desviación de NEGOCIO
 * (código vacío, que el usuario puede corregir), mientras que un largo fuera de
 * rango llegando a la entidad es una violación de contrato del caller — el
 * borde ya lo rechazó con un 400. Mismo criterio que el resto de las entidades.
 *
 * Mide el código YA NORMALIZADO, por lo dicho en `normalizarCodigoTipoComponente`.
 * NO se aplica en `reconstitute()`: una fila que ya existe se lee, no se revalida.
 */
function validarLargos(datos: { codigoNormalizado?: string; nombre?: string }): void {
  if (
    datos.codigoNormalizado !== undefined &&
    datos.codigoNormalizado.length > TIPO_COMPONENTE_CODIGO_MAX_LENGTH
  ) {
    throw new Error(
      `TipoComponente: codigo excede ${TIPO_COMPONENTE_CODIGO_MAX_LENGTH} caracteres una vez normalizado.`,
    );
  }
  if (datos.nombre !== undefined && datos.nombre.length > TIPO_COMPONENTE_NOMBRE_MAX_LENGTH) {
    throw new Error(
      `TipoComponente: nombre excede ${TIPO_COMPONENTE_NOMBRE_MAX_LENGTH} caracteres.`,
    );
  }
}

/**
 * TipoComponenteProps — shape de las propiedades del catálogo MASTER de
 * tipos de componente. Sin imports de Prisma ni NestJS — dominio puro.
 *
 * A diferencia de `tipos_componente` tenant (catálogo local, read-only,
 * sembrado en provisioning — ver `equipos/domain/entities/tipo-componente.entity.ts`),
 * este catálogo es el MAESTRO global (`prisma_master`), con ABM propio
 * (ROOT, PR2+). Sin `deletedAt`: la baja es exclusivamente lógica vía
 * `activo=false` (el schema `tipos_componente` master NO tiene columna
 * `deleted_at`).
 */
export interface TipoComponenteProps {
  /** Código estable normalizado (`trim().toUpperCase()`). UNIQUE en DB. */
  codigo: string;
  nombre: string;
  activo: boolean;
}

/**
 * TipoComponente — entidad de dominio del catálogo MASTER de tipos de
 * componente. Dueño único de la fuente de verdad de `codigo` (ej. CPU, RAM,
 * DISCO). Acá vive solo el modelo de dominio y el puerto de persistencia: la
 * entidad no conoce transporte ni ORM.
 *
 * Invariante: `codigo` es INMUTABLE tras `create()`/`reconstitute()` — no
 * expone setter. Cambiar el código de un tipo ya en uso podría desincronizar
 * referencias existentes (equipos/componentes); si en el futuro se necesita
 * renombrar el código, será una operación explícita de más alto nivel, no un
 * setter de campo.
 */
export class TipoComponente extends BaseEntity<TipoComponenteProps> {
  private constructor(props: TipoComponenteProps, id?: string) {
    super(props, id);
  }

  /**
   * Factory method para nuevas instancias. Normaliza `codigo` con
   * `trim().toUpperCase()`. Retorna
   * `Result.fail(CodigoTipoComponenteInvalidoError)` si el código
   * normalizado queda vacío. Nace siempre `activo=true`.
   */
  static create(
    props: { codigo: string; nombre: string },
    id?: string,
  ): Result<TipoComponente, CodigoTipoComponenteInvalidoError> {
    const codigoNormalizado = normalizarCodigoTipoComponente(props.codigo);
    if (codigoNormalizado === '') {
      return Result.fail(new CodigoTipoComponenteInvalidoError(props.codigo));
    }
    validarLargos({ codigoNormalizado, nombre: props.nombre });
    return Result.ok(
      new TipoComponente({ codigo: codigoNormalizado, nombre: props.nombre, activo: true }, id),
    );
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura). Los
   * datos ya fueron validados/normalizados al persistir — no re-valida.
   * Sin `deletedAt`: el schema master `tipos_componente` no tiene esa
   * columna (baja lógica solo vía `activo`).
   */
  static reconstitute(
    props: TipoComponenteProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
  ): TipoComponente {
    const entity = new TipoComponente(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  /** Código estable normalizado. Inmutable — sin setter. */
  get codigo(): string {
    return this.props.codigo;
  }

  get nombre(): string {
    return this.props.nombre;
  }

  get activo(): boolean {
    return this.props.activo;
  }

  // ─── Comportamiento de dominio ───────────────────────────────────────────

  /** Renombra el tipo de componente. `codigo` NO se toca acá (inmutable). */
  rename(nombre: string): void {
    validarLargos({ nombre });
    this.props.nombre = nombre;
    this.touch();
  }

  /**
   * Baja lógica: `activo=false`. NO usa `softDelete()`/`deletedAt` — el
   * schema master no tiene esa columna, la baja lógica del catálogo es
   * exclusivamente vía `activo`.
   */
  desactivar(): void {
    this.props.activo = false;
    this.touch();
  }

  /** Reactiva el tipo de componente: `activo=true`. */
  activar(): void {
    this.props.activo = true;
    this.touch();
  }
}
