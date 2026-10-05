/**
 * emitir-qr-equipo.use-case.spec.ts — QR del equipo (sdd/formulario-publico-qr, WU-4; D8, ADR-2).
 */
import { describe, expect, it, vi } from 'vitest';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { ClienteNoEncontradoError } from '../../../clientes/domain/errors/clientes.errors';
import {
  EquipoDadoDeBajaError,
  EquipoNoEncontradoError,
  QrRequiereSlugError,
  QrSlugCambiadoError,
} from '../../domain/errors/equipos.errors';
import { equipoDadoDeBaja, equipoVigente } from '../../testing/equipos-unit.fixtures';
import { EmitirQrEquipoUseCase, hashTokenQr } from './emitir-qr-equipo.use-case';

const BASE = 'https://soporte.sesitec.net';

function cliente(slug: string | null): ClienteEntity {
  return ClienteEntity.create({
    nombre: 'ACME S.A.',
    razonSocial: null,
    cuit: null,
    dbName: 'soporte_deadbeef',
    activo: true,
    slug,
  });
}

function setup(
  over: {
    equipo?: ReturnType<typeof equipoVigente> | null;
    cliente?: ClienteEntity | null;
    congelar?: boolean;
    guardar?: boolean;
    base?: string;
  } = {},
) {
  const equipo = over.equipo === undefined ? equipoVigente() : over.equipo;
  const llamadas: string[] = [];
  const equipoRepo = {
    findById: vi.fn().mockResolvedValue(equipo),
    guardarQr: vi.fn().mockImplementation(async () => {
      llamadas.push('guardarQr');
      return over.guardar ?? true;
    }),
  };
  const clienteRepo = {
    findById: vi
      .fn()
      .mockResolvedValue(over.cliente === undefined ? cliente('acme') : over.cliente),
    congelarSlug: vi.fn().mockImplementation(async () => {
      llamadas.push('congelarSlug');
      return over.congelar ?? true;
    }),
  };
  const useCase = new EmitirQrEquipoUseCase(equipoRepo, clienteRepo, over.base ?? BASE);
  return { useCase, equipoRepo, clienteRepo, equipo, llamadas };
}

const CMD = { equipoId: 'e1', clienteId: 'c1' };

describe('EmitirQrEquipoUseCase', () => {
  it('emite la URL con un token opaco de 128 bits y guarda el token en claro con su hash', async () => {
    const { useCase, equipoRepo } = setup();

    const r = await useCase.execute(CMD);

    const { url, emitidoAt } = r.getValue();
    const token = new URL(url).searchParams.get('e') ?? '';
    expect(url.startsWith(`${BASE}/c/acme/pedido?e=`)).toBe(true);
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(16);
    // Token y hash viajan juntos en UNA llamada (atómica en el repo); el hash sigue siendo la clave.
    expect(equipoRepo.guardarQr).toHaveBeenCalledTimes(1);
    expect(equipoRepo.guardarQr).toHaveBeenCalledWith(
      expect.any(String),
      token,
      hashTokenQr(token),
      emitidoAt,
    );
    expect(equipoRepo.guardarQr.mock.calls[0][2]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('el token no se deriva del id del equipo', async () => {
    const { useCase, equipo } = setup();
    const r = await useCase.execute(CMD);
    const token = new URL(r.getValue().url).searchParams.get('e') ?? '';
    expect(token).not.toContain(equipo!.id);
    expect(token).not.toBe(hashTokenQr(equipo!.id));
  });

  it('regenerar emite otro token y otro hash: el par anterior queda reemplazado', async () => {
    const { useCase, equipoRepo } = setup();

    const a = (await useCase.execute(CMD)).getValue().url;
    const b = (await useCase.execute(CMD)).getValue().url;

    expect(a).not.toBe(b);
    const [primera, segunda] = equipoRepo.guardarQr.mock.calls;
    expect(segunda[1]).not.toBe(primera[1]);
    expect(segunda[2]).not.toBe(primera[2]);
    expect(segunda[2]).toBe(hashTokenQr(segunda[1] as string));
  });

  it('congela el slug ANTES de escribir el hash, con el slug leído', async () => {
    const { useCase, clienteRepo, llamadas } = setup();

    await useCase.execute(CMD);

    expect(llamadas).toEqual(['congelarSlug', 'guardarQr']);
    expect(clienteRepo.congelarSlug).toHaveBeenCalledWith(expect.any(String), 'acme');
  });

  it('un cliente sin slug falla sin congelar ni escribir', async () => {
    const { useCase, clienteRepo, equipoRepo } = setup({ cliente: cliente(null) });

    const r = await useCase.execute(CMD);

    expect(r.getError()).toBeInstanceOf(QrRequiereSlugError);
    expect(clienteRepo.congelarSlug).not.toHaveBeenCalled();
    expect(equipoRepo.guardarQr).not.toHaveBeenCalled();
  });

  it('si el slug cambió (CAS en 0 filas) no escribe el hash', async () => {
    const { useCase, equipoRepo } = setup({ congelar: false });

    const r = await useCase.execute(CMD);

    expect(r.getError()).toBeInstanceOf(QrSlugCambiadoError);
    expect(equipoRepo.guardarQr).not.toHaveBeenCalled();
  });

  it('un equipo inexistente o borrado es 404 y no congela el slug', async () => {
    const borrado = equipoVigente();
    borrado.softDelete();
    for (const equipo of [null, borrado]) {
      const { useCase, clienteRepo } = setup({ equipo });
      const r = await useCase.execute(CMD);
      expect(r.getError()).toBeInstanceOf(EquipoNoEncontradoError);
      expect(clienteRepo.congelarSlug).not.toHaveBeenCalled();
    }
  });

  it('un equipo dado de baja se rechaza sin congelar', async () => {
    const { useCase, clienteRepo } = setup({ equipo: equipoDadoDeBaja() });

    const r = await useCase.execute(CMD);

    expect(r.getError()).toBeInstanceOf(EquipoDadoDeBajaError);
    expect(clienteRepo.congelarSlug).not.toHaveBeenCalled();
  });

  it('si el equipo se da de baja antes del CAS del hash, falla', async () => {
    const { useCase } = setup({ guardar: false });
    expect((await useCase.execute(CMD)).getError()).toBeInstanceOf(EquipoDadoDeBajaError);
  });

  it('un cliente inexistente falla', async () => {
    const { useCase } = setup({ cliente: null });
    expect((await useCase.execute(CMD)).getError()).toBeInstanceOf(ClienteNoEncontradoError);
  });

  it('la URL se arma desde la base configurada, sin barra doble', async () => {
    const { useCase } = setup({ base: `${BASE}/` });
    const { url } = (await useCase.execute(CMD)).getValue();
    expect(url.startsWith(`${BASE}/c/acme/pedido?e=`)).toBe(true);
  });
});
