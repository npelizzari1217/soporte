import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketStateMachineFactory } from '../../../tickets/domain/state-machine/ticket-state-machine.factory';
import {
  EstadoCatalogoNoEncontradoError,
  TicketNoEncontradoError,
  TipoOperacionNoEncontradoError,
  TipoTicketNoEncontradoError,
  TransicionInvalidaError,
} from '../../../tickets/domain/errors/tickets.errors';
import { IEstadoRepository } from '../../../tickets/domain/ports/i-estado.repository';
import { IOperacionTicketRepository } from '../../../tickets/domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { ITicketCompraRepository } from '../../domain/ports/i-ticket-compra.repository';
import { TicketCompraNoEncontradoError } from '../../domain/errors/compras.errors';

/**
 * DTO de entrada para aprobar una compra.
 *
 * El gate de permiso `compra:aprobar` es responsabilidad del `PermissionsGuard`
 * en la capa de interface (controller). Este use case es agnóstico al permiso.
 */
export interface AprobarCompraDto {
  /** UUID del ticket de compra a aprobar. */
  ticketId: string;
  /** UUID del usuario que aprueba (soft ref → master.usuarios; extraído del JWT). */
  aprobadoPorId: string;
}

/**
 * AprobarCompraUseCase — aprueba un ticket de compra en estado PENDIENTE_APROBACION.
 *
 * Flujo:
 * 1. Carga el ticket → 404 si no existe o está eliminado.
 * 2. Busca el satélite ticket_compra → falla si no existe.
 * 3. Resuelve el estado actual y el estado destino APROBADO.
 * 4. Resuelve el tipoCodigo del ticket y obtiene la ComprasStateMachine vía factory.
 * 5. Evalúa puedeTransicionar(estadoActual, 'APROBADO') → TransicionInvalidaError si rechazada.
 * 6. Resuelve tipo_operacion CAMBIO_ESTADO.
 * 7. Llama ticketCompra.aprobar() para setear aprobadoPorId + aprobadoEn.
 * 8. Actualiza ticket.estadoId a APROBADO.
 * 9. Crea OperacionTicketEntity CAMBIO_ESTADO (estadoActual → APROBADO).
 * 10. Persiste ticket + ticketCompra + operacion en misma transacción (atómico).
 * 11. Retorna Result.ok(ticket).
 *
 * La validación de la transición se delega a `TicketStateMachineFactory` para respetar
 * la fuente única de verdad del patrón Strategy. `ComprasStateMachine` define explícitamente
 * PENDIENTE_APROBACION → APROBADO como transición válida.
 *
 * NOTA: El gate de permiso `compra:aprobar` se verifica en el guard de interface.
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:compras/Gate de aprobación, Aprobación exitosa]
 * Tarea: 4.B.5 / 4.B.6
 */
export class AprobarCompraUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly ticketCompraRepo: ITicketCompraRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly estadoRepo: IEstadoRepository,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
    private readonly tipoTicketRepo: ITipoTicketRepository,
    private readonly factory: Pick<TicketStateMachineFactory, 'resolve'>,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: AprobarCompraDto): Promise<Result<TicketEntity, DomainError>> {
    // 1. Cargar el ticket; tratar soft-deleted como no encontrado
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (!ticket || ticket.isDeleted()) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }

    // 2. Verificar que el satélite ticket_compra existe
    const ticketCompra = await this.ticketCompraRepo.findByTicketId(ticket.id);
    if (!ticketCompra) {
      return Result.fail(new TicketCompraNoEncontradoError(ticket.id));
    }

    // 3. Resolver el estado actual desde el catálogo
    const estadoActual = await this.estadoRepo.findById(ticket.estadoId);
    if (!estadoActual) {
      return Result.fail(new EstadoCatalogoNoEncontradoError(ticket.estadoId));
    }

    // 4. Resolver el estado destino APROBADO
    const estadoAprobado = await this.estadoRepo.findByCodigo('APROBADO');
    if (!estadoAprobado) {
      return Result.fail(new EstadoCatalogoNoEncontradoError('APROBADO'));
    }

    // 5. Resolver tipoCodigo y obtener la máquina de estados para este tipo de ticket.
    //    Delegar la validación a la Strategy (ComprasStateMachine) — fuente única de verdad.
    const tipoCodigo = await this.tipoTicketRepo.findCodigoById(ticket.tipoId);
    if (!tipoCodigo) {
      return Result.fail(new TipoTicketNoEncontradoError(ticket.tipoId));
    }
    const machine = this.factory.resolve(tipoCodigo);

    if (!machine.puedeTransicionar(estadoActual.codigo, 'APROBADO', {})) {
      return Result.fail(
        new TransicionInvalidaError(
          estadoActual.codigo,
          'APROBADO',
          `ComprasStateMachine rechaza la transición "${estadoActual.codigo}" → "APROBADO".`,
        ),
      );
    }

    // 6. Resolver tipo_operacion CAMBIO_ESTADO
    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('CAMBIO_ESTADO');
    if (!tipoOperacionId) {
      return Result.fail(new TipoOperacionNoEncontradoError('CAMBIO_ESTADO'));
    }

    // 7. Registrar la aprobación en el satélite (aprobadoPorId + aprobadoEn)
    ticketCompra.aprobar(dto.aprobadoPorId, new Date());

    // 8. Transicionar el ticket a APROBADO
    ticket.updateEstado(estadoAprobado.id);

    // 9. Crear la operación de timeline CAMBIO_ESTADO (estadoActual → APROBADO)
    const operacion = OperacionTicketEntity.create({
      ticketId: ticket.id,
      tipoOperacionId,
      descripcion: null,
      estadoAnteriorId: estadoActual.id,
      estadoNuevoId: estadoAprobado.id,
      autorId: dto.aprobadoPorId,
      metadata: null,
    });

    // 10. Persistir ticket + ticketCompra + operacion en la misma transacción (atómico)
    await this.txRunner.run(async () => {
      await this.ticketRepo.save(ticket);
      await this.ticketCompraRepo.save(ticketCompra);
      await this.operacionRepo.save(operacion);
    });

    return Result.ok(ticket);
  }
}
