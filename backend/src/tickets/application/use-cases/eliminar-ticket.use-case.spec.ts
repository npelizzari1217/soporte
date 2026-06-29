/**
 * P1.T6 [RED → GREEN con P1.T7] — Unit tests para EliminarTicketUseCase.
 *
 * Todos los repositorios son mockeados (sin Prisma ni DB).
 * El txRunner ejecuta el callback inmediatamente (patrón existente).
 *
 * Cubre (actualizado para ADR-3 — bloqueo por estado):
 * - Ticket no existe → TicketNoEncontradoError (incluye ticket de otro tenant → null)
 * - Ticket ya borrado (isDeleted) → Result.ok no-op (sin save, sin operacion, sin tx)
 * - tipoOperacionId ELIMINACION null → TipoOperacionNoEncontradoError
 * - Estado no encontrado en catálogo → EstadoCatalogoNoEncontradoError (500)
 * - Ticket en APROBADO → TicketNoBorrableError (422)
 * - Ticket en RESUELTO → TicketNoBorrableError (422)
 * - Ticket en EN_PROGRESO → TicketNoBorrableError (422)
 * - Ticket en CERRADO → TicketNoBorrableError (422)  ← CAMBIO: antes era permitido
 * - Happy path (ticket en ABIERTO): softDelete + save + operacion ELIMINACION en tx
 *
 * Ref spec: Req "Bloqueo de borrado por estado" (tickets-core/spec.md), ADR-3
 * Change: tickets-maquina-estados-observaciones / PR1
 */

import { EliminarTicketDto, EliminarTicketUseCase } from './eliminar-ticket.use-case';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TicketEntity, TicketProps } from '../../domain/entities/ticket.entity';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import {
  EstadoCatalogoNoEncontradoError,
  TicketNoBorrableError,
  TicketNoEncontradoError,
  TipoOperacionNoEncontradoError,
} from '../../domain/errors/tickets.errors';

// ─── Constantes ───────────────────────────────────────────────────────────────

const TICKET_ID = 'ticket-uuid-s3-001';
const TIPO_OPERACION_ELIMINACION_ID = 'f0000000-0000-4000-f000-000000000008';
const AUTOR_ID = 'user-autor-s3-001';
const ESTADO_ABIERTO_ID = 'c0000000-0000-4000-c000-000000000001';
const ESTADO_APROBADO_ID = 'c0000000-0000-4000-c000-000000000003';
const ESTADO_EN_PROGRESO_ID = 'c0000000-0000-4000-c000-000000000005';
const ESTADO_RESUELTO_ID = 'c0000000-0000-4000-c000-000000000006';
const ESTADO_CERRADO_ID = 'c0000000-0000-4000-c000-000000000007';

