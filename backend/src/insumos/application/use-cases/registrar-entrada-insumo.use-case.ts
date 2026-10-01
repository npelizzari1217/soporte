import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { MovimientoInsumoEntity } from '../../domain/entities/movimiento-insumo.entity';
import {
  CONDICION_STOCK_POR_DEFECTO,
  CondicionStock,
} from '../../domain/entities/tipo-movimiento-insumo';
import { SeguimientoInsumo, normalizarSerial } from '../../domain/entities/unidad-insumo.entity';
import { FalloOperacionDeUnidad } from '../../domain/errors/fallo-operacion-de-unidad';
import { InsumoNoEncontradoError } from '../../domain/errors/insumos.errors';
import {
  SerialRequeridoError,
  UnidadNoAdmitidaError,
} from '../../domain/errors/unidades-insumo.errors';
import { IFamiliaInsumoRepository } from '../../domain/ports/i-familia-insumo.repository';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';
import { IMovimientoInsumoRepository } from '../../domain/ports/i-movimiento-insumo.repository';
import { CausaPieza, clasificarPiezaDevuelta } from '../services/clasificar-pieza-devuelta';
import { ingresarPorSerie } from '../services/ingresar-por-serie';
import {
  ItemEnEquipo,
  LegadoEnEquipo,
  OperacionesUnidadInsumo,
} from '../services/operaciones-unidad-insumo.service';
import {
  validarCondicionAdmitida,
  validarInsumoElegible,
} from '../services/validar-insumo.service';

/**
 * DTO de entrada de `RegistrarEntradaInsumoUseCase`.
 *
 * El `usuarioId` NO se deriva acá: lo estampa el borde a partir del usuario
 * autenticado (`sub` del JWT), igual que `CrearCompraDto.solicitanteId`. La
 * capa de aplicación lo copia tal cual a la bitácora — si lo inventara, la
 * respuesta a "quién lo movió" sería la del proceso, no la de la persona.
 *
 * Los cuatro campos opcionales admiten el ausente además del nulo, porque el
 * borde puede simplemente no mandarlos; la entidad los normaliza.
 */
export interface RegistrarEntradaInsumoDto {
  insumoId: string;
  /** Siempre positiva: el signo lo da el tipo del movimiento, no el número. */
  cantidad: number;
  /** Quién registra el movimiento. Lo pone el borde desde el usuario autenticado. */
  usuarioId: string;
  /**
   * Condición del stock que suma la entrada. Ausente equivale a `NUEVO`; `USADO`
   * solo lo admiten los insumos de una familia de repuestos.
   */
  condicion?: CondicionStock;
  /** Explicación opcional del asiento. Solo el AJUSTE la exige. */
  motivo?: string | null;
  /** Trazabilidad, no stock: no participa de la suma. */
  equipoId?: string | null;
  /** Trazabilidad, no stock: hay UN solo stock, no uno por sector. */
  sectorId?: string | null;
  /**
   * Ítem de compra cuya recepción originó la entrada, o ausente/`null` si la
   * carga es manual.
   *
   * **Hace DOS cosas y esa es la decisión, no un efecto colateral**: se
   * persiste como trazabilidad, y su sola presencia es lo que exime al insumo
   * del guard de habilitado (ver la clase). Que un mismo dato haga las dos es
   * lo que impide que la trazabilidad y el permiso puedan discrepar.
   *
   * **El borde HTTP no lo declara ni lo debe declarar.** Lo llena únicamente el
   * enganche de la recepción de compra, del lado del servidor, con el id del
   * ítem que está recibiendo. Mismo criterio que `usuarioId`, que sale del JWT
   * y nunca del body.
   */
  itemCompraId?: string | null;
  /**
   * Números de serie de las piezas que entran. Solo los admite un insumo
   * `SERIE` (con `NINGUNO`, `UnidadNoAdmitidaError`); ahí son obligatorios y
   * tantos como la cantidad (`SerialesNoCoincidenError`).
   */
  seriales?: readonly string[] | null;
  /**
   * Rellena con unidades de serie pendiente hasta la cantidad (ADR-6).
   *
   * **Opción interna, no un campo del DTO HTTP**: la pasa únicamente la
   * recepción de compra, junto a `itemCompraId` y por el mismo criterio de
   * origen. El controller enumera lo que pasa al caso de uso, así que un body
   * no puede abrirla.
   */
  completarConPendientes?: boolean;
}

