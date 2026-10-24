/**
 * T10.2 [UNIT] — RED→GREEN: `AdjuntarArchivoUseCase` (T20, T21, T22, ADR-7).
 *
 * Todos los puertos mockeados (`vi.fn`) — sin DB, sin filesystem real. Cubre:
 * - adjuntar directo a un ticket (`archivos_ticket`) y a una operación
 *   existente (`archivos_operacion`, resolviendo el ticket dueño vía
 *   `operacionRepo.findById`);
 * - acceso al ticket por `puedeOperarTicket` (`LECTURA` sobre el tipo y fila, más `ALTAS` o
 *   `MODIFICACION` sobre el tipo, odd/permisos-por-tipo-ticket D5 c) — sin ver el ticket → 404
 *   (mismo criterio de "no revela existencia" que `ObtenerTicketUseCase`/`ListarTimelineUseCase`,
 *   T6/T18); viéndolo sin ninguna de las dos acciones → 403;
 * - upload a `IFileStorage` ANTES de la tx (ADR-7) — `archivos` + join +
 *   operación ADJUNTO del timeline DENTRO de la misma tx (T22, T24);
 * - revalidación defensiva de `tamanoBytes > 0` (T21, `ArchivoEntity.create`).
 *
 * Ref spec: sdd/tickets-core/spec T20, T21, T22. Ref design: ADR-7.
 * Tarea: T10.2.
 */
import { AdjuntarArchivoUseCase, AdjuntarArchivoDto } from './adjuntar-archivo.use-case';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { IArchivoRepository } from '../../domain/ports/i-archivo.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { AccionTipoTicket } from '../../domain/permisos-tipo-ticket';
import { alcancePorTipo, alcanceSinRestriccion } from '../../test-helpers/alcance-ticket';
import { IFileStorage } from '../../../shared/domain/ports/i-file-storage';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { unstubbed } from '../../../testing/mocks';
import {
  AccionSobreTipoNoPermitidaError,
  TicketNoEncontradoError,
  ArchivoTamanoCeroError,
  TicketSoloComentariosError,
} from '../../domain/errors/tickets.errors';

const TIPO = 'tipo-soporte-uuid';

/** Alcance del actor del test con `acciones` sobre el tipo del ticket. */
function alcanceCon(...acciones: AccionTipoTicket[]) {
  return alcancePorTipo('actor-uuid', { [TIPO]: acciones });
}

/** Código de estado por id: `estado-<codigo en minúscula>-uuid`. */
function estadoIdDe(codigo: string): string {
  return `estado-${codigo.toLowerCase()}-uuid`;
}

function makeTicket(
  overrides: Partial<{
    solicitanteId: string;
    deleted: boolean;
    tipoId: string;
    estado: string;
  }> = {},
) {
  const ticket = TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Ticket de prueba',
      descripcion: null,
      tipoId: overrides.tipoId ?? TIPO,
      estadoId: estadoIdDe(overrides.estado ?? 'NUEVO'),
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
    ...alcanceCon('LECTURA', 'ALTAS'),
    ...overrides,
  };
}

