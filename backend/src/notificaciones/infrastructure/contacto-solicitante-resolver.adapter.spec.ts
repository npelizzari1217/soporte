/**
 * ContactoSolicitanteResolverAdapter — las dos ramas del resolver: usuario registrado (master) y
 * solicitante externo (tenant).
 *
 * Ref spec: sdd/formulario-publico-qr solicitante-externo, requisito D5. Tarea: 9.1.
 */
import { ContactoSolicitanteResolverAdapter } from './contacto-solicitante-resolver.adapter';
import { SolicitanteExternoEntity } from '../../tickets/domain/entities/solicitante-externo.entity';

function makeExterno(): SolicitanteExternoEntity {
  return SolicitanteExternoEntity.create(
    { nombre: 'Ana Externa', email: 'Ana@Externa.com', emailVerificadoAt: new Date() },
    'externo-uuid',
  ).getValue();
}

function makeAdapter() {
  const usuarioResolver = { resolverContacto: vi.fn() };
  const externoRepo = { findById: vi.fn() };
  const adapter = new ContactoSolicitanteResolverAdapter(usuarioResolver, externoRepo);
  return { adapter, usuarioResolver, externoRepo };
}

describe('ContactoSolicitanteResolverAdapter', () => {
  it('rama master: un usuario registrado se resuelve contra master y no es externo', async () => {
    const { adapter, usuarioResolver, externoRepo } = makeAdapter();
    usuarioResolver.resolverContacto.mockResolvedValue({ email: 'u@dominio.com', nombre: 'U' });

    const contacto = await adapter.resolver({
      solicitanteId: 'usuario-uuid',
      solicitanteExternoId: null,
    });

    expect(usuarioResolver.resolverContacto).toHaveBeenCalledWith('usuario-uuid');
    expect(externoRepo.findById).not.toHaveBeenCalled();
    expect(contacto).toEqual({ email: 'u@dominio.com', nombre: 'U', esExterno: false });
  });

  it('rama master: usuario inexistente o dado de baja devuelve null', async () => {
    const { adapter, usuarioResolver } = makeAdapter();
    usuarioResolver.resolverContacto.mockResolvedValue(null);

    await expect(
      adapter.resolver({ solicitanteId: 'usuario-uuid', solicitanteExternoId: null }),
    ).resolves.toBeNull();
  });

  it('rama externa: lee el email verificado y el nombre del solicitante externo', async () => {
    const { adapter, usuarioResolver, externoRepo } = makeAdapter();
    externoRepo.findById.mockResolvedValue(makeExterno());

    const contacto = await adapter.resolver({
      solicitanteId: null,
      solicitanteExternoId: 'externo-uuid',
    });

    expect(externoRepo.findById).toHaveBeenCalledWith('externo-uuid');
    expect(usuarioResolver.resolverContacto).not.toHaveBeenCalled();
    expect(contacto).toEqual({ email: 'ana@externa.com', nombre: 'Ana Externa', esExterno: true });
  });

  it('rama externa: un externo inexistente devuelve null', async () => {
    const { adapter, externoRepo } = makeAdapter();
    externoRepo.findById.mockResolvedValue(null);

    await expect(
      adapter.resolver({ solicitanteId: null, solicitanteExternoId: 'externo-uuid' }),
    ).resolves.toBeNull();
  });

  it('sin ninguno de los dos ids devuelve null sin consultar', async () => {
    const { adapter, usuarioResolver, externoRepo } = makeAdapter();

    await expect(
      adapter.resolver({ solicitanteId: null, solicitanteExternoId: null }),
    ).resolves.toBeNull();
    expect(usuarioResolver.resolverContacto).not.toHaveBeenCalled();
    expect(externoRepo.findById).not.toHaveBeenCalled();
  });
});
