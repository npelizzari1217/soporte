/**
 * resolver-qr-autenticado.use-case.spec.ts — `GET /soporte/qr` (sdd/formulario-publico-qr, WU-17).
 */
import { describe, expect, it, vi } from 'vitest';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { QrDeOtraOrganizacionError } from '../../domain/errors/equipos.errors';
import { equipoDadoDeBaja, equipoVigente } from '../../testing/equipos-unit.fixtures';
import { hashTokenQr } from './emitir-qr-equipo.use-case';
import { ResolverQrAutenticadoUseCase } from './resolver-qr-autenticado.use-case';

function cliente(over: { slug?: string | null; activo?: boolean } = {}): ClienteEntity {
  return ClienteEntity.create({
    nombre: 'ACME S.A.',
    razonSocial: null,
    cuit: null,
    dbName: 'soporte_deadbeef',
    activo: over.activo ?? true,
    slug: over.slug === undefined ? 'acme' : over.slug,
  });
}

function setup(
  over: { cliente?: ClienteEntity | null; equipo?: ReturnType<typeof equipoVigente> | null } = {},
) {
  const clienteRepo = {
    findById: vi.fn().mockResolvedValue(over.cliente === undefined ? cliente() : over.cliente),
  };
  const equipoRepo = {
    findByQrHash: vi
      .fn()
      .mockResolvedValue(over.equipo === undefined ? equipoVigente() : over.equipo),
  };
  return {
    useCase: new ResolverQrAutenticadoUseCase(clienteRepo, equipoRepo),
    clienteRepo,
    equipoRepo,
  };
}

const TOKEN = 'tokenDeVeintidosChars_';

describe('ResolverQrAutenticadoUseCase', () => {
  it('slug de la sesión y token vigente: devuelve el equipo del tenant', async () => {
    const { useCase, equipoRepo, clienteRepo } = setup();
    const r = await useCase.execute({ clienteId: 'c1', slug: 'acme', token: TOKEN });

    expect(r.isOk()).toBe(true);
    expect(r.getValue().equipo).toEqual({ id: expect.any(String), nombre: expect.any(String) });
    expect(clienteRepo.findById).toHaveBeenCalledWith('c1');
    expect(equipoRepo.findByQrHash).toHaveBeenCalledWith(hashTokenQr(TOKEN));
  });

  it('un slug distinto al del cliente de la sesión da 404 y no busca el token', async () => {
    const { useCase, equipoRepo } = setup();
    const r = await useCase.execute({ clienteId: 'c1', slug: 'otro', token: TOKEN });

    expect(r.isFail()).toBe(true);
    expect(r.getError()).toBeInstanceOf(QrDeOtraOrganizacionError);
    expect(equipoRepo.findByQrHash).not.toHaveBeenCalled();
  });

  it.each([
    ['slug no es string', { slug: undefined }, {}],
    ['cliente inexistente', {}, { cliente: null }],
    ['cliente inactivo', {}, { cliente: cliente({ activo: false }) }],
    ['cliente sin slug', {}, { cliente: cliente({ slug: null }) }],
  ])('%s: mismo 404', async (_n, cmd, over) => {
    const { useCase, equipoRepo } = setup(over);
    const r = await useCase.execute({ clienteId: 'c1', slug: 'acme', token: TOKEN, ...cmd });

    expect(r.isFail()).toBe(true);
    expect(equipoRepo.findByQrHash).not.toHaveBeenCalled();
  });

  it.each([
    ['token inexistente', { equipo: null }, TOKEN],
    ['equipo dado de baja', { equipo: equipoDadoDeBaja() }, TOKEN],
    ['token ausente', {}, undefined],
    ['token vacío', {}, ''],
    ['token demasiado largo', {}, 'x'.repeat(129)],
  ])('%s: equipo null', async (_n, over, token) => {
    const { useCase } = setup(over);
    const r = await useCase.execute({ clienteId: 'c1', slug: 'acme', token });

    expect(r.isOk()).toBe(true);
    expect(r.getValue().equipo).toBeNull();
  });
});
