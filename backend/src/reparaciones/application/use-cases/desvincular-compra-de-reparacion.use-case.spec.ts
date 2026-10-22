/**
 * WU5.3 [UNIT][RED] — `DesvincularCompraDeReparacionUseCase`.
 *
 * Desvinculación exitosa (hard delete real, D5), 404 con vínculo inexistente.
 *
 * Ref design: sdd/reparacion-bloqueada-por-compra/design, D5. Ref tasks:
 * WU5.3, WU5.4.
 */
import { DesvincularCompraDeReparacionUseCase } from './desvincular-compra-de-reparacion.use-case';
import {
  TicketEdiliciaNoEncontradoError,
  VinculoNoEncontradoError,
} from '../../domain/errors/reparaciones.errors';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
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
      findComprasVinculadasByTicketEdiliciaIds:
        vi.fn<IReparacionCompraRepository['findComprasVinculadasByTicketEdiliciaIds']>(),
      desvincular: vi.fn<IReparacionCompraRepository['desvincular']>().mockResolvedValue(undefined),
    };

    const ticketEdiliciaRepo = {
      findById: vi
        .fn<ITicketEdiliciaRepository['findById']>()
        .mockResolvedValue(
          TicketEdiliciaEntity.create(
            { ticketId: 'ticket-uuid', ubicacion: null },
            'edilicia-uuid',
          ),
        ),
    };
    const ticketRepo = {
      findById: vi.fn<ITicketRepository['findById']>().mockResolvedValue(
        TicketEntity.create(
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
        ),
      ),
      esVisiblePara: vi.fn<ITicketRepository['esVisiblePara']>().mockResolvedValue(false),
    };

    const useCase = new DesvincularCompraDeReparacionUseCase(
      reparacionCompraRepo,
      ticketEdiliciaRepo,
      ticketRepo,
    );

    return { useCase, reparacionCompraRepo, ticketEdiliciaRepo };
  }

  const baseDto = {
    ticketEdiliciaId: 'edilicia-uuid',
    compraId: 'compra-uuid',
    alcance: alcanceSinRestriccion('actor-uuid'),
  };

  it('desvincula (hard delete real) cuando el vínculo existe', async () => {
    const { useCase, reparacionCompraRepo } = buildDeps();
    reparacionCompraRepo.findComprasVinculadasByTicketEdiliciaIds.mockResolvedValue(
      new Map([['edilicia-uuid', [vinculada('compra-uuid', 'COM-2026-00001')]]]),
    );

    const result = await useCase.execute(baseDto);

    expect(result.isOk()).toBe(true);
    expect(reparacionCompraRepo.desvincular).toHaveBeenCalledWith('edilicia-uuid', 'compra-uuid');
  });

  it('rechaza con 404 cuando el vínculo no existe', async () => {
    const { useCase, reparacionCompraRepo } = buildDeps();
    reparacionCompraRepo.findComprasVinculadasByTicketEdiliciaIds.mockResolvedValue(new Map());

    const result = await useCase.execute(baseDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(VinculoNoEncontradoError);
    expect(reparacionCompraRepo.desvincular).not.toHaveBeenCalled();
  });

  it('rechaza con 404 cuando la reparación tiene otras compras vinculadas pero no esta', async () => {
    const { useCase, reparacionCompraRepo } = buildDeps();
    reparacionCompraRepo.findComprasVinculadasByTicketEdiliciaIds.mockResolvedValue(
      new Map([['edilicia-uuid', [vinculada('otra-compra-uuid', 'COM-2026-00002')]]]),
    );

    const result = await useCase.execute(baseDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(VinculoNoEncontradoError);
    expect(reparacionCompraRepo.desvincular).not.toHaveBeenCalled();
  });

  // El permiso de desvincular sigue siendo la celda EDILICIA:BORRADO de la ruta (L21); el caso de
  // uso solo exige ver el ticket base (odd/permisos-por-tipo-ticket, D5 b).
  it('no ve el ticket base (sin LECTURA sobre su tipo) → 404 de la reparación, sin desvincular', async () => {
    const { useCase, reparacionCompraRepo } = buildDeps();
    reparacionCompraRepo.findComprasVinculadasByTicketEdiliciaIds.mockResolvedValue(
      new Map([['edilicia-uuid', [vinculada('compra-uuid', 'COM-2026-00001')]]]),
    );

    const result = await useCase.execute({
      ...baseDto,
      alcance: alcancePorTipo('actor-uuid', { 'tipo-otro': ['LECTURA', 'VER_TODOS'] }),
    });

    expect(result.getError()).toBeInstanceOf(TicketEdiliciaNoEncontradoError);
    expect(reparacionCompraRepo.desvincular).not.toHaveBeenCalled();
  });

  it('lo ve (LECTURA y VER_TODOS sobre el tipo) → desvincula', async () => {
    const { useCase, reparacionCompraRepo } = buildDeps();
    reparacionCompraRepo.findComprasVinculadasByTicketEdiliciaIds.mockResolvedValue(
      new Map([['edilicia-uuid', [vinculada('compra-uuid', 'COM-2026-00001')]]]),
    );

    const result = await useCase.execute({
      ...baseDto,
      alcance: alcancePorTipo('actor-uuid', { 'tipo-edilicia': ['LECTURA', 'VER_TODOS'] }),
    });

    expect(result.isOk()).toBe(true);
    expect(reparacionCompraRepo.desvincular).toHaveBeenCalledWith('edilicia-uuid', 'compra-uuid');
  });

  it('reparación inexistente → 404 de la reparación', async () => {
    const { useCase, reparacionCompraRepo, ticketEdiliciaRepo } = buildDeps();
    ticketEdiliciaRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute(baseDto);

    expect(result.getError()).toBeInstanceOf(TicketEdiliciaNoEncontradoError);
    expect(reparacionCompraRepo.desvincular).not.toHaveBeenCalled();
  });
});
