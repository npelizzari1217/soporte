/**
 * resolver-scope.spec.ts — reescrito para WU-7.1 (sdd/matriz-permisos-por-usuario).
 *
 * resolverScope sigue siendo la ÚNICA fuente de verdad de autorización de
 * tenant, reusada por login/switch/refresh. Lo que cambia respecto de la
 * versión anterior (feature 5.2): el eje de módulos (`IUsuarioClienteModuloRepository`)
 * se reemplaza por la matriz de permisos (`IMatrizPermisosRepository`,
 * `usuario_cliente_permisos`) — R2, ADR-P6:
 *
 * - `permisos: string[]` ahora son códigos `MODULO:ACCION` (no `ticket:crear`).
 * - `modulos: string[]` pasa a ser DERIVADO de `permisos` vía `moduloDe`, sin
 *   duplicados — ya no es una lectura independiente.
 * - ROOT (`is_global_admin`) y ADMINISTRADOR de la membresía activa en el
 *   cliente objetivo bypassean TODAS las celdas: `permisos = [...PARES_VALIDOS]`.
 *   El bypass se MATERIALIZA en el payload (ADR-P6) — no alcanza con que el
 *   guard lo evalúe, porque `use-session.ts` del frontend solo tiene rama
 *   ROOT, no ADMINISTRADOR.
 * - Usuario común: lee `permisosRepo.findByUsuarioYCliente` directo.
 * - 0 filas en la matriz → `permisos: []`, `modulos: []`, sin crash (S5,
 *   fail-closed).
 * - ADMINISTRADOR de cliente A que hace switch a B NO bypassea en B a menos
 *   que su membresía en B también sea ADMINISTRADOR (S4) — por construcción,
 *   cada llamada a `resolverScope` resuelve la membresía del `clienteId`
 *   pedido.
 */
import type { Mocked } from 'vitest';
import { resolverScope } from './resolver-scope';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { IMembresiaRepository, MembresiaResuelta } from '../../domain/ports/i-membresia.repository';
import { IMatrizPermisosRepository } from '../../domain/ports/i-matriz-permisos.repository';
import { ClienteNoAutorizadoError } from '../../domain/errors/auth.errors';
import { PARES_VALIDOS, moduloDe, CodigoAccion } from '../../../shared/domain/acciones';

/** Módulos esperados de un bypass total, en el mismo orden que `CATALOGO_MODULOS`. */
const MODULOS_DE_BYPASS = [...new Set(PARES_VALIDOS.map((codigo) => moduloDe(codigo)))];

