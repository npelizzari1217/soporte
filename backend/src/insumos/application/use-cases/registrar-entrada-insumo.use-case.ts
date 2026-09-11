import { DomainError, Result } from '../../../shared/domain/result';
import { MovimientoInsumoEntity } from '../../domain/entities/movimiento-insumo.entity';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';
import { IMovimientoInsumoRepository } from '../../domain/ports/i-movimiento-insumo.repository';
import { validarInsumoElegible } from '../services/validar-insumo.service';

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
}

/**
 * RegistrarEntradaInsumoUseCase — asienta una ENTRADA en la bitácora de
 * existencias de un insumo: entró tal cantidad al depósito, la registró tal
 * persona.
 *
 * **NO abre transacción ni toma el advisory lock del stock, a propósito.** El
 * lock existe para una sola invariante —que el stock no quede negativo— y esa
 * invariante solo la pueden violar los movimientos que RESTAN. Una entrada
 * suma: no hay decisión que tomar bajo la sección crítica, y no hay nada que
 * revertir, porque la operación es un único `INSERT` de una fila, ya atómico
 * por sí mismo. Tomar el lock igual no sería gratis en ningún sentido: pagaría
 * el `GROUP BY` de toda la bitácora del insumo —un agregado que crece con el
 * historial— para no decidir nada, y haría esperar a las salidas del mismo
 * insumo detrás de cada recepción.
 *
 * La carrera que esto deja abierta es inofensiva y conviene decirla: una
 * entrada que comitea mientras una salida evalúa bajo el lock hace que la
 * salida vea MENOS stock del que hay, así que a lo sumo rechaza una salida que
 * habría entrado. Nunca al revés.
 *
 * **Para los movimientos que RESTAN el lock NO es opcional**: tienen que leer
 * las sumas y decidir DENTRO de la misma transacción que después inserta (ver
 * `IMovimientoInsumoRepository.lockAndSumByTipo`). `RegistrarSalidaInsumoUseCase`
 * ya lo hace así y es el modelo a seguir para el `AJUSTE_NEGATIVO`. Que la
 * entrada reciba un `Pick` sin `lockAndSumByTipo` no es prolijidad: es lo que
 * hace que este caso de uso NO PUEDA tomar el lock por descuido ni saltearlo
 * el que sí lo necesita — el método directamente no está en su tipo.
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
    private readonly insumoRepo: Pick<IInsumoRepository, 'findById'>,
    private readonly movimientoRepo: Pick<IMovimientoInsumoRepository, 'insert'>,
  ) {}

  /**
   * @param dto Datos de la entrada, con el `usuarioId` ya resuelto por el borde
   *   y el `itemCompraId` presente solo si la entrada nace de una recepción.
   * @returns El movimiento asentado, o `InsumoNoEncontradoError` si el insumo
   *   no existe o está dado de baja, o `InsumoDeshabilitadoError` si está
   *   deshabilitado y la entrada es manual.
   * @throws Error si la cantidad no es finita, no es positiva, pasa el techo de
   *   negocio o tiene más decimales que la columna, o si el motivo excede su
   *   tope de largo: son violaciones de contrato del caller que el borde
   *   rechaza con un 400 que nombra el campo, no desviaciones de negocio.
   */
  async execute(
    dto: RegistrarEntradaInsumoDto,
  ): Promise<Result<MovimientoInsumoEntity, DomainError>> {
    // `== null` cubre el ausente y el nulo con una sola comparación: las dos
    // formas significan "carga manual". Preguntar por la PRESENCIA de la clave
    // —`'itemCompraId' in dto`— le abriría el salteo a quien mandara el campo
    // en `null`, que es justo la entrada manual escrita de la forma larga.
    const vieneDeUnaRecepcion = dto.itemCompraId != null;

    const elegible = await validarInsumoElegible(this.insumoRepo, dto.insumoId, {
      exigirHabilitado: !vieneDeUnaRecepcion,
    });

    if (elegible.isFail()) {
      return Result.fail(elegible.getError());
    }

    const insumo = elegible.getValue();

    // El id sale de la entidad recién leída y no del DTO: es el valor
    // canónico que la base ya reconoció como fila existente.
    const movimiento = MovimientoInsumoEntity.create({
      insumoId: insumo.id,
      tipo: 'ENTRADA',
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
