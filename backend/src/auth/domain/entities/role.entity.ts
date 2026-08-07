import { BaseEntity } from '../../../shared/domain/base-entity';
import { PermisoEntity } from './permiso.entity';

/**
 * RoleProps — shape de las propiedades de dominio del Role.
 * Sin imports de Prisma ni NestJS — dominio puro.
 */
export interface RoleProps {
  /** Identificador único del rol en mayúsculas (ej. "ADMINISTRADOR", "TECNICO"). */
  codigo: string;
  /** Label human-readable. */
  nombre: string;
  /** Descripción del alcance del rol. Nullable. */
  descripcion: string | null;
  /** Permisos atómicos que este rol otorga. */
  permisos: PermisoEntity[];
}

/**
 * RoleEntity — entidad de dominio que representa un rol del sistema RBAC.
 *
 * Un rol es un conjunto de permisos reutilizable. En el modelo de soporte
 * (N:N usuario↔cliente vía `membresias`), el rol NO es un atributo del
 * usuario: es un atributo de LA MEMBRESÍA — el mismo usuario puede ser
 * TECNICO en el cliente A y USUARIO en el cliente B.
 *
 * Tarea: T2.1 (PR2 — Auth domain + ports + hashing + token service)
 */
export class RoleEntity extends BaseEntity<RoleProps> {
  /**
   * Factory method para nuevas instancias de dominio.
   */
  static create(props: RoleProps, id?: string): RoleEntity {
    return new RoleEntity({ ...props, permisos: [...props.permisos] }, id);
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   * Acepta timestamps de la DB para hidratación completa, evitando que
   * createdAt/updatedAt/deletedAt sean sobreescritos por now().
   */
  static reconstitute(
    props: RoleProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): RoleEntity {
    const entity = new RoleEntity({ ...props, permisos: [...props.permisos] }, id);
    (entity as unknown as { _createdAt: Date })._createdAt = createdAt;
    (entity as unknown as { _updatedAt: Date })._updatedAt = updatedAt;
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

  get descripcion(): string | null {
    return this.props.descripcion;
  }

  get permisos(): PermisoEntity[] {
    return this.props.permisos;
  }

  // ─── Comportamiento de dominio ────────────────────────────────────────────

  /**
   * Agrega un permiso al role.
   * Si ya existe un permiso con el mismo id, no duplica.
   *
   * @param permiso  Permiso a agregar.
   */
  addPermiso(permiso: PermisoEntity): void {
    const alreadyExists = this.props.permisos.some((p) => p.id === permiso.id);
    if (!alreadyExists) {
      this.props.permisos.push(permiso);
    }
  }
}
