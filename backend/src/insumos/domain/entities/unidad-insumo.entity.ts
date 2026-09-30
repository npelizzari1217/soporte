import { BaseEntity } from '../../../shared/domain/base-entity';
import { Result } from '../../../shared/domain/result';
import { SerialRequeridoError, UnidadNoDisponibleError } from '../errors/unidades-insumo.errors';
import { CondicionStock } from './tipo-movimiento-insumo';

/**
 * Catálogos, normalización y entidad de las unidades por número de serie
 * (sdd/repuestos-numero-de-serie, ADR-1 y ADR-9).
 *
 * Cada catálogo es la ÚNICA fuente de verdad del CHECK homónimo de la base, y
 * `unidades-insumo-constraints.integration.spec.ts` lo compara contra la
 * definición real con `pg_get_constraintdef`. Agregar un valor acá sin su
 * migración hace que el INSERT lo rechace el CHECK, y sin filtro global de
 * excepciones eso sale como 500.
 */

/** Modo de seguimiento de un insumo: por cantidad (hoy) o una unidad por pieza. */
export const SEGUIMIENTOS_INSUMO = ['NINGUNO', 'SERIE'] as const;

/** Seguimiento de un insumo, derivado de `SEGUIMIENTOS_INSUMO`. */
export type SeguimientoInsumo = (typeof SEGUIMIENTOS_INSUMO)[number];

/** Estados de una unidad. Ninguno es terminal (ver la máquina de estados del diseño, ADR-1). */
export const ESTADOS_UNIDAD_INSUMO = [
  'EN_DEPOSITO',
  'INSTALADA',
  'ENTREGADA',
  'DESCARTADA',
] as const;

/** Estado de una unidad, derivado de `ESTADOS_UNIDAD_INSUMO`. */
export type EstadoUnidadInsumo = (typeof ESTADOS_UNIDAD_INSUMO)[number];

/** Tipos de evento de la bitácora `eventos_unidad_insumo` (ADR-9). */
export const TIPOS_EVENTO_UNIDAD = [
  'INGRESO',
  'ALTA_INSTALADA',
  'SERIAL_CARGADO',
  'CORRECCION_SERIAL',
  'INSTALACION',
  'RETIRO_A_DEPOSITO',
  'DESCARTE',
  'ENTREGA',
  'DEVOLUCION_DE_ENTREGA',
  'BAJA_DE_DEPOSITO',
  'RECUPERACION',
  'REACTIVACION',
] as const;

/** Tipo de evento de una unidad, derivado de `TIPOS_EVENTO_UNIDAD`. */
export type TipoEventoUnidad = (typeof TIPOS_EVENTO_UNIDAD)[number];

/**
 * Largo máximo del número de serie cargado: el `VarChar(255)` de
 * `unidades_insumo.numero_serie` (y de `componentes_equipo.numero_serie`).
 * El dominio es la autoridad; la columna es backstop.
 */
export const UNIDAD_SERIAL_MAX_LENGTH = 255;

/**
 * Forma normalizada de un número de serie, sobre la que se compara la unicidad
 * por insumo: sin espacios (ni los de los bordes ni los internos) y en
 * mayúsculas. Es la ÚNICA normalización del sistema: la base solo compara la
 * columna `numero_serie_normalizado`, porque `toUpperCase()` de JS y `upper()`
 * de Postgres difieren fuera de ASCII.
 *
 * `ß` pasa a `SS` (semántica de `String.prototype.toUpperCase`), así que la
 * forma normalizada puede ser más larga que la cargada.
 *
 * @param serial Serial tal como lo cargó el usuario.
 * @returns La forma normalizada, o `''` si no quedó ningún carácter: el
 *   llamador trata el vacío como serie pendiente y nunca lo persiste.
 */
export function normalizarSerial(serial: string): string {
  return serial.replace(/\s+/g, '').toUpperCase();
}

/**
 * Operaciones que mueven una unidad entre estados. Es el vocabulario de la
 * máquina de estados de ADR-1; cada una se corresponde con un método de
 * `UnidadInsumoEntity`.
 */
export const OPERACIONES_UNIDAD = [
  'ENTREGAR',
  'INSTALAR',
  'DESCARTAR_DE_DEPOSITO',
  'DEVOLVER_ENTREGA',
  'DEVOLVER_AL_DEPOSITO',
  'DESCARTAR_INSTALADA',
  'REINSTALAR',
  'RECUPERAR',
] as const;

/** Operación de transición de una unidad, derivada de `OPERACIONES_UNIDAD`. */
export type OperacionUnidad = (typeof OPERACIONES_UNIDAD)[number];

/**
 * Tabla de transiciones de ADR-1: FUENTE ÚNICA de la máquina de estados. Es un
 * `Record` sobre `OperacionUnidad`, así que una operación nueva sin su fila no
 * compila. Las reglas que dependen del serial (una `INSTALADA` siempre tiene
 * serial; una pendiente solo sale del depósito por descarte) no van acá sino en
 * `requiereSerial`.
 */
