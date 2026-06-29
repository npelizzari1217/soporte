/**
 * S3-T1 [TEST] — Unit tests para EliminarTicketUseCase.
 *
 * Todos los repositorios son mockeados (sin Prisma ni DB).
 * El txRunner ejecuta el callback inmediatamente (patrón existente).
 *
 * Cubre:
 * - Ticket no existe → TicketNoEncontradoError (incluye ticket de otro tenant → null)
 * - Ticket ya borrado (isDeleted) → Result.ok no-op (sin save, sin operacion, sin tx)
 * - tipoOperacionId ELIMINACION null → TipoOperacionNoEncontradoError
 * - Happy path (ticket activo): softDelete + save + operacion ELIMINACION en tx
 * - Happy path (ticket CERRADO, no deleted): borrado permitido en terminal
 *
 * Ref spec: tickets-core §"Soft delete exitoso de ticket activo"
 * Ref spec: tickets-core §"Soft delete rechazado — ticket de otro tenant"
 * Ref spec: tickets-editar-borrar locked decision L2 (idempotencia no-op)
 * Tarea: S3-T1
 */

import { EliminarTicketDto, EliminarTicketUseCase } from './eliminar-ticket.use-case';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TicketEntity, TicketProps } from '../../domain/entities/ticket.entity';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import {
  TicketNoEncontradoError,
  TipoOperacionNoEncontradoError,
} from '../../domain/errors/tickets.errors';

// ─── Constantes ───────────────────────────────────────────────────────────────

const TICKET_ID = 'ticket-uuid-s3-001';
const TIPO_OPERACION_ELIMINACION_ID = 'f0000000-0000-4000-f000-000000000008';
const AUTOR_ID = 'user-autor-s3-001';
const ESTADO_ABIERTO_ID = 'c0000000-0000-4000-c000-000000000001';
const ESTADO_CERRADO_ID = 'c0000000-0000-4000-c000-000000000003';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTicketProps(overrides: Partial<TicketProps> = {}): TicketProps {
  return {
    numero: 'SOP-2026-00099',
    titulo: 'Ticket a eliminar',
    descripcion: 'Descripción de prueba',
    tipoId: 'tipo-uuid-001',
    estadoId: ESTADO_ABIERTO_ID,
    prioridadId: 'prio-uuid-001',
    cicloId: null,
    solicitanteId: 'user-solicitante-001',
    asignadoId: null,
    fechaResolucion: null,
    ...overrides,
  };
}

/** Ticket activo (no deleted, estado ABIERTO). */
function makeActiveTicket(overrides: Partial<TicketProps> = {}): TicketEntity {
  return TicketEntity.reconstitute(
    makeTicketProps(overrides),
    TICKET_ID,
    new Date(),
    new Date(),
    null, // deletedAt = null → activo
  );
}

/** Ticket ya borrado (deletedAt seteado → soft-deleted). */
function makeDeletedTicket(): TicketEntity {
  return TicketEntity.reconstitute(
    makeTicketProps(),
    TICKET_ID,
    new Date(),
    new Date(),
    new Date(), // deletedAt seteado → soft-deleted
  );
}

