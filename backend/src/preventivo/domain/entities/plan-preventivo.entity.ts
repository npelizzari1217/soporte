import { BaseEntity } from '../../../shared/domain/base-entity';
import { Result } from '../../../shared/domain/result';
import {
  AnticipacionInvalidaError,
  AnticipacionNoMenorQueCadenciaError,
  IntervaloExcedeMaximoError,
  IntervaloInvalidoError,
  ObjetivoInvalidoError,
  TituloDemasiadoLargoError,
  UbicacionDemasiadoLargaError,
  UnidadAnticipacionInvalidaError,
  UnidadIntervaloInvalidaError,
} from '../errors/preventivo.errors';

/**
 * Catálogo cerrado de unidades de cadencia, en runtime — ÚNICA fuente de
 * verdad: el tipo se deriva de acá, no al revés (mismo idiom que
 * `RESULTADOS_GENERACION` en `i-preventivo-generacion.repository.ts`).
 *
 * Existe como array y no solo como unión porque el CHECK
 * `planes_preventivo_intervalo_unidad_check` (migración
 * `20260825110000_preventivo_planes`) enumera los mismos dos valores en la
 * DB, y una unión de TypeScript se borra al compilar: sin esta constante no
 * hay nada que un test pueda comparar contra la base. La deriva entre ambas
 * listas se verifica en `preventivo-schema.integration.spec.ts`.
 */
export const UNIDADES_INTERVALO = ['DIAS', 'MESES'] as const;

/** Catálogo cerrado de unidades de cadencia (`planes_preventivo_intervalo_unidad_check`). */
export type IntervaloUnidad = (typeof UNIDADES_INTERVALO)[number];

/**
 * Largo máximo de `titulo`/`ubicacion`. Espeja `@db.VarChar(255)`
 * (`prisma_tenant/schema.prisma:822,828`) — el dominio es la AUTORIDAD de
 * este límite, el `VARCHAR` de Postgres es backstop (mismo criterio que
 * ADR-PV1). Sin este guard, un título de 300 caracteres pasaba dominio y DTO
 * y reventaba en un `PrismaClientKnownRequestError` (P2000) SIN MAPEAR —
 * 500 crudo alcanzable por HTTP (hallazgo de revisión).
 */
export const TITULO_MAX_LENGTH = 255;
export const UBICACION_MAX_LENGTH = 255;

/**
 * Techo de `intervalo_valor`. Se aplica al NÚMERO, sea cual sea la unidad: con
 * `DIAS` son ~10 años, con `MESES` bastante más. No es un techo temporal
 * exacto y no pretende serlo — su trabajo es cortar el absurdo lejos del
 * desborde. Sin techo,
 * un valor como 3_000_000_000 pasaba `Number.isInteger()`/`@IsPositive()`
 * sin problema y desbordaba el `int4` de la columna (`@db.Int`, rango
 * ±2147483647) recién al llegar a Postgres, otra vez como un
 * `PrismaClientKnownRequestError` sin mapear. 3650 queda muy por debajo del
 * límite de `int4` (a años luz de un desborde real) y es el mismo criterio
 * de "techo defendible de negocio, no el límite físico de la columna" que ya
 * usa `compras/domain/errors/compras.errors.ts` (`NumeradorCompraAgotadoError`,
 * techo 99999 sobre una columna que tampoco lo impone directamente).
 */
export const INTERVALO_VALOR_MAXIMO = 3650;

/**
 * Días que vale un mes al comparar la anticipación contra la cadencia
 * (odd/preventivo-anticipacion S6). Es una equivalencia de VALIDACIÓN, no de
 * calendario: la fecha de generación se calcula con meses reales
 * (`CalcularCicloService.fechaGeneracion`). El CHECK
 * `planes_preventivo_anticipacion_menor_cadencia_check` usa el mismo 30 y el
 * front lo copia en `features/preventivo/schemas.ts`, con un test centinela.
 */
