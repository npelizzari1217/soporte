import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * Topes de largo/rango, espejando `equipos_informaticos.*`
 * (`prisma_tenant/schema.prisma`): `nombre`/`ubicacion` `VarChar(255)`,
 * `numeroSerie` `VarChar(255)`, `marca`/`modelo` `VarChar(100)`,
 * `importe`/`valorResidual` `Decimal(14,2)`.
 *
 * Viven ACÁ y no en el DTO porque el dominio es la autoridad del límite: el
 * `VARCHAR`/`DECIMAL` de Postgres es backstop, nunca al revés. El DTO los
 * importa de este módulo para que el 400 amable del borde y la precondición
 * del dominio no puedan divergir (fix defecto "límites de equipos",
 * sdd/limites-db).
 *
 * `EQUIPO_VALOR_MONETARIO_MAXIMO` es un TECHO DE NEGOCIO, no el límite físico
 * de la columna (que soporta hasta 999.999.999.999,99): ningún equipo
 * informático individual del inventario cuesta 100 millones — mismo criterio
 * de "techo defendible, lejos del desborde" que
 * `preventivo/domain/entities/plan-preventivo.entity.ts`
 * (`INTERVALO_VALOR_MAXIMO`) y `compras/domain/errors/compras.errors.ts`
 * (`NumeradorCompraAgotadoError`). Se eligió un entero (sin centavos) para no
 * arrastrar imprecisión de punto flotante en el límite exacto.
 * `EQUIPO_VALOR_MONETARIO_MINIMO=0`: un importe o valor residual negativo no
 * tiene sentido de negocio (0 sí lo tiene: equipo donado, o totalmente
 * depreciado).
 */
export const EQUIPO_NOMBRE_MAX_LENGTH = 255;
export const EQUIPO_NUMERO_SERIE_MAX_LENGTH = 255;
export const EQUIPO_MARCA_MAX_LENGTH = 100;
export const EQUIPO_MODELO_MAX_LENGTH = 100;
export const EQUIPO_UBICACION_MAX_LENGTH = 255;
export const EQUIPO_VALOR_MONETARIO_MAXIMO = 99_999_999;
export const EQUIPO_VALOR_MONETARIO_MINIMO = 0;

/**
 * Regla de tres ramas para decidir el manejo de errores de un guard de largo
 * en una entidad de dominio (sdd/precondicion-dominio-4xx). Antes de escribir
 * el guard de un campo nuevo, respondé esto midiendo el string CRUDO que
 * llega al borde:
 *
 * ¿Puede el borde garantizar que el string ya normalizado cumple el tope?
 *
 * 1. SÍ, porque el campo no se normaliza (ej. `nombre`, `numeroSerie`,
 *    `marca`, `modelo`) → el borde mide lo mismo que mide el dominio, así que
 *    un `throw` plano alcanza: es un contrato del caller, no una desviación
 *    de negocio que el usuario deba ver.
 * 2. SÍ, porque la normalización no puede AUMENTAR el largo (ej. un `trim()`)
 *    → mismo caso: `throw` plano, el borde sigue midiendo una cota válida.
 * 3. NO, porque la normalización puede aumentar el largo (`ubicacion` con
 *    `toUpperCase()`: 'ß' → 'SS', 1→2 caracteres) → medir el crudo en el
 *    borde deja pasar valores que se expanden por encima del tope recién al
 *    persistir (el bug real que motivó esta regla: llegaba a Postgres como
 *    22001 → 500 crudo). El borde DEBE normalizar ANTES de medir, con la
 *    MISMA función que usa el dominio (ver `normalizarUbicacion` abajo).
 *    Solo si restaurar esa premisa fuera imposible — la normalización
 *    depende de un estado que el borde no tiene disponible — la precondición
 *    pasa de `throw` a `Result<T, DomainError>` → 422: mejor un error de
 *    negocio explícito que un 500 que el borde no puede prevenir.
 */

