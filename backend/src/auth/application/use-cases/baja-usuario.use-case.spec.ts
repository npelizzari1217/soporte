/**
 * T3.6 — Unit tests para BajaUsuarioUseCase (auditoría + extensión para spec PR3).
 *
 * Escenarios verificados (spec ref: clientes-tenancy/PATCH /usuarios/:id/baja):
 * - Soft-delete: activo=false + deleted_at=now()
 * - Revoca TODOS los refresh tokens del usuario
 * - Rechaza si usuario de otro tenant → UsuarioNoEncontradoError (404)
 * - Rechaza si usuarioId === requesterId → AutoBajaProhibidaError (422)
 * - Idempotente: si ya tiene deleted_at IS NOT NULL → retorna OK sin re-ejecutar
 * - Las tres operaciones en una sola transacción (mock transacción)
 * - Usuario no encontrado → UsuarioNoEncontradoError
 *
 * Tarea: T3.6
 */

import { BajaUsuarioUseCase, type BajaUsuarioDto } from './baja-usuario.use-case';
import {
  UsuarioNoEncontradoError,
  AutoBajaProhibidaError,
} from '../../domain/errors/auth.errors';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeUsuario(
  id: string,
  clienteId: string,
  alreadyDeleted = false,
): UsuarioEntity {
  const entity = UsuarioEntity.create(
    {
      email: `user-${id}@test.com`,
      nombre: 'Test',
      apellido: 'User',
      passwordHash: 'hashed',
      clienteId,
      activo: true,
      isGlobalAdmin: false,
      roles: [],
    },
    id,
  );
  if (alreadyDeleted) {
    entity.softDelete(new Date('2026-01-01'));
  }
  return entity;
}

function makeUsuarioRepo() {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    findByClienteId: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };
}

function makeRefreshTokenRepo() {
  return {
    revokeAllByUsuarioId: vi.fn().mockResolvedValue(undefined),
    findByToken: vi.fn(),
    save: vi.fn(),
    deleteExpired: vi.fn(),
  };
}

function makeMasterTxRunner() {
  return {
    run: vi.fn().mockImplementation((fn: () => Promise<void>) => fn()),
  };
}