/**
 * Una pieza activa de un equipo que se da de baja con destino `STOCK_USADO`.
 * Es lo que el llamador ya leyó del componente; el insumo, la familia y el
 * seguimiento los lee este caso de uso.
 */
export interface PiezaDeEquipoADevolver {
  componenteId: string;
  /** `null` si el componente no tiene insumo: no toca stock. */
  insumoId: string | null;
  /** Unidad que lleva el componente; `null` si es `NINGUNO` o un legado de serial de texto. */
  unidadId: string | null;
  /** Serial de texto del componente legado. */
  numeroSerie: string | null;
}

/** Datos de la baja compartidos por todas las piezas de `registrarDevolucionesDeEquipo`. */
export interface DevolucionesDeEquipoDto {
  equipoId: string;
  usuarioId: string;
  /** Leyenda de la baja: la misma para todas las piezas. */
  motivo: string;
  piezas: readonly PiezaDeEquipoADevolver[];
}

/** Hechos de un insumo que `clasificarPiezaDevuelta` necesita. */
interface HechosDelInsumo {
  vigente: boolean;
  familiaEsRepuesto: boolean;
  seguimiento: SeguimientoInsumo;
}

/**
 * RegistrarEntradaInsumoUseCase — asienta una ENTRADA en la bitácora de
 * existencias de un insumo: entró tal cantidad al depósito, la registró tal
 * persona.
 *
 * **Siempre abre transacción (re-entrante), pero NO toma el advisory lock del
 * stock en la rama `NINGUNO`, a propósito.** El lock existe para una sola
 * invariante —que el stock no quede negativo— y esa invariante solo la pueden
 * violar los movimientos que RESTAN. Una entrada `NINGUNO` suma: no hay decisión
 * que tomar bajo la sección crítica, y tomarlo igual pagaría el `GROUP BY` de
 * toda la bitácora y haría esperar a las salidas detrás de cada recepción.
 *
 * La transacción existe por otra razón (ADR-5 de
 * sdd/repuestos-numero-de-serie): su PRIMER lock es L1
 * (`leerSeguimientoParaMovimiento`, `FOR SHARE` sobre la fila del insumo) y el
 * `seguimiento` de esa lectura decide la rama. Los `FOR SHARE` no se bloquean
 * entre sí, así que las entradas `NINGUNO` siguen sin serializarse entre ellas;
 * solo el cambio de seguimiento (L1 `FOR NO KEY UPDATE`) espera a todas.
 *
 * - `NINGUNO`: como siempre, un único `INSERT` del asiento. Un `seriales` se
 *   rechaza con `UnidadNoAdmitidaError`. No toma L2.
 * - `SERIE`: `ingresarPorSerie` (toma L2 y L3 en el orden de ADR-12) crea una
 *   unidad por pieza con su movimiento. La cantidad debe ser entera y los
 *   seriales tantos como ella, salvo `completarConPendientes`.
 *
 * Que la entrada reciba `Pick` sin `lockAndSumByTipo` sigue siendo lo que
 * impide que este caso de uso tome el lock del stock por descuido: el método
 * no está en su tipo. El L2 de la rama `SERIE` lo toma `OperacionesUnidadInsumo`.
 *
 * Dos reglas de elegibilidad, las dos delegadas en `validarInsumoElegible`:
 * el insumo tiene que existir y estar VIGENTE, y además HABILITADO cuando la
 * carga es manual. La segunda se pide con `exigirHabilitado` porque vale SOLO
 * para la entrada: la salida y el ajuste operan sobre lo que ya está en el
 * depósito (ver `InsumoDeshabilitadoError`). Este caso de uso es el ÚNICO de
 * los tres que pasa esa opción, y la sección siguiente explica cuándo la pide
 * en `false`.
 *
 * ## El guard de habilitado NO corre cuando la entrada viene de una compra
 *
 * Decisión 1 del diseño de la Entrega 3. El guard nació para la carga MANUAL, y
 * lo que dice es "no se compra más de esto". Una recepción no es una decisión
 * nueva de compra: se aprobó antes de la baja y la mercadería ya está en el
 * depósito. Rechazarla dejaría la recepción asentada en compras sin su
 * movimiento de stock, que es exactamente la pérdida silenciosa que el diseño
 * descartó.
 *
 * **Lo pide el ORIGEN, no un booleano.** El permiso se deriva de
 * `dto.itemCompraId`, y NO hay un segundo campo del estilo `exigirHabilitado`
 * en el DTO. Las dos razones:
 *
 * 1. Un booleano de "saltear la validación" es una llave sin dueño: cualquier
 *    caller la pide, no queda dicho por qué, y el día que aparezca un salteo
 *    indebido no hay forma de distinguirlo del legítimo. El `itemCompraId`, en
 *    cambio, es un hecho —hay un ítem de compra que originó esto— que la FK
 *    `movimientos_insumo_item_compra_id_fkey` verifica contra la base.
 * 2. Con dos campos, dos de sus cuatro combinaciones no significan nada: origen
 *    sin salteo rechazaría la recepción que la decisión 1 manda aceptar, y
 *    salteo sin origen es el permiso suelto del punto anterior. Un campo cuyos
 *    únicos valores útiles son los que el otro ya determina no es un segundo
 *    campo: es el mismo, escrito dos veces.
 *
 * El origen levanta UN solo guard. El insumo inexistente o con baja lógica
 * sigue rechazando venga de donde venga: asentar contra una fila que el
 * catálogo no muestra dejaría stock imputado a la nada, y la recepción no
 * cambia eso.
 *
 * **Que el `itemCompraId` exista NO se valida acá**, a propósito: la
 * comprobación necesitaría un puerto de `compras` dentro de `insumos`, y esa
 * arista cierra un ciclo —`compras` ya va a depender de `insumos`—. La FK lo
 * atrapa. La contracara es que el guard no se puede abrir desde el borde: el
 * DTO HTTP de la entrada manual no declara el campo y el controller enumera lo
 * que pasa al caso de uso en vez de esparcir el body, así que un
 * `itemCompraId` inventado no tiene por dónde llegar.
 */