export const DIAS_POR_MES_ANTICIPACION = 30;

/** Unión de errores que puede devolver `create()`/`editar()`. */
export type PlanPreventivoDomainError =
  | ObjetivoInvalidoError
  | IntervaloInvalidoError
  | UnidadIntervaloInvalidaError
  | TituloDemasiadoLargoError
  | UbicacionDemasiadoLargaError
  | IntervaloExcedeMaximoError
  | AnticipacionInvalidaError
  | UnidadAnticipacionInvalidaError
  | AnticipacionNoMenorQueCadenciaError;

/**
 * PlanPreventivoProps — shape de las propiedades de dominio de
 * `PlanPreventivoEntity` (TENANT, `planes_preventivo`). Sin imports de
 * Prisma ni NestJS — dominio puro.
 */
export interface PlanPreventivoProps {
  titulo: string;
  instrucciones: string | null;
  /** FK real a `equipos_informaticos`. Excluyente con `ubicacion` (ADR-PV1). */
  equipoId: string | null;
  /** Texto libre normalizado a mayúscula. Excluyente con `equipoId` (ADR-PV1). */
  ubicacion: string | null;
  prioridadId: string;
  /**
   * Tipo de ticket de los tickets que genera el plan (odd/preventivo-por-tipo, S2). Cualquier tipo
   * del catálogo; que esté vigente para nuevas altas y que el actor tenga permiso sobre él lo decide
   * la capa de aplicación, que es la que puede consultar el catálogo y el alcance.
   */
  tipoId: string;
  /** Soft ref → master.usuarios.id. Solicitante/autor del ticket generado. */
  responsableId: string;
  /** Entero estrictamente positivo. */
  intervaloValor: number;
  intervaloUnidad: IntervaloUnidad;
  /**
   * Cuánto antes de la fecha del ciclo se genera el ticket
   * (odd/preventivo-anticipacion S1). Entero `>= 0`, estrictamente menor que
   * la cadencia comparadas en días. `0` es el comportamiento previo: el
   * ticket se genera el día del ciclo.
   */
  anticipacionValor: number;
  anticipacionUnidad: IntervaloUnidad;
  /** Ancla INMUTABLE de la recurrencia — nunca se recalcula desde el ciclo anterior. */
  fechaInicio: Date;
  /** Puntero que el barrido consulta y avanza. */
  proximaEjecucionEn: Date;
  activo: boolean;
}

/**
 * Props de entrada de `create()` — mismo shape que `PlanPreventivoProps`,
 * con la anticipación opcional: ausente equivale a 0 días (S5), el
 * comportamiento que tenía todo plan antes de que existiera el campo.
 */
export type PlanPreventivoCreateProps = Omit<
  PlanPreventivoProps,
  'anticipacionValor' | 'anticipacionUnidad'
> &
  Partial<Pick<PlanPreventivoProps, 'anticipacionValor' | 'anticipacionUnidad'>>;

/** Campos editables de `editar()`. `undefined` = no se toca (PATCH semántico). */
export type PlanPreventivoEditarProps = Partial<
  Pick<
    PlanPreventivoProps,
    | 'titulo'
    | 'instrucciones'
    | 'equipoId'
    | 'ubicacion'
    | 'prioridadId'
    | 'tipoId'
    | 'responsableId'
    | 'intervaloValor'
    | 'intervaloUnidad'
    | 'anticipacionValor'
    | 'anticipacionUnidad'
    | 'activo'
  >
>;

/** Normaliza `ubicacion` a mayúscula (mismo criterio que `equipos_informaticos.ubicacion`). */
function normalizarUbicacion(ubicacion: string | null): string | null {
  if (ubicacion === null) return null;
  const recortada = ubicacion.trim();
  return recortada.length === 0 ? null : recortada.toUpperCase();
}

