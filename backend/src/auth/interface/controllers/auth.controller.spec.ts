/**
 * auth.controller.spec.ts — TDD RED phase (T6.5, PR6) + WU2
 * (sdd/cambio-de-contrasena): `POST /auth/change-password` y el spec
 * guardián de `toHttpException`.
 *
 * Unit test: instancia el controller directamente con use cases mockeados
 * (sin bootstrapear NestJS ni pasar por guards/ValidationPipe — eso lo cubre
 * el e2e de este mismo módulo). Verifica: traducción HTTP ↔ use case, mapeo
 * de errores de dominio → HttpException, y las respuestas de R4 (selection
 * vs tokens).
 */
import {
  ForbiddenException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuthController } from './auth.controller';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { RefreshTokenUseCase } from '../../application/use-cases/refresh-token.use-case';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { LogoutAllUseCase } from '../../application/use-cases/logout-all.use-case';
import { SwitchTenantUseCase } from '../../application/use-cases/switch-tenant.use-case';
import { CambiarPasswordUseCase } from '../../application/use-cases/cambiar-password.use-case';
import { DomainError, Result } from '../../../shared/domain/result';
import {
  ClienteNoAutorizadoError,
  CredencialesInvalidasError,
  PasswordActualIncorrectaError,
  PasswordNuevaIgualAActualError,
  SinMembresiaActivaError,
  TokenExpiradoError,
  TokenInvalidoError,
  TokenRevocadoError,
  UsuarioNoDisponibleError,
} from '../../domain/errors/auth.errors';
import * as AuthErrors from '../../domain/errors/auth.errors';

const REQ = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
import { JwtPayload } from '../../domain/ports/i-token.service';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { payloadDeTest } from '../../test-helpers/payload-de-test';
import { unstubbed } from '../../../testing/mocks';

const ROOT_PAYLOAD: JwtPayload = payloadDeTest({
  sub: 'usuario-1',
  cliente_id: null,
  rol: null,
  permisos: [],
  is_global_admin: true,
  cliente_nombre: null,
});

/**
 * Doble de un use case concreto: instancia real del prototipo con `execute`
 * espiado y tipado contra la firma del caso de uso. Al controller sólo le
 * interesa `execute`.
 */
function espiado<T extends { execute: (...args: never[]) => unknown }>(Clase: { prototype: T }) {
  const execute = vi.fn<T['execute']>();
  const caso: T = Object.create(Clase.prototype, { execute: { value: execute } });
  return { caso, execute };
}

function buildController() {
  const loginUseCase = espiado(LoginUseCase);
  const refreshTokenUseCase = espiado(RefreshTokenUseCase);
  const logoutUseCase = espiado(LogoutUseCase);
  const logoutAllUseCase = espiado(LogoutAllUseCase);
  const switchTenantUseCase = espiado(SwitchTenantUseCase);
  const cambiarPasswordUseCase = espiado(CambiarPasswordUseCase);
  // `log()` nunca se ejercita desde este controller — solo `error()` (el
  // fallback ruidoso de `toHttpException`, D4). Un stub mudo taparía que
  // producción empiece a llamarlo.
  const logger: ILogger = { error: vi.fn(), log: unstubbed('ILogger.log') };

  const controller = new AuthController(
    loginUseCase.caso,
    refreshTokenUseCase.caso,
    logoutUseCase.caso,
    logoutAllUseCase.caso,
    switchTenantUseCase.caso,
    cambiarPasswordUseCase.caso,
    logger,
  );

  return {
    controller,
    loginUseCase,
    refreshTokenUseCase,
    logoutUseCase,
    logoutAllUseCase,
    switchTenantUseCase,
    cambiarPasswordUseCase,
    logger,
  };
}

