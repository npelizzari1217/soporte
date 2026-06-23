/**
 * 2.D.3 TEST — Unit tests para AuthController.
 *
 * Verifica que el controlador:
 * - Delega a los use cases con los DTOs correctos.
 * - Retorna la respuesta esperada en caso de éxito.
 * - Lanza HttpException apropiada en caso de error de dominio.
 *
 * Los use cases son mockeados (no dependen de Prisma ni NestJS DI).
 * Los guards NO se testean aquí — tienen su propio spec (guards.spec.ts).
 *
 * Tarea: 2.D.3
 */

import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { Result } from '../../../shared/domain/result';
import { ClienteInactivoError, CredencialesInvalidasError } from '../../domain/errors/auth.errors';

// ─── Mocks ────────────────────────────────────────────────────────────────────

function makeLoginUseCase() {
  return { execute: jest.fn() };
}

function makeRefreshUseCase() {
  return { execute: jest.fn() };
}

function makeRevocarTokenUseCase() {
  return { execute: jest.fn() };
}

function makeRevocarTodosUseCase() {
  return { execute: jest.fn() };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('AuthController', () => {
  let controller: AuthController;
  let loginUseCase: ReturnType<typeof makeLoginUseCase>;
  let refreshUseCase: ReturnType<typeof makeRefreshUseCase>;
  let revocarTokenUseCase: ReturnType<typeof makeRevocarTokenUseCase>;
  let revocarTodosUseCase: ReturnType<typeof makeRevocarTodosUseCase>;

  beforeEach(() => {
    loginUseCase = makeLoginUseCase();
    refreshUseCase = makeRefreshUseCase();
    revocarTokenUseCase = makeRevocarTokenUseCase();
    revocarTodosUseCase = makeRevocarTodosUseCase();

    controller = new AuthController(
      loginUseCase as any,
      refreshUseCase as any,
      revocarTokenUseCase as any,
      revocarTodosUseCase as any,
    );
  });

  // ─── login ─────────────────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('retorna accessToken y refreshToken cuando las credenciales son válidas', async () => {
      loginUseCase.execute.mockResolvedValue(
        Result.ok({ accessToken: 'jwt-access', refreshToken: 'raw-refresh' }),
      );

      const result = await controller.login({ email: 'u@test.com', password: 'secret' });

      expect(result).toEqual({ accessToken: 'jwt-access', refreshToken: 'raw-refresh' });
      expect(loginUseCase.execute).toHaveBeenCalledWith({
        email: 'u@test.com',
        password: 'secret',
      });
    });

    it('lanza UnauthorizedException cuando las credenciales son inválidas', async () => {
      loginUseCase.execute.mockResolvedValue(Result.fail(new CredencialesInvalidasError()));

      await expect(controller.login({ email: 'u@test.com', password: 'wrong' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('lanza ForbiddenException (403) cuando el cliente está inactivo', async () => {
      loginUseCase.execute.mockResolvedValue(Result.fail(new ClienteInactivoError()));

      await expect(controller.login({ email: 'u@test.com', password: 'secret' })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── refresh ───────────────────────────────────────────────────────────────

  describe('POST /auth/refresh', () => {
    it('retorna nuevo accessToken y refreshToken', async () => {
      refreshUseCase.execute.mockResolvedValue(
        Result.ok({ accessToken: 'new-access', refreshToken: 'new-refresh' }),
      );

      const result = await controller.refresh({ refreshToken: 'raw-token' });

      expect(result).toEqual({ accessToken: 'new-access', refreshToken: 'new-refresh' });
      expect(refreshUseCase.execute).toHaveBeenCalledWith({ rawToken: 'raw-token' });
    });

    it('lanza UnauthorizedException cuando el token es inválido', async () => {
      const { TokenInvalidoError } = await import('../../domain/errors/auth.errors');
      refreshUseCase.execute.mockResolvedValue(Result.fail(new TokenInvalidoError()));

      await expect(controller.refresh({ refreshToken: 'bad-token' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── logout ────────────────────────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    it('revoca el token y retorna 204 (void)', async () => {
      revocarTokenUseCase.execute.mockResolvedValue(Result.ok(undefined));

      const result = await controller.logout({ refreshToken: 'token-to-revoke' });

      expect(result).toBeUndefined();
      expect(revocarTokenUseCase.execute).toHaveBeenCalledWith({ rawToken: 'token-to-revoke' });
    });

    it('lanza BadRequestException cuando el token no existe', async () => {
      const { TokenInvalidoError } = await import('../../domain/errors/auth.errors');
      revocarTokenUseCase.execute.mockResolvedValue(Result.fail(new TokenInvalidoError()));

      await expect(controller.logout({ refreshToken: 'nonexistent' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── logout-all ────────────────────────────────────────────────────────────

  describe('POST /auth/logout-all', () => {
    it('revoca todos los tokens del usuario autenticado', async () => {
      revocarTodosUseCase.execute.mockResolvedValue(Result.ok(undefined));

      const user = {
        sub: 'user-id-123',
        cliente_id: 'c1',
        email: 'u@test.com',
        roles: [],
        permisos: [],
      };
      const result = await controller.logoutAll(user);

      expect(result).toBeUndefined();
      expect(revocarTodosUseCase.execute).toHaveBeenCalledWith({ usuarioId: 'user-id-123' });
    });
  });
});
