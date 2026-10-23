/**
 * WU5.3 [UNIT] — `DesvincularCompraDeReparacionUseCase`.
 *
 * Desde odd/ticket-unificado (S1, S4) desvincula por id de ticket, de cualquier tipo, y exige
 * `MODIFICACION` sobre su tipo (antes, la celda `EDILICIA:BORRADO` de la ruta). Desvinculación
 * exitosa (hard delete real, D5) y 404 con vínculo inexistente.
 *
 * Ref design: sdd/reparacion-bloqueada-por-compra/design, D5.
 */
import { DesvincularCompraDeReparacionUseCase } from './desvincular-compra-de-reparacion.use-case';
import { VinculoNoEncontradoError } from '../../domain/errors/reparaciones.errors';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import {
  AccionSobreTipoNoPermitidaError,
  TicketNoEncontradoError,
} from '../../../tickets/domain/errors/tickets.errors';
import {
  alcancePorTipo,
  alcanceSinRestriccion,
} from '../../../tickets/test-helpers/alcance-ticket';
import { IReparacionCompraRepository } from '../../domain/ports/i-reparacion-compra.repository';
import { CompraVinculada } from '../../domain/services/bloqueo-reparacion';

/** Compra vinculada completa; el caso de uso solo mira `compraId`. */
function vinculada(compraId: string, numero: string): CompraVinculada {
  return { compraId, numero, cancelada: false, items: [] };
}

describe('DesvincularCompraDeReparacionUseCase', () => {
  function buildDeps() {
    const reparacionCompraRepo = {
      findComprasVinculadasByTicketIds:
        vi.fn<IReparacionCompraRepository['findComprasVinculadasByTicketIds']>(),
      desvincular: vi.fn<IReparacionCompraRepository['desvincular']>().mockResolvedValue(undefined),
    };
    const ticketRepo = {
      findById: vi.fn<ITicketRepository['findById']>().mockResolvedValue(
        TicketEntity.create(
          {
            numero: 'SOP-2026-00001',
            titulo: 'Impresora sin tóner',
            descripcion: null,
            tipoId: 'tipo-soporte',
            estadoId: 'estado-nuevo',
            prioridadId: 'prioridad-media',
            cicloId: null,
            ticketReferenciaId: null,
            solicitanteId: 'solicitante-uuid',
          },
          'ticket-uuid',
        ),
      ),
      esVisiblePara: vi.fn<ITicketRepository['esVisiblePara']>().mockResolvedValue(false),
    };

    const useCase = new DesvincularCompraDeReparacionUseCase(reparacionCompraRepo, ticketRepo);

    return { useCase, reparacionCompraRepo, ticketRepo };
  }

  const baseDto = {
    ticketId: 'ticket-uuid',
    compraId: 'compra-uuid',
    alcance: alcanceSinRestriccion('actor-uuid'),
  };

  it('desvincula (hard delete) cuando el vínculo existe', async () => {
    const { useCase, reparacionCompraRepo } = buildDeps();
    reparacionCompraRepo.findComprasVinculadasByTicketIds.mockResolvedValue(
      new Map([['ticket-uuid', [vinculada('compra-uuid', 'COM-2026-00001')]]]),
    );

    const result = await useCase.execute(baseDto);

    expect(result.isOk()).toBe(true);
    expect(reparacionCompraRepo.findComprasVinculadasByTicketIds).toHaveBeenCalledWith([
      'ticket-uuid',
    ]);
    expect(reparacionCompraRepo.desvincular).toHaveBeenCalledWith('ticket-uuid', 'compra-uuid');
  });

  it('rechaza con 404 cuando el ticket no tiene compras vinculadas', async () => {
    const { useCase, reparacionCompraRepo } = buildDeps();
    reparacionCompraRepo.findComprasVinculadasByTicketIds.mockResolvedValue(new Map());

    const result = await useCase.execute(baseDto);

    expect(result.getError()).toBeInstanceOf(VinculoNoEncontradoError);
    expect(result.getError().message).toBe(
      'No existe un vínculo entre el ticket "ticket-uuid" y la compra "compra-uuid".',
    );
    expect(reparacionCompraRepo.desvincular).not.toHaveBeenCalled();
  });

  it('rechaza con 404 cuando el ticket tiene compras vinculadas pero no ésta', async () => {
    const { useCase, reparacionCompraRepo } = buildDeps();
    reparacionCompraRepo.findComprasVinculadasByTicketIds.mockResolvedValue(
      new Map([['ticket-uuid', [vinculada('otra-compra-uuid', 'COM-2026-00002')]]]),
    );

    const result = await useCase.execute(baseDto);

    expect(result.getError()).toBeInstanceOf(VinculoNoEncontradoError);
    expect(reparacionCompraRepo.desvincular).not.toHaveBeenCalled();
  });

  it('rechaza con 404 cuando el ticket no existe, sin leer vínculos', async () => {
    const { useCase, reparacionCompraRepo, ticketRepo } = buildDeps();
    ticketRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute(baseDto);

    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(reparacionCompraRepo.findComprasVinculadasByTicketIds).not.toHaveBeenCalled();
    expect(reparacionCompraRepo.desvincular).not.toHaveBeenCalled();
  });

  describe('permisos por tipo del ticket (odd/ticket-unificado, S4)', () => {
    it('no ve el ticket → 404, sin leer ni borrar vínculos', async () => {
      const { useCase, reparacionCompraRepo } = buildDeps();

      const result = await useCase.execute({
        ...baseDto,
        alcance: alcancePorTipo('actor-uuid', {
          'tipo-otro': ['LECTURA', 'VER_TODOS', 'MODIFICACION'],
        }),
      });

      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(reparacionCompraRepo.findComprasVinculadasByTicketIds).not.toHaveBeenCalled();
      expect(reparacionCompraRepo.desvincular).not.toHaveBeenCalled();
    });

    it('lo ve sin MODIFICACION sobre el tipo → 403, sin borrar', async () => {
      const { useCase, reparacionCompraRepo } = buildDeps();
      reparacionCompraRepo.findComprasVinculadasByTicketIds.mockResolvedValue(
        new Map([['ticket-uuid', [vinculada('compra-uuid', 'COM-2026-00001')]]]),
      );

      const result = await useCase.execute({
        ...baseDto,
        alcance: alcancePorTipo('actor-uuid', {
          'tipo-soporte': ['LECTURA', 'VER_TODOS', 'ALTAS', 'BORRADO'],
        }),
      });

      expect(result.getError()).toBeInstanceOf(AccionSobreTipoNoPermitidaError);
      expect(reparacionCompraRepo.desvincular).not.toHaveBeenCalled();
    });

    it('lo ve con MODIFICACION sobre el tipo → desvincula', async () => {
      const { useCase, reparacionCompraRepo } = buildDeps();
      reparacionCompraRepo.findComprasVinculadasByTicketIds.mockResolvedValue(
        new Map([['ticket-uuid', [vinculada('compra-uuid', 'COM-2026-00001')]]]),
      );

      const result = await useCase.execute({
        ...baseDto,
        alcance: alcancePorTipo('actor-uuid', {
          'tipo-soporte': ['LECTURA', 'VER_TODOS', 'MODIFICACION'],
        }),
      });

      expect(result.isOk()).toBe(true);
      expect(reparacionCompraRepo.desvincular).toHaveBeenCalledWith('ticket-uuid', 'compra-uuid');
    });
  });
});