describe('AuthController (T6.5)', () => {
  describe('POST /auth/login', () => {
    it('credenciales válidas, 1 membresía → 200 { accessToken, refreshToken }', async () => {
      const { controller, loginUseCase } = buildController();
      loginUseCase.execute.mockResolvedValue(
        Result.ok({ kind: 'tokens', accessToken: 'at', refreshToken: 'rt' }),
      );

      const result = await controller.login({ email: 'a@a.com', password: 'pw' }, REQ);

      expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt' });
      expect(loginUseCase.execute).toHaveBeenCalledWith({
        email: 'a@a.com',
        password: 'pw',
        ip: 'sin-ip',
      });
    });

    it('>1 membresías sin clienteId → 200 { needsClienteSelection: true, membresias }', async () => {
      const { controller, loginUseCase } = buildController();
      const membresias = [{ cliente_id: 'c1', nombre: 'C1', rol: 'TECNICO' }];
      loginUseCase.execute.mockResolvedValue(
        Result.ok({ kind: 'selection', membresias, ticket: 'ticket-seleccion' }),
      );

      const result = await controller.login({ email: 'a@a.com', password: 'pw' }, REQ);

      expect(result).toEqual({
        needsClienteSelection: true,
        membresias,
        ticket: 'ticket-seleccion',
      });
    });

    it('credenciales inválidas → UnauthorizedException', async () => {
      const { controller, loginUseCase } = buildController();
      loginUseCase.execute.mockResolvedValue(Result.fail(new CredencialesInvalidasError()));

      await expect(controller.login({ email: 'a@a.com', password: 'bad' }, REQ)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('0 membresías activas → ForbiddenException', async () => {
      const { controller, loginUseCase } = buildController();
      loginUseCase.execute.mockResolvedValue(Result.fail(new SinMembresiaActivaError()));

      await expect(controller.login({ email: 'a@a.com', password: 'pw' }, REQ)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('clienteId no autorizado → ForbiddenException', async () => {
      const { controller, loginUseCase } = buildController();
      loginUseCase.execute.mockResolvedValue(Result.fail(new ClienteNoAutorizadoError()));

      await expect(
        controller.login({ email: 'a@a.com', password: 'pw', clienteId: 'x' }, REQ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('POST /auth/refresh', () => {
    it('refresh válido → 200 { accessToken, refreshToken }', async () => {
      const { controller, refreshTokenUseCase } = buildController();
      refreshTokenUseCase.execute.mockResolvedValue(
        Result.ok({ accessToken: 'at2', refreshToken: 'rt2' }),
      );

      const result = await controller.refresh({ refreshToken: 'rt' });

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

      await expect(controller.refresh({ refreshToken: 'x' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('cliente del scope embebido inactivo → ForbiddenException', async () => {
      const { controller, refreshTokenUseCase } = buildController();
      refreshTokenUseCase.execute.mockResolvedValue(Result.fail(new ClienteNoAutorizadoError()));

      await expect(controller.refresh({ refreshToken: 'x' })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('POST /auth/logout', () => {
    it('revoca el token → void (204)', async () => {
      const { controller, logoutUseCase } = buildController();
      logoutUseCase.execute.mockResolvedValue(Result.ok(undefined));

      await controller.logout({ refreshToken: 'rt' });

      expect(logoutUseCase.execute).toHaveBeenCalledWith({ rawToken: 'rt' });
    });

    it('token inexistente → UnauthorizedException', async () => {
      const { controller, logoutUseCase } = buildController();
      logoutUseCase.execute.mockResolvedValue(Result.fail(new TokenInvalidoError()));

      await expect(controller.logout({ refreshToken: 'x' })).rejects.toThrow(UnauthorizedException);
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

      const result = await controller.switchTenant(ROOT_PAYLOAD, { clienteId: 'c1' });

      expect(result).toEqual({ accessToken: 'at3' });
      expect(switchTenantUseCase.execute).toHaveBeenCalledWith({
        actor: ROOT_PAYLOAD,
        clienteId: 'c1',
      });
    });

    it('switch denegado (sin membresía) → ForbiddenException', async () => {
      const { controller, switchTenantUseCase } = buildController();
      switchTenantUseCase.execute.mockResolvedValue(Result.fail(new ClienteNoAutorizadoError()));

      await expect(controller.switchTenant(ROOT_PAYLOAD, { clienteId: 'c1' })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── WU2 (sdd/cambio-de-contrasena) ────────────────────────────────────

  describe('POST /auth/change-password', () => {
    it('éxito → 204, usuarioId sale de user.sub (JWT), nunca del body', async () => {
      const { controller, cambiarPasswordUseCase } = buildController();
      cambiarPasswordUseCase.execute.mockResolvedValue(Result.ok(undefined));

      await controller.changePassword(ROOT_PAYLOAD, {
        passwordActual: 'ClaveVieja123',
        passwordNueva: 'ClaveNueva456',
      });

      expect(cambiarPasswordUseCase.execute).toHaveBeenCalledWith({
        usuarioId: ROOT_PAYLOAD.sub,
        passwordActual: 'ClaveVieja123',
        passwordNueva: 'ClaveNueva456',
      });
    });

    it('PasswordActualIncorrectaError → UnprocessableEntityException 422 con error.code discriminable', async () => {
      const { controller, cambiarPasswordUseCase } = buildController();
      cambiarPasswordUseCase.execute.mockResolvedValue(
        Result.fail(new PasswordActualIncorrectaError()),
      );

      const promesa = controller.changePassword(ROOT_PAYLOAD, {
        passwordActual: 'otra',
        passwordNueva: 'ClaveNueva456',
      });

      await expect(promesa).rejects.toThrow(UnprocessableEntityException);
      await expect(promesa).rejects.toMatchObject({
        response: { statusCode: 422, error: 'AUTH_PASSWORD_ACTUAL_INCORRECTA' },
      });
    });

    it('PasswordNuevaIgualAActualError → UnprocessableEntityException 422 con error.code discriminable', async () => {
      const { controller, cambiarPasswordUseCase } = buildController();
      cambiarPasswordUseCase.execute.mockResolvedValue(
        Result.fail(new PasswordNuevaIgualAActualError()),
      );

      const promesa = controller.changePassword(ROOT_PAYLOAD, {
        passwordActual: 'ClaveVieja123',
        passwordNueva: 'ClaveVieja123',
      });

      await expect(promesa).rejects.toThrow(UnprocessableEntityException);
      await expect(promesa).rejects.toMatchObject({
        response: { statusCode: 422, error: 'AUTH_PASSWORD_NUEVA_IGUAL' },
      });
    });

    it('UsuarioNoDisponibleError → ForbiddenException 403 (nunca 401 — D3)', async () => {
      const { controller, cambiarPasswordUseCase } = buildController();
      cambiarPasswordUseCase.execute.mockResolvedValue(Result.fail(new UsuarioNoDisponibleError()));

      await expect(
        controller.changePassword(ROOT_PAYLOAD, {
          passwordActual: 'ClaveVieja123',
          passwordNueva: 'ClaveNueva456',
        }),
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

// ─── toHttpException — spec guardián (sdd/cambio-de-contrasena, design D4) ──
//
// Hoy `toHttpException` mapea explícitamente 9 de los 16 exports de
// `auth.errors.ts`; los otros 7 caen en el fallback 401 genérico. Esta tabla
// es TOTAL sobre TODOS los exports actuales: un error nuevo sin entrada en
// TABLA rompe el primer test (longitud) antes de llegar a ejecutarse nada
// más — así es imposible que un error nuevo se pierda en el fallback sin que
// alguien se entere.
//
// Instanciación vía `Object.create(Klase.prototype)`: esquiva la aridad de
// cada constructor (algunos piden 0 argumentos, otros 1, otros arrays) sin
// tener que conocerla acá. `toHttpException` solo necesita `instanceof` para
// ramificar, así que un objeto sin inicializar basta para ejercitar cada
// rama — la asignación exacta de `código → status` es lo único que importa.
//
// LÍMITE DURO (reconciliación #2409, relayado por el orquestador): esta
// tabla CONGELA el comportamiento de HOY. Siete errores caen hoy en 401 sin
// que les corresponda (ver comentarios inline) — NO se corrigen en este
// work unit: cambiar el status de un endpoint ajeno a `cambio-de-contrasena`
// puede alterar flujos del frontend de formas no obvias. Quedan anotados
// como hallazgo, a resolver en un trabajo aparte.
describe('AuthController.toHttpException — catálogo de errores → HTTP (spec guardián)', () => {
  // `toHttpException` es `private`: el acceso por índice lo alcanza con su tipo real, sin cast.
  function statusDe(error: DomainError): number {
    const { controller } = buildController();
    return controller['toHttpException'](error).getStatus();
  }

  /** Clases de error exportadas por `auth.errors.ts` — el número de la verdad, no un literal a mano. */
  const CLASES_DE_ERROR = Object.values(AuthErrors).filter(
    (valor) => typeof valor === 'function' && valor.prototype instanceof DomainError,
  ) as (new (...args: never[]) => DomainError)[];
  const CLASES_POR_NOMBRE = new Map(CLASES_DE_ERROR.map((clase) => [clase.name, clase]));

  it('el catálogo tiene EXACTAMENTE 16 clases de error', () => {
    expect(CLASES_DE_ERROR).toHaveLength(16);
  });

  const TABLA: Array<[string, 401 | 403 | 422]> = [
    ['CredencialesInvalidasError', 401],
    ['SinMembresiaActivaError', 403],
    ['ClienteNoAutorizadoError', 403],
    // Congelado HOY en 401 — DEBERÍA ser 403 (usuario:membresía coherente
    // pero cliente inactivo). No se corrige acá, ver nota arriba.
    ['ClienteInactivoError', 401],
    ['TokenInvalidoError', 401],
    ['TokenExpiradoError', 401],
    ['TokenRevocadoError', 401],
    // Congelado HOY en 401 — DEBERÍA ser 422 (input inválido).
    ['PermisoCodigoInvalidoError', 401],
    // Congelado HOY en 401 — DEBERÍA ser 404 (recurso no encontrado).
    ['RolNoEncontradoError', 401],
    // Congelado HOY en 401 — DEBERÍA ser 409 (conflicto de estado).
    ['MembresiaYaActivaError', 401],
    // Congelado HOY en 401 — DEBERÍA ser 404 (recurso no encontrado).
    ['MembresiaNoEncontradaError', 401],
    // Congelado HOY en 401 — DEBERÍA ser 422 (input inválido).
    ['CeldaPermisoInvalidaError', 401],
    // Congelado HOY en 401 — DEBERÍA ser 422 (gap de configuración, no de auth).
    ['PresetRolNoDefinidoError', 401],
    // Nuevos de sdd/cambio-de-contrasena (WU2) — mapeo propio, no fallback.
    ['UsuarioNoDisponibleError', 403],
    ['PasswordActualIncorrectaError', 422],
    ['PasswordNuevaIgualAActualError', 422],
  ];

  it('TABLA cubre EXACTAMENTE las clases exportadas (ninguna falta, ninguna sobra)', () => {
    expect(TABLA).toHaveLength(CLASES_DE_ERROR.length);
    const nombresEnTabla = new Set(TABLA.map(([nombre]) => nombre));
    for (const clase of CLASES_DE_ERROR) {
      expect(nombresEnTabla.has(clase.name)).toBe(true);
    }
  });

  it.each(TABLA)('%s → HTTP %i', (nombre, httpEsperado) => {
    const Klase = CLASES_POR_NOMBRE.get(nombre);
    expect(Klase, `Clase "${nombre}" no está exportada por auth.errors.ts`).toBeDefined();
    const instancia = Object.create(Klase!.prototype) as DomainError;

    expect(statusDe(instancia)).toBe(httpEsperado);
  });

  it('error no mapeado explícitamente → 401 Y deja rastro con logger.error (fallback ruidoso, D4)', async () => {
    class ErrorDeDominioFicticioParaTest extends DomainError {
      readonly code = 'TEST_UNMAPPED';
      constructor() {
        super('mensaje de prueba, nunca debería llegar a producción');
      }
    }

    const { controller, logger } = buildController();

    const status = controller['toHttpException'](new ErrorDeDominioFicticioParaTest()).getStatus();

    expect(status).toBe(401);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('TEST_UNMAPPED'));
  });
});