const makeCliente = (
  overrides: Partial<{
    activo: boolean;
    deleted: boolean;
    nombre: string;
    logoUpdatedAt: Date | null;
  }> = {},
) => {
  const cliente = ClienteEntity.create({
    nombre: overrides.nombre ?? 'Acme SA',
    razonSocial: null,
    cuit: null,
    dbName: 'acme_sa',
    activo: overrides.activo ?? true,
    logoUpdatedAt: overrides.logoUpdatedAt ?? null,
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
  ...overrides,
});

const makeClienteRepo = (): Mocked<IClienteRepository> => ({
  findById: vi.fn(),
  findByDbName: vi.fn(),
  findAll: vi.fn(),
  save: vi.fn(),
  delete: vi.fn(),
});

const makeMembresiaRepo = (): Mocked<IMembresiaRepository> => ({
  findActivasByUsuario: vi.fn(),
  findActivaByUsuarioYCliente: vi.fn(),
  findActivasByCliente: vi.fn(),
  findByUsuarioYCliente: vi.fn(),
  create: vi.fn().mockResolvedValue(undefined),
  save: vi.fn().mockResolvedValue(undefined),
});

const makePermisosRepo = (): Mocked<IMatrizPermisosRepository> => ({
  findByUsuarioYCliente: vi.fn().mockResolvedValue([]),
  setPermisos: vi.fn().mockResolvedValue(undefined),
});

describe('resolverScope (WU-7.1 — matriz de permisos)', () => {
  let clienteRepo: ReturnType<typeof makeClienteRepo>;
  let membresiaRepo: ReturnType<typeof makeMembresiaRepo>;
  let permisosRepo: ReturnType<typeof makePermisosRepo>;

  beforeEach(() => {
    clienteRepo = makeClienteRepo();
    membresiaRepo = makeMembresiaRepo();
    permisosRepo = makePermisosRepo();
  });

  describe('clienteId === null (token master)', () => {
    it('root sin clienteId → token master, permisos = TODOS los pares válidos, sin leer la matriz', async () => {
      const result = await resolverScope(
        { usuarioId: 'root-1', isGlobalAdmin: true },
        null,
        membresiaRepo,
        clienteRepo,
        permisosRepo,
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual({
        clienteId: null,
        clienteNombre: null,
        rol: null,
        permisos: [...PARES_VALIDOS],
        modulos: MODULOS_DE_BYPASS,
        clienteLogoVersion: null,
      });
      expect(clienteRepo.findById).not.toHaveBeenCalled();
      expect(permisosRepo.findByUsuarioYCliente).not.toHaveBeenCalled();
    });

    it('normal sin clienteId → ClienteNoAutorizado (normal no puede pedir token master)', async () => {
      const result = await resolverScope(
        { usuarioId: 'user-1', isGlobalAdmin: false },
        null,
        membresiaRepo,
        clienteRepo,
        permisosRepo,
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
        permisosRepo,
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
        permisosRepo,
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
        permisosRepo,
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
        permisosRepo,
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ClienteNoAutorizadoError);
    });
  });

  describe('root con clienteId válido — bypass total, independiente de la membresía', () => {
    it('root CON membresía ADMINISTRADOR en ese cliente → bypass total, sin leer la matriz', async () => {
      clienteRepo.findById.mockResolvedValue(makeCliente({ nombre: 'Acme SA' }));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(
        makeMembresiaResuelta({ rolCodigo: 'ADMINISTRADOR' }),
      );

      const result = await resolverScope(
        { usuarioId: 'root-1', isGlobalAdmin: true },
        'cliente-1',
        membresiaRepo,
        clienteRepo,
        permisosRepo,
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual({
        clienteId: 'cliente-1',
        clienteNombre: 'Acme SA',
        rol: 'ADMINISTRADOR',
        permisos: [...PARES_VALIDOS],
        modulos: MODULOS_DE_BYPASS,
        clienteLogoVersion: null,
      });
      expect(permisosRepo.findByUsuarioYCliente).not.toHaveBeenCalled();
    });

    it('root CON membresía NO-ADMINISTRADOR (TECNICO) → sigue bypasseando por is_global_admin', async () => {
      clienteRepo.findById.mockResolvedValue(makeCliente({ nombre: 'Acme SA' }));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(
        makeMembresiaResuelta({ rolCodigo: 'TECNICO' }),
      );

      const result = await resolverScope(
        { usuarioId: 'root-1', isGlobalAdmin: true },
        'cliente-1',
        membresiaRepo,
        clienteRepo,
        permisosRepo,
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual({
        clienteId: 'cliente-1',
        clienteNombre: 'Acme SA',
        rol: 'TECNICO',
        permisos: [...PARES_VALIDOS],
        modulos: MODULOS_DE_BYPASS,
        clienteLogoVersion: null,
      });
      expect(permisosRepo.findByUsuarioYCliente).not.toHaveBeenCalled();
    });

    it('root SIN membresía en ese cliente → rol=null, igual bypass total (root no necesita membresía)', async () => {
      clienteRepo.findById.mockResolvedValue(makeCliente({ nombre: 'Acme SA' }));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(null);

      const result = await resolverScope(
        { usuarioId: 'root-1', isGlobalAdmin: true },
        'cliente-1',
        membresiaRepo,
        clienteRepo,
        permisosRepo,
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual({
        clienteId: 'cliente-1',
        clienteNombre: 'Acme SA',
        rol: null,
        permisos: [...PARES_VALIDOS],
        modulos: MODULOS_DE_BYPASS,
        clienteLogoVersion: null,
      });
      expect(permisosRepo.findByUsuarioYCliente).not.toHaveBeenCalled();
    });
  });

  describe('usuario normal con clienteId válido — lee la matriz', () => {
    it('CON membresía activa → lee permisosRepo, modulos derivados sin duplicados', async () => {
      clienteRepo.findById.mockResolvedValue(makeCliente({ nombre: 'Acme SA' }));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(
        makeMembresiaResuelta({ clienteNombre: 'Acme SA', rolCodigo: 'TECNICO' }),
      );
      permisosRepo.findByUsuarioYCliente.mockResolvedValue([
        'TICKETS:ALTAS',
        'TICKETS:LECTURA',
        'EQUIPOS:LECTURA',
      ]);

      const result = await resolverScope(
        { usuarioId: 'user-1', isGlobalAdmin: false },
        'cliente-1',
        membresiaRepo,
        clienteRepo,
        permisosRepo,
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual({
        clienteId: 'cliente-1',
        clienteNombre: 'Acme SA',
        rol: 'TECNICO',
        permisos: ['TICKETS:ALTAS', 'TICKETS:LECTURA', 'EQUIPOS:LECTURA'],
        modulos: ['TICKETS', 'EQUIPOS'],
        clienteLogoVersion: null,
      });
      expect(permisosRepo.findByUsuarioYCliente).toHaveBeenCalledWith('user-1', 'cliente-1');
    });

    it('usuario con 0 filas en la matriz → permisos=[], modulos=[], sin crash (S5)', async () => {
      clienteRepo.findById.mockResolvedValue(makeCliente());
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(
        makeMembresiaResuelta({ rolCodigo: 'TECNICO' }),
      );
      permisosRepo.findByUsuarioYCliente.mockResolvedValue([]);

      const result = await resolverScope(
        { usuarioId: 'user-1', isGlobalAdmin: false },
        'cliente-1',
        membresiaRepo,
        clienteRepo,
        permisosRepo,
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue().permisos).toEqual([]);
      expect(result.getValue().modulos).toEqual([]);
    });

    it('SIN membresía activa en ese cliente → ClienteNoAutorizado', async () => {
      clienteRepo.findById.mockResolvedValue(makeCliente());
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(null);

      const result = await resolverScope(
        { usuarioId: 'user-1', isGlobalAdmin: false },
        'cliente-1',
        membresiaRepo,
        clienteRepo,
        permisosRepo,
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
        permisosRepo,
      );

      expect(membresiaRepo.findActivaByUsuarioYCliente).toHaveBeenCalledWith(
        'user-42',
        'cliente-1',
      );
    });
  });

  // ─── S4: ADMINISTRADOR no cruza tenant ──────────────────────────────────
  describe('ADMINISTRADOR — bypass acotado al cliente activo (S4)', () => {
    it('ADMINISTRADOR de cliente A que hace switch a B, sin membresía ADMINISTRADOR en B → NO bypassea en B, lee la matriz de B', async () => {
      // Primer resolverScope: cliente A, membresía ADMINISTRADOR → bypass.
      clienteRepo.findById.mockResolvedValueOnce(makeCliente({ nombre: 'Cliente A' }));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValueOnce(
        makeMembresiaResuelta({ clienteId: 'cliente-A', rolCodigo: 'ADMINISTRADOR' }),
      );

      const resultadoA = await resolverScope(
        { usuarioId: 'user-1', isGlobalAdmin: false },
        'cliente-A',
        membresiaRepo,
        clienteRepo,
        permisosRepo,
      );

      expect(resultadoA.getValue().permisos).toEqual([...PARES_VALIDOS]);

      // Segundo resolverScope (switch): cliente B, membresía TECNICO (no
      // ADMINISTRADOR) → NO bypass, lee la matriz de B (0 filas: sin
      // permisos otorgados ahí todavía).
      clienteRepo.findById.mockResolvedValueOnce(makeCliente({ nombre: 'Cliente B' }));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValueOnce(
        makeMembresiaResuelta({ clienteId: 'cliente-B', rolCodigo: 'TECNICO' }),
      );
      permisosRepo.findByUsuarioYCliente.mockResolvedValueOnce([]);

      const resultadoB = await resolverScope(
        { usuarioId: 'user-1', isGlobalAdmin: false },
        'cliente-B',
        membresiaRepo,
        clienteRepo,
        permisosRepo,
      );

      expect(resultadoB.isOk()).toBe(true);
      expect(resultadoB.getValue().permisos).toEqual([]);
      expect(resultadoB.getValue().rol).toBe('TECNICO');
      expect(permisosRepo.findByUsuarioYCliente).toHaveBeenCalledWith('user-1', 'cliente-B');
    });
  });

  // ─── modulos derivados de permisos (R2, reemplaza el eje independiente) ──
  describe('modulos', () => {
    it('se derivan de permisos SIN duplicados, vía moduloDe', async () => {
      clienteRepo.findById.mockResolvedValue(makeCliente());
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(
        makeMembresiaResuelta({ rolCodigo: 'TECNICO' }),
      );
      permisosRepo.findByUsuarioYCliente.mockResolvedValue([
        'TICKETS:ALTAS',
        'TICKETS:MODIFICACION',
        'TICKETS:LECTURA',
        'KB:LECTURA',
      ] as CodigoAccion[]);

      const result = await resolverScope(
        { usuarioId: 'user-1', isGlobalAdmin: false },
        'cliente-1',
        membresiaRepo,
        clienteRepo,
        permisosRepo,
      );

      // TICKETS aparece 3 veces en permisos, una sola en modulos.
      expect(result.getValue().modulos).toEqual(['TICKETS', 'KB']);
    });

    it('token master (clienteId null, root) → los 9 módulos del catálogo, sin duplicados', async () => {
      const result = await resolverScope(
        { usuarioId: 'root-1', isGlobalAdmin: true },
        null,
        membresiaRepo,
        clienteRepo,
        permisosRepo,
      );

      expect(result.getValue().modulos).toEqual(MODULOS_DE_BYPASS);
      expect(result.getValue().modulos).toHaveLength(9);
    });
  });

  // ─── clienteLogoVersion (sdd/logo-por-cliente, WU3) ──────────────────────
  describe('clienteLogoVersion', () => {
    it('cliente sin logo (logoUpdatedAt null) → clienteLogoVersion: null', async () => {
      clienteRepo.findById.mockResolvedValue(makeCliente({ logoUpdatedAt: null }));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(makeMembresiaResuelta());

      const result = await resolverScope(
        { usuarioId: 'user-1', isGlobalAdmin: false },
        'cliente-1',
        membresiaRepo,
        clienteRepo,
        permisosRepo,
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue().clienteLogoVersion).toBeNull();
    });

    it('cliente CON logo → clienteLogoVersion es el epoch ms de logoUpdatedAt, sin queries nuevas', async () => {
      const logoUpdatedAt = new Date('2026-09-01T12:00:00.000Z');
      clienteRepo.findById.mockResolvedValue(makeCliente({ logoUpdatedAt }));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(makeMembresiaResuelta());

      const result = await resolverScope(
        { usuarioId: 'user-1', isGlobalAdmin: false },
        'cliente-1',
        membresiaRepo,
        clienteRepo,
        permisosRepo,
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue().clienteLogoVersion).toBe(logoUpdatedAt.getTime());
      // Sin queries nuevas: solo la llamada a findById ya existente (autorización).
      expect(clienteRepo.findById).toHaveBeenCalledTimes(1);
    });

    it('root con clienteId válido y logo cargado → también resuelve clienteLogoVersion (bypass no lo omite)', async () => {
      const logoUpdatedAt = new Date('2026-01-15T00:00:00.000Z');
      clienteRepo.findById.mockResolvedValue(makeCliente({ logoUpdatedAt }));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(null);

      const result = await resolverScope(
        { usuarioId: 'root-1', isGlobalAdmin: true },
        'cliente-1',
        membresiaRepo,
        clienteRepo,
        permisosRepo,
      );

      expect(result.getValue().clienteLogoVersion).toBe(logoUpdatedAt.getTime());
    });

    it('token master (clienteId null) → clienteLogoVersion: null, sin tocar clienteRepo', async () => {
      const result = await resolverScope(
        { usuarioId: 'root-1', isGlobalAdmin: true },
        null,
        membresiaRepo,
        clienteRepo,
        permisosRepo,
      );

      expect(result.getValue().clienteLogoVersion).toBeNull();
      expect(clienteRepo.findById).not.toHaveBeenCalled();
    });
  });
});