/** Valida el largo de `titulo` contra el `@db.VarChar(255)` de la columna. */
function validarTitulo(titulo: string): TituloDemasiadoLargoError | null {
  if (titulo.length > TITULO_MAX_LENGTH) {
    return new TituloDemasiadoLargoError(titulo.length);
  }
  return null;
}

/** Valida el largo de `ubicacion` (ya normalizada) contra el `@db.VarChar(255)` de la columna. */
function validarUbicacionLargo(
  ubicacionNormalizada: string | null,
): UbicacionDemasiadoLargaError | null {
  if (ubicacionNormalizada !== null && ubicacionNormalizada.length > UBICACION_MAX_LENGTH) {
    return new UbicacionDemasiadoLargaError(ubicacionNormalizada.length);
  }
  return null;
}

/**
 * Valida el objetivo excluyente (ADR-PV1). Retorna el error si viola el
 * XOR, `null` si es válido. Autoridad de dominio de
 * `planes_preventivo_objetivo_check` — el CHECK de Postgres es backstop.
 */
function validarObjetivo(
  equipoId: string | null,
  ubicacionNormalizada: string | null,
): ObjetivoInvalidoError | null {
  const tieneEquipo = equipoId !== null;
  const tieneUbicacion = ubicacionNormalizada !== null;
  if (tieneEquipo === tieneUbicacion) {
    return new ObjetivoInvalidoError(tieneEquipo, tieneUbicacion);
  }
  return null;
}

/** Valida cadencia estrictamente positiva, dentro del techo de negocio, y unidad dentro del catálogo cerrado. */
function validarIntervalo(
  valor: number,
  unidad: IntervaloUnidad,
): IntervaloInvalidoError | UnidadIntervaloInvalidaError | IntervaloExcedeMaximoError | null {
  if (!Number.isInteger(valor) || valor <= 0) {
    return new IntervaloInvalidoError(valor);
  }
  if (!UNIDADES_INTERVALO.includes(unidad)) {
    return new UnidadIntervaloInvalidaError(unidad);
  }
  if (valor > INTERVALO_VALOR_MAXIMO) {
    return new IntervaloExcedeMaximoError(valor);
  }
  return null;
}

/** Describe una magnitud para un mensaje: `"1 día"`, `"30 días"`, `"2 meses = 60 días"`. */
function describirMagnitud(valor: number, unidad: IntervaloUnidad): string {
  if (unidad === 'DIAS') {
    return `${valor} ${valor === 1 ? 'día' : 'días'}`;
  }
  return `${valor} ${valor === 1 ? 'mes' : 'meses'} = ${valor * DIAS_POR_MES_ANTICIPACION} días`;
}

/** Pasa una magnitud a días para comparar, con un mes = `DIAS_POR_MES_ANTICIPACION`. */
function enDias(valor: number, unidad: IntervaloUnidad): number {
  return unidad === 'MESES' ? valor * DIAS_POR_MES_ANTICIPACION : valor;
}

/**
 * Valida la anticipación (S6): entero `>= 0`, unidad del catálogo cerrado, y
 * estrictamente menor que la cadencia comparadas en días. Corre DESPUÉS de
 * `validarIntervalo`, así que la cadencia que recibe ya es válida.
 */
function validarAnticipacion(
  valor: number,
  unidad: IntervaloUnidad,
  intervaloValor: number,
  intervaloUnidad: IntervaloUnidad,
):
  | AnticipacionInvalidaError
  | UnidadAnticipacionInvalidaError
  | AnticipacionNoMenorQueCadenciaError
  | null {
  if (!Number.isInteger(valor) || valor < 0) {
    return new AnticipacionInvalidaError(valor);
  }
  if (!UNIDADES_INTERVALO.includes(unidad)) {
    return new UnidadAnticipacionInvalidaError(unidad);
  }
  if (enDias(valor, unidad) >= enDias(intervaloValor, intervaloUnidad)) {
    return new AnticipacionNoMenorQueCadenciaError(
      describirMagnitud(valor, unidad),
      describirMagnitud(intervaloValor, intervaloUnidad),
    );
  }
  return null;
}