export class RegistrarEntradaInsumoUseCase {
  constructor(
    private readonly insumoRepo: Pick<
      IInsumoRepository,
      'findById' | 'leerSeguimientoParaMovimiento'
    >,
    private readonly movimientoRepo: Pick<IMovimientoInsumoRepository, 'insert'>,
    private readonly familiaRepo: Pick<IFamiliaInsumoRepository, 'findById'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
    private readonly operaciones: Pick<
      OperacionesUnidadInsumo,
      'ingresar' | 'devolverAlDeposito' | 'devolverDesdeEquipo' | 'serialesExistentes'
    >,
  ) {}

  /**
   * @param dto Datos de la entrada, con el `usuarioId` ya resuelto por el borde
   *   y el `itemCompraId` presente solo si la entrada nace de una recepción.
   * @returns El movimiento asentado (con `SERIE` y varias piezas, el primero:
   *   los demás quedan en la bitácora); `InsumoNoEncontradoError` si el insumo
   *   no existe o está dado de baja; `InsumoDeshabilitadoError` si está
   *   deshabilitado y la entrada es manual; `UnidadNoAdmitidaError` si trae
   *   `seriales` y el insumo no es `SERIE`; o `CantidadNoEnteraError` /
   *   `SerialesNoCoincidenError` / `SerialDuplicadoError` en la rama `SERIE`.
   * @throws Error si la cantidad no es finita, no es positiva, pasa el techo de
   *   negocio o tiene más decimales que la columna, o si el motivo excede su
   *   tope de largo: son violaciones de contrato del caller que el borde
   *   rechaza con un 400 que nombra el campo, no desviaciones de negocio.
   */
  async execute(
    dto: RegistrarEntradaInsumoDto,
  ): Promise<Result<MovimientoInsumoEntity, DomainError>> {
    const resultado = await this.executeTodos(dto);
    return resultado.isFail()
      ? Result.fail(resultado.getError())
      : Result.ok(resultado.getValue()[0]);
  }

