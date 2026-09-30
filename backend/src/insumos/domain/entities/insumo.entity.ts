import { BaseEntity } from '../../../shared/domain/base-entity';
import { CompatibilidadModelo } from './compatibilidad-modelo';
import { InsumoCodigoAlternativoEntity } from './insumo-codigo-alternativo.entity';
import { SeguimientoInsumo } from './unidad-insumo.entity';
import { Result } from '../../../shared/domain/result';
import { SeguimientoNoModificableError } from '../errors/unidades-insumo.errors';

/**
 * InsumoProps — shape del catálogo de insumos del tenant (tóner, resmas,
 * cables, repuestos). Es la RAÍZ del agregado: los códigos alternativos
 * cuelgan de acá y no tienen ciclo de vida propio.
 */
export interface InsumoProps {
  codigo: string;
  nombre: string;
  /** FK a `familias_insumo`. La existencia y la elegibilidad las valida la capa de aplicación. */
  familiaId: string;
  /** FK a `unidades_medida`. Mismo criterio de validación que `familiaId`. */
  unidadMedidaId: string;
  /** Punto de reposición. `null` es "sin punto definido", que NO es lo mismo que cero. */
  stockMinimo: number | null;
  activo: boolean;
  codigosAlternativos: InsumoCodigoAlternativoEntity[];
  /**
   * Modelos de equipo a los que le sirve este insumo. Es lo que permite
   * responder "¿qué tóner le va a esta impresora?". La existencia y la
   * elegibilidad de cada modelo las valida la capa de aplicación.
   */
  compatibilidad: CompatibilidadModelo[];
  /**
   * Cómo se sigue el stock: por cantidad (`NINGUNO`, el de siempre) o una
   * unidad por pieza con número de serie (`SERIE`). Solo lo cambia
   * `CambiarSeguimientoInsumoUseCase`; `actualizar()` no lo toca.
   */
  seguimiento: SeguimientoInsumo;
}

/**
 * Props que acepta `InsumoEntity.create()`: `seguimiento` es opcional y por
 * defecto `NINGUNO`, así que el alta de un insumo sin serie no cambia.
 */
export type CrearInsumoProps = Omit<InsumoProps, 'seguimiento'> & {
  seguimiento?: SeguimientoInsumo;
};

/**
 * Conteos que `InsumoEntity.puedeCambiarSeguimiento()` necesita, ya leídos por
 * el caso de uso dentro de la transacción y bajo los locks de ADR-12: la
 * entidad no consulta nada.
 */
export interface ConteosParaCambioDeSeguimiento {
  /** Saldo total del libro (NUEVO + USADO). Solo se mira al pasar a `SERIE`. */
  saldoTotal: number;
  /** Unidades `EN_DEPOSITO`. Solo se mira al volver a `NINGUNO`. */
  unidadesEnDeposito: number;
  /** Unidades `INSTALADA`. Solo se mira al volver a `NINGUNO`. */
  unidadesInstaladas: number;
  /** `entera` de la unidad de medida vigente del insumo. Solo se mira al pasar a `SERIE`. */
  unidadMedidaEntera: boolean;
}

/**
 * Topes de largo, espejando `insumos.codigo VarChar(50)` y
 * `insumos.nombre VarChar(255)` (`prisma_tenant/schema.prisma`).
 *
 * Viven ACÁ y no en el DTO porque el dominio es la autoridad del límite: el
 * `VARCHAR` de Postgres es backstop, nunca al revés. El borde los importa de
 * este módulo para que el 400 amable y la precondición del dominio no puedan
 * divergir.
 */
export const INSUMO_CODIGO_MAX_LENGTH = 50;
export const INSUMO_NOMBRE_MAX_LENGTH = 255;

/**
 * Techo de NEGOCIO, no el límite físico de la columna (`DECIMAL(10,2)` aguanta
 * 99.999.999,99): un punto de reposición de un millón de unidades ya es un
 * error de carga, y atajarlo acá le da al usuario un mensaje que nombra el
 * campo en lugar de un 22003 crudo del driver. Mismo criterio que
 * `EQUIPO_VALOR_MONETARIO_MAXIMO`.
 */
