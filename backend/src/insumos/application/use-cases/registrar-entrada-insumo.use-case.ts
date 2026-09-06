import { DomainError, Result } from '../../../shared/domain/result';
import { MovimientoInsumoEntity } from '../../domain/entities/movimiento-insumo.entity';
import {
  InsumoDeshabilitadoError,
  InsumoNoEncontradoError,
} from '../../domain/errors/insumos.errors';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';
import { IMovimientoInsumoRepository } from '../../domain/ports/i-movimiento-insumo.repository';

/**
 * DTO de entrada de `RegistrarEntradaInsumoUseCase`.
 *
 * El `usuarioId` NO se deriva acá: lo estampa el borde a partir del usuario
 * autenticado (`sub` del JWT), igual que `CrearCompraDto.solicitanteId`. La
 * capa de aplicación lo copia tal cual a la bitácora — si lo inventara, la
 * respuesta a "quién lo movió" sería la del proceso, no la de la persona.
 *
 * Los tres campos opcionales admiten el ausente además del nulo, porque el
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
 * **Al copiar este archivo para escribir la SALIDA o el AJUSTE_NEGATIVO, el
 * lock NO es opcional**: esos sí restan, tienen que leer las sumas y decidir
 * DENTRO de la misma transacción que después inserta (ver
 * `IMovimientoInsumoRepository.lockAndSumByTipo`). Que la entrada reciba un
 * `Pick` sin `lockAndSumByTipo` no es prolijidad: es lo que hace que este caso
 * de uso NO PUEDA tomar el lock por descuido ni saltearlo el que sí lo
 * necesita — el método directamente no está en su tipo.
 *
 * Dos reglas de elegibilidad, en este orden:
 *
 * 1. El insumo tiene que existir y estar VIGENTE. `findById()` no filtra por
 *    `deletedAt`, así que la fila dada de baja vuelve igual y hay que
 *    descartarla acá — mismo criterio que `validarFamiliaInsumoElegible`.
 * 2. El insumo tiene que estar HABILITADO. Ver `InsumoDeshabilitadoError`: la
 *    restricción vale SOLO para la entrada, no para la salida ni el ajuste.
 *
 * El orden importa: la baja lógica gana sobre el deshabilitado, porque
 * pedirle a quien carga que habilite un insumo dado de baja lo manda a
 * arreglar un estado que no alcanza.
 */
export class RegistrarEntradaInsumoUseCase {
  constructor(
    private readonly insumoRepo: Pick<IInsumoRepository, 'findById'>,
    private readonly movimientoRepo: Pick<IMovimientoInsumoRepository, 'insert'>,
  ) {}

  /**
   * @param dto Datos de la entrada, con el `usuarioId` ya resuelto por el borde.
   * @returns El movimiento asentado, o `InsumoNoEncontradoError` si el insumo
   *   no existe o está dado de baja, o `InsumoDeshabilitadoError` si está
   *   deshabilitado.
   * @throws Error si la cantidad no es finita, no es positiva, pasa el techo de
   *   negocio o tiene más decimales que la columna, o si el motivo excede su
   *   tope de largo: son violaciones de contrato del caller que el borde
   *   rechaza con un 400 que nombra el campo, no desviaciones de negocio.
   */
  async execute(
    dto: RegistrarEntradaInsumoDto,
  ): Promise<Result<MovimientoInsumoEntity, DomainError>> {
    const insumo = await this.insumoRepo.findById(dto.insumoId);

    if (!insumo || insumo.isDeleted()) {
      return Result.fail(new InsumoNoEncontradoError(dto.insumoId));
    }

    if (!insumo.activo) {
      return Result.fail(new InsumoDeshabilitadoError(dto.insumoId));
    }

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
    });

    // Hoy este camino es inalcanzable para la ENTRADA: el único `Result.fail`
    // de `create()` es el ajuste sin motivo. Se propaga igual y no se
    // desempaqueta con un `getValue()` optimista porque cuesta tres líneas y
    // es lo que evita que una regla de negocio nueva en la entidad llegue al
    // usuario como un 500 en lugar del 422 que le corresponde.
    if (movimiento.isFail()) {
      return Result.fail(movimiento.getError());
    }

    await this.movimientoRepo.insert(movimiento.getValue());

    return Result.ok(movimiento.getValue());
  }
}
