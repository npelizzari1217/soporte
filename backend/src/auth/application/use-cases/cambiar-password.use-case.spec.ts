/**
 * WU1 (sdd/cambio-de-contrasena) TEST — Unit tests de CambiarPasswordUseCase
 * (RED → GREEN con 1.10).
 *
 * Cubre el flujo estricto D1–D6 (ver design #2408 y reconciliación #2409):
 * - Cambio exitoso: la nueva contraseña queda vigente (hash actualizado y
 *   persistido).
 * - Contraseña actual incorrecta: falla Y `password_hash` no se toca (doble
 *   asserto — sin el segundo, el test pasaría aunque el caso de uso cambiara
 *   la clave sin verificar nada).
 * - Nueva igual a actual: rechazo ANTES de hashear, comparando PLAINTEXT
 *   (D2) — nunca comparando hashes (Argon2 saltea).
 * - Orden persistir→revocar: `save` SIEMPRE antes que `revokeAllByUsuarioId`
 *   (si el orden se invirtiera, un fallo de escritura dejaría al usuario
 *   deslogueado con la clave vieja).
 * - Revocación falla pero el cambio persiste: el endpoint no le miente al
 *   usuario sobre el estado de su credencial.
 * - Usuario inexistente o inactivo → `UsuarioNoDisponibleError` (403), NUNCA
 *   `CredencialesInvalidasError` (401) — el usuario ya está autenticado, el
 *   anti-enumeración de login no aplica acá (D3).
 */
import type { Mocked } from 'vitest';
import { CambiarPasswordUseCase } from './cambiar-password.use-case';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IHashProvider } from '../../domain/ports/i-hash.provider';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import {
  UsuarioNoDisponibleError,
  PasswordActualIncorrectaError,
  PasswordNuevaIgualAActualError,
  CredencialesInvalidasError,
} from '../../domain/errors/auth.errors';
import { unstubbed } from '../../../testing/mocks';

const USUARIO_ID = 'usuario-uuid';
const PASSWORD_ACTUAL = 'ClaveVieja123';
const PASSWORD_NUEVA = 'ClaveNueva456';
const HASH_ACTUAL = 'stored-hash-actual';

const makeUsuario = (
  overrides: Partial<{ activo: boolean; deletedAt: Date | null }> = {},
): UsuarioEntity => {
  const u = UsuarioEntity.create({
    email: 'usuario@test.com',
    nombre: 'Juan',
    apellido: 'Perez',
    passwordHash: HASH_ACTUAL,
    activo: overrides.activo ?? true,
  });
  if (overrides.deletedAt) {
    (u as unknown as { _deletedAt: Date | null })._deletedAt = overrides.deletedAt;
  }
  return u;
};

const makeUsuarioRepo = (): Mocked<IUsuarioRepository> => ({
  findById: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
  // CambiarPasswordUseCase busca por ID, nunca por email — un stub mudo
  // taparía que producción empiece a llamarlo.
  findByEmail: unstubbed('findByEmail'),
  create: unstubbed('create'),
});

const makeHashProvider = (): Mocked<IHashProvider> => ({
  verify: vi.fn().mockResolvedValue(true),
  hash: vi.fn().mockResolvedValue('nuevo-hash'),
});

const makeRefreshTokenRepo = (): Mocked<IRefreshTokenRepository> => ({
  revokeAllByUsuarioId: vi.fn().mockResolvedValue(undefined),
  // CambiarPasswordUseCase no busca ni persiste tokens individuales, solo
  // revoca en bloque.
  findByHash: unstubbed('findByHash'),
  save: unstubbed('save'),
});

const makeLogger = (): Mocked<ILogger> => ({
  error: vi.fn(),
  // El camino feliz nunca audita por `log()` — solo degrada por `error()`.
  log: unstubbed('ILogger.log'),
});