export const INSUMO_STOCK_MINIMO_MAXIMO = 1_000_000;

/**
 * Piso: un punto de reposición negativo no significa nada. Espeja el
 * `CHECK (stock_minimo IS NULL OR stock_minimo >= 0)` de la tabla — el dominio
 * es la autoridad y el CHECK el backstop, así que los dos tienen que cortar en
 * el mismo lugar o el usuario se come un 500.
 */
export const INSUMO_STOCK_MINIMO_MINIMO = 0;

/** Escala de la columna: `DECIMAL(10,2)`. */
export const INSUMO_STOCK_MINIMO_DECIMALES = 2;

/**
 * Techo de códigos alternativos por insumo.
 *
 * No lo pide ninguna columna: lo pide el costo de guardar. El agregado se
 * persiste con una escritura anidada por código dentro de una sola transacción
 * implícita, así que una lista sin techo sostiene esa transacción abierta sobre
 * la base del inquilino durante tantas idas y vueltas como códigos hayan
 * entrado. Hoy el único freno es incidental —el límite de body de Express por
 * defecto—, y un tope accidental no es un tope.
 *
 * Cincuenta es holgado para el caso real: un tóner se nombra de tres o cuatro
 * maneras entre el fabricante, el genérico y el código del proveedor. Pasarse
 * de cincuenta es un error de carga, no un insumo con muchos nombres.
 */
export const INSUMO_CODIGOS_ALTERNATIVOS_MAX = 50;

/**
 * Techo de modelos de equipo compatibles por insumo.
 *
 * Mismo motivo que `INSUMO_CODIGOS_ALTERNATIVOS_MAX`, no una columna: el
 * agregado se persiste con una escritura anidada por fila dentro de una sola
 * transacción, así que una lista sin techo la sostiene abierta sobre la base
 * del inquilino tantas idas y vueltas como modelos hayan entrado.
 *
 * Doscientos porque un tóner genérico compatible con doscientos modelos de
 * impresora es plausible; pasarse de ahí es un error de carga, no un insumo
 * con mucha compatibilidad.
 */
export const INSUMO_COMPATIBILIDAD_MAX = 200;

/**
 * Normalización del código de insumo, exportada para que la capa de aplicación
 * y el BORDE apliquen exactamente la misma regla.
 *
 * `insumos.codigo` es UNIQUE case-sensitive: sin una normalización única,
 * `ton-001` y `TON-001` entran como dos insumos distintos y el índice no puede
 * frenar el duplicado.
 *
 * `toUpperCase()` puede AGRANDAR el string —`'ß'` se convierte en `'SS'`—, así
 * que quien mida contra el tope de la columna tiene que medir DESPUÉS de
 * normalizar.
 *
 * @param valor Código crudo, tal como llega del usuario.
 * @returns El código sin espacios de borde y en mayúscula.
 */
export function normalizarCodigoInsumo(valor: string): string {
  return valor.trim().toUpperCase();
}

/**
 * Normalización del nombre: SOLO recorte de espacios de borde. A diferencia
 * del código, el nombre NO se pasa a mayúscula — es la descripción que lee una
 * persona en el listado, y gritarla no la hace más buscable.
 *
 * Sin el recorte, `'   '` cumple el `@MinLength(1)` del borde —mide 3
 * caracteres— y se persiste como espacios: un insumo sin nombre visible. Por
 * eso el recorte corre ANTES de la validación de largo mínimo.
 *
 * @param valor Nombre crudo, tal como llega del usuario.
 * @returns El nombre sin espacios de borde, con sus mayúsculas y minúsculas intactas.
 */
export function normalizarNombreInsumo(valor: string): string {
  return valor.trim();
}

