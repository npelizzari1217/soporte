/**
 * resolver-cliente-publico.service.spec.ts — unit del 404 uniforme y del binding del tenant
 * (sdd/formulario-publico-qr, WU-12; tarea 12.2). Fakes puros, sin Nest ni base.
 */
import { ResolverClientePublicoService } from './resolver-cliente-publico.service';
import { FormularioPublicoNoDisponibleError } from '../../domain/errors/publico.errors';
import { ClienteEntity, ClienteProps } from '../../../clientes/domain/entities/cliente.entity';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';

const CLIENTE_ID = '01977a00-0000-7000-8000-0000000000c1';

function makeCliente(
  overrides: Partial<ClienteProps> = {},
  deletedAt: Date | null = null,
): ClienteEntity {
  return ClienteEntity.reconstitute(
    {
      nombre: 'Colegio Norte',
      razonSocial: null,
      cuit: null,
      dbName: 'tenant_norte',
      activo: true,
      slug: 'colegio-norte',
      formularioPublicoHabilitado: true,
      ...overrides,
    },
    CLIENTE_ID,
    new Date(),
    new Date(),
    deletedAt,
  );
}

function build(cliente: ClienteEntity | null) {
  const clienteRepo: IClienteRepository = {
    findById: vi.fn(),
    findByDbName: vi.fn(),
    findBySlug: vi.fn().mockResolvedValue(cliente),
    congelarSlug: vi.fn(),
    cambiarSlugSiNoCongelado: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  };
  const prismaService = { getTenantClient: vi.fn().mockReturnValue({ marker: 'tenant-stub' }) };
  const tenantContext = { bind: vi.fn() };
  const service = new ResolverClientePublicoService(clienteRepo, prismaService, tenantContext);
  return { service, clienteRepo, prismaService, tenantContext };
}

describe('ResolverClientePublicoService', () => {
  describe('rechazos: todos el MISMO FormularioPublicoNoDisponibleError y sin bindear el tenant', () => {
    const casos: Array<[string, ClienteEntity | null]> = [
      ['slug inexistente', null],
      ['formulario deshabilitado', makeCliente({ formularioPublicoHabilitado: false })],
      ['cliente inactivo', makeCliente({ activo: false })],
      ['cliente borrado', makeCliente({}, new Date())],
    ];

    it.each(casos)('%s', async (_motivo, cliente) => {
      const { service, tenantContext, prismaService } = build(cliente);

      const resultado = await service.resolver('colegio-norte');

      expect(resultado.isFail()).toBe(true);
      expect(resultado.getError()).toBeInstanceOf(FormularioPublicoNoDisponibleError);
      expect(tenantContext.bind).not.toHaveBeenCalled();
      expect(prismaService.getTenantClient).not.toHaveBeenCalled();
    });

    it.each(['', 'Colegio-Norte', '-norte', 'norte-', 'a b', 'a'.repeat(64), 'norte/../x'])(
      'slug con formato inválido (%j) se rechaza sin consultar la base',
      async (slug) => {
        const { service, clienteRepo } = build(makeCliente());

        const resultado = await service.resolver(slug);

        expect(resultado.getError()).toBeInstanceOf(FormularioPublicoNoDisponibleError);
        expect(clienteRepo.findBySlug).not.toHaveBeenCalled();
      },
    );

    it('los mensajes de error son idénticos entre motivos', async () => {
      const mensajes = await Promise.all(
        casos.map(async ([, cliente]) => {
          const { service } = build(cliente);
          return (await service.resolver('colegio-norte')).getError().message;
        }),
      );

      expect(new Set(mensajes).size).toBe(1);
    });
  });

  describe('cliente válido', () => {
    it('devuelve el cliente y bindea el tenant con los datos de la fila de master', async () => {
      const { service, tenantContext, prismaService, clienteRepo } = build(makeCliente());

      const resultado = await service.resolver('colegio-norte');

      expect(resultado.isOk()).toBe(true);
      expect(resultado.getValue().id).toBe(CLIENTE_ID);
      expect(clienteRepo.findBySlug).toHaveBeenCalledWith('colegio-norte');
      expect(prismaService.getTenantClient).toHaveBeenCalledWith('tenant_norte');
      expect(tenantContext.bind).toHaveBeenCalledWith({
        prismaClient: { marker: 'tenant-stub' },
        dbName: 'tenant_norte',
        clienteId: CLIENTE_ID,
      });
    });
  });
});
