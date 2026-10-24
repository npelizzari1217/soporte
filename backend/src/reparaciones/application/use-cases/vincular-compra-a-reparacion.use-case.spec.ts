/**
 * WU5.1 [UNIT] — `VincularCompraAReparacionUseCase`.
 *
 * Desde odd/ticket-unificado (S1, S4) vincula una compra a un ticket de CUALQUIER tipo, por id de
 * ticket, y exige `MODIFICACION` sobre su tipo. Vinculación exitosa, idempotencia (D4), 404 por
 * ticket o compra inexistente, y el lock contra un borrado concurrente (L45).
 *
 * Ref design: sdd/reparacion-bloqueada-por-compra/design, D4, D7.
 */
import { VincularCompraAReparacionUseCase } from './vincular-compra-a-reparacion.use-case';
import { IReparacionCompraRepository } from '../../domain/ports/i-reparacion-compra.repository';
import { ICompraRepository } from '../../../compras/domain/ports/i-compra.repository';
import { CompraEntity } from '../../../compras/domain/entities/compra.entity';
import { CompraNoEncontradaError } from '../../domain/errors/reparaciones.errors';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { EstadoEntity } from '../../../tickets/domain/entities/estado.entity';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import {
  AccionSobreTipoNoPermitidaError,
  TicketNoEncontradoError,
  TicketSoloComentariosError,
} from '../../../tickets/domain/errors/tickets.errors';
import {
  alcancePorTipo,
  alcanceSinRestriccion,
} from '../../../tickets/test-helpers/alcance-ticket';

/** Ticket de tipo `tipo-soporte`: el vínculo ya no depende de que sea de Edilicia. */
function ticketBase(estadoCodigo = 'NUEVO'): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Impresora sin tóner',
      descripcion: null,
      tipoId: 'tipo-soporte',
      estadoId: `estado-${estadoCodigo}`,
      prioridadId: 'prioridad-media',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
    },
    'ticket-uuid',
  );
}

/** Estado del catálogo para un id `estado-<CODIGO>`. */
function estadoDeId(id: string): EstadoEntity {
  const codigo = id.replace('estado-', '');
  return EstadoEntity.create({ codigo, nombre: codigo, color: null, orden: 1, activo: true }, id);
}

/** Compra existente: el caso de uso solo verifica que exista, el contenido no importa. */
function compraExistente(): CompraEntity {
  return CompraEntity.create(
    {
      numero: 'COM-2026-00001',
      fechaSolicitud: new Date('2026-08-01'),
      motivo: 'Tóner',
      descripcion: null,
      solicitanteId: 'solicitante-uuid',
      cicloId: 'ciclo-uuid',
    },
    'compra-uuid',
  );
}

