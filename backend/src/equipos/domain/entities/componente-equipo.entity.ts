import { BaseEntity } from '../../../shared/domain/base-entity';
import { Result } from '../../../shared/domain/result';
import { TipoComponenteCodigoRequeridoError } from '../errors/equipos.errors';

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
   */
  static create(
    props: ComponenteEquipoProps,
    id?: string,
  ): Result<ComponenteEquipoEntity, TipoComponenteCodigoRequeridoError> {
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
}
