/**
 * 1.B.3 TEST — SuspenderClienteUseCase + ReactivarClienteUseCase
 *             (RED → GREEN con 1.B.4)
 *
 * Cubre SuspenderClienteUseCase:
 * - Setea activo=false y deletedAt (soft delete) en la entidad
 * - NO dropea la DB tenant
 * - 404 si el cliente no existe
 * - Llama a repo.save con el cliente modificado
 *
 * Cubre ReactivarClienteUseCase:
 * - Setea activo=true y limpia deletedAt
 * - 404 si el cliente no existe
 */
import { SuspenderClienteUseCase } from './suspender-cliente.use-case';
import { ReactivarClienteUseCase } from './reactivar-cliente.use-case';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { ClienteNotFoundError } from '../../domain/errors/clientes.errors';

// ─── Mock del repositorio ──────────────────────────────────────────────────────

const makeMockRepo = (): jest.Mocked<IClienteRepository> => ({
  findById: jest.fn(),
  findByDbName: jest.fn(),
  findAll: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
});

const makeCliente = (activo = true) =>
  ClienteEntity.create({
    nombre: 'Acme',
    razonSocial: null,
    cuit: null,
    dbName: 'soporte_acme',
    activo,
  });

// ─────────────────────────────────────────────────────────────────────────────
// SuspenderClienteUseCase
// ─────────────────────────────────────────────────────────────────────────────

describe('SuspenderClienteUseCase', () => {
  let useCase: SuspenderClienteUseCase;
  let repo: jest.Mocked<IClienteRepository>;

  beforeEach(() => {
    repo = makeMockRepo();
    useCase = new SuspenderClienteUseCase(repo);
  });

  describe('Escenario: cliente encontrado — suspensión exitosa', () => {
    let cliente: ClienteEntity;

    beforeEach(() => {
      cliente = makeCliente(true);
      repo.findById.mockResolvedValue(cliente);
      repo.save.mockResolvedValue(undefined);
    });

    it('retorna Result.ok(undefined)', async () => {
      const result = await useCase.execute(cliente.id);
      expect(result.isOk()).toBe(true);
    });

    it('setea activo=false en el cliente', async () => {
      await useCase.execute(cliente.id);
      expect(cliente.activo).toBe(false);
    });

    it('setea deletedAt en el cliente (soft delete)', async () => {
      const before = new Date();
      await useCase.execute(cliente.id);
      const after = new Date();
      expect(cliente.deletedAt).not.toBeNull();
      expect(cliente.deletedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(cliente.deletedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('llama a repo.save con el cliente modificado', async () => {
      await useCase.execute(cliente.id);
      expect(repo.save).toHaveBeenCalledWith(cliente);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('NO llama a repo.delete (la DB tenant se conserva)', async () => {
      await useCase.execute(cliente.id);
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });

  describe('Escenario: cliente no encontrado → 404', () => {
    beforeEach(() => {
      repo.findById.mockResolvedValue(null);
    });

    it('retorna Result.fail con ClienteNotFoundError', async () => {
      const result = await useCase.execute('non-existent-id');
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ClienteNotFoundError);
    });

    it('NO llama a repo.save cuando el cliente no existe', async () => {
      await useCase.execute('non-existent-id');
      expect(repo.save).not.toHaveBeenCalled();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ReactivarClienteUseCase
// ─────────────────────────────────────────────────────────────────────────────

describe('ReactivarClienteUseCase', () => {
  let useCase: ReactivarClienteUseCase;
  let repo: jest.Mocked<IClienteRepository>;

  beforeEach(() => {
    repo = makeMockRepo();
    useCase = new ReactivarClienteUseCase(repo);
  });

  describe('Escenario: cliente suspendido — reactivación exitosa', () => {
    let cliente: ClienteEntity;

    beforeEach(() => {
      cliente = makeCliente(true);
      cliente.suspend(); // lo dejamos suspendido
      repo.findById.mockResolvedValue(cliente);
      repo.save.mockResolvedValue(undefined);
    });

    it('retorna Result.ok(undefined)', async () => {
      const result = await useCase.execute(cliente.id);
      expect(result.isOk()).toBe(true);
    });

    it('setea activo=true en el cliente', async () => {
      await useCase.execute(cliente.id);
      expect(cliente.activo).toBe(true);
    });

    it('limpia deletedAt (null después de reactivar)', async () => {
      await useCase.execute(cliente.id);
      expect(cliente.deletedAt).toBeNull();
      expect(cliente.isDeleted()).toBe(false);
    });

    it('llama a repo.save con el cliente reactivado', async () => {
      await useCase.execute(cliente.id);
      expect(repo.save).toHaveBeenCalledWith(cliente);
    });
  });

  describe('Escenario: cliente no encontrado → 404', () => {
    beforeEach(() => {
      repo.findById.mockResolvedValue(null);
    });

    it('retorna Result.fail con ClienteNotFoundError', async () => {
      const result = await useCase.execute('unknown-id');
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ClienteNotFoundError);
    });

    it('NO llama a repo.save cuando el cliente no existe', async () => {
      await useCase.execute('unknown-id');
      expect(repo.save).not.toHaveBeenCalled();
    });
  });
});
