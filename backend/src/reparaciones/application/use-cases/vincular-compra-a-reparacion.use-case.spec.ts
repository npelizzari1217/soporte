/**
 * WU5.1 [UNIT][RED] — `VincularCompraAReparacionUseCase`.
 *
 * Vinculación exitosa, idempotencia (D4: doble vinculación no crea una
 * segunda fila ni altera la derivación), 404 por reparación inexistente,
 * 404 por compra inexistente.
 *
 * Ref design: sdd/reparacion-bloqueada-por-compra/design, D4, D7. Ref tasks:
 * WU5.1, WU5.2.
 */
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { VincularCompraAReparacionUseCase } from './vincular-compra-a-reparacion.use-case';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { IReparacionCompraRepository } from '../../domain/ports/i-reparacion-compra.repository';
import { ICompraRepository } from '../../../compras/domain/ports/i-compra.repository';
import { CompraEntity } from '../../../compras/domain/entities/compra.entity';
import {
  TicketEdiliciaNoEncontradoError,
  CompraNoEncontradaError,
} from '../../domain/errors/reparaciones.errors';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { AccionSobreTipoNoPermitidaError } from '../../../tickets/domain/errors/tickets.errors';
import {
  alcancePorTipo,
  alcanceSinRestriccion,
} from '../../../tickets/test-helpers/alcance-ticket';

/** Ticket base de la reparación, de tipo `tipo-edilicia`. */
function ticketBase(): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'EDI-2026-00001',
      titulo: 'Pérdida en el baño',
      descripcion: null,
      tipoId: 'tipo-edilicia',
      estadoId: 'estado-nuevo',
      prioridadId: 'prioridad-media',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
    },
    'ticket-uuid',
  );
}

/** Compra existente: el caso de uso solo verifica que exista, el contenido no importa. */
function compraExistente(): CompraEntity {
  return CompraEntity.create(
    {
      numero: 'COM-2026-00001',
      fechaSolicitud: new Date('2026-08-01'),
      motivo: 'Repuestos para la reparación',
      descripcion: null,
      solicitanteId: 'solicitante-uuid',
      cicloId: 'ciclo-uuid',
    },
    'compra-uuid',
  );
}

