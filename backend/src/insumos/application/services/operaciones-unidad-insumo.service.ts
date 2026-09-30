import { DomainError, Result } from '../../../shared/domain/result';
import { EventoUnidadInsumoEntity } from '../../domain/entities/evento-unidad-insumo.entity';
import {
  MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH,
  MovimientoInsumoEntity,
  normalizarMotivoMovimiento,
} from '../../domain/entities/movimiento-insumo.entity';
import { CondicionStock } from '../../domain/entities/tipo-movimiento-insumo';
import { EstadoUnidadInsumo, UnidadInsumoEntity } from '../../domain/entities/unidad-insumo.entity';
import { InsumoNoEncontradoError } from '../../domain/errors/insumos.errors';
import {
  MotivoCorreccionSerialInvalidoError,
  SeguimientoNoModificableError,
  SerialDuplicadoError,
  UnidadDelComponenteNoDisponibleError,
  UnidadNoAdmitidaError,
  UnidadNoDisponibleError,
  UnidadNoEncontradaError,
} from '../../domain/errors/unidades-insumo.errors';
import { IEventoUnidadInsumoRepository } from '../../domain/ports/i-evento-unidad-insumo.repository';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';
import { IMovimientoInsumoRepository } from '../../domain/ports/i-movimiento-insumo.repository';
import { IUnidadInsumoRepository } from '../../domain/ports/i-unidad-insumo.repository';

/** Quién opera y por qué; lo comparte todo el lote. */
export interface ContextoUnidad {
  usuarioId: string;
  motivo?: string | null;
}

/** Resultado de una operación que mueve el libro: la unidad y su movimiento. */
export interface UnidadConMovimiento {
  unidad: UnidadInsumoEntity;
  movimiento: MovimientoInsumoEntity;
}

/** Una unidad dentro de un equipo y el componente que la lleva (ADR-4, ADR-9). */
export interface ItemEnEquipo {
  unidadId: string;
  equipoId: string;
  /** Id que la entidad del componente ya generó, aunque su fila se inserte después (sin FK). */
  componenteId: string;
}

/** Una escritura sin movimiento: unidad (CAS o INSERT) y evento. */
interface EscrituraSinMovimiento {
  unidad: UnidadInsumoEntity;
  /** `null` si la unidad es nueva (INSERT); si no, el estado leído bajo lock (CAS). */
  estadoEsperado: EstadoUnidadInsumo | null;
  evento: EventoUnidadInsumoEntity;
}

/** Una escritura ya armada y validada, lista para ejecutarse sin decidir nada más. */
interface EscrituraDeUnidad {
  unidad: UnidadInsumoEntity;
  /** `null` si la unidad es nueva (INSERT); si no, el estado leído bajo lock (CAS). */
  estadoEsperado: EstadoUnidadInsumo | null;
  movimiento: MovimientoInsumoEntity;
  evento: EventoUnidadInsumoEntity;
}

/**
 * OperacionesUnidadInsumo — única puerta de las unidades por número de serie
 * (ADR-4 de sdd/repuestos-numero-de-serie).
 *
 * Cada operación es un lote que corre DENTRO de la transacción del llamador y
 * sigue el mismo guion:
 *
 * 1. Toma los locks en el orden de ADR-12: L1 (fila del insumo, `FOR SHARE`),
 *    L2 (advisory por insumo) y L3 (filas de unidad, `FOR NO KEY UPDATE`, por
 *    id). La primera lectura con lock exige la transacción activa, así que el
 *    servicio lanza fuera de una sin conocer el `TenantContext` y sin abrir la
 *    suya: `run()` es re-entrante y no tiene savepoint.
 * 2. Valida TODO el lote y arma las entidades, sin escribir.
 * 3. Recién entonces escribe. Un `Result.fail` nunca sigue a una escritura: lo
 *    contrario dejaría la mitad del lote en la transacción del llamador.
 *
 * La única falla posterior a escribir es la unicidad del serial (P2002), que el
 * repositorio lanza como `FalloOperacionDeUnidad` para que el caso de uso la
 * desenvuelva fuera de su `run()`.
 *
 * Las cantidades de los movimientos son siempre 1 (una unidad por pieza), así
 * que `CantidadNoEnteraError` no puede ocurrir acá: los casos de uso que reciben
 * una cantidad del usuario la validan antes de pedir el lote.
 */