/**
 * Precondición de largo. Va como `throw` y no como `Result` porque un
 * primitivo fuera de rango llegando a la entidad es una violación de contrato
 * del caller, no una desviación de negocio que el usuario deba ver.
 *
 * NO se aplica en `reconstitute()`: ahí la fila ya existe en la base, y hacer
 * explotar una lectura por un valor histórico convertiría un dato viejo en una
 * caída de sistema.
 *
 * @param codigo Código a medir, ya normalizado, o `undefined` si el caller no lo toca.
 * @param nombre Nombre a medir, ya normalizado, o `undefined` si el caller no lo toca.
 * @returns Nada; lanza si algún valor excede el tope de su columna.
 */
function validarLargos(codigo?: string, nombre?: string): void {
  if (codigo !== undefined && codigo.length > INSUMO_CODIGO_MAX_LENGTH) {
    throw new Error(`InsumoEntity: codigo excede ${INSUMO_CODIGO_MAX_LENGTH} caracteres.`);
  }
  if (nombre !== undefined && nombre.length > INSUMO_NOMBRE_MAX_LENGTH) {
    throw new Error(`InsumoEntity: nombre excede ${INSUMO_NOMBRE_MAX_LENGTH} caracteres.`);
  }
}

/**
 * Precondición de rango y escala del punto de reposición. Mismo criterio
 * `throw` que `validarLargos`.
 *
 * El guard de ESCALA es el que la base no puede dar: Postgres NO falla ante un
 * `0.005` en una columna `DECIMAL(10,2)`, lo REDONDEA en silencio a `0.01`. El
 * usuario guardaría una cosa y le quedaría otra, sin ningún error de por
 * medio; el dominio es el único lugar donde eso se atrapa.
 *
 * `NaN` e `Infinity` necesitan su propio guard porque no caen en las
 * comparaciones de rango —`NaN < 0` es `false`— y llegarían a la base como un
 * literal que el driver no sabe escribir.
 *
 * @param valor Punto de reposición a medir; `null`/`undefined` no se validan.
 * @returns Nada; lanza si el valor no es finito, es negativo, pasa el techo de negocio o tiene más decimales que la columna.
 */
function validarStockMinimo(valor?: number | null): void {
  if (valor == null) return;
  if (!Number.isFinite(valor)) {
    throw new Error('InsumoEntity: stockMinimo debe ser un número finito.');
  }
  if (valor < INSUMO_STOCK_MINIMO_MINIMO) {
    throw new Error('InsumoEntity: stockMinimo no puede ser negativo.');
  }
  if (valor > INSUMO_STOCK_MINIMO_MAXIMO) {
    throw new Error(
      `InsumoEntity: stockMinimo excede el techo de negocio de ${INSUMO_STOCK_MINIMO_MAXIMO}.`,
    );
  }
  if (Number(valor.toFixed(INSUMO_STOCK_MINIMO_DECIMALES)) !== valor) {
    throw new Error(
      `InsumoEntity: stockMinimo admite como máximo ${INSUMO_STOCK_MINIMO_DECIMALES} decimales.`,
    );
  }
}

/**
 * Precondición de cantidad de códigos alternativos. Mismo criterio `throw` que
 * los otros guards: el borde ya lo rechaza con un 400 que nombra el campo, y
 * este es el backstop para el caller que no pasa por el borde —un script de
 * importación, una semilla— que si no abriría la transacción larga igual.
 *
 * NO se aplica en `reconstitute()`: una fila histórica con más códigos de los
 * que hoy se admiten se lee, no explota.
 *
 * @param codigos Lista a medir, o `undefined` si el caller no la toca.
 * @returns Nada; lanza si la lista excede el techo.
 */
function validarCantidadDeCodigos(codigos?: readonly unknown[]): void {
  if (codigos !== undefined && codigos.length > INSUMO_CODIGOS_ALTERNATIVOS_MAX) {
    throw new Error(
      `InsumoEntity: admite como máximo ${INSUMO_CODIGOS_ALTERNATIVOS_MAX} códigos alternativos.`,
    );
  }
}

