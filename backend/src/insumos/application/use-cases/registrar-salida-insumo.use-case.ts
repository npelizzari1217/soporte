import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { MovimientoInsumoEntity } from '../../domain/entities/movimiento-insumo.entity';
import {
  calcularSaldos,
  CONDICION_STOCK_POR_DEFECTO,
  CondicionStock,
} from '../../domain/entities/tipo-movimiento-insumo';
import {
  InsumoNoEncontradoError,
  StockInsuficienteError,
} from '../../domain/errors/insumos.errors';
import {
  SerialesNoCoincidenError,
  UnidadNoAdmitidaError,
  UnidadRequeridaError,
} from '../../domain/errors/unidades-insumo.errors';
import { IFamiliaInsumoRepository } from '../../domain/ports/i-familia-insumo.repository';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';
import { IMovimientoInsumoRepository } from '../../domain/ports/i-movimiento-insumo.repository';
import { OperacionesUnidadInsumo } from '../services/operaciones-unidad-insumo.service';
import {
  validarCondicionAdmitida,
  validarInsumoElegible,
} from '../services/validar-insumo.service';

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
  /** Condición del saldo que resta. Ausente equivale a `NUEVO`; `USADO` solo en repuestos. */
  condicion?: CondicionStock;
  /** Explicación opcional del asiento. Solo el AJUSTE la exige. */
  motivo?: string | null;
  /** A qué equipo fue lo que salió. Trazabilidad, no stock: no participa de la suma. */
  equipoId?: string | null;
  /** A qué sector fue lo que salió. Trazabilidad, no stock: hay UN solo stock. */
  sectorId?: string | null;
  /**
   * Unidad que sale, obligatoria si el insumo se sigue por `SERIE` (con serial:
   * la pendiente no sale, solo se da de baja por ajuste) y rechazada con
   * `UnidadNoAdmitidaError` si no.
   */
  unidadId?: string | null;
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
 * **Rama `SERIE` (ADR-5).** Lo PRIMERO que toca la transacción es L1
 * (`leerSeguimientoParaMovimiento`, `FOR SHARE`): el seguimiento de esa lectura
 * decide la rama y ningún otro lock se toma antes, así que el cambio de
 * seguimiento nunca espera acá teniendo L2. Con `SERIE` no se compara saldo:
 * `OperacionesUnidadInsumo.sacarDelDeposito` autoriza si la unidad elegida está
 * `EN_DEPOSITO`, con serial y en la condición pedida, y la deja `ENTREGADA`.
 * Rechaza con `UnidadNoDisponibleError`, no con `StockInsuficienteError`.
 *
 * La fórmula del saldo NO vive acá: `calcularSaldos()` la resuelve (compone `calcularStock()`) en el
 * dominio, para que la consulta que muestra el stock en la ficha del insumo
 * derive el mismo número que este caso de uso usa para autorizar.
 *
 * Ref design: openspec/changes/insumos-entrega-2/design.md, decisión 1.
 */
export class RegistrarSalidaInsumoUseCase {
  constructor(
    private readonly insumoRepo: Pick<
      IInsumoRepository,
      'findById' | 'leerSeguimientoParaMovimiento'
    >,
    private readonly movimientoRepo: Pick<
      IMovimientoInsumoRepository,
      'insert' | 'lockAndSumByTipo'
    >,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
    private readonly familiaRepo: Pick<IFamiliaInsumoRepository, 'findById'>,
    private readonly operaciones: Pick<OperacionesUnidadInsumo, 'sacarDelDeposito'>,
  ) {}