export class OperacionesUnidadInsumo {
  constructor(
    private readonly insumoRepo: Pick<IInsumoRepository, 'leerSeguimientoParaMovimiento'>,
    private readonly movimientoRepo: Pick<IMovimientoInsumoRepository, 'bloquearStock' | 'insert'>,
    private readonly unidadRepo: Pick<
      IUnidadInsumoRepository,
      'insertar' | 'bloquearPorIds' | 'guardarConEstadoEsperado' | 'findById'
    >,
    private readonly eventoRepo: Pick<IEventoUnidadInsumoRepository, 'insert' | 'listarPorUnidad'>,
  ) {}

  /**
   * Da de alta piezas en el depósito: una unidad (con serial o pendiente), su
   * movimiento de cantidad 1 y el evento `INGRESO` por cada una.
   *
   * @param insumoId Insumo `SERIE` al que pertenecen las piezas.
   * @param piezas Una por unidad; `numeroSerie: null` crea una serie pendiente.
   * @param o Usuario, motivo, condición, tipo de movimiento y origen opcional.
   * @returns Las unidades con su movimiento, en el orden de `piezas`; o el primer error de validación, sin haber escrito nada.
   */
  async ingresar(
    insumoId: string,
    piezas: ReadonlyArray<{ numeroSerie: string | null }>,
    o: ContextoUnidad & {
      condicion: CondicionStock;
      tipo: 'ENTRADA' | 'AJUSTE_POSITIVO';
      itemCompraId?: string | null;
      equipoId?: string | null;
    },
  ): Promise<Result<UnidadConMovimiento[], DomainError>> {
    const bloqueo = await this.bloquearInsumo(insumoId);
    if (bloqueo.isFail()) return Result.fail(bloqueo.getError());

    const serialesVistos = new Set<string>();
    const escrituras: EscrituraDeUnidad[] = [];
    for (const pieza of piezas) {
      const creada = UnidadInsumoEntity.crearEnDeposito({
        insumoId,
        condicion: o.condicion,
        numeroSerie: pieza.numeroSerie,
      });
      if (creada.isFail()) return Result.fail(creada.getError());
      const unidad = creada.getValue();

      const normalizado = unidad.numeroSerieNormalizado;
      if (normalizado !== null) {
        if (serialesVistos.has(normalizado)) {
          return Result.fail(new SerialDuplicadoError(unidad.numeroSerie ?? normalizado));
        }
        serialesVistos.add(normalizado);
      }

      const armada = this.armarEscritura(unidad, null, {
        insumoId,
        tipo: o.tipo,
        tipoEvento: 'INGRESO',
        o,
        itemCompraId: o.itemCompraId,
        equipoId: o.equipoId,
      });
      if (armada.isFail()) return Result.fail(armada.getError());
      escrituras.push(armada.getValue());
    }

    return Result.ok(await this.escribir(escrituras));
  }

  /**
   * Saca piezas del depósito. `SALIDA` deja la unidad `ENTREGADA` (solo con
   * serial, evento `ENTREGA`); `AJUSTE_NEGATIVO` la deja `DESCARTADA` (con serial
   * o pendiente, F1, evento `BAJA_DE_DEPOSITO`). El destino (`equipoId`,
   * `sectorId`, `motivo`) queda en el movimiento; el evento lo referencia por
   * `movimiento_id`.
   *
   * @param insumoId Insumo `SERIE` del que salen las piezas.
   * @param unidadIds Unidades a sacar, sin repetir.
   * @param o Usuario, motivo, tipo de movimiento, destino y condición esperada opcional.
   * @returns Las unidades con su movimiento, en el orden de `unidadIds`; o el primer error de validación, sin haber escrito nada.
   */
  async sacarDelDeposito(
    insumoId: string,
    unidadIds: readonly string[],
    o: ContextoUnidad & {
      tipo: 'SALIDA' | 'AJUSTE_NEGATIVO';
      condicion?: CondicionStock;
      equipoId?: string | null;
      sectorId?: string | null;
    },
  ): Promise<Result<UnidadConMovimiento[], DomainError>> {
    const bloqueo = await this.bloquearInsumo(insumoId);
    if (bloqueo.isFail()) return Result.fail(bloqueo.getError());

    const repetida = unidadIds.find((id, i) => unidadIds.indexOf(id) !== i);
    if (repetida !== undefined) {
      return Result.fail(new UnidadNoDisponibleError(repetida, 'está repetida en el lote.'));
    }

    const leidas = await this.unidadRepo.bloquearPorIds([...unidadIds].sort());
    const porId = new Map(leidas.map((unidad) => [unidad.id, unidad]));

    const escrituras: EscrituraDeUnidad[] = [];
    for (const unidadId of unidadIds) {
      const unidad = porId.get(unidadId);
      if (unidad === undefined) return Result.fail(new UnidadNoEncontradaError(unidadId));
      if (unidad.insumoId !== insumoId) return Result.fail(new UnidadNoAdmitidaError(insumoId));
      if (o.condicion !== undefined && unidad.condicion !== o.condicion) {
        return Result.fail(
          new UnidadNoDisponibleError(
            unidad.id,
            `está en condición ${unidad.condicion} y se pidió ${o.condicion}.`,
          ),
        );
      }

      const estadoLeido = unidad.estado;
      const transicion = o.tipo === 'SALIDA' ? unidad.entregar() : unidad.descartarDeDeposito();
      if (transicion.isFail()) return Result.fail(transicion.getError());

      const armada = this.armarEscritura(unidad, estadoLeido, {
        insumoId,
        tipo: o.tipo,
        tipoEvento: o.tipo === 'SALIDA' ? 'ENTREGA' : 'BAJA_DE_DEPOSITO',
        o,
        equipoId: o.equipoId,
        sectorId: o.sectorId,
      });
      if (armada.isFail()) return Result.fail(armada.getError());
      escrituras.push(armada.getValue());
    }

    return Result.ok(await this.escribir(escrituras));
  }

