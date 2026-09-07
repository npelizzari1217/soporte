import { DomainError, Result } from '../../../shared/domain/result';
import { MovimientoInsumoEntity } from '../../domain/entities/movimiento-insumo.entity';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';
import { IMovimientoInsumoRepository } from '../../domain/ports/i-movimiento-insumo.repository';
import { validarInsumoElegible } from '../services/validar-insumo.service';

/**
 * Página que la ficha pide cuando no dice nada. Es 1-indexed: la primera
 * página es la `1` y no la `0`, porque el número que viaja es el que el
 * usuario ve en el paginador.
 */
const PAGINA_DEFAULT = 1;

/**
 * Tamaño de página por defecto. Mismo número que `ListarComprasUseCase` a
 * propósito: es el default de los listados paginados de este repositorio, y
 * elegir otro introduciría una diferencia de comportamiento que nadie decidió.
 */
const POR_PAGINA_DEFAULT = 20;

/**
 * DTO de entrada de `ListarMovimientosInsumoUseCase`.
 *
 * Los dos defaults se resuelven en el CASO DE USO y no acá ni en el puerto:
 * `PaginacionMovimientosInsumo.limit` en `undefined` significa "sin límite" a
 * nivel de persistencia —una decisión del puerto, correcta para él—, así que
 * dejar pasar el ausente hasta allá convertiría una ficha abierta sin
 * parámetros en la descarga de la bitácora entera. Mismo reparto que
 * `ListarComprasUseCase`.
 */
export interface ListarMovimientosInsumoDto {
  /** Página 1-indexed. Default 1. */
  pagina?: number;
  /** Tamaño de página. Default 20. */
  porPagina?: number;
}

/**
 * Resultado paginado de `ListarMovimientosInsumoUseCase`, con la misma forma
 * que `ListarComprasResult` — el molde de listado paginado de este
 * repositorio.
 *
 * `total` es el universo completo del insumo, NO el tamaño de la página: viene
 * de la misma llamada que las filas (`IMovimientoInsumoRepository.listarPorInsumo`),
 * así que sigue siendo correcto incluso cuando `items` vuelve vacío porque el
 * offset se pasó del final.
 *
 * `pagina` y `porPagina` viajan de vuelta porque son la ventana EFECTIVA, ya
 * con los defaults aplicados: sin ellas, quien no mandó nada no tendría cómo
 * saber sobre qué ventana está mirando esas filas.
 */
export interface ListarMovimientosInsumoResult {
  /** Movimientos de la página, ya ordenados por la persistencia (`createdAt DESC, id DESC`). */
  items: MovimientoInsumoEntity[];
  /** Total de movimientos del insumo, sin paginar. */
  total: number;
  /** Página efectivamente devuelta, 1-indexed. */
  pagina: number;
  /** Tamaño de página efectivamente aplicado. */
  porPagina: number;
}

/**
 * ListarMovimientosInsumoUseCase — el HISTORIAL de la ficha de un insumo:
 * quién movió cuánto, cuándo, de qué tipo y por qué. Es la pregunta "qué
 * pasó", complementaria de la que responde `ConsultarStockInsumoUseCase`
 * —"cuánto hay"—, y como aquella no autoriza nada.
 *
 * **NO abre transacción y NO toma el advisory lock, y eso es la decisión, no
 * un descuido.** Usa `listarPorInsumo()`, que lee sin lock: dibujar una tabla
 * en pantalla no puede hacer esperar a los técnicos que están sacando cosas
 * del depósito. La contracara está dicha y no escondida, igual que en el
 * stock: **la lista que devuelve es una FOTO** —otra transacción puede asentar
 * un movimiento del mismo insumo un instante después y esta página no lo va a
 * incluir—, así que sirve para mostrar y no para DECIDIR. Quien tenga que
 * decidir si una salida se autoriza usa `RegistrarSalidaInsumoUseCase`, que
 * lee con `lockAndSumByTipo()` dentro de la misma transacción que escribe.
 *
 * El `Pick` de los dos repositorios es el mecanismo, no una prolijidad: al
 * pedir solo `findById` y `listarPorInsumo`, este caso de uso no puede —ni por
 * accidente ni por una edición futura distraída— tomar el advisory lock,
 * sumar la bitácora ni escribir en ella. Es la misma asimetría con la que
 * `ConsultarStockInsumoUseCase` recibe `sumByTipo` y no `lockAndSumByTipo`.
 *
 * **La existencia del insumo se valida ANTES de listar**, y no se deja que la
 * consulta devuelva vacío: una bitácora vacía y un insumo inexistente son
 * cosas distintas, y responder `200 []` para el segundo le afirmaría al
 * usuario que el insumo existe y nunca se movió. Es el mismo criterio que
 * `ConsultarStockInsumoUseCase` y que `ListarOperacionesCompraUseCase`: el
 * historial de un padre que no está es un 404, no una lista.
 *
 * Elegibilidad del insumo:
 *
 * - Existir y estar VIGENTE es obligatorio. La baja lógica cuenta como
 *   inexistencia: `findById()` no filtra por `deletedAt`.
 * - Estar HABILITADO NO se exige —por eso no se pasa `exigirHabilitado`—, con
 *   el mismo criterio que el stock y que la salida. Un insumo deshabilitado
 *   puede tener existencia en el depósito, y su historial es justo lo que hay
 *   que poder mirar para vaciarlo.
 *
 * El orden de las filas NO se decide acá: lo fija `listarPorInsumo()`
 * (`createdAt DESC, id DESC`), que es donde tiene que estar para que la
 * partición en páginas sea determinística. Reordenar la página en memoria
 * sería una segunda definición del orden, aplicada además solo a las filas
 * que ya vinieron.
 *
 * Sin gate propio de escritura: es una lectura del catálogo del tenant.
 */
export class ListarMovimientosInsumoUseCase {
  constructor(
    private readonly insumoRepo: Pick<IInsumoRepository, 'findById'>,
    private readonly movimientoRepo: Pick<IMovimientoInsumoRepository, 'listarPorInsumo'>,
  ) {}

  /**
   * @param insumoId Insumo cuya bitácora se lista.
   * @param dto Ventana pedida; el objeto vacío significa la primera página con
   *   el tamaño por defecto.
   * @returns La página de movimientos con el total del insumo y la ventana
   *   efectiva; o `InsumoNoEncontradoError` si el insumo no existe o está dado
   *   de baja.
   */
  async execute(
    insumoId: string,
    dto: ListarMovimientosInsumoDto = {},
  ): Promise<Result<ListarMovimientosInsumoResult, DomainError>> {
    const elegible = await validarInsumoElegible(this.insumoRepo, insumoId);

    if (elegible.isFail()) {
      return Result.fail(elegible.getError());
    }

    const insumo = elegible.getValue();
    const pagina = dto.pagina ?? PAGINA_DEFAULT;
    const porPagina = dto.porPagina ?? POR_PAGINA_DEFAULT;

    // El id sale de la entidad recién leída y no del argumento: es el valor
    // canónico que la base ya reconoció, mismo criterio que la consulta de
    // stock y que el registro de una salida.
    const { movimientos, total } = await this.movimientoRepo.listarPorInsumo(insumo.id, {
      limit: porPagina,
      // La traducción de página 1-indexed a offset vive acá y no en el puerto:
      // la persistencia habla de ventanas y el borde habla de páginas, y este
      // es el único lugar donde las dos formas se encuentran.
      offset: (pagina - 1) * porPagina,
    });

    return Result.ok({ items: movimientos, total, pagina, porPagina });
  }
}
