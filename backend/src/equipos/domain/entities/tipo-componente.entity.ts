import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * TipoComponenteProps — shape de las propiedades del catálogo de tipos de
 * componente. Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q3 (Tabla tipos_componente).
 * Tarea: T10.4.
 */
export interface TipoComponenteProps {
  /** Código estable (CPU, RAM, DISCO, MONITOR, TECLADO, MOUSE, GPU, FUENTE, IMPRESORA, RED). */
  codigo: string;
  nombre: string;
  /** Flag preparado a futuro; en Fase 3 solo bloquea NUEVOS componentes (F3-Q2). */
  activo: boolean;
}

/**
 * TipoComponenteEntity — catálogo READ-ONLY de tipos de componente (F3-Q3).
 *
 * Sembrado por el `TenantSeederAdapter` (PR1, ADR-5) — 10 códigos fijos. En
 * Fase 3 NO hay CRUD editable: solo `reconstitute()` (mappers de
 * infraestructura), sin `create()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q3. Ref design: "Firmas TS
 * clave" (TipoComponenteEntity read-only). Tarea: T10.4.
 */
export class TipoComponenteEntity extends BaseEntity<TipoComponenteProps> {
  private constructor(props: TipoComponenteProps, id?: string) {
    super(props, id);
  }

  /** Reconstitución desde persistencia (mappers de infraestructura). */
  static reconstitute(
    props: TipoComponenteProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): TipoComponenteEntity {
    const entity = new TipoComponenteEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get codigo(): string {
    return this.props.codigo;
  }

  get nombre(): string {
    return this.props.nombre;
  }

  get activo(): boolean {
    return this.props.activo;
  }
}
