/**
 * configurar-zona-horaria-cliente.use-case.spec.ts — cambiar la zona
 * operativa de un cliente (sdd/zona-horaria-por-tenant, C2b). Espeja
 * `configurar-csat-cliente.use-case.spec.ts` — solo ROOT (gateado por
 * `GlobalAdminGuard` en `ClientesController`, mismo criterio que
 * `ConfigurarCsatClienteUseCase`: la revalidación de actor no vive acá,
 * la hace el guard antes de que la request llegue al caso de uso).
 */
import { describe, expect, it, vi } from 'vitest';
import { ConfigurarZonaHorariaClienteUseCase } from './configurar-zona-horaria-cliente.use-case';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { ZonaHoraria } from '../../../shared/domain/zona-horaria';
import { ClienteNoEncontradoError } from '../../domain/errors/clientes.errors';

function buildRepoMock(overrides: Partial<IClienteRepository> = {}): IClienteRepository {
  return {
    findById: vi.fn(),
    findByDbName: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

function buildCliente(zonaHoraria = 'America/Argentina/Buenos_Aires'): ClienteEntity {
  return ClienteEntity.create({
    nombre: 'ACME S.A.',
    razonSocial: null,
    cuit: null,
    dbName: 'soporte_deadbeef',
    activo: true,
    zonaHoraria: ZonaHoraria.crear(zonaHoraria),
  });
}

describe('ConfigurarZonaHorariaClienteUseCase', () => {
  it('retorna Result.fail(ClienteNoEncontradoError) cuando el cliente no existe', async () => {
    const repo = buildRepoMock({ findById: vi.fn().mockResolvedValue(null) });
    const useCase = new ConfigurarZonaHorariaClienteUseCase(repo);

    const result = await useCase.execute({
      clienteId: 'id-inexistente',
      zonaHoraria: 'America/New_York',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ClienteNoEncontradoError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('cambia la zona del cliente y persiste', async () => {
    const cliente = buildCliente('America/Argentina/Buenos_Aires');
    const save = vi.fn().mockResolvedValue(undefined);
    const repo = buildRepoMock({ findById: vi.fn().mockResolvedValue(cliente), save });
    const useCase = new ConfigurarZonaHorariaClienteUseCase(repo);

    const result = await useCase.execute({
      clienteId: cliente.id,
      zonaHoraria: 'America/New_York',
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().zonaHoraria.valor).toBe('America/New_York');
    expect(save).toHaveBeenCalledWith(cliente);
  });

  it(
    '[CRITICAL] un candidato que no es una zona horaria válida lanza vía `ZonaHoraria.crear()` ' +
      'y NO persiste ni muta al cliente — el borde real (ConfigurarZonaHorariaClienteDto, ' +
      '@IsZonaHorariaValida()) ya lo rechaza con 400 antes de llegar acá (ver ' +
      'configurar-zona-horaria-cliente.e2e.spec.ts para el HTTP real); esto documenta que el ' +
      'caso de uso invocado DIRECTO con un candidato inválido no persiste nada silenciosamente',
    async () => {
      const cliente = buildCliente('America/Argentina/Buenos_Aires');
      const save = vi.fn().mockResolvedValue(undefined);
      const repo = buildRepoMock({ findById: vi.fn().mockResolvedValue(cliente), save });
      const useCase = new ConfigurarZonaHorariaClienteUseCase(repo);

      await expect(
        useCase.execute({ clienteId: cliente.id, zonaHoraria: 'Europe/Madriz' }),
      ).rejects.toThrow(/no es una zona horaria válida/);

      expect(save).not.toHaveBeenCalled();
      expect(cliente.zonaHoraria.valor).toBe('America/Argentina/Buenos_Aires');
    },
  );
});
