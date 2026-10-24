/**
 * T9.1/T9.2 [UNIT] — RED→GREEN: `CrearComentarioUseCase`.
 *
 * Todos los puertos mockeados (`vi.fn`) — sin DB. Cubre T16 (comentario
 * público visible + evento POST-persist, rechazo 422 en estado terminal),
 * T17 (comentario interno, sin evento, sin restricción de estado).
 *
 * Ref spec: sdd/tickets-core/spec T16, T17. Ref design: ADR-6. Tarea: T9.1, T9.2.
 */
import { CrearComentarioUseCase, CrearComentarioDto } from './crear-comentario.use-case';
import type { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import {
  CalcularSlaHabilVenceService,
  CalendarioLaboralSemanal,
} from '../../../calendario-laboral/domain/services/calcular-sla-habil-vence.service';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { TicketComentadoEvent } from '../../domain/events/ticket-comentado.event';
import {
  AccionSobreTipoNoPermitidaError,
  TicketNoEncontradoError,
} from '../../domain/errors/tickets.errors';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { alcancePorTipo, alcanceSinRestriccion } from '../../test-helpers/alcance-ticket';

const ESTADOS: Record<string, EstadoEntity> = {
  NUEVO: EstadoEntity.create(
    { codigo: 'NUEVO', nombre: 'Nuevo', color: null, orden: 1, activo: true },
    'estado-nuevo-uuid',
  ),
  ESPERANDO_CLIENTE: EstadoEntity.create(
    {
      codigo: 'ESPERANDO_CLIENTE',
      nombre: 'Esperando cliente',
      color: null,
      orden: 3,
      activo: true,
    },
    'estado-esperando-cliente-uuid',
  ),
  RESUELTO: EstadoEntity.create(
    { codigo: 'RESUELTO', nombre: 'Resuelto', color: null, orden: 4, activo: true },
    'estado-resuelto-uuid',
  ),
  CERRADO: EstadoEntity.create(
    { codigo: 'CERRADO', nombre: 'Cerrado', color: null, orden: 5, activo: true },
    'estado-cerrado-uuid',
  ),
  CANCELADO: EstadoEntity.create(
    { codigo: 'CANCELADO', nombre: 'Cancelado', color: null, orden: 6, activo: true },
    'estado-cancelado-uuid',
  ),
};

function makeTicket(
  estadoCodigo: keyof typeof ESTADOS = 'NUEVO',
  origen: { solicitanteId: string | null; solicitanteExternoId?: string | null } = {
    solicitanteId: 'solicitante-uuid',
  },
  tipoId = 'tipo-soporte-uuid',
): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Ticket de prueba',
      descripcion: null,
      tipoId,
      estadoId: ESTADOS[estadoCodigo].id,
      prioridadId: 'prioridad-media-uuid',
      cicloId: 'ciclo-uuid',
      ticketReferenciaId: null,
      ...origen,
    },
    'ticket-uuid',
  );
}

const H = 3600;
const abierto = { aperturaMinuto: 540, cierreMinuto: 1080 };
const cerrado = { aperturaMinuto: null, cierreMinuto: null };
/** L-V 09:00-18:00 local, fin de semana cerrado. */
const calendarioSemanal: CalendarioLaboralSemanal = [
  cerrado,
  abierto,
  abierto,
  abierto,
  abierto,
  abierto,
  cerrado,
];
/** Instante local (UTC-3) de un día de agosto de 2026 (lunes = 10). */
const L = (dia: number, hora: number): Date => new Date(Date.UTC(2026, 7, dia, hora + 3));

function baseDto(overrides: Partial<CrearComentarioDto> = {}): CrearComentarioDto {
  return {
    ticketId: 'ticket-uuid',
    texto: 'Un comentario de prueba',
    autorId: 'autor-uuid',
    esInterno: false,
    // Ve cualquier ticket: los casos del comentario no dependen del acceso.
    ...alcanceSinRestriccion('autor-uuid'),
    ...overrides,
  };
}

