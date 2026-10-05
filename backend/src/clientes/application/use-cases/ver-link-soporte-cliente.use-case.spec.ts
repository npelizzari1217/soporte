/**
 * ver-link-soporte-cliente.use-case.spec.ts — link genérico de soporte del cliente de la sesión.
 */
import { describe, expect, it, vi } from 'vitest';
import { VerLinkSoporteClienteUseCase } from './ver-link-soporte-cliente.use-case';
import { ClienteEntity } from '../../domain/entities/cliente.entity';

function buildCliente(
  props: { slug?: string | null; habilitado?: boolean; activo?: boolean } = {},
): ClienteEntity {
  return ClienteEntity.create({
    nombre: 'ACME S.A.',
    razonSocial: null,
    cuit: null,
    dbName: 'soporte_deadbeef',
    activo: props.activo ?? true,
    slug: props.slug === undefined ? 'acme' : props.slug,
    formularioPublicoHabilitado: props.habilitado ?? true,
  });
}

function setup(cliente: ClienteEntity | null, base = 'https://soporte.example.com') {
  const findById = vi.fn().mockResolvedValue(cliente);
  return { findById, useCase: new VerLinkSoporteClienteUseCase({ findById }, base) };
}

describe('VerLinkSoporteClienteUseCase', () => {
  it('arma el link genérico cuando el cliente está activo, habilitado y con slug', async () => {
    const { findById, useCase } = setup(buildCliente());

    expect(await useCase.execute('c-1')).toEqual({
      url: 'https://soporte.example.com/c/acme/pedido',
    });
    expect(findById).toHaveBeenCalledWith('c-1');
  });

  it('devuelve null si el formulario está deshabilitado', async () => {
    const { useCase } = setup(buildCliente({ habilitado: false }));
    expect(await useCase.execute('c-1')).toEqual({ url: null });
  });

  it('devuelve null si el cliente no tiene slug', async () => {
    const { useCase } = setup(buildCliente({ slug: null }));
    expect(await useCase.execute('c-1')).toEqual({ url: null });
  });

  it('devuelve null si el cliente está inactivo', async () => {
    const { useCase } = setup(buildCliente({ activo: false }));
    expect(await useCase.execute('c-1')).toEqual({ url: null });
  });

  it('devuelve null si el cliente no existe', async () => {
    const { useCase } = setup(null);
    expect(await useCase.execute('c-1')).toEqual({ url: null });
  });

  it('no duplica la barra si APP_BASE_URL termina en "/"', async () => {
    const { useCase } = setup(buildCliente(), 'https://soporte.example.com//');
    expect(await useCase.execute('c-1')).toEqual({
      url: 'https://soporte.example.com/c/acme/pedido',
    });
  });
});