describe('VincularCompraAReparacionUseCase', () => {
  function buildDeps() {
    const ticketEdiliciaRepo = { findById: vi.fn<ITicketEdiliciaRepository['findById']>() };
    const compraRepo = { findByIdConItems: vi.fn<ICompraRepository['findByIdConItems']>() };
    const reparacionCompraRepo = {
      vincular: vi.fn<IReparacionCompraRepository['vincular']>().mockResolvedValue(undefined),
    };

    const ticketRepo = {
      findById: vi.fn<ITicketRepository['findById']>().mockResolvedValue(ticketBase()),
      esVisiblePara: vi.fn<ITicketRepository['esVisiblePara']>().mockResolvedValue(false),
    };

    const useCase = new VincularCompraAReparacionUseCase(
      ticketEdiliciaRepo,
      compraRepo,
      reparacionCompraRepo,
      ticketRepo,
    );

    return { useCase, ticketEdiliciaRepo, compraRepo, reparacionCompraRepo };
  }

  const baseDto = {
    ticketEdiliciaId: 'edilicia-uuid',
    compraId: 'compra-uuid',
    alcance: alcanceSinRestriccion('actor-uuid'),
  };

  it('vincula la compra a la reparación cuando ambas existen', async () => {
    const { useCase, ticketEdiliciaRepo, compraRepo, reparacionCompraRepo } = buildDeps();
    const edilicia = TicketEdiliciaEntity.create(
      { ticketId: 'ticket-uuid', ubicacion: 'Edificio Central' },
      'edilicia-uuid',
    );
    ticketEdiliciaRepo.findById.mockResolvedValue(edilicia);
    compraRepo.findByIdConItems.mockResolvedValue(compraExistente());

    const result = await useCase.execute(baseDto);

    expect(result.isOk()).toBe(true);
    expect(reparacionCompraRepo.vincular).toHaveBeenCalledWith('edilicia-uuid', 'compra-uuid');
  });

  it('es idempotente: vincular el mismo par dos veces no falla y delega en el puerto las dos veces', async () => {
    const { useCase, ticketEdiliciaRepo, compraRepo, reparacionCompraRepo } = buildDeps();
    const edilicia = TicketEdiliciaEntity.create(
      { ticketId: 'ticket-uuid', ubicacion: 'Edificio Central' },
      'edilicia-uuid',
    );
    ticketEdiliciaRepo.findById.mockResolvedValue(edilicia);
    compraRepo.findByIdConItems.mockResolvedValue(compraExistente());

    const primero = await useCase.execute(baseDto);
    const segundo = await useCase.execute(baseDto);

    expect(primero.isOk()).toBe(true);
    expect(segundo.isOk()).toBe(true);
    // La idempotencia real (UNIQUE + ON CONFLICT DO NOTHING) vive en el
    // repositorio (WU2) — acá solo se verifica que el caso de uso delega
    // sin lógica de "check-then-insert" propia.
    expect(reparacionCompraRepo.vincular).toHaveBeenCalledTimes(2);
  });

  it('rechaza con 404 cuando la reparación no existe', async () => {
    const { useCase, ticketEdiliciaRepo, compraRepo, reparacionCompraRepo } = buildDeps();
    ticketEdiliciaRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute(baseDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketEdiliciaNoEncontradoError);
    expect(compraRepo.findByIdConItems).not.toHaveBeenCalled();
    expect(reparacionCompraRepo.vincular).not.toHaveBeenCalled();
  });

  it('rechaza con 404 cuando la compra no existe', async () => {
    const { useCase, ticketEdiliciaRepo, compraRepo, reparacionCompraRepo } = buildDeps();
    const edilicia = TicketEdiliciaEntity.create(
      { ticketId: 'ticket-uuid', ubicacion: 'Edificio Central' },
      'edilicia-uuid',
    );
    ticketEdiliciaRepo.findById.mockResolvedValue(edilicia);
    compraRepo.findByIdConItems.mockResolvedValue(null);

    const result = await useCase.execute(baseDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
    expect(reparacionCompraRepo.vincular).not.toHaveBeenCalled();
  });

  describe('permisos por tipo del ticket base (odd/permisos-por-tipo-ticket, D5 c)', () => {
    function conReparacionYCompra() {
      const deps = buildDeps();
      deps.ticketEdiliciaRepo.findById.mockResolvedValue(
        TicketEdiliciaEntity.create({ ticketId: 'ticket-uuid', ubicacion: null }, 'edilicia-uuid'),
      );
      deps.compraRepo.findByIdConItems.mockResolvedValue(compraExistente());
      return deps;
    }

    it('no ve el ticket base (sin LECTURA sobre su tipo) → 404 de la reparación, sin vincular', async () => {
      const { useCase, compraRepo, reparacionCompraRepo } = conReparacionYCompra();

      const result = await useCase.execute({
        ...baseDto,
        alcance: alcancePorTipo('actor-uuid', { 'tipo-otro': ['LECTURA', 'VER_TODOS', 'ALTAS'] }),
      });

      expect(result.getError()).toBeInstanceOf(TicketEdiliciaNoEncontradoError);
      expect(compraRepo.findByIdConItems).not.toHaveBeenCalled();
      expect(reparacionCompraRepo.vincular).not.toHaveBeenCalled();
    });

    it('lo ve sin ALTAS sobre el tipo → 403, sin vincular', async () => {
      const { useCase, reparacionCompraRepo } = conReparacionYCompra();

      const result = await useCase.execute({
        ...baseDto,
        alcance: alcancePorTipo('actor-uuid', {
          'tipo-edilicia': ['LECTURA', 'VER_TODOS', 'MODIFICACION'],
        }),
      });

      expect(result.getError()).toBeInstanceOf(AccionSobreTipoNoPermitidaError);
      expect(reparacionCompraRepo.vincular).not.toHaveBeenCalled();
    });

    it('lo ve con ALTAS sobre el tipo → vincula', async () => {
      const { useCase, reparacionCompraRepo } = conReparacionYCompra();

      const result = await useCase.execute({
        ...baseDto,
        alcance: alcancePorTipo('actor-uuid', {
          'tipo-edilicia': ['LECTURA', 'VER_TODOS', 'ALTAS'],
        }),
      });

      expect(result.isOk()).toBe(true);
      expect(reparacionCompraRepo.vincular).toHaveBeenCalledWith('edilicia-uuid', 'compra-uuid');
    });
  });
});
