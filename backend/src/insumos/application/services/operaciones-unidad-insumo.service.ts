import { DomainError, Result } from '../../../shared/domain/result';
import { EventoUnidadInsumoEntity } from '../../domain/entities/evento-unidad-insumo.entity';
import { MovimientoInsumoEntity } from '../../domain/entities/movimiento-insumo.entity';
import { CondicionStock } from '../../domain/entities/tipo-movimiento-insumo';
import { EstadoUnidadInsumo, UnidadInsumoEntity } from '../../domain/entities/unidad-insumo.entity';
import { InsumoNoEncontradoError } from '../../domain/errors/insumos.errors';
import {
  SerialDuplicadoError,
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
      'insertar' | 'bloquearPorIds' | 'guardarConEstadoEsperado'
    >,
    private readonly eventoRepo: Pick<IEventoUnidadInsumoRepository, 'insert'>,
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
   * L1 y L2 del insumo, y su validación: existe y se sigue por serie. La lectura
   * `FOR SHARE` es lo primero que toca la base, así que también es el chequeo de
   * transacción activa.
   */
  private async bloquearInsumo(insumoId: string): Promise<Result<void, DomainError>> {
    const seguimiento = await this.insumoRepo.leerSeguimientoParaMovimiento(insumoId);
    if (seguimiento === null) return Result.fail(new InsumoNoEncontradoError(insumoId));
    if (seguimiento !== 'SERIE') return Result.fail(new UnidadNoAdmitidaError(insumoId));
    await this.movimientoRepo.bloquearStock(insumoId);
    return Result.ok(undefined);
  }

  /** Arma el movimiento y el evento de una unidad sin escribir nada. */
  private armarEscritura(
    unidad: UnidadInsumoEntity,
    estadoEsperado: EstadoUnidadInsumo | null,
    datos: {
      insumoId: string;
      tipo: 'ENTRADA' | 'AJUSTE_POSITIVO' | 'SALIDA' | 'AJUSTE_NEGATIVO';
      tipoEvento: 'INGRESO' | 'ENTREGA' | 'BAJA_DE_DEPOSITO';
      o: ContextoUnidad;
      itemCompraId?: string | null;
      equipoId?: string | null;
      sectorId?: string | null;
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
}
