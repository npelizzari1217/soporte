import { BaseEntity } from '../../../shared/domain/base-entity';
import { Result } from '../../../shared/domain/result';
import { CodigoTipoComponenteInvalidoError } from '../errors/tipos-componente.errors';

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
 * DISCO). El CRUD ROOT (controller + use cases) se implementa en PR2 — acá
 * solo vive el modelo de dominio y el puerto de persistencia.
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
    const codigoNormalizado = props.codigo.trim().toUpperCase();
    if (codigoNormalizado === '') {
      return Result.fail(new CodigoTipoComponenteInvalidoError(props.codigo));
    }
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
