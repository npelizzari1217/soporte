/**
 * configurar-formulario-publico.use-case.spec.ts — slug y habilitacion del
 * formulario publico (sdd/formulario-publico-qr, WU-2; D7 y D12).
 */
import { describe, expect, it, vi } from 'vitest';
import { ConfigurarFormularioPublicoUseCase } from './configurar-formulario-publico.use-case';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import {
  ClienteNoEncontradoError,
  OnlyRootCanConfigurarFormularioError,
  SlugCongeladoError,
  SlugDuplicadoError,
  SlugInvalidoError,
  SlugRequeridoError,
} from '../../domain/errors/clientes.errors';

const ROOT = { isGlobalAdmin: true };

function buildRepoMock(overrides: Partial<IClienteRepository> = {}): IClienteRepository {
  return {
    findById: vi.fn(),
    findByDbName: vi.fn(),
    findBySlug: vi.fn(),
    congelarSlug: vi.fn(),
    cambiarSlugSiNoCongelado: vi.fn().mockResolvedValue('CAMBIADO'),
    findAll: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

function buildCliente(props: { slug?: string | null; congelado?: boolean } = {}): ClienteEntity {
  return ClienteEntity.create({
    nombre: 'ACME S.A.',
    razonSocial: null,
    cuit: null,
    dbName: 'soporte_deadbeef',
    activo: true,
    slug: props.slug ?? null,
    slugCongeladoAt: props.congelado ? new Date() : null,
  });
}

function setup(cliente: ClienteEntity | null, overrides: Partial<IClienteRepository> = {}) {
  const repo = buildRepoMock({ findById: vi.fn().mockResolvedValue(cliente), ...overrides });
  return { repo, useCase: new ConfigurarFormularioPublicoUseCase(repo) };
}

describe('ConfigurarFormularioPublicoUseCase', () => {
  it('rechaza a un actor que no es ROOT sin tocar el repositorio', async () => {
    const { repo, useCase } = setup(buildCliente());

    const result = await useCase.execute(
      { clienteId: 'x', slug: 'colegio' },
      { isGlobalAdmin: false },
    );

    expect(result.getError()).toBeInstanceOf(OnlyRootCanConfigurarFormularioError);
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('un cliente inexistente es ClienteNoEncontrado y no llega al CAS', async () => {
    const { repo, useCase } = setup(null);

    const result = await useCase.execute({ clienteId: 'x', slug: 'colegio' }, ROOT);

    expect(result.getError()).toBeInstanceOf(ClienteNoEncontradoError);
    expect(repo.cambiarSlugSiNoCongelado).not.toHaveBeenCalled();
  });

  it('carga el slug por el CAS y no persiste con save', async () => {
    const cliente = buildCliente();
    const { repo, useCase } = setup(cliente);

    const result = await useCase.execute({ clienteId: cliente.id, slug: 'colegio-norte' }, ROOT);

    expect(result.isOk()).toBe(true);
    expect(result.getValue().slug).toBe('colegio-norte');
    expect(repo.cambiarSlugSiNoCongelado).toHaveBeenCalledWith(cliente.id, 'colegio-norte');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('slug con formato invalido: SlugInvalido y no escribe nada', async () => {
    const { repo, useCase } = setup(buildCliente());

    const result = await useCase.execute({ clienteId: 'x', slug: 'Colegio Norte' }, ROOT);

    expect(result.getError()).toBeInstanceOf(SlugInvalidoError);
    expect(repo.cambiarSlugSiNoCongelado).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('slug congelado no cambia (rechazo en la entidad, sin CAS)', async () => {
    const { repo, useCase } = setup(buildCliente({ slug: 'colegio-norte', congelado: true }));

    const result = await useCase.execute({ clienteId: 'x', slug: 'otro' }, ROOT);

    expect(result.getError()).toBeInstanceOf(SlugCongeladoError);
    expect(repo.cambiarSlugSiNoCongelado).not.toHaveBeenCalled();
  });

  it('el CAS devuelve CONGELADO (carrera con un QR): SlugCongelado', async () => {
    const { repo, useCase } = setup(buildCliente({ slug: 'a' }), {
      cambiarSlugSiNoCongelado: vi.fn().mockResolvedValue('CONGELADO'),
    });

    const result = await useCase.execute({ clienteId: 'x', slug: 'b', habilitado: true }, ROOT);

    expect(result.getError()).toBeInstanceOf(SlugCongeladoError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('el CAS devuelve DUPLICADO: SlugDuplicado', async () => {
    const { useCase } = setup(buildCliente(), {
      cambiarSlugSiNoCongelado: vi.fn().mockResolvedValue('DUPLICADO'),
    });

    const result = await useCase.execute({ clienteId: 'x', slug: 'colegio' }, ROOT);

    expect(result.getError()).toBeInstanceOf(SlugDuplicadoError);
  });

  it('sin slug no habilita y no escribe nada', async () => {
    const { repo, useCase } = setup(buildCliente());

    const result = await useCase.execute({ clienteId: 'x', habilitado: true }, ROOT);

    expect(result.getError()).toBeInstanceOf(SlugRequeridoError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('slug y habilitacion en el mismo pedido: CAS primero y save despues', async () => {
    const cliente = buildCliente();
    const { repo, useCase } = setup(cliente);

    const result = await useCase.execute(
      { clienteId: cliente.id, slug: 'colegio-norte', habilitado: true },
      ROOT,
    );

    expect(result.getValue().formularioPublicoHabilitado).toBe(true);
    expect(repo.save).toHaveBeenCalledWith(cliente);
    const cas = vi.mocked(repo.cambiarSlugSiNoCongelado).mock.invocationCallOrder[0];
    const save = vi.mocked(repo.save).mock.invocationCallOrder[0];
    expect(cas).toBeLessThan(save);
  });

  it('el mismo slug que ya tiene no es un cambio: no toca el CAS aunque este congelado', async () => {
    const cliente = buildCliente({ slug: 'colegio-norte', congelado: true });
    const { repo, useCase } = setup(cliente);

    const result = await useCase.execute(
      { clienteId: cliente.id, slug: 'colegio-norte', habilitado: true },
      ROOT,
    );

    expect(result.isOk()).toBe(true);
    expect(repo.cambiarSlugSiNoCongelado).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledWith(cliente);
  });

  it('deshabilitar siempre se permite, incluso sin slug', async () => {
    const cliente = buildCliente();
    const { repo, useCase } = setup(cliente);

    const result = await useCase.execute({ clienteId: cliente.id, habilitado: false }, ROOT);

    expect(result.isOk()).toBe(true);
    expect(repo.save).toHaveBeenCalledWith(cliente);
  });
});
