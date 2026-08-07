import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * MembresiaProps — shape de las propiedades de dominio de la Membresía.
 * Sin imports de Prisma ni NestJS — dominio puro.
 */
export interface MembresiaProps {
  /** ID del usuario (identidad global en master.usuarios). */
  usuarioId: string;
  /** ID del cliente (tenant) al que pertenece esta membresía. */
  clienteId: string;
  /** ID del rol asignado — UN rol por membresía (ADR-1). */
  rolId: string;
  /**
   * Mecanismo de baja lógica de ACCESO (revocar sin perder historial).
   * Distinto de `deletedAt`: `activo=false` significa "el usuario ya no
   * opera en este cliente con este rol", pero la fila permanece para
   * auditoría. `deletedAt` es la baja lógica de la fila en sí.
   */
  activo: boolean;
}

/**
 * MembresiaEntity — entidad de dominio que representa la pertenencia N:N
 * entre un Usuario y un Cliente, con UN rol asignado.
 *
 * ADR-1 (el CAMBIO central del modelo): reemplaza el par
 * (`usuarios.cliente_id` único + `usuarios_roles`) de un modelo
 * single-tenant-per-user. Un usuario puede tener una fila de membresía por
 * cada `(cliente, rol)` al que pertenece — ej. TECNICO en el cliente A y
 * USUARIO en el cliente B, o incluso dos roles distintos dentro del mismo
 * cliente (dos filas de membresía).
 *
 * El login (PR3) resuelve las membresías ACTIVAS de un usuario vía
 * `IMembresiaRepository` y scopea el JWT a UN cliente.
 *
 * Tarea: T2.1 (PR2 — Auth domain + ports + hashing + token service)
 */
export class MembresiaEntity extends BaseEntity<MembresiaProps> {
  /**
   * Factory method para nuevas instancias de dominio.
   */
  static create(props: MembresiaProps, id?: string): MembresiaEntity {
    return new MembresiaEntity(props, id);
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   * Acepta timestamps de la DB para hidratación completa, evitando que
   * createdAt/updatedAt/deletedAt sean sobreescritos por now().
   */
  static reconstitute(
    props: MembresiaProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): MembresiaEntity {
    const entity = new MembresiaEntity(props, id);
    (entity as unknown as { _createdAt: Date })._createdAt = createdAt;
    (entity as unknown as { _updatedAt: Date })._updatedAt = updatedAt;
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get usuarioId(): string {
    return this.props.usuarioId;
  }

  get clienteId(): string {
    return this.props.clienteId;
  }

  get rolId(): string {
    return this.props.rolId;
  }

  get activo(): boolean {
    return this.props.activo;
  }

  // ─── Comportamiento de dominio ────────────────────────────────────────────

  /**
   * Revoca el acceso del usuario a este cliente con este rol.
   * Idempotente: llamar dos veces no lanza ni cambia el resultado.
   * NO es soft-delete de la fila — la membresía queda para auditoría.
   */
  desactivar(): void {
    this.props.activo = false;
  }

  /**
   * Reactiva una membresía previamente desactivada.
   * Idempotente.
   */
  activar(): void {
    this.props.activo = true;
  }

  /**
   * Reemplaza el rol asignado a esta membresía (gestión mínima de usuarios,
   * `PATCH /usuarios/:id/rol` — permisos `usuario:gestionar` + `rol:asignar`).
   * El caller (use case) es responsable de validar que `rolId` pertenece al
   * catálogo RBAC vigente ANTES de invocar este método.
   */
  cambiarRol(rolId: string): void {
    this.props.rolId = rolId;
    this.touch();
  }
}
