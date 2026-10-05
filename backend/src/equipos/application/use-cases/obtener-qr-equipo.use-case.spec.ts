/**
 * obtener-qr-equipo.use-case.spec.ts — QR vigente del equipo (issue #356).
 */
import { describe, expect, it, vi } from 'vitest';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { ClienteNoEncontradoError } from '../../../clientes/domain/errors/clientes.errors';
import type { QrEquipoGuardado } from '../../domain/ports/i-equipo-informatico.repository';
import {
  EquipoDadoDeBajaError,
  EquipoNoEncontradoError,
  QrRequiereSlugError,
} from '../../domain/errors/equipos.errors';
import { ObtenerQrEquipoUseCase } from './obtener-qr-equipo.use-case';

const BASE = 'https://soporte.sesitec.net';
const EMITIDO = new Date('2026-10-05T12:00:00Z');

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

function qr(over: Partial<QrEquipoGuardado> = {}): QrEquipoGuardado {
  return {
    activo: true,
    qrToken: 'tok-abc',
    qrTokenHash: 'a'.repeat(64),
    qrEmitidoAt: EMITIDO,
    ...over,
  };
}

function setup(
  over: { qr?: QrEquipoGuardado | null; cliente?: ClienteEntity | null; base?: string } = {},
) {
  const equipoRepo = {
    findQrById: vi.fn().mockResolvedValue(over.qr === undefined ? qr() : over.qr),
  };
  const clienteRepo = {
    findById: vi
      .fn()
      .mockResolvedValue(over.cliente === undefined ? cliente('acme') : over.cliente),
  };
  const useCase = new ObtenerQrEquipoUseCase(equipoRepo, clienteRepo, over.base ?? BASE);
  return { useCase, equipoRepo, clienteRepo };
}

const CMD = { equipoId: 'e1', clienteId: 'c1' };

describe('ObtenerQrEquipoUseCase', () => {
  it('con token guardado devuelve el QR vigente con la URL pública y la fecha', async () => {
    const { useCase, equipoRepo, clienteRepo } = setup();

    const r = await useCase.execute(CMD);

    expect(r.getValue()).toEqual({
      estado: 'VIGENTE',
      url: `${BASE}/c/acme/pedido?e=tok-abc`,
      emitidoAt: EMITIDO,
    });
    expect(equipoRepo.findQrById).toHaveBeenCalledWith('e1');
    expect(clienteRepo.findById).toHaveBeenCalledWith('c1');
  });

  it('la URL se arma desde la base configurada, sin barra doble', async () => {
    const { useCase } = setup({ base: `${BASE}/` });
    const v = (await useCase.execute(CMD)).getValue();
    expect(v.estado === 'VIGENTE' && v.url.startsWith(`${BASE}/c/acme/pedido?e=`)).toBe(true);
  });

  it('un QR anterior al cambio (hash sin token) pide regenerar y no consulta al cliente', async () => {
    const { useCase, clienteRepo } = setup({ qr: qr({ qrToken: null }) });

    expect((await useCase.execute(CMD)).getValue()).toEqual({ estado: 'REQUIERE_REGENERAR' });
    expect(clienteRepo.findById).not.toHaveBeenCalled();
  });

  it('un equipo que nunca emitió QR devuelve SIN_EMITIR', async () => {
    const { useCase } = setup({
      qr: qr({ qrToken: null, qrTokenHash: null, qrEmitidoAt: null }),
    });
    expect((await useCase.execute(CMD)).getValue()).toEqual({ estado: 'SIN_EMITIR' });
  });

  it('un equipo inexistente, borrado o de otro tenant es 404', async () => {
    const { useCase } = setup({ qr: null });
    expect((await useCase.execute(CMD)).getError()).toBeInstanceOf(EquipoNoEncontradoError);
  });

  it('un equipo dado de baja se rechaza igual que al emitir', async () => {
    const { useCase } = setup({ qr: qr({ activo: false }) });
    expect((await useCase.execute(CMD)).getError()).toBeInstanceOf(EquipoDadoDeBajaError);
  });

  it('un cliente inexistente falla', async () => {
    const { useCase } = setup({ cliente: null });
    expect((await useCase.execute(CMD)).getError()).toBeInstanceOf(ClienteNoEncontradoError);
  });

  it('un cliente sin slug no puede armar la URL', async () => {
    const { useCase } = setup({ cliente: cliente(null) });
    expect((await useCase.execute(CMD)).getError()).toBeInstanceOf(QrRequiereSlugError);
  });
});
