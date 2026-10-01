import { BaseEntity } from '../../../shared/domain/base-entity';
import { Result } from '../../../shared/domain/result';
import {
  InsumoRepuestoInexistenteError,
  MotivoRetiroRequeridoError,
} from '../errors/equipos.errors';

/**
 * Topes de largo, espejando `componentes_equipo.*`
 * (`prisma_tenant/schema.prisma`): `descripcion`/`numeroSerie`
 * `VarChar(255)`, `capacidad` `VarChar(100)`.
 *
 * Viven ACÁ y no en el DTO por el mismo motivo que en
 * `EquipoInformaticoEntity`: el dominio es la autoridad, el DTO importa para
 * no divergir.
 */
export const COMPONENTE_DESCRIPCION_MAX_LENGTH = 255;
export const COMPONENTE_NUMERO_SERIE_MAX_LENGTH = 255;
export const COMPONENTE_CAPACIDAD_MAX_LENGTH = 100;

/**
 * Tope de negocio del motivo de retiro. La columna `baja_motivo` es `TEXT`, así
 * que este número NO lo impone la base: lo iguala al de la bitácora de insumos
 * (`MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH`), porque con `STOCK_USADO` el mismo
 * motivo viaja a la ENTRADA y uno mayor rompería ahí.
 */
export const COMPONENTE_MOTIVO_RETIRO_MAX_LENGTH = 500;

/**
 * Destinos posibles de un retiro. Catálogo CERRADO por el CHECK
 * `componentes_equipo_baja_destino_check`; esta constante es la fuente única y
 * el spec de constraints la compara contra el CHECK real.
 *
 * - `STOCK_USADO`: la pieza sana vuelve al depósito como USADO.
 * - `DESCARTE`: la pieza se da por perdida.
 */
export const DESTINOS_RETIRO_COMPONENTE = ['STOCK_USADO', 'DESCARTE'] as const;
export type DestinoRetiroComponente = (typeof DESTINOS_RETIRO_COMPONENTE)[number];

/**
 * Precondición de largo. Va como `throw`, no como el `Result` que ya usa
 * `create()` para `insumoId`: un primitivo de texto fuera de
 * rango es violación de contrato del caller, distinta de una desviación de
 * negocio esperada (mismo criterio que `EquipoInformaticoEntity`).
 *
 * NO se aplica en `reconstitute()`: ahí la fila ya existe en la base, y hacer
 * explotar una lectura por un valor histórico convertiría un dato viejo en
 * una caída de sistema.
 */
function validarLargos(datos: {
  descripcion?: string | null;
  numeroSerie?: string | null;
  capacidad?: string | null;
}): void {
  if (datos.descripcion != null && datos.descripcion.length > COMPONENTE_DESCRIPCION_MAX_LENGTH) {
    throw new Error(
      `ComponenteEquipoEntity: descripcion excede ${COMPONENTE_DESCRIPCION_MAX_LENGTH} caracteres.`,
    );
  }
  if (datos.numeroSerie != null && datos.numeroSerie.length > COMPONENTE_NUMERO_SERIE_MAX_LENGTH) {
    throw new Error(
      `ComponenteEquipoEntity: numeroSerie excede ${COMPONENTE_NUMERO_SERIE_MAX_LENGTH} caracteres.`,
    );
  }
  if (datos.capacidad != null && datos.capacidad.length > COMPONENTE_CAPACIDAD_MAX_LENGTH) {
    throw new Error(
      `ComponenteEquipoEntity: capacidad excede ${COMPONENTE_CAPACIDAD_MAX_LENGTH} caracteres.`,
    );
  }
}

/**
 * ComponenteEquipoProps — shape de las propiedades de un componente físico
 * asociado a un equipo (F3-Q2). Sin imports de Prisma ni NestJS — dominio
 * puro.
 *
 * Sin tipo propio: el tipo del componente se deriva de la familia de su insumo
 * (sdd/catalogo-unico-componentes), no se persiste.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q2 (Tabla componentes_equipo).
 * Tarea: T10.3, T10.4.
 */
export interface ComponenteEquipoProps {
  /** UUID del equipo al que pertenece (FK → equipos_informaticos.id). */
  equipoId: string;
  /**
   * FK real → `insumos.id`: el repuesto del catálogo del que viene el
   * componente. Obligatorio (sdd/catalogo-unico-componentes): la existencia
   * del insumo y que su familia sea de repuesto las valida la capa de
   * aplicación (`AgregarComponenteUseCase`), no esta entidad.
   */
  insumoId: string;
  descripcion: string | null;
  /**
   * Serial del componente. Con `unidadId` es el serial RESUELTO de la unidad (lo
   * pone el mapper al leer; la base guarda NULL, ADR-7): una sola fuente.
   */
  numeroSerie: string | null;
  capacidad: string | null;
  /**
   * Unidad de insumo `SERIE` que el componente lleva (FK → `unidades_insumo.id`).
   * `null` = componente legado o de un insumo sin seguimiento por serie.
   */
  unidadId?: string | null;
  /**
   * SALIDA de stock que respaldó la instalación (FK → `movimientos_insumo.id`).
   * `null` = no consta una SALIDA vinculada: componente cargado a mano o
   * instalado antes de sdd/stock-usado-componentes.
   */
  instalacionMovimientoId?: string | null;
  /** Destino del retiro. `null` en un componente activo y en un retiro legado. */
  bajaDestino?: DestinoRetiroComponente | null;
  /** Motivo del retiro, ya normalizado. */
  bajaMotivo?: string | null;
  /** ENTRADA USADO que devolvió la pieza al stock (solo `STOCK_USADO`). */
  bajaMovimientoId?: string | null;
  /** Quién retiró (soft ref a `master.usuarios.id`). */
  bajaUsuarioId?: string | null;
}