  /**
   * Devuelve al depósito piezas entregadas (F2, ADR-13): `ENTREGADA → EN_DEPOSITO`
   * en la condición elegida (NUEVO si no se usó, USADO si se usó), con una
   * ENTRADA de cantidad 1 y el evento `DEVOLUCION_DE_ENTREGA`. La unidad conserva
   * su serial. No exige el insumo habilitado: la exención de G2 la decide el caso
   * de uso, este servicio no vuelve a imponer `exigirHabilitado`.
   *
   * @param insumoId Insumo al que pertenecen las piezas; con `NINGUNO` una unidad viva no tendría dueño.
   * @param unidadIds Unidades a devolver, sin repetir.
   * @param o Usuario, motivo opcional y condición con la que vuelven.
   * @returns Las unidades con su movimiento, en el orden de `unidadIds`; o el primer error de validación, sin haber escrito nada.
   */
  async devolverEntregas(
    insumoId: string,
    unidadIds: readonly string[],
    o: ContextoUnidad & { condicion: CondicionStock },
  ): Promise<Result<UnidadConMovimiento[], DomainError>> {
    const bloqueo = await this.bloquearInsumo(
      insumoId,
      () =>
        new SeguimientoNoModificableError(
          `el insumo "${insumoId}" no se sigue por número de serie, así que no admite devolver una entrega.`,
        ),
    );
    if (bloqueo.isFail()) return Result.fail(bloqueo.getError());

    const repetida = unidadIds.find((id, i) => unidadIds.indexOf(id) !== i);
    if (repetida !== undefined) {
      return Result.fail(new UnidadNoDisponibleError(repetida, 'está repetida en el lote.'));
    }

    const leidas = await this.unidadRepo.bloquearPorIds([...unidadIds].sort());
    const porId = new Map(leidas.map((unidad) => [unidad.id, unidad]));

    const escrituras: EscrituraDeUnidad[] = [];
    for (const unidadId of unidadIds) {
      const unidad = porId.get(unidadId);
      if (unidad === undefined) return Result.fail(new UnidadNoEncontradaError(unidadId));
      if (unidad.insumoId !== insumoId) return Result.fail(new UnidadNoAdmitidaError(insumoId));

      const estadoLeido = unidad.estado;
      const transicion = unidad.devolverEntrega(o.condicion);
      if (transicion.isFail()) return Result.fail(transicion.getError());

      const armada = this.armarEscritura(unidad, estadoLeido, {
        insumoId,
        tipo: 'ENTRADA',
        tipoEvento: 'DEVOLUCION_DE_ENTREGA',
        o,
      });
      if (armada.isFail()) return Result.fail(armada.getError());
      escrituras.push(armada.getValue());
    }

    return Result.ok(await this.escribir(escrituras));
  }

