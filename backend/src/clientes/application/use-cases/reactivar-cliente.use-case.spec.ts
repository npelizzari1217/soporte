/**
 * reactivar-cliente.use-case.spec.ts — revierte la baja lógica (ROOT).
 * Inexistente → 404 ClienteNoEncontrado; feliz → reactivate() (activo=true +
 * limpia deletedAt) y persiste.
 *
 * Fix post-verify C3 (sdd/matriz-permisos-por-usuario, S19): un tenant que
 * estaba INACTIVO durante el deploy de la migración de módulos
 * (`20260817120000_rename_modulo_soporte_a_tickets`, prisma_tenant/) queda
 * con `tipos_ticket.modulo='SOPORTE'` — `migrate-tenants.js` solo fan-outea
 * a tenants `activo=true`. Si se reactiva DESPUÉS sin correr sus migraciones
 * pendientes, el filtrado por módulo devuelve 0 resultados EN SILENCIO (ni
 * error ni log). `ReactivarClienteUseCase` ahora corre
 * `ITenantMigrationRunner.run(dbName)` (mismo puerto que usa el alta de
 * cliente, PR7) ANTES de persistir el flip a `activo=true` — `prisma migrate
 * deploy` es idempotente, así que reactivar un tenant que YA estaba al día
 * no hace nada de más.
 */
import { describe, expect, it, vi } from 'vitest';
import { ReactivarClienteUseCase } from './reactivar-cliente.use-case';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { ITenantMigrationRunner } from '../../domain/ports/i-tenant-migration-runner.port';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
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

function buildMigrationRunnerMock(
  overrides: Partial<ITenantMigrationRunner> = {},
): ITenantMigrationRunner {
  return {
    run: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('ReactivarClienteUseCase', () => {
  it('retorna Result.fail(ClienteNoEncontradoError) cuando el cliente no existe', async () => {
    const repo = buildRepoMock({ findById: vi.fn().mockResolvedValue(null) });
    const migrationRunner = buildMigrationRunnerMock();
    const useCase = new ReactivarClienteUseCase(repo, migrationRunner);

    const result = await useCase.execute('id-inexistente');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ClienteNoEncontradoError);
    expect(repo.save).not.toHaveBeenCalled();
    expect(migrationRunner.run).not.toHaveBeenCalled();
  });

  it('reactiva el cliente suspendido (activo=true + limpia deletedAt) y lo persiste', async () => {
    const cliente = ClienteEntity.create({
      nombre: 'ACME S.A.',
      razonSocial: null,
      cuit: null,
      dbName: 'soporte_deadbeef',
      activo: false,
    });
    cliente.suspend();
    const save = vi.fn().mockResolvedValue(undefined);
    const repo = buildRepoMock({ findById: vi.fn().mockResolvedValue(cliente), save });
    const migrationRunner = buildMigrationRunnerMock();
    const useCase = new ReactivarClienteUseCase(repo, migrationRunner);

    const result = await useCase.execute(cliente.id);

    expect(result.isOk()).toBe(true);
    expect(result.getValue().activo).toBe(true);
    expect(result.getValue().isDeleted()).toBe(false);
    expect(save).toHaveBeenCalledWith(cliente);
  });

  it('[CRITICAL] corre las migraciones del tenant ANTES de persistir (S19 — cierra el hueco silencioso de un tenant reactivado con migraciones pendientes)', async () => {
    const cliente = ClienteEntity.create({
      nombre: 'ACME S.A.',
      razonSocial: null,
      cuit: null,
      dbName: 'soporte_deadbeef',
      activo: false,
    });
    cliente.suspend();
    const llamadas: string[] = [];
    const repo = buildRepoMock({
      findById: vi.fn().mockResolvedValue(cliente),
      save: vi.fn().mockImplementation(() => {
        llamadas.push('save');
        return Promise.resolve();
      }),
    });
    const migrationRunner = buildMigrationRunnerMock({
      run: vi.fn().mockImplementation(() => {
        llamadas.push('run');
        return Promise.resolve();
      }),
    });
    const useCase = new ReactivarClienteUseCase(repo, migrationRunner);

    await useCase.execute(cliente.id);

    expect(migrationRunner.run).toHaveBeenCalledWith('soporte_deadbeef');
    expect(llamadas).toEqual(['run', 'save']);
  });

  it('[CRITICAL] si las migraciones fallan, NO persiste el flip a activo=true (fail-closed: mejor error visible que 0-resultados silencioso)', async () => {
    const cliente = ClienteEntity.create({
      nombre: 'ACME S.A.',
      razonSocial: null,
      cuit: null,
      dbName: 'soporte_deadbeef',
      activo: false,
    });
    cliente.suspend();
    const save = vi.fn().mockResolvedValue(undefined);
    const repo = buildRepoMock({ findById: vi.fn().mockResolvedValue(cliente), save });
    const migrationRunner = buildMigrationRunnerMock({
      run: vi.fn().mockRejectedValue(new Error('prisma migrate deploy falló')),
    });
    const useCase = new ReactivarClienteUseCase(repo, migrationRunner);

    await expect(useCase.execute(cliente.id)).rejects.toThrow('prisma migrate deploy falló');
    expect(save).not.toHaveBeenCalled();
  });
});