describe('CambiarPasswordUseCase', () => {
  let usuarioRepo: Mocked<IUsuarioRepository>;
  let hashProvider: Mocked<IHashProvider>;
  let refreshTokenRepo: Mocked<IRefreshTokenRepository>;
  let logger: Mocked<ILogger>;
  let useCase: CambiarPasswordUseCase;

  beforeEach(() => {
    usuarioRepo = makeUsuarioRepo();
    hashProvider = makeHashProvider();
    refreshTokenRepo = makeRefreshTokenRepo();
    logger = makeLogger();
    useCase = new CambiarPasswordUseCase(usuarioRepo, hashProvider, refreshTokenRepo, logger);
  });

  describe('Cambio exitoso', () => {
    it('la nueva contraseña queda vigente: hashea, actualiza el hash del usuario y persiste', async () => {
      const usuario = makeUsuario();
      usuarioRepo.findById.mockResolvedValue(usuario);

      const result = await useCase.execute({
        usuarioId: USUARIO_ID,
        passwordActual: PASSWORD_ACTUAL,
        passwordNueva: PASSWORD_NUEVA,
      });

      expect(result.isOk()).toBe(true);
      expect(hashProvider.hash).toHaveBeenCalledWith(PASSWORD_NUEVA);
      expect(usuario.passwordHash).toBe('nuevo-hash');
      expect(usuarioRepo.save).toHaveBeenCalledWith(usuario);
    });
  });

  describe('Contraseña actual incorrecta', () => {
    it('falla con PasswordActualIncorrectaError Y NO toca password_hash (doble asserto)', async () => {
      const usuario = makeUsuario();
      usuarioRepo.findById.mockResolvedValue(usuario);
      hashProvider.verify.mockResolvedValue(false);

      const result = await useCase.execute({
        usuarioId: USUARIO_ID,
        passwordActual: 'otra-clave',
        passwordNueva: PASSWORD_NUEVA,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PasswordActualIncorrectaError);
      expect(usuarioRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('Nueva igual a la actual', () => {
    it('rechaza ANTES de hashear, comparando plaintext', async () => {
      const usuario = makeUsuario();
      usuarioRepo.findById.mockResolvedValue(usuario);

      const result = await useCase.execute({
        usuarioId: USUARIO_ID,
        passwordActual: PASSWORD_ACTUAL,
        passwordNueva: PASSWORD_ACTUAL,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PasswordNuevaIgualAActualError);
      expect(hashProvider.hash).not.toHaveBeenCalled();
      expect(usuarioRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('Orden persistir→revocar', () => {
    it('persiste el hash nuevo ANTES de revocar las sesiones (sin timers)', async () => {
      const usuario = makeUsuario();
      usuarioRepo.findById.mockResolvedValue(usuario);
      const orden: string[] = [];
      usuarioRepo.save.mockImplementation(async () => {
        orden.push('save');
      });
      refreshTokenRepo.revokeAllByUsuarioId.mockImplementation(async () => {
        orden.push('revoke');
      });

      await useCase.execute({
        usuarioId: USUARIO_ID,
        passwordActual: PASSWORD_ACTUAL,
        passwordNueva: PASSWORD_NUEVA,
      });

      expect(orden).toEqual(['save', 'revoke']);
    });
  });

  describe('La revocación falla pero el cambio persiste', () => {
    it('retorna ok, save se llamó 1 vez y logger.error se llamó 1 vez', async () => {
      const usuario = makeUsuario();
      usuarioRepo.findById.mockResolvedValue(usuario);
      refreshTokenRepo.revokeAllByUsuarioId.mockRejectedValue(new Error('boom'));

      const result = await useCase.execute({
        usuarioId: USUARIO_ID,
        passwordActual: PASSWORD_ACTUAL,
        passwordNueva: PASSWORD_NUEVA,
      });

      expect(result.isOk()).toBe(true);
      expect(usuarioRepo.save).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('Usuario no disponible', () => {
    it('usuario inexistente → UsuarioNoDisponibleError, NUNCA CredencialesInvalidasError', async () => {
      usuarioRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute({
        usuarioId: USUARIO_ID,
        passwordActual: PASSWORD_ACTUAL,
        passwordNueva: PASSWORD_NUEVA,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(UsuarioNoDisponibleError);
      expect(result.getError()).not.toBeInstanceOf(CredencialesInvalidasError);
      expect(hashProvider.verify).not.toHaveBeenCalled();
    });

    it('usuario inactivo → UsuarioNoDisponibleError', async () => {
      usuarioRepo.findById.mockResolvedValue(makeUsuario({ activo: false }));

      const result = await useCase.execute({
        usuarioId: USUARIO_ID,
        passwordActual: PASSWORD_ACTUAL,
        passwordNueva: PASSWORD_NUEVA,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(UsuarioNoDisponibleError);
      expect(hashProvider.verify).not.toHaveBeenCalled();
    });
  });
});
