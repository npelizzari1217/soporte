import { Result } from '../../shared/domain/result';
import { TipoTicketEntity } from '../../tickets/domain/entities/tipo-ticket.entity';
import { ModuloTipoTicketInvalidoError } from '../../tickets/domain/errors/tickets.errors';
import { TipoTicketV1NoDisponibleError } from '../domain/integraciones.errors';
import { TiposTicketV1Query } from './tipos-ticket-v1.query';

const SOPORTE = TipoTicketEntity.create(
  { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'TICKETS', activo: true },
  'tipo-soporte',
);

function armar(resultado = Result.ok([SOPORTE])) {
  const execute = vi.fn().mockResolvedValue(resultado);
  return { query: new TiposTicketV1Query({ execute }), execute };
}

describe('TiposTicketV1Query', () => {
  it('lista los tipos activos del modulo TICKETS', async () => {
    const { query, execute } = armar();

    const res = await query.listar();

    expect(execute).toHaveBeenCalledWith({ modulo: 'TICKETS' });
    expect(res.getValue()).toEqual([SOPORTE]);
  });

  it('un tipo publicado sirve para el alta', async () => {
    const { query, execute } = armar();

    const res = await query.validarParaAlta('tipo-soporte');

    expect(res.isOk()).toBe(true);
    expect(execute).toHaveBeenCalledWith({ modulo: 'TICKETS' });
  });

  it('un tipo fuera de los publicados da TipoTicketV1NoDisponibleError', async () => {
    const { query } = armar();

    const res = await query.validarParaAlta('tipo-edilicia');

    expect(res.getError()).toBeInstanceOf(TipoTicketV1NoDisponibleError);
  });

  it('propaga el error del listado', async () => {
    const error = new ModuloTipoTicketInvalidoError('X');
    const { query } = armar(Result.fail(error));

    const res = await query.validarParaAlta('tipo-soporte');

    expect(res.getError()).toBe(error);
  });
});
