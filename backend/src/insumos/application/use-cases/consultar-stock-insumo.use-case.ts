import { DomainError, Result } from '../../../shared/domain/result';
import {
  EstadoReposicionInsumo,
  evaluarReposicion,
} from '../../domain/entities/estado-reposicion-insumo';
import { SeguimientoInsumo } from '../../domain/entities/unidad-insumo.entity';
import {
  calcularSaldos,
  CondicionStock,
  saldosDesdeUnidades,
} from '../../domain/entities/tipo-movimiento-insumo';
import { IFamiliaInsumoRepository } from '../../domain/ports/i-familia-insumo.repository';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';
import { IMovimientoInsumoRepository } from '../../domain/ports/i-movimiento-insumo.repository';
import { IUnidadInsumoRepository } from '../../domain/ports/i-unidad-insumo.repository';
import {
  validarCondicionAdmitida,
  validarInsumoElegible,
} from '../services/validar-insumo.service';

/**
 * StockDeInsumo — lo que la ficha de un insumo necesita para mostrar su
 * existencia: cuánto hay, cuál es el punto de reposición y cómo se lee uno
 * contra el otro.
 *
 * El estado viaja RESUELTO y no como dos números para que el consumidor los
 * compare: la regla de en qué momento hay que reponer es de negocio, y una
 * segunda comparación en el borde —o en el frontend— sería una segunda
 * definición de "bajo el mínimo" que puede discrepar de esta.
 *
 * `stockMinimo` viaja igual, además del estado, porque la ficha lo muestra
 * —"quedan 3, el punto es 10" dice bastante más que "reponer"— y porque un
 * `null` explícito es lo que le permite al borde distinguir el insumo sin
 * configurar sin tener que interpretar el estado.
 */
export interface StockDeInsumo {
  insumoId: string;
  /** Saldo TOTAL (NUEVO + USADO), en centésimas exactas. Puede ser negativo. */
  stock: number;
  /** Saldo por condición, cada uno derivado de la bitácora con `calcularStock()`. */
  saldos: Record<CondicionStock, number>;
  /**
   * Si la familia del insumo admite la condición USADO (regla de
   * `validarCondicionAdmitida`). Viaja resuelto para que el consumidor no
   * derive la regla por su cuenta.
   */
  admiteUsado: boolean;
  /**
   * Si el reingreso de una pieza (devolver una entrega, recuperar una descartada) admite la
   * condición USADO. Es la regla de `admiteUsado` con la exención G2: la pieza existe físicamente,
   * así que una familia dada de baja o deshabilitada no la impide; `esRepuesto = false` sí.
   */
  admiteUsadoEnReingreso: boolean;
  /** Punto de reposición del insumo, o `null` si no tiene uno definido. */
  stockMinimo: number | null;
  /**
   * Lectura del saldo NUEVO contra el punto de reposición, ya resuelta. El
   * USADO no cuenta: un repuesto usado no reemplaza a uno nuevo para reponer.
   */
  estadoReposicion: EstadoReposicionInsumo;
  /** Cómo se sigue el insumo: decide de qué fuente sale el saldo (ADR-2). */
  seguimiento: SeguimientoInsumo;
  /**
   * Unidades `EN_DEPOSITO` sin serial cargado (series pendientes). Siempre `0`
   * con `NINGUNO`. Cuentan en el saldo pero no pueden salir ni instalarse.
   */
  pendientesDeSerie: number;
}

