import { describe, it, expect, vi } from 'vitest';
import { CrearTicketSoporteUseCase } from './crear-ticket-soporte.use-case';
import { CicloClienteEntity } from '../../../tickets/domain/entities/ciclo-cliente.entity';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { EquipoInvalidoError } from '../../domain/errors/equipos.errors';
import { Result } from '../../../shared/domain/result';
import { SolicitanteInvalidoError } from '../../../tickets/domain/errors/tickets.errors';
import { AUTOR_FORMULARIO_PUBLICO } from '../../../tickets/domain/constants/formulario-publico.constants';
import { TicketCreadoEvent } from '../../../tickets/domain/events/ticket-creado.event';
import { TicketAsignadoEvent } from '../../../tickets/domain/events/ticket-asignado.event';
import { AUTOR_SISTEMA } from '../../../tickets/domain/constants/autor-sistema.constants';
import { TipoTicketEntity } from '../../../tickets/domain/entities/tipo-ticket.entity';
import type { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import type { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import type { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import type { NumeradorTicket } from '../../../tickets/domain/services/numerador-ticket.service';
import type { ResolverCicloActivoParaCreacion } from '../../../tickets/application/services/resolver-ciclo-activo.service';
import type { ResolverAsignacionAutomatica } from '../../../tickets/application/services/resolver-asignacion-automatica.service';
import type { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import type { IOperacionTicketRepository } from '../../../tickets/domain/ports/i-operacion-ticket.repository';
import type { IEstadoRepository } from '../../../tickets/domain/ports/i-estado.repository';
import type { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import type { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import type { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import type { ITicketSoporteRepository } from '../../domain/ports/i-ticket-soporte.repository';
import type { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';

/**
 * T13.1 [U][RED] — CrearTicketSoporteUseCase: base+satélite tx; equipoId
 * null → crea OK; equipoId inválido/inactivo/eliminado → EquipoInvalidoError;
 * numero SOP-.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q4.
 */
describe('CrearTicketSoporteUseCase', () => {
  function makeDeps() {
    const ticketRepo = { save: vi.fn<ITicketRepository['save']>().mockResolvedValue(undefined) };
    const operacionRepo = {
      save: vi.fn<IOperacionTicketRepository['save']>().mockResolvedValue(undefined),
    };
    const ticketSoporteRepo = {
      save: vi.fn<ITicketSoporteRepository['save']>().mockResolvedValue(undefined),
    };
    const equipoRepo = {
      bloquearParaOperarPiezas: vi
        .fn<IEquipoInformaticoRepository['bloquearParaOperarPiezas']>()
        .mockResolvedValue(null),
    };
    const estadoRepo = {
      findIdByCodigo: vi
        .fn<IEstadoRepository['findIdByCodigo']>()
        .mockResolvedValue('estado-nuevo-id'),
    };
    const tipoTicketRepo = {
      findByCodigo: vi
        .fn<ITipoTicketRepository['findByCodigo']>()
        .mockResolvedValue(
          TipoTicketEntity.create(
            { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'TICKETS', activo: true },
            'tipo-soporte-id',
          ),
        ),
    };
    const tipoOperacionRepo = {
      findIdByCodigo: vi
        .fn<ITipoOperacionRepository['findIdByCodigo']>()
        .mockResolvedValue('tipo-op-apertura-id'),
    };
    const usuarioMasterChecker = {
      existeEnTenant: vi.fn<IUsuarioMasterChecker['existeEnTenant']>().mockResolvedValue(true),
    };
    const numerador = {
      generarNumero: vi
        .fn<NumeradorTicket['generarNumero']>()
        .mockResolvedValue(Result.ok('SOP-2026-00001')),
    };
    const resolverCicloActivo = {
      resolver: vi.fn<ResolverCicloActivoParaCreacion['resolver']>().mockResolvedValue(
        Result.ok(
          CicloClienteEntity.create(
            {
              cicloVigenteId: 'ciclo-vigente-1',
              nombre: 'Ciclo activo',
              fechaInicio: new Date('2026-01-01'),
              fechaFin: new Date('2026-12-31'),
              activo: true,
            },
            'ciclo-1',
          ),
        ),
      ),
    };
    const resolverAsignacion = {
      resolver: vi.fn<ResolverAsignacionAutomatica['resolver']>().mockResolvedValue(null),
    };
    const txRunner: ITenantTransactionRunner = {
      run: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
      alCommitear: (fn: () => void) => fn(),
    };
    // Espías sobre el runner real del spec: `run` es genérico y un `vi.fn` lo perdería.
    const tx = {
      run: vi.spyOn(txRunner, 'run'),
      alCommitear: vi.spyOn(txRunner, 'alCommitear'),
    };
    const eventPublisher = { publish: vi.fn<IDomainEventPublisher['publish']>() };
    return {
      ticketRepo,
      operacionRepo,
      ticketSoporteRepo,
      equipoRepo,
      estadoRepo,
      tipoTicketRepo,
      tipoOperacionRepo,
      usuarioMasterChecker,
      numerador,
      resolverCicloActivo,
      resolverAsignacion,
      eventPublisher,
      txRunner,
      tx,
    };
  }

  /** Busca la operación de un tipo; falla si no se guardó, en vez de devolver `undefined`. */
  function operacionDeTipo(ops: OperacionTicketEntity[], tipoOperacionId: string) {
    const op = ops.find((o) => o.tipoOperacionId === tipoOperacionId);
    if (!op) throw new Error(`no se guardó la operación ${tipoOperacionId}`);
    return op;
  }

  function baseDto(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      titulo: 'No tengo acceso a la VPN',
      descripcion: null,
      prioridadId: 'prioridad-media',
      equipoId: null,
      descripcionProblema: 'No conecta desde ayer',
      solicitanteId: 'usuario-1',
      clienteId: 'cliente-1',
      autorId: 'usuario-1',
      anio: 2026,
      ...overrides,
    };
  }

  function buildUseCase(deps: ReturnType<typeof makeDeps>) {
    return new CrearTicketSoporteUseCase(
      deps.ticketRepo,
      deps.operacionRepo,
      deps.ticketSoporteRepo,
      deps.estadoRepo,
      deps.tipoTicketRepo,
      deps.tipoOperacionRepo,
      deps.usuarioMasterChecker,
      deps.numerador,
      deps.resolverCicloActivo,
      deps.resolverAsignacion,
      deps.equipoRepo,
      deps.eventPublisher,
      deps.txRunner,
    );
  }

  it('crea el ticket con equipoId=null (soporte de red/accesos sin equipo)', async () => {
    const deps = makeDeps();
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    const { ticket, ticketSoporte } = result.getValue();
    expect(ticket.numero).toBe('SOP-2026-00001');
    expect(ticketSoporte.equipoId).toBeNull();
    expect(deps.equipoRepo.bloquearParaOperarPiezas).not.toHaveBeenCalled();
  });

  it('crea el ticket con equipoId válido (activo y no eliminado)', async () => {
    const deps = makeDeps();
    const equipo = EquipoInformaticoEntity.create(
      {
        nombre: 'Notebook',
        numeroSerie: null,
        marca: null,
        modelo: null,
        fechaAdquisicion: null,
        ubicacion: null,
        importe: null,
        fechaValoracion: null,
        observaciones: null,
        valorResidual: null,
        fechaValorResidual: null,
      },
      'equipo-1',
    );
    deps.equipoRepo.bloquearParaOperarPiezas.mockResolvedValue(equipo);
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(baseDto({ equipoId: 'equipo-1' }));

    expect(result.isOk()).toBe(true);
    expect(result.getValue().ticketSoporte.equipoId).toBe('equipo-1');
  });

  it('falla con EquipoInvalidoError si el equipo no existe', async () => {
    const deps = makeDeps();
    deps.equipoRepo.bloquearParaOperarPiezas.mockResolvedValue(null);
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(baseDto({ equipoId: 'no-existe' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoInvalidoError);
    expect(deps.ticketRepo.save).not.toHaveBeenCalled();
  });

  it('falla con EquipoInvalidoError si el equipo está inactivo', async () => {
    const deps = makeDeps();
    const equipo = EquipoInformaticoEntity.create(
      {
        nombre: 'Notebook',
        numeroSerie: null,
        marca: null,
        modelo: null,
        fechaAdquisicion: null,
        ubicacion: null,
        importe: null,
        fechaValoracion: null,
        observaciones: null,
        valorResidual: null,
        fechaValorResidual: null,
      },
      'equipo-1',
    );
    equipo.darDeBaja({
      destino: 'DESCARTE',
      categoria: 'VEJEZ',
      motivo: null,
      usuarioId: '00000000-0000-4000-8000-000000000001',
      fecha: new Date('2026-10-01T12:00:00Z'),
    });
    deps.equipoRepo.bloquearParaOperarPiezas.mockResolvedValue(equipo);
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(baseDto({ equipoId: 'equipo-1' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoInvalidoError);
  });

  it('falla con EquipoInvalidoError si el equipo fue eliminado (soft delete)', async () => {
    const deps = makeDeps();
    const equipo = EquipoInformaticoEntity.create(
      {
        nombre: 'Notebook',
        numeroSerie: null,
        marca: null,
        modelo: null,
        fechaAdquisicion: null,
        ubicacion: null,
        importe: null,
        fechaValoracion: null,
        observaciones: null,
        valorResidual: null,
        fechaValorResidual: null,
      },
      'equipo-1',
    );
    equipo.softDelete();
    deps.equipoRepo.bloquearParaOperarPiezas.mockResolvedValue(equipo);
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(baseDto({ equipoId: 'equipo-1' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoInvalidoError);
  });

  it('con equipoId toma el lock del equipo DENTRO de la transaccion y ANTES de numerar', async () => {
    const deps = makeDeps();
    const orden: string[] = [];
    const equipo = EquipoInformaticoEntity.create(
      {
        nombre: 'Notebook',
        numeroSerie: null,
        marca: null,
        modelo: null,
        fechaAdquisicion: null,
        ubicacion: null,
        importe: null,
        fechaValoracion: null,
        observaciones: null,
        valorResidual: null,
        fechaValorResidual: null,
      },
      'equipo-1',
    );
    deps.tx.run.mockImplementation(async <T>(fn: () => Promise<T>): Promise<T> => {
      orden.push('tx:inicio');
      return fn();
    });
    deps.equipoRepo.bloquearParaOperarPiezas.mockImplementation(async () => {
      orden.push('lock-equipo');
      return equipo;
    });
    deps.numerador.generarNumero.mockImplementation(async () => {
      orden.push('numerar');
      return Result.ok('SOP-2026-00001');
    });
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(baseDto({ equipoId: 'equipo-1' }));

    expect(result.isOk()).toBe(true);
    expect(orden).toEqual(['tx:inicio', 'lock-equipo', 'numerar']);
  });

  it('un equipo invalido corta antes de numerar y sin escribir', async () => {
    const deps = makeDeps();
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(baseDto({ equipoId: 'no-existe' }));

    expect(result.isFail()).toBe(true);
    expect(deps.numerador.generarNumero).not.toHaveBeenCalled();
    expect(deps.ticketSoporteRepo.save).not.toHaveBeenCalled();
  });

  it('falla con SolicitanteInvalidoError si el solicitante no existe en el tenant', async () => {
    const deps = makeDeps();
    deps.usuarioMasterChecker.existeEnTenant.mockResolvedValue(false);
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SolicitanteInvalidoError);
  });

  it('el ticket base y el satélite se persisten dentro de la misma transacción', async () => {
    const deps = makeDeps();
    const useCase = buildUseCase(deps);

    await useCase.execute(baseDto());

    expect(deps.tx.run).toHaveBeenCalledTimes(1);
    expect(deps.ticketRepo.save).toHaveBeenCalledTimes(1);
    expect(deps.operacionRepo.save).toHaveBeenCalledTimes(1);
    expect(deps.ticketSoporteRepo.save).toHaveBeenCalledTimes(1);
  });

  it('publica TicketCreadoEvent POST-COMMIT con ticketId/prioridadId (dispara AplicarSlaListener)', async () => {
    const deps = makeDeps();
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(baseDto());
    const { ticket } = result.getValue();

    expect(deps.eventPublisher.publish).toHaveBeenCalledTimes(1);
    const evento = deps.eventPublisher.publish.mock.calls[0][0];
    expect(evento).toBeInstanceOf(TicketCreadoEvent);
    if (!(evento instanceof TicketCreadoEvent)) throw new Error('se esperaba TicketCreadoEvent');
    expect(evento.ticketId).toBe(ticket.id);
    expect(evento.prioridadId).toBe('prioridad-media');
  });

  it('no publica el evento si la creación falla (equipoId invalido)', async () => {
    const deps = makeDeps();
    deps.equipoRepo.bloquearParaOperarPiezas.mockResolvedValue(null);
    const useCase = buildUseCase(deps);

    await useCase.execute(baseDto({ equipoId: 'no-existe' }));

    expect(deps.eventPublisher.publish).not.toHaveBeenCalled();
  });

  describe('equipoInvalido', () => {
    function equipoActivo() {
      return EquipoInformaticoEntity.create(
        {
          nombre: 'Notebook',
          numeroSerie: null,
          marca: null,
          modelo: null,
          fechaAdquisicion: null,
          ubicacion: null,
          importe: null,
          fechaValoracion: null,
          observaciones: null,
          valorResidual: null,
          fechaValorResidual: null,
        },
        'equipo-1',
      );
    }

    function equipoDeBaja() {
      const equipo = equipoActivo();
      equipo.darDeBaja({
        destino: 'DESCARTE',
        categoria: 'VEJEZ',
        motivo: null,
        usuarioId: '00000000-0000-4000-8000-000000000001',
        fecha: new Date('2026-10-01T12:00:00Z'),
      });
      return equipo;
    }

    it('OMITIR con el equipo inexistente: crea el ticket sin equipo y sin error', async () => {
      const deps = makeDeps();
      deps.equipoRepo.bloquearParaOperarPiezas.mockResolvedValue(null);
      const useCase = buildUseCase(deps);

      const result = await useCase.execute(
        baseDto({ equipoId: 'no-existe', equipoInvalido: 'OMITIR' }),
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue().ticketSoporte.equipoId).toBeNull();
      expect(deps.ticketSoporteRepo.save).toHaveBeenCalledTimes(1);
      expect(deps.eventPublisher.publish).toHaveBeenCalledTimes(1);
    });

    it('OMITIR con el equipo dado de baja: crea el ticket sin equipo', async () => {
      const deps = makeDeps();
      deps.equipoRepo.bloquearParaOperarPiezas.mockResolvedValue(equipoDeBaja());
      const useCase = buildUseCase(deps);

      const result = await useCase.execute(
        baseDto({ equipoId: 'equipo-1', equipoInvalido: 'OMITIR' }),
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue().ticketSoporte.equipoId).toBeNull();
    });

    it('OMITIR con el equipo eliminado (soft delete): crea el ticket sin equipo', async () => {
      const deps = makeDeps();
      const equipo = equipoActivo();
      equipo.softDelete();
      deps.equipoRepo.bloquearParaOperarPiezas.mockResolvedValue(equipo);
      const useCase = buildUseCase(deps);

      const result = await useCase.execute(
        baseDto({ equipoId: 'equipo-1', equipoInvalido: 'OMITIR' }),
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue().ticketSoporte.equipoId).toBeNull();
    });

    it('OMITIR con un equipo válido lo conserva', async () => {
      const deps = makeDeps();
      deps.equipoRepo.bloquearParaOperarPiezas.mockResolvedValue(equipoActivo());
      const useCase = buildUseCase(deps);

      const result = await useCase.execute(
        baseDto({ equipoId: 'equipo-1', equipoInvalido: 'OMITIR' }),
      );

      expect(result.getValue().ticketSoporte.equipoId).toBe('equipo-1');
    });

    it('OMITIR sigue tomando el lock dentro de la transaccion y antes de numerar (S5)', async () => {
      const deps = makeDeps();
      const orden: string[] = [];
      deps.tx.run.mockImplementation(async <T>(fn: () => Promise<T>): Promise<T> => {
        orden.push('tx:inicio');
        return fn();
      });
      deps.equipoRepo.bloquearParaOperarPiezas.mockImplementation(async () => {
        orden.push('lock-equipo');
        return equipoDeBaja();
      });
      deps.numerador.generarNumero.mockImplementation(async () => {
        orden.push('numerar');
        return Result.ok('SOP-2026-00001');
      });
      const useCase = buildUseCase(deps);

      await useCase.execute(baseDto({ equipoId: 'equipo-1', equipoInvalido: 'OMITIR' }));

      expect(orden).toEqual(['tx:inicio', 'lock-equipo', 'numerar']);
    });

    it('RECHAZAR explícito falla con EquipoInvalidoError y no escribe', async () => {
      const deps = makeDeps();
      deps.equipoRepo.bloquearParaOperarPiezas.mockResolvedValue(equipoDeBaja());
      const useCase = buildUseCase(deps);

      const result = await useCase.execute(
        baseDto({ equipoId: 'equipo-1', equipoInvalido: 'RECHAZAR' }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(EquipoInvalidoError);
      expect(deps.ticketSoporteRepo.save).not.toHaveBeenCalled();
    });

    it('sin política (default) rechaza el equipo inválido', async () => {
      const deps = makeDeps();
      deps.equipoRepo.bloquearParaOperarPiezas.mockResolvedValue(null);
      const useCase = buildUseCase(deps);

      const result = await useCase.execute(baseDto({ equipoId: 'no-existe' }));

      expect(result.getError()).toBeInstanceOf(EquipoInvalidoError);
    });
  });

  describe('solicitante externo', () => {
    it('crea el ticket con solicitanteExternoId, sin consultar master y con solicitanteId null', async () => {
      const deps = makeDeps();
      const useCase = buildUseCase(deps);

      const result = await useCase.execute(
        baseDto({ solicitanteId: null, solicitanteExternoId: 'externo-1' }),
      );

      expect(result.isOk()).toBe(true);
      const { ticket } = result.getValue();
      expect(ticket.solicitanteId).toBeNull();
      expect(ticket.solicitanteExternoId).toBe('externo-1');
      expect(deps.usuarioMasterChecker.existeEnTenant).not.toHaveBeenCalled();
    });

    it('registra la operación de apertura con AUTOR_FORMULARIO_PUBLICO', async () => {
      const deps = makeDeps();
      const useCase = buildUseCase(deps);

      await useCase.execute(
        baseDto({
          solicitanteId: undefined,
          solicitanteExternoId: 'externo-1',
          autorId: AUTOR_FORMULARIO_PUBLICO,
        }),
      );

      const operacion = deps.operacionRepo.save.mock.calls[0][0];
      expect(operacion.autorId).toBe(AUTOR_FORMULARIO_PUBLICO);
    });

    it('AUTOR_FORMULARIO_PUBLICO es el UUID nulo', () => {
      expect(AUTOR_FORMULARIO_PUBLICO).toBe('00000000-0000-0000-0000-000000000000');
    });

    it('con un usuario registrado deja solicitanteExternoId en null', async () => {
      const deps = makeDeps();
      const useCase = buildUseCase(deps);

      const result = await useCase.execute(baseDto());

      expect(result.getValue().ticket.solicitanteExternoId).toBeNull();
    });

    it('lanza si llegan los dos solicitantes, sin escribir', async () => {
      const deps = makeDeps();
      const useCase = buildUseCase(deps);

      await expect(
        useCase.execute(baseDto({ solicitanteId: 'usuario-1', solicitanteExternoId: 'externo-1' })),
      ).rejects.toThrow(/exactamente uno/);
      expect(deps.ticketRepo.save).not.toHaveBeenCalled();
    });

    it('lanza si no llega ninguno, sin escribir', async () => {
      const deps = makeDeps();
      const useCase = buildUseCase(deps);

      await expect(useCase.execute(baseDto({ solicitanteId: null }))).rejects.toThrow(
        /exactamente uno/,
      );
      expect(deps.ticketRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('asignación automática por regla del tipo (A1, A3, A4, A6, A7, A8, N1)', () => {
    const ASIGNACION = {
      asignadoId: 'u-responsable',
      estadoAsignadoId: 'estado-asignado-id',
      tipoOperacionAsignacionId: 'tipo-op-asignacion-id',
    };

    it('con regla: nace ASIGNADO con asignado_id, apertura null→ASIGNADO y ASIGNACION del sistema', async () => {
      const deps = makeDeps();
      deps.resolverAsignacion.resolver.mockResolvedValue(ASIGNACION);

      const result = await buildUseCase(deps).execute(baseDto());

      const { ticket } = result.getValue();
      expect(ticket.estadoId).toBe('estado-asignado-id');
      expect(ticket.asignadoId).toBe('u-responsable');
      expect(deps.resolverAsignacion.resolver).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tipo-soporte-id' }),
        'cliente-1',
      );
      const ops = deps.operacionRepo.save.mock.calls.map(([op]) => op);
      expect(ops).toHaveLength(2);
      const apertura = operacionDeTipo(ops, 'tipo-op-apertura-id');
      const asignacion = operacionDeTipo(ops, 'tipo-op-asignacion-id');
      expect(apertura.estadoAnteriorId).toBeNull();
      expect(apertura.estadoNuevoId).toBe('estado-asignado-id');
      expect(apertura.autorId).toBe('usuario-1');
      expect(asignacion.autorId).toBe(AUTOR_SISTEMA);
    });

    it('formulario público: la apertura conserva AUTOR_FORMULARIO_PUBLICO y la ASIGNACION es del sistema', async () => {
      const deps = makeDeps();
      deps.resolverAsignacion.resolver.mockResolvedValue(ASIGNACION);

      await buildUseCase(deps).execute(
        baseDto({
          solicitanteId: null,
          solicitanteExternoId: 'externo-1',
          autorId: AUTOR_FORMULARIO_PUBLICO,
        }),
      );

      const ops = deps.operacionRepo.save.mock.calls.map(([op]) => op);
      const apertura = operacionDeTipo(ops, 'tipo-op-apertura-id');
      const asignacion = operacionDeTipo(ops, 'tipo-op-asignacion-id');
      expect(apertura.autorId).toBe(AUTOR_FORMULARIO_PUBLICO);
      expect(asignacion.autorId).toBe(AUTOR_SISTEMA);
    });

    it('sin regla o regla rota (el resolver devuelve null): NUEVO, sin asignado, una operación y solo ticket.creado', async () => {
      const deps = makeDeps();

      const result = await buildUseCase(deps).execute(baseDto());

      expect(result.isOk()).toBe(true);
      expect(result.getValue().ticket.estadoId).toBe('estado-nuevo-id');
      expect(result.getValue().ticket.asignadoId).toBeNull();
      expect(deps.operacionRepo.save).toHaveBeenCalledTimes(1);
      expect(deps.eventPublisher.publish).toHaveBeenCalledTimes(1);
    });

    it('con regla: ticket.asignado REGLA_TIPO después de ticket.creado, solo al correr la cola de alCommitear', async () => {
      const deps = makeDeps();
      deps.resolverAsignacion.resolver.mockResolvedValue(ASIGNACION);
      const cola: Array<() => void> = [];
      deps.tx.alCommitear.mockImplementation((fn: () => void) => {
        cola.push(fn);
      });

      const result = await buildUseCase(deps).execute(baseDto());

      expect(deps.eventPublisher.publish).not.toHaveBeenCalled();
      cola.forEach((fn) => fn());
      const eventos = deps.eventPublisher.publish.mock.calls.map(([e]) => e);
      expect(eventos[0]).toBeInstanceOf(TicketCreadoEvent);
      expect(eventos[1]).toBeInstanceOf(TicketAsignadoEvent);
      expect(eventos[1]).toMatchObject({
        ticketId: result.getValue().ticket.id,
        asignadoId: 'u-responsable',
        origen: 'REGLA_TIPO',
        autorId: null,
      });
      expect(eventos).toHaveLength(2);
    });

    it('un equipo inválido corta sin escribir y sin publicar ticket.asignado', async () => {
      const deps = makeDeps();
      deps.resolverAsignacion.resolver.mockResolvedValue(ASIGNACION);

      const result = await buildUseCase(deps).execute(baseDto({ equipoId: 'no-existe' }));

      expect(result.isFail()).toBe(true);
      expect(deps.eventPublisher.publish).not.toHaveBeenCalled();
    });

    it('si el resolver rechaza (consulta de tenant), el alta rechaza sin abrir la transacción', async () => {
      const deps = makeDeps();
      deps.resolverAsignacion.resolver.mockRejectedValue(new Error('tenant caido'));

      await expect(buildUseCase(deps).execute(baseDto())).rejects.toThrow('tenant caido');
      expect(deps.tx.run).not.toHaveBeenCalled();
    });
  });
});
