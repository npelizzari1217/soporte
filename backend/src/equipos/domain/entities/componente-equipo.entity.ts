import { BaseEntity } from '../../../shared/domain/base-entity';
import { Result } from '../../../shared/domain/result';
import { TipoComponenteCodigoRequeridoError } from '../errors/equipos.errors';

/**
 * Topes de largo, espejando `componentes_equipo.*`
 * (`prisma_tenant/schema.prisma`): `descripcion`/`numeroSerie`
 * `VarChar(255)`, `capacidad` `VarChar(100)`.
 *
 * `tipoComponenteCodigo` (`VarChar(50)`) queda FUERA a propósito: el use case
 * (`AgregarComponenteUseCase`/`EditarComponenteUseCase`) ya lo verifica contra
 * el catálogo MASTER (`ITipoComponenteMasterChecker.estaActivo`) ANTES de
 * llegar acá, y esa consulta es un `WHERE codigo = $1` de igualdad exacta —
 * un código de más de 50 caracteres nunca matchea ninguna fila (Postgres no
 * trunca en una comparación), así que ya vuelve como `TipoComponenteInactivoError`
 * (422) sin tocar nunca el INSERT. Agregar un `MaxLength` acá sería defensa
 * contra un camino que no existe (fix defecto "límites de equipos",
 * sdd/limites-db).
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
 * `create()` para `tipoComponenteCodigo`: un primitivo de texto fuera de
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
 * PR4b (sdd/tipos-componente-master): `tipoComponenteCodigo` reemplaza a
 * `tipoComponenteId` — el dominio pasa a referenciar el catálogo MASTER
 * (`master.tipos_componente`) por código estable (ej. "RAM"), no por el `id`
 * UUID del catálogo tenant `tipos_componente` (eliminado en este PR).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q2 (Tabla componentes_equipo).
 * Tarea: T10.3, T10.4.
 */
export interface ComponenteEquipoProps {
  /** UUID del equipo al que pertenece (FK → equipos_informaticos.id). */
  equipoId: string;
  /** Código estable del tipo de componente (soft ref → master.tipos_componente.codigo). Obligatorio. */
  tipoComponenteCodigo: string;
  descripcion: string | null;
  numeroSerie: string | null;
  capacidad: string | null;
}

/**
 * ComponenteEquipoEntity — parte física asociada a un `EquipoInformatico`
 * (F3-Q2, ADR-9).
 *
 * DECISIÓN (ADR-9): `create()` retorna `Result.fail(TipoComponenteCodigoRequeridoError)`
 * cuando falta `tipoComponenteCodigo` — NORMALIZADO al patrón `Result` del resto
 * de factories del proyecto (soporte1, la referencia probada, lanzaba una
 * excepción en este caso).
 *
 * La validación de que el tipo esté `activo` en el catálogo MASTER (bloquea
 * nuevos componentes de tipos inactivos/inexistentes) es responsabilidad del
 * use case (`AgregarComponenteUseCase`, requiere `ITipoComponenteMasterChecker`),
 * no de esta entidad — el dominio puro no tiene acceso a checkers/repos.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q2. Ref design: ADR-9, "Firmas
 * TS clave" (ComponenteEquipoEntity). Tarea: T10.3, T10.4.
 */
export class ComponenteEquipoEntity extends BaseEntity<ComponenteEquipoProps> {
  private constructor(props: ComponenteEquipoProps, id?: string) {
    super(props, id);
  }

  /**
   * Factory method con validación de dominio (`tipoComponenteCodigo` requerido).
   * Retorna `Result.fail(TipoComponenteCodigoRequeridoError)` si está vacío/ausente.
   *
   * @throws Error si `descripcion`/`numeroSerie`/`capacidad` excede su tope
   *   de largo (precondición de contrato, ver `validarLargos`).
   */
  static create(
    props: ComponenteEquipoProps,
    id?: string,
  ): Result<ComponenteEquipoEntity, TipoComponenteCodigoRequeridoError> {
    validarLargos(props);
    if (!props.tipoComponenteCodigo) {
      return Result.fail(new TipoComponenteCodigoRequeridoError());
    }
    return Result.ok(new ComponenteEquipoEntity(props, id));
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura). NO
   * re-valida `tipoComponenteCodigo`: los datos ya fueron validados al persistir.
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

  get tipoComponenteCodigo(): string {
    return this.props.tipoComponenteCodigo;
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
   * `tipoComponenteCodigo` es obligatorio en el dominio — el use case
   * (`EditarComponenteUseCase`) es responsable de rechazar un valor vacío
   * ANTES de llamar acá (mismo criterio que `create()`: esta entidad no
   * re-valida en `actualizar()`, solo en el factory).
   *
   * @throws Error si `descripcion`/`numeroSerie`/`capacidad` provisto excede
   *   su tope de largo (precondición de contrato, ver `validarLargos`).
   */
  actualizar(datos: {
    tipoComponenteCodigo?: string;
    descripcion?: string | null;
    numeroSerie?: string | null;
    capacidad?: string | null;
  }): void {
    validarLargos(datos);
    if (datos.tipoComponenteCodigo !== undefined) {
      this.props.tipoComponenteCodigo = datos.tipoComponenteCodigo;
    }
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
