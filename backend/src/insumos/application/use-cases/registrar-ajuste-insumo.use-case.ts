import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { MovimientoInsumoEntity } from '../../domain/entities/movimiento-insumo.entity';
import {
  calcularSaldos,
  DIRECCION_POR_TIPO_MOVIMIENTO,
  TipoAjusteInsumo,
} from '../../domain/entities/tipo-movimiento-insumo';
import { StockInsuficienteError } from '../../domain/errors/insumos.errors';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';
import { IMovimientoInsumoRepository } from '../../domain/ports/i-movimiento-insumo.repository';
import { validarInsumoElegible } from '../services/validar-insumo.service';

/**
 * DTO de entrada de `RegistrarAjusteInsumoUseCase`. Misma forma que los de la
 * ENTRADA y la SALIDA salvo por dos campos, y las dos diferencias son reglas
 * de negocio expresadas en el tipo:
 *
 * - `tipo` es `TipoAjusteInsumo`, no `TipoMovimientoInsumo`: el borde NO puede
 *   mandar una `ENTRADA` por acá ni por descuido — el compilador lo rechaza.
 * - `motivo` es OBLIGATORIO de negocio, pero el campo sigue siendo opcional en
 *   el tipo, igual que en la ENTRADA y en la SALIDA. Declararlo requerido acá
 *   se probó y se descartó: el tipo solo puede exigir PRESENCIA, no contenido
 *   —un `'   '` lo conforma igual—, así que la regla necesita a
 *   `MovimientoInsumoEntity.create()` de todas formas, y lo único que el campo
 *   requerido agregaba era volver INEXPRESABLE el caso del motivo ausente:
 *   ni el spec podía construirlo, ni un body HTTP sin la clave —que es como
 *   llega de verdad— tenía dónde caer. Un guard que no se puede probar es un
 *   guard que no protege.
 *
 * El `usuarioId` NO se deriva acá: lo estampa el borde a partir del usuario
 * autenticado (`sub` del JWT). La capa de aplicación lo copia tal cual a la
 * bitácora — si lo inventara, la respuesta a "quién lo movió" sería la del
 * proceso, no la de la persona.
 */
export interface RegistrarAjusteInsumoDto {
  insumoId: string;
  /** En qué dirección corrige el ajuste. Las dos comparten el gate `INSUMOS:AJUSTAR`. */
  tipo: TipoAjusteInsumo;
  /** Siempre positiva: el signo lo da el tipo del movimiento, no el número. */
  cantidad: number;
  /** Quién registra el movimiento. Lo pone el borde desde el usuario autenticado. */
  usuarioId: string;
  /** Explicación del asiento. OBLIGATORIA de negocio en los dos ajustes: sin ella no hay auditoría. */
  motivo?: string | null;
  /** Trazabilidad, no stock: no participa de la suma. */
  equipoId?: string | null;
  /** Trazabilidad, no stock: hay UN solo stock, no uno por sector. */
  sectorId?: string | null;
}

