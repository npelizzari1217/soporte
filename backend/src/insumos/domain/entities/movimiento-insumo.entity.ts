import { BaseEntity } from '../../../shared/domain/base-entity';
import { Result } from '../../../shared/domain/result';
import { MotivoAjusteRequeridoError } from '../errors/insumos.errors';
import { esAjuste, TipoMovimientoInsumo } from './tipo-movimiento-insumo';

/**
 * MovimientoInsumoProps — shape completo de un asiento de la bitácora de
 * existencias, tal como se persiste. Sin imports de Prisma ni NestJS.
 */
export interface MovimientoInsumoProps {
  /** FK a `insumos`. La existencia y la elegibilidad las valida la capa de aplicación. */
  insumoId: string;
  /** Por qué cambió la existencia. Catálogo CERRADO, espejado por el `CHECK` de la tabla. */
  tipo: TipoMovimientoInsumo;
  /** Siempre POSITIVA: el signo lo da el `tipo`, no el número. */
  cantidad: number;
  /** Soft ref → `master.usuarios.id`. Sin FK cross-DB: cada inquilino es una base física distinta. */
  usuarioId: string;
  /** Ya normalizado. `null` es "sin motivo", que solo los dos ajustes tienen prohibido. */
  motivo: string | null;
  /** A qué equipo fue lo que se movió. SOLO trazabilidad: no participa de la suma del stock. */
  equipoId: string | null;
  /** A qué sector fue lo que se movió. SOLO trazabilidad: hay UN solo stock, no uno por sector. */
  sectorId: string | null;
  /**
   * De DÓNDE vino lo que entró: FK a `items_compra`, o `null` si el asiento no
   * nació de una recepción de compra. A diferencia de `equipoId` y `sectorId`,
   * que dicen a dónde FUE lo que se movió, este dice de dónde SALIÓ.
   *
   * `null` es "sin origen de compra" —la entrada manual, la salida, el ajuste y
   * la recepción de un ítem histórico sin insumo—, y es la mayoría de la tabla.
   *
   * **Que el ítem exista NO se valida en el dominio ni en la aplicación**: la
   * comprobación necesitaría un puerto de `compras` dentro de `insumos`, y esa
   * arista cierra un ciclo entre los dos módulos. Quien la atrapa es
   * `movimientos_insumo_item_compra_id_fkey`.
   */
  itemCompraId: string | null;
}

/**
 * CrearMovimientoInsumoProps — props que acepta `create()`. El motivo llega
 * CRUDO —la entidad lo normaliza— y los cuatro campos opcionales admiten el
 * ausente además del nulo, porque el borde puede simplemente no mandarlos.
 * Mismo criterio que `CrearOperacionTicketProps`.
 */
export type CrearMovimientoInsumoProps = Omit<
  MovimientoInsumoProps,
  'motivo' | 'equipoId' | 'sectorId' | 'itemCompraId'
> & {
  motivo?: string | null;
  equipoId?: string | null;
  sectorId?: string | null;
  itemCompraId?: string | null;
};

/** Escala de la columna: `movimientos_insumo.cantidad DECIMAL(10,2)`. */
export const MOVIMIENTO_INSUMO_CANTIDAD_DECIMALES = 2;

/**
 * Techo de NEGOCIO de la cantidad de un movimiento, no el límite físico de la
 * columna (`DECIMAL(10,2)` aguanta 99.999.999,99).
 *
 * Es el MISMO número que `INSUMO_STOCK_MINIMO_MAXIMO` a propósito: los dos
 * describen el mismo universo físico —unidades de un insumo en el depósito de
 * este inquilino—, y si el movimiento admitiera más que el punto de
 * reposición, el stock podría alcanzar un nivel que ningún punto de reposición
 * puede llegar a describir. Un movimiento de un millón de unidades ya es un
 * error de carga, y atajarlo acá le da al usuario un mensaje que nombra el
 * campo en lugar de un 22003 crudo del driver.
 */
export const MOVIMIENTO_INSUMO_CANTIDAD_MAXIMA = 1_000_000;

