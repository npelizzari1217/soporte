import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { NumeradorTicket } from '../../domain/services/numerador-ticket.service';
import {
  EstadoCatalogoNoEncontradoError,
  SolicitanteInvalidoError,
  TipoOperacionNoEncontradoError,
  TipoTicketNoEncontradoError,
} from '../../domain/errors/tickets.errors';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';

/**
 * DTO de entrada para la creación de un ticket.
 *
 * - `tipoId`: UUID del tipo de ticket (FK → tipos_ticket).
 * - `clienteId`: viene del JWT claim; se usa para validar la pertenencia del
 *   solicitante al tenant sin pasar el JWT directamente al use case.
 * - `autorId`: viene del JWT claim; se registra en la operacion de timeline.
 * - `anio`: año para el numerador (del ciclo vigente o año en curso).
 */
export interface CrearTicketDto {
  titulo: string;
  descripcion?: string | null;
  tipoId: string;
  prioridadId: string;
  cicloId?: string | null;
  solicitanteId: string;
  /** UUID del cliente (tenant), extraído del JWT. */
  clienteId: string;
  /** UUID del autor que realiza la acción, extraído del JWT. */
  autorId: string;
  /** Año para la generación del número legible. */
  anio: number;
  fechaVencimiento?: Date | null;
}

/**
 * CrearTicketUseCase — caso de uso para la creación de un ticket nuevo.
 *
 * Flujo:
 * 1. Valida que el `solicitante_id` existe en master.usuarios y pertenece al tenant.
 * 2. Resuelve el tipoCodigo ('SOPORTE', 'COMPRAS', 'EDILICIA') desde el tipoId.
 * 3. Resuelve el estado ABIERTO del catálogo del tenant.
 * 4. Resuelve el id del tipo de operación CAMBIO_ESTADO.
 * 5. Genera el número legible vía NumeradorTicket.
 * 6. Crea la TicketEntity (UUIDv7 interno).
 * 7. Crea la OperacionTicketEntity de apertura (estado_anterior=NULL, estado_nuevo=ABIERTO).
 * 8. Persiste ambas entidades en la MISMA transacción vía ITenantTransactionRunner.
 * 9. Retorna Result.ok(ticket).
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:tickets-core/Estado inicial ABIERTO]
 * Ref spec: [SPEC:tickets-core/Validación soft refs cross-DB]
 * Tarea: 3.C.2
 */
export class CrearTicketUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly estadoRepo: IEstadoRepository,
    private readonly usuarioMasterChecker: IUsuarioMasterChecker,
    private readonly tipoTicketRepo: ITipoTicketRepository,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
    private readonly numerador: Pick<NumeradorTicket, 'generarNumero'>,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: CrearTicketDto): Promise<Result<TicketEntity, DomainError>> {
    // 1. Validar que el solicitante existe en master y pertenece al tenant
    const solicitanteValido = await this.usuarioMasterChecker.existeEnTenant(
      dto.solicitanteId,
      dto.clienteId,
    );
    if (!solicitanteValido) {
      return Result.fail(new SolicitanteInvalidoError(dto.solicitanteId));
    }

    // 2. Resolver tipoCodigo para el numerador y la máquina de estados
    const tipoCodigo = await this.tipoTicketRepo.findCodigoById(dto.tipoId);
    if (!tipoCodigo) {
      return Result.fail(new TipoTicketNoEncontradoError(dto.tipoId));
    }

    // 3. Resolver estado ABIERTO del catálogo del tenant
    const estadoAbierto = await this.estadoRepo.findByCodigo('ABIERTO');
    if (!estadoAbierto) {
      return Result.fail(new EstadoCatalogoNoEncontradoError('ABIERTO'));
    }

    // 4. Resolver el id del tipo de operación CAMBIO_ESTADO
    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('CAMBIO_ESTADO');
    if (!tipoOperacionId) {
      return Result.fail(new TipoOperacionNoEncontradoError('CAMBIO_ESTADO'));
    }

    // 5. Generar número legible — puede fallar (secuencia agotada, tipo desconocido)
    const numeroResult = await this.numerador.generarNumero(dto.tipoId, tipoCodigo, dto.anio);
    if (numeroResult.isFail()) {
      return Result.fail(numeroResult.getError());
    }
    const numero = numeroResult.getValue();

    // 6. Crear la entidad Ticket (UUIDv7 generado internamente por BaseEntity)
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
      fechaVencimiento: dto.fechaVencimiento ?? null,
    });

    // 7. Crear la operación de apertura: CAMBIO_ESTADO NULL → ABIERTO
    const operacion = OperacionTicketEntity.create({
      ticketId: ticket.id,
      tipoOperacionId,
      descripcion: null,
      estadoAnteriorId: null,
      estadoNuevoId: estadoAbierto.id,
      autorId: dto.autorId,
      metadata: null,
    });

    // 8. Persistir ticket + operacion en la misma transacción (atómico)
    await this.txRunner.run(async () => {
      await this.ticketRepo.save(ticket);
      await this.operacionRepo.save(operacion);
    });

    return Result.ok(ticket);
  }
}
