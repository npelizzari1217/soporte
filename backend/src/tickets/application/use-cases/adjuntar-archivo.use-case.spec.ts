/**
 * T10.2 [UNIT] — RED→GREEN: `AdjuntarArchivoUseCase` (T20, T21, T22, ADR-7).
 *
 * Todos los puertos mockeados (`vi.fn`) — sin DB, sin filesystem real. Cubre:
 * - adjuntar directo a un ticket (`archivos_ticket`) y a una operación
 *   existente (`archivos_operacion`, resolviendo el ticket dueño vía
 *   `operacionRepo.findById`);
 * - acceso al ticket (solicitante, `ticket:ver_todos` o `ticket:editar` —
 *   ADR-2, sin permiso RBAC dedicado) — sin acceso → 404 (mismo criterio de
 *   "no revela existencia" que `ObtenerTicketUseCase`/`ListarTimelineUseCase`, T6/T18);
 * - upload a `IFileStorage` ANTES de la tx (ADR-7) — `archivos` + join +
 *   operación ADJUNTO del timeline DENTRO de la misma tx (T22, T24);
 * - revalidación defensiva de `tamanoBytes > 0` (T21, `ArchivoEntity.create`).
 *
 * Ref spec: sdd/tickets-core/spec T20, T21, T22. Ref design: ADR-2, ADR-7.
 * Tarea: T10.2.
 */
import { AdjuntarArchivoUseCase, AdjuntarArchivoDto } from './adjuntar-archivo.use-case';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import {
  TicketNoEncontradoError,
  ArchivoTamanoCeroError,
} from '../../domain/errors/tickets.errors';

function makeTicket(overrides: Partial<{ solicitanteId: string; deleted: boolean }> = {}) {
  const ticket = TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Ticket de prueba',
      descripcion: null,
      tipoId: 'tipo-soporte-uuid',
      estadoId: 'estado-nuevo-uuid',
      prioridadId: 'prioridad-media-uuid',
      cicloId: 'ciclo-uuid',
      ticketReferenciaId: null,
      solicitanteId: overrides.solicitanteId ?? 'solicitante-uuid',
    },
    'ticket-uuid',
  );
  if (overrides.deleted) {
    ticket.softDelete();
  }
  return ticket;
}

function baseDto(overrides: Partial<AdjuntarArchivoDto> = {}): AdjuntarArchivoDto {
  return {
    ticketId: 'ticket-uuid',
    nombreOriginal: 'foto.png',
    mimeType: 'image/png',
    tamanoBytes: BigInt(1024),
    buffer: Buffer.from('contenido-binario'),
    subidoPorId: 'actor-uuid',
    actorId: 'actor-uuid',
    tienePermisoVerTodos: false,
    tienePermisoEditar: false,
    ...overrides,
  };
}