/** Props tal como las guarda la entidad: los campos de retiro siempre presentes. */
type ComponenteEquipoPropsCompletas = Required<ComponenteEquipoProps>;

/**
 * ComponenteEquipoEntity — parte física asociada a un `EquipoInformatico`
 * (F3-Q2, ADR-9).
 *
 * `create()` retorna `Result.fail(InsumoRepuestoInexistenteError)` cuando falta
 * `insumoId` (vacío o ausente), en el patrón `Result` del resto de factories.
 *
 * Que el insumo exista y sea un repuesto activo es responsabilidad del use
 * case (`AgregarComponenteUseCase`): el dominio puro no tiene acceso a repos.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q2. Ref design: ADR-9, "Firmas
 * TS clave" (ComponenteEquipoEntity). Tarea: T10.3, T10.4.
 */
export class ComponenteEquipoEntity extends BaseEntity<ComponenteEquipoPropsCompletas> {
  private constructor(props: ComponenteEquipoProps, id?: string) {
    super(
      {
        ...props,
        unidadId: props.unidadId ?? null,
        instalacionMovimientoId: props.instalacionMovimientoId ?? null,
        bajaDestino: props.bajaDestino ?? null,
        bajaMotivo: props.bajaMotivo ?? null,
        bajaMovimientoId: props.bajaMovimientoId ?? null,
        bajaUsuarioId: props.bajaUsuarioId ?? null,
      },
      id,
    );
  }

  /**
   * Factory method con validación de dominio (`insumoId` requerido).
   * Retorna `Result.fail(InsumoRepuestoInexistenteError)` si está vacío/ausente.
   *
   * @throws Error si `descripcion`/`numeroSerie`/`capacidad` excede su tope
   *   de largo (precondición de contrato, ver `validarLargos`).
   */
  static create(
    props: ComponenteEquipoProps,
    id?: string,
  ): Result<ComponenteEquipoEntity, InsumoRepuestoInexistenteError> {
    validarLargos(props);
    if (!props.insumoId) {
      return Result.fail(new InsumoRepuestoInexistenteError(props.insumoId ?? ''));
    }
    return Result.ok(new ComponenteEquipoEntity(props, id));
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura). NO
   * re-valida `insumoId`: los datos ya fueron validados al persistir.
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

