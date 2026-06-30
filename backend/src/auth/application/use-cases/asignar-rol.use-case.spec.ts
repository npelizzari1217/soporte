/**
 * 2.B.7 TEST — Unit tests de AsignarRolUseCase y BajaUsuarioUseCase
 * (RED → GREEN con 2.B.8)
 *
 * AsignarRolUseCase:
 * - Asignación exitosa: agrega el rol al usuario y lo persiste
 * - No duplica si el rol ya está asignado → RolYaAsignadoError
 * - Retorna RolNoEncontradoError si el rol no existe
 * - Retorna UsuarioNoEncontradoError si el usuario no existe
 *
 * BajaUsuarioUseCase:
 * - activo=false en el usuario después de la baja
 * - deleted_at seteado (soft delete)
 * - revocación masiva de tokens en la misma operación
 * - Retorna UsuarioNoEncontradoError si el usuario no existe
 */
import { AsignarRolUseCase } from './asignar-rol.use-case';
import { BajaUsuarioUseCase } from './baja-usuario.use-case';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { RoleEntity } from '../../domain/entities/role.entity';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { IRoleRepository } from '../../domain/ports/i-role.repository';
import { IMasterTransactionRunner } from '../../../shared/domain/ports/i-master-transaction-runner';
import {
  UsuarioNoEncontradoError,
  RolNoEncontradoError,
  RolYaAsignadoError,
} from '../../domain/errors/auth.errors';

// ─── Factories ────────────────────────────────────────────────────────────────

const makeRole = (codigo: string, id?: string): RoleEntity =>
  RoleEntity.reconstitute(
    { codigo, nombre: codigo, descripcion: null, permisos: [] },
    id ?? `role-${codigo}`,
    new Date('2025-01-01T00:00:00Z'),
    new Date('2025-01-01T00:00:00Z'),
    null,
  );

const makeUsuario = (
  overrides: Partial<{
    id: string;
    activo: boolean;
    roles: RoleEntity[];
  }> = {},
): UsuarioEntity =>
  UsuarioEntity.create(
    {
      email: 'user@test.com',
      nombre: 'Juan',
      apellido: 'Perez',
      passwordHash: 'hash',
      clienteId: 'cliente-uuid',
      activo: overrides.activo ?? true,
      roles: overrides.roles ?? [],
    },
    overrides.id,
  );

// ─── Mocks de puertos ────────────────────────────────────────────────────────

const makeUsuarioRepo = (): vi.Mocked<IUsuarioRepository> => ({
  findByEmail: vi.fn(),
  findById: vi.fn(),
  findByClienteId: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
});

const makeRoleRepo = (): vi.Mocked<IRoleRepository> => ({
  findByCodigo: vi.fn(),
  findWithPermisos: vi.fn(),
});

const makeRefreshTokenRepo = (): vi.Mocked<IRefreshTokenRepository> => ({
  findByHash: vi.fn(),
  revokeAllByUsuarioId: vi.fn().mockResolvedValue(undefined),
  save: vi.fn().mockResolvedValue(undefined),
});

/**
 * Mock del MasterTransactionRunner: pasa-a-través (pass-through).
 * Para tests unitarios, la transacción es transparente: simplemente llama fn().
 * El comportamiento transaccional real se testea en integration tests de infra.
 */
const makeMasterTxRunner = (): vi.Mocked<IMasterTransactionRunner> => ({
  run: vi.fn().mockImplementation(async (fn: () => Promise<unknown>) => fn()),
});

// ─── AsignarRolUseCase tests ──────────────────────────────────────────────────

