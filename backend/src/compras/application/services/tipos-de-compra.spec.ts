/**
 * [UNIT] `ResolverTiposDeCompra` y `tipoDeCompra` (odd/compras-por-tipo, L3): el nombre del tipo
 * de cada compra se resuelve con una lectura por tipo DISTINTO, y una compra sin tipo publica `null`.
 */
import { ResolverTiposDeCompra, tipoDeCompra } from './tipos-de-compra';
import { TipoTicketEntity } from '../../../tickets/domain/entities/tipo-ticket.entity';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';

function tipo(id: string, nombre: string): TipoTicketEntity {
  return TipoTicketEntity.create(
    { codigo: nombre.toUpperCase(), nombre, modulo: 'TICKETS', activo: true },
    id,
  );
}

describe('ResolverTiposDeCompra', () => {
  function crear() {
    const catalogo = new Map([
      ['t1', tipo('t1', 'Soporte')],
      ['t2', tipo('t2', 'Edilicia')],
    ]);
    const findById = vi
      .fn<ITipoTicketRepository['findById']>()
      .mockImplementation(async (id) => catalogo.get(id) ?? null);
    return { resolver: new ResolverTiposDeCompra({ findById }), findById };
  }

  it('una lectura por tipo distinto, ignorando los null (compras sin tipo)', async () => {
    const { resolver, findById } = crear();

    const tipos = await resolver.resolver(['t1', null, 't2', 't1', null]);

    expect(findById).toHaveBeenCalledTimes(2);
    expect([...tipos.values()]).toEqual([
      { id: 't1', nombre: 'Soporte' },
      { id: 't2', nombre: 'Edilicia' },
    ]);
  });

  it('sin tipos no consulta el catálogo', async () => {
    const { resolver, findById } = crear();

    expect((await resolver.resolver([null, null])).size).toBe(0);
    expect(findById).not.toHaveBeenCalled();
  });

  it('un tipo dado de baja conserva su nombre: la compra sigue siendo de ese tipo', async () => {
    const dadoDeBaja = tipo('t3', 'Mantenimiento');
    dadoDeBaja.desactivar();
    const resolver = new ResolverTiposDeCompra({ findById: async () => dadoDeBaja });

    expect((await resolver.resolver(['t3'])).get('t3')).toEqual({
      id: 't3',
      nombre: 'Mantenimiento',
    });
  });
});

describe('tipoDeCompra', () => {
  const tipos = new Map([['t1', { id: 't1', nombre: 'Soporte' }]]);

  it('compra con tipo -> el tipo resuelto', () => {
    expect(tipoDeCompra('t1', tipos)).toEqual({ id: 't1', nombre: 'Soporte' });
  });

  it('compra sin tipo -> null (S4)', () => {
    expect(tipoDeCompra(null, tipos)).toBeNull();
  });

  it('un tipo ausente del mapa nunca se publica como null (que se leería "sin tipo")', () => {
    expect(tipoDeCompra('t9', tipos)).toEqual({ id: 't9', nombre: 't9' });
  });
});
