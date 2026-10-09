/**
 * WU-6 TEST — Unit tests de ConfirmarResetPasswordUseCase (ADR-5).
 *
 * Abuso cubierto (Superficie de abuso del design): el CAS pierde bajo
 * concurrencia y la contraseña NO se persiste; la revocación propaga su
 * fallo; `usuarioId`/`clienteId` salen únicamente del token, nunca de un
 * parámetro externo (la firma de `ejecutar` no los acepta); ningún log
 * lleva el token crudo ni el plaintext.
 */
import type { Mocked } from 'vitest';
import * as crypto from 'crypto';
import { ConfirmarResetPasswordUseCase } from './confirmar-reset-password.use-case';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { PasswordResetTokenEntity } from '../../domain/entities/password-reset-token.entity';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IHashProvider } from '../../domain/ports/i-hash.provider';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { IPasswordResetTokenRepository } from '../../domain/ports/i-password-reset-token.repository';
import { IDispositivoConfiableRepository } from '../../domain/ports/dispositivo-confiable-repository.port';
import { ICorreoDeCliente } from '../../domain/ports/i-correo-de-cliente.port';
import { ITareasSegundoPlano } from '../../../shared/domain/ports/i-tareas-segundo-plano.port';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { ResetLinkInvalidoError } from '../../domain/errors/recuperacion-password.errors';
import { unstubbed } from '../../../testing/mocks';

const TOKEN_CRUDO = 'a'.repeat(64);
const TOKEN_HASH = crypto.createHash('sha256').update(TOKEN_CRUDO).digest('hex');
const PASSWORD_NUEVA = 'ClaveNueva456';
const USUARIO_ID = 'usuario-uuid';
const CLIENTE_ID = 'cliente-uuid';

const makeUsuario = (activo = true): UsuarioEntity =>
  UsuarioEntity.create(
    {
      email: 'usuario@test.com',
      nombre: 'Juan',
      apellido: 'Perez',
      passwordHash: 'hash-existente',
      activo,
    },
    USUARIO_ID,
  );

/**
 * [S1] `activo=true` pero soft-deleted (`deletedAt` seteado): `suspend()`
 * siempre pone los dos juntos, así que hace falta `reconstitute()` para
 * armar la combinación que el guard `isDeleted()` cubre de forma defensiva.
 */
const makeUsuarioSoftDeletedActivo = (): UsuarioEntity =>
  UsuarioEntity.reconstitute(
    {
      email: 'usuario@test.com',
      nombre: 'Juan',
      apellido: 'Perez',
      passwordHash: 'hash-existente',
      activo: true,
    },
    USUARIO_ID,
    new Date(),
    new Date(),
    new Date(),
  );

const makeToken = (
  overrides: Partial<{ usedAt: Date | null; revokedAt: Date | null; expiresAt: Date }> = {},
): PasswordResetTokenEntity =>
  PasswordResetTokenEntity.create({
    usuarioId: USUARIO_ID,
    clienteId: CLIENTE_ID,
    tokenHash: TOKEN_HASH,
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
    usedAt: overrides.usedAt ?? null,
    revokedAt: overrides.revokedAt ?? null,
  });

const makeTokenRepo = (): Mocked<IPasswordResetTokenRepository> => ({
  findByHash: vi.fn(),
  consumirSiVigente: vi.fn().mockResolvedValue(true),
  save: unstubbed('save'),
  revocarVigentesDeUsuario: unstubbed('revocarVigentesDeUsuario'),
});

const makeUsuarioRepo = (): Mocked<IUsuarioRepository> => ({
  findById: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
  findByEmail: unstubbed('findByEmail'),
  findManyByEmailInsensitive: unstubbed('findManyByEmailInsensitive'),
  create: unstubbed('create'),
});

const makeHashProvider = (): Mocked<IHashProvider> => ({
  hash: vi.fn().mockResolvedValue('nuevo-hash'),
  verify: unstubbed('verify'),
});

const makeRefreshTokenRepo = (): Mocked<IRefreshTokenRepository> => ({
  revokeAllByUsuarioId: vi.fn().mockResolvedValue(undefined),
  findByHash: unstubbed('findByHash'),
  save: unstubbed('save'),
});

const makeDispositivoRepo = (): Mocked<
  Pick<IDispositivoConfiableRepository, 'revocarTodosDe'>
> => ({
  revocarTodosDe: vi.fn().mockResolvedValue(undefined),
});

const makeCorreoDeCliente = (): Mocked<ICorreoDeCliente> => ({
  estado: vi.fn().mockResolvedValue('LISTO'),
  enviar: vi.fn().mockResolvedValue(undefined),
});

const makeTareas = (): Mocked<ITareasSegundoPlano> => ({ lanzar: vi.fn() });

const makeLogger = (): Mocked<ILogger> => ({ log: unstubbed('log'), error: vi.fn() });

