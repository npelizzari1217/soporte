import { PEDIDO_PUBLICO_TTL_MS } from '../constants/pedido-publico.constants';
import { PedidoPendienteEntity } from './pedido-pendiente.entity';

const AHORA = new Date('2026-10-03T12:00:00Z');
const BASE = {
  nombre: ' Ana Perez ',
  email: ' ANA@Ejemplo.com ',
  titulo: 'No enciende',
  descripcion: 'La PC no enciende desde ayer',
  ahora: AHORA,
};

describe('PedidoPendienteEntity', () => {
  it('normaliza los datos y vence a las 24 h', () => {
    const r = PedidoPendienteEntity.create({ ...BASE, telefono: '  ', equipoId: 'eq-1' }, 'id-1');
    expect(r.isOk()).toBe(true);
    const p = r.getValue();
    expect(p.id).toBe('id-1');
    expect(p.nombre).toBe('Ana Perez');
    expect(p.email).toBe('ana@ejemplo.com');
    expect(p.telefono).toBeNull();
    expect(p.equipoId).toBe('eq-1');
    expect(p.expiresAt.getTime()).toBe(AHORA.getTime() + PEDIDO_PUBLICO_TTL_MS);
  });

  it('sin equipo queda equipoId null', () => {
    expect(PedidoPendienteEntity.create(BASE).getValue().equipoId).toBeNull();
  });

  it('esta vigente hasta un instante antes del vencimiento y vencido en el instante exacto', () => {
    const p = PedidoPendienteEntity.create(BASE).getValue();
    expect(p.isExpired(new Date(p.expiresAt.getTime() - 1))).toBe(false);
    expect(p.isExpired(p.expiresAt)).toBe(true);
  });

  it.each([
    ['nombre vacio', { nombre: '   ' }],
    ['nombre largo', { nombre: 'a'.repeat(121) }],
    ['email sin arroba', { email: 'ana.ejemplo.com' }],
    ['email largo', { email: `${'a'.repeat(250)}@x.com` }],
    ['telefono largo', { telefono: '1'.repeat(31) }],
    ['titulo corto', { titulo: 'ab' }],
    ['titulo largo', { titulo: 'a'.repeat(151) }],
    ['descripcion vacia', { descripcion: '  ' }],
    ['descripcion larga', { descripcion: 'a'.repeat(4001) }],
  ])('rechaza %s', (_caso, cambio) => {
    const r = PedidoPendienteEntity.create({ ...BASE, ...cambio });
    expect(r.isFail()).toBe(true);
    expect(r.getError().code).toBe('PEDIDO_PENDIENTE_INVALIDO');
  });
});
