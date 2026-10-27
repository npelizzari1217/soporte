/**
 * [UNIT] Visibilidad y alta de compras por tipo de ticket (odd/compras-por-tipo, S2, S3, S4).
 *
 * El punto único de la regla: lo usan el guard de las rutas `/compras/:id...`, el listado, la
 * exportación, el alta, la edición y el vínculo con un ticket. Cada caso con restricción tiene
 * su hermano sin restricción, y cada "no la ve" su hermano "la ve".
 */
import {
  esCompraVisiblePara,
  exigirAltaSobreTipoDeCompra,
  tiposVisiblesDeCompras,
  verificarCompraVisible,
} from './visibilidad-compra';
import { AlcanceActorTicket } from '../../../tickets/application/services/visibilidad-ticket';
import { AccionTipoTicket } from '../../../tickets/domain/permisos-tipo-ticket';
import { TipoTicketEntity } from '../../../tickets/domain/entities/tipo-ticket.entity';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import {
  CompraNoEncontradaError,
  TipoTicketDeCompraInvalidoError,
  TipoTicketDeCompraNoPermitidoError,
} from '../../domain/errors/compras.errors';

const SOPORTE = 'tipo-soporte';
const EDILICIA = 'tipo-edilicia';

function alcanceCon(porTipo: Record<string, AccionTipoTicket[]>): AlcanceActorTicket {
  return {
    actorId: 'usuario-1',
    permisosPorTipo: new Map(
      Object.entries(porTipo).map(([tipoId, acciones]) => [tipoId, new Set(acciones)]),
    ),
  };
}

const ADMINISTRADOR: AlcanceActorTicket = { actorId: 'admin-1', permisosPorTipo: null };

describe('esCompraVisiblePara', () => {
  it('con LECTURA sobre el tipo de la compra, la ve', () => {
    expect(
      esCompraVisiblePara({ tipoTicketId: SOPORTE }, alcanceCon({ [SOPORTE]: ['LECTURA'] })),
    ).toBe(true);
  });

  it('sin LECTURA sobre su tipo no la ve, aunque tenga LECTURA sobre otro', () => {
    expect(
      esCompraVisiblePara({ tipoTicketId: EDILICIA }, alcanceCon({ [SOPORTE]: ['LECTURA'] })),
    ).toBe(false);
  });

  it('otra acción sobre el tipo sin LECTURA no alcanza', () => {
    expect(
      esCompraVisiblePara({ tipoTicketId: SOPORTE }, alcanceCon({ [SOPORTE]: ['COMENTAR'] })),
    ).toBe(false);
  });

  it('S4: una compra sin tipo la ve cualquiera, incluso sin ningún tipo con LECTURA', () => {
    expect(esCompraVisiblePara({ tipoTicketId: null }, alcanceCon({}))).toBe(true);
  });

  it('ADMINISTRADOR (sin restricción) ve la compra de cualquier tipo', () => {
    expect(esCompraVisiblePara({ tipoTicketId: EDILICIA }, ADMINISTRADOR)).toBe(true);
  });
});

describe('tiposVisiblesDeCompras', () => {
  it('devuelve solo los tipos con LECTURA', () => {
    expect(
      tiposVisiblesDeCompras(
        alcanceCon({ [SOPORTE]: ['LECTURA', 'ALTAS'], [EDILICIA]: ['COMENTAR'] }),
      ),
    ).toEqual([SOPORTE]);
  });

  it('sin tipos con LECTURA devuelve una lista vacía (solo entran las compras sin tipo)', () => {
    expect(tiposVisiblesDeCompras(alcanceCon({}))).toEqual([]);
  });

  it('sin restricción devuelve undefined: el listado no filtra por tipo', () => {
    expect(tiposVisiblesDeCompras(ADMINISTRADOR)).toBeUndefined();
  });
});