function makeDto(overrides?: Partial<BajaUsuarioDto>): BajaUsuarioDto {
  return {
    usuarioId: 'target-user-uuid',
    requesterId: 'requester-uuid',
    clienteId: 'tenant-a-uuid',
    ...overrides,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('BajaUsuarioUseCase (T3.6)', () => {
  let usuarioRepo: ReturnType<typeof makeUsuarioRepo>;
  let refreshTokenRepo: ReturnType<typeof makeRefreshTokenRepo>;
  let masterTxRunner: ReturnType<typeof makeMasterTxRunner>;
  let useCase: BajaUsuarioUseCase;

  beforeEach(() => {
    usuarioRepo = makeUsuarioRepo();
    refreshTokenRepo = makeRefreshTokenRepo();
    masterTxRunner = makeMasterTxRunner();
    useCase = new BajaUsuarioUseCase(
      usuarioRepo as any,
      refreshTokenRepo as any,
      masterTxRunner as any,
    );
  });

  // ─── Self-baja ────────────────────────────────────────────────────────────

  describe('self-baja', () => {
    it('usuarioId === requesterId → AutoBajaProhibidaError (422)', async () => {
      const result = await useCase.execute(
        makeDto({ usuarioId: 'same-uuid', requesterId: 'same-uuid' }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(AutoBajaProhibidaError);
    });

    it('self-baja → NO consulta la DB (early return)', async () => {
      await useCase.execute(makeDto({ usuarioId: 'same', requesterId: 'same' }));

      expect(usuarioRepo.findById).not.toHaveBeenCalled();
    });
  });

  // ─── Usuario no encontrado ────────────────────────────────────────────────

  describe('usuario no encontrado', () => {
    it('usuario no existe → UsuarioNoEncontradoError', async () => {
      usuarioRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute(makeDto());

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(UsuarioNoEncontradoError);
    });
  });

  // ─── Cross-tenant ─────────────────────────────────────────────────────────

  describe('cross-tenant', () => {
    it('usuario de otro tenant → UsuarioNoEncontradoError (aislamiento seguro, no info leakage)', async () => {
      const usuarioOtroTenant = makeUsuario('target-user-uuid', 'tenant-b-uuid');
      usuarioRepo.findById.mockResolvedValue(usuarioOtroTenant);

      const result = await useCase.execute(
        makeDto({ clienteId: 'tenant-a-uuid' }), // requester es de tenant-a
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(UsuarioNoEncontradoError);
    });

    it('cross-tenant → NO modifica datos del usuario de otro tenant', async () => {
      const usuarioOtroTenant = makeUsuario('target-user-uuid', 'tenant-b-uuid');
      usuarioRepo.findById.mockResolvedValue(usuarioOtroTenant);

      await useCase.execute(makeDto({ clienteId: 'tenant-a-uuid' }));

      expect(usuarioRepo.save).not.toHaveBeenCalled();
      expect(refreshTokenRepo.revokeAllByUsuarioId).not.toHaveBeenCalled();
    });
  });

  // ─── Idempotencia ─────────────────────────────────────────────────────────

  describe('idempotencia', () => {
    it('usuario ya dado de baja → retorna OK sin re-ejecutar', async () => {
      const usuarioYaBajado = makeUsuario('target-user-uuid', 'tenant-a-uuid', true);
      usuarioRepo.findById.mockResolvedValue(usuarioYaBajado);

      const result = await useCase.execute(makeDto());

      expect(result.isOk()).toBe(true);
    });

    it('usuario ya dado de baja → NO vuelve a llamar save ni revokeAll', async () => {
      const usuarioYaBajado = makeUsuario('target-user-uuid', 'tenant-a-uuid', true);
      usuarioRepo.findById.mockResolvedValue(usuarioYaBajado);

      await useCase.execute(makeDto());

      expect(usuarioRepo.save).not.toHaveBeenCalled();
      expect(refreshTokenRepo.revokeAllByUsuarioId).not.toHaveBeenCalled();
    });
  });

  // ─── Flujo exitoso ───────────────────────────────────────────────────────

  describe('baja exitosa', () => {
    it('soft-delete: usuario queda inactivo con deleted_at seteado', async () => {
      const usuario = makeUsuario('target-user-uuid', 'tenant-a-uuid');
      usuarioRepo.findById.mockResolvedValue(usuario);

      const result = await useCase.execute(makeDto());

      expect(result.isOk()).toBe(true);
      expect(usuario.activo).toBe(false);
      expect(usuario.deletedAt).not.toBeNull();
    });

    it('revoca todos los refresh tokens del usuario', async () => {
      const usuario = makeUsuario('target-user-uuid', 'tenant-a-uuid');
      usuarioRepo.findById.mockResolvedValue(usuario);

      await useCase.execute(makeDto());

      expect(refreshTokenRepo.revokeAllByUsuarioId).toHaveBeenCalledWith('target-user-uuid');
    });

    it('save y revokeAll dentro de la misma transacción', async () => {
      const usuario = makeUsuario('target-user-uuid', 'tenant-a-uuid');
      usuarioRepo.findById.mockResolvedValue(usuario);

      await useCase.execute(makeDto());

      expect(masterTxRunner.run).toHaveBeenCalledTimes(1);
      expect(usuarioRepo.save).toHaveBeenCalledTimes(1);
      expect(refreshTokenRepo.revokeAllByUsuarioId).toHaveBeenCalledTimes(1);
    });

    it('retorna Result.ok(void) en caso de éxito', async () => {
      const usuario = makeUsuario('target-user-uuid', 'tenant-a-uuid');
      usuarioRepo.findById.mockResolvedValue(usuario);

      const result = await useCase.execute(makeDto());

      expect(result.isOk()).toBe(true);
    });
  });
});