export const TRANSICIONES_UNIDAD: Readonly<
  Record<
    OperacionUnidad,
    { desde: EstadoUnidadInsumo; hacia: EstadoUnidadInsumo; requiereSerial: boolean }
  >
> = {
  ENTREGAR: { desde: 'EN_DEPOSITO', hacia: 'ENTREGADA', requiereSerial: true },
  INSTALAR: { desde: 'EN_DEPOSITO', hacia: 'INSTALADA', requiereSerial: true },
  DESCARTAR_DE_DEPOSITO: { desde: 'EN_DEPOSITO', hacia: 'DESCARTADA', requiereSerial: false },
  DEVOLVER_ENTREGA: { desde: 'ENTREGADA', hacia: 'EN_DEPOSITO', requiereSerial: false },
  DEVOLVER_AL_DEPOSITO: { desde: 'INSTALADA', hacia: 'EN_DEPOSITO', requiereSerial: false },
  DESCARTAR_INSTALADA: { desde: 'INSTALADA', hacia: 'DESCARTADA', requiereSerial: false },
  REINSTALAR: { desde: 'DESCARTADA', hacia: 'INSTALADA', requiereSerial: true },
  RECUPERAR: { desde: 'DESCARTADA', hacia: 'EN_DEPOSITO', requiereSerial: false },
};

export interface UnidadInsumoProps {
  /** FK a `insumos`. Que el insumo sea `SERIE` lo valida la capa de aplicación. */
  insumoId: string;
  /** Forma cargada y recortada, o `null` si la serie está pendiente. */
  numeroSerie: string | null;
  /** `normalizarSerial(numeroSerie)`, o `null` si la serie está pendiente. Columna contra la que compara el índice único. */
  numeroSerieNormalizado: string | null;
  condicion: CondicionStock;
  estado: EstadoUnidadInsumo;
  /** Solo una unidad `INSTALADA` refiere su equipo (CHECK de la base). */
  equipoId: string | null;
}

/**
 * Serial listo para persistir: la forma cargada recortada y su forma
 * normalizada. Va como `throw` ante un largo excedido porque el borde ya lo
 * rechaza con un 400; es el backstop del caller que no pasa por él.
 *
 * El largo se mide sobre AMBAS formas: `normalizarSerial('ß')` es `'SS'`, así
 * que la normalizada puede pasar el tope aunque la cargada no.
 *
 * @param serial Serial crudo, tal como llega del usuario.
 * @returns `Result.fail(SerialRequeridoError)` si no queda ningún carácter tras normalizar.
 * @throws Error si la forma recortada o la normalizada exceden `UNIDAD_SERIAL_MAX_LENGTH`.
 */
function prepararSerial(
  serial: string,
): Result<{ numeroSerie: string; numeroSerieNormalizado: string }, SerialRequeridoError> {
  const numeroSerieNormalizado = normalizarSerial(serial);
  if (numeroSerieNormalizado === '') {
    return Result.fail(new SerialRequeridoError('el serial no puede estar vacío.'));
  }
  const numeroSerie = serial.trim();
  if (
    numeroSerie.length > UNIDAD_SERIAL_MAX_LENGTH ||
    numeroSerieNormalizado.length > UNIDAD_SERIAL_MAX_LENGTH
  ) {
    throw new Error(
      `UnidadInsumoEntity: numeroSerie (o su forma normalizada) excede ${UNIDAD_SERIAL_MAX_LENGTH} caracteres.`,
    );
  }
  return Result.ok({ numeroSerie, numeroSerieNormalizado });
}

/**
 * UnidadInsumoEntity — una pieza de un insumo con seguimiento por serie.
 *
 * Implementa la máquina de estados de ADR-1 (ningún estado es terminal). La
 * **serie pendiente** es `numeroSerie === null`, no un flag: una pendiente solo
 * nace `EN_DEPOSITO` y solo sale del depósito por descarte (ajuste negativo),
 * porque instalar o entregar exigen serial. Una `INSTALADA` siempre tiene
 * serial.
 *
 * La entidad valida UNA fila: no consulta unicidad ni bloquea (eso es de
 * `OperacionesUnidadInsumo`). Las transiciones inválidas devuelven
 * `UnidadNoDisponibleError` sin mutar la unidad.
 */
