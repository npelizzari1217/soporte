/**
 * S2-T10 [TEST] — Unit tests para EditarTicketUseCase.
 *
 * Todos los repositorios son mockeados (sin Prisma ni DB).
 * El txRunner ejecuta el callback inmediatamente (patrón existente).
 *
 * Cubre:
 * - Ticket no existe → TicketNoEncontradoError
 * - Ticket soft-deleted → TicketNoEncontradoError (tratado como inexistente)
 * - Estado catálogo null → EstadoCatalogoNoEncontradoError (500 - corrupción)
 * - canEdit false (estado terminal) → TicketNoEditableError
 * - prioridadId definido y no encontrado → PrioridadNoEncontradaError
 * - cicloId definido y no-null y no encontrado → CicloNoEncontradoError
 * - titulo vacío → TituloInvalidoError
 * - tipoOperacionId EDICION null → TipoOperacionNoEncontradoError
 * - Happy path: save ticket + operacion EDICION en misma tx, metadata.camposModificados
 *
 * Ref spec: tickets-core §"Edición exitosa de campos de datos",
 *           tickets-editar-borrar locked decision L1/L4
 */

import { EditarTicketDto, EditarTicketUseCase } from './editar-ticket.use-case';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { IPrioridadRepository } from '../../domain/ports/i-prioridad.repository';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TicketEntity, TicketProps } from '../../domain/entities/ticket.entity';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import {
  TicketNoEncontradoError,
  EstadoCatalogoNoEncontradoError,
  TicketNoEditableError,
  PrioridadNoEncontradaError,
  CicloNoEncontradoError,
  TituloInvalidoError,
  TipoOperacionNoEncontradoError,
} from '../../domain/errors/tickets.errors';

// ─── Constantes ───────────────────────────────────────────────────────────────

const TICKET_ID = 'ticket-uuid-001';
const ESTADO_ABIERTO_ID = 'c0000000-0000-4000-c000-000000000001';
const ESTADO_CERRADO_ID = 'c0000000-0000-4000-c000-000000000003';
const TIPO_OPERACION_EDICION_ID = 'f0000000-0000-4000-f000-000000000007';
const PRIORIDAD_ID = 'd0000000-0000-4000-d000-000000000002';
const CICLO_ID = 'ciclo-uuid-001';
const AUTOR_ID = 'user-autor-001';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTicketProps(overrides: Partial<TicketProps> = {}): TicketProps {
  return {
    numero: 'SOP-2026-00001',
    titulo: 'Título original',
    descripcion: 'Descripción original',
    tipoId: 'tipo-uuid-001',
    estadoId: ESTADO_ABIERTO_ID,
    prioridadId: PRIORIDAD_ID,
    cicloId: null,
    solicitanteId: 'user-solicitante-001',
    asignadoId: null,
    fechaCierre: null,
    ...overrides,
  };
}

function makeTicket(overrides: Partial<TicketProps> = {}): TicketEntity {
  return TicketEntity.reconstitute(
    makeTicketProps(overrides),
    TICKET_ID,
    new Date(),
    new Date(),
    null,
  );
}

function makeDeletedTicket(): TicketEntity {
  return TicketEntity.reconstitute(
    makeTicketProps(),
    TICKET_ID,
    new Date(),
    new Date(),
    new Date(), // deletedAt seteado → soft-deleted
  );
}

function makeEstadoAbierto(): EstadoEntity {
  return EstadoEntity.reconstitute(
    { codigo: 'ABIERTO', nombre: 'Abierto', color: null, orden: 1, activo: true },
    ESTADO_ABIERTO_ID,
    new Date(),
    new Date(),
    null,
  );
}

function makeEstadoCerrado(): EstadoEntity {
  return EstadoEntity.reconstitute(
    { codigo: 'CERRADO', nombre: 'Cerrado', color: null, orden: 4, activo: true },
    ESTADO_CERRADO_ID,
    new Date(),
    new Date(),
    null,
  );
}

