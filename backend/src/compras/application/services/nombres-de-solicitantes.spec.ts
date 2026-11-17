/**
 * [UNIT] `ResolverNombresSolicitantes` (odd/tasks/compra-export-secciones-y-pdf.md, S9).
 */
import { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import { ResolverNombresSolicitantes } from './nombres-de-solicitantes';

function crear(nombres: Record<string, { nombre: string; apellido: string }>) {
  const resolverNombres = vi.fn<IUsuarioMasterChecker['resolverNombres']>(
    async (ids) =>
      new Map(ids.filter((id) => id in nombres).map((id) => [id, nombres[id]] as const)),
  );
  return { resolver: new ResolverNombresSolicitantes({ resolverNombres }), resolverNombres };
}

describe('ResolverNombresSolicitantes', () => {
  it('devuelve "Nombre Apellido" por id, consultando una sola vez con los ids sin repetir', async () => {
    const { resolver, resolverNombres } = crear({
      u1: { nombre: 'Ana', apellido: 'Pérez' },
      u2: { nombre: 'Luis', apellido: 'Gómez' },
    });

    const nombres = await resolver.resolver(['u1', 'u2', 'u1']);

    expect(nombres).toEqual(
      new Map([
        ['u1', 'Ana Pérez'],
        ['u2', 'Luis Gómez'],
      ]),
    );
    expect(resolverNombres).toHaveBeenCalledTimes(1);
    expect(resolverNombres).toHaveBeenCalledWith(['u1', 'u2']);
  });

  it('un usuario que no se encuentra no figura; sin ids no consulta', async () => {
    const { resolver, resolverNombres } = crear({ u1: { nombre: 'Ana', apellido: '' } });

    expect(await resolver.resolver(['u1', 'borrado'])).toEqual(new Map([['u1', 'Ana']]));
    resolverNombres.mockClear();
    expect(await resolver.resolver([])).toEqual(new Map());
    expect(resolverNombres).not.toHaveBeenCalled();
  });
});