/**
 * Normaliza `ubicacion` a mayúscula — invariante de dominio declarada en
 * `EquipoInformaticoProps.ubicacion`.
 *
 * Firma TOTAL sobre `string` (no acepta `null`): a propósito, porque
 * `actualizar()` necesita preservar `undefined` para su PATCH semántico
 * (`entity.ts` más abajo) y una firma `string|null` forzaría la unión
 * `string|null|undefined` en el retorno. El caller resuelve `null`/`undefined`
 * ANTES de invocarla (ver `create()`/`actualizar()` y el `@Transform` de
 * `equipos.dto.ts`, que solo llama a esta función cuando `typeof value ===
 * 'string'`).
 *
 * Exportada para que el borde HTTP (DTO) mida el mismo string que el dominio
 * termina persistiendo: `toUpperCase()` NO preserva longitud en JS (ej. 'ß' →
 * 'SS', 1→2 caracteres), así que medir el valor crudo en el DTO dejaba pasar
 * strings que se expandían por encima del tope al normalizar (bug real:
 * llegaba a Postgres VarChar(255) como 22001 → 500 crudo). Ver
 * `equipos.dto.ts` (`@Transform` sobre `ubicacion`) y ADR-1 del design.
 */
export function normalizarUbicacion(valor: string): string {
  return valor.toUpperCase();
}

/**
 * Precondición de largo de los campos de texto. Va como `throw` y no como
 * `Result` porque un primitivo fuera de rango llegando a la entidad es una
 * violación de contrato del caller, no una desviación de negocio que el
 * usuario deba ver (mismo criterio que `SectorEntity`/`TicketEntity`).
 *
 * NO se aplica en `reconstitute()`: ahí la fila ya existe en la base, y hacer
 * explotar una lectura por un valor histórico convertiría un dato viejo en
 * una caída de sistema.
 */
function validarLargos(datos: {
  nombre?: string;
  numeroSerie?: string | null;
  marca?: string | null;
  modelo?: string | null;
  ubicacion?: string | null;
}): void {
  if (datos.nombre !== undefined && datos.nombre.length > EQUIPO_NOMBRE_MAX_LENGTH) {
    throw new Error(
      `EquipoInformaticoEntity: nombre excede ${EQUIPO_NOMBRE_MAX_LENGTH} caracteres.`,
    );
  }
  if (datos.numeroSerie != null && datos.numeroSerie.length > EQUIPO_NUMERO_SERIE_MAX_LENGTH) {
    throw new Error(
      `EquipoInformaticoEntity: numeroSerie excede ${EQUIPO_NUMERO_SERIE_MAX_LENGTH} caracteres.`,
    );
  }
  if (datos.marca != null && datos.marca.length > EQUIPO_MARCA_MAX_LENGTH) {
    throw new Error(`EquipoInformaticoEntity: marca excede ${EQUIPO_MARCA_MAX_LENGTH} caracteres.`);
  }
  if (datos.modelo != null && datos.modelo.length > EQUIPO_MODELO_MAX_LENGTH) {
    throw new Error(
      `EquipoInformaticoEntity: modelo excede ${EQUIPO_MODELO_MAX_LENGTH} caracteres.`,
    );
  }
  if (datos.ubicacion != null && datos.ubicacion.length > EQUIPO_UBICACION_MAX_LENGTH) {
    throw new Error(
      `EquipoInformaticoEntity: ubicacion excede ${EQUIPO_UBICACION_MAX_LENGTH} caracteres.`,
    );
  }
}

/**
 * Precondición de rango de un campo monetario (`importe`/`valorResidual`):
 * rechaza negativos y valores por encima del techo de negocio. Mismo criterio
 * `throw` que `validarLargos` — contrato del caller, no decisión de negocio.
 */
function validarValorMonetario(campo: 'importe' | 'valorResidual', valor?: number | null): void {
  if (valor == null) return;
  if (valor < EQUIPO_VALOR_MONETARIO_MINIMO) {
    throw new Error(`EquipoInformaticoEntity: ${campo} no puede ser negativo.`);
  }
  if (valor > EQUIPO_VALOR_MONETARIO_MAXIMO) {
    throw new Error(
      `EquipoInformaticoEntity: ${campo} excede el techo de negocio de ${EQUIPO_VALOR_MONETARIO_MAXIMO}.`,
    );
  }
}

/**
 * EquipoInformaticoProps — shape de las propiedades del inventario de
 * equipos IT del tenant. Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1 (Tabla equipos_informaticos).
 * Tarea: T10.1, T10.2.
 */
