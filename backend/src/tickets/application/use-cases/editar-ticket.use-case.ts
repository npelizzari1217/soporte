import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { ActualizarDatosTicket } from '../../domain/entities/ticket.entity';
import {
  EstadoCatalogoNoEncontradoError,
  TicketNoEncontradoError,
  TicketNoEditableError,
  PrioridadNoEncontradaError,
  CicloNoEncontradoError,
  TituloInvalidoError,
  TipoOperacionNoEncontradoError,
} from '../../domain/errors/tickets.errors';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { IPrioridadRepository } from '../../domain/ports/i-prioridad.repository';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';

/**
 * DTO de entrada para editar los campos de datos de un ticket.
 *
 * - `ticketId`: UUID del ticket a editar.
 * - `datos`: campos parciales a actualizar (undefined = no tocar, null = limpiar).
 *   Ver `ActualizarDatosTicket` para la lista exacta de campos.
 *   NOTA: tipoId está EXCLUIDO (locked decision L1).
 * - `autorId`: UUID del usuario que realiza la edición (del JWT). Se registra
 *   en la OperacionTicket de auditoría.
 */
export interface EditarTicketDto {
  ticketId: string;
  datos: ActualizarDatosTicket;
  autorId: string;
}

/**
 * EditarTicketUseCase — edita los campos de datos de un ticket (PATCH semántico).
 *
 * Flujo:
 * 1. Cargar el ticket por id. Si !ticket || ticket.isDeleted() → TicketNoEncontradoError (404).
 *    Un ticket soft-deleted se trata como inexistente — no se edita un ticket borrado.
 * 2. Cargar el estado actual vía IEstadoRepository. Si null → EstadoCatalogoNoEncontradoError (500).
 * 3. Si !ticket.canEdit(estado.codigo) → TicketNoEditableError (422).
 *    El estado es terminal (deleted ya filtrado en paso 1).
 * 4. Si datos.prioridadId está definido: validar existencia → null → PrioridadNoEncontradaError (422).
 * 5. Si datos.cicloId está definido y no-null: validar existencia → null → CicloNoEncontradoError (422).
 * 6. ticket.updateDatos(datos). Si TituloInvalidoError → Result.fail (422).
 * 7. Resolver tipoOperacionId para 'EDICION'. Si null → TipoOperacionNoEncontradoError (500).
 * 8. Construir OperacionTicketEntity EDICION con metadata.camposModificados.
 * 9. txRunner.run(() => ticketRepo.save + operacionRepo.save) — atómico.
 * 10. Result.ok(ticket).
 *
 * Ref spec: tickets-core §"Edición exitosa de campos de datos"
 * Ref spec: tickets-editar-borrar locked decisions L1, L4
 * Tarea: S2-T11
 */
export class EditarTicketUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly estadoRepo: IEstadoRepository,
    private readonly prioridadRepo: IPrioridadRepository,
    private readonly cicloRepo: ICicloClienteRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: EditarTicketDto): Promise<Result<TicketEntity, DomainError>> {
    // 1. Cargar el ticket
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (!ticket || ticket.isDeleted()) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }

    // 2. Cargar el estado actual desde el catálogo del tenant
    const estadoActual = await this.estadoRepo.findById(ticket.estadoId);
    if (!estadoActual) {
      return Result.fail(new EstadoCatalogoNoEncontradoError(ticket.estadoId));
    }

    // 3. Verificar que el ticket sea editable (no terminal, no deleted)
    if (!ticket.canEdit(estadoActual.codigo)) {
      return Result.fail(new TicketNoEditableError(estadoActual.codigo));
    }

    // 4. Validar prioridadId si viene definido (locked decision L4)
    if (dto.datos.prioridadId !== undefined) {
      const prioridad = await this.prioridadRepo.findById(dto.datos.prioridadId);
      if (!prioridad) {
        return Result.fail(new PrioridadNoEncontradaError(dto.datos.prioridadId));
      }
    }

    // 5. Validar cicloId si viene definido y no-null (locked decision L4)
    if (dto.datos.cicloId !== undefined && dto.datos.cicloId !== null) {
      const ciclo = await this.cicloRepo.findById(dto.datos.cicloId);
      if (!ciclo) {
        return Result.fail(new CicloNoEncontradoError(dto.datos.cicloId));
      }
    }

    // 6. Aplicar la mutación de datos (puede lanzar TituloInvalidoError)
    try {
      ticket.updateDatos(dto.datos);
    } catch (e) {
      if (e instanceof TituloInvalidoError) {
        return Result.fail(e);
      }
      throw e;
    }

    // 7. Resolver el id del tipo de operación EDICION
    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('EDICION');
    if (!tipoOperacionId) {
      return Result.fail(new TipoOperacionNoEncontradoError('EDICION'));
    }

    // 8. Calcular campos efectivamente modificados (los que !==undefined en datos)
    const camposModificados = Object.keys(dto.datos).filter(
      (k) => (dto.datos as Record<string, unknown>)[k] !== undefined,
    );

    // 9. Crear la OperacionTicket EDICION con metadata de auditoría
    const operacion = OperacionTicketEntity.create({
      ticketId: ticket.id,
      tipoOperacionId,
      descripcion: null,
      estadoAnteriorId: null, // edición de datos no cambia estado
      estadoNuevoId: null,
      autorId: dto.autorId,
      metadata: { camposModificados },
    });

    // 10. Persistir ticket actualizado + operacion en la misma transacción (atómico)
    await this.txRunner.run(async () => {
      await this.ticketRepo.save(ticket);
      await this.operacionRepo.save(operacion);
    });

    return Result.ok(ticket);
  }
}
