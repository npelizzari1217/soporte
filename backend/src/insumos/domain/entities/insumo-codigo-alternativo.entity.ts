import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * InsumoCodigoAlternativoProps — shape de un código alternativo de insumo: el
 * código con el que un fabricante o un proveedor nombra al mismo consumible
 * que el catálogo interno identifica con otro (`CE285A` de HP es el `TON-001`
 * del depósito).
 *
 * No es una raíz de agregado: no tiene identidad fuera del insumo que lo
 * contiene, se carga y se borra con él (`ON DELETE CASCADE`) y no tiene
 * endpoints propios.
 */
export interface InsumoCodigoAlternativoProps {
  codigo: string;
  /** `null` es el código GENÉRICO, el que no pertenece a ningún fabricante. */
  fabricante: string | null;
}

/**
 * Topes de largo, espejando `insumos_codigos_alternativos.codigo VarChar(50)`
 * y `.fabricante VarChar(100)` (`prisma_tenant/schema.prisma`).
 *
 * Viven ACÁ y no en el DTO porque el dominio es la autoridad del límite: el
 * `VARCHAR` de Postgres es backstop, nunca al revés. El borde los importa de
 * este módulo para que el 400 amable y la precondición del dominio no puedan
 * divergir.
 */
export const INSUMO_CODIGO_ALTERNATIVO_CODIGO_MAX_LENGTH = 50;
export const INSUMO_CODIGO_ALTERNATIVO_FABRICANTE_MAX_LENGTH = 100;

/**
 * Normalización del código alternativo, exportada para que la capa de
 * aplicación y el BORDE apliquen exactamente la misma regla.
 *
 * El UNIQUE `(codigo, fabricante)` es case-sensitive y GLOBAL al tenant: sin
 * una normalización única, `ce285a` y `CE285A` entran como dos códigos
 * distintos y el índice no puede frenar el duplicado.
 *
 * `toUpperCase()` puede AGRANDAR el string —`'ß'` se convierte en `'SS'`, 1
 * carácter en 2—, así que el largo crudo no es cota del largo persistido:
 * quien mida contra el tope de la columna tiene que medir DESPUÉS de
 * normalizar.
 *
 * @param valor Código crudo, tal como llega del usuario.
 * @returns El código sin espacios de borde y en mayúscula.
 */
export function normalizarCodigoAlternativo(valor: string): string {
  return valor.trim().toUpperCase();
}

/**
 * Normalización del fabricante: mismo recorte y mayúscula que el código, más
 * el colapso del vacío a `null`.
 *
 * Ese colapso es lo que hace utilizable al índice. El UNIQUE
 * `(codigo, fabricante)` está declarado `NULLS NOT DISTINCT`: junta dos filas
 * que tengan `NULL` en `fabricante`, pero para Postgres `''` y `NULL` siguen
 * siendo valores distintos, así que sin colapsar el vacío el mismo código
 * genérico entraría dos veces. El `undefined` —el campo directamente ausente
 * en el payload— significa lo mismo que el vacío y sale por el mismo camino.
 *
 * Vale acá la misma advertencia que en el código: `toUpperCase()` puede
 * AGRANDAR el string, así que el tope de la columna se mide sobre el
 * resultado de esta función, no sobre lo que tipeó el usuario.
 *
 * @param valor Fabricante crudo, ausente o nulo, tal como llega del usuario.
 * @returns El fabricante en mayúscula sin espacios de borde, o `null` si no hay ninguno.
 */
export function normalizarFabricanteCodigoAlternativo(
  valor: string | null | undefined,
): string | null {
  if (valor == null) return null;
  const normalizado = valor.trim().toUpperCase();
  return normalizado === '' ? null : normalizado;
}

/**
 * Precondición de largo. Va como `throw` y no como `Result` porque un
 * primitivo fuera de rango llegando a la entidad es una violación de contrato
 * del caller, no una desviación de negocio que el usuario deba ver.
 *
 * NO se aplica en `reconstitute()`: ahí la fila ya existe en la base, y hacer
 * explotar una lectura por un valor histórico convertiría un dato viejo en una
 * caída de sistema.
 *
 * @param props Código y fabricante YA normalizados, que es lo que se persiste.
 * @returns Nada; lanza si algún valor excede el tope de su columna.
 */
function validarLargos(props: InsumoCodigoAlternativoProps): void {
  if (props.codigo.length > INSUMO_CODIGO_ALTERNATIVO_CODIGO_MAX_LENGTH) {
    throw new Error(
      `InsumoCodigoAlternativoEntity: codigo excede ${INSUMO_CODIGO_ALTERNATIVO_CODIGO_MAX_LENGTH} caracteres.`,
    );
  }
  if (
    props.fabricante !== null &&
    props.fabricante.length > INSUMO_CODIGO_ALTERNATIVO_FABRICANTE_MAX_LENGTH
  ) {
    throw new Error(
      `InsumoCodigoAlternativoEntity: fabricante excede ${INSUMO_CODIGO_ALTERNATIVO_FABRICANTE_MAX_LENGTH} caracteres.`,
    );
  }
}

/**
 * InsumoCodigoAlternativoEntity — entidad hija del agregado `Insumo`.
 *
 * El par `(codigo, fabricante)` es único en TODO el catálogo del tenant, no
 * dentro del insumo: dos insumos distintos no pueden reclamar el mismo código
 * de fabricante, porque entonces buscar por ese código no resolvería a un
 * insumo. Ese chequeo lo hace la capa de aplicación contra el repositorio; la
 * entidad solo garantiza la precondición de largo.
 */
export class InsumoCodigoAlternativoEntity extends BaseEntity<InsumoCodigoAlternativoProps> {
  /**
   * Crea un código alternativo nuevo, validando la precondición de largo.
   *
   * @param props Código y fabricante YA normalizados por el caller.
   * @param id Id explícito; si se omite lo genera `BaseEntity`.
   * @returns La entidad creada.
   * @throws Error si `codigo` o `fabricante` exceden el tope de su columna.
   */
  static create(props: InsumoCodigoAlternativoProps, id?: string): InsumoCodigoAlternativoEntity {
    validarLargos(props);
    return new InsumoCodigoAlternativoEntity(props, id);
  }

  /**
   * Rehidrata un código alternativo desde persistencia, preservando id y
   * timestamps.
   *
   * NO valida largos a propósito: la fila ya existe en la base, y hacer
   * explotar una lectura por un valor histórico convertiría un dato viejo en
   * una caída de sistema.
   *
   * @param props Código y fabricante leídos de la base.
   * @param id Id persistido.
   * @param createdAt Alta original.
   * @param updatedAt Última modificación.
   * @param deletedAt Fecha de baja lógica, o `null` si está vigente.
   * @returns La entidad reconstituida.
   */
  static reconstitute(
    props: InsumoCodigoAlternativoProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): InsumoCodigoAlternativoEntity {
    const entity = new InsumoCodigoAlternativoEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  /** Código alternativo normalizado en mayúscula. Mitad del UNIQUE en DB. */
  get codigo(): string {
    return this.props.codigo;
  }

  /** Fabricante en mayúscula, o `null` si el código es genérico. Mitad del UNIQUE en DB. */
  get fabricante(): string | null {
    return this.props.fabricante;
  }
}