const validDto: EditarTicketDto = {
  ticketId: TICKET_ID,
  datos: { titulo: 'Nuevo título' },
  autorId: AUTOR_ID,
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('EditarTicketUseCase', () => {
  let useCase: EditarTicketUseCase;

  const mockTicketRepo = {
    findById: vi.fn<Promise<TicketEntity | null>, [string]>(),
    findByNumero: vi.fn(),
    findLastSecuencia: vi.fn(),
    findAll: vi.fn(),
    findByEstado: vi.fn(),
    save: vi.fn<Promise<void>, [TicketEntity]>(),
    delete: vi.fn(),
  } satisfies vi.Mocked<ITicketRepository>;

  const mockEstadoRepo = {
    findById: vi.fn<Promise<EstadoEntity | null>, [string]>(),
    findByCodigo: vi.fn(),
    findAllActive: vi.fn(),
    findAll: vi.fn(),
  } satisfies vi.Mocked<IEstadoRepository>;

  const mockPrioridadRepo = {
    findById: vi.fn<Promise<any | null>, [string]>(),
  } satisfies vi.Mocked<IPrioridadRepository>;

  const mockCicloRepo = {
    findById: vi.fn<Promise<any | null>, [string]>(),
    findActive: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn(),
  } satisfies vi.Mocked<ICicloClienteRepository>;

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
    useCase = new EditarTicketUseCase(
      mockTicketRepo,
      mockEstadoRepo,
      mockPrioridadRepo,
      mockCicloRepo,
      mockOperacionRepo,
      mockTipoOperacionRepo,
      txRunner,
    );
  });

  // ─── Ticket no existe ─────────────────────────────────────────────────────

  it('retorna TicketNoEncontradoError cuando el ticket no existe', async () => {
    mockTicketRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute(validDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(mockEstadoRepo.findById).not.toHaveBeenCalled();
  });

  // ─── Ticket soft-deleted ──────────────────────────────────────────────────

  it('retorna TicketNoEncontradoError cuando el ticket está soft-deleted', async () => {
    // Spec: tickets-core §"Edición rechazada — ticket soft-deleted"
    mockTicketRepo.findById.mockResolvedValue(makeDeletedTicket());

    const result = await useCase.execute(validDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(mockEstadoRepo.findById).not.toHaveBeenCalled();
  });

  // ─── Estado catálogo null ─────────────────────────────────────────────────

  it('retorna EstadoCatalogoNoEncontradoError cuando el estado catálogo no existe', async () => {
    // Catálogo corrupto → 500. Mismo patrón que transicionar-estado.
    mockTicketRepo.findById.mockResolvedValue(makeTicket());
    mockEstadoRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute(validDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EstadoCatalogoNoEncontradoError);
  });

  // ─── canEdit false (estado terminal) ─────────────────────────────────────

  it('retorna TicketNoEditableError cuando el ticket está en estado terminal CERRADO', async () => {
    // Spec: tickets-core §"Edición rechazada — ticket en estado terminal CERRADO"
    const ticketCerrado = makeTicket({ estadoId: ESTADO_CERRADO_ID });
    mockTicketRepo.findById.mockResolvedValue(ticketCerrado);
    mockEstadoRepo.findById.mockResolvedValue(makeEstadoCerrado());

    const result = await useCase.execute(validDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEditableError);
    expect(mockTicketRepo.save).not.toHaveBeenCalled();
  });

  // ─── prioridadId FK inválida ──────────────────────────────────────────────

  it('retorna PrioridadNoEncontradaError cuando prioridadId definido no existe', async () => {
    // Locked decision L4: validar prioridadId vs catálogo → 422
    mockTicketRepo.findById.mockResolvedValue(makeTicket());
    mockEstadoRepo.findById.mockResolvedValue(makeEstadoAbierto());
    mockPrioridadRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute({
      ...validDto,
      datos: { prioridadId: 'prioridad-inexistente' },
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PrioridadNoEncontradaError);
    expect(mockTicketRepo.save).not.toHaveBeenCalled();
  });

  // ─── cicloId FK inválida ──────────────────────────────────────────────────

  it('retorna CicloNoEncontradoError cuando cicloId definido y no-null no existe', async () => {
    // Locked decision L4
    mockTicketRepo.findById.mockResolvedValue(makeTicket());
    mockEstadoRepo.findById.mockResolvedValue(makeEstadoAbierto());
    mockCicloRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute({
      ...validDto,
      datos: { cicloId: 'ciclo-inexistente' },
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CicloNoEncontradoError);
    expect(mockTicketRepo.save).not.toHaveBeenCalled();
  });

  // ─── cicloId null no valida FK ────────────────────────────────────────────

  it('no valida FK cuando cicloId es null (limpiar el campo)', async () => {
    // cicloId null = limpiar, no es FK que buscar
    mockTicketRepo.findById.mockResolvedValue(makeTicket({ cicloId: CICLO_ID }));
    mockEstadoRepo.findById.mockResolvedValue(makeEstadoAbierto());
    mockTipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OPERACION_EDICION_ID);

    const result = await useCase.execute({
      ...validDto,
      datos: { cicloId: null },
    });

    expect(mockCicloRepo.findById).not.toHaveBeenCalled();
    expect(result.isOk()).toBe(true);
  });

  // ─── titulo vacío ─────────────────────────────────────────────────────────

  it('retorna TituloInvalidoError cuando el titulo es vacío tras trim', async () => {
    // Spec: tickets-core §"Edición exitosa de campos de datos" (campo no-vacío es invariante)
    mockTicketRepo.findById.mockResolvedValue(makeTicket());
    mockEstadoRepo.findById.mockResolvedValue(makeEstadoAbierto());

    const result = await useCase.execute({
      ...validDto,
      datos: { titulo: '   ' },
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TituloInvalidoError);
    expect(mockTicketRepo.save).not.toHaveBeenCalled();
  });

  // ─── tipo operacion EDICION null ──────────────────────────────────────────

  it('retorna TipoOperacionNoEncontradoError cuando EDICION no está en catálogo', async () => {
    // Spec: tickets-core §"Rollback si falla registro de auditoría en edición" → 500
    mockTicketRepo.findById.mockResolvedValue(makeTicket());
    mockEstadoRepo.findById.mockResolvedValue(makeEstadoAbierto());
    mockTipoOperacionRepo.findIdByCodigo.mockResolvedValue(null);

    const result = await useCase.execute(validDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoOperacionNoEncontradoError);
    expect(mockTicketRepo.save).not.toHaveBeenCalled();
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  it('happy path: actualiza ticket, registra OperacionTicket EDICION en misma tx', async () => {
    // Spec: tickets-core §"Edición exitosa de campos de datos"
    const ticket = makeTicket();
    mockTicketRepo.findById.mockResolvedValue(ticket);
    mockEstadoRepo.findById.mockResolvedValue(makeEstadoAbierto());
    mockTipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OPERACION_EDICION_ID);

    const dto: EditarTicketDto = {
      ticketId: TICKET_ID,
      datos: { titulo: 'Título actualizado' },
      autorId: AUTOR_ID,
    };

    const result = await useCase.execute(dto);

    // Resultado ok
    expect(result.isOk()).toBe(true);
    expect(result.getValue().titulo).toBe('Título actualizado');

    // ticketRepo.save llamado con ticket mutado
    expect(mockTicketRepo.save).toHaveBeenCalledWith(ticket);

    // operacionRepo.save llamado con operacion de tipo EDICION
    expect(mockOperacionRepo.save).toHaveBeenCalledTimes(1);
    const operacion = mockOperacionRepo.save.mock.calls[0][0] as OperacionTicketEntity;
    expect(operacion.tipoOperacionId).toBe(TIPO_OPERACION_EDICION_ID);
    expect(operacion.ticketId).toBe(TICKET_ID);
    expect(operacion.autorId).toBe(AUTOR_ID);
    expect(operacion.estadoAnteriorId).toBeNull();
    expect(operacion.estadoNuevoId).toBeNull();

    // metadata.camposModificados contiene solo las keys enviadas
    expect(operacion.metadata).toEqual({ camposModificados: ['titulo'] });

    // txRunner usado (atomicidad)
    expect(txRunner.run).toHaveBeenCalledTimes(1);
  });

  it('happy path: camposModificados refleja solo los campos enviados en datos', async () => {
    const ticket = makeTicket();
    mockTicketRepo.findById.mockResolvedValue(ticket);
    mockEstadoRepo.findById.mockResolvedValue(makeEstadoAbierto());
    mockPrioridadRepo.findById.mockResolvedValue({ id: PRIORIDAD_ID }); // prioridad existe
    mockTipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OPERACION_EDICION_ID);

    const result = await useCase.execute({
      ticketId: TICKET_ID,
      datos: { titulo: 'Nuevo', prioridadId: PRIORIDAD_ID },
      autorId: AUTOR_ID,
    });

    expect(result.isOk()).toBe(true);
    const operacion = mockOperacionRepo.save.mock.calls[0][0] as OperacionTicketEntity;
    expect(operacion.metadata).toEqual({
      camposModificados: expect.arrayContaining(['titulo', 'prioridadId']),
    });
    expect((operacion.metadata as any).camposModificados).toHaveLength(2);
  });

  it('happy path con datos vacíos: save llamado, camposModificados vacío', async () => {
    const ticket = makeTicket();
    mockTicketRepo.findById.mockResolvedValue(ticket);
    mockEstadoRepo.findById.mockResolvedValue(makeEstadoAbierto());
    mockTipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OPERACION_EDICION_ID);

    const result = await useCase.execute({
      ticketId: TICKET_ID,
      datos: {}, // sin cambios
      autorId: AUTOR_ID,
    });

    expect(result.isOk()).toBe(true);
    const operacion = mockOperacionRepo.save.mock.calls[0][0] as OperacionTicketEntity;
    expect(operacion.metadata).toEqual({ camposModificados: [] });
  });
});
