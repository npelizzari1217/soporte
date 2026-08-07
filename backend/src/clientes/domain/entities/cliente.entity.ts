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
 * Alcance de PR3 (auth/application/resolver-scope): solo se consume
 * `activo`/`isDeleted()` (validar que el cliente esté vivo) y `nombre`
 * (poblar `cliente_nombre` del JWT). El resto de comportamiento de dominio
 * (suspend/reactivate) y la persistencia (IClienteRepository completo,
 * mapper Prisma) se materializan recién en PR8 (CrearClienteUseCase).
 *
 * Reglas de dominio:
 * - dbName debe ser único en el sistema (validado en el use case de alta).
 * - suspend() marca al cliente como inactivo + soft delete simultáneamente.
 * - reactivate() revierte la suspensión.
 * - La DB tenant NO se dropea al suspender — solo se marca en master.
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
   * Acepta timestamps de la DB para hidratación completa, evitando que
   * createdAt/updatedAt/deletedAt sean sobreescritos por now().
   */
  static reconstitute(
    props: ClienteProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): ClienteEntity {
    const entity = new ClienteEntity(props, id);
    (entity as unknown as { _createdAt: Date })._createdAt = createdAt;
    (entity as unknown as { _updatedAt: Date })._updatedAt = updatedAt;
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
   * Edita datos comerciales. dbName es INMUTABLE (identifica la DB física).
   * Solo toca los campos provistos (semántica de patch parcial: `undefined`
   * = "no tocar", `null` = "limpiar" para los nullables).
   */
  editar(cambios: { nombre?: string; razonSocial?: string | null; cuit?: string | null }): void {
    if (cambios.nombre !== undefined) this.props.nombre = cambios.nombre;
    if (cambios.razonSocial !== undefined) this.props.razonSocial = cambios.razonSocial;
    if (cambios.cuit !== undefined) this.props.cuit = cambios.cuit;
    this.touch();
  }

  /**
   * Suspende el cliente: setea activo=false y realiza soft delete.
   * La DB tenant del cliente NO se dropea — permanece intacta.
   * El TenantGuard/resolverScope rechazará requests/scopes de este cliente
   * (activo=false).
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
