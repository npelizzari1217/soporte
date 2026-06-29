import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { NumeradorTicket } from '../../../tickets/domain/services/numerador-ticket.service';
import {
  EstadoCatalogoNoEncontradoError,
  SolicitanteInvalidoError,
  TipoOperacionNoEncontradoError,
  TipoTicketNoEncontradoError,
} from '../../../tickets/domain/errors/tickets.errors';
import { IEstadoRepository } from '../../../tickets/domain/ports/i-estado.repository';
import { IOperacionTicketRepository } from '../../../tickets/domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import { CrearTicketDto } from '../../../tickets/application/use-cases/crear-ticket.use-case';
import { TicketSoporteEntity } from '../../domain/entities/ticket-soporte.entity';
import { ITicketSoporteRepository } from '../../domain/ports/i-ticket-soporte.repository';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { EquipoInvalidoError, TicketNoEsSoporteError } from '../../domain/errors/equipos.errors';

/**
 * DTO de entrada para crear un ticket de soporte IT.
 *
 * Extiende CrearTicketDto con equipoId (opcional) para el satélite ticket_soporte.
 */
export interface CrearTicketSoporteDto extends CrearTicketDto {
  /**
   * UUID del equipo afectado. OPCIONAL: puede ser null si el ticket de soporte
   * no refiere a un equipo específico (ej. problema de red, acceso a sistema).
   * Si se provee, el equipo DEBE existir y estar activo (activo=TRUE, deleted_at IS NULL).
   */
  equipoId: string | null;
}

/**
 * CrearTicketSoporteUseCase — caso de uso para crear un ticket de tipo SOPORTE/IT.
 *
 * Extiende la lógica de CrearTicketUseCase agregando:
 * - Validación opcional del equipo afectado (activo=TRUE, deleted_at IS NULL).
 * - Validación de tipo SOPORTE.
 * - Creación atómica del satélite ticket_soporte (equipoId puede ser null).
 *
 * Flujo:
 * 1. Valida que el solicitante_id existe en master.usuarios y pertenece al tenant.
 * 2. Si equipoId provisto: valida que el equipo existe, está activo y no fue eliminado.
 * 3. Resuelve el tipoCodigo → verifica que sea 'SOPORTE'.
 * 4. Resuelve el estado ABIERTO del catálogo del tenant.
 * 5. Resuelve el id del tipo de operación CAMBIO_ESTADO.
 * 6. Genera el número legible vía NumeradorTicket.
 * 7. Crea la TicketEntity (UUIDv7 interno).
 * 8. Crea la OperacionTicketEntity de apertura (NULL → ABIERTO).
 * 9. Crea la TicketSoporteEntity satélite (equipoId nullable).
 * 10. Persiste ticket + operacion + ticket_soporte en la MISMA transacción (atómico).
 * 11. Retorna Result.ok(ticket).
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:equipos/Satélite ticket_soporte, equipo_id referenciado debe existir]
 * Tarea: 6.B.1 / 6.B.2
 */
export class CrearTicketSoporteUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly estadoRepo: IEstadoRepository,
    private readonly usuarioMasterChecker: IUsuarioMasterChecker,
    private readonly tipoTicketRepo: ITipoTicketRepository,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
    private readonly numerador: Pick<NumeradorTicket, 'generarNumero'>,
    private readonly txRunner: ITenantTransactionRunner,
    private readonly ticketSoporteRepo: ITicketSoporteRepository,
    private readonly equipoRepo: IEquipoInformaticoRepository,
  ) {}

  async execute(dto: CrearTicketSoporteDto): Promise<Result<TicketEntity, DomainError>> {
    // 1. Validar que el solicitante existe en master y pertenece al tenant
    const solicitanteValido = await this.usuarioMasterChecker.existeEnTenant(
      dto.solicitanteId,
      dto.clienteId,
    );
    if (!solicitanteValido) {
      return Result.fail(new SolicitanteInvalidoError(dto.solicitanteId));
    }

    // 2. Si se provee equipo_id: validar que el equipo existe, está activo y no fue eliminado
    if (dto.equipoId !== null) {
      const equipo = await this.equipoRepo.findById(dto.equipoId);
      if (!equipo || !equipo.activo || equipo.isDeleted()) {
        return Result.fail(new EquipoInvalidoError(dto.equipoId));
      }
    }

    // 3. Resolver tipoCodigo y validar que es SOPORTE
    const tipoCodigo = await this.tipoTicketRepo.findCodigoById(dto.tipoId);
    if (!tipoCodigo) {
      return Result.fail(new TipoTicketNoEncontradoError(dto.tipoId));
    }
    if (tipoCodigo !== 'SOPORTE') {
      return Result.fail(new TicketNoEsSoporteError(tipoCodigo));
    }

    // 4. Resolver estado ABIERTO del catálogo del tenant
    const estadoAbierto = await this.estadoRepo.findByCodigo('ABIERTO');
    if (!estadoAbierto) {
      return Result.fail(new EstadoCatalogoNoEncontradoError('ABIERTO'));
    }

    // 5. Resolver el id del tipo de operación CAMBIO_ESTADO
    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('CAMBIO_ESTADO');
    if (!tipoOperacionId) {
      return Result.fail(new TipoOperacionNoEncontradoError('CAMBIO_ESTADO'));
    }

    // 6. Generar número legible (SOP-YYYY-NNNNN)
    const numeroResult = await this.numerador.generarNumero(dto.tipoId, tipoCodigo, dto.anio);
    if (numeroResult.isFail()) {
      return Result.fail(numeroResult.getError());
    }
    const numero = numeroResult.getValue();

    // 7. Crear la entidad Ticket (UUIDv7 generado internamente por BaseEntity)
    const ticket = TicketEntity.create({
      numero,
      titulo: dto.titulo,
      descripcion: dto.descripcion ?? null,
      tipoId: dto.tipoId,
      estadoId: estadoAbierto.id,
      prioridadId: dto.prioridadId,
      cicloId: dto.cicloId ?? null,
      solicitanteId: dto.solicitanteId,
      asignadoId: null,
      fechaCierre: null,
    });

    // 8. Crear la operación de apertura: CAMBIO_ESTADO NULL → ABIERTO
    const operacion = OperacionTicketEntity.create({
      ticketId: ticket.id,
      tipoOperacionId,
      descripcion: null,
      estadoAnteriorId: null,
      estadoNuevoId: estadoAbierto.id,
      autorId: dto.autorId,
      metadata: null,
    });

    // 9. Crear el satélite ticket_soporte (equipoId puede ser null)
    const ticketSoporte = TicketSoporteEntity.create(ticket.id, dto.equipoId);

    // 10. Persistir ticket + operacion + ticket_soporte en la misma transacción (atómico).
    //     Si cualquier save falla, la transacción hace rollback completo.
    await this.txRunner.run(async () => {
      await this.ticketRepo.save(ticket);
      await this.operacionRepo.save(operacion);
      await this.ticketSoporteRepo.save(ticketSoporte);
    });

    return Result.ok(ticket);
  }
}
