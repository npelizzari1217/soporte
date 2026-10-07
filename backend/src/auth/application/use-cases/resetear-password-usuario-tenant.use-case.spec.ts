/**
 * WU-1 (sdd/reset-de-contrasena-por-admin) — Unit tests de
 * ResetearPasswordUsuarioTenantUseCase.
 *
 * Cubre las filas de la tabla de abuso de `design.md` que le corresponden a
 * este caso de uso, más los dos escenarios admin-a-admin/auto-reset (R4):
 * - Reset exitoso: ADMINISTRADOR en su propio cliente y ROOT en un cliente
 *   ajeno, ambos hasheando con la MISMA instancia de `IHashProvider`.
 * - Aislamiento (R2): un usuario con membresía en OTRO cliente y un
 *   `usuarioId` inexistente devuelven el MISMO `MembresiaNoEncontradaError`
 *   — no enumeran entre inquilinos.
 * - Defensa: membresía activa pero `findById` nulo (no debería pasar en
 *   producción; molde `editar-usuario-tenant.use-case.ts:60-63`).
 * - Disponibilidad (R9, ADR-5): cuenta global inactiva o soft-deleted
 *   rechaza ANTES de tocar `passwordHash`.
 * - Hash (R1): se hashea vía la instancia de `IHashProvider` inyectada,
 *   NUNCA `argon2` directo ni `verifyPassword` — blanco #1 de la mutación
 *   adversarial de `sdd-verify`.
 * - Orden persistir→revocar (R7, R8): `save` SIEMPRE antes que
 *   `revokeAllByUsuarioId`; la revocación puede fallar sin que la operación
 *   reporte fallo (ADR-4).
 * - Admin-a-admin y auto-reset (R4): el caso de uso NO agrega restricción
 *   extra — esa restricción vive en el guard de WU-2.
 * - Plaintext (R10): el argumento de `logger.error` en el camino de
 *   revocación fallida nunca lo contiene.
 */
import type { Mocked } from 'vitest';
import { ResetearPasswordUsuarioTenantUseCase } from './resetear-password-usuario-tenant.use-case';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IMembresiaRepository, MembresiaResuelta } from '../../domain/ports/i-membresia.repository';
import { IHashProvider } from '../../domain/ports/i-hash.provider';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { IDispositivoConfiableRepository } from '../../domain/ports/dispositivo-confiable-repository.port';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import {
  MembresiaNoEncontradaError,
  UsuarioNoDisponibleError,
} from '../../domain/errors/auth.errors';
import { unstubbed } from '../../../testing/mocks';

const CLIENTE_A = 'cliente-a-uuid';
const CLIENTE_B = 'cliente-b-uuid';
const USUARIO_ID = 'usuario-uuid';
const PASSWORD_NUEVA = 'ClaveNueva456';
const HASH_ACTUAL = 'stored-hash-actual';
const HASH_NUEVO = 'nuevo-hash';

const makeUsuario = (
  overrides: Partial<{ activo: boolean; deletedAt: Date | null }> = {},
): UsuarioEntity => {
  const u = UsuarioEntity.create(
    {
      email: 'destino@test.com',
      nombre: 'Juan',
      apellido: 'Perez',
      passwordHash: HASH_ACTUAL,
      activo: overrides.activo ?? true,
    },
    USUARIO_ID,
  );
  if (overrides.deletedAt) {
    (u as unknown as { _deletedAt: Date | null })._deletedAt = overrides.deletedAt;
  }
  return u;
};

const membresiaActivaEn = (clienteId: string): MembresiaResuelta => ({
  clienteId,
  clienteNombre: 'Cliente Test',
  rolCodigo: 'ADMINISTRADOR',
  clienteRequiere2fa: false,
});

const makeUsuarioRepo = (): Mocked<IUsuarioRepository> => ({
  findById: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
  // El reset busca por ID, nunca por email — un stub mudo taparía que
  // producción empiece a llamarlo.
  findByEmail: unstubbed('findByEmail'),
  create: unstubbed('create'),
});

const makeMembresiaRepo = (): Mocked<
  Pick<IMembresiaRepository, 'findActivaByUsuarioYCliente'>
> => ({
  findActivaByUsuarioYCliente: vi.fn(),
});

