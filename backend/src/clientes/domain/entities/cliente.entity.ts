import { BaseEntity } from '../../../shared/domain/base-entity';
import { ZonaHoraria } from '../../../shared/domain/zona-horaria';

/**
 * Tope de largo de `cuit`, espejando `clientes.cuit VARCHAR(13)`
 * (`prisma_master/schema.prisma`, `init_master/migration.sql:6`). Son
 * exactamente los caracteres de un CUIT formateado: `30-12345678-9`.
 *
 * Vive ACÁ y no en el DTO porque el dominio es la autoridad del límite: el
 * `VARCHAR` de Postgres es backstop, nunca al revés. `cliente.dto.ts` lo
 * importa de este módulo para que el 400 amable del borde y la precondición
 * del dominio no puedan divergir — que es justo lo que había pasado: el DTO
 * declaraba `@MaxLength(20)` contra una columna de 13, así que 14 a 20
 * caracteres pasaban las dos capas de validación y reventaban recién al
 * persistir (22001 → 500 crudo). Mismo criterio que
 * `equipo-informatico.entity.ts` (fix "límites de equipos", sdd/limites-db).
 */
export const CLIENTE_CUIT_MAX_LENGTH = 13;

/**
 * Topes de largo de `nombre` y `razonSocial`.
 *
 * A diferencia de `cuit`, estos NO son el ancho de la columna: `clientes.nombre`
 * y `clientes.razon_social` son `VarChar(255)`. El 200 es un tope de producto
 * más estricto, que ya vivía en `UpdateClienteDto`; la columna queda de
 * backstop.
 *
 * Suben al dominio por lo mismo que `cuit`: mientras el número estuvo escrito a
 * mano en el borde, el alta se quedó sin él y la edición no, así que un nombre
 * de 220 se podía CREAR pero después nunca EDITAR. Con la constante acá y los
 * dos DTOs importándola, esa asimetría no se puede reintroducir en silencio.
 */
export const CLIENTE_NOMBRE_MAX_LENGTH = 200;
export const CLIENTE_RAZON_SOCIAL_MAX_LENGTH = 200;

/**
 * Precondición de largo de los tres campos de texto. Va como `throw` y no como
 * `Result` por la rama 1 de la "regla de tres ramas" documentada en
 * `equipo-informatico.entity.ts`: ninguno de los tres se normaliza en ningún
 * borde, así que el borde mide exactamente el mismo string que mide el
 * dominio, y un valor fuera de rango llegando acá es una violación de contrato
 * del caller, no una desviación de negocio que el usuario deba ver.
 *
 * NO se aplica en `reconstitute()`, por el mismo criterio que
 * `EquipoInformaticoEntity`: una fila que ya existe en la base se lee, no se
 * revalida — hacer explotar una lectura por un valor histórico convertiría un
 * dato viejo en una caída de sistema.
 *
 * Esa exención pesa DISTINTO en cada campo, y conviene no confundirlos:
 *
 * - `cuit` espeja la columna exacta (13 = `VARCHAR(13)`), así que ninguna fila
 *   guardada puede excederlo: lo que el DTO dejaba colar moría en Postgres y
 *   nunca se persistió. Acá la exención es precaución, por si la columna se
 *   ensancha y el tope no la sigue.
 * - `nombre` y `razonSocial` son topes de PRODUCTO por debajo de la columna
 *   (200 contra `VarChar(255)`), y hasta este cambio el alta no los aplicaba.
 *   O sea que sí pueden existir filas de 201 a 255 caracteres, creadas por esa
 *   puerta. Para ellas la exención no es precaución sino requisito: sin ella,
 *   listar clientes reventaría al reconstituir una fila vieja.
 */