describe('CrearComentarioUseCase', () => {
  function makeCollaborators() {
    const ticketRepo = {
      findById: vi.fn<ITicketRepository['findById']>(),
      esVisiblePara: vi.fn<ITicketRepository['esVisiblePara']>().mockResolvedValue(false),
    };
    const operacionRepo = {
      save: vi.fn<IOperacionTicketRepository['save']>().mockResolvedValue(undefined),
    };
    const estadoRepo = {
      findById: vi.fn<IEstadoRepository['findById']>((id) =>
        Promise.resolve(Object.values(ESTADOS).find((e) => e.id === id) ?? null),
      ),
    };
    const tipoOperacionRepo = {
      findIdByCodigo: vi
        .fn<ITipoOperacionRepository['findIdByCodigo']>()
        .mockResolvedValue('tipo-op-comentario-uuid'),
    };
    const eventPublisher = { publish: vi.fn<IDomainEventPublisher['publish']>() };
    const txRunner = {
      llamadas: 0,
      async run<T>(fn: () => Promise<T>): Promise<T> {
        this.llamadas += 1;
        return fn();
      },
      alCommitear: vi.fn(),
    } satisfies ITenantTransactionRunner & { llamadas: number };
    const primeraRespuestaRepo = { registrarSiFalta: vi.fn().mockResolvedValue(undefined) };
    const calendarioRepo = { obtener: vi.fn().mockResolvedValue(calendarioSemanal) };
    const feriadosRepo = { obtener: vi.fn().mockResolvedValue(new Set<string>()) };
    const logger = { error: vi.fn() };

    const useCase = new CrearComentarioUseCase(
      ticketRepo,
      operacionRepo,
      estadoRepo,
      tipoOperacionRepo,
      eventPublisher,
      txRunner,
      primeraRespuestaRepo,
      new CalcularSlaHabilVenceService(),
      calendarioRepo,
      feriadosRepo,
      logger,
    );

    return {
      useCase,
      ticketRepo,
      operacionRepo,
      estadoRepo,
      tipoOperacionRepo,
      eventPublisher,
      txRunner,
      primeraRespuestaRepo,
      calendarioRepo,
      feriadosRepo,
      logger,
    };
  }

  it('T16: comentario público en ticket NUEVO — crea operación COMENTARIO es_interno=false y emite TicketComentadoEvent', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));

    const result = await c.useCase.execute(
      baseDto({ esInterno: false, texto: 'Hola, ¿alguna novedad?' }),
    );

    expect(result.isOk()).toBe(true);
    const operacion = result.getValue();
    expect(operacion.ticketId).toBe('ticket-uuid');
    expect(operacion.tipoOperacionId).toBe('tipo-op-comentario-uuid');
    expect(operacion.descripcion).toBe('Hola, ¿alguna novedad?');
    expect(operacion.esInterno).toBe(false);
    expect(operacion.autorId).toBe('autor-uuid');
    expect(c.operacionRepo.save).toHaveBeenCalledWith(operacion);

    expect(c.eventPublisher.publish).toHaveBeenCalledTimes(1);
    const evento = c.eventPublisher.publish.mock.calls[0][0] as TicketComentadoEvent;
    expect(evento).toBeInstanceOf(TicketComentadoEvent);
    expect(evento.name).toBe('ticket.comentado');
    expect(evento.ticketId).toBe('ticket-uuid');
    expect(evento.autorId).toBe('autor-uuid');
  });

  describe('en RESUELTO, CERRADO o CANCELADO comenta cualquiera que pueda comentar (odd/cerrado-solo-comentarios, S4)', () => {
    // Un técnico, no administrador: ve el ticket y tiene COMENTAR y OBSERVAR sobre su tipo.
    const tecnico = alcancePorTipo('autor-uuid', {
      'tipo-soporte-uuid': ['LECTURA', 'VER_TODOS', 'COMENTAR', 'OBSERVAR'],
    });

    it.each(['RESUELTO', 'CERRADO', 'CANCELADO'] as const)(
      'un comentario público en %s se guarda y avisa (TicketComentadoEvent), sin cambiar el ticket',
      async (estadoCodigo) => {
        const c = makeCollaborators();
        const ticket = makeTicket(estadoCodigo);
        c.ticketRepo.findById.mockResolvedValue(ticket);

        const result = await c.useCase.execute(
          baseDto({ ...tecnico, esInterno: false, texto: 'Gracias, quedó funcionando.' }),
        );

        const operacion = result.getValue();
        expect(operacion.esInterno).toBe(false);
        expect(operacion.descripcion).toBe('Gracias, quedó funcionando.');
        expect(operacion.estadoAnteriorId).toBeNull();
        expect(operacion.estadoNuevoId).toBeNull();
        expect(c.operacionRepo.save).toHaveBeenCalledWith(operacion);
        expect(c.eventPublisher.publish).toHaveBeenCalledTimes(1);
        expect(ticket.estadoId).toBe(ESTADOS[estadoCodigo].id);
      },
    );

    it.each(['RESUELTO', 'CERRADO', 'CANCELADO'] as const)(
      'un comentario interno en %s se guarda sin avisar',
      async (estadoCodigo) => {
        const c = makeCollaborators();
        c.ticketRepo.findById.mockResolvedValue(makeTicket(estadoCodigo));

        const result = await c.useCase.execute(baseDto({ ...tecnico, esInterno: true }));

        expect(result.getValue().esInterno).toBe(true);
        expect(c.operacionRepo.save).toHaveBeenCalledTimes(1);
        expect(c.eventPublisher.publish).not.toHaveBeenCalled();
      },
    );

    it('sin COMENTAR sobre el tipo sigue siendo 403, también en CERRADO', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('CERRADO'));

      const result = await c.useCase.execute(
        baseDto({
          ...alcancePorTipo('autor-uuid', { 'tipo-soporte-uuid': ['LECTURA', 'VER_TODOS'] }),
          esInterno: false,
        }),
      );

      expect(result.getError()).toBeInstanceOf(AccionSobreTipoNoPermitidaError);
      expect(c.operacionRepo.save).not.toHaveBeenCalled();
    });
  });

  it('T17: comentario interno — crea operación es_interno=true, NUNCA emite evento', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));

    const result = await c.useCase.execute(
      baseDto({ esInterno: true, texto: 'Nota técnica interna' }),
    );

    expect(result.isOk()).toBe(true);
    expect(result.getValue().esInterno).toBe(true);
    expect(c.eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('T17: comentario interno se permite incluso en estado terminal (CERRADO)', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('CERRADO'));

    const result = await c.useCase.execute(baseDto({ esInterno: true }));

    expect(result.isOk()).toBe(true);
    expect(result.getValue().esInterno).toBe(true);
    expect(c.eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('ticket inexistente → TicketNoEncontradoError (404), sin persistir', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(c.operacionRepo.save).not.toHaveBeenCalled();
  });

  it('ticket soft-deleted → TicketNoEncontradoError (404)', async () => {
    const c = makeCollaborators();
    const ticket = makeTicket('NUEVO');
    ticket.softDelete();
    c.ticketRepo.findById.mockResolvedValue(ticket);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
  });

  it('publisher que lanza → log-and-swallow, Result.ok igual (el comentario ya persistido no se revierte)', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));
    c.eventPublisher.publish.mockImplementation(() => {
      throw new Error('boom: listener roto');
    });

    const result = await c.useCase.execute(baseDto({ esInterno: false }));

    expect(result.isOk()).toBe(true);
    expect(c.operacionRepo.save).toHaveBeenCalledTimes(1);
  });

  describe('primera respuesta (sla-primera-respuesta R1)', () => {
    it('comentario público de un técnico registra la fecha de la operación, dentro de la tx', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));

      const result = await c.useCase.execute(baseDto({ esInterno: false }));

      const operacion = result.getValue();
      expect(c.primeraRespuestaRepo.registrarSiFalta).toHaveBeenCalledTimes(1);
      expect(c.primeraRespuestaRepo.registrarSiFalta).toHaveBeenCalledWith(
        'ticket-uuid',
        operacion.createdAt,
        expect.any(Number),
      );
      expect(c.txRunner.llamadas).toBe(1);
    });

    it('registra después de guardar la operación, ambos dentro de la misma tx', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));
      const orden: string[] = [];
      c.operacionRepo.save.mockImplementation(() => {
        orden.push('save');
        return Promise.resolve();
      });
      c.primeraRespuestaRepo.registrarSiFalta.mockImplementation(() => {
        orden.push('registrar');
        return Promise.resolve();
      });
      c.txRunner.run = async <T>(fn: () => Promise<T>): Promise<T> => {
        orden.push('tx-inicio');
        const r = await fn();
        orden.push('tx-fin');
        return r;
      };

      await c.useCase.execute(baseDto({ esInterno: false }));

      expect(orden).toEqual(['tx-inicio', 'save', 'registrar', 'tx-fin']);
    });

    it('un comentario interno no la registra ni carga el calendario', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));

      await c.useCase.execute(baseDto({ esInterno: true }));

      expect(c.primeraRespuestaRepo.registrarSiFalta).not.toHaveBeenCalled();
      expect(c.calendarioRepo.obtener).not.toHaveBeenCalled();
      expect(c.feriadosRepo.obtener).not.toHaveBeenCalled();
    });

    it('un comentario público del propio solicitante no la registra', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));

      await c.useCase.execute(baseDto({ esInterno: false, autorId: 'solicitante-uuid' }));

      expect(c.primeraRespuestaRepo.registrarSiFalta).not.toHaveBeenCalled();
      expect(c.calendarioRepo.obtener).not.toHaveBeenCalled();
      expect(c.operacionRepo.save).toHaveBeenCalledTimes(1);
    });

    it('solicitante externo (solicitanteId null): cualquier autor interno la registra', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(
        makeTicket('NUEVO', { solicitanteId: null, solicitanteExternoId: 'externo-uuid' }),
      );

      await c.useCase.execute(baseDto({ esInterno: false, autorId: 'cualquier-interno-uuid' }));

      expect(c.primeraRespuestaRepo.registrarSiFalta).toHaveBeenCalledTimes(1);
    });

    it('un comentario público del usuario de integración no la registra, aunque no sea el solicitante', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));

      const result = await c.useCase.execute(
        baseDto({ esInterno: false, autorId: 'integracion-uuid', autorEsIntegracion: true }),
      );

      expect(result.isOk()).toBe(true);
      expect(c.primeraRespuestaRepo.registrarSiFalta).not.toHaveBeenCalled();
      expect(c.operacionRepo.save).toHaveBeenCalledTimes(1);
      expect(c.eventPublisher.publish).toHaveBeenCalledTimes(1);
    });

    it.each(['RESUELTO', 'CERRADO', 'CANCELADO'] as const)(
      'en %s un comentario público de un técnico no la registra ni carga el calendario: el ticket ya no la espera',
      async (estadoCodigo) => {
        const c = makeCollaborators();
        c.ticketRepo.findById.mockResolvedValue(makeTicket(estadoCodigo));

        const result = await c.useCase.execute(baseDto({ esInterno: false }));

        expect(result.isOk()).toBe(true);
        expect(c.operacionRepo.save).toHaveBeenCalledTimes(1);
        expect(c.primeraRespuestaRepo.registrarSiFalta).not.toHaveBeenCalled();
        expect(c.calendarioRepo.obtener).not.toHaveBeenCalled();
      },
    );

    it('en ESPERANDO_CLIENTE sí la registra (el reloj de primera respuesta no se pausa)', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('ESPERANDO_CLIENTE'));

      await c.useCase.execute(baseDto({ esInterno: false }));

      expect(c.primeraRespuestaRepo.registrarSiFalta).toHaveBeenCalledTimes(1);
    });

    describe('segundos hábiles (odd/promedios-dashboard-habiles)', () => {
      beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
      afterEach(() => vi.useRealTimers());

      /** Ticket creado el lunes 10 a las 09:00 y comentado el martes 11 a las 12:00. */
      async function comentarLunesAMartes(feriados: Set<string>) {
        const c = makeCollaborators();
        c.feriadosRepo.obtener.mockResolvedValue(feriados);
        vi.setSystemTime(L(10, 9));
        c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));
        vi.setSystemTime(L(11, 12));
        const operacion = (await c.useCase.execute(baseDto({ esInterno: false }))).getValue();
        return { c, operacion };
      }

      it('guarda las horas hábiles desde la creación: 9 h del lunes + 3 h del martes', async () => {
        const { c, operacion } = await comentarLunesAMartes(new Set());

        expect(c.primeraRespuestaRepo.registrarSiFalta).toHaveBeenCalledWith(
          'ticket-uuid',
          operacion.createdAt,
          12 * H,
        );
      });

      it('un feriado no cuenta: con el lunes feriado quedan las 3 h del martes', async () => {
        const { c } = await comentarLunesAMartes(new Set(['2026-08-10']));

        expect(c.primeraRespuestaRepo.registrarSiFalta.mock.calls[0][2]).toBe(3 * H);
      });

      it('si el calendario no se puede cargar, el comentario igual se guarda con los segundos en null', async () => {
        const c = makeCollaborators();
        c.calendarioRepo.obtener.mockRejectedValue(new Error('master caído'));
        c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));
        const texto = 'Texto privado del comentario';

        const result = await c.useCase.execute(baseDto({ esInterno: false, texto }));

        expect(result.isOk()).toBe(true);
        const operacion = result.getValue();
        expect(c.operacionRepo.save).toHaveBeenCalledWith(operacion);
        expect(c.primeraRespuestaRepo.registrarSiFalta).toHaveBeenCalledWith(
          'ticket-uuid',
          operacion.createdAt,
          null,
        );
        expect(c.logger.error).toHaveBeenCalledTimes(1);
        const mensaje = String(c.logger.error.mock.calls[0][0]);
        expect(mensaje).toContain('ticket-uuid');
        expect(mensaje).toContain('master caído');
        expect(mensaje).not.toContain(texto);
      });

      it('si msHabilesEntre lanza (guarda de rango), el comentario igual se guarda con null', async () => {
        const c = makeCollaborators();
        const espia = vi
          .spyOn(CalcularSlaHabilVenceService.prototype, 'msHabilesEntre')
          .mockImplementation(() => {
            throw new Error('rango excedido');
          });
        c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));

        try {
          const result = await c.useCase.execute(baseDto({ esInterno: false }));

          expect(result.isOk()).toBe(true);
          expect(c.primeraRespuestaRepo.registrarSiFalta.mock.calls[0][2]).toBeNull();
          expect(c.logger.error).toHaveBeenCalledTimes(1);
        } finally {
          espia.mockRestore();
        }
      });

      it('si el ticket ya tiene primera respuesta no carga el calendario', async () => {
        const c = makeCollaborators();
        const nuevo = makeTicket('NUEVO');
        const respondido = TicketEntity.reconstitute(
          {
            numero: nuevo.numero,
            titulo: nuevo.titulo,
            descripcion: null,
            tipoId: nuevo.tipoId,
            estadoId: nuevo.estadoId,
            prioridadId: nuevo.prioridadId,
            cicloId: null,
            ticketReferenciaId: null,
            solicitanteId: 'solicitante-uuid',
            solicitanteExternoId: null,
            asignadoId: null,
            slaVenceAt: null,
            vencido: false,
            fechaCierre: null,
          },
          'ticket-uuid',
          L(10, 9),
          L(10, 9),
          null,
          'HABIL',
          {
            acumuladoS: 0,
            metaS: null,
            correDesde: L(10, 9),
            seqHasta: 0,
            version: 0,
            pendiente: false,
            cumplido: null,
            primeraRespuestaAt: L(10, 10),
          },
        );
        c.ticketRepo.findById.mockResolvedValue(respondido);

        await c.useCase.execute(baseDto({ esInterno: false }));

        expect(c.calendarioRepo.obtener).not.toHaveBeenCalled();
        expect(c.primeraRespuestaRepo.registrarSiFalta.mock.calls[0][2]).toBeNull();
      });
    });
  });

  describe('permisos por tipo (odd/permisos-por-tipo-ticket, S2, S3, S6)', () => {
    // Mismo usuario: Soporte con Ver, Comentar y Comentario interno; Mantenimiento con Ver y
    // Comentar; Edilicia solo con Ver; Electricidad sin nada.
    const alcance = alcancePorTipo('solicitante-uuid', {
      'tipo-soporte-uuid': ['LECTURA', 'COMENTAR', 'OBSERVAR'],
      'tipo-mantenimiento-uuid': ['LECTURA', 'COMENTAR'],
      'tipo-edilicia-uuid': ['LECTURA'],
    });
    const deSolicitante = { autorId: 'solicitante-uuid', ...alcance };

    it.each([false, true])(
      'comenta un ticket de un tipo con COMENTAR y OBSERVAR (interno: %s)',
      async (esInterno) => {
        const c = makeCollaborators();
        c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));

        const result = await c.useCase.execute(baseDto({ ...deSolicitante, esInterno }));

        expect(result.getValue().esInterno).toBe(esInterno);
        expect(c.operacionRepo.save).toHaveBeenCalledTimes(1);
      },
    );

    it('un comentario público en un tipo con solo LECTURA es 403; no se escribe ni se publica nada', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(
        makeTicket('NUEVO', { solicitanteId: 'solicitante-uuid' }, 'tipo-edilicia-uuid'),
      );

      const result = await c.useCase.execute(baseDto(deSolicitante));

      expect(result.getError()).toBeInstanceOf(AccionSobreTipoNoPermitidaError);
      expect(result.getError().message).toContain('"COMENTAR"');
      expect(c.txRunner.llamadas).toBe(0);
      expect(c.operacionRepo.save).not.toHaveBeenCalled();
      expect(c.primeraRespuestaRepo.registrarSiFalta).not.toHaveBeenCalled();
      expect(c.eventPublisher.publish).not.toHaveBeenCalled();
    });

    it('un comentario interno en un tipo con COMENTAR pero sin OBSERVAR es 403; no se escribe', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(
        makeTicket('NUEVO', { solicitanteId: 'solicitante-uuid' }, 'tipo-mantenimiento-uuid'),
      );

      const result = await c.useCase.execute(baseDto({ ...deSolicitante, esInterno: true }));

      expect(result.getError()).toBeInstanceOf(AccionSobreTipoNoPermitidaError);
      expect(result.getError().message).toContain('"OBSERVAR"');
      expect(c.txRunner.llamadas).toBe(0);
      expect(c.operacionRepo.save).not.toHaveBeenCalled();
    });

    it('un ticket de un tipo sin LECTURA es 404 aunque el autor sea el solicitante; no se escribe', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(
        makeTicket('NUEVO', { solicitanteId: 'solicitante-uuid' }, 'tipo-electricidad-uuid'),
      );

      const result = await c.useCase.execute(baseDto(deSolicitante));

      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(c.txRunner.llamadas).toBe(0);
      expect(c.operacionRepo.save).not.toHaveBeenCalled();
      expect(c.eventPublisher.publish).not.toHaveBeenCalled();
    });

    it('un ticket que el actor no ve por fila (sin VER_TODOS, ni solicitante, ni responsable, ni tarea) es 404 y no se escribe', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));

      const result = await c.useCase.execute(
        baseDto({
          esInterno: true,
          ...alcancePorTipo('autor-uuid', {
            'tipo-soporte-uuid': ['LECTURA', 'COMENTAR', 'OBSERVAR'],
          }),
        }),
      );

      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(c.ticketRepo.esVisiblePara).toHaveBeenCalledWith('ticket-uuid', 'autor-uuid');
      expect(c.operacionRepo.save).not.toHaveBeenCalled();
    });

    it('sin restricción (ROOT o ADMINISTRADOR) comenta, también interno, un tipo sin filas', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(
        makeTicket('NUEVO', { solicitanteId: 'solicitante-uuid' }, 'tipo-electricidad-uuid'),
      );

      const result = await c.useCase.execute(baseDto({ esInterno: true }));

      expect(result.isOk()).toBe(true);
      expect(c.operacionRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});
