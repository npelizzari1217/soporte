import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { BaseTicketStateMachine } from '../../../tickets/domain/state-machine/base-ticket-state-machine';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../../tickets/domain/ports/i-operacion-ticket.repository';
import { IEstadoRepository } from '../../../tickets/domain/ports/i-estado.repository';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import {
  TicketNoEncontradoError,
  TransicionInvalidaError,
} from '../../../tickets/domain/errors/tickets.errors';
import { TicketCompraEntity } from '../../domain/entities/ticket-compra.entity';
import { ITicketCompraRepository } from '../../domain/ports/i-ticket-compra.repository';
import {
  CompraNoEncontradaError,
  MotivoRechazoRequeridoError,
} from '../../domain/errors/compras.errors';

/** Máquina de estados BASE (ADR-2): sin máquina custom para COMPRAS. */
const stateMachine = new BaseTicketStateMachine();

/** DTO de entrada para rechazar una compra (F3-C5). `aprobadoPorId` = JWT.sub. */
export interface RechazarCompraDto {
  /** UUID del ticket de compra a rechazar. */
  ticketId: string;
  /** UUID del actor que rechaza (soft ref → master.usuarios; extraído del JWT). */
  aprobadoPorId: string;
  /** Texto explicativo del rechazo. Obligatorio, no vacío. */
  motivoRechazo: string;
}

/**
 * RechazarCompraUseCase — rechaza un ticket de compra en un solo paso
 * (F3-C5, ADR-1, ADR-2).
 *
 * A diferencia de `AprobarCompraUseCase`, el rechazo SÍ transiciona el
 * `Ticket` base a CANCELADO — arco válido de la máquina BASE
 * (`BaseTicketStateMachine`, ADR-2: sin máquina custom para COMPRAS),
 * reusada directamente sin pasar por `TicketStateMachineFactory`.
 *
 * Flujo:
 * 1. Valida `motivoRechazo` no vacío (fail-fast, sin tocar la DB).
 * 2. Carga el ticket → `TicketNoEncontradoError` (404) si no existe/eliminado.
 * 3. Busca el satélite `ticket_compra` → `CompraNoEncontradaError` si no existe.
 * 4. Resuelve el estado ACTUAL y el estado CANCELADO del catálogo (FIJOS —
 *    su ausencia es un fallo de infraestructura, `throw` defensivo).
 * 5. Doble validación de la transición (mismo criterio que
 *    `TransicionarEstadoUseCase`): invariantes de la ENTIDAD
 *    (`ticket.canTransitionTo`) Y el grafo de arcos de la máquina base. Si
 *    cualquiera rechaza → `TransicionInvalidaError` (422), sin mutar nada.
 * 6. `ticketCompra.rechazar(...)` — falla con `CompraYaDecididaError` (ya
 *    decidida) o `MotivoRechazoRequeridoError` (defensa adicional a la del
 *    paso 1).
 * 7. Resuelve `tipo_operacion` RECHAZO (catálogo FIJO sembrado en PR1).
 * 8. **DENTRO de la transacción**: transiciona el ticket a CANCELADO,
 *    persiste ticket + satélite decidido, y registra la operación RECHAZO
 *    en el timeline.
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C5. Ref design: ADR-1, ADR-2.
 * Tarea: T5.3, T5.4.
 */
export class RechazarCompraUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'save'>,
    private readonly ticketCompraRepo: Pick<ITicketCompraRepository, 'findByTicketId' | 'save'>,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'save'>,
    private readonly estadoRepo: Pick<IEstadoRepository, 'findById' | 'findByCodigo'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(
    dto: RechazarCompraDto,
  ): Promise<Result<{ ticket: TicketEntity; ticketCompra: TicketCompraEntity }, DomainError>> {
    // 1. Fail-fast: motivo obligatorio, sin tocar la DB.
    if (!dto.motivoRechazo || dto.motivoRechazo.trim() === '') {
      return Result.fail(new MotivoRechazoRequeridoError());
    }

    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (!ticket || ticket.isDeleted()) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }

    const ticketCompra = await this.ticketCompraRepo.findByTicketId(ticket.id);
    if (!ticketCompra) {
      return Result.fail(new CompraNoEncontradaError(ticket.id));
    }

    // Catálogos FIJOS garantizados por el seed — su ausencia es un bug de
    // infraestructura, no un error del caller: throw defensivo.
    const estadoActual = await this.estadoRepo.findById(ticket.estadoId);
    if (!estadoActual) {
      throw new Error(
        `Catálogo de estados inconsistente: no existe el estado con id "${ticket.estadoId}" en el tenant activo.`,
      );
    }
    const estadoCancelado = await this.estadoRepo.findByCodigo('CANCELADO');
    if (!estadoCancelado) {
      throw new Error(
        'Catálogo de estados inconsistente: no existe el estado "CANCELADO" en el tenant activo.',
      );
    }

    // Doble validación (mismo criterio que TransicionarEstadoUseCase):
    // invariantes de la ENTIDAD + arco válido de la máquina base (ADR-2).
    const entidadPermite = ticket.canTransitionTo(estadoActual.codigo, 'CANCELADO');
    const arcoValido = stateMachine.puedeTransicionar(estadoActual.codigo, 'CANCELADO', {});
    if (!entidadPermite || !arcoValido) {
      return Result.fail(new TransicionInvalidaError(estadoActual.codigo, 'CANCELADO'));
    }

    const rechazarResult = ticketCompra.rechazar(dto.aprobadoPorId, new Date(), dto.motivoRechazo);
    if (rechazarResult.isFail()) {
      return Result.fail(rechazarResult.getError());
    }

    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('RECHAZO');
    if (!tipoOperacionId) {
      throw new Error(
        'Catálogo de tipo_operacion inconsistente: no existe "RECHAZO" en el tenant activo.',
      );
    }

    const estadoAnteriorId = ticket.estadoId;

    await this.txRunner.run(async () => {
      ticket.updateEstado(estadoCancelado.id);

      const operacion = OperacionTicketEntity.create({
        ticketId: ticket.id,
        tipoOperacionId,
        descripcion: null,
        estadoAnteriorId,
        estadoNuevoId: estadoCancelado.id,
        autorId: dto.aprobadoPorId,
        esInterno: false,
        metadata: null,
      });

      await this.ticketRepo.save(ticket);
      await this.ticketCompraRepo.save(ticketCompra);
      await this.operacionRepo.save(operacion);
    });

    return Result.ok({ ticket, ticketCompra });
  }
}