function validarLargos(datos: {
  nombre?: string;
  razonSocial?: string | null;
  cuit?: string | null;
}): void {
  if (datos.nombre !== undefined && datos.nombre.length > CLIENTE_NOMBRE_MAX_LENGTH) {
    throw new Error(`ClienteEntity: nombre excede ${CLIENTE_NOMBRE_MAX_LENGTH} caracteres.`);
  }
  if (datos.razonSocial != null && datos.razonSocial.length > CLIENTE_RAZON_SOCIAL_MAX_LENGTH) {
    throw new Error(
      `ClienteEntity: razonSocial excede ${CLIENTE_RAZON_SOCIAL_MAX_LENGTH} caracteres.`,
    );
  }
  if (datos.cuit != null && datos.cuit.length > CLIENTE_CUIT_MAX_LENGTH) {
    throw new Error(`ClienteEntity: cuit excede ${CLIENTE_CUIT_MAX_LENGTH} caracteres.`);
  }
}

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
  /**
   * Zona horaria operativa del tenant (sdd/zona-horaria-por-tenant, D1-D9).
   * OBLIGATORIA — a propósito, a diferencia de `csatHabilitado?` de acá
   * abajo: sin `?` y sin `??` de default en el getter. La columna es
   * `NOT NULL` con backfill (D8) y el alta la exige explícita en el DTO
   * (decisión "Zona de un cliente NUEVO: se exige explícita en el alta"),
   * así que ninguna instancia de dominio puede existir sin ella. Omitirla
   * es un error de contrato del caller, no una preferencia sin configurar.
   */
  zonaHoraria: ZonaHoraria;
  /**
   * Habilita la emisión de encuestas CSAT al cerrar un ticket de este
   * cliente (sdd/csat, WU1). `ResolverEncuestaTokenService` (ADR-C1) la lee
   * del `findById` que ya hace, sin cambios en `IClienteRepository`.
   * Defaults to false.
   */
  csatHabilitado?: boolean;
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
    validarLargos(props);
    return new ClienteEntity({ ...props, csatHabilitado: props.csatHabilitado ?? false }, id);
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
    const entity = new ClienteEntity(
      { ...props, csatHabilitado: props.csatHabilitado ?? false },
      id,
    );
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

  /** Ver `ClienteProps.csatHabilitado`. Defaults to false. */
  get csatHabilitado(): boolean {
    return this.props.csatHabilitado ?? false;
  }

  /**
   * Zona horaria operativa del tenant. Ver `ClienteProps.zonaHoraria` — a
   * diferencia de `csatHabilitado`, este getter NO tiene default: acceder a
   * ella sobre una entidad construida sin el campo revienta acá, a
   * propósito.
   */
  get zonaHoraria(): ZonaHoraria {
    return this.props.zonaHoraria;
  }

  // ─── Comportamiento de dominio ─────────────────────────────────────────

  /**
   * Edita datos comerciales. dbName es INMUTABLE (identifica la DB física).
   * Solo toca los campos provistos (semántica de patch parcial: `undefined`
   * = "no tocar", `null` = "limpiar" para los nullables).
   */
  editar(cambios: { nombre?: string; razonSocial?: string | null; cuit?: string | null }): void {
    validarLargos(cambios);
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

  /**
   * Prende/apaga la emisión de encuestas CSAT de este cliente (sdd/csat,
   * WU10.2). Acción SEPARADA de `editar()` a propósito, mismo criterio que
   * la configuración de correo (D7): un flag de configuración no comparte
   * el patch parcial de los datos comerciales.
   */
  configurarCsat(habilitado: boolean): void {
    this.props.csatHabilitado = habilitado;
    this.touch();
  }

  /**
   * Cambia la zona operativa del tenant (sdd/zona-horaria-por-tenant, C2b).
   * Acción SEPARADA de `editar()`, mismo criterio que `configurarCsat()`: la
   * configuración de zona no comparte el patch parcial de los datos
   * comerciales. Recibe un `ZonaHoraria` ya validado — el candidato inválido
   * se rechaza en el borde (DTO), nunca llega hasta acá.
   */
  configurarZonaHoraria(zona: ZonaHoraria): void {
    this.props.zonaHoraria = zona;
    this.touch();
  }
}