/**
 * ConsultarStockInsumoUseCase — cuánto hay de un insumo y si llegó a su punto
 * de reposición. Es la consulta de la FICHA del insumo, no la que autoriza
 * nada.
 *
 * **NO abre transacción y NO toma el advisory lock, y eso es la decisión, no
 * un descuido.** Usa `sumByTipo()`, la lectura sin lock: mostrar un número en
 * pantalla no puede hacer esperar a los técnicos que están sacando cosas del
 * depósito. La contracara está dicha y no escondida: **el saldo que devuelve
 * es una FOTO** —otra transacción puede asentar un movimiento del mismo insumo
 * un instante después—, así que sirve para mostrar y no para DECIDIR. Quien
 * tenga que decidir si una salida se autoriza usa
 * `RegistrarSalidaInsumoUseCase`, que lee con `lockAndSumByTipo()` dentro de
 * la misma transacción que escribe.
 *
 * El `Pick` del constructor es el mecanismo, no una prolijidad: al pedir solo
 * `sumByTipo` este caso de uso no puede, ni por accidente ni por una edición
 * futura distraída, tomar el lock ni escribir en la bitácora. Es la misma
 * asimetría con la que `RegistrarEntradaInsumoUseCase` a propósito NO recibe
 * `lockAndSumByTipo`.
 *
 * La fórmula del saldo NO vive acá: `calcularSaldos()` la resuelve (compone `calcularStock()`) en el
 * dominio, así que el número que se muestra en la ficha es exactamente el
 * mismo que el registro de una salida usa para autorizar. Dos copias
 * discreparían el día que entre un tipo nuevo.
 *
 * **Único lector que ramifica por seguimiento (ADR-2).** Con `SERIE` el saldo
 * sale de contar las unidades `EN_DEPOSITO` por condición
 * (`saldosDesdeUnidades`); con `NINGUNO`, de la bitácora. `INSTALADA`,
 * `ENTREGADA` y `DESCARTADA` no cuentan. Las dos fuentes coinciden por el
 * invariante que verifica `invariante-serie.integration.spec.ts`. Leer el
 * seguimiento sin lock es coherente con lo dicho arriba: es una foto.
 *
 * Elegibilidad del insumo:
 *
 * - Existir y estar VIGENTE es obligatorio. La baja lógica cuenta como
 *   inexistencia: `findById()` no filtra por `deletedAt`.
 * - Estar HABILITADO NO se exige, con el mismo criterio que la salida. Un
 *   insumo deshabilitado puede tener existencia en el depósito, y esconderla
 *   dejaría al usuario sin ver justo lo que necesita mirar para vaciarlo.
 *
 * Sin gate propio de escritura: es una lectura del catálogo del tenant.
 *
 * Ref design: openspec/changes/insumos-entrega-2/design.md, unidad 7.
 */
export class ConsultarStockInsumoUseCase {
  constructor(
    private readonly insumoRepo: Pick<IInsumoRepository, 'findById'>,
    private readonly movimientoRepo: Pick<IMovimientoInsumoRepository, 'sumByTipo'>,
    private readonly familiaRepo: Pick<IFamiliaInsumoRepository, 'findById'>,
    private readonly unidadRepo: Pick<
      IUnidadInsumoRepository,
      'contarEnDepositoPorCondicion' | 'listarPorInsumo'
    >,
  ) {}

  /**
   * @param insumoId Insumo cuya existencia se consulta.
   * @returns El saldo con su punto de reposición y el estado ya resuelto; o
   *   `InsumoNoEncontradoError` si el insumo no existe o está dado de baja.
   */
  async execute(insumoId: string): Promise<Result<StockDeInsumo, DomainError>> {
    const elegible = await validarInsumoElegible(this.insumoRepo, insumoId);

    if (elegible.isFail()) {
      return Result.fail(elegible.getError());
    }

    const insumo = elegible.getValue();

    // El id sale de la entidad recién leída y no del argumento: es el valor
    // canónico que la base ya reconoció, mismo criterio que el registro de una
    // salida.
    const esSerie = insumo.seguimiento === 'SERIE';
    const saldos = esSerie
      ? saldosDesdeUnidades(await this.unidadRepo.contarEnDepositoPorCondicion(insumo.id))
      : calcularSaldos(await this.movimientoRepo.sumByTipo(insumo.id));
    const pendientesDeSerie = esSerie
      ? (await this.unidadRepo.listarPorInsumo(insumo.id, ['EN_DEPOSITO'])).filter(
          (unidad) => unidad.numeroSerie === null,
        ).length
      : 0;
    const admiteUsado = (await validarCondicionAdmitida(this.familiaRepo, insumo, 'USADO')).isOk();
    const admiteUsadoEnReingreso = (
      await validarCondicionAdmitida(this.familiaRepo, insumo, 'USADO', {
        admitirFamiliaNoVigente: true,
      })
    ).isOk();

    return Result.ok({
      insumoId: insumo.id,
      stock: saldos.total,
      saldos: { NUEVO: saldos.NUEVO, USADO: saldos.USADO },
      admiteUsado,
      admiteUsadoEnReingreso,
      stockMinimo: insumo.stockMinimo,
      // La reposición mira solo lo NUEVO: los usados no ocultan la falta.
      estadoReposicion: evaluarReposicion(saldos.NUEVO, insumo.stockMinimo),
      seguimiento: insumo.seguimiento,
      pendientesDeSerie,
    });
  }
}
