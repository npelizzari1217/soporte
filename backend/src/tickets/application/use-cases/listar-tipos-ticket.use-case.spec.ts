import { describe, it, expect, vi } from 'vitest';
import { ListarTiposTicketUseCase } from './listar-tipos-ticket.use-case';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';

describe('ListarTiposTicketUseCase', () => {
  it('retorna los tipos de ticket activos del catálogo (G1, sdd/beta-frontend)', async () => {
    const tipo = TipoTicketEntity.reconstitute(
      { codigo: 'SOPORTE', nombre: 'Soporte', activo: true },
      'tipo-1',
      new Date(),
      new Date(),
      null,
    );
    const tipoTicketRepo = { findAllActive: vi.fn().mockResolvedValue([tipo]) };
    const useCase = new ListarTiposTicketUseCase(tipoTicketRepo as never);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([tipo]);
    expect(tipoTicketRepo.findAllActive).toHaveBeenCalledOnce();
  });

  it('retorna [] cuando el catálogo no tiene tipos activos', async () => {
    const tipoTicketRepo = { findAllActive: vi.fn().mockResolvedValue([]) };
    const useCase = new ListarTiposTicketUseCase(tipoTicketRepo as never);

    const result = await useCase.execute();

    expect(result.getValue()).toEqual([]);
  });
});