/** Helper para crear un EstadoEntity de test. */
function makeEstado(codigo: string, id: string): EstadoEntity {
  return EstadoEntity.create({ codigo, nombre: codigo, color: null, orden: 10, activo: true }, id);
}

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
    fechaCierre: null,
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

  const mockEstadoRepo = {
    findById: vi.fn<Promise<EstadoEntity | null>, [string]>(),
    findByCodigo: vi.fn(),
    findAllActive: vi.fn(),
    findAll: vi.fn(),
  } satisfies vi.Mocked<IEstadoRepository>;

  const txRunner: ITenantTransactionRunner = {
    run: vi.fn().mockImplementation(async (cb: () => Promise<void>) => cb()),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new EliminarTicketUseCase(
      mockTicketRepo,
      mockOperacionRepo,
      mockTipoOperacionRepo,
      mockEstadoRepo,
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
    mockTicketRepo.findById.mockResolvedValue(makeActiveTicket({ estadoId: ESTADO_ABIERTO_ID }));
    mockEstadoRepo.findById.mockResolvedValue(makeEstado('ABIERTO', ESTADO_ABIERTO_ID));
    mockTipoOperacionRepo.findIdByCodigo.mockResolvedValue(null);

    const result = await useCase.execute(validDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoOperacionNoEncontradoError);
    expect(mockTicketRepo.save).not.toHaveBeenCalled();
    expect(txRunner.run).not.toHaveBeenCalled();
  });

  // ─── Estado no encontrado en catálogo ────────────────────────────────────

  it('retorna EstadoCatalogoNoEncontradoError cuando estadoRepo retorna null (500)', async () => {
    // Spec: Req "Bloqueo de borrado por estado", ADR-3
    // El estadoId del ticket existe en DB pero no en el catálogo → corrupción de datos
    const ticket = makeActiveTicket({ estadoId: ESTADO_ABIERTO_ID });
    mockTicketRepo.findById.mockResolvedValue(ticket);
    mockEstadoRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute(validDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EstadoCatalogoNoEncontradoError);
    expect(mockTicketRepo.save).not.toHaveBeenCalled();
    expect(txRunner.run).not.toHaveBeenCalled();
  });

  // ─── Bloqueo por estado (ADR-3) ───────────────────────────────────────────

  it('retorna TicketNoBorrableError cuando el ticket está en APROBADO (ADR-3)', async () => {
    const ticket = makeActiveTicket({ estadoId: ESTADO_APROBADO_ID });
    mockTicketRepo.findById.mockResolvedValue(ticket);
    mockEstadoRepo.findById.mockResolvedValue(makeEstado('APROBADO', ESTADO_APROBADO_ID));

    const result = await useCase.execute(validDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoBorrableError);
    expect(mockTicketRepo.save).not.toHaveBeenCalled();
    expect(txRunner.run).not.toHaveBeenCalled();
  });

  it('retorna TicketNoBorrableError cuando el ticket está en RESUELTO (ADR-3)', async () => {
    const ticket = makeActiveTicket({ estadoId: ESTADO_RESUELTO_ID });
    mockTicketRepo.findById.mockResolvedValue(ticket);
    mockEstadoRepo.findById.mockResolvedValue(makeEstado('RESUELTO', ESTADO_RESUELTO_ID));

    const result = await useCase.execute(validDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoBorrableError);
    expect(mockTicketRepo.save).not.toHaveBeenCalled();
  });

  it('retorna TicketNoBorrableError cuando el ticket está en EN_PROGRESO (ADR-3)', async () => {
    const ticket = makeActiveTicket({ estadoId: ESTADO_EN_PROGRESO_ID });
    mockTicketRepo.findById.mockResolvedValue(ticket);
    mockEstadoRepo.findById.mockResolvedValue(makeEstado('EN_PROGRESO', ESTADO_EN_PROGRESO_ID));

    const result = await useCase.execute(validDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoBorrableError);
    expect(mockTicketRepo.save).not.toHaveBeenCalled();
  });

  it('retorna TicketNoBorrableError cuando el ticket está en CERRADO (ADR-3 — antes era permitido)', async () => {
    // Cambio de comportamiento: antes CERRADO permitía borrado.
    // Ahora solo ABIERTO permite borrado (whitelist estricta, ADR-3).
    const ticket = makeActiveTicket({ estadoId: ESTADO_CERRADO_ID });
    mockTicketRepo.findById.mockResolvedValue(ticket);
    mockEstadoRepo.findById.mockResolvedValue(makeEstado('CERRADO', ESTADO_CERRADO_ID));

    const result = await useCase.execute(validDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoBorrableError);
    expect(mockTicketRepo.save).not.toHaveBeenCalled();
  });

  // ─── Happy path — ticket activo ABIERTO ──────────────────────────────────

  it('happy path: softDelete del ticket ABIERTO, registra OperacionTicket ELIMINACION en misma tx', async () => {
    // Spec: tickets-core §"Soft delete exitoso de ticket activo"
    const ticket = makeActiveTicket({ estadoId: ESTADO_ABIERTO_ID });
    mockTicketRepo.findById.mockResolvedValue(ticket);
    mockEstadoRepo.findById.mockResolvedValue(makeEstado('ABIERTO', ESTADO_ABIERTO_ID));
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
    expect(operacion.metadata).toBeNull();

    // Atomicidad: ambos saves dentro del txRunner
    expect(txRunner.run).toHaveBeenCalledTimes(1);

    // tipoOperacion consultado con el código correcto
    expect(mockTipoOperacionRepo.findIdByCodigo).toHaveBeenCalledWith('ELIMINACION');

    // estadoRepo consultado con el estadoId del ticket
    expect(mockEstadoRepo.findById).toHaveBeenCalledWith(ESTADO_ABIERTO_ID);
  });
});