describe('AdjuntarArchivoUseCase (T10.2)', () => {
  function makeCollaborators() {
    const ticketRepo = {
      findById: vi.fn<ITicketRepository['findById']>(),
      esVisiblePara: vi.fn<ITicketRepository['esVisiblePara']>().mockResolvedValue(false),
    };
    const operacionRepo = {
      findById: vi.fn<IOperacionTicketRepository['findById']>(),
      save: vi.fn<IOperacionTicketRepository['save']>().mockResolvedValue(undefined),
    };
    const archivoRepo = {
      save: vi.fn<IArchivoRepository['save']>().mockResolvedValue(undefined),
      linkToTicket: vi.fn<IArchivoRepository['linkToTicket']>().mockResolvedValue(undefined),
      linkToOperacion: vi.fn<IArchivoRepository['linkToOperacion']>().mockResolvedValue(undefined),
    };
    const tipoOperacionRepo = {
      findIdByCodigo: vi
        .fn<ITipoOperacionRepository['findIdByCodigo']>()
        .mockResolvedValue('tipo-op-adjunto-uuid'),
    };
    const fileStorage = {
      upload: vi.fn<IFileStorage['upload']>().mockResolvedValue('storage-key-confirmada'),
    };
    const txRunnerReal: ITenantTransactionRunner = {
      run: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
      alCommitear: unstubbed('alCommitear'),
    };
    const txRunner = { run: vi.spyOn(txRunnerReal, 'run') };
    const estadoRepo = {
      findById: vi.fn(async (id: string) => {
        const codigo = ['NUEVO', 'EN_PROCESO', 'RESUELTO', 'CERRADO', 'CANCELADO'].find(
          (c) => estadoIdDe(c) === id,
        );
        return codigo
          ? EstadoEntity.create({ codigo, nombre: codigo, color: null, orden: 1, activo: true }, id)
          : null;
      }),
    };

    const useCase = new AdjuntarArchivoUseCase(
      ticketRepo,
      operacionRepo,
      archivoRepo,
      tipoOperacionRepo,
      fileStorage,
      txRunnerReal,
      estadoRepo,
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

  it('actor que no ve el ticket (ni solicitante, ni responsable, ni técnico, sin VER_TODOS) → 404 (no revela existencia)', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket({ solicitanteId: 'otro-usuario-uuid' }));

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(c.fileStorage.upload).not.toHaveBeenCalled();
  });

  it('actor SIN ser solicitante pero CON VER_TODOS → acceso permitido', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket({ solicitanteId: 'otro-usuario-uuid' }));

    const result = await c.useCase.execute(baseDto(alcanceCon('LECTURA', 'VER_TODOS', 'ALTAS')));

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

  it('ticket de solicitante externo (solicitanteId null): sin VER_TODOS → 404 y no sube nada', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(
      TicketEntity.create(
        {
          numero: 'SOP-2026-00002',
          titulo: 'Pedido del formulario publico',
          descripcion: null,
          tipoId: TIPO,
          estadoId: 'estado-uuid',
          prioridadId: 'prioridad-uuid',
          cicloId: null,
          ticketReferenciaId: null,
          solicitanteId: null,
          solicitanteExternoId: 'externo-uuid',
        },
        'ticket-uuid',
      ),
    );

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(c.fileStorage.upload).not.toHaveBeenCalled();
  });

  describe('acceso por el punto único (odd/permisos-por-tipo-ticket, S0, D5 c)', () => {
    it('el responsable del ticket, sin VER_TODOS, adjunta', async () => {
      const c = makeCollaborators();
      const ticket = makeTicket({ solicitanteId: 'otro-usuario-uuid' });
      ticket.assignTo('actor-uuid');
      c.ticketRepo.findById.mockResolvedValue(ticket);

      const result = await c.useCase.execute(baseDto());

      expect(result.isOk()).toBe(true);
      expect(c.archivoRepo.save).toHaveBeenCalledTimes(1);
      expect(c.archivoRepo.linkToTicket).toHaveBeenCalledWith(result.getValue().id, 'ticket-uuid');
    });

    it('el técnico de una tarea activa (visible por fila), sin VER_TODOS, adjunta a una operación del ticket', async () => {
      const c = makeCollaborators();
      c.operacionRepo.findById.mockResolvedValue(
        OperacionTicketEntity.create(
          {
            ticketId: 'ticket-uuid',
            tipoOperacionId: 'tipo-op-comentario-uuid',
            descripcion: 'Comentario original',
            estadoAnteriorId: null,
            estadoNuevoId: null,
            autorId: 'otro-usuario-uuid',
            esInterno: false,
            metadata: null,
          },
          'operacion-uuid',
        ),
      );
      c.ticketRepo.findById.mockResolvedValue(makeTicket({ solicitanteId: 'otro-usuario-uuid' }));
      c.ticketRepo.esVisiblePara.mockResolvedValue(true);

      const result = await c.useCase.execute(
        baseDto({ ticketId: undefined, operacionId: 'operacion-uuid' }),
      );

      expect(result.isOk()).toBe(true);
      expect(c.ticketRepo.esVisiblePara).toHaveBeenCalledWith('ticket-uuid', 'actor-uuid');
      expect(c.archivoRepo.linkToOperacion).toHaveBeenCalledTimes(1);
    });

    it('el solicitante, sin VER_TODOS, adjunta', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket({ solicitanteId: 'actor-uuid' }));

      const result = await c.useCase.execute(baseDto());

      expect(result.isOk()).toBe(true);
      expect(c.archivoRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('permisos por tipo (odd/permisos-por-tipo-ticket, S2, S3, D5 c)', () => {
    it.each<AccionTipoTicket>(['ALTAS', 'MODIFICACION'])(
      'con LECTURA y %s sobre el tipo adjunta',
      async (accion) => {
        const c = makeCollaborators();
        c.ticketRepo.findById.mockResolvedValue(makeTicket({ solicitanteId: 'actor-uuid' }));

        const result = await c.useCase.execute(baseDto(alcanceCon('LECTURA', accion)));

        expect(result.isOk()).toBe(true);
        expect(c.archivoRepo.save).toHaveBeenCalledTimes(1);
      },
    );

    it('con solo LECTURA sobre el tipo es 403; no sube ni persiste nada', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket({ solicitanteId: 'actor-uuid' }));

      const result = await c.useCase.execute(baseDto(alcanceCon('LECTURA')));

      expect(result.getError()).toBeInstanceOf(AccionSobreTipoNoPermitidaError);
      expect(result.getError().message).toBe(
        'El usuario no tiene el permiso "ALTAS o MODIFICACION" sobre el tipo de este ticket.',
      );
      expect(c.fileStorage.upload).not.toHaveBeenCalled();
      expect(c.txRunner.run).not.toHaveBeenCalled();
      expect(c.archivoRepo.save).not.toHaveBeenCalled();
      expect(c.operacionRepo.save).not.toHaveBeenCalled();
    });

    it('un ticket de un tipo sin LECTURA es 404 aunque el actor sea su solicitante; no sube ni persiste nada', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(
        makeTicket({ solicitanteId: 'actor-uuid', tipoId: 'tipo-electricidad-uuid' }),
      );

      const result = await c.useCase.execute(baseDto());

      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(c.fileStorage.upload).not.toHaveBeenCalled();
      expect(c.txRunner.run).not.toHaveBeenCalled();
      expect(c.archivoRepo.save).not.toHaveBeenCalled();
    });

    it('adjuntar a una operación de un ticket de un tipo sin LECTURA también es 404', async () => {
      const c = makeCollaborators();
      c.operacionRepo.findById.mockResolvedValue(
        OperacionTicketEntity.create(
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
        ),
      );
      c.ticketRepo.findById.mockResolvedValue(
        makeTicket({ solicitanteId: 'actor-uuid', tipoId: 'tipo-electricidad-uuid' }),
      );

      const result = await c.useCase.execute(
        baseDto({ ticketId: undefined, operacionId: 'operacion-uuid' }),
      );

      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(c.fileStorage.upload).not.toHaveBeenCalled();
      expect(c.txRunner.run).not.toHaveBeenCalled();
    });

    it('sin restricción (ROOT o ADMINISTRADOR) adjunta en un tipo sin filas', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(
        makeTicket({ solicitanteId: 'otro-usuario-uuid', tipoId: 'tipo-electricidad-uuid' }),
      );

      const result = await c.useCase.execute(baseDto(alcanceSinRestriccion('actor-uuid')));

      expect(result.isOk()).toBe(true);
    });

    it('la acción no reemplaza la regla de fila: con ALTAS sobre el tipo, un ticket que no ve sigue siendo 404', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket({ solicitanteId: 'otro-usuario-uuid' }));

      const result = await c.useCase.execute(baseDto());

      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(c.fileStorage.upload).not.toHaveBeenCalled();
    });
  });
  describe('resuelto, cerrado o cancelado: solo comentarios (odd/cerrado-solo-comentarios, S5)', () => {
    it.each(['RESUELTO', 'CERRADO', 'CANCELADO'])(
      'en %s un no administrador recibe TicketSoloComentariosError (422): no sube ni persiste nada',
      async (estado) => {
        const c = makeCollaborators();
        c.ticketRepo.findById.mockResolvedValue(
          makeTicket({ solicitanteId: 'actor-uuid', estado }),
        );

        const result = await c.useCase.execute(baseDto());

        const error = result.getError();
        expect(error).toBeInstanceOf(TicketSoloComentariosError);
        expect((error as TicketSoloComentariosError).estadoCodigo).toBe(estado);
        expect(c.fileStorage.upload).not.toHaveBeenCalled();
        expect(c.txRunner.run).not.toHaveBeenCalled();
        expect(c.archivoRepo.save).not.toHaveBeenCalled();
        expect(c.operacionRepo.save).not.toHaveBeenCalled();
      },
    );

    it('adjuntar a una operación de un ticket CERRADO también se rechaza, sin subir nada', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(
        makeTicket({ solicitanteId: 'actor-uuid', estado: 'CERRADO' }),
      );
      c.operacionRepo.findById.mockResolvedValue(
        OperacionTicketEntity.create({
          ticketId: 'ticket-uuid',
          tipoOperacionId: 'tipo-op-comentario-uuid',
          descripcion: 'Comentario',
          estadoAnteriorId: null,
          estadoNuevoId: null,
          autorId: 'actor-uuid',
          esInterno: false,
          metadata: null,
        }),
      );

      const result = await c.useCase.execute(
        baseDto({ ticketId: undefined, operacionId: 'operacion-uuid' }),
      );

      expect(result.getError()).toBeInstanceOf(TicketSoloComentariosError);
      expect(c.fileStorage.upload).not.toHaveBeenCalled();
      expect(c.archivoRepo.linkToOperacion).not.toHaveBeenCalled();
    });

    it.each(['RESUELTO', 'CERRADO', 'CANCELADO'])(
      'en %s un ADMINISTRADOR o ROOT adjunta (S3)',
      async (estado) => {
        const c = makeCollaborators();
        c.ticketRepo.findById.mockResolvedValue(makeTicket({ estado }));

        const result = await c.useCase.execute(baseDto(alcanceSinRestriccion('actor-uuid')));

        expect(result.isOk()).toBe(true);
        expect(c.fileStorage.upload).toHaveBeenCalledTimes(1);
        expect(c.archivoRepo.linkToTicket).toHaveBeenCalledWith(
          result.getValue().id,
          'ticket-uuid',
        );
      },
    );

    it('EN_PROCESO no cambia: un no administrador adjunta', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(
        makeTicket({ solicitanteId: 'actor-uuid', estado: 'EN_PROCESO' }),
      );

      expect((await c.useCase.execute(baseDto())).isOk()).toBe(true);
    });
  });
});