  /** Repuesto del catálogo del que viene este componente. */
  get insumoId(): string {
    return this.props.insumoId;
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

  /** Unidad de insumo que lleva este componente, o `null` si es legado / sin seguimiento por serie. */
  get unidadId(): string | null {
    return this.props.unidadId;
  }

  /** SALIDA de stock vinculada a la instalación, o `null` si no consta ninguna. */
  get instalacionMovimientoId(): string | null {
    return this.props.instalacionMovimientoId;
  }

  get bajaDestino(): DestinoRetiroComponente | null {
    return this.props.bajaDestino;
  }

  get bajaMotivo(): string | null {
    return this.props.bajaMotivo;
  }

  get bajaMovimientoId(): string | null {
    return this.props.bajaMovimientoId;
  }

  get bajaUsuarioId(): string | null {
    return this.props.bajaUsuarioId;
  }

  /**
   * "Sin salida registrada del depósito": el componente volvió al stock sin que
   * conste una SALIDA vinculada a su instalación. DERIVADA, no guardada: dos
   * columnas inmutables la determinan y una tercera podría desincronizarse.
   */
  get bajaSinSalidaPrevia(): boolean {
    return this.props.bajaDestino === 'STOCK_USADO' && this.props.instalacionMovimientoId === null;
  }

  /** `true` si el componente NO fue dado de baja (`deletedAt == null`). Derivado, no persiste aparte. */
  get activo(): boolean {
    return !this.isDeleted();
  }

  // ─── Comportamiento de dominio ─────────────────────────────────────────

  /**
   * Actualiza los campos editables (PATCH semántico, mismo criterio que
   * `EquipoInformaticoEntity.actualizar`): campos `undefined` NO se tocan;
   * los opcionales (`descripcion`, `numeroSerie`, `capacidad`) en `null`
   * limpian el valor explícitamente.
   *
   * Ni el tipo ni el insumo se editan: los fija el alta.
   *
   * @throws Error si `descripcion`/`numeroSerie`/`capacidad` provisto excede
   *   su tope de largo (precondición de contrato, ver `validarLargos`).
   */
  actualizar(datos: {
    descripcion?: string | null;
    numeroSerie?: string | null;
    capacidad?: string | null;
  }): void {
    validarLargos(datos);
    if (datos.descripcion !== undefined) {
      this.props.descripcion = datos.descripcion;
    }
    if (datos.numeroSerie !== undefined) {
      this.props.numeroSerie = datos.numeroSerie;
    }
    if (datos.capacidad !== undefined) {
      this.props.capacidad = datos.capacidad;
    }
    this.touch();
  }

  /**
   * Vincula la SALIDA de stock que respaldó la instalación. Lo llama la
   * instalación desde el depósito dentro de la misma transacción que la salida.
   */
  vincularInstalacion(movimientoId: string): void {
    this.props.instalacionMovimientoId = movimientoId;
    this.touch();
  }

  /**
   * Vincula la unidad de insumo que el componente lleva (alta sin descuento, D3).
   * El serial pasa a ser el de la unidad: la columna propia queda NULL (ADR-7) y
   * se resuelve al leer.
   */
  vincularUnidad(unidadId: string): void {
    this.props.unidadId = unidadId;
    this.props.numeroSerie = null;
    this.touch();
  }

  /**
   * Regla del motivo de retiro. Es obligatorio (con contenido) en `DESCARTE` y
   * en `STOCK_USADO` cuando no consta una SALIDA vinculada: sin él, esa vuelta
   * al stock fabricaría una unidad sin explicación. En `STOCK_USADO` con SALIDA
   * vinculada es opcional.
   *
   * @param destino Destino elegido para el retiro.
   * @param motivo Motivo crudo, tal como llega del usuario.
   * @returns El motivo sin espacios de borde (`null` si quedó vacío y no era
   *   obligatorio), o `MotivoRetiroRequeridoError`.
   * @throws Error si el motivo normalizado excede el tope (violación de
   *   contrato: el borde lo rechaza antes con un 400).
   */
  validarRetiro(
    destino: DestinoRetiroComponente,
    motivo: string | null | undefined,
  ): Result<string | null, MotivoRetiroRequeridoError> {
    const normalizado = motivo == null || motivo.trim() === '' ? null : motivo.trim();
    if (normalizado !== null && normalizado.length > COMPONENTE_MOTIVO_RETIRO_MAX_LENGTH) {
      throw new Error(
        `ComponenteEquipoEntity: motivo excede ${COMPONENTE_MOTIVO_RETIRO_MAX_LENGTH} caracteres.`,
      );
    }
    if (normalizado === null) {
      if (destino === 'DESCARTE') {
        return Result.fail(new MotivoRetiroRequeridoError('DESCARTE'));
      }
      if (this.props.instalacionMovimientoId === null) {
        return Result.fail(new MotivoRetiroRequeridoError('SIN_SALIDA_REGISTRADA'));
      }
    }
    return Result.ok(normalizado);
  }

  /**
   * Registra el retiro: destino, motivo, responsable y, con `STOCK_USADO`, la
   * ENTRADA que devolvió la pieza; y da de baja el componente. Espeja el CHECK
   * `componentes_equipo_baja_coherente_check`.
   *
   * @throws Error si el componente ya está dado de baja, si `STOCK_USADO` no
   *   trae `bajaMovimientoId` o si `DESCARTE` lo trae (violaciones de contrato
   *   del caller: el caso de uso ya validó el estado).
   */
  retirar(datos: {
    destino: DestinoRetiroComponente;
    motivo: string | null;
    usuarioId: string;
    bajaMovimientoId: string | null;
  }): void {
    if (this.isDeleted()) {
      throw new Error('ComponenteEquipoEntity: el componente ya está dado de baja.');
    }
    if (datos.destino === 'STOCK_USADO' && datos.bajaMovimientoId === null) {
      throw new Error('ComponenteEquipoEntity: STOCK_USADO exige la ENTRADA que lo devolvió.');
    }
    if (datos.destino === 'DESCARTE' && datos.bajaMovimientoId !== null) {
      throw new Error('ComponenteEquipoEntity: DESCARTE no lleva movimiento de stock.');
    }
    this.props.bajaDestino = datos.destino;
    this.props.bajaMotivo = datos.motivo;
    this.props.bajaMovimientoId = datos.bajaMovimientoId;
    this.props.bajaUsuarioId = datos.usuarioId;
    this.softDelete();
  }

  /**
   * Revierte la baja lógica (reactivación): limpia `deletedAt` y las cuatro
   * columnas de retiro, para que un componente activo nunca informe un destino
   * (lo exige el CHECK coherente). Se pierde el motivo de un descarte revertido:
   * reactivar existe para deshacer un retiro equivocado (ADR-5).
   *
   * `instalacionMovimientoId` se conserva: describe la instalación, no el retiro.
   * El use case (`ReactivarComponenteUseCase`) rechaza reactivar un componente
   * activo o devuelto al stock.
   */
  reactivar(): void {
    this._deletedAt = null;
    this.props.bajaDestino = null;
    this.props.bajaMotivo = null;
    this.props.bajaMovimientoId = null;
    this.props.bajaUsuarioId = null;
    this.touch();
  }
}
