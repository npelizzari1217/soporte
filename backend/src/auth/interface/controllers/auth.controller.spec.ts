/**
 * auth.controller.spec.ts — TDD RED phase (T6.5, PR6).
 *
 * Unit test: instancia el controller directamente con use cases mockeados
 * (sin bootstrapear NestJS ni pasar por guards/ValidationPipe — eso lo cubre
 * el e2e de este mismo PR). Verifica: traducción HTTP ↔ use case, mapeo de
 * errores de dominio → HttpException, y las respuestas de R4 (selection vs
 * tokens).
 */
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { Result } from '../../../shared/domain/result';
import {
  ClienteNoAutorizadoError,
  CredencialesInvalidasError,
  SinMembresiaActivaError,
  TokenExpiradoError,
  TokenInvalidoError,
  TokenRevocadoError,
} from '../../domain/errors/auth.errors';
import { JwtPayload } from '../../domain/ports/i-token.service';

const ROOT_PAYLOAD: JwtPayload = {
  sub: 'usuario-1',
  cliente_id: null,
  rol: null,
  permisos: [],
  is_global_admin: true,
  cliente_nombre: null,
  membresias: [],
};

describe('AuthController (T6.5)', () => {
  function buildController() {
    const loginUseCase = { execute: vi.fn() };
    const refreshTokenUseCase = { execute: vi.fn() };
    const logoutUseCase = { execute: vi.fn() };
    const logoutAllUseCase = { execute: vi.fn() };
    const switchTenantUseCase = { execute: vi.fn() };

    const controller = new AuthController(
      loginUseCase as any,
      refreshTokenUseCase as any,
      logoutUseCase as any,
      logoutAllUseCase as any,
      switchTenantUseCase as any,
    );

    return {
      controller,
      loginUseCase,
      refreshTokenUseCase,
      logoutUseCase,
      logoutAllUseCase,
      switchTenantUseCase,
    };
  }

  describe('POST /auth/login', () => {
    it('credenciales válidas, 1 membresía → 200 { accessToken, refreshToken }', async () => {
      const { controller, loginUseCase } = buildController();
      loginUseCase.execute.mockResolvedValue(
        Result.ok({ kind: 'tokens', accessToken: 'at', refreshToken: 'rt' }),
      );

      const result = await controller.login({ email: 'a@a.com', password: 'pw' } as any);

      expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt' });
      expect(loginUseCase.execute).toHaveBeenCalledWith({ email: 'a@a.com', password: 'pw' });
    });

    it('>1 membresías sin clienteId → 200 { needsClienteSelection: true, membresias }', async () => {
      const { controller, loginUseCase } = buildController();
      const membresias = [{ cliente_id: 'c1', nombre: 'C1', rol: 'TECNICO' }];
      loginUseCase.execute.mockResolvedValue(Result.ok({ kind: 'selection', membresias }));

      const result = await controller.login({ email: 'a@a.com', password: 'pw' } as any);

      expect(result).toEqual({ needsClienteSelection: true, membresias });
    });

    it('credenciales inválidas → UnauthorizedException', async () => {
      const { controller, loginUseCase } = buildController();
      loginUseCase.execute.mockResolvedValue(Result.fail(new CredencialesInvalidasError()));

      await expect(controller.login({ email: 'a@a.com', password: 'bad' } as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('0 membresías activas → ForbiddenException', async () => {
      const { controller, loginUseCase } = buildController();
      loginUseCase.execute.mockResolvedValue(Result.fail(new SinMembresiaActivaError()));

      await expect(controller.login({ email: 'a@a.com', password: 'pw' } as any)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('clienteId no autorizado → ForbiddenException', async () => {
      const { controller, loginUseCase } = buildController();
      loginUseCase.execute.mockResolvedValue(Result.fail(new ClienteNoAutorizadoError()));

      await expect(
        controller.login({ email: 'a@a.com', password: 'pw', clienteId: 'x' } as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('POST /auth/refresh', () => {
    it('refresh válido → 200 { accessToken, refreshToken }', async () => {
      const { controller, refreshTokenUseCase } = buildController();
      refreshTokenUseCase.execute.mockResolvedValue(
        Result.ok({ accessToken: 'at2', refreshToken: 'rt2' }),
      );

      const result = await controller.refresh({ refreshToken: 'rt' } as any);

      expect(result).toEqual({ accessToken: 'at2', refreshToken: 'rt2' });
      expect(refreshTokenUseCase.execute).toHaveBeenCalledWith({ rawToken: 'rt' });
    });

    it.each([
      ['inexistente', new TokenInvalidoError()],
      ['expirado', new TokenExpiradoError()],
      ['revocado', new TokenRevocadoError()],
    ])('token %s → UnauthorizedException', async (_label, error) => {
      const { controller, refreshTokenUseCase } = buildController();
      refreshTokenUseCase.execute.mockResolvedValue(Result.fail(error));

      await expect(controller.refresh({ refreshToken: 'x' } as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('cliente del scope embebido inactivo → ForbiddenException', async () => {
      const { controller, refreshTokenUseCase } = buildController();
      refreshTokenUseCase.execute.mockResolvedValue(Result.fail(new ClienteNoAutorizadoError()));

      await expect(controller.refresh({ refreshToken: 'x' } as any)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('POST /auth/logout', () => {
    it('revoca el token → void (204)', async () => {
      const { controller, logoutUseCase } = buildController();
      logoutUseCase.execute.mockResolvedValue(Result.ok(undefined));

      await controller.logout({ refreshToken: 'rt' } as any);

      expect(logoutUseCase.execute).toHaveBeenCalledWith({ rawToken: 'rt' });
    });

    it('token inexistente → UnauthorizedException', async () => {
      const { controller, logoutUseCase } = buildController();
      logoutUseCase.execute.mockResolvedValue(Result.fail(new TokenInvalidoError()));

      await expect(controller.logout({ refreshToken: 'x' } as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('POST /auth/logout-all', () => {
    it('revoca todos los tokens del usuario autenticado', async () => {
      const { controller, logoutAllUseCase } = buildController();
      logoutAllUseCase.execute.mockResolvedValue(Result.ok(undefined));

      await controller.logoutAll(ROOT_PAYLOAD);

      expect(logoutAllUseCase.execute).toHaveBeenCalledWith({ usuarioId: ROOT_PAYLOAD.sub });
    });
  });

  describe('POST /auth/switch', () => {
    it('switch autorizado → 200 { accessToken }', async () => {
      const { controller, switchTenantUseCase } = buildController();
      switchTenantUseCase.execute.mockResolvedValue(Result.ok({ accessToken: 'at3' }));

      const result = await controller.switchTenant(ROOT_PAYLOAD, { clienteId: 'c1' } as any);

      expect(result).toEqual({ accessToken: 'at3' });
      expect(switchTenantUseCase.execute).toHaveBeenCalledWith({
        actor: ROOT_PAYLOAD,
        clienteId: 'c1',
      });
    });

    it('switch denegado (sin membresía) → ForbiddenException', async () => {
      const { controller, switchTenantUseCase } = buildController();
      switchTenantUseCase.execute.mockResolvedValue(Result.fail(new ClienteNoAutorizadoError()));

      await expect(
        controller.switchTenant(ROOT_PAYLOAD, { clienteId: 'c1' } as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('GET /auth/me', () => {
    it('retorna el payload del usuario autenticado', () => {
      const { controller } = buildController();

      const result = controller.me(ROOT_PAYLOAD);

      expect(result).toBe(ROOT_PAYLOAD);
    });
  });
});