  /**
   * Instala piezas del depósito en equipos: `EN_DEPOSITO → INSTALADA` con una
   * SALIDA de cantidad 1 (con `equipoId`) y el evento `INSTALACION`, que lleva
   * `equipoId` y `componenteId`. Una serie pendiente se rechaza (instalar exige
   * serial). El lote puede abarcar varios equipos e insumos; los locks salen en
   * el orden de ADR-12 (L1, L2 de todos los insumos, luego L3) y los de
   * `componentes_equipo` (L4) los toma el caso de uso DESPUÉS.
   *
   * @param items Una por unidad: unidad, equipo destino y componente que la llevará.
   * @param o Usuario y motivo compartido por todo el lote.
   * @returns Las unidades con su movimiento, en el orden de `items`; o el primer error de validación, sin haber escrito nada.
   */
  async instalar(
    items: readonly ItemEnEquipo[],
    o: ContextoUnidad,
  ): Promise<Result<UnidadConMovimiento[], DomainError>> {
    const lote = await this.leerLoteEnEquipo(items);
    if (lote.isFail()) return Result.fail(lote.getError());

    const escrituras: EscrituraDeUnidad[] = [];
    for (const item of items) {
      const unidad = lote.getValue().get(item.unidadId) as UnidadInsumoEntity;
      const estadoLeido = unidad.estado;
      const transicion = unidad.instalar(item.equipoId);
      if (transicion.isFail()) return Result.fail(transicion.getError());

      const armada = this.armarEscritura(unidad, estadoLeido, {
        insumoId: unidad.insumoId,
        tipo: 'SALIDA',
        tipoEvento: 'INSTALACION',
        o,
        equipoId: item.equipoId,
        componenteId: item.componenteId,
      });
      if (armada.isFail()) return Result.fail(armada.getError());
      escrituras.push(armada.getValue());
    }

    return Result.ok(await this.escribir(escrituras));
  }

  /**
   * Devuelve al depósito piezas instaladas (retiro `STOCK_USADO`):
   * `INSTALADA → EN_DEPOSITO` en condición USADO, con una ENTRADA USADO de
   * cantidad 1 y el evento `RETIRO_A_DEPOSITO`. Sirve a la baja de un equipo
   * completo: N unidades y un motivo compartido en una sola transacción.
   *
   * @param items Una por unidad; `equipoId` debe ser el equipo donde está instalada.
   * @param o Usuario y motivo compartido por todo el lote.
   * @returns Las unidades con su movimiento, en el orden de `items`; o el primer error de validación, sin haber escrito nada.
   */
  async devolverAlDeposito(
    items: readonly ItemEnEquipo[],
    o: ContextoUnidad,
  ): Promise<Result<UnidadConMovimiento[], DomainError>> {
    const lote = await this.leerLoteEnEquipo(items);
    if (lote.isFail()) return Result.fail(lote.getError());

    const escrituras: EscrituraDeUnidad[] = [];
    for (const item of items) {
      const unidad = lote.getValue().get(item.unidadId) as UnidadInsumoEntity;
      const instalada = this.exigirInstaladaEn(unidad, item);
      if (instalada.isFail()) return Result.fail(instalada.getError());

      const estadoLeido = unidad.estado;
      const transicion = unidad.devolverAlDeposito();
      if (transicion.isFail()) return Result.fail(transicion.getError());

      const armada = this.armarEscritura(unidad, estadoLeido, {
        insumoId: unidad.insumoId,
        tipo: 'ENTRADA',
        tipoEvento: 'RETIRO_A_DEPOSITO',
        o,
        equipoId: item.equipoId,
        componenteId: item.componenteId,
      });
      if (armada.isFail()) return Result.fail(armada.getError());
      escrituras.push(armada.getValue());
    }

    return Result.ok(await this.escribir(escrituras));
  }

  /**
   * Descarta piezas instaladas (retiro `DESCARTE`): `INSTALADA → DESCARTADA`,
   * sin movimiento y con el evento `DESCARTE` (equipo y componente). Es el
   * evento que `reinstalar` busca como último para reactivar el componente.
   *
   * @param items Una por unidad; `equipoId` debe ser el equipo donde está instalada.
   * @param o Usuario y motivo compartido por todo el lote.
   * @returns Las unidades descartadas, en el orden de `items`; o el primer error de validación, sin haber escrito nada.
   */
  async descartarInstaladas(
    items: readonly ItemEnEquipo[],
    o: ContextoUnidad,
  ): Promise<Result<UnidadInsumoEntity[], DomainError>> {
    const lote = await this.leerLoteEnEquipo(items);
    if (lote.isFail()) return Result.fail(lote.getError());

    const escrituras: EscrituraSinMovimiento[] = [];
    for (const item of items) {
      const unidad = lote.getValue().get(item.unidadId) as UnidadInsumoEntity;
      const instalada = this.exigirInstaladaEn(unidad, item);
      if (instalada.isFail()) return Result.fail(instalada.getError());

      const estadoLeido = unidad.estado;
      const transicion = unidad.descartarInstalada();
      if (transicion.isFail()) return Result.fail(transicion.getError());

      escrituras.push({
        unidad,
        estadoEsperado: estadoLeido,
        evento: this.armarEventoDeEquipo('DESCARTE', unidad, item, o),
      });
    }

    await this.escribirSinMovimiento(escrituras);
    return Result.ok(escrituras.map((e) => e.unidad));
  }

