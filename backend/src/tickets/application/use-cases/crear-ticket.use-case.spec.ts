/**
 * T6.1/T6.2 [UNIT] — RED→GREEN: `CrearTicketUseCase`.
 *
 * Todos los puertos mockeados (`vi.fn`) — sin DB. Cubre T4 (creación feliz,
 * estampado de solicitante/estado/ciclo/numero, validaciones de
 * tipo/prioridad/solicitante/ciclo activo) y T11 (ticketReferenciaId válido
 * e inválido).
 *
 * Ref spec: sdd/tickets-core/spec T4, T5, T11. Ref design: ADR-5 (advisory
 * lock DENTRO de la tx — se verifica que `generarNumero`/`save` corren
 * dentro de `txRunner.run`). Tarea: T6.1, T6.2.
 */
import { CrearTicketUseCase, CrearTicketDto } from './crear-ticket.use-case';
import { Result } from '../../../shared/domain/result';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import {
  ITenantTransactionRunner,
  PrismaTenantTransactionRunner,
} from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import { PrioridadEntity } from '../../domain/entities/prioridad.entity';
import { TicketCreadoEvent } from '../../domain/events/ticket-creado.event';
import { TicketAsignadoEvent } from '../../domain/events/ticket-asignado.event';
import { AUTOR_SISTEMA } from '../../domain/constants/autor-sistema.constants';
import {
  SolicitanteInvalidoError,
  TipoTicketNoEncontradoError,
  PrioridadNoEncontradaError,
  TicketReferenciaInvalidaError,
  SinCicloActivoError,
  SecuenciaAgotadaError,
  SectorTicketInexistenteError,
  TipoTicketNoPermitidoEnAltaError,
  AccionSobreTipoNoPermitidaError,
} from '../../domain/errors/tickets.errors';
import { SectorEntity } from '../../../sectores/domain/entities/sector.entity';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { IPrioridadRepository } from '../../domain/ports/i-prioridad.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import { NumeradorTicket } from '../../domain/services/numerador-ticket.service';
import { ResolverCicloActivoParaCreacion } from '../services/resolver-ciclo-activo.service';
import { ResolverAsignacionAutomatica } from '../services/resolver-asignacion-automatica.service';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { unstubbed } from '../../../testing/mocks';
import { alcancePorTipo, alcanceSinRestriccion } from '../../test-helpers/alcance-ticket';

/** Operación guardada con ese tipo; falla si no se guardó ninguna (en vez de seguir con `undefined`). */
function operacionDelTipo(
  ops: OperacionTicketEntity[],
  tipoOperacionId: string,
): OperacionTicketEntity {
  const op = ops.find((o) => o.tipoOperacionId === tipoOperacionId);
  if (!op) {
    throw new Error(`No se guardó ninguna operación de tipo ${tipoOperacionId}`);
  }
  return op;
}

function baseDto(overrides: Partial<CrearTicketDto> = {}): CrearTicketDto {
  return {
    titulo: 'No enciende la PC',
    descripcion: 'Detalle',
    tipoId: 'tipo-soporte-uuid',
    prioridadId: 'prioridad-media-uuid',
    ticketReferenciaId: null,
    solicitanteId: 'solicitante-uuid',
    clienteId: 'cliente-uuid',
    autorId: 'solicitante-uuid',
    anio: 2026,
    // Flujo de sistema (D3) por defecto: los tests de permisos lo reemplazan.
    alcance: null,
    ...overrides,
  };
}