/**
 * Tope de largo del motivo. La columna es `TEXT`, así que este número NO lo
 * pide la base: es de NEGOCIO.
 *
 * El motivo es la explicación de una línea que acompaña al asiento —"conteo
 * físico del 06/09: faltaban 3 unidades"—, no un hilo de discusión: para eso
 * está el ticket. Sin tope, un campo `TEXT` deja pegar un documento entero
 * dentro de una bitácora de auditoría que después se muestra fila por fila, y
 * el único freno sería incidental (el límite de body de Express por defecto);
 * un tope accidental no es un tope.
 *
 * Quinientos y no los 2000 de `COMENTARIO_TEXTO_MAX_LENGTH` porque aquel es un
 * comentario de conversación y este es un renglón de justificación. Vive ACÁ y
 * no en el DTO porque el dominio es la autoridad del límite: el borde lo
 * importa de este módulo para que el 400 amable y la precondición del dominio
 * no puedan divergir.
 */
export const MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH = 500;

/**
 * Normalización del motivo, exportada para que la capa de aplicación y el
 * BORDE apliquen exactamente la misma regla.
 *
 * SOLO recorte de espacios de borde: a diferencia de un código, el motivo es
 * prosa que lee una persona en la bitácora, y gritarla en mayúscula no la hace
 * más buscable. Mismo criterio que `normalizarNombreInsumo`.
 *
 * El colapso del vacío a `null` es lo que impide que `''` y `NULL` convivan
 * como dos formas de decir "sin motivo": la columna admite las dos, así que
 * sin esta regla el mismo movimiento se leería distinto según por qué camino
 * se cargó. Y es lo que hace que el guard del ajuste pueda exigir CONTENIDO
 * y no solo presencia — que es justo lo que un `NOT NULL` de base no sabe
 * hacer. El `undefined` —el campo directamente ausente en el payload—
 * significa lo mismo que el vacío y sale por el mismo lugar.
 *
 * Como el recorte solo puede ACHICAR el string, el largo crudo es cota del
 * normalizado; aun así el tope se mide después de normalizar, para no rechazar
 * un texto que la columna guarda sin problema.
 *
 * @param valor Motivo crudo, ausente o nulo, tal como llega del usuario.
 * @returns El motivo sin espacios de borde, o `null` si no tiene contenido.
 */
export function normalizarMotivoMovimiento(valor: string | null | undefined): string | null {
  if (valor == null) return null;
  const normalizado = valor.trim();
  return normalizado === '' ? null : normalizado;
}

/**
 * Precondición de rango y escala de la cantidad. Va como `throw` y no como
 * `Result` porque un primitivo fuera de rango llegando a la entidad es una
 * violación de contrato del caller, no una desviación de negocio que el
 * usuario deba ver: el borde ya lo rechaza con un 400 que nombra el campo, y
 * este es el backstop para el caller que no pasa por el borde —un script de
 * importación, una semilla—. Mismo criterio que `InsumoEntity.stockMinimo`.
 *
 * El guard de ESCALA es el que la base NO puede dar: Postgres no falla ante un
 * `0.005` en una columna `DECIMAL(10,2)`, lo REDONDEA en silencio a `0.01`. En
 * una bitácora de existencias ese redondeo no queda en una fila: se acumula
 * movimiento a movimiento sobre el stock, que ES la suma de todas ellas.
 *
 * `NaN` e `Infinity` necesitan su propio guard porque no caen en las
 * comparaciones de rango —`NaN > 0` es `false` y `NaN > techo` también— y
 * llegarían a la base como un literal que el driver no sabe escribir.
 *
 * NO se aplica en `reconstitute()`: ahí la fila ya existe en la base, y hacer
 * explotar una lectura por un valor histórico convertiría un dato viejo en una
 * caída de sistema.
 *
 * @param cantidad Cantidad a medir.
 * @returns Nada; lanza si no es finita, no es positiva, pasa el techo de negocio o tiene más decimales que la columna.
 */
