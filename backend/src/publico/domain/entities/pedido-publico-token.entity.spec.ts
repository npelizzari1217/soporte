import { PEDIDO_PUBLICO_TTL_MS } from '../constants/pedido-publico.constants';
import { PedidoPublicoTokenEntity } from './pedido-publico-token.entity';

const AHORA = new Date('2026-10-03T12:00:00Z');

function emitir(): PedidoPublicoTokenEntity {
  return PedidoPublicoTokenEntity.emitir({ clienteId: 'c1', tokenHash: 'h1', ahora: AHORA });
}

describe('PedidoPublicoTokenEntity', () => {
  it('el TTL es de 24 horas', () => {
    expect(PEDIDO_PUBLICO_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('emitir vence exactamente 24 h despues y nace sin usar ni revocar', () => {
    const token = emitir();
    expect(token.expiresAt.toISOString()).toBe('2026-10-04T12:00:00.000Z');
    expect(token.usedAt).toBeNull();
    expect(token.revokedAt).toBeNull();
    expect(token.clienteId).toBe('c1');
    expect(token.tokenHash).toBe('h1');
  });

  it('es vigente un segundo antes del vencimiento', () => {
    expect(emitir().isVigente(new Date(AHORA.getTime() + PEDIDO_PUBLICO_TTL_MS - 1000))).toBe(true);
  });

  it('el instante exacto del vencimiento ya esta vencido', () => {
    const token = emitir();
    expect(token.isExpired(token.expiresAt)).toBe(true);
    expect(token.isVigente(token.expiresAt)).toBe(false);
  });

  it('un token usado no es vigente', () => {
    const token = PedidoPublicoTokenEntity.reconstitute(
      {
        clienteId: 'c1',
        tokenHash: 'h1',
        expiresAt: new Date('2099-01-01'),
        usedAt: AHORA,
        revokedAt: null,
      },
      'id-1',
      AHORA,
      AHORA,
      null,
    );
    expect(token.isUsed()).toBe(true);
    expect(token.isVigente(AHORA)).toBe(false);
  });

  it('un token revocado no es vigente', () => {
    const token = PedidoPublicoTokenEntity.reconstitute(
      {
        clienteId: 'c1',
        tokenHash: 'h1',
        expiresAt: new Date('2099-01-01'),
        usedAt: null,
        revokedAt: AHORA,
      },
      'id-1',
      AHORA,
      AHORA,
      null,
    );
    expect(token.isRevoked()).toBe(true);
    expect(token.isVigente(AHORA)).toBe(false);
  });

  it('un token dado de baja no es vigente', () => {
    const token = PedidoPublicoTokenEntity.reconstitute(
      {
        clienteId: 'c1',
        tokenHash: 'h1',
        expiresAt: new Date('2099-01-01'),
        usedAt: null,
        revokedAt: null,
      },
      'id-1',
      AHORA,
      AHORA,
      AHORA,
    );
    expect(token.isVigente(AHORA)).toBe(false);
  });

  it('respeta el id recibido para compartirlo con la fila pendiente del tenant', () => {
    const token = PedidoPublicoTokenEntity.emitir({ clienteId: 'c1', tokenHash: 'h1' }, 'id-fijo');
    expect(token.id).toBe('id-fijo');
  });
});