  /**
   * Igual que `execute()` pero devuelve TODOS los movimientos asentados: uno en
   * `NINGUNO`, uno por unidad (en el orden de las piezas) en `SERIE`. Es lo que
   * publica el borde HTTP.
   *
   * @param dto Mismos datos que `execute()`.
   * @returns Los movimientos asentados, o el error de dominio de `execute()`.
   */
  async executeTodos(
    dto: RegistrarEntradaInsumoDto,
  ): Promise<Result<MovimientoInsumoEntity[], DomainError>> {
    try {
      return await this.txRunner.run(() => this.ejecutarBajoL1(dto));
    } catch (error) {
      // El único fallo posterior a escribir es la unicidad del serial (P2002):
      // se desenvuelve AFUERA del `run()` para que la transacción ya haya
      // revertido (o, si el llamador tiene la suya, la aborte él).
      if (error instanceof FalloOperacionDeUnidad) return Result.fail(error.errorDeDominio);
      throw error;
    }
  }

  /**
   * Cuerpo de la entrada, ya dentro de la transacción. Devuelve TODOS los
   * movimientos asentados: uno en `NINGUNO`, uno por unidad en `SERIE`.
   */
  private async ejecutarBajoL1(
    dto: RegistrarEntradaInsumoDto,
  ): Promise<Result<MovimientoInsumoEntity[], DomainError>> {
    // L1 primero, antes que cualquier otro lock: el `seguimiento` de esta
    // lectura es el que decide la rama.
    const seguimiento = await this.insumoRepo.leerSeguimientoParaMovimiento(dto.insumoId);
    if (seguimiento === null) {
      return Result.fail(new InsumoNoEncontradoError(dto.insumoId));
    }

    // `== null` cubre el ausente y el nulo con una sola comparación: las dos
    // formas significan "carga manual". Preguntar por la PRESENCIA de la clave
    // —`'itemCompraId' in dto`— le abriría el salteo a quien mandara el campo
    // en `null`, que es justo la entrada manual escrita de la forma larga.
    const vieneDeUnaRecepcion = dto.itemCompraId != null;

    // El guard de habilitado vale SOLO para la carga manual (ver la clase) y
    // nunca se levanta por otra vía: la exención de la devolución (G2) vive en
    // `registrarDevolucionDeComponente`, no acá.
    const elegible = await validarInsumoElegible(this.insumoRepo, dto.insumoId, {
      exigirHabilitado: !vieneDeUnaRecepcion,
    });

    if (elegible.isFail()) {
      return Result.fail(elegible.getError());
    }

    const insumo = elegible.getValue();

    const condicion = dto.condicion ?? CONDICION_STOCK_POR_DEFECTO;
    const admitida = await validarCondicionAdmitida(this.familiaRepo, insumo, condicion);

    if (admitida.isFail()) {
      return Result.fail(admitida.getError());
    }

    if (seguimiento === 'NINGUNO') {
      if (dto.seriales != null) {
        return Result.fail(new UnidadNoAdmitidaError(insumo.id));
      }
      const asentado = await this.asentar(insumo.id, condicion, dto);
      return asentado.isFail()
        ? Result.fail(asentado.getError())
        : Result.ok([asentado.getValue()]);
    }

    return ingresarPorSerie(this.operaciones, {
      insumoId: insumo.id,
      cantidad: dto.cantidad,
      seriales: dto.seriales,
      completarConPendientes: dto.completarConPendientes,
      condicion,
      tipo: 'ENTRADA',
      usuarioId: dto.usuarioId,
      motivo: dto.motivo,
      itemCompraId: dto.itemCompraId,
      equipoId: dto.equipoId,
    });
  }