export class UnidadInsumoEntity extends BaseEntity<UnidadInsumoProps> {
  /**
   * Nueva unidad `EN_DEPOSITO`, con serial o pendiente (`numeroSerie: null`).
   *
   * @param props Insumo, condición y serial crudo o `null`.
   * @param id Id explícito; si se omite lo genera `BaseEntity`.
   * @returns La unidad, o `SerialRequeridoError` si el serial viene pero queda vacío al normalizarlo.
   * @throws Error si el serial (recortado o normalizado) excede `UNIDAD_SERIAL_MAX_LENGTH`.
   */
  static crearEnDeposito(
    props: { insumoId: string; condicion: CondicionStock; numeroSerie: string | null },
    id?: string,
  ): Result<UnidadInsumoEntity, SerialRequeridoError> {
    let serial: { numeroSerie: string; numeroSerieNormalizado: string } | null = null;
    if (props.numeroSerie !== null) {
      const preparado = prepararSerial(props.numeroSerie);
      if (preparado.isFail()) return Result.fail(preparado.getError());
      serial = preparado.getValue();
    }
    return Result.ok(
      new UnidadInsumoEntity(
        {
          insumoId: props.insumoId,
          numeroSerie: serial?.numeroSerie ?? null,
          numeroSerieNormalizado: serial?.numeroSerieNormalizado ?? null,
          condicion: props.condicion,
          estado: 'EN_DEPOSITO',
          equipoId: null,
        },
        id,
      ),
    );
  }

  /**
   * Nueva unidad `INSTALADA` (alta sin descuento, D3). El serial es
   * obligatorio: una instalada siempre lo tiene.
   *
   * @param props Insumo, condición, serial crudo y equipo donde queda instalada.
   * @param id Id explícito; si se omite lo genera `BaseEntity`.
   * @returns La unidad, o `SerialRequeridoError` si el serial queda vacío al normalizarlo.
   * @throws Error si el serial (recortado o normalizado) excede `UNIDAD_SERIAL_MAX_LENGTH`.
   */
  static crearInstalada(
    props: { insumoId: string; condicion: CondicionStock; numeroSerie: string; equipoId: string },
    id?: string,
  ): Result<UnidadInsumoEntity, SerialRequeridoError> {
    const preparado = prepararSerial(props.numeroSerie);
    if (preparado.isFail()) return Result.fail(preparado.getError());
    return Result.ok(
      new UnidadInsumoEntity(
        {
          insumoId: props.insumoId,
          ...preparado.getValue(),
          condicion: props.condicion,
          estado: 'INSTALADA',
          equipoId: props.equipoId,
        },
        id,
      ),
    );
  }