  /**
   * Reinstala piezas al reactivar el componente que las descartó:
   * `DESCARTADA → INSTALADA`, sin movimiento y con el evento `REACTIVACION`.
   * Exige la unidad `DESCARTADA` Y que su último evento sea el `DESCARTE` de ESTE
   * componente (ADR-14): si la pieza se recuperó, se reinstaló en otro equipo o
   * se dio de baja por otra vía, devuelve `UnidadDelComponenteNoDisponibleError`.
   * Si el insumo ya no es `SERIE`, `SeguimientoNoModificableError`: reinstalar
   * crearía una unidad viva en un insumo `NINGUNO`.
   *
   * @param items Una por unidad: equipo donde se reactiva y componente que la descartó.
   * @param o Usuario y motivo compartido por todo el lote.
   * @returns Las unidades reinstaladas, en el orden de `items`; o el primer error de validación, sin haber escrito nada.
   */
  async reinstalar(
    items: readonly ItemEnEquipo[],
    o: ContextoUnidad,
  ): Promise<Result<UnidadInsumoEntity[], DomainError>> {
    const lote = await this.leerLoteEnEquipo(
      items,
      (insumoId) =>
        new SeguimientoNoModificableError(
          `el insumo "${insumoId}" ya no se sigue por número de serie, así que no admite reinstalar una unidad.`,
        ),
    );
    if (lote.isFail()) return Result.fail(lote.getError());

    const escrituras: EscrituraSinMovimiento[] = [];
    for (const item of items) {
      const unidad = lote.getValue().get(item.unidadId) as UnidadInsumoEntity;
      const historia = await this.eventoRepo.listarPorUnidad(unidad.id);
      const ultimo = historia[historia.length - 1];
      if (
        unidad.estado !== 'DESCARTADA' ||
        ultimo === undefined ||
        ultimo.tipo !== 'DESCARTE' ||
        ultimo.componenteId !== item.componenteId
      ) {
        return Result.fail(new UnidadDelComponenteNoDisponibleError(item.componenteId));
      }

      const estadoLeido = unidad.estado;
      const transicion = unidad.reinstalar(item.equipoId);
      if (transicion.isFail()) return Result.fail(transicion.getError());

      escrituras.push({
        unidad,
        estadoEsperado: estadoLeido,
        evento: this.armarEventoDeEquipo('REACTIVACION', unidad, item, o),
      });
    }

    await this.escribirSinMovimiento(escrituras);
    return Result.ok(escrituras.map((e) => e.unidad));
  }

  /**
   * Da de alta una unidad YA instalada (alta de componente sin descuento, D3):
   * unidad `INSTALADA` con la condición indicada, sin movimiento (el stock no se
   * toca) y el evento `ALTA_INSTALADA` con `equipoId` y `componenteId`.
   *
   * @param insumoId Insumo `SERIE` de la pieza.
   * @param numeroSerie Serial crudo; obligatorio, una instalada siempre lo tiene.
   * @param equipoId Equipo donde queda instalada.
   * @param o Usuario, motivo, condición y el id ya generado del componente.
   * @returns La unidad creada; o el primer error de validación, sin haber escrito nada.
   * @throws FalloOperacionDeUnidad si el serial ya lo tiene otra unidad del insumo (P2002).
   */
  async altaInstalada(
    insumoId: string,
    numeroSerie: string,
    equipoId: string,
    o: ContextoUnidad & { condicion: CondicionStock; componenteId: string },
  ): Promise<Result<UnidadInsumoEntity, DomainError>> {
    const bloqueo = await this.bloquearInsumo(insumoId);
    if (bloqueo.isFail()) return Result.fail(bloqueo.getError());

    const creada = UnidadInsumoEntity.crearInstalada({
      insumoId,
      condicion: o.condicion,
      numeroSerie,
      equipoId,
    });
    if (creada.isFail()) return Result.fail(creada.getError());
    const unidad = creada.getValue();

    const evento = EventoUnidadInsumoEntity.create({
      unidadId: unidad.id,
      tipo: 'ALTA_INSTALADA',
      equipoId,
      componenteId: o.componenteId,
      serialNuevo: unidad.numeroSerie,
      motivo: o.motivo,
      usuarioId: o.usuarioId,
    });
    await this.escribirSinMovimiento([{ unidad, estadoEsperado: null, evento }]);
    return Result.ok(unidad);
  }

