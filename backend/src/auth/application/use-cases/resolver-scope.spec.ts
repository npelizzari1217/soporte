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
import { IUsuarioClienteModuloRepository } from '../../domain/ports/i-usuario-cliente-modulo.repository';
import { ClienteNoAutorizadoError } from '../../domain/errors/auth.errors';
import { TODOS_LOS_MODULOS } from '../../../shared/domain/modulos';

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

const makeModulosRepo = (): vi.Mocked<IUsuarioClienteModuloRepository> => ({
  findModulosByUsuarioYCliente: vi.fn().mockResolvedValue([]),
});

describe('resolverScope', () => {
  let clienteRepo: ReturnType<typeof makeClienteRepo>;
  let membresiaRepo: ReturnType<typeof makeMembresiaRepo>;
  let modulosRepo: ReturnType<typeof makeModulosRepo>;

  beforeEach(() => {
    clienteRepo = makeClienteRepo();
    membresiaRepo = makeMembresiaRepo();
    modulosRepo = makeModulosRepo();
  });

  describe('clienteId === null (token master)', () => {
    it('root sin clienteId → token master (todo null/[])', async () => {
      const result = await resolverScope(
        { usuarioId: 'root-1', isGlobalAdmin: true },
        null,
        membresiaRepo,
        clienteRepo,
        modulosRepo,
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual({
        clienteId: null,
        clienteNombre: null,
        rol: null,
        permisos: [],
        modulos: TODOS_LOS_MODULOS(),
      });
      expect(clienteRepo.findById).not.toHaveBeenCalled();
    });

    it('normal sin clienteId → ClienteNoAutorizado (normal no puede pedir token master)', async () => {
      const result = await resolverScope(
        { usuarioId: 'user-1', isGlobalAdmin: false },
        null,
        membresiaRepo,
        clienteRepo,
        modulosRepo,
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
        modulosRepo,
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
        modulosRepo,
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
        modulosRepo,
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
        modulosRepo,
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
        modulosRepo,
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual({
        clienteId: 'cliente-1',
        clienteNombre: 'Acme SA',
        rol: 'ADMINISTRADOR',
        permisos: ['cliente:gestionar'],
        modulos: TODOS_LOS_MODULOS(),
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
        modulosRepo,
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual({
        clienteId: 'cliente-1',
        clienteNombre: 'Acme SA',
        rol: null,
        permisos: [],
        modulos: TODOS_LOS_MODULOS(),
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
        modulosRepo,
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual({
        clienteId: 'cliente-1',
        clienteNombre: 'Acme SA',
        rol: 'TECNICO',
        permisos: ['ticket:editar', 'ticket:crear'],
        modulos: [],
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
        modulosRepo,
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
        modulosRepo,
      );

      expect(membresiaRepo.findActivaByUsuarioYCliente).toHaveBeenCalledWith(
        'user-42',
        'cliente-1',
      );
    });
  });

  // ─── Eje de módulos (feature 5.2 CAPA 1) ────────────────────────────────────
  describe('modulos', () => {
    it('ROOT (isGlobalAdmin) con cliente → TODOS los módulos, sin consultar modulosRepo', async () => {
      clienteRepo.findById.mockResolvedValue(makeCliente());
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(null);

      const result = await resolverScope(
        { usuarioId: 'root-1', isGlobalAdmin: true },
        'cliente-1',
        membresiaRepo,
        clienteRepo,
        modulosRepo,
      );

      expect(result.getValue().modulos).toEqual(TODOS_LOS_MODULOS());
      expect(modulosRepo.findModulosByUsuarioYCliente).not.toHaveBeenCalled();
    });

    it('ADMINISTRADOR (membresía rolCodigo ADMINISTRADOR) → TODOS los módulos, sin consultar modulosRepo', async () => {
      clienteRepo.findById.mockResolvedValue(makeCliente());
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(
        makeMembresiaResuelta({ rolCodigo: 'ADMINISTRADOR' }),
      );

      const result = await resolverScope(
        { usuarioId: 'user-1', isGlobalAdmin: false },
        'cliente-1',
        membresiaRepo,
        clienteRepo,
        modulosRepo,
      );

      expect(result.getValue().modulos).toEqual(TODOS_LOS_MODULOS());
      expect(modulosRepo.findModulosByUsuarioYCliente).not.toHaveBeenCalled();
    });

    it('usuario normal → exactamente los módulos asignados que devuelve modulosRepo', async () => {
      clienteRepo.findById.mockResolvedValue(makeCliente());
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(
        makeMembresiaResuelta({ rolCodigo: 'TECNICO' }),
      );
      modulosRepo.findModulosByUsuarioYCliente.mockResolvedValue(['SOPORTE']);

      const result = await resolverScope(
        { usuarioId: 'user-1', isGlobalAdmin: false },
        'cliente-1',
        membresiaRepo,
        clienteRepo,
        modulosRepo,
      );

      expect(result.getValue().modulos).toEqual(['SOPORTE']);
      expect(modulosRepo.findModulosByUsuarioYCliente).toHaveBeenCalledWith('user-1', 'cliente-1');
    });

    it('token master (clienteId null, root) → TODOS los módulos', async () => {
      const result = await resolverScope(
        { usuarioId: 'root-1', isGlobalAdmin: true },
        null,
        membresiaRepo,
        clienteRepo,
        modulosRepo,
      );

      expect(result.getValue().modulos).toEqual(TODOS_LOS_MODULOS());
      expect(modulosRepo.findModulosByUsuarioYCliente).not.toHaveBeenCalled();
    });
  });
});