  /**
   * Rehidrata una unidad desde persistencia. NO valida: la fila ya existe y
   * una lectura no debe explotar por un dato histórico.
   *
   * @param props Campos leídos de la base.
   * @param id Id persistido.
   * @param createdAt Alta original.
   * @param updatedAt Última modificación.
   * @returns La entidad reconstituida.
   */
  static reconstitute(
    props: UnidadInsumoProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
  ): UnidadInsumoEntity {
    const entity = new UnidadInsumoEntity({ ...props }, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    return entity;
  }

  get insumoId(): string {
    return this.props.insumoId;
  }

  /** Serial cargado, o `null` si la serie está pendiente. */
  get numeroSerie(): string | null {
    return this.props.numeroSerie;
  }

  /** Forma normalizada del serial (la que compara la unicidad), o `null` si está pendiente. */
  get numeroSerieNormalizado(): string | null {
    return this.props.numeroSerieNormalizado;
  }

  get condicion(): CondicionStock {
    return this.props.condicion;
  }

  get estado(): EstadoUnidadInsumo {
    return this.props.estado;
  }

  /** Equipo donde está instalada; `null` en cualquier otro estado. */
  get equipoId(): string | null {
    return this.props.equipoId;
  }

  /** `true` si la unidad todavía no tiene serial cargado. */
  get esPendiente(): boolean {
    return this.props.numeroSerie === null;
  }

  /**
   * Carga el serial de una unidad en serie pendiente. Solo acepta una unidad
   * `EN_DEPOSITO` sin serial: una pendiente descartada queda sin serial para
   * siempre y una con serial se corrige con `corregirSerial`, que deja
   * historial.
   *
   * @param serial Serial crudo.
   * @returns `UnidadNoDisponibleError` si no está `EN_DEPOSITO` o ya tiene serial; `SerialRequeridoError` si queda vacío.
   * @throws Error si el serial excede `UNIDAD_SERIAL_MAX_LENGTH`.
   */
  cargarSerial(serial: string): Result<void, UnidadNoDisponibleError | SerialRequeridoError> {
    if (this.props.estado !== 'EN_DEPOSITO') {
      return Result.fail(
        new UnidadNoDisponibleError(
          this.id,
          `el serial solo se carga con la unidad en el depósito (está ${this.props.estado}).`,
        ),
      );
    }
    if (this.props.numeroSerie !== null) {
      return Result.fail(
        new UnidadNoDisponibleError(this.id, 'ya tiene serial; para cambiarlo hay que corregirlo.'),
      );
    }
    const preparado = prepararSerial(serial);
    if (preparado.isFail()) return Result.fail(preparado.getError());
    Object.assign(this.props, preparado.getValue());
    this.touch();
    return Result.ok(undefined);
  }

  /**
   * Corrige el serial de una unidad que ya lo tiene, en cualquier estado. El
   * motivo y el historial los registra quien llama (`OperacionesUnidadInsumo`).
   *
   * @param serial Serial nuevo, crudo.
   * @returns El serial anterior, o `UnidadNoDisponibleError` si la unidad es pendiente (se carga, no se corrige), o `SerialRequeridoError` si el nuevo queda vacío.
   * @throws Error si el serial excede `UNIDAD_SERIAL_MAX_LENGTH`.
   */
  corregirSerial(serial: string): Result<string, UnidadNoDisponibleError | SerialRequeridoError> {
    const anterior = this.props.numeroSerie;
    if (anterior === null) {
      return Result.fail(
        new UnidadNoDisponibleError(
          this.id,
          'es una serie pendiente; el serial se carga, no se corrige.',
        ),
      );
    }
    const preparado = prepararSerial(serial);
    if (preparado.isFail()) return Result.fail(preparado.getError());
    Object.assign(this.props, preparado.getValue());
    this.touch();
    return Result.ok(anterior);
  }

  /** `EN_DEPOSITO` con serial → `ENTREGADA` (salida manual). */
  entregar(): Result<void, UnidadNoDisponibleError> {
    return this.transicionar('ENTREGAR', {});
  }

  /** `EN_DEPOSITO` con serial → `INSTALADA` en `equipoId`. */
  instalar(equipoId: string): Result<void, UnidadNoDisponibleError> {
    return this.transicionar('INSTALAR', { equipoId });
  }

  /** `EN_DEPOSITO`, con serial o pendiente → `DESCARTADA` (ajuste negativo, F1). */
  descartarDeDeposito(): Result<void, UnidadNoDisponibleError> {
    return this.transicionar('DESCARTAR_DE_DEPOSITO', {});
  }

  /** `ENTREGADA` → `EN_DEPOSITO` en la condición elegida, NUEVO o USADO (F2). */
  devolverEntrega(condicion: CondicionStock): Result<void, UnidadNoDisponibleError> {
    return this.transicionar('DEVOLVER_ENTREGA', { condicion });
  }

  /** `INSTALADA` → `EN_DEPOSITO` USADO (retiro `STOCK_USADO`). */
  devolverAlDeposito(): Result<void, UnidadNoDisponibleError> {
    return this.transicionar('DEVOLVER_AL_DEPOSITO', { condicion: 'USADO' });
  }

  /** `INSTALADA` → `DESCARTADA` (retiro `DESCARTE`). */
  descartarInstalada(): Result<void, UnidadNoDisponibleError> {
    return this.transicionar('DESCARTAR_INSTALADA', {});
  }

  /** `DESCARTADA` con serial → `INSTALADA` en `equipoId` (reactivar el componente que la descartó). */
  reinstalar(equipoId: string): Result<void, UnidadNoDisponibleError> {
    return this.transicionar('REINSTALAR', { equipoId });
  }

  /** `DESCARTADA` (cualquier origen), con serial o pendiente → `EN_DEPOSITO` en la condición elegida (G1). */
  recuperar(condicion: CondicionStock): Result<void, UnidadNoDisponibleError> {
    return this.transicionar('RECUPERAR', { condicion });
  }

  /**
   * Aplica una fila de `TRANSICIONES_UNIDAD`: valida el estado de origen y el
   * serial, y solo entonces muta. Mantiene el CHECK de la base
   * `(estado = 'INSTALADA') = (equipo_id IS NOT NULL)`: el equipo se fija al
   * entrar a `INSTALADA` y se borra al salir.
   */
  private transicionar(
    operacion: OperacionUnidad,
    cambios: { condicion?: CondicionStock; equipoId?: string },
  ): Result<void, UnidadNoDisponibleError> {
    const { desde, hacia, requiereSerial } = TRANSICIONES_UNIDAD[operacion];
    if (this.props.estado !== desde) {
      return Result.fail(
        new UnidadNoDisponibleError(
          this.id,
          `${operacion} exige estado ${desde} y está ${this.props.estado}.`,
        ),
      );
    }
    if (requiereSerial && this.props.numeroSerie === null) {
      return Result.fail(
        new UnidadNoDisponibleError(
          this.id,
          `${operacion} exige serial y la unidad es una serie pendiente.`,
        ),
      );
    }
    this.props.estado = hacia;
    this.props.equipoId = hacia === 'INSTALADA' ? (cambios.equipoId ?? null) : null;
    if (cambios.condicion !== undefined) {
      this.props.condicion = cambios.condicion;
    }
    this.touch();
    return Result.ok(undefined);
  }
}