  /**
   * Completa el serial de una unidad en serie pendiente: solo `EN_DEPOSITO` y sin
   * serial. Asienta el evento `SERIAL_CARGADO` sin movimiento ni motivo (el libro
   * no cambia). Una unidad que ya tiene serial se corrige con `corregirSerial`.
   *
   * @param unidadId Unidad pendiente.
   * @param numeroSerie Serial crudo; se normaliza para la unicidad por insumo.
   * @param o Usuario que carga el serial.
   * @returns La unidad con el serial cargado; o el primer error de validación, sin haber escrito nada.
   * @throws FalloOperacionDeUnidad si el serial ya lo tiene otra unidad del insumo (P2002).
   */
  async cargarSerial(
    unidadId: string,
    numeroSerie: string,
    o: ContextoUnidad,
  ): Promise<Result<UnidadInsumoEntity, DomainError>> {
    const leida = await this.leerUnidadBajoLock(unidadId);
    if (leida.isFail()) return Result.fail(leida.getError());
    const unidad = leida.getValue();

    const estadoLeido = unidad.estado;
    const cargada = unidad.cargarSerial(numeroSerie);
    if (cargada.isFail()) return Result.fail(cargada.getError());

    const evento = EventoUnidadInsumoEntity.create({
      unidadId: unidad.id,
      tipo: 'SERIAL_CARGADO',
      serialNuevo: unidad.numeroSerie,
      usuarioId: o.usuarioId,
    });
    await this.unidadRepo.guardarConEstadoEsperado(unidad, estadoLeido);
    await this.eventoRepo.insert(evento);
    return Result.ok(unidad);
  }

  /**
   * Corrige el serial de una unidad que ya lo tiene, con el motivo obligatorio:
   * el evento `CORRECCION_SERIAL` (serial anterior, serial nuevo, motivo y
   * usuario) es el registro auditado. Se rechaza una unidad `INSTALADA` (su
   * serial se corrige desde el componente) y una pendiente (se carga).
   *
   * @param unidadId Unidad con serial.
   * @param numeroSerie Serial nuevo, crudo.
   * @param o Usuario y motivo (obligatorio, con contenido y de hasta 500 caracteres).
   * @returns La unidad corregida; o el primer error de validación, sin haber escrito nada.
   * @throws FalloOperacionDeUnidad si el serial nuevo ya lo tiene otra unidad del insumo (P2002).
   */
  async corregirSerial(
    unidadId: string,
    numeroSerie: string,
    o: ContextoUnidad,
  ): Promise<Result<UnidadInsumoEntity, DomainError>> {
    const motivo = normalizarMotivoMovimiento(o.motivo);
    if (motivo === null) {
      return Result.fail(new MotivoCorreccionSerialInvalidoError(unidadId, 'exige un motivo.'));
    }
    if (motivo.length > MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH) {
      return Result.fail(
        new MotivoCorreccionSerialInvalidoError(
          unidadId,
          `el motivo excede ${MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH} caracteres.`,
        ),
      );
    }

    const leida = await this.leerUnidadBajoLock(unidadId);
    if (leida.isFail()) return Result.fail(leida.getError());
    const unidad = leida.getValue();

    if (unidad.estado === 'INSTALADA') {
      return Result.fail(
        new UnidadNoDisponibleError(
          unidad.id,
          'está instalada en un equipo; su serial no se corrige desde la unidad.',
        ),
      );
    }

    const estadoLeido = unidad.estado;
    const corregida = unidad.corregirSerial(numeroSerie);
    if (corregida.isFail()) return Result.fail(corregida.getError());

    const evento = EventoUnidadInsumoEntity.create({
      unidadId: unidad.id,
      tipo: 'CORRECCION_SERIAL',
      serialAnterior: corregida.getValue(),
      serialNuevo: unidad.numeroSerie,
      motivo,
      usuarioId: o.usuarioId,
    });
    await this.unidadRepo.guardarConEstadoEsperado(unidad, estadoLeido);
    await this.eventoRepo.insert(evento);
    return Result.ok(unidad);
  }