describe('verificarCompraVisible', () => {
  function repoCon(compra: { tipoTicketId: string | null } | null): Pick<
    ICompraRepository,
    'findParaVisibilidad'
  > & {
    findParaVisibilidad: ReturnType<typeof vi.fn<ICompraRepository['findParaVisibilidad']>>;
  } {
    return {
      findParaVisibilidad: vi
        .fn<ICompraRepository['findParaVisibilidad']>()
        .mockResolvedValue(compra),
    };
  }

  it('compra de un tipo sin LECTURA -> CompraNoEncontradaError, el mismo mensaje que una inexistente', async () => {
    const repo = repoCon({ tipoTicketId: EDILICIA });

    const result = await verificarCompraVisible(
      repo,
      'compra-1',
      alcanceCon({ [SOPORTE]: ['LECTURA'] }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
    expect(result.getError().message).toBe(new CompraNoEncontradaError('compra-1').message);
  });

  it('compra de un tipo con LECTURA -> ok', async () => {
    const result = await verificarCompraVisible(
      repoCon({ tipoTicketId: SOPORTE }),
      'compra-1',
      alcanceCon({ [SOPORTE]: ['LECTURA'] }),
    );

    expect(result.isOk()).toBe(true);
  });

  it('compra sin tipo -> ok para un actor sin ningún tipo (S4)', async () => {
    const result = await verificarCompraVisible(
      repoCon({ tipoTicketId: null }),
      'compra-1',
      alcanceCon({}),
    );

    expect(result.isOk()).toBe(true);
  });

  it('compra inexistente -> ok: el caso de uso responde su propio 404', async () => {
    const result = await verificarCompraVisible(repoCon(null), 'compra-1', alcanceCon({}));

    expect(result.isOk()).toBe(true);
  });

  it('sin restricción -> ok sin consultar la base', async () => {
    const repo = repoCon({ tipoTicketId: EDILICIA });

    const result = await verificarCompraVisible(repo, 'compra-1', ADMINISTRADOR);

    expect(result.isOk()).toBe(true);
    expect(repo.findParaVisibilidad).not.toHaveBeenCalled();
  });
});

describe('exigirAltaSobreTipoDeCompra', () => {
  function tipoRepoCon(tipo: TipoTicketEntity | null): Pick<ITipoTicketRepository, 'findById'> {
    return { findById: async () => tipo };
  }
  const soporte = (activo = true): TipoTicketEntity =>
    TipoTicketEntity.create(
      { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'TICKETS', activo },
      SOPORTE,
    );

  it('con ALTAS sobre un tipo activo devuelve el tipo', async () => {
    const result = await exigirAltaSobreTipoDeCompra(
      tipoRepoCon(soporte()),
      SOPORTE,
      alcanceCon({ [SOPORTE]: ['LECTURA', 'ALTAS'] }),
    );

    expect(result.getValue().id).toBe(SOPORTE);
  });

  it('sin ALTAS -> TipoTicketDeCompraNoPermitidoError (403) que nombra el tipo', async () => {
    const result = await exigirAltaSobreTipoDeCompra(
      tipoRepoCon(soporte()),
      SOPORTE,
      alcanceCon({ [SOPORTE]: ['LECTURA'] }),
    );

    expect(result.getError()).toBeInstanceOf(TipoTicketDeCompraNoPermitidoError);
    expect(result.getError().message).toContain('"Soporte"');
  });

  it('tipo inactivo -> TipoTicketDeCompraInvalidoError (400), también para ADMINISTRADOR', async () => {
    const result = await exigirAltaSobreTipoDeCompra(
      tipoRepoCon(soporte(false)),
      SOPORTE,
      ADMINISTRADOR,
    );

    expect(result.getError()).toBeInstanceOf(TipoTicketDeCompraInvalidoError);
  });

  it('tipo inexistente -> TipoTicketDeCompraInvalidoError (400), antes que el 403', async () => {
    const result = await exigirAltaSobreTipoDeCompra(tipoRepoCon(null), SOPORTE, alcanceCon({}));

    expect(result.getError()).toBeInstanceOf(TipoTicketDeCompraInvalidoError);
  });
});