export interface EquipoInformaticoProps {
  /** Nombre/etiqueta del equipo. */
  nombre: string;
  /** Único en el tenant cuando NO es null (índice único parcial, PR1/Fase1). */
  numeroSerie: string | null;
  marca: string | null;
  modelo: string | null;
  fechaAdquisicion: Date | null;
  /**
   * Ubicación física como TEXTO LIBRE, siempre en mayúscula. La normalización
   * la hace esta misma entidad (`normalizarUbicacion`), no la capa de arriba:
   * el borde la aplica también, pero para MEDIR el mismo string que se persiste,
   * no para producirlo.
   */
  ubicacion: string | null;
  /** Valoración del equipo: importe (valor). */
  importe: number | null;
  /** Fecha en que se registró el importe. */
  fechaValoracion: Date | null;
  /** Observaciones libres del técnico. */
  observaciones: string | null;
  /** Valor residual (post-depreciación). El % de depreciación NO se persiste (solo ayuda de cálculo en la UI). */
  valorResidual: number | null;
  /** Fecha del cálculo del valor residual. */
  fechaValorResidual: Date | null;
  /**
   * `true` = disponible/en uso; `false` = dado de baja (fuera de servicio).
   * DISTINTO de `deletedAt` (soft delete): un equipo `activo=false`
   * permanece en el historial y sigue siendo referenciable por
   * `ticket_soporte` existentes.
   */
  activo: boolean;
}

/**
 * EquipoInformaticoEntity — entidad de dominio del inventario de equipos IT
 * (F3-Q1, ADR-9).
 *
 * DECISIÓN CLAVE (ADR-9): `deactivate()` (activo=false, historial
 * preservado) es DISTINTO de `softDelete()` heredado de `BaseEntity`
 * (deletedAt, baja lógica completa). Ambos NO rompen tickets de soporte que
 * referencian el equipo (`ticket_soporte.equipoId` no tiene ON DELETE
 * restrictivo a nivel de dominio).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1. Ref design: ADR-9, "Firmas
 * TS clave" (EquipoInformaticoEntity). Tarea: T10.1, T10.2.
 */
export class EquipoInformaticoEntity extends BaseEntity<EquipoInformaticoProps> {
  private constructor(props: EquipoInformaticoProps, id?: string) {
    super(props, id);
  }

  /**
   * Factory method para un nuevo equipo. `activo` se inicializa siempre en
   * `true` — la baja se hace explícitamente vía `deactivate()`.
   *
   * @throws Error si algún campo de texto excede su tope de largo DESPUÉS de
   *   normalizar (ver `normalizarUbicacion`), o si `importe`/`valorResidual`
   *   es negativo o excede el techo de negocio. Backstop del contrato del
   *   caller: con el DTO midiendo ya normalizado (`equipos.dto.ts`), este
   *   `throw` solo es alcanzable si un caller interno evita el DTO.
   */
  static create(
    props: Omit<EquipoInformaticoProps, 'activo'>,
    id?: string,
  ): EquipoInformaticoEntity {
    // Normalizar ANTES de validar: `normalizarUbicacion` no preserva longitud
    // en JS (ej. 'ß' → 'SS'), así que validar el valor crudo dejaría pasar un
    // valor que se expande por encima del tope al normalizar (bug real:
    // llegaba a Postgres VarChar(255) como 22001 → 500 crudo).
    const ubicacion = props.ubicacion != null ? normalizarUbicacion(props.ubicacion) : null;
    validarLargos({ ...props, ubicacion });
    validarValorMonetario('importe', props.importe);
    validarValorMonetario('valorResidual', props.valorResidual);
    return new EquipoInformaticoEntity({ ...props, ubicacion, activo: true }, id);
  }

