/**
 * T2.11 [RED] — Unit tests de ActivarCicloUseCase.
 *
 * Spec ref: clientes-tenancy/PATCH /ciclos/:id/activar
 * DOD: test en RED (use case no existe aún).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ActivarCicloUseCase } from './activar-ciclo.use-case';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';

// ─── Factory ─────────────────────────────────────────────────────────────────

function makeCiclo(overrides?: Partial<{ activo: boolean; nombre: string }>): CicloClienteEntity {
  return CicloClienteEntity.create({
    nombre: overrides?.nombre ?? 'Ciclo 2026',
    fechaInicio: new Date('2026-01-01'),
    fechaFin: new Date('2026-12-31'),
    activo: overrides?.activo ?? false,
  });
}

function makeMockRepo(): vi.Mocked<ICicloClienteRepository> {
  return {
    findAll: vi.fn(),
    findById: vi.fn(),
    save: vi.fn(),
    activarCiclo: vi.fn(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ActivarCicloUseCase', () => {
  let useCase: ActivarCicloUseCase;
  let repo: vi.Mocked<ICicloClienteRepository>;

  beforeEach(() => {
    repo = makeMockRepo();
    useCase = new ActivarCicloUseCase(repo);
  });

  it('activa el ciclo objetivo; el repositorio desactiva los demás en la misma transacción', async () => {
    const ciclo = makeCiclo({ activo: false });
    repo.findById.mockResolvedValue(ciclo);
    repo.activarCiclo.mockResolvedValue(true);

    await useCase.execute(ciclo.id);

    expect(repo.activarCiclo).toHaveBeenCalledWith(ciclo.id);
  });

  it('ciclo inexistente → NotFoundException', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(useCase.execute('uuid-que-no-existe')).rejects.toThrow(NotFoundException);
  });

  it('ciclo de otro tenant → NotFoundException (findById retorna null por TenantContext)', async () => {
    // TenantContext garantiza que solo se busca en el tenant activo.
    // Si el ciclo es de otro tenant, findById retorna null.
    repo.findById.mockResolvedValue(null);

    await expect(useCase.execute('ciclo-de-otro-tenant')).rejects.toThrow(NotFoundException);
  });

  it('operador via X-Tenant-Id puede activar en cualquier tenant (TenantGuard lo resuelve)', async () => {
    // El use case no necesita lógica especial para X-Tenant-Id:
    // TenantGuard ya resolvió el TenantContext al tenant objetivo.
    const ciclo = makeCiclo({ activo: false });
    repo.findById.mockResolvedValue(ciclo);
    repo.activarCiclo.mockResolvedValue(true);

    // No lanza excepción → operación permitida por TenantContext
    await expect(useCase.execute(ciclo.id)).resolves.not.toThrow();
    expect(repo.activarCiclo).toHaveBeenCalledOnce();
  });

  it('retorna el ciclo actualizado con activo=true', async () => {
    const ciclo = makeCiclo({ activo: false });
    repo.findById.mockResolvedValue(ciclo);
    repo.activarCiclo.mockResolvedValue(true);

    const resultado = await useCase.execute(ciclo.id);

    expect(resultado.id).toBe(ciclo.id);
    expect(resultado.activo).toBe(true);
  });
});