const validDto: EliminarTicketDto = {
  ticketId: TICKET_ID,
  autorId: AUTOR_ID,
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('EliminarTicketUseCase', () => {
  let useCase: EliminarTicketUseCase;

  const mockTicketRepo = {
    findById: vi.fn<Promise<TicketEntity | null>, [string]>(),
    findByNumero: vi.fn(),
    findLastSecuencia: vi.fn(),
    findAll: vi.fn(),
    findByEstado: vi.fn(),
    save: vi.fn<Promise<void>, [TicketEntity]>(),
    delete: vi.fn(),
  } satisfies vi.Mocked<ITicketRepository>;

  const mockOperacionRepo = {
    findByTicketId: vi.fn(),
    save: vi.fn<Promise<void>, [OperacionTicketEntity]>(),
  } satisfies vi.Mocked<IOperacionTicketRepository>;

  const mockTipoOperacionRepo = {
    findIdByCodigo: vi.fn<Promise<string | null>, [string]>(),
  } satisfies vi.Mocked<ITipoOperacionRepository>;

  const txRunner: ITenantTransactionRunner = {
    run: vi.fn().mockImplementation(async (cb: () => Promise<void>) => cb()),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new EliminarTicketUseCase(
      mockTicketRepo,
      mockOperacionRepo,
      mockTipoOperacionRepo,
      txRunner,
    );
  });

  // ─── Ticket no existe ─────────────────────────────────────────────────────

  it('retorna TicketNoEncontradoError cuando el ticket no existe (incluye otro tenant)', async () => {
    // Spec: tickets-core §"Soft delete rechazado — ticket de otro tenant" (→ 404)
    // findById retorna null para tickets inexistentes O de otro tenant (aislamiento físico)
    mockTicketRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute(validDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(mockTicketRepo.save).not.toHaveBeenCalled();
    expect(mockOperacionRepo.save).not.toHaveBeenCalled();
    expect(txRunner.run).not.toHaveBeenCalled();
  });

  // ─── No-op idempotente (ticket ya borrado) ─────────────────────────────────

  it('retorna Result.ok no-op cuando el ticket ya está soft-deleted (idempotencia L2)', async () => {
    // Locked decision L2: segundo DELETE → 204 no-op SIN 2ª OperacionTicket
    mockTicketRepo.findById.mockResolvedValue(makeDeletedTicket());

    const result = await useCase.execute(validDto);

    // Éxito silencioso — mismo estado observable
    expect(result.isOk()).toBe(true);

    // CRÍTICO: NO debe haber segunda operación de auditoría
    expect(mockOperacionRepo.save).not.toHaveBeenCalled();
    // CRÍTICO: NO debe intentar volver a borrar
    expect(mockTicketRepo.save).not.toHaveBeenCalled();
    // CRÍTICO: NO debe abrir transacción innecesaria
    expect(txRunner.run).not.toHaveBeenCalled();
    // El tipo de operación ni siquiera se consulta en el no-op
    expect(mockTipoOperacionRepo.findIdByCodigo).not.toHaveBeenCalled();
  });

  // ─── tipoOperacion ELIMINACION null ──────────────────────────────────────

  it('retorna TipoOperacionNoEncontradoError cuando ELIMINACION no está en catálogo', async () => {
    // Spec: tickets-core §"Rollback si falla el registro de auditoría en eliminación" → 500
    mockTicketRepo.findById.mockResolvedValue(makeActiveTicket());
    mockTipoOperacionRepo.findIdByCodigo.mockResolvedValue(null);

    const result = await useCase.execute(validDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoOperacionNoEncontradoError);
    expect(mockTicketRepo.save).not.toHaveBeenCalled();
    expect(txRunner.run).not.toHaveBeenCalled();
  });

  // ─── Happy path — ticket activo ABIERTO ──────────────────────────────────

  it('happy path: softDelete del ticket, registra OperacionTicket ELIMINACION en misma tx', async () => {
    // Spec: tickets-core §"Soft delete exitoso de ticket activo"
    const ticket = makeActiveTicket();
    mockTicketRepo.findById.mockResolvedValue(ticket);
    mockTipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OPERACION_ELIMINACION_ID);

    const result = await useCase.execute(validDto);

    // Resultado ok
    expect(result.isOk()).toBe(true);

    // El ticket queda marcado como eliminado
    expect(result.getValue().isDeleted()).toBe(true);

    // ticketRepo.save llamado con el ticket ya soft-deleted
    expect(mockTicketRepo.save).toHaveBeenCalledWith(ticket);
    expect(mockTicketRepo.save).toHaveBeenCalledTimes(1);

    // operacionRepo.save llamado con operación ELIMINACION
    expect(mockOperacionRepo.save).toHaveBeenCalledTimes(1);
    const operacion = mockOperacionRepo.save.mock.calls[0][0] as OperacionTicketEntity;
    expect(operacion.tipoOperacionId).toBe(TIPO_OPERACION_ELIMINACION_ID);
    expect(operacion.ticketId).toBe(TICKET_ID);
    expect(operacion.autorId).toBe(AUTOR_ID);
    expect(operacion.estadoAnteriorId).toBeNull();
    expect(operacion.estadoNuevoId).toBeNull();
    // metadata null (ELIMINACION es mínima, igual que ASIGNACION)
    expect(operacion.metadata).toBeNull();

    // Atomicidad: ambos saves dentro del txRunner
    expect(txRunner.run).toHaveBeenCalledTimes(1);

    // tipoOperacion consultado con el código correcto
    expect(mockTipoOperacionRepo.findIdByCodigo).toHaveBeenCalledWith('ELIMINACION');
  });

  // ─── Happy path — ticket en estado terminal CERRADO ───────────────────────

  it('happy path: borrado permitido en estado terminal CERRADO (no chequea canEdit)', async () => {
    // Spec: tickets-core §"Soft delete de ticket en estado terminal — permitido"
    // EliminarTicketUseCase NO carga el estado ni chequea canEdit (a diferencia de editar)
    const ticketCerrado = makeActiveTicket({ estadoId: ESTADO_CERRADO_ID });
    mockTicketRepo.findById.mockResolvedValue(ticketCerrado);
    mockTipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OPERACION_ELIMINACION_ID);

    const result = await useCase.execute(validDto);

    // El borrado debe tener éxito aunque el estado sea terminal
    expect(result.isOk()).toBe(true);
    expect(result.getValue().isDeleted()).toBe(true);
    expect(mockTicketRepo.save).toHaveBeenCalledTimes(1);
    expect(mockOperacionRepo.save).toHaveBeenCalledTimes(1);
  });
});