/**
 * PlanPreventivoEntity — entidad de dominio de un plan de mantenimiento
 * preventivo. `create()`/`editar()` son la AUTORIDAD del objetivo
 * excluyente y de la cadencia válida: el CHECK de Postgres
 * (`planes_preventivo_objetivo_check`, `..._intervalo_valor_check`,
 * `..._intervalo_unidad_check`) es backstop, no la primera línea de
 * defensa.
 *
 * Ref spec: sdd/preventivo/spec, Requirements "Objetivo excluyente del
 * plan" y "Recurrencia por tiempo, anclada a fecha inmutable". Ref design:
 * ADR-PV1, ADR-PV2. Tarea: 3.1/3.2.
 */
export class PlanPreventivoEntity extends BaseEntity<PlanPreventivoProps> {
  private constructor(props: PlanPreventivoProps, id?: string) {
    super(props, id);
  }

  /**
   * Factory method con validación de dominio. Retorna
   * `Result.fail(ObjetivoInvalidoError | IntervaloInvalidoError | UnidadIntervaloInvalidaError)`
   * si viola alguna invariante.
   */
  static create(
    props: PlanPreventivoCreateProps,
    id?: string,
  ): Result<PlanPreventivoEntity, PlanPreventivoDomainError> {
    const ubicacionNormalizada = normalizarUbicacion(props.ubicacion);

    const errorTitulo = validarTitulo(props.titulo);
    if (errorTitulo) return Result.fail(errorTitulo);

    const errorUbicacionLargo = validarUbicacionLargo(ubicacionNormalizada);
    if (errorUbicacionLargo) return Result.fail(errorUbicacionLargo);

    const errorObjetivo = validarObjetivo(props.equipoId, ubicacionNormalizada);
    if (errorObjetivo) return Result.fail(errorObjetivo);

    const errorIntervalo = validarIntervalo(props.intervaloValor, props.intervaloUnidad);
    if (errorIntervalo) return Result.fail(errorIntervalo);

    const anticipacionValor = props.anticipacionValor ?? 0;
    const anticipacionUnidad = props.anticipacionUnidad ?? 'DIAS';
    const errorAnticipacion = validarAnticipacion(
      anticipacionValor,
      anticipacionUnidad,
      props.intervaloValor,
      props.intervaloUnidad,
    );
    if (errorAnticipacion) return Result.fail(errorAnticipacion);

    return Result.ok(
      new PlanPreventivoEntity(
        { ...props, ubicacion: ubicacionNormalizada, anticipacionValor, anticipacionUnidad },
        id,
      ),
    );
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura). NO
   * re-valida: los datos ya pasaron por `create()`/`editar()` (o el CHECK
   * de DB) al persistirse.
   */
  static reconstitute(
    props: PlanPreventivoProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): PlanPreventivoEntity {
    const entity = new PlanPreventivoEntity({ ...props }, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get titulo(): string {
    return this.props.titulo;
  }

  get instrucciones(): string | null {
    return this.props.instrucciones;
  }

  get equipoId(): string | null {
    return this.props.equipoId;
  }

  get ubicacion(): string | null {
    return this.props.ubicacion;
  }

  get prioridadId(): string {
    return this.props.prioridadId;
  }

  get tipoId(): string {
    return this.props.tipoId;
  }

  get responsableId(): string {
    return this.props.responsableId;
  }

  get intervaloValor(): number {
    return this.props.intervaloValor;
  }

  get intervaloUnidad(): IntervaloUnidad {
    return this.props.intervaloUnidad;
  }

  get anticipacionValor(): number {
    return this.props.anticipacionValor;
  }

  get anticipacionUnidad(): IntervaloUnidad {
    return this.props.anticipacionUnidad;
  }

  get fechaInicio(): Date {
    return this.props.fechaInicio;
  }

  get proximaEjecucionEn(): Date {
    return this.props.proximaEjecucionEn;
  }

  get activo(): boolean {
    return this.props.activo;
  }

  // ─── Comportamiento de dominio ───────────────────────────────────────────

  /**
   * Edita los campos provistos (PATCH semántico: `undefined` no se toca).
   * Re-valida el objetivo excluyente y la cadencia sobre el estado
   * RESULTANTE (no solo los campos tocados) — editar solo `intervaloValor`
   * no puede dejar un objetivo que ya era inválido pasar desapercibido, y
   * viceversa. NO muta si la validación falla.
   *
   * `proximaEjecucionEn` NO se toca acá: su recálculo hacia adelante desde
   * hoy al editar la cadencia [R2] es responsabilidad de la capa de
   * aplicación (WU-4), que usa `CalcularCicloService` y el reloj real.
   */
  editar(datos: PlanPreventivoEditarProps): Result<void, PlanPreventivoDomainError> {
    const equipoId = datos.equipoId !== undefined ? datos.equipoId : this.props.equipoId;
    const ubicacionNormalizada =
      datos.ubicacion !== undefined ? normalizarUbicacion(datos.ubicacion) : this.props.ubicacion;
    const intervaloValor =
      datos.intervaloValor !== undefined ? datos.intervaloValor : this.props.intervaloValor;
    const intervaloUnidad =
      datos.intervaloUnidad !== undefined ? datos.intervaloUnidad : this.props.intervaloUnidad;
    const anticipacionValor =
      datos.anticipacionValor !== undefined
        ? datos.anticipacionValor
        : this.props.anticipacionValor;
    const anticipacionUnidad =
      datos.anticipacionUnidad !== undefined
        ? datos.anticipacionUnidad
        : this.props.anticipacionUnidad;
    const titulo = datos.titulo !== undefined ? datos.titulo : this.props.titulo;

    const errorTitulo = validarTitulo(titulo);
    if (errorTitulo) return Result.fail(errorTitulo);

    const errorUbicacionLargo = validarUbicacionLargo(ubicacionNormalizada);
    if (errorUbicacionLargo) return Result.fail(errorUbicacionLargo);

    const errorObjetivo = validarObjetivo(equipoId, ubicacionNormalizada);
    if (errorObjetivo) return Result.fail(errorObjetivo);

    const errorIntervalo = validarIntervalo(intervaloValor, intervaloUnidad);
    if (errorIntervalo) return Result.fail(errorIntervalo);

    // Contra la cadencia RESULTANTE: bajar la cadencia puede dejar inválida
    // una anticipación que nadie tocó.
    const errorAnticipacion = validarAnticipacion(
      anticipacionValor,
      anticipacionUnidad,
      intervaloValor,
      intervaloUnidad,
    );
    if (errorAnticipacion) return Result.fail(errorAnticipacion);

    if (datos.titulo !== undefined) this.props.titulo = datos.titulo;
    if (datos.instrucciones !== undefined) this.props.instrucciones = datos.instrucciones;
    this.props.equipoId = equipoId;
    this.props.ubicacion = ubicacionNormalizada;
    if (datos.prioridadId !== undefined) this.props.prioridadId = datos.prioridadId;
    if (datos.tipoId !== undefined) this.props.tipoId = datos.tipoId;
    if (datos.responsableId !== undefined) this.props.responsableId = datos.responsableId;
    this.props.intervaloValor = intervaloValor;
    this.props.intervaloUnidad = intervaloUnidad;
    this.props.anticipacionValor = anticipacionValor;
    this.props.anticipacionUnidad = anticipacionUnidad;
    if (datos.activo !== undefined) this.props.activo = datos.activo;

    this.touch();
    return Result.ok(undefined);
  }
}
