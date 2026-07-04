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
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { IUbicacionRepository } from '../../domain/ports/i-ubicacion.repository';
import {
  TicketNoEsEdiliciaError,
  UbicacionInvalidaError,
} from '../../domain/errors/reparaciones.errors';

/**
 * DTO de entrada para crear un ticket edilicio.
 *
 * Extiende los campos base de CrearTicketDto con ubicacionId, requerido
 * para el satélite ticket_edilicia.
 */
export interface CrearTicketEdilicioDto extends CrearTicketDto {
  /** UUID de la ubicación física donde ocurre la reparación. Debe ser activa y no eliminada. */
  ubicacionId: string;
}

/**
 * CrearTicketEdilicioUseCase — caso de uso para crear un ticket de tipo EDILICIA.
 *
 * Extiende la lógica de CrearTicketUseCase agregando:
 * - Validación de la ubicación (activo=true, deleted_at IS NULL).
 * - Validación de tipo EDILICIA.
 * - Creación del satélite ticket_edilicia (porcentajeAvance = 0, personalAsignadoId = null).
 *
 * Flujo:
 * 1. Valida que el solicitante_id existe en master.usuarios y pertenece al tenant.
 * 2. Valida que la ubicacion_id existe, está activa y no fue eliminada.
 * 3. Resuelve el tipoCodigo → verifica que sea 'EDILICIA' (si no → fallo inmediato).
 * 4. Resuelve el estado ABIERTO del catálogo del tenant.
 * 5. Resuelve el id del tipo de operación CAMBIO_ESTADO.
 * 6. Genera el número legible vía NumeradorTicket.
 * 7. Crea la TicketEntity (UUIDv7 interno).
 * 8. Crea la OperacionTicketEntity de apertura (NULL → ABIERTO).
 * 9. Crea la TicketEdiliciaEntity satélite (porcentajeAvance = 0).
 * 10. Persiste ticket + operacion + ticket_edilicia en la MISMA transacción (atómico).
 * 11. Retorna Result.ok(ticket).
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:reparaciones/Satélite obligatorio, ticket_edilicia requiere ubicacion válida]
 * Tarea: 5.B.1 / 5.B.2
 */
export class CrearTicketEdilicioUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly estadoRepo: IEstadoRepository,
    private readonly usuarioMasterChecker: IUsuarioMasterChecker,
    private readonly tipoTicketRepo: ITipoTicketRepository,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
    private readonly numerador: Pick<NumeradorTicket, 'generarNumero'>,
    private readonly txRunner: ITenantTransactionRunner,
    private readonly ticketEdiliciaRepo: ITicketEdiliciaRepository,
    private readonly ubicacionRepo: IUbicacionRepository,
  ) {}

  async execute(dto: CrearTicketEdilicioDto): Promise<Result<TicketEntity, DomainError>> {
    // 1. Validar que el solicitante existe en master y pertenece al tenant
    const solicitanteValido = await this.usuarioMasterChecker.existeEnTenant(
      dto.solicitanteId,
      dto.clienteId,
    );
    if (!solicitanteValido) {
      return Result.fail(new SolicitanteInvalidoError(dto.solicitanteId));
    }

    // 2. Validar ubicacion_id: debe existir, estar activa y no eliminada
    const ubicacion = await this.ubicacionRepo.findById(dto.ubicacionId);
    if (!ubicacion || !ubicacion.activo || ubicacion.isDeleted()) {
      return Result.fail(new UbicacionInvalidaError(dto.ubicacionId));
    }

    // 3. Resolver tipoCodigo para validar que es EDILICIA
    const tipoCodigo = await this.tipoTicketRepo.findCodigoById(dto.tipoId);
    if (!tipoCodigo) {
      return Result.fail(new TipoTicketNoEncontradoError(dto.tipoId));
    }
    if (tipoCodigo !== 'EDILICIA') {
      return Result.fail(new TicketNoEsEdiliciaError(tipoCodigo));
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

    // 6. Generar número legible (EDI-YYYY-NNNNN)
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
      // TODO(Fase 4 PR4, ciclos-master-tenant): CrearTicketDto perdió `cicloId`
      // (ADR-3, PR2 tickets) — el servidor lo determinará vía
      // ResolverCicloActivoParaCreacion, igual que en CrearTicketUseCase.
      // Stopgap compile-preserving en PR2: mismo comportamiento runtime que
      // antes (`dto.cicloId` nunca llegaba desde el frontend → siempre `null`).
      cicloId: null,
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

    // 9. Crear el satélite ticket_edilicia (porcentajeAvance = 0, personalAsignadoId = null)
    const ticketEdilicia = TicketEdiliciaEntity.create(ticket.id, dto.ubicacionId);

    // 10. Persistir ticket + operacion + ticket_edilicia en la misma transacción (atómico).
    //     Si cualquier save falla, la transacción hace rollback completo.
    await this.txRunner.run(async () => {
      await this.ticketRepo.save(ticket);
      await this.operacionRepo.save(operacion);
      await this.ticketEdiliciaRepo.save(ticketEdilicia);
    });

    return Result.ok(ticket);
  }
}