describe('AsignarRolUseCase', () => {
  let usuarioRepo: vi.Mocked<IUsuarioRepository>;
  let roleRepo: vi.Mocked<IRoleRepository>;
  let useCase: AsignarRolUseCase;

  beforeEach(() => {
    usuarioRepo = makeUsuarioRepo();
    roleRepo = makeRoleRepo();
    useCase = new AsignarRolUseCase(usuarioRepo, roleRepo);
  });

  describe('Asignación exitosa', () => {
    it('retorna ok cuando se asigna el rol', async () => {
      const usuario = makeUsuario({ id: 'user-1', roles: [] });
      const rol = makeRole('SOPORTE_IT', 'role-1');
      usuarioRepo.findById.mockResolvedValue(usuario);
      roleRepo.findByCodigo.mockResolvedValue(rol);

      const result = await useCase.execute({ usuarioId: 'user-1', rolCodigo: 'SOPORTE_IT' });

      expect(result.isOk()).toBe(true);
    });

    it('agrega el rol a la lista de roles del usuario antes de persistir', async () => {
      const usuario = makeUsuario({ id: 'user-1', roles: [] });
      const rol = makeRole('SOPORTE_IT', 'role-1');
      usuarioRepo.findById.mockResolvedValue(usuario);
      roleRepo.findByCodigo.mockResolvedValue(rol);

      let savedUsuario: UsuarioEntity | undefined;
      usuarioRepo.save.mockImplementation(async (u) => {
        savedUsuario = u;
      });

      await useCase.execute({ usuarioId: 'user-1', rolCodigo: 'SOPORTE_IT' });

      expect(savedUsuario!.roles).toHaveLength(1);
      expect(savedUsuario!.roles[0].codigo).toBe('SOPORTE_IT');
    });

    it('persiste el usuario con el nuevo rol via repo.save', async () => {
      usuarioRepo.findById.mockResolvedValue(makeUsuario());
      roleRepo.findByCodigo.mockResolvedValue(makeRole('ADMIN'));

      await useCase.execute({ usuarioId: 'any', rolCodigo: 'ADMIN' });

      expect(usuarioRepo.save).toHaveBeenCalledTimes(1);
    });

    it('busca el rol por codigo exacto', async () => {
      usuarioRepo.findById.mockResolvedValue(makeUsuario());
      roleRepo.findByCodigo.mockResolvedValue(makeRole('APROBADOR_COMPRAS'));

      await useCase.execute({ usuarioId: 'any', rolCodigo: 'APROBADOR_COMPRAS' });

      expect(roleRepo.findByCodigo).toHaveBeenCalledWith('APROBADOR_COMPRAS');
    });
  });

  describe('Rol ya asignado → 409', () => {
    it('retorna RolYaAsignadoError si el usuario ya tiene el rol', async () => {
      const rolExistente = makeRole('SOPORTE_IT', 'role-soporte');
      const usuario = makeUsuario({ roles: [rolExistente] });
      usuarioRepo.findById.mockResolvedValue(usuario);
      roleRepo.findByCodigo.mockResolvedValue(makeRole('SOPORTE_IT', 'role-soporte'));

      const result = await useCase.execute({ usuarioId: 'any', rolCodigo: 'SOPORTE_IT' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(RolYaAsignadoError);
    });

    it('NO persiste si el rol ya está asignado', async () => {
      const rolExistente = makeRole('SOPORTE_IT', 'role-soporte');
      const usuario = makeUsuario({ roles: [rolExistente] });
      usuarioRepo.findById.mockResolvedValue(usuario);
      roleRepo.findByCodigo.mockResolvedValue(makeRole('SOPORTE_IT', 'role-soporte'));

      await useCase.execute({ usuarioId: 'any', rolCodigo: 'SOPORTE_IT' });

      expect(usuarioRepo.save).not.toHaveBeenCalled();
    });

    it('permite asignar otro rol distinto al que ya tiene', async () => {
      const rolExistente = makeRole('SOPORTE_IT', 'role-soporte');
      const usuario = makeUsuario({ roles: [rolExistente] });
      usuarioRepo.findById.mockResolvedValue(usuario);
      roleRepo.findByCodigo.mockResolvedValue(makeRole('ADMIN', 'role-admin'));

      const result = await useCase.execute({ usuarioId: 'any', rolCodigo: 'ADMIN' });

      expect(result.isOk()).toBe(true);
    });
  });

  describe('Rol no encontrado → 404', () => {
    it('retorna RolNoEncontradoError si el rol no existe', async () => {
      usuarioRepo.findById.mockResolvedValue(makeUsuario());
      roleRepo.findByCodigo.mockResolvedValue(null);

      const result = await useCase.execute({ usuarioId: 'any', rolCodigo: 'ROL_INEXISTENTE' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(RolNoEncontradoError);
    });
  });

  describe('Usuario no encontrado → 404', () => {
    it('retorna UsuarioNoEncontradoError si el usuario no existe', async () => {
      usuarioRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute({ usuarioId: 'nonexistent', rolCodigo: 'ADMIN' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(UsuarioNoEncontradoError);
    });
  });
});

// ─── BajaUsuarioUseCase tests ─────────────────────────────────────────────────

describe('BajaUsuarioUseCase', () => {
  let usuarioRepo: vi.Mocked<IUsuarioRepository>;
  let refreshTokenRepo: vi.Mocked<IRefreshTokenRepository>;
  let masterTxRunner: vi.Mocked<IMasterTransactionRunner>;
  let useCase: BajaUsuarioUseCase;

  beforeEach(() => {
    usuarioRepo = makeUsuarioRepo();
    refreshTokenRepo = makeRefreshTokenRepo();
    masterTxRunner = makeMasterTxRunner();
    useCase = new BajaUsuarioUseCase(usuarioRepo, refreshTokenRepo, masterTxRunner);
  });

  // T3.6: BajaUsuarioDto ahora requiere requesterId y clienteId para cross-tenant y self-baja.
  // makeUsuario usa clienteId: 'cliente-uuid'. Los tests pasan un requesterId diferente al
  // usuarioId y el clienteId correcto para que los nuevos guards no bloqueen el flujo.
  const makeDto = (usuarioId: string) => ({
    usuarioId,
    requesterId: 'admin-requester-uuid', // diferente al usuarioId → no self-baja
    clienteId: 'cliente-uuid',           // igual al clienteId de makeUsuario → no cross-tenant
  });

  describe('Baja exitosa', () => {
    it('retorna ok cuando el usuario existe', async () => {
      const usuario = makeUsuario({ id: 'user-to-delete' });
      usuarioRepo.findById.mockResolvedValue(usuario);

      const result = await useCase.execute(makeDto('user-to-delete'));

      expect(result.isOk()).toBe(true);
    });

    it('setea activo=false en el usuario', async () => {
      const usuario = makeUsuario({ id: 'user-to-delete', activo: true });
      usuarioRepo.findById.mockResolvedValue(usuario);

      let savedUsuario: UsuarioEntity | undefined;
      usuarioRepo.save.mockImplementation(async (u) => {
        savedUsuario = u;
      });

      await useCase.execute(makeDto('user-to-delete'));

      expect(savedUsuario!.activo).toBe(false);
    });

    it('setea deleted_at (soft delete) en el usuario', async () => {
      const usuario = makeUsuario({ id: 'user-to-delete' });
      usuarioRepo.findById.mockResolvedValue(usuario);

      let savedUsuario: UsuarioEntity | undefined;
      usuarioRepo.save.mockImplementation(async (u) => {
        savedUsuario = u;
      });

      await useCase.execute(makeDto('user-to-delete'));

      expect(savedUsuario!.deletedAt).not.toBeNull();
      expect(savedUsuario!.isDeleted()).toBe(true);
    });

    it('revoca masivamente todos los tokens del usuario en la misma operación', async () => {
      const usuario = makeUsuario({ id: 'user-to-delete' });
      usuarioRepo.findById.mockResolvedValue(usuario);

      await useCase.execute(makeDto('user-to-delete'));

      expect(refreshTokenRepo.revokeAllByUsuarioId).toHaveBeenCalledWith('user-to-delete');
    });

    it('persiste el usuario modificado vía repo.save', async () => {
      const usuario = makeUsuario({ id: 'user-to-delete' });
      usuarioRepo.findById.mockResolvedValue(usuario);

      await useCase.execute(makeDto('user-to-delete'));

      expect(usuarioRepo.save).toHaveBeenCalledTimes(1);
    });

    it('la revocación de tokens y el save del usuario se llaman ambos', async () => {
      const usuario = makeUsuario({ id: 'user-to-delete' });
      usuarioRepo.findById.mockResolvedValue(usuario);

      await useCase.execute(makeDto('user-to-delete'));

      expect(refreshTokenRepo.revokeAllByUsuarioId).toHaveBeenCalledTimes(1);
      expect(usuarioRepo.save).toHaveBeenCalledTimes(1);
    });

    it('ejecuta save() y revokeAll() dentro del MasterTransactionRunner (atomicidad master)', async () => {
      // W2 — ambas escrituras MASTER deben ejecutarse dentro de la transacción
      // para garantizar atomicidad. Si revokeAll falla, el save se revierte.
      const usuario = makeUsuario({ id: 'user-to-delete' });
      usuarioRepo.findById.mockResolvedValue(usuario);

      await useCase.execute(makeDto('user-to-delete'));

      expect(masterTxRunner.run).toHaveBeenCalledTimes(1);
    });

    it('save() se llama ANTES de revokeAllByUsuarioId() (consistencia ante fallo parcial)', async () => {
      const usuario = makeUsuario({ id: 'user-to-delete' });
      usuarioRepo.findById.mockResolvedValue(usuario);

      const callOrder: string[] = [];
      usuarioRepo.save.mockImplementation(async () => {
        callOrder.push('save');
      });
      refreshTokenRepo.revokeAllByUsuarioId.mockImplementation(async () => {
        callOrder.push('revokeAll');
      });

      await useCase.execute(makeDto('user-to-delete'));

      expect(callOrder).toEqual(['save', 'revokeAll']);
    });
  });

  describe('Usuario no encontrado → 404', () => {
    it('retorna UsuarioNoEncontradoError si el usuario no existe', async () => {
      usuarioRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute(makeDto('nonexistent'));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(UsuarioNoEncontradoError);
    });

    it('NO llama a revokeAllByUsuarioId si el usuario no existe', async () => {
      usuarioRepo.findById.mockResolvedValue(null);

      await useCase.execute(makeDto('nonexistent'));

      expect(refreshTokenRepo.revokeAllByUsuarioId).not.toHaveBeenCalled();
    });
  });
});