describe('VincularCompraAReparacionUseCase', () => {
  function buildDeps() {
    const compraRepo = {
      findByIdConItems: vi
        .fn<ICompraRepository['findByIdConItems']>()
        .mockResolvedValue(compraExistente()),
    };
    const reparacionCompraRepo = {
      vincular: vi.fn<IReparacionCompraRepository['vincular']>().mockResolvedValue(undefined),
    };

    let enTransaccion = false;
    const ticketRepo = {
      findById: vi.fn<ITicketRepository['findById']>().mockResolvedValue(ticketBase()),
      esVisiblePara: vi.fn<ITicketRepository['esVisiblePara']>().mockResolvedValue(false),
      bloquear: vi.fn<ITicketRepository['bloquear']>(async () => {
        expect(enTransaccion).toBe(true);
      }),
    };
    reparacionCompraRepo.vincular.mockImplementation(async () => {
      expect(enTransaccion).toBe(true);
    });
    const txRunner = {
      run: async <T>(fn: () => Promise<T>): Promise<T> => {
        enTransaccion = true;
        try {
          return await fn();
        } finally {
          enTransaccion = false;
        }
      },
    };

    const estadoRepo = { findById: async (id: string) => estadoDeId(id) };

    const useCase = new VincularCompraAReparacionUseCase(
      compraRepo,
      reparacionCompraRepo,
      ticketRepo,
      txRunner,
      estadoRepo,
    );

    return { useCase, compraRepo, reparacionCompraRepo, ticketRepo };
  }

  const baseDto = {
    ticketId: 'ticket-uuid',
    compraId: 'compra-uuid',
    alcance: alcanceSinRestriccion('actor-uuid'),
  };

  it('vincula la compra al ticket cuando ambos existen, por id de ticket', async () => {
    const { useCase, reparacionCompraRepo } = buildDeps();

    const result = await useCase.execute(baseDto);

    expect(result.isOk()).toBe(true);
    expect(reparacionCompraRepo.vincular).toHaveBeenCalledWith('ticket-uuid', 'compra-uuid');
  });

  it('es idempotente: vincular el mismo par dos veces no falla y delega en el puerto las dos veces', async () => {
    const { useCase, reparacionCompraRepo } = buildDeps();

    const primero = await useCase.execute(baseDto);
    const segundo = await useCase.execute(baseDto);

    expect(primero.isOk()).toBe(true);
    expect(segundo.isOk()).toBe(true);
    // La idempotencia real (UNIQUE + ON CONFLICT DO NOTHING) vive en el repositorio: acá solo se
    // verifica que el caso de uso delega sin "check-then-insert" propio.
    expect(reparacionCompraRepo.vincular).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['no existe', null],
    [
      'está borrado',
      (() => {
        const t = ticketBase();
        t.softDelete(new Date('2026-10-22T15:00:00Z'));
        return t;
      })(),
    ],
  ])('rechaza con 404 cuando el ticket %s, sin buscar la compra', async (_caso, ticket) => {
    const { useCase, compraRepo, reparacionCompraRepo, ticketRepo } = buildDeps();
    ticketRepo.findById.mockResolvedValue(ticket);

    const result = await useCase.execute(baseDto);

    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(compraRepo.findByIdConItems).not.toHaveBeenCalled();
    expect(reparacionCompraRepo.vincular).not.toHaveBeenCalled();
  });

  it('un ticket borrado entre la carga y el lock da 404 y no vincula (odd/permisos-por-tipo-ticket, L45)', async () => {
    const { useCase, reparacionCompraRepo, ticketRepo } = buildDeps();
    // Otra transacción borra el ticket y hace commit mientras este caso de uso espera el lock.
    ticketRepo.bloquear.mockImplementationOnce(async () => {
      const borrado = ticketBase();
      borrado.softDelete(new Date('2026-10-22T15:00:00Z'));
      ticketRepo.findById.mockResolvedValue(borrado);
    });

    const result = await useCase.execute(baseDto);

    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(ticketRepo.bloquear).toHaveBeenCalledWith('ticket-uuid');
    expect(reparacionCompraRepo.vincular).not.toHaveBeenCalled();
  });

  it('rechaza con 404 cuando la compra no existe', async () => {
    const { useCase, compraRepo, reparacionCompraRepo } = buildDeps();
    compraRepo.findByIdConItems.mockResolvedValue(null);

    const result = await useCase.execute(baseDto);

    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
    expect(result.getError().message).toBe('Compra con id "compra-uuid" no encontrada.');
    expect(reparacionCompraRepo.vincular).not.toHaveBeenCalled();
  });

  describe('permisos por tipo del ticket (odd/ticket-unificado, S4)', () => {
    it('no ve el ticket (sin LECTURA sobre su tipo) → 404, sin vincular', async () => {
      const { useCase, compraRepo, reparacionCompraRepo } = buildDeps();

      const result = await useCase.execute({
        ...baseDto,
        alcance: alcancePorTipo('actor-uuid', {
          'tipo-otro': ['LECTURA', 'VER_TODOS', 'MODIFICACION'],
        }),
      });

      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(compraRepo.findByIdConItems).not.toHaveBeenCalled();
      expect(reparacionCompraRepo.vincular).not.toHaveBeenCalled();
    });

    it('lo ve con ALTAS pero sin MODIFICACION sobre el tipo → 403, sin vincular', async () => {
      const { useCase, reparacionCompraRepo } = buildDeps();

      const result = await useCase.execute({
        ...baseDto,
        alcance: alcancePorTipo('actor-uuid', {
          'tipo-soporte': ['LECTURA', 'VER_TODOS', 'ALTAS'],
        }),
      });

      expect(result.getError()).toBeInstanceOf(AccionSobreTipoNoPermitidaError);
      expect(result.getError().message).toBe(
        'El usuario no tiene el permiso "MODIFICACION" sobre el tipo de este ticket.',
      );
      expect(reparacionCompraRepo.vincular).not.toHaveBeenCalled();
    });

    it('lo ve con MODIFICACION sobre el tipo → vincula', async () => {
      const { useCase, reparacionCompraRepo } = buildDeps();

      const result = await useCase.execute({
        ...baseDto,
        alcance: alcancePorTipo('actor-uuid', {
          'tipo-soporte': ['LECTURA', 'VER_TODOS', 'MODIFICACION'],
        }),
      });

      expect(result.isOk()).toBe(true);
      expect(reparacionCompraRepo.vincular).toHaveBeenCalledWith('ticket-uuid', 'compra-uuid');
    });
  });
  describe('resuelto, cerrado o cancelado: solo comentarios (odd/cerrado-solo-comentarios, S5)', () => {
    const tecnico = alcancePorTipo('actor-uuid', {
      'tipo-soporte': ['LECTURA', 'VER_TODOS', 'MODIFICACION'],
    });

    it.each(['RESUELTO', 'CERRADO', 'CANCELADO'])(
      'en %s un no administrador recibe TicketSoloComentariosError (422) y no vincula',
      async (estado) => {
        const { useCase, ticketRepo, reparacionCompraRepo, compraRepo } = buildDeps();
        ticketRepo.findById.mockResolvedValue(ticketBase(estado));

        const result = await useCase.execute({ ...baseDto, alcance: tecnico });

        const error = result.getError();
        expect(error).toBeInstanceOf(TicketSoloComentariosError);
        expect((error as TicketSoloComentariosError).estadoCodigo).toBe(estado);
        expect(reparacionCompraRepo.vincular).not.toHaveBeenCalled();
        expect(compraRepo.findByIdConItems).not.toHaveBeenCalled();
      },
    );

    it('en CERRADO un ADMINISTRADOR o ROOT vincula (S3)', async () => {
      const { useCase, ticketRepo, reparacionCompraRepo } = buildDeps();
      ticketRepo.findById.mockResolvedValue(ticketBase('CERRADO'));

      const result = await useCase.execute(baseDto);

      expect(result.isOk()).toBe(true);
      expect(reparacionCompraRepo.vincular).toHaveBeenCalledWith('ticket-uuid', 'compra-uuid');
    });

    it('si el ticket pasó a CERRADO mientras se esperaba el lock, no vincula', async () => {
      const { useCase, ticketRepo, reparacionCompraRepo } = buildDeps();
      ticketRepo.findById
        .mockResolvedValueOnce(ticketBase('EN_PROCESO'))
        .mockResolvedValueOnce(ticketBase('CERRADO'));

      const result = await useCase.execute({ ...baseDto, alcance: tecnico });

      expect(result.getError()).toBeInstanceOf(TicketSoloComentariosError);
      expect(reparacionCompraRepo.vincular).not.toHaveBeenCalled();
    });
  });
});