/**
 * Precondición de cantidad de modelos compatibles. Mismo criterio `throw` que
 * `validarCantidadDeCodigos`, y por el mismo motivo: el borde ya lo rechaza
 * con un 400 que nombra el campo, y este es el backstop para el caller que no
 * pasa por el borde —un script de importación, una semilla— que si no abriría
 * la transacción larga igual.
 *
 * NO se aplica en `reconstitute()`: una fila histórica con más modelos de los
 * que hoy se admiten se lee, no explota.
 *
 * @param compatibilidad Lista a medir, o `undefined` si el caller no la toca.
 * @returns Nada; lanza si la lista excede el techo.
 */
function validarCantidadDeCompatibilidad(compatibilidad?: readonly unknown[]): void {
  if (compatibilidad !== undefined && compatibilidad.length > INSUMO_COMPATIBILIDAD_MAX) {
    throw new Error(
      `InsumoEntity: admite como máximo ${INSUMO_COMPATIBILIDAD_MAX} modelos de equipo compatibles.`,
    );
  }
}

/**
 * InsumoEntity — raíz del agregado del catálogo de insumos del tenant.
 *
 * Los códigos alternativos son parte del agregado y no entidades sueltas: no
 * tienen identidad fuera del insumo, se borran con él (`ON DELETE CASCADE`) y
 * no tienen endpoints propios. El alta y la edición llevan la lista COMPLETA y
 * la lista que llega REEMPLAZA a la guardada.
 *
 * No hay borrado: `insumos` es referenciada por el resto del sistema, así que
 * un insumo en uso no se elimina — se DESHABILITA (`activo = false`) y sigue
 * apareciendo en el listado para que el administrador pueda volver a
 * habilitarlo.
 */
export class InsumoEntity extends BaseEntity<InsumoProps> {
  /**
   * Crea un insumo nuevo, validando las cuatro precondiciones del agregado:
   * largo de los textos, rango y escala del punto de reposición, y la CANTIDAD
   * de cada una de sus dos listas.
   *
   * @param props Campos del insumo, con `codigo` y `nombre` YA normalizados por el caller.
   * @param id Id explícito; si se omite lo genera `BaseEntity`.
   * @returns La entidad creada.
   * @throws Error si algún largo excede el tope de su columna, si `stockMinimo`
   *   está fuera de rango o de escala, o si `codigosAlternativos` o
   *   `compatibilidad` superan su techo de cardinalidad.
   */
  static create(props: CrearInsumoProps, id?: string): InsumoEntity {
    validarLargos(props.codigo, props.nombre);
    validarStockMinimo(props.stockMinimo);
    validarCantidadDeCodigos(props.codigosAlternativos);
    validarCantidadDeCompatibilidad(props.compatibilidad);
    return new InsumoEntity(
      {
        ...props,
        seguimiento: props.seguimiento ?? 'NINGUNO',
        codigosAlternativos: [...props.codigosAlternativos],
        compatibilidad: [...props.compatibilidad],
      },
      id,
    );
  }