function validarCantidad(cantidad: number): void {
  if (!Number.isFinite(cantidad)) {
    throw new Error('MovimientoInsumoEntity: cantidad debe ser un número finito.');
  }
  if (cantidad <= 0) {
    throw new Error(
      'MovimientoInsumoEntity: cantidad debe ser mayor a cero; el signo lo da el tipo del movimiento.',
    );
  }
  if (cantidad > MOVIMIENTO_INSUMO_CANTIDAD_MAXIMA) {
    throw new Error(
      `MovimientoInsumoEntity: cantidad excede el techo de negocio de ${MOVIMIENTO_INSUMO_CANTIDAD_MAXIMA}.`,
    );
  }
  if (Number(cantidad.toFixed(MOVIMIENTO_INSUMO_CANTIDAD_DECIMALES)) !== cantidad) {
    throw new Error(
      `MovimientoInsumoEntity: cantidad admite como máximo ${MOVIMIENTO_INSUMO_CANTIDAD_DECIMALES} decimales.`,
    );
  }
}

/**
 * Precondición de largo del motivo, medida sobre el valor YA normalizado.
 * Mismo criterio `throw` que `validarCantidad`, y por el mismo motivo.
 *
 * @param motivo Motivo ya normalizado, o `null` si no hay ninguno.
 * @returns Nada; lanza si el motivo excede su tope de negocio.
 */
function validarMotivo(motivo: string | null): void {
  if (motivo !== null && motivo.length > MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH) {
    throw new Error(
      `MovimientoInsumoEntity: motivo excede ${MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH} caracteres.`,
    );
  }
}

/**
 * MovimientoInsumoEntity — un asiento de la bitácora de existencias de un
 * insumo: quién movió cuánto, de qué tipo y por qué.
 *
 * APPEND-ONLY. Un movimiento no se edita y no se borra: se corrige con otro
 * movimiento, que deja rastro de la corrección. Por eso la entidad no tiene
 * mutadores de negocio y `movimientos_insumo` no tiene `updated_at` ni
 * `deleted_at`.
 *
 * **Extiende `BaseEntity` aunque la tabla no tenga esas dos columnas**, con el
 * precedente exacto de `ComentarioReparacionEntity` (`reparaciones/`), que es
 * append-only sobre una tabla igual de recortada. Lo que se gana es el id
 * UUIDv7 generado antes del INSERT —monótono en el tiempo, así que la bitácora
 * tiene un desempate determinístico cuando dos asientos comparten
 * `created_at`— y la simetría con el resto de las entidades del módulo. Lo que
 * SOBRA —`softDelete()`, `touch()`, `updatedAt`, `deletedAt`— se neutraliza en
 * dos lugares: acá no hay ningún método que los llame, y la FIRMA de
 * `IMovimientoInsumoRepository` no expone ningún `update` ni `delete`, así que
 * un `softDelete()` no tiene por dónde llegar a la base. `reconstitute()`
 * espeja `updatedAt` de `createdAt` para no inventar un dato que la tabla no
 * guarda.
 *
 * Ref design: openspec/changes/insumos-entrega-2/design.md, decisiones 3 y 4.
 */
export class MovimientoInsumoEntity extends BaseEntity<MovimientoInsumoProps> {
  private constructor(props: MovimientoInsumoProps, id?: string) {
    super(props, id);
  }