  /**
   * Asienta la devolución al depósito de una pieza retirada de un equipo: una
   * ENTRADA de UNA unidad en condición USADO, vinculada al equipo de origen.
   *
   * Es un método con nombre de ORIGEN, y no un booleano en el DTO, por el mismo
   * criterio que `itemCompraId`: una llave de "saltear validación" no tiene
   * dueño; un método que solo llama el retiro de componentes, sí. No se expone
   * por HTTP.
   *
   * Sus guards difieren de `execute()` en lo justo: la pieza existe físicamente
   * aunque el catálogo se haya deshabilitado después, así que se ADMITE el
   * insumo deshabilitado y la familia dada de baja o deshabilitada. Se sigue
   * rechazando el insumo inexistente o con baja lógica (no se imputa stock a
   * una fila que el catálogo no muestra) y la familia que no es de repuestos
   * (el alcance de USADO no cambia).
   *
   * @param dto Insumo del componente, equipo de origen, usuario que retira y
   *   motivo ya normalizado; `unidadId`/`componenteId` si el componente lleva
   *   unidad y `numeroSerie` si es un componente legado de un insumo `SERIE`.
   * @returns El movimiento asentado, o `InsumoNoEncontradoError` /
   *   `CondicionUsadoNoAdmitidaError` según el guard que falle, o
   *   `SerialRequeridoError` si el componente es legado de un insumo `SERIE`
   *   y no trae serial.
   */
  async registrarDevolucionDeComponente(dto: {
    insumoId: string;
    equipoId: string;
    usuarioId: string;
    motivo?: string | null;
    /** Unidad que lleva el componente; si viene, la pieza vuelve con su serial. */
    unidadId?: string | null;
    /** Componente que lleva la unidad. Obligatorio con `unidadId` (queda en el evento). */
    componenteId?: string | null;
    /** Serial de un componente LEGADO cuyo insumo hoy es `SERIE`. */
    numeroSerie?: string | null;
  }): Promise<Result<MovimientoInsumoEntity, DomainError>> {
    try {
      return await this.txRunner.run(() => this.devolverBajoL1(dto));
    } catch (error) {
      if (error instanceof FalloOperacionDeUnidad) return Result.fail(error.errorDeDominio);
      throw error;
    }
  }

  /**
   * Cuerpo de la devolución, dentro de la transacción del retiro. Ramas:
   * componente con unidad → `devolverAlDeposito`; componente legado de un
   * insumo hoy `SERIE` → `numeroSerie` obligatorio e `ingresar` USADO (ADR-7,
   * sin serie pendiente: `SerialRequeridoError` sin cambiar nada); insumo
   * `NINGUNO` → como siempre.
   *
   * **La exención de insumo deshabilitado (G2) es de ESTE camino y de ningún
   * otro**: acá nunca se pide `exigirHabilitado`.
   */
  private async devolverBajoL1(dto: {
    insumoId: string;
    equipoId: string;
    usuarioId: string;
    motivo?: string | null;
    unidadId?: string | null;
    componenteId?: string | null;
    numeroSerie?: string | null;
  }): Promise<Result<MovimientoInsumoEntity, DomainError>> {
    // L1 primero; con `unidadId` el servicio lo vuelve a leer (FOR SHARE es
    // re-entrante) antes de tomar L2 y L3.
    const seguimiento = await this.insumoRepo.leerSeguimientoParaMovimiento(dto.insumoId);
    if (seguimiento === null) {
      return Result.fail(new InsumoNoEncontradoError(dto.insumoId));
    }

    const elegible = await validarInsumoElegible(this.insumoRepo, dto.insumoId);

    if (elegible.isFail()) {
      return Result.fail(elegible.getError());
    }

    const insumo = elegible.getValue();

    const admitida = await validarCondicionAdmitida(this.familiaRepo, insumo, 'USADO', {
      admitirFamiliaNoVigente: true,
    });

    if (admitida.isFail()) {
      return Result.fail(admitida.getError());
    }

    if (dto.unidadId != null) {
      if (dto.componenteId == null) {
        throw new Error('La devolución de un componente con unidad exige su componenteId.');
      }
      const devueltas = await this.operaciones.devolverAlDeposito(
        [
          {
            unidadId: dto.unidadId,
            equipoId: dto.equipoId,
            componenteId: dto.componenteId,
            insumoId: dto.insumoId,
          },
        ],
        { usuarioId: dto.usuarioId, motivo: dto.motivo },
      );
      return devueltas.isFail()
        ? Result.fail(devueltas.getError())
        : Result.ok(devueltas.getValue()[0].movimiento);
    }

    if (seguimiento === 'SERIE') {
      // Componente legado: no tiene unidad, así que el serial lo trae el retiro.
      // Una pendiente no se admite (decisión del dueño): sin serial, nada cambia.
      const serial = dto.numeroSerie?.trim() ?? '';
      if (serial === '') {
        return Result.fail(
          new SerialRequeridoError(
            `el insumo "${insumo.id}" se sigue por número de serie y el componente no tiene unidad: hace falta el serial para devolverlo al depósito.`,
          ),
        );
      }
      const ingresada = await ingresarPorSerie(this.operaciones, {
        insumoId: insumo.id,
        cantidad: 1,
        seriales: [serial],
        condicion: 'USADO',
        tipo: 'ENTRADA',
        usuarioId: dto.usuarioId,
        motivo: dto.motivo,
        equipoId: dto.equipoId,
      });
      return ingresada.isFail()
        ? Result.fail(ingresada.getError())
        : Result.ok(ingresada.getValue()[0]);
    }

    return this.asentar(insumo.id, 'USADO', {
      insumoId: insumo.id,
      cantidad: 1,
      usuarioId: dto.usuarioId,
      motivo: dto.motivo,
      equipoId: dto.equipoId,
    });
  }