  /**
   * Lee el lote de una operación de equipo respetando ADR-12: las unidades se
   * leen sin lock solo para conocer sus insumos (nunca cambian), después L1 y L2
   * de TODOS los insumos en orden de id y por último L3 de todas las unidades,
   * en orden de id. Rechaza ids repetidos y unidades inexistentes.
   *
   * @param items Lote de la operación.
   * @param errorSiNoEsSerie Error si un insumo del lote no es `SERIE`; por defecto `UnidadNoAdmitidaError`.
   * @returns Las unidades leídas bajo lock, por id.
   */
  private async leerLoteEnEquipo(
    items: readonly ItemEnEquipo[],
    errorSiNoEsSerie?: (insumoId: string) => DomainError,
  ): Promise<Result<Map<string, UnidadInsumoEntity>, DomainError>> {
    if (items.length === 0) return Result.ok(new Map());

    const ids = items.map((item) => item.unidadId);
    const repetida = ids.find((id, i) => ids.indexOf(id) !== i);
    if (repetida !== undefined) {
      return Result.fail(new UnidadNoDisponibleError(repetida, 'está repetida en el lote.'));
    }

    const insumoIds = new Set<string>();
    for (const id of ids) {
      const foto = await this.unidadRepo.findById(id);
      if (foto === null) return Result.fail(new UnidadNoEncontradaError(id));
      insumoIds.add(foto.insumoId);
    }

    const bloqueo = await this.bloquearInsumos([...insumoIds].sort(), errorSiNoEsSerie);
    if (bloqueo.isFail()) return Result.fail(bloqueo.getError());

    const leidas = await this.unidadRepo.bloquearPorIds([...ids].sort());
    const porId = new Map(leidas.map((unidad) => [unidad.id, unidad]));
    const faltante = ids.find((id) => !porId.has(id));
    if (faltante !== undefined) return Result.fail(new UnidadNoEncontradaError(faltante));
    return Result.ok(porId);
  }

  /** La unidad debe estar `INSTALADA` en el equipo del item (la baja de un equipo no toca piezas de otro). */
  private exigirInstaladaEn(
    unidad: UnidadInsumoEntity,
    item: ItemEnEquipo,
  ): Result<void, DomainError> {
    if (unidad.estado === 'INSTALADA' && unidad.equipoId !== item.equipoId) {
      return Result.fail(
        new UnidadNoDisponibleError(
          unidad.id,
          `está instalada en otro equipo y no en "${item.equipoId}".`,
        ),
      );
    }
    return Result.ok(undefined);
  }

  /** Evento de una operación de equipo sin movimiento. */
  private armarEventoDeEquipo(
    tipo: 'DESCARTE' | 'REACTIVACION',
    unidad: UnidadInsumoEntity,
    item: ItemEnEquipo,
    o: ContextoUnidad,
  ): EventoUnidadInsumoEntity {
    return EventoUnidadInsumoEntity.create({
      unidadId: unidad.id,
      tipo,
      equipoId: item.equipoId,
      componenteId: item.componenteId,
      motivo: o.motivo,
      usuarioId: o.usuarioId,
    });
  }

  /**
   * Lee UNA unidad respetando el orden de ADR-12: el insumo de la unidad sale de
   * una lectura sin lock (nunca cambia), L1 y L2 de ese insumo, y recién después
   * L3 con la relectura bajo lock, que es la que manda.
   */
  private async leerUnidadBajoLock(
    unidadId: string,
  ): Promise<Result<UnidadInsumoEntity, DomainError>> {
    const foto = await this.unidadRepo.findById(unidadId);
    if (foto === null) return Result.fail(new UnidadNoEncontradaError(unidadId));

    const bloqueo = await this.bloquearInsumo(foto.insumoId);
    if (bloqueo.isFail()) return Result.fail(bloqueo.getError());

    const [unidad] = await this.unidadRepo.bloquearPorIds([unidadId]);
    if (unidad === undefined) return Result.fail(new UnidadNoEncontradaError(unidadId));
    return Result.ok(unidad);
  }

  /**
   * L1 y L2 del insumo, y su validación: existe y se sigue por serie. La lectura
   * `FOR SHARE` es lo primero que toca la base, así que también es el chequeo de
   * transacción activa.
   *
   * @param errorSiNoEsSerie Error a devolver si el insumo no es `SERIE`; por defecto `UnidadNoAdmitidaError`.
   */
  private bloquearInsumo(
    insumoId: string,
    errorSiNoEsSerie?: () => DomainError,
  ): Promise<Result<void, DomainError>> {
    return this.bloquearInsumos([insumoId], errorSiNoEsSerie);
  }

