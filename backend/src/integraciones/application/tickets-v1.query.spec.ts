import {
  TicketNoEncontradoError,
  TicketReferenciaInvalidaError,
} from '../../tickets/domain/errors/tickets.errors';
import { TicketsV1Query } from './tickets-v1.query';

const ID = 'ticket-1';

function armar(opciones: { ticket?: 'tickets' | 'edilicia' | 'ausente' | 'borrado' } = {}) {
  const estado = opciones.ticket ?? 'tickets';
  const ticket =
    estado === 'ausente'
      ? null
      : {
          tipoId: estado === 'edilicia' ? 'tipo-edilicia' : 'tipo-soporte',
          isDeleted: () => estado === 'borrado',
        };
  const findById = vi.fn().mockResolvedValue(ticket);
  const findIdsByModulos = vi.fn().mockResolvedValue(['tipo-soporte', 'tipo-soporte-baja']);
  return { query: new TicketsV1Query({ findById }, { findIdsByModulos }), findIdsByModulos };
}

describe('TicketsV1Query', () => {
  it('un ticket de un tipo del modulo TICKETS es de v1', async () => {
    const { query, findIdsByModulos } = armar();

    expect((await query.validarExistente(ID)).isOk()).toBe(true);
    expect((await query.validarReferencia(ID)).isOk()).toBe(true);
    expect(findIdsByModulos).toHaveBeenCalledWith(['TICKETS']);
  });

  it.each(['edilicia', 'ausente', 'borrado'] as const)(
    'un ticket %s da el mismo TicketNoEncontradoError',
    async (ticket) => {
      const { query } = armar({ ticket });

      const res = await query.validarExistente(ID);

      expect(res.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(res.getError().message).toBe(new TicketNoEncontradoError(ID).message);
    },
  );

  it.each(['edilicia', 'ausente', 'borrado'] as const)(
    'como referencia, un ticket %s da el mismo TicketReferenciaInvalidaError',
    async (ticket) => {
      const { query } = armar({ ticket });

      const res = await query.validarReferencia(ID);

      expect(res.getError()).toBeInstanceOf(TicketReferenciaInvalidaError);
      expect(res.getError().message).toBe(new TicketReferenciaInvalidaError(ID).message);
    },
  );
});