describe('ConfirmarResetPasswordUseCase', () => {
  let tokenRepo: Mocked<IPasswordResetTokenRepository>;
  let usuarioRepo: Mocked<IUsuarioRepository>;
  let hashProvider: Mocked<IHashProvider>;
  let refreshTokenRepo: Mocked<IRefreshTokenRepository>;
  let dispositivoRepo: Mocked<Pick<IDispositivoConfiableRepository, 'revocarTodosDe'>>;
  let correoDeCliente: Mocked<ICorreoDeCliente>;
  let tareas: Mocked<ITareasSegundoPlano>;
  let logger: Mocked<ILogger>;
  let useCase: ConfirmarResetPasswordUseCase;

  beforeEach(() => {
    tokenRepo = makeTokenRepo();
    usuarioRepo = makeUsuarioRepo();
    hashProvider = makeHashProvider();
    refreshTokenRepo = makeRefreshTokenRepo();
    dispositivoRepo = makeDispositivoRepo();
    correoDeCliente = makeCorreoDeCliente();
    tareas = makeTareas();
    logger = makeLogger();
    useCase = new ConfirmarResetPasswordUseCase(
      tokenRepo,
      usuarioRepo,
      hashProvider,
      refreshTokenRepo,
      dispositivoRepo,
      correoDeCliente,
      tareas,
      logger,
    );
  });

  describe('Dispositivos confiables fail-closed (D5, O1, O2)', () => {
    it('si revocarTodosDe lanza: propaga, y ni el CAS ni save corren (el token sigue vigente)', async () => {
      const token = makeToken();
      tokenRepo.findByHash.mockResolvedValue(token);
      usuarioRepo.findById.mockResolvedValue(makeUsuario());
      dispositivoRepo.revocarTodosDe.mockRejectedValue(new Error('boom'));

      await expect(useCase.ejecutar(TOKEN_CRUDO, PASSWORD_NUEVA)).rejects.toThrow('boom');

      expect(tokenRepo.consumirSiVigente).not.toHaveBeenCalled();
      expect(usuarioRepo.save).not.toHaveBeenCalled();
      expect(refreshTokenRepo.revokeAllByUsuarioId).not.toHaveBeenCalled();
      expect(tareas.lanzar).not.toHaveBeenCalled();
    });

    it('orden: hash en memoria → revocar dispositivos → CAS del token → save', async () => {
      const usuario = makeUsuario();
      tokenRepo.findByHash.mockResolvedValue(makeToken());
      usuarioRepo.findById.mockResolvedValue(usuario);
      const orden: string[] = [];
      hashProvider.hash.mockImplementation(async () => {
        orden.push('hash');
        return 'nuevo-hash';
      });
      dispositivoRepo.revocarTodosDe.mockImplementation(async () => {
        orden.push('dispositivos');
      });
      tokenRepo.consumirSiVigente.mockImplementation(async () => {
        orden.push('cas');
        return true;
      });
      usuarioRepo.save.mockImplementation(async () => {
        orden.push('save');
      });

      await useCase.ejecutar(TOKEN_CRUDO, PASSWORD_NUEVA);

      expect(orden).toEqual(['hash', 'dispositivos', 'cas', 'save']);
      expect(dispositivoRepo.revocarTodosDe).toHaveBeenCalledWith(usuario.id);
    });

    it('token inválido o cuenta no disponible: no revoca dispositivos', async () => {
      tokenRepo.findByHash.mockResolvedValue(null);

      await useCase.ejecutar(TOKEN_CRUDO, PASSWORD_NUEVA);

      expect(dispositivoRepo.revocarTodosDe).not.toHaveBeenCalled();
    });
  });

  describe('Las 4 causas de token inválido dan el mismo error', () => {
    it.each([
      ['inexistente', undefined],
      ['usado', { usedAt: new Date() }],
      ['revocado', { revokedAt: new Date() }],
      ['vencido', { expiresAt: new Date(Date.now() - 1000) }],
    ] as const)(
      '%s: mismo error, no consume el token ni toca al usuario',
      async (_causa, overrides) => {
        tokenRepo.findByHash.mockResolvedValue(overrides ? makeToken({ ...overrides }) : null);

        const result = await useCase.ejecutar(TOKEN_CRUDO, PASSWORD_NUEVA);

        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(ResetLinkInvalidoError);
        expect(tokenRepo.consumirSiVigente).not.toHaveBeenCalled();
        expect(usuarioRepo.save).not.toHaveBeenCalled();
      },
    );
  });

  describe('Cuenta no disponible: mismo error, no consume el token', () => {
    it.each([
      ['inexistente', null],
      ['inactivo', makeUsuario(false)],
      ['activo pero soft-deleted [S1]', makeUsuarioSoftDeletedActivo()],
    ])('usuario %s', async (_causa, usuarioMock) => {
      tokenRepo.findByHash.mockResolvedValue(makeToken());
      usuarioRepo.findById.mockResolvedValue(usuarioMock);

      const result = await useCase.ejecutar(TOKEN_CRUDO, PASSWORD_NUEVA);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ResetLinkInvalidoError);
      expect(tokenRepo.consumirSiVigente).not.toHaveBeenCalled();
      expect(usuarioRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('El CAS pierde bajo concurrencia (abuso: doble reset)', () => {
    it('consumirSiVigente false: mismo error, la contraseña NO se persiste', async () => {
      const usuario = makeUsuario();
      tokenRepo.findByHash.mockResolvedValue(makeToken());
      usuarioRepo.findById.mockResolvedValue(usuario);
      tokenRepo.consumirSiVigente.mockResolvedValue(false);

      const result = await useCase.ejecutar(TOKEN_CRUDO, PASSWORD_NUEVA);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ResetLinkInvalidoError);
      // El hash se calcula en memoria ANTES del CAS (ADR-5), pero si el CAS
      // pierde NUNCA se persiste: save() no se llama.
      expect(usuarioRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('Confirmación exitosa', () => {
    it('hashea vía hashPassword(), consume el CAS, persiste, revoca y despacha el mail con ids del token', async () => {
      const usuario = makeUsuario();
      const token = makeToken();
      tokenRepo.findByHash.mockResolvedValue(token);
      usuarioRepo.findById.mockResolvedValue(usuario);

      const result = await useCase.ejecutar(TOKEN_CRUDO, PASSWORD_NUEVA);

      expect(result.isOk()).toBe(true);
      // Ids solo del token: `ejecutar(token, passwordNueva)` no acepta
      // usuarioId ni clienteId como parámetro.
      expect(usuarioRepo.findById).toHaveBeenCalledWith(token.usuarioId);
      expect(useCase.ejecutar.length).toBe(2);
      expect(hashProvider.hash).toHaveBeenCalledWith(PASSWORD_NUEVA);
      expect(usuario.passwordHash).toBe('nuevo-hash');
      expect(tokenRepo.consumirSiVigente).toHaveBeenCalledWith(token.id);
      expect(usuarioRepo.save).toHaveBeenCalledWith(usuario);
      expect(refreshTokenRepo.revokeAllByUsuarioId).toHaveBeenCalledWith(usuario.id);

      expect(tareas.lanzar).toHaveBeenCalledTimes(1);
      const [etiqueta, tarea] = tareas.lanzar.mock.calls[0] as [string, () => Promise<void>];
      expect(etiqueta).toBe('reset-password.confirmacion');

      await tarea();
      expect(correoDeCliente.estado).toHaveBeenCalledWith(CLIENTE_ID);
      expect(correoDeCliente.enviar).toHaveBeenCalledTimes(1);
      const [clienteIdEnviado] = correoDeCliente.enviar.mock.calls[0];
      expect(clienteIdEnviado).toBe(CLIENTE_ID);
    });
  });

  describe('La revocación falla pero el reset persiste', () => {
    it('retorna ok y logger.error se llama sin el .message de la excepción (puede traer el email)', async () => {
      const usuario = makeUsuario();
      tokenRepo.findByHash.mockResolvedValue(makeToken());
      usuarioRepo.findById.mockResolvedValue(usuario);
      refreshTokenRepo.revokeAllByUsuarioId.mockRejectedValue(
        new Error('fallo para usuario@test.com'),
      );

      const result = await useCase.ejecutar(TOKEN_CRUDO, PASSWORD_NUEVA);

      expect(result.isOk()).toBe(true);
      expect(usuarioRepo.save).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledTimes(1);
      const [linea] = logger.error.mock.calls[0] as [string];
      expect(linea).not.toContain('usuario@test.com');
      expect(linea).toContain('error=Error');
    });

    it('si save() falla tras el CAS, loguea con ids y el tipo del error y propaga', async () => {
      const usuario = makeUsuario();
      tokenRepo.findByHash.mockResolvedValue(makeToken());
      usuarioRepo.findById.mockResolvedValue(usuario);
      usuarioRepo.save.mockRejectedValue(new Error('fallo para usuario@test.com'));

      await expect(useCase.ejecutar(TOKEN_CRUDO, PASSWORD_NUEVA)).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledTimes(1);
      const [linea] = logger.error.mock.calls[0] as [string];
      expect(linea).toContain('RESET_PASSWORD_CONFIRMACION_SAVE_ERROR');
      expect(linea).not.toContain('usuario@test.com');
      expect(refreshTokenRepo.revokeAllByUsuarioId).not.toHaveBeenCalled();
    });
  });

  describe('Ningún log lleva el token crudo ni el plaintext', () => {
    it('un fallo del mail de confirmación en segundo plano no expone el token ni la password', async () => {
      const usuario = makeUsuario();
      tokenRepo.findByHash.mockResolvedValue(makeToken());
      usuarioRepo.findById.mockResolvedValue(usuario);
      correoDeCliente.estado.mockRejectedValue(new Error(`fallo con token ${TOKEN_CRUDO}`));

      await useCase.ejecutar(TOKEN_CRUDO, PASSWORD_NUEVA);
      const [, tarea] = tareas.lanzar.mock.calls[0] as [string, () => Promise<void>];
      await tarea();

      const lineasLogueadas = logger.error.mock.calls.map((args) => String(args[0]));
      for (const linea of lineasLogueadas) {
        expect(linea).not.toContain(TOKEN_CRUDO);
        expect(linea).not.toContain(PASSWORD_NUEVA);
      }
    });
  });
});
