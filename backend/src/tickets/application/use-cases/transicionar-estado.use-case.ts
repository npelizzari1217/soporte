import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { TicketStateMachineFactory } from '../../domain/state-machine/ticket-state-machine.factory';
import {
  EstadoCatalogoNoEncontradoError,
  EstadoDestinoInvalidoError,
  TicketNoEncontradoError,
  TipoOperacionNoEncontradoError,
  TipoTicketNoEncontradoError,
  TransicionInvalidaError,
} from '../../domain/errors/tickets.errors';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';

/**
 * DTO de entrada para transicionar el estado de un ticket.
 *
 * - `ticketId`: UUID del ticket a transicionar.
 * - `nuevoEstadoCodigo`: código semántico del estado destino (ej. 'EN_PROGRESO').
 *   El use case resuelve internamente el UUID del estado desde el catálogo.
 * - `autorId`: UUID del usuario que realiza la transición (del JWT). Se registra
 *   en la operación de timeline.
 *
 * DECISIÓN INFERIDA: el contexto para la máquina de estados (StateMachineContext)
 * actualmente se pasa vacío `{}`. Cuando se implemente EdiliciaStateMachine (Fase 5),
 * este DTO deberá extenderse con `porcentajeAvance?: number` para que el use case
 * pueda construir el ctx apropiado. Se lista como decisión pendiente de confirmar.
 */
export interface TransicionarEstadoDto {
  ticketId: string;
  nuevoEstadoCodigo: string;
  autorId: string;
}

/**
 * TransicionarEstadoUseCase — caso de uso para transicionar el estado de un ticket.
 *
 * Flujo:
 * 1. Carga el ticket por id → 404 si no existe.
 * 2. Resuelve el estado actual (desde ticket.estadoId) y el estado destino (desde nuevoEstadoCodigo).
 * 3. Verifica invariantes de la entidad vía ticket.canTransitionTo() (soft-delete, terminales).
 * 4. Resuelve el tipoCodigo del ticket y obtiene la máquina de estados via factory.
 * 5. Evalúa puedeTransicionar() — 422 si rechazada, sin modificar nada.
 * 6. Resuelve el id de tipo_operacion CAMBIO_ESTADO.
 * 7. Actualiza ticket.estadoId y crea OperacionTicketEntity.
 * 8. Persiste ticket + operacion en la MISMA transacción vía ITenantTransactionRunner.
 * 9. Retorna Result.ok(ticket).
 *
 * Transición inválida → Result.fail(TransicionInvalidaError) sin modificar el ticket
 * ni crear registros en operaciones_ticket. HTTP 422 semántico.
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:tickets-core/Transición inválida rechazada]
 * Ref spec: [SPEC:tickets-core/Transición válida registra operacion en misma transacción]
 * Tarea: 3.C.6
 */
export class TransicionarEstadoUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly estadoRepo: IEstadoRepository,
    private readonly tipoTicketRepo: ITipoTicketRepository,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
    private readonly factory: Pick<TicketStateMachineFactory, 'resolve'>,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: TransicionarEstadoDto): Promise<Result<TicketEntity, DomainError>> {
    // 1. Cargar el ticket
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (!ticket) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }

    // 2. Resolver estado actual desde el catálogo del tenant
    const estadoActual = await this.estadoRepo.findById(ticket.estadoId);
    if (!estadoActual) {
      return Result.fail(new EstadoCatalogoNoEncontradoError(ticket.estadoId));
    }

    // 3. Resolver estado destino desde el catálogo del tenant.
    //    Null aquí significa que el usuario envió un código que no existe → 422
    //    (distinto del caso 2 donde el estadoId del ticket no existe en catálogo → 500).
    const estadoNuevo = await this.estadoRepo.findByCodigo(dto.nuevoEstadoCodigo);
    if (!estadoNuevo) {
      return Result.fail(new EstadoDestinoInvalidoError(dto.nuevoEstadoCodigo));
    }

    // 4. Verificar invariantes de la entidad (soft-delete, estados terminales)
    if (!ticket.canTransitionTo(estadoActual.codigo, estadoNuevo.codigo)) {
      return Result.fail(
        new TransicionInvalidaError(
          estadoActual.codigo,
          estadoNuevo.codigo,
          'Invariante de entidad: ticket eliminado o en estado terminal.',
        ),
      );
    }

    // 5. Resolver tipoCodigo y obtener la máquina de estados apropiada para el tipo.
    //    Null es una inconsistencia de datos (el ticket ya existe con ese tipoId en DB):
    //    fallar fuerte evita enrutar mal a BaseTicketStateMachine cuando en Fase 4/5
    //    se registren máquinas específicas para COMPRAS/EDILICIA.
    const tipoCodigo = await this.tipoTicketRepo.findCodigoById(ticket.tipoId);
    if (!tipoCodigo) {
      return Result.fail(new TipoTicketNoEncontradoError(ticket.tipoId));
    }
    const machine = this.factory.resolve(tipoCodigo);

    // 6. Evaluar si la transición es válida según las reglas del tipo de ticket.
    //    StateMachineContext: actualmente vacío. Cuando se implemente EdiliciaStateMachine
    //    (Fase 5), el DTO deberá extenderse con porcentajeAvance para construir el ctx.
    const ctx = {};
    if (!machine.puedeTransicionar(estadoActual.codigo, estadoNuevo.codigo, ctx)) {
      return Result.fail(new TransicionInvalidaError(estadoActual.codigo, estadoNuevo.codigo));
    }

    // 7. Resolver el id del tipo de operación CAMBIO_ESTADO
    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('CAMBIO_ESTADO');
    if (!tipoOperacionId) {
      return Result.fail(new TipoOperacionNoEncontradoError('CAMBIO_ESTADO'));
    }

    // 8. Actualizar el estadoId del ticket (mutación de la entidad)
    ticket.updateEstado(estadoNuevo.id);

    // 9. Crear la operación de timeline CAMBIO_ESTADO
    const operacion = OperacionTicketEntity.create({
      ticketId: ticket.id,
      tipoOperacionId,
      descripcion: null,
      estadoAnteriorId: estadoActual.id,
      estadoNuevoId: estadoNuevo.id,
      autorId: dto.autorId,
      metadata: null,
    });

    // 10. Persistir ticket actualizado + operacion en la misma transacción (atómico)
    await this.txRunner.run(async () => {
      await this.ticketRepo.save(ticket);
      await this.operacionRepo.save(operacion);
    });

    return Result.ok(ticket);
  }
}