  /**
   * @param dto Datos de la salida, con el `usuarioId` ya resuelto por el borde.
   * @returns El movimiento asentado; `InsumoNoEncontradoError` si el insumo no
   *   existe o está dado de baja; o `StockInsuficienteError` si el depósito no
   *   tiene con qué cubrir la cantidad pedida; y con `SERIE`, `UnidadRequeridaError`,
   *   `SerialesNoCoincidenError` (la cantidad no es 1) o `UnidadNoDisponibleError`.
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

    // La condición se valida ANTES de la transacción, con el mismo criterio que
    // las precondiciones del asiento: no depende del stock y no justifica tomar
    // el lock del insumo para rechazar.
    const condicion = dto.condicion ?? CONDICION_STOCK_POR_DEFECTO;
    const admitida = await validarCondicionAdmitida(this.familiaRepo, insumo, condicion);

    if (admitida.isFail()) {
      return Result.fail(admitida.getError());
    }

    // El movimiento se construye ANTES de entrar a la sección crítica: sus
    // precondiciones —cantidad finita, positiva, en escala, y motivo dentro
    // del tope— no dependen del stock, y evaluarlas adentro tomaría el lock
    // del insumo para hacer esperar al resto de los escritores por un asiento
    // que ni siquiera puede existir. El id sale de la entidad recién leída y
    // no del DTO: es el valor canónico que la base ya reconoció.
    const movimiento = MovimientoInsumoEntity.create({
      insumoId: insumo.id,
      tipo: 'SALIDA',
      condicion,
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
      // L1 primero (ADR-5): el `seguimiento` de esta lectura decide la rama.
      const seguimiento = await this.insumoRepo.leerSeguimientoParaMovimiento(asiento.insumoId);
      if (seguimiento === null) {
        return Result.fail<MovimientoInsumoEntity, DomainError>(
          new InsumoNoEncontradoError(asiento.insumoId),
        );
      }

      if (seguimiento === 'NINGUNO' && dto.unidadId != null) {
        return Result.fail<MovimientoInsumoEntity, DomainError>(
          new UnidadNoAdmitidaError(asiento.insumoId),
        );
      }

      if (seguimiento === 'SERIE') {
        if (dto.unidadId == null) {
          return Result.fail<MovimientoInsumoEntity, DomainError>(
            new UnidadRequeridaError(asiento.insumoId),
          );
        }
        // Una unidad es una pieza: la cantidad solo puede ser 1.
        if (dto.cantidad !== 1) {
          return Result.fail<MovimientoInsumoEntity, DomainError>(
            new SerialesNoCoincidenError(dto.cantidad, 1),
          );
        }
        const sacada = await this.operaciones.sacarDelDeposito(asiento.insumoId, [dto.unidadId], {
          tipo: 'SALIDA',
          usuarioId: dto.usuarioId,
          motivo: dto.motivo,
          // Solo si el caller la pidió: la omisión NO equivale a `NUEVO` acá.
          condicion: dto.condicion,
          equipoId: dto.equipoId,
          sectorId: dto.sectorId,
        });
        return sacada.isFail()
          ? Result.fail<MovimientoInsumoEntity, DomainError>(sacada.getError())
          : Result.ok<MovimientoInsumoEntity, DomainError>(sacada.getValue()[0].movimiento);
      }

      // Desde acá y hasta el commit, nadie más puede evaluar el stock de este
      // insumo: el advisory lock lo toma `lockAndSumByTipo()` y se libera solo
      // al cerrar la transacción. La lectura va ANTES del insert porque leer
      // después mediría un stock que ya incluye la salida en evaluación.
      const sumas = await this.movimientoRepo.lockAndSumByTipo(asiento.insumoId);
      // El saldo que se compara es el de la condición del asiento: un USADO no
      // cubre una salida NUEVO ni al revés.
      const disponible = calcularSaldos(sumas)[asiento.condicion];

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

      // El asentado, NO `asiento`: issue #159 — `insert()` devuelve el
      // asiento con el `createdAt` que realmente le puso la base, que puede
      // diferir del reloj del proceso con el que se construyó acá arriba.
      const asentado = await this.movimientoRepo.insert(asiento);

      return Result.ok<MovimientoInsumoEntity, DomainError>(asentado);
    });
  }
}
