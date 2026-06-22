import { BaseEntity } from '../../../shared/domain/base-entity';
import { PermisoEntity } from './permiso.entity';

/**
 * RoleProps — shape de las propiedades de dominio del Role.
 * Sin imports de Prisma ni NestJS — dominio puro.
 */
export interface RoleProps {
  /** Identificador único del rol en mayúsculas (ej. "ADMIN", "SOPORTE_IT"). */
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
 * Un rol es un conjunto de permisos reutilizable que se puede asignar a
 * múltiples usuarios. El permiso efectivo de un usuario es la unión de
 * los permisos de todos sus roles (ver LoginUseCase).
 *
 * Tarea: 2.A.2
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
   */
  static reconstitute(props: RoleProps, id: string): RoleEntity {
    return new RoleEntity({ ...props, permisos: [...props.permisos] }, id);
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
