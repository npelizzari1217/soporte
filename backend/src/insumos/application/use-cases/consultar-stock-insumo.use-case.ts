import { DomainError, Result } from '../../../shared/domain/result';
import {
  EstadoReposicionInsumo,
  evaluarReposicion,
} from '../../domain/entities/estado-reposicion-insumo';
import { calcularStock } from '../../domain/entities/tipo-movimiento-insumo';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';
import { IMovimientoInsumoRepository } from '../../domain/ports/i-movimiento-insumo.repository';
import { validarInsumoElegible } from '../services/validar-insumo.service';

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
  /** Saldo actual, derivado de la bitácora con `calcularStock()`. Puede ser negativo. */
  stock: number;
  /** Punto de reposición del insumo, o `null` si no tiene uno definido. */
  stockMinimo: number | null;
  /** Lectura del saldo contra el punto de reposición, ya resuelta. */
  estadoReposicion: EstadoReposicionInsumo;
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
 * La fórmula del saldo NO vive acá: `calcularStock()` la resuelve en el
 * dominio, así que el número que se muestra en la ficha es exactamente el
 * mismo que el registro de una salida usa para autorizar. Dos copias
 * discreparían el día que entre un tipo nuevo.
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
    const sumas = await this.movimientoRepo.sumByTipo(insumo.id);
    const stock = calcularStock(sumas);

    return Result.ok({
      insumoId: insumo.id,
      stock,
      stockMinimo: insumo.stockMinimo,
      estadoReposicion: evaluarReposicion(stock, insumo.stockMinimo),
    });
  }
}
