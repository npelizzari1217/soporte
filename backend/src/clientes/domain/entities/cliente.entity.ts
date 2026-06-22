import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * ClienteProps — shape de las propiedades de dominio del Cliente.
 * Sin imports de Prisma ni NestJS — dominio puro.
 */
export interface ClienteProps {
  nombre: string;
  razonSocial: string | null;
  cuit: string | null;
  dbName: string;
  activo: boolean;
}

/**
 * ClienteEntity — entidad de dominio que representa un tenant del sistema.
 *
 * Cada cliente es una organización con su propia DB Postgres operativa
 * (identificada por dbName). El cliente ES la base de datos, no una columna.
 *
 * Reglas de dominio:
 * - dbName debe ser único en el sistema (validado en RegistrarClienteUseCase).
 * - suspend() marca al cliente como inactivo + soft delete simultáneamente.
 * - reactivate() revierte la suspensión.
 * - La DB tenant NO se dropea al suspender — solo se marca en master.
 *
 * Tarea: 1.A.2
 */
export class ClienteEntity extends BaseEntity<ClienteProps> {
  /**
   * Factory method para nuevas instancias de dominio.
   * Genera UUIDv7 internamente (via BaseEntity) si no se provee id.
   */
  static create(props: ClienteProps, id?: string): ClienteEntity {
    return new ClienteEntity(props, id);
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   * Acepta timestamps de la DB para hidratación completa.
   * El any-cast está confinado aquí para no filtrarse al mapper.
   */
  static reconstitute(
    props: ClienteProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): ClienteEntity {
    const entity = new ClienteEntity(props, id);
    (entity as any)._createdAt = createdAt;
    (entity as any)._updatedAt = updatedAt;
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get nombre(): string {
    return this.props.nombre;
  }

  get razonSocial(): string | null {
    return this.props.razonSocial;
  }

  get cuit(): string | null {
    return this.props.cuit;
  }

  get dbName(): string {
    return this.props.dbName;
  }

  get activo(): boolean {
    return this.props.activo;
  }

  // ─── Comportamiento de dominio ─────────────────────────────────────────

  /**
   * Suspende el cliente: setea activo=false y realiza soft delete.
   * La DB tenant del cliente NO se dropea — permanece intacta.
   * El TenantGuard rechazará requests de este cliente (activo=false).
   */
  suspend(): void {
    this.props.activo = false;
    this.softDelete();
  }

  /**
   * Reactiva un cliente suspendido: activo=true + limpia deletedAt.
   */
  reactivate(): void {
    this.props.activo = true;
    this._deletedAt = null;
  }
}
