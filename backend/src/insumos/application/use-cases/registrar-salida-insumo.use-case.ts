import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { MovimientoInsumoEntity } from '../../domain/entities/movimiento-insumo.entity';
import { calcularStock } from '../../domain/entities/tipo-movimiento-insumo';
import { StockInsuficienteError } from '../../domain/errors/insumos.errors';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';
import { IMovimientoInsumoRepository } from '../../domain/ports/i-movimiento-insumo.repository';
import { validarInsumoElegible } from '../services/validar-insumo.service';

/**
 * DTO de entrada de `RegistrarSalidaInsumoUseCase`. Misma forma que el de la
 * ENTRADA, y a propósito: es el mismo asiento con otro tipo.
 *
 * El `usuarioId` NO se deriva acá: lo estampa el borde a partir del usuario
 * autenticado (`sub` del JWT). La capa de aplicación lo copia tal cual a la
 * bitácora — si lo inventara, la respuesta a "quién lo movió" sería la del
 * proceso, no la de la persona.
 */
export interface RegistrarSalidaInsumoDto {
  insumoId: string;
  /** Siempre positiva: el signo lo da el tipo del movimiento, no el número. */
  cantidad: number;
  /** Quién registra el movimiento. Lo pone el borde desde el usuario autenticado. */
  usuarioId: string;
  /** Explicación opcional del asiento. Solo el AJUSTE la exige. */
  motivo?: string | null;
  /** A qué equipo fue lo que salió. Trazabilidad, no stock: no participa de la suma. */
  equipoId?: string | null;
  /** A qué sector fue lo que salió. Trazabilidad, no stock: hay UN solo stock. */
  sectorId?: string | null;
}

/**
 * RegistrarSalidaInsumoUseCase — asienta una SALIDA en la bitácora de
 * existencias de un insumo: salió tal cantidad del depósito, la retiró tal
 * persona, y quedaba con qué.
 *
 * **ABRE TRANSACCIÓN Y TOMA EL ADVISORY LOCK, y eso NO es opcional acá.** La
 * salida RESTA, así que es de los movimientos que pueden dejar el stock
 * negativo — la única invariante que la bitácora existe para proteger. Leer
 * las sumas y escribir el asiento tienen que ocurrir DENTRO de la misma
 * transacción (`ITenantTransactionRunner.run`): fuera de ella Postgres abre
 * una transacción implícita por sentencia, `pg_advisory_xact_lock` se libera
 * apenas termina la lectura, y dos salidas simultáneas del mismo insumo verían
 * las MISMAS sumas y pasarían las dos. El repositorio no confía en que esto se
 * cumpla: `lockAndSumByTipo()` lanza si no hay transacción activa.
 *
 * Es la diferencia exacta con `RegistrarEntradaInsumoUseCase`, que a propósito
 * NO recibe `lockAndSumByTipo` en su `Pick` —una entrada suma y no decide
 * nada—. Acá el `Pick` se ensancha a `'insert' | 'lockAndSumByTipo'`, y esa
 * asimetría es el mecanismo: cada caso de uso puede hacer exactamente lo que
 * su invariante necesita, ni más ni menos.
 *
 * **No hay backstop de base para el stock negativo**: Postgres no puede
 * expresar `SUM(cantidad) >= 0` sobre varias filas, así que la invariante
 * depende de que toda escritura que reste pase por este punto (decisión 1 del
 * diseño, dicha y no escondida).
 *
 * Elegibilidad del insumo, resuelta ANTES de abrir la transacción porque no
 * necesita el lock:
 *
 * - Existir y estar VIGENTE es obligatorio. La baja lógica cuenta como
 *   inexistencia: `findById()` no filtra por `deletedAt`.
 * - Estar HABILITADO NO se exige, a diferencia de la entrada. Una salida sobre
 *   un insumo deshabilitado es consumir lo que quedó en el depósito —justo lo
 *   que se espera después de retirarlo de circulación—; rechazarla dejaría ese
 *   stock atrapado, sin forma de llegar a cero salvo rehabilitando el insumo o
 *   asentando un ajuste que mentiría sobre lo que pasó.
 *
 * La fórmula del saldo NO vive acá: `calcularStock()` la resuelve en el
 * dominio, para que la consulta que muestra el stock en la ficha del insumo
 * derive el mismo número que este caso de uso usa para autorizar.
 *
 * Ref design: openspec/changes/insumos-entrega-2/design.md, decisión 1.
 */
