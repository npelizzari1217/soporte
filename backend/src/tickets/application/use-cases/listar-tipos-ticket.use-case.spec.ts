import { describe, it, expect, vi } from 'vitest';
import { ListarTiposTicketUseCase } from './listar-tipos-ticket.use-case';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import { unstubbed } from '../../../testing/mocks';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';

describe('ListarTiposTicketUseCase', () => {
  it('retorna los tipos de ticket activos del catálogo (G1, sdd/beta-frontend)', async () => {
    const tipo = TipoTicketEntity.reconstitute(
      { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'TICKETS', activo: true },
      'tipo-1',
      new Date(),
      new Date(),
      null,
    );
    const tipoTicketRepo = {
      findAllActive: vi.fn<ITipoTicketRepository['findAllActive']>().mockResolvedValue([tipo]),
      findAllActiveByModulo: unstubbed('findAllActiveByModulo'),
    };
    const useCase = new ListarTiposTicketUseCase(tipoTicketRepo);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([tipo]);
    expect(tipoTicketRepo.findAllActive).toHaveBeenCalledOnce();
  });

  it('retorna [] cuando el catálogo no tiene tipos activos', async () => {
    const tipoTicketRepo = {
      findAllActive: vi.fn<ITipoTicketRepository['findAllActive']>().mockResolvedValue([]),
      findAllActiveByModulo: unstubbed('findAllActiveByModulo'),
    };
    const useCase = new ListarTiposTicketUseCase(tipoTicketRepo);

    const result = await useCase.execute();

    expect(result.getValue()).toEqual([]);
  });
});