/**
 * RegistrarAjusteInsumoUseCase — asienta un AJUSTE en la bitácora de
 * existencias de un insumo: el conteo físico no coincidió con lo registrado,
 * y esta es la corrección, con su explicación y su firma.
 *
 * **UN solo caso de uso para las DOS direcciones, y el motivo no es ahorrar
 * código.** El diseño lo dice con todas las letras: `AJUSTE_POSITIVO` y
 * `AJUSTE_NEGATIVO` "son la misma operación de negocio con distinto signo, no
 * dos operaciones" — comparten el gate `INSUMOS:AJUSTAR`, exigen las dos el
 * motivo y salen del mismo conteo físico. El dominio ya construyó
 * `TIPOS_AJUSTE_INSUMO` y `esAjuste()` para que sus reglas se apliquen a las
 * dos "sin enumerarlas a mano en cada lugar, que es como se desincronizan";
 * partir la aplicación en dos clases nombradas por cada literal sería
 * reintroducir esa enumeración en la capa de arriba, y obligaría además al
 * borde a elegir con un `switch` sobre el `tipo` del body.
 *
 * **LA TRANSACCIÓN Y EL LOCK SON INCONDICIONALES, y ahí está el punto.** La
 * objeción real contra un caso de uso único es que recibir el `Pick` ancho
 * —con `lockAndSumByTipo`— devolvería la toma del lock al terreno de las
 * decisiones de runtime, justo lo que la asimetría de `Pick` entre la ENTRADA
 * y la SALIDA existe para impedir. La objeción se disuelve no eligiendo:
 * los dos ajustes abren la transacción y toman el lock SIEMPRE, así que este
 * caso de uso no tiene ninguna rama de la que dependa la invariante del stock
 * — el `Pick` ancho describe exactamente lo que hace, en los dos tipos, y no
 * hay nada que "saltear por descuido". El compilador sigue impidiendo lo que
 * impedía: la ENTRADA no puede tomar el lock porque no lo tiene en su tipo.
 *
 * Lo único que se decide por dirección es la COMPARACIÓN de stock, y se decide
 * consultando `DIRECCION_POR_TIPO_MOVIMIENTO` en vez de comparar contra los
 * literales: solo los movimientos que RESTAN pueden dejar el saldo negativo.
 * Una dirección nueva queda cubierta por construcción, igual que en
 * `calcularStock()`.
 *
 * **Qué cuesta esa decisión, dicho y no escondido.** El `AJUSTE_POSITIVO` paga
 * el `GROUP BY` de toda la bitácora del insumo y serializa contra los demás
 * escritores del mismo insumo, sin necesitarlo: suma, así que no puede dejar
 * el stock negativo. Se acepta porque el ajuste es una operación de
 * administración de baja frecuencia —sale de un conteo físico, exige motivo y
 * está detrás de su propio permiso—, no el camino diario del técnico, que es
 * la SALIDA. El argumento que la ENTRADA usa para NO tomar el lock es de
 * frecuencia: una recepción de compra ocurre seguido y haría esperar a las
 * salidas. Un ajuste, no.
 *
 * Descartado explícitamente:
 *
 * - **Dos casos de uso, uno por dirección.** Conserva el `Pick` angosto para
 *   el positivo, pero duplica la validación de elegibilidad y el armado del
 *   asiento, contradice la decisión de diseño de que es UNA operación, y
 *   traslada al borde la enumeración de los tipos.
 * - **Un caso de uso con el lock condicional** (`if` sobre la dirección antes
 *   de abrir la transacción). Es la peor de las tres: deja la invariante del
 *   stock colgando de una rama de runtime cuya omisión NO se nota —el ajuste
 *   negativo seguiría funcionando, solo dejaría de estar serializado— y solo
 *   un test podría atajarla.
 *
 * Elegibilidad del insumo, resuelta ANTES de abrir la transacción porque no
 * necesita el lock:
 *
 * - Existir y estar VIGENTE es obligatorio. La baja lógica cuenta como
 *   inexistencia: `findById()` no filtra por `deletedAt`.
 * - Estar HABILITADO NO se exige, igual que en la SALIDA y a diferencia de la
 *   ENTRADA. Ajustar un insumo deshabilitado es corregir el conteo de lo que
 *   quedó en el depósito; rechazarlo dejaría ese stock atrapado (ver
 *   `InsumoDeshabilitadoError`, cuyo mensaje ya lo dice).
 *
 * La regla del motivo obligatorio NO se duplica acá: vive en
 * `MovimientoInsumoEntity.create()`, que devuelve `MotivoAjusteRequeridoError`,
 * y este caso de uso propaga ese `Result`. Un segundo dueño de la misma regla
 * es un dueño que va a derivar.
 *
 * Ref design: openspec/changes/insumos-entrega-2/design.md, decisiones 1, 3 y 4.
 */
export class RegistrarAjusteInsumoUseCase {
  constructor(
    private readonly insumoRepo: Pick<IInsumoRepository, 'findById'>,
    private readonly movimientoRepo: Pick<
      IMovimientoInsumoRepository,
      'insert' | 'lockAndSumByTipo'
    >,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
  ) {}