describe('CrearTicketUseCase', () => {
  function makeCollaborators() {
    const ticketRepo = {
      findById: vi.fn<ITicketRepository['findById']>(),
      save: vi.fn<ITicketRepository['save']>().mockResolvedValue(undefined),
      findByIds: unstubbed('findByIds'),
      findByNumero: unstubbed('findByNumero'),
      findLastSecuencia: unstubbed('findLastSecuencia'),
      findAll: unstubbed('findAll'),
      count: unstubbed('count'),
      esVisiblePara: unstubbed('esVisiblePara'),
      bloquear: unstubbed('bloquear'),
      delete: unstubbed('delete'),
      borrarSiActivo: unstubbed('borrarSiActivo'),
      recuperarSiBorrado: unstubbed('recuperarSiBorrado'),
    };
    const operacionRepo = {
      save: vi.fn<IOperacionTicketRepository['save']>().mockResolvedValue(undefined),
      listByTicket: unstubbed('listByTicket'),
      findById: unstubbed('findById'),
    };
    const estadoRepo = {
      findIdByCodigo: vi
        .fn<IEstadoRepository['findIdByCodigo']>()
        .mockResolvedValue('estado-nuevo-uuid'),
      findById: unstubbed('findById'),
      findByCodigo: unstubbed('findByCodigo'),
      findAllActive: unstubbed('findAllActive'),
    };
    const tipoTicketRepo = {
      findById: vi
        .fn<ITipoTicketRepository['findById']>()
        .mockResolvedValue(
          TipoTicketEntity.create(
            { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'TICKETS', activo: true },
            'tipo-soporte-uuid',
          ),
        ),
      findByCodigo: unstubbed('findByCodigo'),
      findIdByCodigo: unstubbed('findIdByCodigo'),
      findAllActive: unstubbed('findAllActive'),
      findAllActiveByModulo: unstubbed('findAllActiveByModulo'),
      findIdsByModulos: unstubbed('findIdsByModulos'),
      save: unstubbed('save'),
    };
    const prioridadRepo = {
      findById: vi
        .fn<IPrioridadRepository['findById']>()
        .mockResolvedValue(
          PrioridadEntity.create(
            { codigo: 'MEDIA', nombre: 'Media', color: null, orden: 2, activo: true },
            'prioridad-media-uuid',
          ),
        ),
      findByCodigo: unstubbed('findByCodigo'),
      findIdByCodigo: unstubbed('findIdByCodigo'),
      findAllActive: unstubbed('findAllActive'),
      save: unstubbed('save'),
    };
    const tipoOperacionRepo = {
      findIdByCodigo: vi
        .fn<ITipoOperacionRepository['findIdByCodigo']>()
        .mockResolvedValue('tipo-op-cambio-estado-uuid'),
      findByCodigo: unstubbed('findByCodigo'),
      findAllActive: unstubbed('findAllActive'),
    };
    const usuarioMasterChecker = {
      existeEnTenant: vi.fn<IUsuarioMasterChecker['existeEnTenant']>().mockResolvedValue(true),
      estaActivoEnTenant: unstubbed('estaActivoEnTenant'),
      resolverNombres: unstubbed('resolverNombres'),
      esAdminTotalEnTenant: unstubbed('esAdminTotalEnTenant'),
      listarAgentes: unstubbed('listarAgentes'),
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
              cicloVigenteId: 'ciclo-vigente-uuid',
              nombre: 'Ciclo 2026',
              fechaInicio: new Date('2026-01-01'),
              fechaFin: new Date('2026-12-31'),
              activo: true,
            },
            'ciclo-activo-uuid',
          ),
        ),
      ),
    };
    // txRunner.run ejecuta el callback DIRECTAMENTE (sin Prisma real) — pero
    // preserva la semántica "corre dentro de la tx" para los tests. Igual
    // alCommitear() acá: para estos tests unitarios (que no ejercitan la
    // re-entrancia) alcanza con ejecutar el callback en el acto; el
    // comportamiento diferido real está cubierto abajo, contra el runner
    // REAL (`makeCollaboradoresConRunnerReal`). El try/catch de acá calca el
    // log-and-swallow que hace `PrismaTenantTransactionRunner` en producción
    // (sdd/preventivo WU-5 postcommit): desde esa corrección, el use case ya
    // NO envuelve el callback en su propio try/catch, así que el mock que lo
    // simula tiene que hacerlo para no romper el contrato con un fake ciego.
    const txRunner = {
      run: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
      alCommitear: vi.fn<ITenantTransactionRunner['alCommitear']>((fn) => {
        try {
          fn();
        } catch {
          // Swallow — mismo criterio que el runner real: un callback que
          // falla no debe propagar ni afectar al resto de la cola.
        }
      }),
    };
    vi.spyOn(txRunner, 'run');
    const resolverAsignacion = {
      resolver: vi.fn<ResolverAsignacionAutomatica['resolver']>().mockResolvedValue(null),
    };
    const eventPublisher = { publish: vi.fn<IDomainEventPublisher['publish']>() };
    // Un sector existente pero DESACTIVADO: el alta lo acepta igual (odd/ubicacion-sector-ticket).
    const sectorRepo = {
      findById: vi.fn(async (id: string) =>
        id === 'sector-uuid'
          ? SectorEntity.create({ codigo: 'COMP', nombre: 'Computacion', activo: false }, id)
          : null,
      ),
    };

    const useCase = new CrearTicketUseCase(
      ticketRepo,
      operacionRepo,
      estadoRepo,
      tipoTicketRepo,
      prioridadRepo,
      tipoOperacionRepo,
      usuarioMasterChecker,
      numerador,
      resolverCicloActivo,
      resolverAsignacion,
      eventPublisher,
      txRunner,
      sectorRepo,
    );

    return {
      useCase,
      sectorRepo,
      ticketRepo,
      operacionRepo,
      estadoRepo,
      tipoTicketRepo,
      prioridadRepo,
      tipoOperacionRepo,
      usuarioMasterChecker,
      numerador,
      resolverCicloActivo,
      resolverAsignacion,
      eventPublisher,
      txRunner,
    };
  }

  it('T4: crea el ticket estampando solicitante/estado NUEVO/ciclo activo/numero, y la operacion de apertura, dentro de la tx', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    const ticket = result.getValue();
    expect(ticket).toBeInstanceOf(TicketEntity);
    expect(ticket.numero).toBe('SOP-2026-00001');
    expect(ticket.solicitanteId).toBe('solicitante-uuid');
    expect(ticket.estadoId).toBe('estado-nuevo-uuid');
    expect(ticket.cicloId).toBe('ciclo-activo-uuid');
    expect(ticket.asignadoId).toBeNull();

    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.ticketRepo.save).toHaveBeenCalledWith(ticket);
    expect(c.operacionRepo.save).toHaveBeenCalledTimes(1);
    const operacionGuardada = c.operacionRepo.save.mock.calls[0][0];
    expect(operacionGuardada.estadoAnteriorId).toBeNull();
    expect(operacionGuardada.estadoNuevoId).toBe('estado-nuevo-uuid');
    expect(operacionGuardada.autorId).toBe('solicitante-uuid');
  });

  describe('ubicacion y sector (odd/ubicacion-sector-ticket)', () => {
    it('sin los campos el ticket nace sin ubicacion ni sector y no consulta el catalogo', async () => {
      const c = makeCollaborators();

      const ticket = (await c.useCase.execute(baseDto())).getValue();

      expect(ticket.ubicacion).toBeNull();
      expect(ticket.sectorId).toBeNull();
      expect(c.sectorRepo.findById).not.toHaveBeenCalled();
    });

    it('guarda ubicacion y un sector existente, aunque este desactivado', async () => {
      const c = makeCollaborators();

      const result = await c.useCase.execute(
        baseDto({ ubicacion: 'Aula 3, primer piso', sectorId: 'sector-uuid' }),
      );

      const ticket = result.getValue();
      expect(ticket.ubicacion).toBe('Aula 3, primer piso');
      expect(ticket.sectorId).toBe('sector-uuid');
      expect(c.ticketRepo.save).toHaveBeenCalledWith(ticket);
    });

    it('sector inexistente → SectorTicketInexistenteError, sin abrir la tx', async () => {
      const c = makeCollaborators();

      const result = await c.useCase.execute(baseDto({ sectorId: 'no-existe' }));

      expect(result.getError()).toBeInstanceOf(SectorTicketInexistenteError);
      expect(c.txRunner.run).not.toHaveBeenCalled();
      expect(c.ticketRepo.save).not.toHaveBeenCalled();
    });
  });

  it('SA10 (Fase 4, aditivo, GATE G3): publica TicketCreadoEvent POST-COMMIT con ticketId/prioridadId', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute(baseDto());
    const ticket = result.getValue();

    expect(c.eventPublisher.publish).toHaveBeenCalledTimes(1);
    const evento = c.eventPublisher.publish.mock.calls[0][0];
    expect(evento).toBeInstanceOf(TicketCreadoEvent);
    if (!(evento instanceof TicketCreadoEvent)) {
      throw new Error('se esperaba un TicketCreadoEvent');
    }
    expect(evento.ticketId).toBe(ticket.id);
    expect(evento.prioridadId).toBe('prioridad-media-uuid');
  });

  it('SA10: un fallo del eventPublisher NUNCA revierte la creación ya committeada (log-and-swallow)', async () => {
    const c = makeCollaborators();
    c.eventPublisher.publish.mockImplementation(() => {
      throw new Error('boom');
    });

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    expect(c.ticketRepo.save).toHaveBeenCalledTimes(1);
  });

  it('solicitante inválido (no existe/no pertenece al tenant) → SolicitanteInvalidoError, sin tocar la tx', async () => {
    const c = makeCollaborators();
    c.usuarioMasterChecker.existeEnTenant.mockResolvedValue(false);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SolicitanteInvalidoError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('sin ciclo activo → propaga SinCicloActivoError, sin tocar la tx', async () => {
    const c = makeCollaborators();
    c.resolverCicloActivo.resolver.mockResolvedValue(Result.fail(new SinCicloActivoError()));

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SinCicloActivoError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('tipoId inexistente en el catálogo del tenant → TipoTicketNoEncontradoError (422)', async () => {
    const c = makeCollaborators();
    c.tipoTicketRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoTicketNoEncontradoError);
  });

  // CA3 (odd/tasks/deuda-tecnica-2026-10-15.md): `findById` devuelve también
  // los tipos dados de baja (la reactivación los necesita); el alta los filtra.
  it.each([
    [
      'dado de baja (activo=false + deletedAt)',
      () => {
        const tipo = TipoTicketEntity.create(
          { codigo: 'RRHH', nombre: 'RRHH', modulo: 'TICKETS', activo: true },
          'tipo-rrhh-uuid',
        );
        tipo.desactivar();
        return tipo;
      },
    ],
    [
      'con activo=false',
      () =>
        TipoTicketEntity.create(
          { codigo: 'RRHH', nombre: 'RRHH', modulo: 'TICKETS', activo: false },
          'tipo-rrhh-uuid',
        ),
    ],
  ])('tipoId %s → TipoTicketNoEncontradoError (422), sin abrir la tx', async (_caso, tipo) => {
    const c = makeCollaborators();
    c.tipoTicketRepo.findById.mockResolvedValue(tipo());

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoTicketNoEncontradoError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  describe('altaManual (odd/tasks/ticket-unificado.md, S6)', () => {
    const tipo = (codigo: string, modulo: 'TICKETS' | 'EDILICIA' | 'COMPRAS') => () =>
      TipoTicketEntity.create(
        { codigo, nombre: codigo, modulo, activo: true },
        'tipo-soporte-uuid',
      );

    it.each([
      ['MANTENIMIENTO', 'EDILICIA'],
      ['EDILICIA', 'EDILICIA'],
      ['SOPORTE', 'TICKETS'],
    ] as const)(
      'alta manual de un tipo %s (módulo %s) → crea el ticket con ese tipo',
      async (codigo, modulo) => {
        const c = makeCollaborators();
        c.tipoTicketRepo.findById.mockResolvedValue(tipo(codigo, modulo)());

        const result = await c.useCase.execute(baseDto({ altaManual: true }));

        expect(result.isOk()).toBe(true);
        expect(result.getValue().tipoId).toBe('tipo-soporte-uuid');
        expect(c.ticketRepo.save).toHaveBeenCalledTimes(1);
      },
    );

    it.each([
      ['PREVENTIVO', 'EDILICIA'],
      ['CMP', 'COMPRAS'],
    ] as const)(
      'alta manual de %s (módulo %s) → TipoTicketNoPermitidoEnAltaError (422), sin abrir la tx',
      async (codigo, modulo) => {
        const c = makeCollaborators();
        c.tipoTicketRepo.findById.mockResolvedValue(tipo(codigo, modulo)());

        const result = await c.useCase.execute(baseDto({ altaManual: true }));

        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(TipoTicketNoPermitidoEnAltaError);
        expect(result.getError().message).toBe(
          `El tipo de ticket "${codigo}" no admite altas manuales.`,
        );
        expect(c.txRunner.run).not.toHaveBeenCalled();
        expect(c.ticketRepo.save).not.toHaveBeenCalled();
      },
    );

    it('sin altaManual (preventivo, API de integraciones) acepta PREVENTIVO', async () => {
      const c = makeCollaborators();
      c.tipoTicketRepo.findById.mockResolvedValue(tipo('PREVENTIVO', 'EDILICIA')());

      const result = await c.useCase.execute(baseDto());

      expect(result.isOk()).toBe(true);
    });
  });

  describe('ALTAS sobre el tipo elegido (odd/permisos-por-tipo-ticket, S6, D5 c)', () => {
    it('con ALTAS sobre el tipo → crea el ticket', async () => {
      const c = makeCollaborators();

      const result = await c.useCase.execute(
        baseDto({
          alcance: alcancePorTipo('solicitante-uuid', { 'tipo-soporte-uuid': ['ALTAS'] }),
        }),
      );

      expect(result.isOk()).toBe(true);
      expect(c.ticketRepo.save).toHaveBeenCalledTimes(1);
    });

    it.each([
      [
        'sin ALTAS sobre el tipo, con LECTURA y MODIFICACION',
        { 'tipo-soporte-uuid': ['LECTURA', 'MODIFICACION'] },
      ],
      ['con ALTAS solo sobre OTRO tipo', { 'tipo-otro-uuid': ['LECTURA', 'ALTAS'] }],
      ['sin ninguna fila por tipo', {}],
    ] as const)(
      '%s → AccionSobreTipoNoPermitidaError (403), sin abrir la tx ni guardar nada',
      async (_caso, permisos) => {
        const c = makeCollaborators();

        const result = await c.useCase.execute(
          baseDto({ alcance: alcancePorTipo('solicitante-uuid', permisos) }),
        );

        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(AccionSobreTipoNoPermitidaError);
        expect(result.getError().message).toBe(
          'El usuario no tiene el permiso "ALTAS" sobre el tipo de este ticket.',
        );
        expect(c.txRunner.run).not.toHaveBeenCalled();
        expect(c.ticketRepo.save).not.toHaveBeenCalled();
        expect(c.operacionRepo.save).not.toHaveBeenCalled();
        expect(c.eventPublisher.publish).not.toHaveBeenCalled();
      },
    );

    it('ROOT y ADMINISTRADOR (sin restricción) → crea sin filas por tipo', async () => {
      const c = makeCollaborators();

      const result = await c.useCase.execute(
        baseDto({ alcance: alcanceSinRestriccion('solicitante-uuid') }),
      );

      expect(result.isOk()).toBe(true);
    });

    it('PREVENTIVO en el alta manual sigue siendo 422 aunque tenga ALTAS sobre él', async () => {
      const c = makeCollaborators();
      c.tipoTicketRepo.findById.mockResolvedValue(
        TipoTicketEntity.create(
          { codigo: 'PREVENTIVO', nombre: 'Preventivo', modulo: 'EDILICIA', activo: true },
          'tipo-soporte-uuid',
        ),
      );

      const result = await c.useCase.execute(
        baseDto({
          altaManual: true,
          alcance: alcancePorTipo('solicitante-uuid', { 'tipo-soporte-uuid': ['ALTAS'] }),
        }),
      );

      expect(result.getError()).toBeInstanceOf(TipoTicketNoPermitidoEnAltaError);
      expect(c.txRunner.run).not.toHaveBeenCalled();
    });
  });

  it('prioridadId inexistente en el catálogo del tenant → PrioridadNoEncontradaError (422)', async () => {
    const c = makeCollaborators();
    c.prioridadRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PrioridadNoEncontradaError);
  });

  it('T11: ticketReferenciaId válido (existe en el tenant) → OK, se estampa en el ticket nuevo', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(
      TicketEntity.create(
        {
          numero: 'SOP-2025-00099',
          titulo: 'Cerrado previo',
          descripcion: null,
          tipoId: 'tipo-soporte-uuid',
          estadoId: 'estado-cerrado-uuid',
          prioridadId: 'prioridad-media-uuid',
          cicloId: null,
          ticketReferenciaId: null,
          solicitanteId: 'solicitante-uuid',
        },
        'ticket-cerrado-uuid',
      ),
    );

    const result = await c.useCase.execute(baseDto({ ticketReferenciaId: 'ticket-cerrado-uuid' }));

    expect(result.isOk()).toBe(true);
    expect(result.getValue().ticketReferenciaId).toBe('ticket-cerrado-uuid');
  });

  it('T11: ticketReferenciaId inexistente en el tenant → TicketReferenciaInvalidaError (422)', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto({ ticketReferenciaId: 'no-existe-uuid' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketReferenciaInvalidaError);
  });

  it('T11: ticketReferenciaId soft-deleted se trata como inexistente → TicketReferenciaInvalidaError', async () => {
    const c = makeCollaborators();
    const referenciado = TicketEntity.create(
      {
        numero: 'SOP-2025-00098',
        titulo: 'Borrado',
        descripcion: null,
        tipoId: 'tipo-soporte-uuid',
        estadoId: 'estado-cerrado-uuid',
        prioridadId: 'prioridad-media-uuid',
        cicloId: null,
        ticketReferenciaId: null,
        solicitanteId: 'solicitante-uuid',
      },
      'ticket-borrado-uuid',
    );
    referenciado.softDelete();
    c.ticketRepo.findById.mockResolvedValue(referenciado);

    const result = await c.useCase.execute(baseDto({ ticketReferenciaId: 'ticket-borrado-uuid' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketReferenciaInvalidaError);
  });

  it('secuencia agotada (numerador falla DENTRO de la tx) → propaga el error sin persistir', async () => {
    const c = makeCollaborators();
    c.numerador.generarNumero.mockResolvedValue(
      Result.fail(new SecuenciaAgotadaError('SOPORTE', 2026)),
    );

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SecuenciaAgotadaError);
    expect(c.ticketRepo.save).not.toHaveBeenCalled();
    expect(c.operacionRepo.save).not.toHaveBeenCalled();
  });

  describe('asignación automática por regla del tipo (A1-A4, A7, A8, N1)', () => {
    const ASIGNACION = {
      asignadoId: 'u-responsable',
      estadoAsignadoId: 'estado-asignado-uuid',
      tipoOperacionAsignacionId: 'tipo-op-asignacion-uuid',
    };

    it('con regla: nace ASIGNADO con asignado_id, apertura null→ASIGNADO y ASIGNACION del sistema', async () => {
      const c = makeCollaborators();
      c.resolverAsignacion.resolver.mockResolvedValue(ASIGNACION);

      const result = await c.useCase.execute(baseDto());

      const ticket = result.getValue();
      expect(ticket.estadoId).toBe('estado-asignado-uuid');
      expect(ticket.asignadoId).toBe('u-responsable');
      expect(c.resolverAsignacion.resolver).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tipo-soporte-uuid' }),
        'cliente-uuid',
      );
      const ops = c.operacionRepo.save.mock.calls.map(([op]) => op);
      expect(ops).toHaveLength(2);
      const apertura = operacionDelTipo(ops, 'tipo-op-cambio-estado-uuid');
      const asignacion = operacionDelTipo(ops, 'tipo-op-asignacion-uuid');
      expect(apertura.estadoAnteriorId).toBeNull();
      expect(apertura.estadoNuevoId).toBe('estado-asignado-uuid');
      expect(apertura.autorId).toBe('solicitante-uuid');
      expect(asignacion.autorId).toBe(AUTOR_SISTEMA);
      expect(asignacion.metadata).toEqual({
        origen: 'REGLA_TIPO',
        tipoId: 'tipo-soporte-uuid',
        asignadoId: 'u-responsable',
      });
    });

    it('sin regla: idéntico a hoy (NUEVO, sin asignado, una sola operación, solo ticket.creado)', async () => {
      const c = makeCollaborators();

      const result = await c.useCase.execute(baseDto());

      expect(result.getValue().estadoId).toBe('estado-nuevo-uuid');
      expect(result.getValue().asignadoId).toBeNull();
      expect(c.operacionRepo.save).toHaveBeenCalledTimes(1);
      expect(c.eventPublisher.publish).toHaveBeenCalledTimes(1);
      expect(c.eventPublisher.publish.mock.calls[0][0]).toBeInstanceOf(TicketCreadoEvent);
    });

    it('regla rota (el resolver devuelve null): nace NUEVO y sin error', async () => {
      const c = makeCollaborators();
      c.resolverAsignacion.resolver.mockResolvedValue(null);

      const result = await c.useCase.execute(baseDto());

      expect(result.isOk()).toBe(true);
      expect(result.getValue().asignadoId).toBeNull();
    });

    it('con regla: publica ticket.asignado REGLA_TIPO después de ticket.creado, solo al correr la cola de alCommitear', async () => {
      const c = makeCollaborators();
      c.resolverAsignacion.resolver.mockResolvedValue(ASIGNACION);
      const cola: Array<() => void> = [];
      c.txRunner.alCommitear.mockImplementation((fn: () => void) => {
        cola.push(fn);
      });

      const result = await c.useCase.execute(baseDto());

      expect(c.eventPublisher.publish).not.toHaveBeenCalled();
      cola.forEach((fn) => fn());
      const eventos = c.eventPublisher.publish.mock.calls.map(([e]) => e);
      expect(eventos[0]).toBeInstanceOf(TicketCreadoEvent);
      expect(eventos[1]).toBeInstanceOf(TicketAsignadoEvent);
      expect(eventos[1]).toMatchObject({
        ticketId: result.getValue().id,
        asignadoId: 'u-responsable',
        origen: 'REGLA_TIPO',
        autorId: null,
      });
      expect(eventos).toHaveLength(2);
    });

    it('si el resolver rechaza (consulta de tenant), el alta rechaza sin abrir la transacción', async () => {
      const c = makeCollaborators();
      c.resolverAsignacion.resolver.mockRejectedValue(new Error('tenant caido'));

      await expect(c.useCase.execute(baseDto())).rejects.toThrow('tenant caido');
      expect(c.txRunner.run).not.toHaveBeenCalled();
    });
  });
});

/**
 * Defecto de re-entrancia (sdd/preventivo WU-5) — RED→GREEN.
 *
 * `CrearTicketUseCase` publica `TicketCreadoEvent` vía `txRunner.alCommitear()`
 * en vez de directo. Estos tests usan el `PrismaTenantTransactionRunner` REAL
 * (no un mock que "ejecuta directo") porque son justamente los que ejercitan
 * su semántica de commit diferido y re-entrancia — un mock `run: fn => fn()`
 * no puede reproducir el defecto: lo tapa igual que el
 * `NoopDomainEventPublisher` de generar-preventivos.integration.spec.ts.
 *
 * Escenario: `CrearTicketUseCase` corriendo RE-ENTRANTE, anidado dentro de la
 * transacción de OTRO caller (así es como lo usa `GenerarPreventivosUseCase`,
 * ADR-PV5).
 */
describe('CrearTicketUseCase — publicación post-commit bajo re-entrancia (runner real)', () => {
  function makeCollaboradoresConRunnerReal() {
    const ticketRepo = {
      findById: vi.fn<ITicketRepository['findById']>(),
      save: vi.fn<ITicketRepository['save']>().mockResolvedValue(undefined),
      findByIds: unstubbed('findByIds'),
      findByNumero: unstubbed('findByNumero'),
      findLastSecuencia: unstubbed('findLastSecuencia'),
      findAll: unstubbed('findAll'),
      count: unstubbed('count'),
      esVisiblePara: unstubbed('esVisiblePara'),
      bloquear: unstubbed('bloquear'),
      delete: unstubbed('delete'),
      borrarSiActivo: unstubbed('borrarSiActivo'),
      recuperarSiBorrado: unstubbed('recuperarSiBorrado'),
    };
    const operacionRepo = {
      save: vi.fn<IOperacionTicketRepository['save']>().mockResolvedValue(undefined),
      listByTicket: unstubbed('listByTicket'),
      findById: unstubbed('findById'),
    };
    const estadoRepo = {
      findIdByCodigo: vi
        .fn<IEstadoRepository['findIdByCodigo']>()
        .mockResolvedValue('estado-nuevo-uuid'),
      findById: unstubbed('findById'),
      findByCodigo: unstubbed('findByCodigo'),
      findAllActive: unstubbed('findAllActive'),
    };
    const tipoTicketRepo = {
      findById: vi
        .fn<ITipoTicketRepository['findById']>()
        .mockResolvedValue(
          TipoTicketEntity.create(
            { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'TICKETS', activo: true },
            'tipo-soporte-uuid',
          ),
        ),
      findByCodigo: unstubbed('findByCodigo'),
      findIdByCodigo: unstubbed('findIdByCodigo'),
      findAllActive: unstubbed('findAllActive'),
      findAllActiveByModulo: unstubbed('findAllActiveByModulo'),
      findIdsByModulos: unstubbed('findIdsByModulos'),
      save: unstubbed('save'),
    };
    const prioridadRepo = {
      findById: vi
        .fn<IPrioridadRepository['findById']>()
        .mockResolvedValue(
          PrioridadEntity.create(
            { codigo: 'MEDIA', nombre: 'Media', color: null, orden: 2, activo: true },
            'prioridad-media-uuid',
          ),
        ),
      findByCodigo: unstubbed('findByCodigo'),
      findIdByCodigo: unstubbed('findIdByCodigo'),
      findAllActive: unstubbed('findAllActive'),
      save: unstubbed('save'),
    };
    const tipoOperacionRepo = {
      findIdByCodigo: vi
        .fn<ITipoOperacionRepository['findIdByCodigo']>()
        .mockResolvedValue('tipo-op-cambio-estado-uuid'),
      findByCodigo: unstubbed('findByCodigo'),
      findAllActive: unstubbed('findAllActive'),
    };
    const usuarioMasterChecker = {
      existeEnTenant: vi.fn<IUsuarioMasterChecker['existeEnTenant']>().mockResolvedValue(true),
      estaActivoEnTenant: unstubbed('estaActivoEnTenant'),
      resolverNombres: unstubbed('resolverNombres'),
      esAdminTotalEnTenant: unstubbed('esAdminTotalEnTenant'),
      listarAgentes: unstubbed('listarAgentes'),
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
              cicloVigenteId: 'ciclo-vigente-uuid',
              nombre: 'Ciclo 2026',
              fechaInicio: new Date('2026-01-01'),
              fechaFin: new Date('2026-12-31'),
              activo: true,
            },
            'ciclo-activo-uuid',
          ),
        ),
      ),
    };
    const eventPublisher = { publish: vi.fn<IDomainEventPublisher['publish']>() };

    const tenantContext = new TenantContext();
    const txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });

    const useCase = new CrearTicketUseCase(
      ticketRepo,
      operacionRepo,
      estadoRepo,
      tipoTicketRepo,
      prioridadRepo,
      tipoOperacionRepo,
      usuarioMasterChecker,
      numerador,
      resolverCicloActivo,
      { resolver: vi.fn<ResolverAsignacionAutomatica['resolver']>().mockResolvedValue(null) },
      eventPublisher,
      txRunner,
    );

    return { useCase, txRunner, tenantContext, eventPublisher };
  }

  // Doble mínimo del PrismaClient "normal": $transaction ejecuta el callback
  // pasándole un tx double cualquiera (no se usa su contenido en estos tests).
  function makePrismaClientDouble() {
    const txClient = { $transaction: vi.fn() };
    return {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(txClient)),
    };
  }

  it('NO publica mientras la transacción MÁS EXTERNA sigue abierta; SÍ publica después de que comitea', async () => {
    const { useCase, txRunner, tenantContext, eventPublisher } = makeCollaboradoresConRunnerReal();
    const prismaClient = makePrismaClientDouble();

    let publicadoDuranteLaTx: boolean | undefined;

    await tenantContext.run({ prismaClient, dbName: 'test_db', clienteId: 'cliente-uuid' }, () =>
      txRunner.run(async () => {
        // Simula GenerarPreventivosUseCase: llama a CrearTicketUseCase DENTRO
        // de una transacción ya abierta por otro caller (re-entrante).
        const result = await useCase.execute(baseDto());
        expect(result.isOk()).toBe(true);
        publicadoDuranteLaTx = eventPublisher.publish.mock.calls.length > 0;
      }),
    );

    expect(publicadoDuranteLaTx).toBe(false);
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
  });

  it('si la transacción MÁS EXTERNA hace ROLLBACK, el evento NUNCA se publica', async () => {
    const { useCase, txRunner, tenantContext, eventPublisher } = makeCollaboradoresConRunnerReal();
    const prismaClient = makePrismaClientDouble();

    await expect(
      tenantContext.run({ prismaClient, dbName: 'test_db', clienteId: 'cliente-uuid' }, () =>
        txRunner.run(async () => {
          const result = await useCase.execute(baseDto());
          expect(result.isOk()).toBe(true);
          throw new Error('rollback forzado por el caller externo');
        }),
      ),
    ).rejects.toThrow('rollback forzado por el caller externo');

    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});