  /**
   * L1 de TODOS los insumos y después L2 de todos (ADR-12: un nivel completo
   * antes del siguiente, cada uno en el orden recibido, que debe ser el de id).
   * Valida que cada insumo exista y sea `SERIE`; corta en el primero que no, sin
   * tomar L2.
   */
  private async bloquearInsumos(
    insumoIds: readonly string[],
    errorSiNoEsSerie: (insumoId: string) => DomainError = (id) => new UnidadNoAdmitidaError(id),
  ): Promise<Result<void, DomainError>> {
    for (const insumoId of insumoIds) {
      const seguimiento = await this.insumoRepo.leerSeguimientoParaMovimiento(insumoId);
      if (seguimiento === null) return Result.fail(new InsumoNoEncontradoError(insumoId));
      if (seguimiento !== 'SERIE') return Result.fail(errorSiNoEsSerie(insumoId));
    }
    for (const insumoId of insumoIds) {
      await this.movimientoRepo.bloquearStock(insumoId);
    }
    return Result.ok(undefined);
  }

  /** Arma el movimiento y el evento de una unidad sin escribir nada. */
  private armarEscritura(
    unidad: UnidadInsumoEntity,
    estadoEsperado: EstadoUnidadInsumo | null,
    datos: {
      insumoId: string;
      tipo: 'ENTRADA' | 'AJUSTE_POSITIVO' | 'SALIDA' | 'AJUSTE_NEGATIVO';
      tipoEvento:
        | 'INGRESO'
        | 'ENTREGA'
        | 'BAJA_DE_DEPOSITO'
        | 'DEVOLUCION_DE_ENTREGA'
        | 'INSTALACION'
        | 'RETIRO_A_DEPOSITO';
      o: ContextoUnidad;
      itemCompraId?: string | null;
      equipoId?: string | null;
      sectorId?: string | null;
      componenteId?: string | null;
    },
  ): Result<EscrituraDeUnidad, DomainError> {
    const movimiento = MovimientoInsumoEntity.create({
      insumoId: datos.insumoId,
      tipo: datos.tipo,
      condicion: unidad.condicion,
      cantidad: 1,
      usuarioId: datos.o.usuarioId,
      motivo: datos.o.motivo,
      equipoId: datos.equipoId,
      sectorId: datos.sectorId,
      itemCompraId: datos.itemCompraId,
      unidadId: unidad.id,
    });
    if (movimiento.isFail()) return Result.fail(movimiento.getError());

    const evento = EventoUnidadInsumoEntity.create({
      unidadId: unidad.id,
      tipo: datos.tipoEvento,
      movimientoId: movimiento.getValue().id,
      // El evento nombra el equipo solo en las operaciones de equipo; en el resto el destino vive en el movimiento.
      equipoId: datos.componenteId === undefined ? null : datos.equipoId,
      componenteId: datos.componenteId,
      motivo: datos.o.motivo,
      usuarioId: datos.o.usuarioId,
    });
    return Result.ok({ unidad, estadoEsperado, movimiento: movimiento.getValue(), evento });
  }

  /** Ejecuta las escrituras ya validadas: unidad, movimiento y evento, en ese orden (FK). */
  private async escribir(escrituras: EscrituraDeUnidad[]): Promise<UnidadConMovimiento[]> {
    const resultado: UnidadConMovimiento[] = [];
    for (const { unidad, estadoEsperado, movimiento, evento } of escrituras) {
      if (estadoEsperado === null) {
        await this.unidadRepo.insertar(unidad);
      } else {
        await this.unidadRepo.guardarConEstadoEsperado(unidad, estadoEsperado);
      }
      const guardado = await this.movimientoRepo.insert(movimiento);
      await this.eventoRepo.insert(evento);
      resultado.push({ unidad, movimiento: guardado });
    }
    return resultado;
  }

  /** Ejecuta las escrituras sin movimiento: unidad (INSERT o CAS) y evento. */
  private async escribirSinMovimiento(escrituras: EscrituraSinMovimiento[]): Promise<void> {
    for (const { unidad, estadoEsperado, evento } of escrituras) {
      if (estadoEsperado === null) {
        await this.unidadRepo.insertar(unidad);
      } else {
        await this.unidadRepo.guardarConEstadoEsperado(unidad, estadoEsperado);
      }
      await this.eventoRepo.insert(evento);
    }
  }
}