  /**
   * Devuelve al depósito TODAS las piezas de un equipo dado de baja con destino
   * `STOCK_USADO` (ADR-3), dentro de la transacción del llamador (la primera
   * lectura con lock lanza fuera de una).
   *
   * Orden de locks: L1 de todos los insumos distintos en orden de id (también
   * los `NINGUNO`); después `devolverDesdeEquipo` toma L2 y L3 de los insumos con
   * unidad o legado. Las ENTRADAs de los `NINGUNO` se asientan al final: no
   * toman L2 ni ningún lock nuevo, su L1 ya está tomado.
   *
   * Las causas de TODAS las piezas se juntan sin cortar (`INSUMO_BORRADO`,
   * `FAMILIA_NO_REPUESTO`, `SERIAL_*`) y viajan como `causasPrevias`: si hay
   * alguna, `devolverDesdeEquipo` las une con `SERIAL_DUPLICADO` y rechaza todo
   * antes de escribir.
   *
   * No envuelve nada en `run()`: un P2002 residual sale como
   * `FalloOperacionDeUnidad` con `DevolucionConPiezasProblematicasError` y el
   * llamador lo desenvuelve fuera de su transacción.
   *
   * @param dto Equipo, usuario, leyenda compartida y piezas activas.
   * @returns `Map<componenteId, movimientoId>` de las piezas con insumo; o
   *   `DevolucionConPiezasProblematicasError` con todas las causas, sin haber escrito nada.
   * @throws Error si no hay transacción activa.
   */
  async registrarDevolucionesDeEquipo(
    dto: DevolucionesDeEquipoDto,
  ): Promise<Result<Map<string, string>, DomainError>> {
    const insumoIds = [
      ...new Set(dto.piezas.flatMap((p) => (p.insumoId === null ? [] : [p.insumoId]))),
    ].sort();

    // L1 de todos, en orden de id y antes de cualquier L2 (ADR-3 paso 1).
    const hechos = new Map<string, HechosDelInsumo>();
    for (const insumoId of insumoIds) {
      const seguimiento = await this.insumoRepo.leerSeguimientoParaMovimiento(insumoId);
      hechos.set(insumoId, await this.hechosDelInsumo(insumoId, seguimiento));
    }

    const causas = this.clasificarPiezas(dto.piezas, hechos);
    const conCausa = new Set(causas.map((c) => c.componenteId));
    const contexto = { usuarioId: dto.usuarioId, motivo: dto.motivo };

    const conUnidad: ItemEnEquipo[] = [];
    const legados: LegadoEnEquipo[] = [];
    const ningunos: string[] = [];
    for (const pieza of dto.piezas) {
      if (pieza.insumoId === null || conCausa.has(pieza.componenteId)) continue;
      if (pieza.unidadId !== null) {
        conUnidad.push({
          unidadId: pieza.unidadId,
          equipoId: dto.equipoId,
          componenteId: pieza.componenteId,
          insumoId: pieza.insumoId,
        });
      } else if (this.hechosDe(hechos, pieza.insumoId).seguimiento === 'SERIE') {
        legados.push({
          componenteId: pieza.componenteId,
          insumoId: pieza.insumoId,
          equipoId: dto.equipoId,
          numeroSerie: pieza.numeroSerie?.trim() ?? '',
        });
      } else {
        ningunos.push(pieza.componenteId);
      }
    }

    const devueltas = await this.operaciones.devolverDesdeEquipo(
      conUnidad,
      legados,
      contexto,
      causas,
    );
    if (devueltas.isFail()) return Result.fail(devueltas.getError());

    const movimientos = new Map<string, string>();
    for (const [componenteId, devuelta] of devueltas.getValue()) {
      movimientos.set(componenteId, devuelta.movimiento.id);
    }

    for (const pieza of dto.piezas) {
      if (!ningunos.includes(pieza.componenteId)) continue;
      const asentado = await this.asentar(pieza.insumoId as string, 'USADO', {
        insumoId: pieza.insumoId as string,
        cantidad: 1,
        usuarioId: dto.usuarioId,
        motivo: dto.motivo,
        equipoId: dto.equipoId,
      });
      // Inalcanzable hoy (ver `asentar`); lanzar y no devolver `fail`, porque ya
      // hubo escrituras en la transacción del llamador.
      if (asentado.isFail()) throw new Error(asentado.getError().message);
      movimientos.set(pieza.componenteId, asentado.getValue().id);
    }

    return Result.ok(movimientos);
  }