describe('AdjuntarArchivoUseCase (T10.2)', () => {
  function makeCollaborators() {
    const ticketRepo = { findById: vi.fn() };
    const operacionRepo = { findById: vi.fn(), save: vi.fn().mockResolvedValue(undefined) };
    const archivoRepo = {
      save: vi.fn().mockResolvedValue(undefined),
      linkToTicket: vi.fn().mockResolvedValue(undefined),
      linkToOperacion: vi.fn().mockResolvedValue(undefined),
    };
    const tipoOperacionRepo = {
      findIdByCodigo: vi.fn().mockResolvedValue('tipo-op-adjunto-uuid'),
    };
    const fileStorage = { upload: vi.fn().mockResolvedValue('storage-key-confirmada') };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new AdjuntarArchivoUseCase(
      ticketRepo as never,
      operacionRepo as never,
      archivoRepo as never,
      tipoOperacionRepo as never,
      fileStorage as never,
      txRunner as never,
    );

    return {
      useCase,
      ticketRepo,
      operacionRepo,
      archivoRepo,
      tipoOperacionRepo,
      fileStorage,
      txRunner,
    };
  }

  it('T22: adjunta directo a un ticket — sube ANTES de la tx, persiste archivo+join+operación ADJUNTO DENTRO de la tx', async () => {
    const c = makeCollaborators();
    const ticket = makeTicket({ solicitanteId: 'actor-uuid' });
    c.ticketRepo.findById.mockResolvedValue(ticket);

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    const archivo = result.getValue();

    // Upload ANTES de la tx (ADR-7).
    expect(c.fileStorage.upload).toHaveBeenCalledTimes(1);
    const [key, buffer, mime] = c.fileStorage.upload.mock.calls[0];
    expect(key).toBe(`tickets/ticket-uuid/${archivo.id}`);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(mime).toBe('image/png');
    expect(c.fileStorage.upload.mock.invocationCallOrder[0]).toBeLessThan(
      c.txRunner.run.mock.invocationCallOrder[0],
    );

    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.archivoRepo.save).toHaveBeenCalledWith(archivo);
    expect(c.archivoRepo.linkToTicket).toHaveBeenCalledWith(archivo.id, 'ticket-uuid');
    expect(c.archivoRepo.linkToOperacion).not.toHaveBeenCalled();

    expect(c.operacionRepo.save).toHaveBeenCalledTimes(1);
    const operacionGuardada = c.operacionRepo.save.mock.calls[0][0] as OperacionTicketEntity;
    expect(operacionGuardada.ticketId).toBe('ticket-uuid');
    expect(operacionGuardada.tipoOperacionId).toBe('tipo-op-adjunto-uuid');
    expect(operacionGuardada.descripcion).toBe('foto.png');
    expect(operacionGuardada.autorId).toBe('actor-uuid');
    expect(operacionGuardada.esInterno).toBe(false);
  });

  it('T22: adjunta a una operación existente — resuelve el ticket dueño, storage key usa el operacionId, linkToOperacion', async () => {
    const c = makeCollaborators();
    const ticket = makeTicket({ solicitanteId: 'actor-uuid' });
    const operacionExistente = OperacionTicketEntity.create(
      {
        ticketId: 'ticket-uuid',
        tipoOperacionId: 'tipo-op-comentario-uuid',
        descripcion: 'Comentario original',
        estadoAnteriorId: null,
        estadoNuevoId: null,
        autorId: 'actor-uuid',
        esInterno: false,
        metadata: null,
      },
      'operacion-uuid',
    );
    c.operacionRepo.findById.mockResolvedValue(operacionExistente);
    c.ticketRepo.findById.mockResolvedValue(ticket);

    const result = await c.useCase.execute(
      baseDto({ ticketId: undefined, operacionId: 'operacion-uuid' }),
    );

    expect(result.isOk()).toBe(true);
    const archivo = result.getValue();
    const [key] = c.fileStorage.upload.mock.calls[0];
    expect(key).toBe(`operaciones/operacion-uuid/${archivo.id}`);

    expect(c.archivoRepo.linkToOperacion).toHaveBeenCalledWith(archivo.id, 'operacion-uuid');
    expect(c.archivoRepo.linkToTicket).not.toHaveBeenCalled();

    // Igual registra una operación ADJUNTO nueva en el timeline del ticket dueño (T22).
    const operacionGuardada = c.operacionRepo.save.mock.calls[0][0] as OperacionTicketEntity;
    expect(operacionGuardada.ticketId).toBe('ticket-uuid');
    expect(operacionGuardada.tipoOperacionId).toBe('tipo-op-adjunto-uuid');
  });

  it('ticket inexistente → 404 TicketNoEncontrado, sin subir ni tocar la tx', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(c.fileStorage.upload).not.toHaveBeenCalled();
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('ticket soft-deleted → 404 TicketNoEncontrado', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(
      makeTicket({ solicitanteId: 'actor-uuid', deleted: true }),
    );

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
  });

  it('operación destino inexistente (adjuntar a operación) → 404 TicketNoEncontrado', async () => {
    const c = makeCollaborators();
    c.operacionRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute(
      baseDto({ ticketId: undefined, operacionId: 'operacion-inexistente' }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(c.ticketRepo.findById).not.toHaveBeenCalled();
  });

  it('ADR-2: actor NI es solicitante NI tiene ticket:ver_todos/ticket:editar → 404 (no revela existencia)', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket({ solicitanteId: 'otro-usuario-uuid' }));

    const result = await c.useCase.execute(
      baseDto({ tienePermisoVerTodos: false, tienePermisoEditar: false }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(c.fileStorage.upload).not.toHaveBeenCalled();
  });

  it('ADR-2: actor SIN ser solicitante pero CON ticket:ver_todos → acceso permitido', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket({ solicitanteId: 'otro-usuario-uuid' }));

    const result = await c.useCase.execute(baseDto({ tienePermisoVerTodos: true }));

    expect(result.isOk()).toBe(true);
  });

  it('ADR-2: actor SIN ser solicitante pero CON ticket:editar → acceso permitido', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket({ solicitanteId: 'otro-usuario-uuid' }));

    const result = await c.useCase.execute(baseDto({ tienePermisoEditar: true }));

    expect(result.isOk()).toBe(true);
  });

  it('T21: revalidación defensiva — tamanoBytes=0 → 422 ArchivoTamanoCero, sin subir ni tocar la tx', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket({ solicitanteId: 'actor-uuid' }));

    const result = await c.useCase.execute(baseDto({ tamanoBytes: BigInt(0) }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ArchivoTamanoCeroError);
    expect(c.fileStorage.upload).not.toHaveBeenCalled();
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('catálogo tipo_operacion "ADJUNTO" inconsistente (ausente) → throw defensivo de infraestructura', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket({ solicitanteId: 'actor-uuid' }));
    c.tipoOperacionRepo.findIdByCodigo.mockResolvedValue(null);

    await expect(c.useCase.execute(baseDto())).rejects.toThrow(/ADJUNTO/);
  });
});