export class RegistrarSalidaInsumoUseCase {
  constructor(
    private readonly insumoRepo: Pick<IInsumoRepository, 'findById'>,
    private readonly movimientoRepo: Pick<
      IMovimientoInsumoRepository,
      'insert' | 'lockAndSumByTipo'
    >,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
  ) {}

  /**
   * @param dto Datos de la salida, con el `usuarioId` ya resuelto por el borde.
   * @returns El movimiento asentado; `InsumoNoEncontradoError` si el insumo no
   *   existe o está dado de baja; o `StockInsuficienteError` si el depósito no
   *   tiene con qué cubrir la cantidad pedida.
   * @throws Error si la cantidad no es finita, no es positiva, pasa el techo de
   *   negocio o tiene más decimales que la columna, o si el motivo excede su
   *   tope de largo: son violaciones de contrato del caller que el borde
   *   rechaza con un 400 que nombra el campo, no desviaciones de negocio.
   */
  async execute(
    dto: RegistrarSalidaInsumoDto,
  ): Promise<Result<MovimientoInsumoEntity, DomainError>> {
    const elegible = await validarInsumoElegible(this.insumoRepo, dto.insumoId);

    if (elegible.isFail()) {
      return Result.fail(elegible.getError());
    }

    const insumo = elegible.getValue();

    // El movimiento se construye ANTES de entrar a la sección crítica: sus
    // precondiciones —cantidad finita, positiva, en escala, y motivo dentro
    // del tope— no dependen del stock, y evaluarlas adentro tomaría el lock
    // del insumo para hacer esperar al resto de los escritores por un asiento
    // que ni siquiera puede existir. El id sale de la entidad recién leída y
    // no del DTO: es el valor canónico que la base ya reconoció.
    const movimiento = MovimientoInsumoEntity.create({
      insumoId: insumo.id,
      tipo: 'SALIDA',
      cantidad: dto.cantidad,
      usuarioId: dto.usuarioId,
      motivo: dto.motivo,
      equipoId: dto.equipoId,
      sectorId: dto.sectorId,
    });

    // Hoy este camino es inalcanzable para la SALIDA: el único `Result.fail`
    // de `create()` es el ajuste sin motivo. Se propaga igual y no se
    // desempaqueta con un `getValue()` optimista porque cuesta tres líneas y
    // es lo que evita que una regla de negocio nueva en la entidad llegue al
    // usuario como un 500 en lugar del 422 que le corresponde.
    if (movimiento.isFail()) {
      return Result.fail(movimiento.getError());
    }

    const asiento = movimiento.getValue();

    return this.txRunner.run(async () => {
      // Desde acá y hasta el commit, nadie más puede evaluar el stock de este
      // insumo: el advisory lock lo toma `lockAndSumByTipo()` y se libera solo
      // al cerrar la transacción. La lectura va ANTES del insert porque leer
      // después mediría un stock que ya incluye la salida en evaluación.
      const sumas = await this.movimientoRepo.lockAndSumByTipo(asiento.insumoId);
      const disponible = calcularStock(sumas);

      // El límite es el saldo EXACTO: sacar todo lo que hay deja el stock en
      // cero, que no es negativo, y vaciar el depósito es una operación
      // legítima. Solo se rechaza lo que dejaría el saldo por debajo de cero.
      if (disponible < asiento.cantidad) {
        // Un `Result.fail` no revierte la transacción —no es un `throw`—, y no
        // hace falta que lo haga: hasta acá no se escribió ninguna fila. Lo
        // único que la transacción sostenía era el lock, y el `run()` lo
        // libera al cerrar igual.
        return Result.fail<MovimientoInsumoEntity, DomainError>(
          new StockInsuficienteError(asiento.insumoId, asiento.cantidad, disponible),
        );
      }

      await this.movimientoRepo.insert(asiento);

      return Result.ok<MovimientoInsumoEntity, DomainError>(asiento);
    });
  }
}