  /**
   * Resumen previo a la baja con `STOCK_USADO`: las causas de TODAS las piezas
   * que no pueden volver al depósito, sin transacción y sin locks. Es el camino
   * rápido; la baja vuelve a validar bajo L1 y L2 con la misma clasificación.
   *
   * Lee el insumo y la familia con `findById` (el `seguimiento` sale de la
   * entidad: `leerSeguimientoParaMovimiento` exige transacción) y consulta
   * `serialesExistentes` sin lock para `SERIAL_DUPLICADO`.
   *
   * @param piezas Piezas activas del equipo.
   * @returns Las causas de todas las piezas; vacío si todas pueden volver.
   */
  async diagnosticarDevolucionesDeEquipo(
    piezas: readonly PiezaDeEquipoADevolver[],
  ): Promise<CausaPieza[]> {
    const insumoIds = [
      ...new Set(piezas.flatMap((p) => (p.insumoId === null ? [] : [p.insumoId]))),
    ].sort();
    const hechos = new Map<string, HechosDelInsumo>();
    for (const insumoId of insumoIds) {
      hechos.set(insumoId, await this.hechosDelInsumo(insumoId, undefined));
    }

    const causas = this.clasificarPiezas(piezas, hechos);
    const conCausa = new Set(causas.map((c) => c.componenteId));

    const legadosPorInsumo = new Map<string, PiezaDeEquipoADevolver[]>();
    for (const pieza of piezas) {
      if (pieza.insumoId === null || pieza.unidadId !== null || conCausa.has(pieza.componenteId)) {
        continue;
      }
      if (this.hechosDe(hechos, pieza.insumoId).seguimiento !== 'SERIE') continue;
      legadosPorInsumo.set(pieza.insumoId, [
        ...(legadosPorInsumo.get(pieza.insumoId) ?? []),
        pieza,
      ]);
    }

    const duplicadas: CausaPieza[] = [];
    for (const insumoId of [...legadosPorInsumo.keys()].sort()) {
      const delInsumo = legadosPorInsumo.get(insumoId) as PiezaDeEquipoADevolver[];
      const normalizados = delInsumo.map((p) => normalizarSerial(p.numeroSerie ?? ''));
      const existentes = await this.operaciones.serialesExistentes(insumoId, normalizados);
      delInsumo.forEach((pieza, i) => {
        if (existentes.has(normalizados[i])) {
          duplicadas.push({
            componenteId: pieza.componenteId,
            insumoId,
            causa: 'SERIAL_DUPLICADO',
          });
        }
      });
    }

    return [...causas, ...duplicadas];
  }

