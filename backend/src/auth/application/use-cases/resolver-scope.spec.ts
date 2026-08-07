/**
 * T3.9 TEST — Unit tests de resolverScope (RED → GREEN)
 *
 * resolverScope es la ÚNICA fuente de verdad de autorización de tenant,
 * reusada por login (PR3), switch (PR4) y refresh (PR4). Cubre (R4, R5):
 * - clienteId null: solo válido si isGlobalAdmin → token master (cliente_id/
 *   rol/permisos/nombre = null/null/[]/null). Normal → ClienteNoAutorizado.
 * - clienteId provisto inexistente/inactivo/soft-deleted → ClienteNoAutorizado
 *   (para root Y para normal).
 * - root con clienteId válido: rol/permisos de la membresía si existe, si no
 *   null/[] (root puede no tener membresía en ese cliente).
 * - normal con clienteId válido: exige membresía activa en ESE cliente; sin
 *   ella → ClienteNoAutorizado; con ella → rol/permisos de la membresía.
 */
import { resolverScope } from './resolver-scope';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { IMembresiaRepository, MembresiaResuelta } from '../../domain/ports/i-membresia.repository';
import { ClienteNoAutorizadoError } from '../../domain/errors/auth.errors';

const makeCliente = (
  overrides: Partial<{ activo: boolean; deleted: boolean; nombre: string }> = {},
) => {
  const cliente = ClienteEntity.create({
    nombre: overrides.nombre ?? 'Acme SA',
    razonSocial: null,
    cuit: null,
    dbName: 'acme_sa',
    activo: overrides.activo ?? true,
  });
  if (overrides.deleted) {
    cliente.softDelete();
  }
  return cliente;
};

const makeMembresiaResuelta = (overrides: Partial<MembresiaResuelta> = {}): MembresiaResuelta => ({
  clienteId: 'cliente-1',
  clienteNombre: 'Acme SA',
  rolCodigo: 'TECNICO',
  permisos: ['ticket:editar', 'ticket:crear'],
  ...overrides,
});

const makeClienteRepo = (): vi.Mocked<IClienteRepository> => ({
  findById: vi.fn(),
  findByDbName: vi.fn(),
  findAll: vi.fn(),
  save: vi.fn(),
  delete: vi.fn(),
});

const makeMembresiaRepo = (): vi.Mocked<IMembresiaRepository> => ({
  findActivasByUsuario: vi.fn(),
  findActivaByUsuarioYCliente: vi.fn(),
  create: vi.fn().mockResolvedValue(undefined),
});