  /**
   * Crea un movimiento nuevo, normalizando el motivo y validando las
   * precondiciones del asiento.
   *
   * Devuelve `Result` por UNA sola regla —el ajuste sin motivo—, que es una
   * desviación de negocio que el usuario tiene que ver: el borde no puede
   * rechazarla con un decorador simple, porque la obligatoriedad depende del
   * `tipo` que venga en el mismo body. El resto de los guards van como `throw`
   * porque son violaciones de contrato del caller que el borde ya rechaza con
   * un 400 (ver `validarCantidad`). Precedentes: `ArchivoEntity.create` para
   * el `Result`, `InsumoEntity.create` para los `throw`.
   *
   * La regla vale para los DOS ajustes, y la pregunta se hace con `esAjuste()`
   * en vez de comparar contra los literales: son la misma operación de negocio
   * con distinto signo, y enumerarlos a mano acá sería el lugar exacto donde
   * el catálogo y sus reglas se desincronizan cuando entre una dirección más.
   *
   * @param props Campos del movimiento; `motivo` llega crudo y `equipoId`, `sectorId` e `itemCompraId` pueden faltar.
   * @param id Id explícito; si se omite lo genera `BaseEntity` (UUIDv7).
   * @returns El movimiento creado, o `MotivoAjusteRequeridoError` si un ajuste no trae un motivo con contenido.
   * @throws Error si la cantidad no es finita, no es positiva, pasa el techo de
   *   negocio o tiene más decimales que la columna, o si el motivo ya
   *   normalizado excede su tope de largo.
   */
  static create(
    props: CrearMovimientoInsumoProps,
    id?: string,
  ): Result<MovimientoInsumoEntity, MotivoAjusteRequeridoError> {
    validarCantidad(props.cantidad);

    const motivo = normalizarMotivoMovimiento(props.motivo);
    validarMotivo(motivo);

    if (esAjuste(props.tipo) && motivo === null) {
      return Result.fail(new MotivoAjusteRequeridoError(props.insumoId, props.tipo));
    }

    return Result.ok(
      new MovimientoInsumoEntity(
        {
          insumoId: props.insumoId,
          tipo: props.tipo,
          cantidad: props.cantidad,
          usuarioId: props.usuarioId,
          motivo,
          equipoId: props.equipoId ?? null,
          sectorId: props.sectorId ?? null,
          itemCompraId: props.itemCompraId ?? null,
        },
        id,
      ),
    );
  }

  /**
   * Rehidrata un movimiento desde persistencia.
   *
   * NO valida a propósito: la fila ya existe en la base, y hacer explotar una
   * LECTURA por un dato histórico —una cantidad cargada antes de que existiera
   * el techo, o un ajuste anterior a la regla del motivo— convertiría un
   * valor legado en una caída de sistema.
   *
   * Sin `updatedAt` ni `deletedAt` en la firma, a diferencia del resto de las
   * entidades del módulo: la tabla es append-only y no tiene esas columnas.
   * `updatedAt` se espeja de `createdAt` para no inventar un dato que la base
   * no guarda —si arrancara en `new Date()`, cada lectura mostraría un
   * movimiento "modificado hoy" que nadie tocó nunca—. Mismo criterio que
   * `ComentarioReparacionEntity.reconstitute`.
   *
   * @param props Campos del movimiento leídos de la base, con el motivo ya normalizado en su momento.
   * @param id Id persistido.
   * @param createdAt Momento en que se asentó el movimiento.
   * @returns La entidad reconstituida.
   */
  static reconstitute(
    props: MovimientoInsumoProps,
    id: string,
    createdAt: Date,
  ): MovimientoInsumoEntity {
    const entity = new MovimientoInsumoEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: createdAt });
    entity._deletedAt = null;
    return entity;
  }

  // ─── Getters (solo lectura — el asiento es inmutable) ─────────────────────

  /** FK al insumo cuya existencia mueve este asiento. */
  get insumoId(): string {
    return this.props.insumoId;
  }

  /** Por qué cambió la existencia: `ENTRADA`, `SALIDA`, `AJUSTE_POSITIVO` o `AJUSTE_NEGATIVO`. */
  get tipo(): TipoMovimientoInsumo {
    return this.props.tipo;
  }

  /** Cantidad movida, siempre positiva. La dirección la deriva quien suma la bitácora. */
  get cantidad(): number {
    return this.props.cantidad;
  }

  /** Quién registró el movimiento (soft ref a `master.usuarios.id`). */
  get usuarioId(): string {
    return this.props.usuarioId;
  }

  /** Explicación del asiento, normalizada, o `null` si no tiene. Obligatoria solo en los ajustes. */
  get motivo(): string | null {
    return this.props.motivo;
  }

  /** Equipo al que fue lo que se movió, o `null`. SOLO trazabilidad: no participa de la suma. */
  get equipoId(): string | null {
    return this.props.equipoId;
  }

  /** Sector al que fue lo que se movió, o `null`. SOLO trazabilidad: hay UN solo stock. */
  get sectorId(): string | null {
    return this.props.sectorId;
  }

  /**
   * Ítem de compra cuya recepción originó el asiento, o `null` si no nació de
   * una compra. Es el ORIGEN, no el destino: responde "¿de qué compra vino
   * esto que entró?".
   */
  get itemCompraId(): string | null {
    return this.props.itemCompraId;
  }
}