  /**
   * Hechos de un insumo con las mismas reglas que la devolución de UN
   * componente: elegible sin exigir habilitado, y USADO admitido aunque la
   * familia esté dada de baja o deshabilitada.
   *
   * @param seguimientoLeido Seguimiento leído bajo L1 (`null`: el insumo no
   *   existe); `undefined` toma el de la entidad (camino sin locks).
   */
  private async hechosDelInsumo(
    insumoId: string,
    seguimientoLeido: SeguimientoInsumo | null | undefined,
  ): Promise<HechosDelInsumo> {
    const noVigente = { vigente: false, familiaEsRepuesto: false, seguimiento: 'NINGUNO' as const };
    if (seguimientoLeido === null) return noVigente;

    const elegible = await validarInsumoElegible(this.insumoRepo, insumoId);
    if (elegible.isFail()) return noVigente;

    const insumo = elegible.getValue();
    const admitida = await validarCondicionAdmitida(this.familiaRepo, insumo, 'USADO', {
      admitirFamiliaNoVigente: true,
    });
    return {
      vigente: true,
      familiaEsRepuesto: admitida.isOk(),
      seguimiento: seguimientoLeido ?? insumo.seguimiento,
    };
  }

  private hechosDe(
    hechos: ReadonlyMap<string, HechosDelInsumo>,
    insumoId: string,
  ): HechosDelInsumo {
    return hechos.get(insumoId) as HechosDelInsumo;
  }

  /** Aplica `clasificarPiezaDevuelta` a todas las piezas, sin cortar en la primera causa. */
  private clasificarPiezas(
    piezas: readonly PiezaDeEquipoADevolver[],
    hechos: ReadonlyMap<string, HechosDelInsumo>,
  ): CausaPieza[] {
    const repeticiones = new Map<string, number>();
    const claveSerial = (p: PiezaDeEquipoADevolver) =>
      `${p.insumoId}\u0000${normalizarSerial(p.numeroSerie ?? '')}`;
    for (const pieza of piezas) {
      if (pieza.insumoId === null || pieza.unidadId !== null) continue;
      if (normalizarSerial(pieza.numeroSerie ?? '') === '') continue;
      repeticiones.set(claveSerial(pieza), (repeticiones.get(claveSerial(pieza)) ?? 0) + 1);
    }

    const causas: CausaPieza[] = [];
    for (const pieza of piezas) {
      const h = pieza.insumoId === null ? undefined : this.hechosDe(hechos, pieza.insumoId);
      const causa = clasificarPiezaDevuelta({
        destino: 'STOCK_USADO',
        insumoId: pieza.insumoId,
        insumoVigente: h?.vigente ?? false,
        familiaEsRepuesto: h === undefined ? null : h.familiaEsRepuesto,
        seguimiento: h?.seguimiento ?? 'NINGUNO',
        tieneUnidad: pieza.unidadId !== null,
        numeroSerie: pieza.numeroSerie,
        serialRepetidoEnElLote: (repeticiones.get(claveSerial(pieza)) ?? 0) > 1,
      });
      if (causa !== null) {
        causas.push({ componenteId: pieza.componenteId, insumoId: pieza.insumoId, causa });
      }
    }
    return causas;
  }

  /**
   * Construye el asiento y lo inserta. El id sale de la entidad recién leída y
   * no del DTO: es el valor canónico que la base ya reconoció como fila
   * existente.
   */
  private async asentar(
    insumoId: string,
    condicion: CondicionStock,
    dto: RegistrarEntradaInsumoDto,
  ): Promise<Result<MovimientoInsumoEntity, DomainError>> {
    const movimiento = MovimientoInsumoEntity.create({
      insumoId,
      tipo: 'ENTRADA',
      condicion,
      cantidad: dto.cantidad,
      usuarioId: dto.usuarioId,
      motivo: dto.motivo,
      equipoId: dto.equipoId,
      sectorId: dto.sectorId,
      itemCompraId: dto.itemCompraId,
    });

    // Hoy este camino es inalcanzable para la ENTRADA: el único `Result.fail`
    // de `create()` es el ajuste sin motivo. Se propaga igual y no se
    // desempaqueta con un `getValue()` optimista porque cuesta tres líneas y
    // es lo que evita que una regla de negocio nueva en la entidad llegue al
    // usuario como un 500 en lugar del 422 que le corresponde.
    if (movimiento.isFail()) {
      return Result.fail(movimiento.getError());
    }

    // El asentado, NO `movimiento.getValue()`: issue #159 — `insert()`
    // devuelve el asiento con el `createdAt` que realmente le puso la base,
    // que puede diferir del reloj del proceso con el que se construyó acá.
    const asentado = await this.movimientoRepo.insert(movimiento.getValue());

    return Result.ok(asentado);
  }
}