  /**
   * @param dto Datos del ajuste, con el `usuarioId` ya resuelto por el borde.
   * @returns El movimiento asentado; `InsumoNoEncontradoError` si el insumo no
   *   existe o está dado de baja; `MotivoAjusteRequeridoError` si el motivo no
   *   tiene contenido; o `StockInsuficienteError` si un `AJUSTE_NEGATIVO`
   *   dejaría el saldo por debajo de cero.
   * @throws Error si la cantidad no es finita, no es positiva, pasa el techo de
   *   negocio o tiene más decimales que la columna, o si el motivo excede su
   *   tope de largo: son violaciones de contrato del caller que el borde
   *   rechaza con un 400 que nombra el campo, no desviaciones de negocio.
   */
  async execute(
    dto: RegistrarAjusteInsumoDto,
  ): Promise<Result<MovimientoInsumoEntity, DomainError>> {
    const elegible = await validarInsumoElegible(this.insumoRepo, dto.insumoId);

    if (elegible.isFail()) {
      return Result.fail(elegible.getError());
    }

    const insumo = elegible.getValue();

    // El movimiento se construye ANTES de entrar a la sección crítica: sus
    // reglas —cantidad finita, positiva, en escala, motivo con contenido y
    // dentro del tope— no dependen del stock, y evaluarlas adentro tomaría el
    // lock del insumo para hacer esperar al resto de los escritores por un
    // asiento que ni siquiera puede existir. El id sale de la entidad recién
    // leída y no del DTO: es el valor canónico que la base ya reconoció.
    const movimiento = MovimientoInsumoEntity.create({
      insumoId: insumo.id,
      tipo: dto.tipo,
      cantidad: dto.cantidad,
      usuarioId: dto.usuarioId,
      motivo: dto.motivo,
      equipoId: dto.equipoId,
      sectorId: dto.sectorId,
    });

    // Acá SÍ es un camino alcanzable, a diferencia de la ENTRADA y la SALIDA:
    // es el ajuste sin motivo, que es la única regla que `create()` devuelve
    // como `Result`, y en este caso de uso es la regla central.
    if (movimiento.isFail()) {
      return Result.fail(movimiento.getError());
    }

    const asiento = movimiento.getValue();

    return this.txRunner.run(async () => {
      // Desde acá y hasta el commit, nadie más puede evaluar el stock de este
      // insumo: el advisory lock lo toma `lockAndSumByTipo()` y se libera solo
      // al cerrar la transacción. La lectura va ANTES del insert porque leer
      // después mediría un stock que ya incluye el ajuste en evaluación.
      const sumas = await this.movimientoRepo.lockAndSumByTipo(asiento.insumoId);
      // Hasta que la condición se elija por operación, NUEVO es la única que se escribe.
      // Hasta que la condición se elija por operación, NUEVO es la única que se escribe.
      const disponible = calcularSaldos(sumas).NUEVO;

      // Solo la dirección que RESTA puede dejar el saldo negativo, y la
      // pregunta se le hace a la tabla del dominio en vez de compararla contra
      // el literal `AJUSTE_NEGATIVO`: es la misma fuente de verdad que usa
      // `calcularStock()`, así que las dos no pueden discrepar sobre el signo
      // de un tipo. El límite es el saldo EXACTO —dejar el depósito en cero es
      // un resultado legítimo del conteo físico—, así que se rechaza solo lo
      // que quedaría por debajo.
      const resta = DIRECCION_POR_TIPO_MOVIMIENTO[asiento.tipo] === -1;

      if (resta && disponible < asiento.cantidad) {
        // Un `Result.fail` no revierte la transacción —no es un `throw`—, y no
        // hace falta que lo haga: hasta acá no se escribió ninguna fila. Lo
        // único que la transacción sostenía era el lock, y el `run()` lo
        // libera al cerrar igual.
        return Result.fail<MovimientoInsumoEntity, DomainError>(
          new StockInsuficienteError(asiento.insumoId, asiento.cantidad, disponible),
        );
      }

      // El asentado, NO `asiento`: issue #159 — `insert()` devuelve el
      // asiento con el `createdAt` que realmente le puso la base, que puede
      // diferir del reloj del proceso con el que se construyó acá arriba.
      const asentado = await this.movimientoRepo.insert(asiento);

      return Result.ok<MovimientoInsumoEntity, DomainError>(asentado);
    });
  }
}
