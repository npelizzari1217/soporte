import { BaseEntity } from '../../../shared/domain/base-entity';
import { Result } from '../../../shared/domain/result';
import { InsumoRepuestoInexistenteError } from '../errors/equipos.errors';

/**
 * Topes de largo, espejando `componentes_equipo.*`
 * (`prisma_tenant/schema.prisma`): `descripcion`/`numeroSerie`
 * `VarChar(255)`, `capacidad` `VarChar(100)`.
 *
 * Viven ACÁ y no en el DTO por el mismo motivo que en
 * `EquipoInformaticoEntity`: el dominio es la autoridad, el DTO importa para
 * no divergir.
 */
export const COMPONENTE_DESCRIPCION_MAX_LENGTH = 255;
export const COMPONENTE_NUMERO_SERIE_MAX_LENGTH = 255;
export const COMPONENTE_CAPACIDAD_MAX_LENGTH = 100;

/**
 * Precondición de largo. Va como `throw`, no como el `Result` que ya usa
 * `create()` para `insumoId`: un primitivo de texto fuera de
 * rango es violación de contrato del caller, distinta de una desviación de
 * negocio esperada (mismo criterio que `EquipoInformaticoEntity`).
 *
 * NO se aplica en `reconstitute()`: ahí la fila ya existe en la base, y hacer
 * explotar una lectura por un valor histórico convertiría un dato viejo en
 * una caída de sistema.
 */
function validarLargos(datos: {
  descripcion?: string | null;
  numeroSerie?: string | null;
  capacidad?: string | null;
}): void {
  if (datos.descripcion != null && datos.descripcion.length > COMPONENTE_DESCRIPCION_MAX_LENGTH) {
    throw new Error(
      `ComponenteEquipoEntity: descripcion excede ${COMPONENTE_DESCRIPCION_MAX_LENGTH} caracteres.`,
    );
  }
  if (datos.numeroSerie != null && datos.numeroSerie.length > COMPONENTE_NUMERO_SERIE_MAX_LENGTH) {
    throw new Error(
      `ComponenteEquipoEntity: numeroSerie excede ${COMPONENTE_NUMERO_SERIE_MAX_LENGTH} caracteres.`,
    );
  }
  if (datos.capacidad != null && datos.capacidad.length > COMPONENTE_CAPACIDAD_MAX_LENGTH) {
    throw new Error(
      `ComponenteEquipoEntity: capacidad excede ${COMPONENTE_CAPACIDAD_MAX_LENGTH} caracteres.`,
    );
  }
}

/**
 * ComponenteEquipoProps — shape de las propiedades de un componente físico
 * asociado a un equipo (F3-Q2). Sin imports de Prisma ni NestJS — dominio
 * puro.
 *
 * Sin tipo propio: el tipo del componente se deriva de la familia de su insumo
 * (sdd/catalogo-unico-componentes), no se persiste.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q2 (Tabla componentes_equipo).
 * Tarea: T10.3, T10.4.
 */
export interface ComponenteEquipoProps {
  /** UUID del equipo al que pertenece (FK → equipos_informaticos.id). */
  equipoId: string;
  /**
   * FK real → `insumos.id`: el repuesto del catálogo del que viene el
   * componente. Obligatorio (sdd/catalogo-unico-componentes): la existencia
   * del insumo y que su familia sea de repuesto las valida la capa de
   * aplicación (`AgregarComponenteUseCase`), no esta entidad.
   */
  insumoId: string;
  descripcion: string | null;
  numeroSerie: string | null;
  capacidad: string | null;
}

/**
 * ComponenteEquipoEntity — parte física asociada a un `EquipoInformatico`
 * (F3-Q2, ADR-9).
 *
 * `create()` retorna `Result.fail(InsumoRepuestoInexistenteError)` cuando falta
 * `insumoId` (vacío o ausente), en el patrón `Result` del resto de factories.
 *
 * Que el insumo exista y sea un repuesto activo es responsabilidad del use
 * case (`AgregarComponenteUseCase`): el dominio puro no tiene acceso a repos.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q2. Ref design: ADR-9, "Firmas
 * TS clave" (ComponenteEquipoEntity). Tarea: T10.3, T10.4.
 */
export class ComponenteEquipoEntity extends BaseEntity<ComponenteEquipoProps> {
  private constructor(props: ComponenteEquipoProps, id?: string) {
    super(props, id);
  }

  /**
   * Factory method con validación de dominio (`insumoId` requerido).
   * Retorna `Result.fail(InsumoRepuestoInexistenteError)` si está vacío/ausente.
   *
   * @throws Error si `descripcion`/`numeroSerie`/`capacidad` excede su tope
   *   de largo (precondición de contrato, ver `validarLargos`).
   */
  static create(
    props: ComponenteEquipoProps,
    id?: string,
  ): Result<ComponenteEquipoEntity, InsumoRepuestoInexistenteError> {
    validarLargos(props);
    if (!props.insumoId) {
      return Result.fail(new InsumoRepuestoInexistenteError(props.insumoId ?? ''));
    }
    return Result.ok(new ComponenteEquipoEntity(props, id));
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura). NO
   * re-valida `insumoId`: los datos ya fueron validados al persistir.
   */
  static reconstitute(
    props: ComponenteEquipoProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): ComponenteEquipoEntity {
    const entity = new ComponenteEquipoEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get equipoId(): string {
    return this.props.equipoId;
  }

  /** Repuesto del catálogo del que viene este componente. */
  get insumoId(): string {
    return this.props.insumoId;
  }

  get descripcion(): string | null {
    return this.props.descripcion;
  }

  get numeroSerie(): string | null {
    return this.props.numeroSerie;
  }

  get capacidad(): string | null {
    return this.props.capacidad;
  }

  /** `true` si el componente NO fue dado de baja (`deletedAt == null`). Derivado, no persiste aparte. */
  get activo(): boolean {
    return !this.isDeleted();
  }

  // ─── Comportamiento de dominio ─────────────────────────────────────────

  /**
   * Actualiza los campos editables (PATCH semántico, mismo criterio que
   * `EquipoInformaticoEntity.actualizar`): campos `undefined` NO se tocan;
   * los opcionales (`descripcion`, `numeroSerie`, `capacidad`) en `null`
   * limpian el valor explícitamente.
   *
   * Ni el tipo ni el insumo se editan: los fija el alta.
   *
   * @throws Error si `descripcion`/`numeroSerie`/`capacidad` provisto excede
   *   su tope de largo (precondición de contrato, ver `validarLargos`).
   */
  actualizar(datos: {
    descripcion?: string | null;
    numeroSerie?: string | null;
    capacidad?: string | null;
  }): void {
    validarLargos(datos);
    if (datos.descripcion !== undefined) {
      this.props.descripcion = datos.descripcion;
    }
    if (datos.numeroSerie !== undefined) {
      this.props.numeroSerie = datos.numeroSerie;
    }
    if (datos.capacidad !== undefined) {
      this.props.capacidad = datos.capacidad;
    }
    this.touch();
  }

  /**
   * Revierte la baja lógica (reactivación): limpia `deletedAt` y actualiza
   * `updatedAt`. Contraparte de `softDelete()` (heredado de `BaseEntity`).
   * El use case (`ReactivarComponenteUseCase`) es responsable de rechazar
   * la reactivación de un componente que ya está activo.
   */
  reactivar(): void {
    this._deletedAt = null;
    this.touch();
  }
}