const makeHashProvider = (): Mocked<IHashProvider> => ({
  hash: vi.fn().mockResolvedValue(HASH_NUEVO),
  // El admin no conoce la contraseña actual (ADR-2): este caso de uso NUNCA
  // debe verificar. Un stub mudo taparía una regresión que reintrodujera
  // `verifyPassword`.
  verify: unstubbed('verify'),
});

const makeRefreshTokenRepo = (): Mocked<Pick<IRefreshTokenRepository, 'revokeAllByUsuarioId'>> => ({
  revokeAllByUsuarioId: vi.fn().mockResolvedValue(undefined),
});

const makeDispositivoRepo = (): Mocked<
  Pick<IDispositivoConfiableRepository, 'revocarTodosDe'>
> => ({
  revocarTodosDe: vi.fn().mockResolvedValue(undefined),
});

const makeLogger = (): Mocked<ILogger> => ({
  error: vi.fn(),
  // El camino feliz nunca audita por `log()` — solo degrada por `error()`.
  log: unstubbed('ILogger.log'),
});

describe('ResetearPasswordUsuarioTenantUseCase', () => {
  let usuarioRepo: Mocked<IUsuarioRepository>;
  let membresiaRepo: Mocked<Pick<IMembresiaRepository, 'findActivaByUsuarioYCliente'>>;
  let hashProvider: Mocked<IHashProvider>;
  let refreshTokenRepo: Mocked<Pick<IRefreshTokenRepository, 'revokeAllByUsuarioId'>>;
  let dispositivoRepo: Mocked<Pick<IDispositivoConfiableRepository, 'revocarTodosDe'>>;
  let logger: Mocked<ILogger>;
  let useCase: ResetearPasswordUsuarioTenantUseCase;

  beforeEach(() => {
    usuarioRepo = makeUsuarioRepo();
    membresiaRepo = makeMembresiaRepo();
    hashProvider = makeHashProvider();
    refreshTokenRepo = makeRefreshTokenRepo();
    dispositivoRepo = makeDispositivoRepo();
    logger = makeLogger();
    useCase = new ResetearPasswordUsuarioTenantUseCase(
      usuarioRepo,
      membresiaRepo,
      hashProvider,
      refreshTokenRepo,
      dispositivoRepo,
      logger,
    );
  });

  describe('Dispositivos confiables fail-closed (D5, U1, U2)', () => {
    const input = { clienteId: CLIENTE_A, usuarioId: USUARIO_ID, password: PASSWORD_NUEVA };

    beforeEach(() => {
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresiaActivaEn(CLIENTE_A));
      usuarioRepo.findById.mockResolvedValue(makeUsuario());
    });

    it('si revocarTodosDe lanza, la excepción se propaga y save nunca se llama', async () => {
      dispositivoRepo.revocarTodosDe.mockRejectedValue(new Error('boom'));

      await expect(useCase.execute(input)).rejects.toThrow('boom');

      expect(usuarioRepo.save).not.toHaveBeenCalled();
      expect(refreshTokenRepo.revokeAllByUsuarioId).not.toHaveBeenCalled();
    });

    it('revoca los dispositivos del DESTINO antes del save y luego los refresh', async () => {
      const orden: string[] = [];
      dispositivoRepo.revocarTodosDe.mockImplementation(async () => {
        orden.push('dispositivos');
      });
      usuarioRepo.save.mockImplementation(async () => {
        orden.push('save');
      });
      refreshTokenRepo.revokeAllByUsuarioId.mockImplementation(async () => {
        orden.push('refresh');
      });

      await useCase.execute(input);

      expect(orden).toEqual(['dispositivos', 'save', 'refresh']);
      expect(dispositivoRepo.revocarTodosDe).toHaveBeenCalledWith(USUARIO_ID);
    });

    it('sin membresía en el cliente: no revoca dispositivos', async () => {
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(null);

      await useCase.execute(input);

      expect(dispositivoRepo.revocarTodosDe).not.toHaveBeenCalled();
    });
  });

  describe('Reset exitoso (R1)', () => {
    it('un ADMINISTRADOR resetea a un usuario con membresía activa en su cliente', async () => {
      const usuario = makeUsuario();
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresiaActivaEn(CLIENTE_A));
      usuarioRepo.findById.mockResolvedValue(usuario);

      const result = await useCase.execute({
        clienteId: CLIENTE_A,
        usuarioId: USUARIO_ID,
        password: PASSWORD_NUEVA,
      });

      expect(result.isOk()).toBe(true);
      expect(hashProvider.hash).toHaveBeenCalledWith(PASSWORD_NUEVA);
      expect(usuario.passwordHash).toBe(HASH_NUEVO);
      expect(usuarioRepo.save).toHaveBeenCalledWith(usuario);
    });

    it('un ROOT resetea en el cliente B, fuera de su cliente de origen', async () => {
      const usuario = makeUsuario();
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresiaActivaEn(CLIENTE_B));
      usuarioRepo.findById.mockResolvedValue(usuario);

      const result = await useCase.execute({
        clienteId: CLIENTE_B,
        usuarioId: USUARIO_ID,
        password: PASSWORD_NUEVA,
      });

      expect(result.isOk()).toBe(true);
      expect(membresiaRepo.findActivaByUsuarioYCliente).toHaveBeenCalledWith(USUARIO_ID, CLIENTE_B);
      expect(hashProvider.hash).toHaveBeenCalledWith(PASSWORD_NUEVA);
      expect(usuario.passwordHash).toBe(HASH_NUEVO);
      expect(usuarioRepo.save).toHaveBeenCalledWith(usuario);
    });
  });

  describe('AISLAMIENTO: no filtra existencia entre tenants (R2)', () => {
    it('usuario con membresía activa en el cliente B recibe MembresiaNoEncontradaError desde el cliente A', async () => {
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(null);

      const result = await useCase.execute({
        clienteId: CLIENTE_A,
        usuarioId: USUARIO_ID,
        password: PASSWORD_NUEVA,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(MembresiaNoEncontradaError);
      expect(usuarioRepo.findById).not.toHaveBeenCalled();
      expect(usuarioRepo.save).not.toHaveBeenCalled();
    });

    it('usuarioId inexistente recibe el MISMO error que el caso anterior', async () => {
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(null);

      const result = await useCase.execute({
        clienteId: CLIENTE_A,
        usuarioId: 'usuario-inexistente',
        password: PASSWORD_NUEVA,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(MembresiaNoEncontradaError);
      expect(usuarioRepo.save).not.toHaveBeenCalled();
    });

    it('defensivo: membresía activa pero el usuario global no existe → el MISMO error', async () => {
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresiaActivaEn(CLIENTE_A));
      usuarioRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute({
        clienteId: CLIENTE_A,
        usuarioId: USUARIO_ID,
        password: PASSWORD_NUEVA,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(MembresiaNoEncontradaError);
      expect(usuarioRepo.save).not.toHaveBeenCalled();
      expect(hashProvider.hash).not.toHaveBeenCalled();
    });
  });

  describe('Disponibilidad de la cuenta global (R9, ADR-5)', () => {
    it('cuenta inactiva con membresía activa → UsuarioNoDisponibleError, passwordHash intacto', async () => {
      const usuario = makeUsuario({ activo: false });
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresiaActivaEn(CLIENTE_A));
      usuarioRepo.findById.mockResolvedValue(usuario);

      const result = await useCase.execute({
        clienteId: CLIENTE_A,
        usuarioId: USUARIO_ID,
        password: PASSWORD_NUEVA,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(UsuarioNoDisponibleError);
      expect(usuario.passwordHash).toBe(HASH_ACTUAL);
      expect(usuarioRepo.save).not.toHaveBeenCalled();
      expect(hashProvider.hash).not.toHaveBeenCalled();
    });

    it('cuenta soft-deleted con membresía activa → UsuarioNoDisponibleError, passwordHash intacto', async () => {
      const usuario = makeUsuario({ deletedAt: new Date() });
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresiaActivaEn(CLIENTE_A));
      usuarioRepo.findById.mockResolvedValue(usuario);

      const result = await useCase.execute({
        clienteId: CLIENTE_A,
        usuarioId: USUARIO_ID,
        password: PASSWORD_NUEVA,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(UsuarioNoDisponibleError);
      expect(usuario.passwordHash).toBe(HASH_ACTUAL);
      expect(usuarioRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('Hashing: única vía, misma instancia de IHashProvider (R1)', () => {
    it('el hash guardado sale de LA MISMA instancia de IHashProvider inyectada', async () => {
      const usuario = makeUsuario();
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresiaActivaEn(CLIENTE_A));
      usuarioRepo.findById.mockResolvedValue(usuario);

      await useCase.execute({
        clienteId: CLIENTE_A,
        usuarioId: USUARIO_ID,
        password: PASSWORD_NUEVA,
      });

      // `verify` es `unstubbed`: si el caso de uso llamara a cualquier otro
      // método de la instancia (p. ej. reintroduciendo una comparación
      // contra el hash almacenado), este test explota en vez de pasar en
      // silencio. `argon2` directo, por definición, no pasa por este mock.
      expect(hashProvider.hash).toHaveBeenCalledTimes(1);
      expect(hashProvider.hash).toHaveBeenCalledWith(PASSWORD_NUEVA);
    });
  });

  describe('Orden persistir→revocar (R7, R8)', () => {
    it('persiste el hash nuevo ANTES de revocar las sesiones (sin timers)', async () => {
      const usuario = makeUsuario();
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresiaActivaEn(CLIENTE_A));
      usuarioRepo.findById.mockResolvedValue(usuario);
      const orden: string[] = [];
      usuarioRepo.save.mockImplementation(async () => {
        orden.push('save');
      });
      refreshTokenRepo.revokeAllByUsuarioId.mockImplementation(async () => {
        orden.push('revoke');
      });

      await useCase.execute({
        clienteId: CLIENTE_A,
        usuarioId: USUARIO_ID,
        password: PASSWORD_NUEVA,
      });

      expect(orden).toEqual(['save', 'revoke']);
    });

    it('la revocación falla pero la operación igual reporta éxito', async () => {
      const usuario = makeUsuario();
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresiaActivaEn(CLIENTE_A));
      usuarioRepo.findById.mockResolvedValue(usuario);
      refreshTokenRepo.revokeAllByUsuarioId.mockRejectedValue(new Error('boom'));

      const result = await useCase.execute({
        clienteId: CLIENTE_A,
        usuarioId: USUARIO_ID,
        password: PASSWORD_NUEVA,
      });

      expect(result.isOk()).toBe(true);
      expect(usuarioRepo.save).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('Sin restricciones admin-a-admin (R4)', () => {
    it('un ADMINISTRADOR resetea a otro ADMINISTRADOR del mismo cliente', async () => {
      const usuario = makeUsuario();
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresiaActivaEn(CLIENTE_A));
      usuarioRepo.findById.mockResolvedValue(usuario);

      const result = await useCase.execute({
        clienteId: CLIENTE_A,
        usuarioId: USUARIO_ID,
        password: PASSWORD_NUEVA,
      });

      expect(result.isOk()).toBe(true);
    });

    it('un ADMINISTRADOR resetea su propia contraseña (usuarioId === actor.sub)', async () => {
      const usuario = makeUsuario();
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresiaActivaEn(CLIENTE_A));
      usuarioRepo.findById.mockResolvedValue(usuario);

      // El caso de uso no recibe el id del actor: no hay forma de que
      // distinga "es mi propio usuarioId" de cualquier otro, y no debe
      // hacerlo (esa restricción, si existiera, viviría en el guard).
      const result = await useCase.execute({
        clienteId: CLIENTE_A,
        usuarioId: USUARIO_ID,
        password: PASSWORD_NUEVA,
      });

      expect(result.isOk()).toBe(true);
    });
  });

  describe('El plaintext nunca se expone (R10)', () => {
    it('el argumento de logger.error en la revocación fallida NO contiene el plaintext', async () => {
      const usuario = makeUsuario();
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresiaActivaEn(CLIENTE_A));
      usuarioRepo.findById.mockResolvedValue(usuario);
      refreshTokenRepo.revokeAllByUsuarioId.mockRejectedValue(new Error('boom'));

      await useCase.execute({
        clienteId: CLIENTE_A,
        usuarioId: USUARIO_ID,
        password: PASSWORD_NUEVA,
      });

      expect(logger.error).toHaveBeenCalledTimes(1);
      const [mensaje] = logger.error.mock.calls[0];
      expect(mensaje).not.toContain(PASSWORD_NUEVA);
    });
  });
});