  /** Reconstitución desde persistencia (mappers de infraestructura). */
  static reconstitute(
    props: EquipoInformaticoProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): EquipoInformaticoEntity {
    const entity = new EquipoInformaticoEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get nombre(): string {
    return this.props.nombre;
  }

  get numeroSerie(): string | null {
    return this.props.numeroSerie;
  }

  get marca(): string | null {
    return this.props.marca;
  }

  get modelo(): string | null {
    return this.props.modelo;
  }

  get fechaAdquisicion(): Date | null {
    return this.props.fechaAdquisicion;
  }

  get ubicacion(): string | null {
    return this.props.ubicacion;
  }

  get importe(): number | null {
    return this.props.importe;
  }

  get fechaValoracion(): Date | null {
    return this.props.fechaValoracion;
  }

  get observaciones(): string | null {
    return this.props.observaciones;
  }

  get valorResidual(): number | null {
    return this.props.valorResidual;
  }

  get fechaValorResidual(): Date | null {
    return this.props.fechaValorResidual;
  }

  get activo(): boolean {
    return this.props.activo;
  }

  // ─── Comportamiento de dominio ─────────────────────────────────────────

  /**
   * Da de baja el equipo (fuera de servicio). NO es soft delete: el
   * registro permanece visible en el historial y sigue siendo referenciable
   * por `ticket_soporte` existentes. Ver diferencia con `softDelete()` en
   * el JSDoc de la clase (ADR-9).
   */
  deactivate(): void {
    this.props.activo = false;
    this.touch();
  }

  /** Reactiva un equipo previamente dado de baja. */
  activate(): void {
    this.props.activo = true;
    this.touch();
  }

  /**
   * Actualiza los campos editables de datos (PATCH semántico): campos
   * `undefined` NO se tocan; los campos nullable en `null` limpian el valor
   * explícitamente.
   *
   * `ubicacion` se normaliza SIEMPRE a mayúscula (texto libre, invariante de
   * dominio) cuando no es null.
   *
   * @throws Error si algún campo de texto provisto excede su tope de largo
   *   DESPUÉS de normalizar (ver `normalizarUbicacion`), o si
   *   `importe`/`valorResidual` provisto es negativo o excede el techo de
   *   negocio. Backstop del contrato del caller: con el DTO midiendo ya
   *   normalizado (`equipos.dto.ts`), este `throw` solo es alcanzable si un
   *   caller interno evita el DTO.
   */
  actualizar(datos: {
    nombre?: string;
    numeroSerie?: string | null;
    marca?: string | null;
    modelo?: string | null;
    fechaAdquisicion?: Date | null;
    ubicacion?: string | null;
    importe?: number | null;
    fechaValoracion?: Date | null;
    observaciones?: string | null;
    valorResidual?: number | null;
    fechaValorResidual?: Date | null;
  }): void {
    // Mismo criterio que create(): normalizar ANTES de validar (ver comentario
    // en create() sobre la expansión de longitud de normalizarUbicacion()).
    const ubicacionNormalizada =
      datos.ubicacion != null ? normalizarUbicacion(datos.ubicacion) : datos.ubicacion;
    validarLargos({ ...datos, ubicacion: ubicacionNormalizada });
    validarValorMonetario('importe', datos.importe);
    validarValorMonetario('valorResidual', datos.valorResidual);
    if (datos.nombre !== undefined) {
      this.props.nombre = datos.nombre;
    }
    if (datos.numeroSerie !== undefined) {
      this.props.numeroSerie = datos.numeroSerie;
    }
    if (datos.marca !== undefined) {
      this.props.marca = datos.marca;
    }
    if (datos.modelo !== undefined) {
      this.props.modelo = datos.modelo;
    }
    if (datos.fechaAdquisicion !== undefined) {
      this.props.fechaAdquisicion = datos.fechaAdquisicion;
    }
    if (datos.ubicacion !== undefined) {
      // `ubicacionNormalizada` nunca es `undefined` acá (mismo `datos.ubicacion`
      // definido que se acaba de chequear); el `?? null` solo lo prueba al tipo.
      this.props.ubicacion = ubicacionNormalizada ?? null;
    }
    if (datos.importe !== undefined) {
      this.props.importe = datos.importe;
    }
    if (datos.fechaValoracion !== undefined) {
      this.props.fechaValoracion = datos.fechaValoracion;
    }
    if (datos.observaciones !== undefined) {
      this.props.observaciones = datos.observaciones;
    }
    if (datos.valorResidual !== undefined) {
      this.props.valorResidual = datos.valorResidual;
    }
    if (datos.fechaValorResidual !== undefined) {
      this.props.fechaValorResidual = datos.fechaValorResidual;
    }
    this.touch();
  }
}