  /**
   * Rehidrata un insumo desde persistencia, preservando id y timestamps.
   *
   * NO valida a propósito: la fila ya existe en la base, y hacer explotar una
   * lectura por un dato histórico —un stock mínimo cargado antes de que
   * existiera el techo, por ejemplo— convertiría un valor legado en una caída
   * de sistema.
   *
   * @param props Campos del insumo leídos de la base, con sus códigos alternativos y su compatibilidad. `seguimiento` ausente se lee como `NINGUNO`; `InsumoMapper` lo manda siempre.
   * @param id Id persistido.
   * @param createdAt Alta original.
   * @param updatedAt Última modificación.
   * @param deletedAt Fecha de baja lógica, o `null` si está vigente.
   * @returns La entidad reconstituida.
   */
  static reconstitute(
    props: CrearInsumoProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): InsumoEntity {
    const entity = new InsumoEntity(
      {
        ...props,
        seguimiento: props.seguimiento ?? 'NINGUNO',
        codigosAlternativos: [...props.codigosAlternativos],
        compatibilidad: [...props.compatibilidad],
      },
      id,
    );
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  /** Código interno del insumo, normalizado en mayúscula. UNIQUE en el tenant. */
  get codigo(): string {
    return this.props.codigo;
  }

  /** Descripción legible del insumo, con sus mayúsculas y minúsculas. */
  get nombre(): string {
    return this.props.nombre;
  }

  /** FK a la familia del catálogo. */
  get familiaId(): string {
    return this.props.familiaId;
  }

  /** FK a la unidad de medida del catálogo. */
  get unidadMedidaId(): string {
    return this.props.unidadMedidaId;
  }

  /** Punto de reposición, o `null` si el insumo no tiene uno definido. */
  get stockMinimo(): number | null {
    return this.props.stockMinimo;
  }

  /** `false` si el insumo está deshabilitado. */
  get activo(): boolean {
    return this.props.activo;
  }

  /** `NINGUNO` (stock por cantidad) o `SERIE` (una unidad por pieza). */
  get seguimiento(): SeguimientoInsumo {
    return this.props.seguimiento;
  }

  /**
   * Regla del cambio de `seguimiento` (ADR-3). Es pura: recibe los conteos ya
   * leídos bajo lock y no cambia nada; el cambio lo persiste
   * `IInsumoRepository.cambiarSeguimiento`.
   *
   * - `NINGUNO → SERIE`: saldo total cero (no se convierte stock existente en
   *   unidades) y unidad de medida entera.
   * - `SERIE → NINGUNO`: cero unidades `EN_DEPOSITO` y cero `INSTALADA`. Las
   *   `ENTREGADA` y `DESCARTADA` no lo impiden.
   * - Pedir el seguimiento que ya tiene es un no-op válido.
   *
   * @param destino Seguimiento pedido.
   * @param conteos Conteos leídos por el caso de uso.
   * @returns `SeguimientoNoModificableError` con el motivo, o ok.
   */
  puedeCambiarSeguimiento(
    destino: SeguimientoInsumo,
    conteos: ConteosParaCambioDeSeguimiento,
  ): Result<void, SeguimientoNoModificableError> {
    if (destino === this.props.seguimiento) return Result.ok(undefined);
    if (destino === 'SERIE') {
      if (conteos.saldoTotal !== 0) {
        return Result.fail(
          new SeguimientoNoModificableError(
            `el saldo es ${conteos.saldoTotal} y debe ser cero: el stock existente no se convierte en unidades.`,
          ),
        );
      }
      if (!conteos.unidadMedidaEntera) {
        return Result.fail(
          new SeguimientoNoModificableError('la unidad de medida del insumo no es entera.'),
        );
      }
      return Result.ok(undefined);
    }
    if (conteos.unidadesEnDeposito !== 0 || conteos.unidadesInstaladas !== 0) {
      return Result.fail(
        new SeguimientoNoModificableError(
          `quedan ${conteos.unidadesEnDeposito} unidad(es) en el depósito y ${conteos.unidadesInstaladas} instalada(s).`,
        ),
      );
    }
    return Result.ok(undefined);
  }

  /**
   * Copia de solo lectura de los códigos alternativos del agregado. Es una
   * copia y no la lista interna porque, sin ella, quien lea puede agregar o
   * sacar elementos y la próxima escritura del agregado persistiría una
   * mutación que nadie pidió.
   */
  get codigosAlternativos(): readonly InsumoCodigoAlternativoEntity[] {
    return [...this.props.codigosAlternativos];
  }

  /**
   * Copia de solo lectura de los modelos de equipo compatibles. Es una copia
   * por el mismo motivo que `codigosAlternativos`: sin ella, quien lea puede
   * agregar o sacar elementos y la próxima escritura del agregado persistiría
   * una mutación que nadie pidió.
   */
  get compatibilidad(): readonly CompatibilidadModelo[] {
    return [...this.props.compatibilidad];
  }

  /**
   * Actualiza los campos editables (PATCH semántico — `undefined` no toca el
   * campo). La elegibilidad de familia y unidad se valida en la capa de
   * aplicación, no acá.
   *
   * **El `codigo` NO está entre los campos editables (issue #166).** Lo pone
   * el sistema al crear (`normalizarCodigoInsumo` + `NumeradorInsumo`, issue
   * #162) y queda congelado para siempre: ni el borde, ni la capa de
   * aplicación, ni esta entidad ofrecen una vía para cambiarlo después. Un
   * insumo con un código con typo se queda con el typo — decisión explícita
   * del dueño, la misma razón por la que reasignar la familia tampoco le toca
   * el prefijo (ver el test de `EditarInsumoUseCase` que lo fija).
   *
   * `stockMinimo` distingue las dos formas del vacío: `undefined` es el campo
   * ausente del PATCH y deja el valor guardado intacto, mientras que `null` es
   * la orden explícita de borrar el punto de reposición. Confundirlos sería
   * pérdida de datos: un insumo perdería su stock mínimo en cada edición del
   * nombre.
   *
   * @param datos Campos a modificar; los ausentes quedan intactos.
   * @returns Nada; lanza si algún valor viola su precondición.
   */
  actualizar(datos: {
    nombre?: string;
    familiaId?: string;
    unidadMedidaId?: string;
    stockMinimo?: number | null;
  }): void {
    validarLargos(undefined, datos.nombre);
    validarStockMinimo(datos.stockMinimo);

    if (datos.nombre !== undefined) {
      this.props.nombre = datos.nombre;
    }
    if (datos.familiaId !== undefined) {
      this.props.familiaId = datos.familiaId;
    }
    if (datos.unidadMedidaId !== undefined) {
      this.props.unidadMedidaId = datos.unidadMedidaId;
    }
    if (datos.stockMinimo !== undefined) {
      this.props.stockMinimo = datos.stockMinimo;
    }
    this.touch();
  }

  /**
   * Reemplaza la lista COMPLETA de códigos alternativos. No fusiona: el borde
   * manda siempre la lista entera, así que un código que no viene es un código
   * que el usuario sacó.
   *
   * Guarda una copia del array recibido para que el caller no conserve una
   * referencia viva a las tripas del agregado.
   *
   * @param codigos Códigos alternativos ya construidos y validados por la capa de aplicación.
   * @returns Nada; lanza si la lista excede el techo de códigos por insumo.
   */
  reemplazarCodigosAlternativos(codigos: InsumoCodigoAlternativoEntity[]): void {
    validarCantidadDeCodigos(codigos);
    this.props.codigosAlternativos = [...codigos];
    this.touch();
  }

  /**
   * Reemplaza la lista COMPLETA de modelos compatibles. No fusiona: el borde
   * manda siempre la lista entera, así que un modelo que no viene es un modelo
   * que el usuario sacó. Si fusionara, quitar una compatibilidad sería
   * imposible desde la API.
   *
   * Guarda una copia del array recibido para que el caller no conserve una
   * referencia viva a las tripas del agregado.
   *
   * @param compatibilidad Pares ya construidos y validados por la capa de aplicación.
   * @returns Nada; lanza si la lista excede el techo de modelos por insumo.
   */
  reemplazarCompatibilidad(compatibilidad: CompatibilidadModelo[]): void {
    validarCantidadDeCompatibilidad(compatibilidad);
    this.props.compatibilidad = [...compatibilidad];
    this.touch();
  }

  /**
   * Da de baja el insumo: lo DESHABILITA, no lo elimina.
   *
   * NO toca `deletedAt` a propósito. El listado filtra por `deletedAt: null`,
   * así que marcarlo haría desaparecer la fila de la única pantalla que existe
   * y dejaría `activar()` inalcanzable — nadie podría conseguir el id para
   * reactivarlo. El insumo deshabilitado sigue en el listado con
   * `activo: false`, a la vista del administrador.
   */
  desactivar(): void {
    this.props.activo = false;
    this.touch();
  }

  /** Vuelve a habilitar un insumo deshabilitado. */
  activar(): void {
    this.props.activo = true;
    this.touch();
  }
}