describe('resolverScope', () => {
  let clienteRepo: ReturnType<typeof makeClienteRepo>;
  let membresiaRepo: ReturnType<typeof makeMembresiaRepo>;

  beforeEach(() => {
    clienteRepo = makeClienteRepo();
    membresiaRepo = makeMembresiaRepo();
  });

  describe('clienteId === null (token master)', () => {
    it('root sin clienteId → token master (todo null/[])', async () => {
      const result = await resolverScope(
        { usuarioId: 'root-1', isGlobalAdmin: true },
        null,
        membresiaRepo,
        clienteRepo,
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual({
        clienteId: null,
        clienteNombre: null,
        rol: null,
        permisos: [],
      });
      expect(clienteRepo.findById).not.toHaveBeenCalled();
    });

    it('normal sin clienteId → ClienteNoAutorizado (normal no puede pedir token master)', async () => {
      const result = await resolverScope(
        { usuarioId: 'user-1', isGlobalAdmin: false },
        null,
        membresiaRepo,
        clienteRepo,
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ClienteNoAutorizadoError);
    });
  });

  describe('clienteId inexistente/inactivo/borrado', () => {
    it('cliente inexistente → ClienteNoAutorizado (root)', async () => {
      clienteRepo.findById.mockResolvedValue(null);

      const result = await resolverScope(
        { usuarioId: 'root-1', isGlobalAdmin: true },
        'cliente-x',
        membresiaRepo,
        clienteRepo,
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ClienteNoAutorizadoError);
    });

    it('cliente inactivo → ClienteNoAutorizado (root)', async () => {
      clienteRepo.findById.mockResolvedValue(makeCliente({ activo: false }));

      const result = await resolverScope(
        { usuarioId: 'root-1', isGlobalAdmin: true },
        'cliente-1',
        membresiaRepo,
        clienteRepo,
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ClienteNoAutorizadoError);
    });

    it('cliente soft-deleted → ClienteNoAutorizado (root)', async () => {
      clienteRepo.findById.mockResolvedValue(makeCliente({ deleted: true }));

      const result = await resolverScope(
        { usuarioId: 'root-1', isGlobalAdmin: true },
        'cliente-1',
        membresiaRepo,
        clienteRepo,
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ClienteNoAutorizadoError);
    });

    it('cliente inactivo → ClienteNoAutorizado (normal, aunque tuviera membresía)', async () => {
      clienteRepo.findById.mockResolvedValue(makeCliente({ activo: false }));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(makeMembresiaResuelta());

      const result = await resolverScope(
        { usuarioId: 'user-1', isGlobalAdmin: false },
        'cliente-1',
        membresiaRepo,
        clienteRepo,
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ClienteNoAutorizadoError);
    });
  });

  describe('root con clienteId válido', () => {
    it('root CON membresía en ese cliente → rol/permisos de la membresía', async () => {
      clienteRepo.findById.mockResolvedValue(makeCliente({ nombre: 'Acme SA' }));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(
        makeMembresiaResuelta({ rolCodigo: 'ADMINISTRADOR', permisos: ['cliente:gestionar'] }),
      );

      const result = await resolverScope(
        { usuarioId: 'root-1', isGlobalAdmin: true },
        'cliente-1',
        membresiaRepo,
        clienteRepo,
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual({
        clienteId: 'cliente-1',
        clienteNombre: 'Acme SA',
        rol: 'ADMINISTRADOR',
        permisos: ['cliente:gestionar'],
      });
    });

    it('root SIN membresía en ese cliente → rol=null, permisos=[]', async () => {
      clienteRepo.findById.mockResolvedValue(makeCliente({ nombre: 'Acme SA' }));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(null);

      const result = await resolverScope(
        { usuarioId: 'root-1', isGlobalAdmin: true },
        'cliente-1',
        membresiaRepo,
        clienteRepo,
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual({
        clienteId: 'cliente-1',
        clienteNombre: 'Acme SA',
        rol: null,
        permisos: [],
      });
    });
  });

  describe('usuario normal con clienteId válido', () => {
    it('CON membresía activa en ese cliente → scope con su rol/permisos', async () => {
      clienteRepo.findById.mockResolvedValue(makeCliente({ nombre: 'Acme SA' }));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(
        makeMembresiaResuelta({ clienteNombre: 'Acme SA', rolCodigo: 'TECNICO' }),
      );

      const result = await resolverScope(
        { usuarioId: 'user-1', isGlobalAdmin: false },
        'cliente-1',
        membresiaRepo,
        clienteRepo,
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual({
        clienteId: 'cliente-1',
        clienteNombre: 'Acme SA',
        rol: 'TECNICO',
        permisos: ['ticket:editar', 'ticket:crear'],
      });
    });

    it('SIN membresía activa en ese cliente → ClienteNoAutorizado', async () => {
      clienteRepo.findById.mockResolvedValue(makeCliente());
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(null);

      const result = await resolverScope(
        { usuarioId: 'user-1', isGlobalAdmin: false },
        'cliente-1',
        membresiaRepo,
        clienteRepo,
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ClienteNoAutorizadoError);
    });

    it('consulta findActivaByUsuarioYCliente con el usuarioId y clienteId correctos', async () => {
      clienteRepo.findById.mockResolvedValue(makeCliente());
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(makeMembresiaResuelta());

      await resolverScope(
        { usuarioId: 'user-42', isGlobalAdmin: false },
        'cliente-1',
        membresiaRepo,
        clienteRepo,
      );

      expect(membresiaRepo.findActivaByUsuarioYCliente).toHaveBeenCalledWith(
        'user-42',
        'cliente-1',
      );
    });
  });
});
